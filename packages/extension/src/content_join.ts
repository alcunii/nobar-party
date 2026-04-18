import { sendRuntimeMessage } from "./lib/messages.js";

const ROOM_RE = /^[A-Z0-9]{6}$/;

export interface InviteHandoffDeps {
  location: { protocol: string; host: string; pathname: string; search: string };
  sendRuntime: (msg: unknown) => Promise<unknown>;
  postToPage: (msg: unknown) => void;
}

// Content scripts in MV3 cannot access chrome.storage.session. All storage
// writes are handled by the service worker after receiving the invite:received
// message. This keeps the content script free of privileged API access.
export async function maybeApplyInvite(d: InviteHandoffDeps): Promise<boolean> {
  if (d.location.protocol !== "https:") return false;
  if (d.location.pathname !== "/join") return false;
  const params = new URLSearchParams(d.location.search);
  const roomCode = params.get("room");
  if (!roomCode || !ROOM_RE.test(roomCode)) return false;

  const serverUrl = `wss://${d.location.host}`;
  await d.sendRuntime({ kind: "invite:received", serverUrl, roomCode });
  d.postToPage({ type: "nobar-config-saved" });
  return true;
}

// Bootstrap the script when loaded as a real content script (not during unit tests).
declare const chrome: { runtime: { sendMessage: (msg: unknown) => Promise<unknown> } };

if (typeof window !== "undefined" && typeof chrome !== "undefined" && chrome.runtime) {
  void maybeApplyInvite({
    location: {
      protocol: window.location.protocol,
      host: window.location.host,
      pathname: window.location.pathname,
      search: window.location.search,
    },
    sendRuntime: (msg) => sendRuntimeMessage(msg as never),
    postToPage: (msg) => window.postMessage(msg, window.location.origin),
  });
}
