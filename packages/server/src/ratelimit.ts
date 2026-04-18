export interface TokenBucketOptions {
  capacity: number;
  refillPerSec: number;
}

export class TokenBucket {
  private tokens: number;
  private lastRefillMs: number | null = null;

  constructor(private readonly opts: TokenBucketOptions) {
    this.tokens = opts.capacity;
  }

  tryConsume(n: number, nowMs: number = Date.now()): boolean {
    if (n > this.opts.capacity) return false;
    if (this.lastRefillMs !== null) {
      const elapsedSec = (nowMs - this.lastRefillMs) / 1000;
      const refill = elapsedSec * this.opts.refillPerSec;
      this.tokens = Math.min(this.opts.capacity, this.tokens + refill);
    }
    this.lastRefillMs = nowMs;
    if (this.tokens < n) return false;
    this.tokens -= n;
    return true;
  }
}
