import type { ServerMessage } from "@nobar-party/protocol";
import { WsClient } from "./lib/ws-client.js";
import { ClockEstimator, computeSample } from "./lib/clock.js";
import { applyPlay, applyPause, applySeek } from "./lib/sync.js";
import { Storage, PersistentKey, SessionKey } from "./lib/storage.js";
import {
  onRuntimeMessage,
  RuntimeMessage,
  ContentCandidate,
  ActiveRoomView,
} from "./lib/messages.js";
import { handleInviteReceived } from "./service_worker.invite.js";
import { fetchLatest, isNewer, Latest } from "./lib/version-check.js";

// Build-time constant injected by esbuild's `define` (see esbuild.config.mjs).
declare const process: { env: { DEFAULT_SERVER_URL?: string } };

const DEFAULT_URL = process.env.DEFAULT_SERVER_URL ?? "ws://localhost:3050";
const storage = new Storage();
const clock = new ClockEstimator();

interface Candidate extends ContentCandidate {
  tabId: number;
}

interface RoomState {
  roomId: string;
  selfId: string;
  nickname: string;
  members: Array<{ id: string; nickname: string }>;
  currentUrl: string | null;
  syncedTabId: number | null;
  bestCandidate: Candidate | null;
  reconnectingInMs: number | null;
}

let client: WsClient | null = null;
let pingSeq: Array<{ pingAt: number }> = [];
let room: RoomState | null = null;
let allCandidates = new Map<string, Candidate>(); // keyed by `${tabId}:${frameId}:${signature}`
let latestAvailable: Latest | null = null;

chrome.alarms.create("keepalive", { periodInMinutes: 0.5 });
chrome.alarms.create("version-check", { periodInMinutes: 60 * 24 });
chrome.alarms.onAlarm.addListener((a) => {
  if (a.name === "keepalive" && client) {
    const at = Date.now();
    client.send({ type: "ping", at });
    pingSeq.push({ pingAt: at });
    if (pingSeq.length > 10) pingSeq = pingSeq.slice(-10);
  }
  if (a.name === "version-check") {
    void doVersionCheck();
  }
});

chrome.tabs.onRemoved.addListener((tabId) => {
  if (room?.syncedTabId === tabId) {
    room.syncedTabId = null;
    broadcastState();
  }
});

chrome.runtime.onStartup.addListener(() => void restoreSession());
chrome.runtime.onInstalled.addListener(() => void restoreSession());
chrome.runtime.onStartup.addListener(() => void doVersionCheck());
chrome.runtime.onInstalled.addListener(() => void doVersionCheck());

async function restoreSession(): Promise<void> {
  const prev = await storage.getSession(SessionKey.ActiveRoom);
  const tabId = await storage.getSession(SessionKey.SyncedTabId);
  if (prev) void joinRoom({ roomId: prev.roomId, nickname: prev.nickname, syncedTabId: tabId ?? null });
}

async function ensureServerUrl(): Promise<string> {
  const stored = await storage.getLocal(PersistentKey.ServerUrl);
  return stored ?? DEFAULT_URL;
}

async function doVersionCheck(): Promise<void> {
  const url = await storage.getLocal(PersistentKey.ServerUrl);
  if (!url) return;
  const latest = await fetchLatest(url);
  if (!latest) return;
  const current = chrome.runtime.getManifest().version;
  if (!isNewer(current, latest.version)) {
    latestAvailable = null;
    await chrome.action.setBadgeText({ text: "" });
    return;
  }
  latestAvailable = latest;
  await chrome.action.setBadgeText({ text: "↑" });
  await chrome.action.setBadgeBackgroundColor({ color: "#f5a623" });
}

function sendJoinForCurrentRoom(): void {
  if (!client || !room) return;
  if (room.roomId) {
    client.send({ type: "join", roomId: room.roomId, nickname: room.nickname });
  } else {
    client.send({ type: "join", nickname: room.nickname, create: true });
  }
}

async function openClient(): Promise<void> {
  if (client) return;
  const url = await ensureServerUrl();
  client = new WsClient({
    url,
    onOpen: () => { sendJoinForCurrentRoom(); },
    onMessage: (msg) => handleServerMessage(msg),
    onClose: (ms) => { if (room) room.reconnectingInMs = ms; broadcastState(); },
    onError: () => { /* logged by WsClient */ },
  });
  client.connect();
}

