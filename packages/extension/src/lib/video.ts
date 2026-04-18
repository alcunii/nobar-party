export function findBestVideo(doc: Document): HTMLVideoElement | null {
  const videos = Array.from(doc.querySelectorAll<HTMLVideoElement>("video"));
  let best: HTMLVideoElement | null = null;
  let bestArea = 0;
  for (const v of videos) {
    if (v.readyState === 0) continue;
    const rect = v.getBoundingClientRect();
    const area = (rect.width || v.videoWidth) * (rect.height || v.videoHeight);
    if (area > bestArea) {
      bestArea = area;
      best = v;
    }
  }
  return best;
}

export function listCandidates(doc: Document): Array<{
  element: HTMLVideoElement;
  width: number;
  height: number;
  src: string;
  ready: boolean;
}> {
  return Array.from(doc.querySelectorAll<HTMLVideoElement>("video")).map((v) => {
    const r = v.getBoundingClientRect();
    return {
      element: v,
      width: r.width || v.videoWidth,
      height: r.height || v.videoHeight,
      src: v.currentSrc || v.src,
      ready: v.readyState > 0,
    };
  });
}

export function videoSignature(v: HTMLVideoElement): string {
  const r = v.getBoundingClientRect();
  const w = r.width || v.videoWidth;
  const h = r.height || v.videoHeight;
  return `${v.currentSrc || v.src}|${w}x${h}`;
}

export interface VideoDriver {
  play(): void;
  pause(): void;
  seek(t: number): void;
  currentTime(): number;
  isPaused(): boolean;
}

export function makeDriver(v: HTMLVideoElement): VideoDriver {
  return {
    play: () => { void v.play().catch(() => { /* autoplay policy — ignore */ }); },
    pause: () => v.pause(),
    seek: (t) => { v.currentTime = t; },
    currentTime: () => v.currentTime,
    isPaused: () => v.paused,
  };
}
