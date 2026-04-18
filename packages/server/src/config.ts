export interface ServerConfig {
  port: number;
  host: string;
  maxRoomSize: number;
  maxRooms: number;
  frameBytes: number;
  rateLimit: { capacity: number; refillPerSec: number };
  graceMs: number;
}

function envInt(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const n = Number.parseInt(raw, 10);
  if (!Number.isFinite(n) || n <= 0) throw new Error(`invalid ${name}: ${raw}`);
  return n;
}

export function loadConfig(): ServerConfig {
  return {
    port: envInt("PORT", 3050),
    host: process.env.HOST || "127.0.0.1",
    maxRoomSize: envInt("MAX_ROOM_SIZE", 10),
    maxRooms: envInt("MAX_ROOMS", 1000),
    frameBytes: envInt("FRAME_KB", 16) * 1024,
    rateLimit: { capacity: 20, refillPerSec: 20 },
    graceMs: 30_000,
  };
}
