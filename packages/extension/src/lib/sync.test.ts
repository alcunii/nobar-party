import { describe, expect, it } from "vitest";
import {
  applyPlay,
  applyPause,
  applySeek,
  continuousDrift,
  normaliseRemoteState,
  projectPosition,
  DRIFT_EVENT_THRESHOLD_S,
  DRIFT_CONTINUOUS_THRESHOLD_S,
  SUPPRESS_WINDOW_MS,
} from "./sync.js";

describe("applyPlay", () => {
  it("returns seek when drift exceeds threshold", () => {
    const r = applyPlay({
      event: { t: 100, at: 1000, fromId: "x" },
      myOffset: 0,
      myNow: 1200,      // 200 ms later
      videoTime: 95,    // way behind
    });
    expect(r.seekTo).toBeCloseTo(100.2, 3);
    expect(r.shouldPlay).toBe(true);
    expect(r.suppressUntil).toBe(1200 + SUPPRESS_WINDOW_MS);
  });

  it("skips seek when within threshold", () => {
    const r = applyPlay({
      event: { t: 100, at: 1000, fromId: "x" },
      myOffset: 0,
      myNow: 1050,
      videoTime: 100.1,
    });
    expect(r.seekTo).toBeNull();
    expect(r.shouldPlay).toBe(true);
  });

  it("applies clock offset", () => {
    const r = applyPlay({
      event: { t: 100, at: 1000, fromId: "x" },
      myOffset: 50,    // my clock is 50 ms behind sender
      myNow: 1100,
      videoTime: 100,
    });
    // elapsed in my clock = (1100 + 50) - 1000 = 150 ms → targetT = 100.15
    expect(r.seekTo).toBeNull();
  });
});

describe("applyPause", () => {
  it("returns seekTo when current deviates from t", () => {
    const r = applyPause({
      event: { t: 50, at: 1000, fromId: "x" },
      myNow: 1100,
      videoTime: 52,
    });
    expect(r.seekTo).toBe(50);
    expect(r.shouldPause).toBe(true);
    expect(r.suppressUntil).toBe(1100 + SUPPRESS_WINDOW_MS);
  });
});

describe("applySeek", () => {
  it("always seeks to t", () => {
    const r = applySeek({ event: { t: 42, at: 1000, fromId: "x" }, myNow: 1100 });
    expect(r.seekTo).toBe(42);
    expect(r.suppressUntil).toBe(1100 + SUPPRESS_WINDOW_MS);
  });
});

describe("continuousDrift", () => {
  it("returns expected time when drift exceeds threshold", () => {
    const r = continuousDrift({
      lastKnown: { t: 100, at: 1000, playing: true },
      myOffset: 0,
      myNow: 6000,    // 5 s later
      videoTime: 90,  // 15 s behind — big drift
    });
    expect(r.correctTo).toBeCloseTo(105, 3);
  });

  it("returns null when drift within threshold", () => {
    const r = continuousDrift({
      lastKnown: { t: 100, at: 1000, playing: true },
      myOffset: 0,
      myNow: 6000,
      videoTime: 104.5,
    });
    expect(r.correctTo).toBeNull();
  });

  it("returns null when not playing", () => {
    const r = continuousDrift({
      lastKnown: { t: 100, at: 1000, playing: false },
      myOffset: 0,
      myNow: 6000,
      videoTime: 50,
    });
    expect(r.correctTo).toBeNull();
  });
});

describe("normaliseRemoteState", () => {
  it("projects a playing state forward and re-bases it on our clock", () => {
    // Sender said: at t=100 it was 1000 on their clock. We are 500 ms later.
    const n = normaliseRemoteState({ t: 100, at: 1000, playing: true }, 1500);
    expect(n.t).toBeCloseTo(100.5, 3);
    expect(n.at).toBe(1500);
    expect(n.playing).toBe(true);
  });

  it("leaves a paused position alone but still re-bases the clock", () => {
    const n = normaliseRemoteState({ t: 42, at: 1000, playing: false }, 99_000);
    expect(n.t).toBe(42);
    expect(n.at).toBe(99_000);
    expect(n.playing).toBe(false);
  });

  it("never projects backwards when the sender's clock is ahead of ours", () => {
    const n = normaliseRemoteState({ t: 10, at: 2000, playing: true }, 1500);
    expect(n.t).toBe(10);
  });
});

describe("projectPosition", () => {
  it("advances a playing state", () => {
    expect(projectPosition({ t: 10, at: 1000, playing: true }, 3500)).toBeCloseTo(12.5, 3);
  });

  it("freezes a paused state", () => {
    expect(projectPosition({ t: 10, at: 1000, playing: false }, 999_999)).toBe(10);
  });
});

describe("normalise then drift", () => {
  it("reports no correction for a client that is on time", () => {
    const serverNow = 10_000;
    const lastKnown = normaliseRemoteState({ t: 50, at: serverNow - 2000, playing: true }, serverNow);
    // The state is already 2 s into playback; two more seconds pass, so the
    // room should be at 54 — and so are we.
    const r = continuousDrift({
      lastKnown,
      myOffset: 0,
      myNow: serverNow + 2000,
      videoTime: 54,
    });
    expect(r.correctTo).toBeNull();
  });

  it("corrects a client that fell behind while buffering", () => {
    const serverNow = 10_000;
    const lastKnown = normaliseRemoteState({ t: 50, at: serverNow - 2000, playing: true }, serverNow);
    const r = continuousDrift({
      lastKnown,
      myOffset: 0,
      myNow: serverNow + 2000,
      videoTime: 49,   // 5 s behind
    });
    expect(r.correctTo).toBeCloseTo(54, 3);
  });
});

describe("constants", () => {
  it("matches spec values", () => {
    expect(DRIFT_EVENT_THRESHOLD_S).toBe(0.5);
    expect(DRIFT_CONTINUOUS_THRESHOLD_S).toBe(1.0);
    expect(SUPPRESS_WINDOW_MS).toBe(500);
  });
});
