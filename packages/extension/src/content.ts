import { findBestVideo, listCandidates, videoSignature, makeDriver } from "./lib/video.js";
import { SUPPRESS_WINDOW_MS } from "./lib/sync.js";
import { sendRuntimeMessage, onRuntimeMessage, ContentCandidate, ChatLine } from "./lib/messages.js";

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

function setTarget(v: HTMLVideoElement | null): void {
  if (target === v) return;
  // Detach from the previous element: a stale <video> keeps firing play/pause
  // and would report the *new* driver's time as if it were its own.
  if (target) {
    target.removeEventListener("play", onLocalPlay);
    target.removeEventListener("pause", onLocalPause);
    target.removeEventListener("seeking", onLocalSeeking);
  }
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

// Bridge outbound messages from the sidebar iframe up to the service worker
// (sidebar:chat) and handle page-level follow-URL navigation (sidebar:followUrl).
// Only accept messages from our own sidebar iframe to ignore arbitrary postMessage
// calls from the host page.
window.addEventListener("message", (ev) => {
  if (!sidebarIframe || ev.source !== sidebarIframe.contentWindow) return;
  const msg = ev.data as { kind?: string; message?: ChatLine; url?: string };
  if (msg.kind === "sidebar:chat" && msg.message) {
    void sendRuntimeMessage({ kind: "sidebar:chat", message: msg.message });
  } else if (msg.kind === "sidebar:followUrl" && typeof msg.url === "string") {
    try {
      const u = new URL(msg.url);
      if (u.protocol === "http:" || u.protocol === "https:") {
        window.location.href = msg.url;
      }
    } catch { /* ignore bad URL */ }
  }
});

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
    case "sw:getVideoState":
      // The service worker cannot read a <video>; drift decisions need the
      // real position, so it asks for it here.
      return {
        kind: "sw:videoState" as const,
        time: driver?.currentTime() ?? 0,
        paused: driver?.isPaused() ?? true,
      };
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

// Initial scan + mutation observer. Scanning on every mutation floods the
// service worker on sites that touch the DOM constantly (YouTube), so debounce
// and only report when the candidate set actually changed.
let scanTimer: ReturnType<typeof setTimeout> | null = null;
let lastReported = "";

function scan(): void {
  autodetect();
  const candidates = gatherCandidates();
  const signature = candidates.map((c) => c.signature).sort().join("|") + "#" + location.href;
  if (signature === lastReported) return;
  lastReported = signature;
  void sendRuntimeMessage({ kind: "content:hello", url: location.href, candidates });
}

function scheduleScan(): void {
  if (scanTimer) return;
  scanTimer = setTimeout(() => { scanTimer = null; scan(); }, 250);
}

scan();
const mo = new MutationObserver(scheduleScan);
mo.observe(document.documentElement, { subtree: true, childList: true });

// Continuous drift correction. Event-based sync only fires on play/pause/seek,
// so two machines silently diverge during long playback (backgrounded tabs,
// throttled timers). While playing, ask the service worker whether our position
// still matches the room's and nudge it back if not.
setInterval(() => {
  if (!driver || driver.isPaused()) return;
  const time = driver.currentTime();
  void sendRuntimeMessage<{ kind: "sw:driftVerdict"; correctTo: number | null }>({
    kind: "content:driftCheck",
    t: time,
    frameId: FRAME_ID,
  }).then((verdict) => {
    if (!verdict || verdict.correctTo === null || !driver) return;
    // Suppress the echo: our own correction must not be broadcast as a seek.
    suppressUntil = Date.now() + SUPPRESS_WINDOW_MS;
    driver.seek(verdict.correctTo);
  });
}, 5_000);

// Navigation within an SPA
let lastUrl = location.href;
setInterval(() => {
  if (location.href !== lastUrl) {
    lastUrl = location.href;
    scan();
  }
}, 1000);
