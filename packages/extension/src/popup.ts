import { sendRuntimeMessage, ActiveRoomView } from "./lib/messages.js";
import { Storage, PersistentKey } from "./lib/storage.js";

const storage = new Storage();

const $ = <T extends HTMLElement = HTMLElement>(id: string): T => {
  const el = document.getElementById(id);
  if (!el) throw new Error(`missing #${id}`);
  return el as T;
};

async function init(): Promise<void> {
  const nick = (await storage.getLocal(PersistentKey.Nickname)) ?? "";
  ($("nickname") as HTMLInputElement).value = nick;

  const serverUrl = (await storage.getLocal(PersistentKey.ServerUrl)) ?? "";
  ($("server-url") as HTMLInputElement).value = serverUrl;

  $("create-btn").addEventListener("click", onCreate);
  $("join-btn").addEventListener("click", onJoin);
  $("leave-btn").addEventListener("click", onLeave);
  $("copy-code").addEventListener("click", onCopyCode);
  $("pick-manually").addEventListener("click", onPickManually);
  $("save-settings").addEventListener("click", onSaveSettings);

  const resp = (await sendRuntimeMessage<{ kind: "sw:roomState"; state: ActiveRoomView | null }>({ kind: "popup:getState" }));
  render(resp?.state ?? null);
}

chrome.runtime.onMessage.addListener((msg: unknown) => {
  const m = msg as { kind?: string; state?: ActiveRoomView | null };
  if (m.kind === "sw:roomState") render(m.state ?? null);
});

function render(state: ActiveRoomView | null): void {
  $("idle-view").hidden = state !== null;
  $("room-view").hidden = state === null;
  if (!state) return;
  $("room-title").textContent = `Room ${state.roomId}`;
  const members = $("members");
  members.textContent = "";
  for (const m of state.members) {
    const span = document.createElement("span");
    span.className = "member";
    span.textContent = m.nickname + (m.id === state.selfId ? " (you)" : "");
    members.appendChild(span);
  }
  $("video-status").textContent = state.currentUrl ?? "(no URL)";
}

async function onCreate(): Promise<void> {
  const nickname = ($("nickname") as HTMLInputElement).value.trim();
  if (!nickname) return;
  await storage.setLocal(PersistentKey.Nickname, nickname);
  await sendRuntimeMessage({ kind: "popup:createRoom", nickname });
}

async function onJoin(): Promise<void> {
  const nickname = ($("nickname") as HTMLInputElement).value.trim();
  const roomId = ($("room-code") as HTMLInputElement).value.trim().toUpperCase();
  if (!nickname || !roomId) return;
  await storage.setLocal(PersistentKey.Nickname, nickname);
  await sendRuntimeMessage({ kind: "popup:joinRoom", roomId, nickname });
}

async function onLeave(): Promise<void> {
  await sendRuntimeMessage({ kind: "popup:leaveRoom" });
}

async function onCopyCode(): Promise<void> {
  const title = $("room-title").textContent ?? "";
  const code = title.replace(/^Room /, "").trim();
  await navigator.clipboard.writeText(code);
}

function onPickManually(): void {
  // Picks are handled by sending a message; list is populated by an upstream extension feature.
  // v1: button is informational — manual list UX is best-effort and wired by the service worker.
}

async function onSaveSettings(): Promise<void> {
  const url = ($("server-url") as HTMLInputElement).value.trim();
  if (url) await storage.setLocal(PersistentKey.ServerUrl, url);
}

void init();
