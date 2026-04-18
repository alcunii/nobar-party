import type { ServerMessage } from "@nobar-party/protocol";
import { ChatLine, ActiveRoomView } from "./lib/messages.js";

const $ = <T extends HTMLElement = HTMLElement>(id: string): T => {
  const el = document.getElementById(id);
  if (!el) throw new Error(`missing #${id}`);
  return el as T;
};

const status = $("status");
const messages = $("messages");
const members = $("members");
const banner = $("banner");
const input = $("input") as HTMLInputElement;
const composer = $("composer") as HTMLFormElement;

window.addEventListener("message", (ev) => {
  const msg = ev.data as { kind?: string };
  if (msg.kind === "sw:roomState") renderState((ev.data as any).state ?? null);
  if (msg.kind === "sidebar:chat") appendChat((ev.data as any).message as ChatLine);
  if (msg.kind === "sidebar:peerEvent") handlePeerEvent((ev.data as any).event as ServerMessage);
});

composer.addEventListener("submit", (e) => {
  e.preventDefault();
  const text = input.value.trim();
  if (!text) return;
  input.value = "";
  window.parent.postMessage({ kind: "sidebar:chat", message: { text, fromId: "", nickname: "", at: Date.now() } }, "*");
});

$("collapse").addEventListener("click", () => {
  const sidebar = $("sidebar");
  sidebar.classList.toggle("collapsed");
});

function renderState(state: ActiveRoomView | null): void {
  if (!state) {
    status.textContent = "";
    members.textContent = "";
    return;
  }
  status.textContent = state.reconnectingInMs !== null
    ? `Reconnecting in ${Math.round(state.reconnectingInMs / 1000)}s`
    : state.connected ? "" : "Disconnected";
  members.textContent = state.members.map((m) => m.nickname).join(" · ");
}

function appendChat(line: ChatLine): void {
  const div = document.createElement("div");
  div.className = "msg";
  const nick = document.createElement("span");
  nick.className = "nick";
  nick.textContent = line.nickname + ":";
  const body = document.createElement("span");
  body.textContent = " " + line.text;   // textContent — XSS-safe
  div.append(nick, body);
  messages.appendChild(div);
  messages.scrollTop = messages.scrollHeight;
}

function handlePeerEvent(ev: ServerMessage): void {
  if (ev.type === "url") {
    banner.hidden = false;
    banner.textContent = `→ ${ev.nickname} is now watching `;
    const link = document.createElement("code");
    link.textContent = ev.url;
    banner.appendChild(link);
    const btn = document.createElement("button");
    btn.textContent = "Follow";
    btn.addEventListener("click", () => window.parent.postMessage({ kind: "sidebar:followUrl", url: ev.url }, "*"));
    banner.appendChild(btn);
  } else if (ev.type === "peer-joined") {
    appendChat({ fromId: ev.id, nickname: "*", text: `${ev.nickname} joined`, at: Date.now() });
  } else if (ev.type === "peer-left") {
    appendChat({ fromId: ev.id, nickname: "*", text: `someone left`, at: Date.now() });
  } else if (ev.type === "error") {
    appendChat({ fromId: "", nickname: "*", text: `error: ${ev.code} — ${ev.message}`, at: Date.now() });
  }
}