function handleServerMessage(msg: ServerMessage): void {
  switch (msg.type) {
    case "room":
      if (!room) return;
      room.roomId = msg.roomId;
      room.selfId = msg.selfId;
      room.members = msg.members;
      room.currentUrl = msg.url;
      room.reconnectingInMs = null;
      void storage.setSession(SessionKey.ActiveRoom, {
        roomId: msg.roomId,
        selfId: msg.selfId,
        nickname: room.nickname,
      });
      broadcastState();
      return;
    case "peer-joined":
      if (!room) return;
      room.members = [...room.members, { id: msg.id, nickname: msg.nickname }];
      broadcastState();
      return;
    case "peer-left":
      if (!room) return;
      room.members = room.members.filter((m) => m.id !== msg.id);
      broadcastState();
      return;
    case "play":
    case "pause":
    case "seek":
      applyRemotePlayback(msg);
      return;
    case "url":
      forwardToSidebar({ kind: "sidebar:peerEvent", event: msg });
      return;
    case "chat":
      forwardToSidebar({
        kind: "sidebar:chat",
        message: { fromId: msg.fromId, nickname: msg.nickname, text: msg.text, at: msg.at },
      });
      return;
    case "pong": {
      const pongReceivedAt = Date.now();
      const entry = pingSeq.shift();
      if (entry) clock.addSample(computeSample({
        pingAt: entry.pingAt,
        pongSentAt: msg.serverAt,
        pongReceivedAt,
      }));
      return;
    }
    case "error":
      forwardToSidebar({ kind: "sidebar:peerEvent", event: msg });
      return;
  }
}

function applyRemotePlayback(
  msg: Extract<ServerMessage, { type: "play" | "pause" | "seek" }>
): void {
  if (!room?.syncedTabId) return;
  const myNow = Date.now();
  let cmd;
  if (msg.type === "play") {
    const r = applyPlay({
      event: { t: msg.t, at: msg.at, fromId: msg.fromId },
      myOffset: clock.offset,
      myNow,
      videoTime: 0,    // content script knows actual currentTime; it refines seek decision
    });
    cmd = { type: "play" as const, seekTo: r.seekTo, suppressUntil: r.suppressUntil };
  } else if (msg.type === "pause") {
    const r = applyPause({ event: { t: msg.t, at: msg.at, fromId: msg.fromId }, myNow, videoTime: 0 });
    cmd = { type: "pause" as const, seekTo: r.seekTo, suppressUntil: r.suppressUntil };
  } else {
    const r = applySeek({ event: { t: msg.t, at: msg.at, fromId: msg.fromId }, myNow });
    cmd = { type: "seek" as const, seekTo: r.seekTo!, suppressUntil: r.suppressUntil };
  }
  void chrome.tabs.sendMessage(room.syncedTabId, { kind: "sw:applyEvent", apply: cmd });
}

function forwardToSidebar(msg: RuntimeMessage): void {
  if (!room?.syncedTabId) return;
  void chrome.tabs.sendMessage(room.syncedTabId, msg);
}

function broadcastState(): void {
  // Suppress broadcasts until we have a real roomId from the server — otherwise the popup
  // flashes the room view with an empty title while waiting for the create ack.
  if (room && !room.roomId) return;

  const view: ActiveRoomView | null = room
    ? {
        roomId: room.roomId,
        selfId: room.selfId,
        nickname: room.nickname,
        members: room.members,
        connected: client !== null && room.reconnectingInMs === null,
        currentUrl: room.currentUrl,
        reconnectingInMs: room.reconnectingInMs,
      }
    : null;
  void chrome.runtime.sendMessage({ kind: "sw:roomState", state: view }).catch(() => {});
  if (room?.syncedTabId) void chrome.tabs.sendMessage(room.syncedTabId, { kind: "sw:roomState", state: view });
}

async function pickSyncedTabId(): Promise<number | null> {
  // Prefer an active tab whose URL is a regular web page, not the popup page or another
  // extension/browser page. Falls back to any web tab if no active one qualifies.
  const isWebUrl = (url: string | undefined): boolean =>
    !!url && (url.startsWith("http://") || url.startsWith("https://"));
  const active = await chrome.tabs.query({ active: true });
  for (const t of active) {
    if (t.id !== undefined && isWebUrl(t.url)) return t.id;
  }
  const all = await chrome.tabs.query({});
  for (const t of all) {
    if (t.id !== undefined && isWebUrl(t.url)) return t.id;
  }
  return null;
}

