import { describe, expect, it } from "vitest";
import {
  applyPlay,
  applyPause,
  applySeek,
  continuousDrift,
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

describe("constants", () => {
  it("matches spec values", () => {
    expect(DRIFT_EVENT_THRESHOLD_S).toBe(0.5);
    expect(DRIFT_CONTINUOUS_THRESHOLD_S).toBe(1.0);
    expect(SUPPRESS_WINDOW_MS).toBe(500);
  });
});
