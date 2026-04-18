export const DRIFT_EVENT_THRESHOLD_S = 0.5;
export const DRIFT_CONTINUOUS_THRESHOLD_S = 1.0;
export const SUPPRESS_WINDOW_MS = 500;

interface PlaybackEvent {
  t: number;
  at: number;
  fromId: string;
}

export interface ApplyResult {
  seekTo: number | null;
  shouldPlay: boolean;
  shouldPause: boolean;
  suppressUntil: number;
}

export function applyPlay(params: {
  event: PlaybackEvent;
  myOffset: number;
  myNow: number;
  videoTime: number;
  threshold?: number;
}): ApplyResult {
  const threshold = params.threshold ?? DRIFT_EVENT_THRESHOLD_S;
  const elapsedMs = (params.myNow + params.myOffset) - params.event.at;
  const targetT = params.event.t + elapsedMs / 1000;
  const drift = Math.abs(params.videoTime - targetT);
  return {
    seekTo: drift > threshold ? targetT : null,
    shouldPlay: true,
    shouldPause: false,
    suppressUntil: params.myNow + SUPPRESS_WINDOW_MS,
  };
}

export function applyPause(params: {
  event: PlaybackEvent;
  myNow: number;
  videoTime: number;
  threshold?: number;
}): ApplyResult {
  const threshold = params.threshold ?? DRIFT_EVENT_THRESHOLD_S;
  const drift = Math.abs(params.videoTime - params.event.t);
  return {
    seekTo: drift > threshold ? params.event.t : null,
    shouldPlay: false,
    shouldPause: true,
    suppressUntil: params.myNow + SUPPRESS_WINDOW_MS,
  };
}

export function applySeek(params: {
  event: PlaybackEvent;
  myNow: number;
}): ApplyResult {
  return {
    seekTo: params.event.t,
    shouldPlay: false,
    shouldPause: false,
    suppressUntil: params.myNow + SUPPRESS_WINDOW_MS,
  };
}

export function continuousDrift(params: {
  lastKnown: { t: number; at: number; playing: boolean };
  myOffset: number;
  myNow: number;
  videoTime: number;
  threshold?: number;
}): { correctTo: number | null } {
  if (!params.lastKnown.playing) return { correctTo: null };
  const threshold = params.threshold ?? DRIFT_CONTINUOUS_THRESHOLD_S;
  const elapsed = (params.myNow + params.myOffset - params.lastKnown.at) / 1000;
  const expected = params.lastKnown.t + elapsed;
  const drift = Math.abs(params.videoTime - expected);
  return { correctTo: drift > threshold ? expected : null };
}