async function createRoom(nickname: string): Promise<void> {
  room = { roomId: "", selfId: "", nickname, members: [], currentUrl: null, syncedTabId: null, bestCandidate: null, reconnectingInMs: null };
  room.syncedTabId = await pickSyncedTabId();
  // The socket may not be open yet; sendJoinForCurrentRoom() is also invoked from onOpen,
  // and will be a no-op here until the socket transitions to open state.
  if (client) sendJoinForCurrentRoom();
  else await openClient();
  if (room.syncedTabId !== null) await storage.setSession(SessionKey.SyncedTabId, room.syncedTabId);
}

async function joinRoom(input: { roomId: string; nickname: string; syncedTabId?: number | null }): Promise<void> {
  room = { roomId: input.roomId, selfId: "", nickname: input.nickname, members: [], currentUrl: null, syncedTabId: input.syncedTabId ?? null, bestCandidate: null, reconnectingInMs: null };
  if (room.syncedTabId === null) {
    room.syncedTabId = await pickSyncedTabId();
  }
  if (client) sendJoinForCurrentRoom();
  else await openClient();
  await storage.setSession(SessionKey.ActiveRoom, { roomId: input.roomId, selfId: "", nickname: input.nickname });
  if (room.syncedTabId !== null) await storage.setSession(SessionKey.SyncedTabId, room.syncedTabId);
}

async function leaveRoom(): Promise<void> {
  client?.send({ type: "leave" });
  client?.disconnect();
  client = null;
  room = null;
  await storage.removeSession(SessionKey.ActiveRoom);
  await storage.removeSession(SessionKey.SyncedTabId);
  broadcastState();
}

onRuntimeMessage(async (msg, sender) => {
  switch (msg.kind) {
    case "popup:getState": return { kind: "sw:roomState", state: room ? {
      roomId: room.roomId, selfId: room.selfId, nickname: room.nickname,
      members: room.members, connected: !!client && room.reconnectingInMs === null,
      currentUrl: room.currentUrl, reconnectingInMs: room.reconnectingInMs,
    } : null };
    case "popup:createRoom": await createRoom(msg.nickname); return { ok: true };
    case "popup:joinRoom": await joinRoom({ roomId: msg.roomId, nickname: msg.nickname }); return { ok: true };
    case "popup:leaveRoom": await leaveRoom(); return { ok: true };
    case "popup:setSyncedTab":
      if (room) { room.syncedTabId = msg.tabId; await storage.setSession(SessionKey.SyncedTabId, msg.tabId); broadcastState(); }
      return { ok: true };
    case "popup:pickVideo":
      if (room?.syncedTabId) {
        void chrome.tabs.sendMessage(room.syncedTabId, { kind: "popup:pickVideo", frameId: msg.frameId, signature: msg.signature });
      }
      return { ok: true };
    case "content:hello": {
      const tabId = sender.tab?.id;
      if (tabId === undefined) return;
      for (const c of msg.candidates) {
        const key = `${tabId}:${c.frameId}:${c.signature}`;
        allCandidates.set(key, { ...c, tabId });
      }
      if (room && room.syncedTabId === tabId) {
        const newUrl = msg.url;
        if (room.currentUrl !== newUrl) {
          room.currentUrl = newUrl;
          client?.send({ type: "url", url: newUrl });
        }
      }
      return;
    }
    case "content:videoEvent":
      if (!client) return;
      client.send({ type: msg.event.type, t: msg.event.t, at: msg.event.at });
      return;
    case "sidebar:chat": {
      const text = (msg as any).message?.text;
      if (!text || !client) return;
      client.send({ type: "chat", text });
      return;
    }
    case "invite:received":
      await handleInviteReceived(
        { serverUrl: msg.serverUrl, roomCode: msg.roomCode },
        {
          getNickname: async () => (await storage.getLocal(PersistentKey.Nickname)) ?? undefined,
          setServerUrl: (url) => storage.setLocal(PersistentKey.ServerUrl, url),
          setPendingInvite: (invite) => storage.setSession(SessionKey.PendingInvite, invite),
          joinRoom: (input) => joinRoom(input),
        }
      );
      return { ok: true };
    case "popup:getUpdateState":
      return { kind: "sw:updateState", latest: latestAvailable };
    default:
      return;
  }
});
