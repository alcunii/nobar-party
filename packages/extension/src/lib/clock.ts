export interface Sample {
  rtt: number;
  offset: number;
}

export function computeSample(input: {
  pingAt: number;
  pongSentAt: number;
  pongReceivedAt: number;
}): Sample {
  const rtt = input.pongReceivedAt - input.pingAt;
  const offset = input.pongSentAt - (input.pingAt + rtt / 2);
  return { rtt, offset };
}

export function bestSample(samples: readonly Sample[]): Sample | null {
  if (samples.length === 0) return null;
  return samples.reduce((best, s) => (s.rtt < best.rtt ? s : best));
}

export class ClockEstimator {
  private best: Sample | null = null;

  get offset(): number {
    return this.best?.offset ?? 0;
  }

  addSample(s: Sample): void {
    if (this.best === null || s.rtt < this.best.rtt) this.best = s;
  }

  reset(): void {
    this.best = null;
  }
}
