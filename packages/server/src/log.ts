type Level = "debug" | "info" | "warn" | "error";
const LEVEL_RANK: Record<Level, number> = { debug: 10, info: 20, warn: 30, error: 40 };

const current: Level = (process.env.LOG_LEVEL as Level) || "info";

function emit(level: Level, msg: string, extra?: Record<string, unknown>): void {
  if (LEVEL_RANK[level] < LEVEL_RANK[current]) return;
  const line = JSON.stringify({ ts: new Date().toISOString(), level, msg, ...extra });
  if (level === "error" || level === "warn") {
    process.stderr.write(line + "\n");
  } else {
    process.stdout.write(line + "\n");
  }
}

export const log = {
  debug: (msg: string, extra?: Record<string, unknown>) => emit("debug", msg, extra),
  info: (msg: string, extra?: Record<string, unknown>) => emit("info", msg, extra),
  warn: (msg: string, extra?: Record<string, unknown>) => emit("warn", msg, extra),
  error: (msg: string, extra?: Record<string, unknown>) => emit("error", msg, extra),
};
