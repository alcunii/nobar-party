import { describe, expect, it } from "vitest";
import { TokenBucket } from "./ratelimit.js";

describe("TokenBucket", () => {
  it("starts at capacity and allows capacity consumes", () => {
    const b = new TokenBucket({ capacity: 5, refillPerSec: 10 });
    for (let i = 0; i < 5; i++) expect(b.tryConsume(1, 0)).toBe(true);
    expect(b.tryConsume(1, 0)).toBe(false);
  });

  it("refills linearly over time", () => {
    const b = new TokenBucket({ capacity: 10, refillPerSec: 10 });
    for (let i = 0; i < 10; i++) b.tryConsume(1, 0);
    expect(b.tryConsume(1, 0)).toBe(false);
    // 500ms later → 5 tokens back
    expect(b.tryConsume(5, 500)).toBe(true);
    expect(b.tryConsume(1, 500)).toBe(false);
  });

  it("caps refill at capacity", () => {
    const b = new TokenBucket({ capacity: 3, refillPerSec: 100 });
    for (let i = 0; i < 3; i++) b.tryConsume(1, 0);
    expect(b.tryConsume(3, 100_000)).toBe(true); // fully refilled, not overflowed
    expect(b.tryConsume(1, 100_000)).toBe(false);
  });

  it("rejects batches larger than capacity", () => {
    const b = new TokenBucket({ capacity: 5, refillPerSec: 10 });
    expect(b.tryConsume(6, 0)).toBe(false);
    // unchanged — still has full bucket
    expect(b.tryConsume(5, 0)).toBe(true);
  });
});
