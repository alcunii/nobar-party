import { describe, expect, it } from "vitest";
import { nextBackoffMs, BACKOFF_BASE_MS, BACKOFF_CAP_MS } from "./ws-client.js";

describe("nextBackoffMs", () => {
  it("starts at BACKOFF_BASE_MS on attempt 0", () => {
    expect(nextBackoffMs(0)).toBe(BACKOFF_BASE_MS);
  });

  it("doubles each attempt", () => {
    expect(nextBackoffMs(1)).toBe(BACKOFF_BASE_MS * 2);
    expect(nextBackoffMs(2)).toBe(BACKOFF_BASE_MS * 4);
    expect(nextBackoffMs(3)).toBe(BACKOFF_BASE_MS * 8);
  });

  it("caps at BACKOFF_CAP_MS", () => {
    expect(nextBackoffMs(100)).toBe(BACKOFF_CAP_MS);
  });

  it("clamps negative attempts", () => {
    expect(nextBackoffMs(-1)).toBe(BACKOFF_BASE_MS);
  });
});
