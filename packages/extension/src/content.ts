import { findBestVideo, listCandidates, videoSignature, makeDriver } from "./lib/video.js";
import { SUPPRESS_WINDOW_MS } from "./lib/sync.js";
import { sendRuntimeMessage, onRuntimeMessage, ContentCandidate } from "./lib/messages.js";

const FRAME_ID = (() => {
  try { return window.top === window ? 0 : Math.floor(Math.random() * 1_000_000_000); } catch { return 0; }
})();

let target: HTMLVideoElement | null = null;
let driver: ReturnType<typeof makeDriver> | null = null;
let suppressUntil = 0;
let seekDebounce: ReturnType<typeof setTimeout> | null = null;
let sidebarIframe: HTMLIFrameElement | null = null;

function gatherCandidates(): ContentCandidate[] {
  return listCandidates(document)
    .filter((c) => c.ready)
    .map((c) => ({ signature: videoSignature(c.element), width: c.width, height: c.height, src: c.src, frameId: FRAME_ID }));
}

function reportHello(): void {
  void sendRuntimeMessage({
    kind: "content:hello",
    url: location.href,
    candidates: gatherCandidates(),
  });
}

function setTarget(v: HTMLVideoElement | null): void {
  if (target === v) return;
  target = v;
  driver = v ? makeDriver(v) : null;
  if (!v) return;
  v.addEventListener("play", onLocalPlay);
  v.addEventListener("pause", onLocalPause);
  v.addEventListener("seeking", onLocalSeeking);
}

function onLocalPlay(): void {
  if (Date.now() < suppressUntil) return;
  if (!driver) return;
  void sendRuntimeMessage({
    kind: "content:videoEvent",
    event: { type: "play", t: driver.currentTime(), at: Date.now() },
    frameId: FRAME_ID,
  });
}

function onLocalPause(): void {
  if (Date.now() < suppressUntil) return;
  if (!driver) return;
  void sendRuntimeMessage({
    kind: "content:videoEvent",
    event: { type: "pause", t: driver.currentTime(), at: Date.now() },
    frameId: FRAME_ID,
  });
}

function onLocalSeeking(): void {
  if (Date.now() < suppressUntil) return;
  if (!driver) return;
  if (seekDebounce) clearTimeout(seekDebounce);
  seekDebounce = setTimeout(() => {
    if (!driver) return;
    void sendRuntimeMessage({
      kind: "content:videoEvent",
      event: { type: "seek", t: driver.currentTime(), at: Date.now() },
      frameId: FRAME_ID,
    });
  }, 250);
}

function autodetect(): void {
  const v = findBestVideo(document);
  if (v !== target) setTarget(v);
}

function injectSidebar(): void {
  if (window.top !== window || sidebarIframe) return;
  const iframe = document.createElement("iframe");
  iframe.src = chrome.runtime.getURL("sidebar.html");
  iframe.style.cssText = `
    position: fixed; top: 0; right: 0; width: 320px; height: 100vh;
    border: 0; z-index: 2147483647; background: transparent;
    color-scheme: dark;
  `;
  document.documentElement.appendChild(iframe);
  sidebarIframe = iframe;
}

onRuntimeMessage((msg) => {
  switch (msg.kind) {
    case "sw:applyEvent": {
      if (!driver) return;
      const { apply } = msg;
      suppressUntil = apply.suppressUntil;
      if (apply.seekTo !== null) driver.seek(apply.seekTo);
      if (apply.type === "play") driver.play();
      if (apply.type === "pause") driver.pause();
      return;
    }
    case "sw:roomState": {
      if (msg.state && !sidebarIframe) injectSidebar();
      if (!msg.state && sidebarIframe) { sidebarIframe.remove(); sidebarIframe = null; }
      return;
    }
    case "popup:pickVideo": {
      if (msg.frameId !== FRAME_ID) return;
      const match = listCandidates(document).find((c) => videoSignature(c.element) === msg.signature);
      if (match) setTarget(match.element);
      return;
    }
    case "sidebar:chat":
    case "sidebar:peerEvent":
      // forward into sidebar iframe via window.postMessage for top-frame only
      if (sidebarIframe?.contentWindow) sidebarIframe.contentWindow.postMessage(msg, "*");
      return;
  }
});

// Initial scan + mutation observer
autodetect();
reportHello();
const mo = new MutationObserver(() => { autodetect(); reportHello(); });
mo.observe(document.documentElement, { subtree: true, childList: true });

// Navigation within an SPA
let lastUrl = location.href;
setInterval(() => {
  if (location.href !== lastUrl) {
    lastUrl = location.href;
    reportHello();
  }
}, 1000);
