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

export async function startHarness(): Promise<Harness> {
  const signaling = spawn("node", ["packages/server/dist/index.js"], {
    cwd: repoRoot,
    env: { ...process.env, PORT: "3051", HOST: "127.0.0.1", LOG_LEVEL: "warn" },
    stdio: ["ignore", "inherit", "inherit"],
  });
  await new Promise((r) => setTimeout(r, 500));

  const httpServer = http.createServer((req, res) => {
    const reqPath = (req.url || "/").replace(/\?.*$/, "");
    const filePath = path.join(fixturesDir, reqPath === "/" ? "page.html" : reqPath);
    if (!filePath.startsWith(fixturesDir)) { res.writeHead(403); return res.end(); }
    fs.readFile(filePath, (err, buf) => {
      if (err) { res.writeHead(404); return res.end(); }
      const type = filePath.endsWith(".html") ? "text/html" : filePath.endsWith(".mp4") ? "video/mp4" : "application/octet-stream";
      res.writeHead(200, { "content-type": type });
      res.end(buf);
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
    ],
  } as const;
  const userA = await chromium.launchPersistentContext("", { ...ctxArgs });
  const userB = await chromium.launchPersistentContext("", { ...ctxArgs });

  return {
    signaling, httpServer, httpPort, userA, userB,
    async cleanup() {
      await userA.close();
      await userB.close();
      signaling.kill("SIGTERM");
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
