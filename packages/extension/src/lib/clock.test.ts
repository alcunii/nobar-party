import { describe, expect, it } from "vitest";
import { computeSample, bestSample, ClockEstimator } from "./clock.js";

describe("computeSample", () => {
  it("computes rtt and offset from a ping-pong triple", () => {
    const s = computeSample({ pingAt: 1000, pongSentAt: 1200, pongReceivedAt: 1100 });
    expect(s.rtt).toBe(100);
    expect(s.offset).toBe(1200 - (1000 + 50));  // 150
  });
});

describe("bestSample", () => {
  it("returns the sample with lowest rtt", () => {
    const s = bestSample([
      { rtt: 150, offset: 10 },
      { rtt: 40, offset: 20 },
      { rtt: 90, offset: 30 },
    ]);
    expect(s?.offset).toBe(20);
  });

  it("returns null on empty input", () => {
    expect(bestSample([])).toBeNull();
  });
});

describe("ClockEstimator", () => {
  it("tracks best offset across multiple samples", () => {
    const e = new ClockEstimator();
    e.addSample({ rtt: 100, offset: 10 });
    e.addSample({ rtt: 40, offset: 25 });
    e.addSample({ rtt: 80, offset: 15 });
    expect(e.offset).toBe(25);
  });

  it("defaults offset to 0 before any samples", () => {
    const e = new ClockEstimator();
    expect(e.offset).toBe(0);
  });
});
