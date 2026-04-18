import type { ServerMessage } from "@nobar-party/protocol";

export type RuntimeMessage =
  | { kind: "content:hello"; url: string; candidates: ContentCandidate[]; tabId?: number }
  | { kind: "content:videoEvent"; event: LocalVideoEvent; frameId?: number }
  | { kind: "content:setTargetAck"; frameId: number; bestSignature: string }
  | { kind: "sw:applyEvent"; apply: ApplyCommand }
  | { kind: "sw:roomState"; state: ActiveRoomView }
  | { kind: "sw:pickManually"; candidates: ContentCandidate[] }
  | { kind: "sidebar:chat"; message: ChatLine }
  | { kind: "sidebar:peerEvent"; event: ServerMessage }
  | { kind: "popup:getState" }
  | { kind: "popup:createRoom"; nickname: string }
  | { kind: "popup:joinRoom"; roomId: string; nickname: string }
  | { kind: "popup:leaveRoom" }
  | { kind: "popup:setSyncedTab"; tabId: number }
  | { kind: "popup:pickVideo"; frameId: number; signature: string }
  | { kind: "invite:received"; serverUrl: string; roomCode: string }
  | { kind: "popup:getUpdateState" }
  | { kind: "sw:updateState"; latest: { version: string; downloadUrl: { win: string; mac: string } } | null };

export interface ContentCandidate {
  signature: string;
  width: number;
  height: number;
  src: string;
  frameId: number;
}

export interface LocalVideoEvent {
  type: "play" | "pause" | "seek";
  t: number;
  at: number;
}

export type ApplyCommand =
  | { type: "play"; seekTo: number | null; suppressUntil: number }
  | { type: "pause"; seekTo: number | null; suppressUntil: number }
  | { type: "seek"; seekTo: number; suppressUntil: number };

export interface ActiveRoomView {
  roomId: string;
  selfId: string;
  nickname: string;
  members: Array<{ id: string; nickname: string }>;
  connected: boolean;
  currentUrl: string | null;
  reconnectingInMs: number | null;
}

export interface ChatLine {
  fromId: string;
  nickname: string;
  text: string;
  at: number;
}

export async function sendRuntimeMessage<T = unknown>(msg: RuntimeMessage): Promise<T | undefined> {
  try {
    return (await chrome.runtime.sendMessage(msg)) as T | undefined;
  } catch {
    return undefined;
  }
}

export function onRuntimeMessage(
  handler: (msg: RuntimeMessage, sender: chrome.runtime.MessageSender) => unknown
): void {
  chrome.runtime.onMessage.addListener((raw, sender, sendResponse) => {
    const result = handler(raw as RuntimeMessage, sender);
    if (result instanceof Promise) {
      result.then(sendResponse).catch(() => sendResponse(undefined));
      return true;
    }
    sendResponse(result);
  });
}
