import { PersistentKey, SessionKey, Storage } from "./lib/storage.js";
import { sendRuntimeMessage } from "./lib/messages.js";

const ROOM_RE = /^[A-Z0-9]{6}$/;

export interface InviteHandoffDeps {
  location: { protocol: string; host: string; pathname: string; search: string };
  setLocal: (key: string, value: unknown) => Promise<void>;
  setSession: (key: string, value: unknown) => Promise<void>;
  sendRuntime: (msg: unknown) => Promise<unknown>;
  postToPage: (msg: unknown) => void;
}

export async function maybeApplyInvite(d: InviteHandoffDeps): Promise<boolean> {
  if (d.location.protocol !== "https:") return false;
  if (d.location.pathname !== "/join") return false;
  const params = new URLSearchParams(d.location.search);
  const roomCode = params.get("room");
  if (!roomCode || !ROOM_RE.test(roomCode)) return false;

  const serverUrl = `wss://${d.location.host}`;
  await d.setLocal("serverUrl", serverUrl);
  await d.setSession("pendingInvite", { roomCode });
  await d.sendRuntime({ kind: "invite:received", serverUrl, roomCode });
  d.postToPage({ type: "nobar-config-saved" });
  return true;
}

// Bootstrap the script when loaded as a real content script (not during unit tests).
declare const chrome: {
  storage: {
    local: { set: (o: Record<string, unknown>) => Promise<void> };
    session: { set: (o: Record<string, unknown>) => Promise<void> };
  };
  runtime: { sendMessage: (msg: unknown) => Promise<unknown> };
};

if (typeof window !== "undefined" && typeof chrome !== "undefined" && chrome.storage) {
  const storage = new Storage();
  void maybeApplyInvite({
    location: {
      protocol: window.location.protocol,
      host: window.location.host,
      pathname: window.location.pathname,
      search: window.location.search,
    },
    setLocal: (k, v) =>
      k === "serverUrl"
        ? storage.setLocal(PersistentKey.ServerUrl, v as string)
        : chrome.storage.local.set({ [k]: v }),
    setSession: (k, v) =>
      k === "pendingInvite"
        ? storage.setSession(SessionKey.PendingInvite, v as { roomCode: string })
        : chrome.storage.session.set({ [k]: v }),
    sendRuntime: (msg) => sendRuntimeMessage(msg as never),
    postToPage: (msg) => window.postMessage(msg, window.location.origin),
  });
}
