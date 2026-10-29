import { chromium, type BrowserContext } from "@playwright/test";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawn, type ChildProcess } from "node:child_process";
import http from "node:http";
import fs from "node:fs";

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, "../../../..");
const extensionDist = path.resolve(repoRoot, "packages/extension/dist");
const fixturesDir = path.resolve(here, "..", "fixtures");

export interface Harness {
  signaling: ChildProcess;
  httpServer: http.Server;
  httpPort: number;
  userA: BrowserContext;
  userB: BrowserContext;
  cleanup: () => Promise<void>;
}

// Poll /version instead of sleeping a guessed amount: a fixed delay is both
// slower than needed on a fast machine and racy on a loaded CI runner.
async function waitForSignaling(timeoutMs = 15_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const ok = await new Promise<boolean>((resolve) => {
      const req = http.get("http://127.0.0.1:3051/version", (res: http.IncomingMessage) => {
        res.resume();
        resolve(res.statusCode === 200);
      });
      req.on("error", () => resolve(false));
      req.setTimeout(500, () => {
        req.destroy();
        resolve(false);
      });
    });
    if (ok) return;
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error("signaling server did not become ready on :3051 within 15s");
}

export async function startHarness(): Promise<Harness> {
  const signaling = spawn("node", ["packages/server/dist/index.js"], {
    cwd: repoRoot,
    env: { ...process.env, PORT: "3051", HOST: "127.0.0.1", LOG_LEVEL: "warn" },
    stdio: ["ignore", "inherit", "inherit"],
  });
  await waitForSignaling();

  const httpServer = http.createServer((req, res) => {
    const reqPath = (req.url || "/").replace(/\?.*$/, "");
    const filePath = path.join(fixturesDir, reqPath === "/" ? "page.html" : reqPath);
    if (!filePath.startsWith(fixturesDir)) { res.writeHead(403); return res.end(); }
    fs.stat(filePath, (err: unknown, stat: fs.Stats) => {
      if (err || !stat.isFile()) { res.writeHead(404); return res.end(); }
      const type = filePath.endsWith(".html") ? "text/html" : filePath.endsWith(".mp4") ? "video/mp4" : "application/octet-stream";

      // Range support matters: without it Chromium treats the media as
      // non-seekable, and `video.currentTime = 3` is silently ignored, so the
      // seek assertions never see the jump.
      const range = req.headers.range;
      const m = range ? /^bytes=(\d*)-(\d*)$/.exec(range.trim()) : null;
      if (m && (m[1] !== "" || m[2] !== "")) {
        const size = stat.size;
        let start = m[1] === "" ? size - Number(m[2]) : Number(m[1]);
        let end = m[1] === "" || m[2] === "" ? size - 1 : Number(m[2]);
        start = Math.max(0, start);
        end = Math.min(end, size - 1);
        if (start > end || start >= size) {
          res.writeHead(416, { "content-range": `bytes */${size}` });
          return res.end();
        }
        res.writeHead(206, {
          "content-type": type,
          "accept-ranges": "bytes",
          "content-range": `bytes ${start}-${end}/${size}`,
          "content-length": String(end - start + 1),
        });
        if (req.method === "HEAD") return res.end();
        fs.createReadStream(filePath, { start, end }).pipe(res);
        return;
      }

      res.writeHead(200, {
        "content-type": type,
        "accept-ranges": "bytes",
        "content-length": String(stat.size),
      });
      if (req.method === "HEAD") return res.end();
      fs.createReadStream(filePath).pipe(res);
    });
  });
  const httpPort: number = await new Promise((resolve) => {
    httpServer.listen(0, "127.0.0.1", () => {
      const addr = httpServer.address();
      if (typeof addr === "string" || !addr) throw new Error("no addr");
      resolve(addr.port);
    });
  });

  const ctxArgs = {
    headless: false,
    args: [
      `--disable-extensions-except=${extensionDist}`,
      `--load-extension=${extensionDist}`,
      "--no-first-run",
      "--no-default-browser-check",
      // Without this, Chromium refuses to start unmuted playback from an
      // evaluate() call (no user gesture), so the video never leaves paused
      // state and every sync assertion times out.
      "--autoplay-policy=no-user-gesture-required",
    ],
  };
  const userA = await chromium.launchPersistentContext("", { ...ctxArgs });
  const userB = await chromium.launchPersistentContext("", { ...ctxArgs });

  return {
    signaling, httpServer, httpPort, userA, userB,
    async cleanup() {
      await userA.close();
      await userB.close();
      // Wait for the child to actually exit: the next spec file binds the same
      // port, so signalling and moving on races with the socket being released.
      const exited = new Promise<void>((resolve) => signaling.once("exit", () => resolve()));
      signaling.kill("SIGTERM");
      await Promise.race([exited, new Promise<void>((r) => setTimeout(r, 3000))]);
      await new Promise<void>((r) => httpServer.close(() => r()));
    },
  };
}

export async function findExtensionId(ctx: BrowserContext): Promise<string> {
  // Locate the service worker for the extension; its URL is chrome-extension://<id>/service_worker.js
  for (let i = 0; i < 20; i++) {
    const workers = ctx.serviceWorkers();
    for (const w of workers) {
      const url = w.url();
      const m = url.match(/^chrome-extension:\/\/([a-z]+)\//);
      if (m) return m[1];
    }
    await new Promise((r) => setTimeout(r, 200));
  }
  throw new Error("extension service worker not found");
}
