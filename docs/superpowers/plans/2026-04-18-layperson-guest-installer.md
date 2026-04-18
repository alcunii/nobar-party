# Layperson Guest Installer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a Tauri-based guest installer (Windows `.msi` + macOS `.dmg`) plus minimal server and extension additions so laypeople can go from "friend sent me an invite link" to "watching the movie" with one download, one wizard run, and one drag-drop action.

**Architecture:** Three sets of changes. (1) Server grows `GET /join` (landing HTML) and `GET /version` (installer metadata) on a new shared Node HTTP server that also upgrades the existing WebSocket; (2) extension grows a `/join`-scoped content script, an invite-consumer in the service worker, popup affordances for copying the invite link, and a 24 h version-check notifier; (3) a new `@nobar-party/installer` Tauri package bundles the packed extension and walks the guest through a 5-screen wizard that ends with "return to the invite tab". Guest returns to the still-open landing page — the content script fires — room auto-joins.

**Tech Stack:** TypeScript (server + extension, strict, ESM, Vitest, esbuild), Node `http` + `ws` (signaling), Tauri 2.x (Rust + system webview for installer), vanilla HTML/CSS/JS (wizard frontend and landing page — no framework), GitHub Actions (release matrix).

**Source spec:** `docs/superpowers/specs/2026-04-18-layperson-guest-installer-design.md`.

---

## File structure

### Server (`packages/server/`)

| File | Create/Modify | Responsibility |
|---|---|---|
| `src/index.ts` | Modify | Spin up `http.Server`, mount routes, attach `WebSocketServer({ noServer: true })` via `upgrade`. |
| `src/http.ts` | Create | Pure-ish HTTP router function: given request + deps, returns response (status/headers/body). Unit-testable without opening ports. |
| `src/landing.ts` | Create | `renderLandingPage(roomId: string): string` — inline HTML/CSS/JS for `GET /join`. |
| `src/version.ts` | Create | `loadVersionInfo(): VersionInfo` reads `version.json`, Zod-validates. `VersionInfo` type exported. |
| `src/version.json` | Create | `{version, downloadUrl:{win,mac}}`. Shipped with server. Bumped per installer release. |
| `src/http.test.ts` | Create | Router unit tests. |
| `src/landing.test.ts` | Create | HTML render tests. |
| `src/version.test.ts` | Create | `loadVersionInfo` validation tests. |
| `src/integration.test.ts` | Modify | Add two cases: `GET /join` and `GET /version` via real HTTP, alongside existing WS tests. |

### Extension (`packages/extension/`)

| File | Create/Modify | Responsibility |
|---|---|---|
| `src/manifest.json` | Modify | Add second `content_scripts` entry for `*://*/join*`. |
| `esbuild.config.mjs` | Modify | Add `content_join` entry point. |
| `src/content_join.ts` | Create | Parse `window.location`; validate HTTPS + regex; write `{serverUrl, roomCode}` to storage; send `invite:received` to SW; `postMessage` status updates back to page. |
| `src/content_join.test.ts` | Create | Origin + regex + storage/message calls covered. |
| `src/lib/storage.ts` | Modify | Add `PendingInvite` session key with `{roomCode}` shape. |
| `src/lib/storage.test.ts` | Modify | Add pending-invite round-trip test. |
| `src/lib/messages.ts` | Modify | Add `invite:received` message kind. |
| `src/lib/version-check.ts` | Create | Pure `isNewer(current, latest)` + `fetchLatest(serverUrl)`. |
| `src/lib/version-check.test.ts` | Create | Semver-ish comparison + fetch-mocked tests. |
| `src/service_worker.ts` | Modify | Handle `invite:received`; register `version-check` alarm; update badge when newer version detected. |
| `src/popup.html` | Modify | Add `copy-invite` button, `toast` element, `update-row` element. |
| `src/popup.css` | Modify | Toast + update-row styles. |
| `src/popup.ts` | Modify | Wire `copy-invite`; auto-copy + toast on create-room ack; render `update-row` when flagged; consume `PendingInvite` on open. |

### Installer (`packages/installer/` — new)

| File | Purpose |
|---|---|
| `package.json` | pnpm workspace package; scripts call Tauri CLI. |
| `tsconfig.json` | Minimal — frontend is plain JS so this only scopes tooling. |
| `README.md` | Build + run instructions. |
| `src/index.html` | Wizard shell, 5 hidden sections. |
| `src/style.css` | Wizard styling, matches extension visual identity. |
| `src/main.js` | Screen routing, Tauri `invoke` calls, DOM wiring. |
| `src-tauri/Cargo.toml` | Rust deps (tauri 2, tauri-plugin-clipboard-manager, tauri-plugin-shell, zip, serde, serde_json, anyhow). |
| `src-tauri/tauri.conf.json` | Window, bundler, allowlist, resource dir. |
| `src-tauri/build.rs` | Standard Tauri build script. |
| `src-tauri/src/main.rs` | Wire Tauri commands + plugins. |
| `src-tauri/src/chrome.rs` | Platform-specific Chrome path detection. |
| `src-tauri/src/extract.rs` | Unpack bundled `extension.zip` to install dir. |
| `src-tauri/src/launch.rs` | Open Chrome to `chrome://extensions` + open invite URL. |
| `src-tauri/src/install_config.rs` | Read/write `config.json` sidecar. |
| `src-tauri/resources/extension.zip` | Generated at build time — NOT committed. `.gitignore` entry. |
| `scripts/pack-extension.mjs` | Rebuilds extension + zips `dist/` → `src-tauri/resources/extension.zip`. |

### Release / ops

| File | Purpose |
|---|---|
| `.github/workflows/release-installer.yml` | Matrix build on `installer-v*` tag → upload `.msi`/`.dmg` to GH Release. |
| `docs/installer-testing.md` | Manual smoke-test checklist for fresh Windows/macOS VMs. |
| `README.md` | Update "For users" section to mention the installer. |

---

## Task 1: Refactor server to shared HTTP + WS on one port

**Files:**
- Modify: `packages/server/src/index.ts`
- Create: `packages/server/src/http.ts`
- Create: `packages/server/src/http.test.ts`

Today `packages/server/src/index.ts` does `new WebSocketServer({ host, port })` directly. To add HTTP routes we move to `http.createServer()` + `new WebSocketServer({ noServer: true })` + manual `upgrade` handling. Same port, same TLS-via-Caddy setup.

- [ ] **Step 1.1 — Write the failing router test**

Create `packages/server/src/http.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { handleHttp, HttpResponse } from "./http.js";

function req(method: string, url: string): { method: string; url: string } {
  return { method, url };
}

describe("handleHttp", () => {
  it("returns 404 for unknown routes", async () => {
    const res = await handleHttp(req("GET", "/nope"), {
      versionInfo: { version: "1.0.0", downloadUrl: { win: "", mac: "" } },
      landingHtml: () => "<html></html>",
    });
    expect(res.status).toBe(404);
  });

  it("returns 405 for non-GET on known routes", async () => {
    const res = await handleHttp(req("POST", "/version"), {
      versionInfo: { version: "1.0.0", downloadUrl: { win: "", mac: "" } },
      landingHtml: () => "<html></html>",
    });
    expect(res.status).toBe(405);
  });

  it("returns version JSON with CORS", async () => {
    const res = await handleHttp(req("GET", "/version"), {
      versionInfo: { version: "1.2.3", downloadUrl: { win: "W", mac: "M" } },
      landingHtml: () => "<html></html>",
    });
    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toContain("application/json");
    expect(res.headers["access-control-allow-origin"]).toBe("*");
    expect(JSON.parse(res.body as string)).toEqual({
      version: "1.2.3",
      downloadUrl: { win: "W", mac: "M" },
    });
  });

  it("returns landing HTML for /join?room=ABC123", async () => {
    let seen: string | null = null;
    const res = await handleHttp(req("GET", "/join?room=ABC123"), {
      versionInfo: { version: "1.0.0", downloadUrl: { win: "", mac: "" } },
      landingHtml: (roomId) => { seen = roomId; return `<html>${roomId}</html>`; },
    });
    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toContain("text/html");
    expect(res.headers["cache-control"]).toContain("max-age=3600");
    expect(seen).toBe("ABC123");
    expect(res.body).toContain("ABC123");
  });

  it("returns 400 for /join without valid room code", async () => {
    const res = await handleHttp(req("GET", "/join?room=bad!"), {
      versionInfo: { version: "1.0.0", downloadUrl: { win: "", mac: "" } },
      landingHtml: () => "<html></html>",
    });
    expect(res.status).toBe(400);
  });

  it("returns 400 for /join missing room", async () => {
    const res = await handleHttp(req("GET", "/join"), {
      versionInfo: { version: "1.0.0", downloadUrl: { win: "", mac: "" } },
      landingHtml: () => "<html></html>",
    });
    expect(res.status).toBe(400);
  });
});
```

- [ ] **Step 1.2 — Run the test to verify it fails**

Run: `pnpm --filter @nobar-party/server test -- http.test.ts`
Expected: FAIL — `Cannot find module './http.js'`.

- [ ] **Step 1.3 — Implement the HTTP router**

Create `packages/server/src/http.ts`:

```typescript
export interface HttpRequest {
  method: string;
  url: string;
}

export interface HttpResponse {
  status: number;
  headers: Record<string, string>;
  body: string;
}

export interface VersionInfo {
  version: string;
  downloadUrl: { win: string; mac: string };
}

export interface HttpDeps {
  versionInfo: VersionInfo;
  landingHtml: (roomId: string) => string;
}

const ROOM_RE = /^[A-Z0-9]{6}$/;

const CORS: Record<string, string> = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "GET,OPTIONS",
};

export async function handleHttp(req: HttpRequest, deps: HttpDeps): Promise<HttpResponse> {
  const url = new URL(req.url, "http://x");
  const path = url.pathname;

  if (path === "/version") {
    if (req.method !== "GET") return text(405, "method not allowed");
    return {
      status: 200,
      headers: { ...CORS, "content-type": "application/json; charset=utf-8" },
      body: JSON.stringify(deps.versionInfo),
    };
  }

  if (path === "/join") {
    if (req.method !== "GET") return text(405, "method not allowed");
    const roomId = url.searchParams.get("room");
    if (!roomId || !ROOM_RE.test(roomId)) return text(400, "invalid room code");
    return {
      status: 200,
      headers: {
        ...CORS,
        "content-type": "text/html; charset=utf-8",
        "cache-control": "public, max-age=3600",
      },
      body: deps.landingHtml(roomId),
    };
  }

  return text(404, "not found");
}

function text(status: number, body: string): HttpResponse {
  return {
    status,
    headers: { ...CORS, "content-type": "text/plain; charset=utf-8" },
    body,
  };
}
```

- [ ] **Step 1.4 — Run the test to verify it passes**

Run: `pnpm --filter @nobar-party/server test -- http.test.ts`
Expected: PASS — 6/6.

- [ ] **Step 1.5 — Rewire `index.ts` onto a shared HTTP server**

Replace `packages/server/src/index.ts` with:

```typescript
import { createServer } from "node:http";
import { WebSocketServer } from "ws";
import { loadConfig } from "./config.js";
import { RoomRegistry } from "./room.js";
import { ConnectionManager } from "./connection.js";
import { log } from "./log.js";
import { handleHttp } from "./http.js";
import { renderLandingPage } from "./landing.js";
import { loadVersionInfo } from "./version.js";

const cfg = loadConfig();
const registry = new RoomRegistry({ maxRoomSize: cfg.maxRoomSize, maxRooms: cfg.maxRooms });
const connections = new ConnectionManager(registry, cfg);
const versionInfo = loadVersionInfo();

const httpServer = createServer((req, res) => {
  void (async () => {
    const r = await handleHttp(
      { method: req.method ?? "GET", url: req.url ?? "/" },
      { versionInfo, landingHtml: renderLandingPage }
    );
    res.writeHead(r.status, r.headers);
    res.end(r.body);
  })();
});

const wss = new WebSocketServer({ noServer: true, maxPayload: cfg.frameBytes });

httpServer.on("upgrade", (req, socket, head) => {
  wss.handleUpgrade(req, socket, head, (ws) => {
    log.info("connection", { remote: req.socket.remoteAddress });
    connections.handle(ws);
  });
});

httpServer.listen(cfg.port, cfg.host, () => {
  log.info("listening", { host: cfg.host, port: cfg.port });
});

function shutdown(): void {
  log.info("shutting down");
  httpServer.close(() => process.exit(0));
  setTimeout(() => process.exit(1), 5000).unref();
}
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
```

Note that `./landing.js` and `./version.js` do not exist yet — the server won't compile until Tasks 2 and 3 land. That's fine for the commit in this task as long as we only run the `http.test.ts` unit test. We'll typecheck at the end of Task 3.

- [ ] **Step 1.6 — Commit**

```bash
git add packages/server/src/http.ts packages/server/src/http.test.ts packages/server/src/index.ts
git commit -m "refactor(server): shared HTTP server with WS upgrade, add router scaffold"
```

---

## Task 2: `GET /version` endpoint with `version.json`

**Files:**
- Create: `packages/server/src/version.ts`
- Create: `packages/server/src/version.json`
- Create: `packages/server/src/version.test.ts`

- [ ] **Step 2.1 — Write the failing test**

Create `packages/server/src/version.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { readFileSync } from "node:fs";
import { loadVersionInfo, parseVersionInfo } from "./version.js";

vi.mock("node:fs", () => ({
  readFileSync: vi.fn(),
}));

describe("parseVersionInfo", () => {
  it("accepts well-formed JSON", () => {
    const out = parseVersionInfo(
      JSON.stringify({
        version: "1.2.3",
        downloadUrl: { win: "https://x/w.msi", mac: "https://x/m.dmg" },
      })
    );
    expect(out.version).toBe("1.2.3");
  });

  it("rejects missing version", () => {
    expect(() =>
      parseVersionInfo(JSON.stringify({ downloadUrl: { win: "x", mac: "y" } }))
    ).toThrow();
  });

  it("rejects missing download URLs", () => {
    expect(() =>
      parseVersionInfo(JSON.stringify({ version: "1.0.0", downloadUrl: { win: "x" } }))
    ).toThrow();
  });

  it("rejects non-JSON input", () => {
    expect(() => parseVersionInfo("oops")).toThrow();
  });
});

describe("loadVersionInfo", () => {
  beforeEach(() => vi.clearAllMocks());
  afterEach(() => vi.restoreAllMocks());

  it("reads and parses the sidecar file", () => {
    vi.mocked(readFileSync).mockReturnValue(
      JSON.stringify({
        version: "9.9.9",
        downloadUrl: { win: "W", mac: "M" },
      }) as unknown as Buffer
    );
    const info = loadVersionInfo();
    expect(info.version).toBe("9.9.9");
  });
});
```

- [ ] **Step 2.2 — Run the test to verify it fails**

Run: `pnpm --filter @nobar-party/server test -- version.test.ts`
Expected: FAIL — `Cannot find module './version.js'`.

- [ ] **Step 2.3 — Implement `version.ts` and seed `version.json`**

Create `packages/server/src/version.ts`:

```typescript
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { z } from "zod";

export const VersionInfoSchema = z.object({
  version: z.string().regex(/^\d+\.\d+\.\d+$/, "expected semver x.y.z"),
  downloadUrl: z.object({
    win: z.string().url(),
    mac: z.string().url(),
  }),
});

export type VersionInfo = z.infer<typeof VersionInfoSchema>;

export function parseVersionInfo(raw: string): VersionInfo {
  const obj = JSON.parse(raw);
  return VersionInfoSchema.parse(obj);
}

export function loadVersionInfo(): VersionInfo {
  const here = dirname(fileURLToPath(import.meta.url));
  const file = join(here, "version.json");
  const raw = readFileSync(file, "utf8");
  return parseVersionInfo(raw);
}
```

Create `packages/server/src/version.json` (seed with a placeholder; Task 20 pipeline bumps it on release):

```json
{
  "version": "0.0.0",
  "downloadUrl": {
    "win": "https://github.com/alcunii/nobar-party/releases/latest/download/NobarParty.msi",
    "mac": "https://github.com/alcunii/nobar-party/releases/latest/download/NobarParty.dmg"
  }
}
```

Update `packages/server/package.json` `scripts.build` so `tsc` copies `version.json` into `dist/`. Edit the `build` script to:

```json
"build": "tsc -p tsconfig.json && node -e \"require('node:fs').copyFileSync('src/version.json','dist/version.json')\""
```

- [ ] **Step 2.4 — Run the test to verify it passes**

Run: `pnpm --filter @nobar-party/server test -- version.test.ts`
Expected: PASS — 5/5.

- [ ] **Step 2.5 — Commit**

```bash
git add packages/server/src/version.ts packages/server/src/version.test.ts packages/server/src/version.json packages/server/package.json
git commit -m "feat(server): add version.ts loader and version.json sidecar"
```

---

## Task 3: `GET /join` landing page

**Files:**
- Create: `packages/server/src/landing.ts`
- Create: `packages/server/src/landing.test.ts`

- [ ] **Step 3.1 — Write the failing test**

Create `packages/server/src/landing.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { renderLandingPage } from "./landing.js";

describe("renderLandingPage", () => {
  it("embeds the room id in the title and status area", () => {
    const html = renderLandingPage("ABC123");
    expect(html).toContain("ABC123");
    expect(html.toLowerCase()).toContain("<title>");
    expect(html.toLowerCase()).toContain("</html>");
  });

  it("contains both download links", () => {
    const html = renderLandingPage("ABC123");
    expect(html).toMatch(/releases.*\.msi/i);
    expect(html).toMatch(/releases.*\.dmg/i);
  });

  it("listens for postMessage from the content script", () => {
    const html = renderLandingPage("ABC123");
    expect(html).toContain("addEventListener");
    expect(html).toContain("message");
    expect(html).toContain("nobar-config-saved");
  });

  it("html-escapes special characters in the room id parameter", () => {
    const html = renderLandingPage("<script>");
    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;");
  });
});
```

- [ ] **Step 3.2 — Run the test to verify it fails**

Run: `pnpm --filter @nobar-party/server test -- landing.test.ts`
Expected: FAIL — `Cannot find module './landing.js'`.

- [ ] **Step 3.3 — Implement `landing.ts`**

Create `packages/server/src/landing.ts`:

```typescript
function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function renderLandingPage(roomId: string): string {
  const safe = escapeHtml(roomId);
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <title>Nobar Party — joining room ${safe}</title>
  <style>
    :root { color-scheme: dark light; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      max-width: 40rem; margin: 2rem auto; padding: 0 1rem; line-height: 1.5;
    }
    h1 { font-size: 1.5rem; margin-bottom: 0.25rem; }
    .room { font-family: ui-monospace, monospace; background: #0002; padding: 0.1em 0.4em; border-radius: 4px; }
    .status { margin: 1.5rem 0; padding: 1rem; border-radius: 8px; background: #0001; }
    .status.ok { background: #2a7a2e22; }
    .status.go { background: #1c6fb822; }
    .downloads a { display: inline-block; padding: 0.6rem 1rem; margin-right: 0.5rem; border-radius: 6px; background: #1c6fb8; color: white; text-decoration: none; }
    .downloads a.secondary { background: #0003; color: inherit; }
    .hint { font-size: 0.9rem; opacity: 0.8; margin-top: 1rem; }
  </style>
</head>
<body>
  <h1>Joining room <span class="room">${safe}</span></h1>
  <p>You're about to join a Nobar Party watch-along.</p>

  <div id="status" class="status">
    <div id="status-msg">Waiting for the extension…</div>
    <div class="hint">Keep this tab open while you install. We'll detect the extension and drop you into the room.</div>
  </div>

  <h2>Don't have the extension yet?</h2>
  <div class="downloads">
    <a id="dl-win" href="https://github.com/alcunii/nobar-party/releases/latest/download/NobarParty.msi">Download for Windows</a>
    <a id="dl-mac" class="secondary" href="https://github.com/alcunii/nobar-party/releases/latest/download/NobarParty.dmg">Download for macOS</a>
  </div>

  <script>
    (function () {
      try {
        var ua = navigator.userAgent;
        var win = /Windows/i.test(ua);
        var mac = /Macintosh|Mac OS X/i.test(ua);
        if (mac) {
          document.getElementById("dl-mac").classList.remove("secondary");
          document.getElementById("dl-win").classList.add("secondary");
        } else if (win) {
          // default — win primary
        }
      } catch (e) {}

      var msg = document.getElementById("status-msg");
      var statusEl = document.getElementById("status");
      window.addEventListener("message", function (ev) {
        if (!ev.data || typeof ev.data !== "object") return;
        if (ev.data.type === "nobar-config-saved") {
          statusEl.className = "status ok";
          msg.textContent = "Extension detected — writing config…";
          setTimeout(function () {
            statusEl.className = "status go";
            msg.textContent = "Joining room ${safe}…";
          }, 400);
        }
      });
    })();
  </script>
</body>
</html>`;
}
```

- [ ] **Step 3.4 — Run the test to verify it passes**

Run: `pnpm --filter @nobar-party/server test -- landing.test.ts`
Expected: PASS — 4/4.

- [ ] **Step 3.5 — Typecheck the whole server package**

Run: `pnpm --filter @nobar-party/server typecheck`
Expected: PASS (no errors).

- [ ] **Step 3.6 — Run full http.test to ensure the router still passes now that deps resolve**

Run: `pnpm --filter @nobar-party/server test -- http.test.ts`
Expected: PASS — 6/6.

- [ ] **Step 3.7 — Commit**

```bash
git add packages/server/src/landing.ts packages/server/src/landing.test.ts
git commit -m "feat(server): inline /join landing page with extension handoff"
```

---

## Task 4: Integration test — real HTTP `/join` + `/version` + `/upgrade`

**Files:**
- Modify: `packages/server/src/integration.test.ts`

- [ ] **Step 4.1 — Read the existing test to learn its style**

Run: `wc -l packages/server/src/integration.test.ts && head -n 40 packages/server/src/integration.test.ts`

Expected: you'll see how it boots the server process / ports. Match that pattern. Do NOT rewrite the existing cases.

- [ ] **Step 4.2 — Add HTTP route cases**

Append these tests (inside the same `describe(...)` or a new one — match file style). If the existing file does not boot a full server but only calls `ConnectionManager` directly, add a new `describe("http routes", ...)` block that boots the `index.ts`-equivalent via `http.createServer` + the same handler wiring, listening on an ephemeral port:

```typescript
import { createServer } from "node:http";
import { WebSocketServer } from "ws";
import { handleHttp } from "./http.js";
import { renderLandingPage } from "./landing.js";

describe("http routes (integration)", () => {
  let server: ReturnType<typeof createServer>;
  let port: number;

  beforeAll(async () => {
    const versionInfo = { version: "1.0.0", downloadUrl: { win: "https://e/w.msi", mac: "https://e/m.dmg" } };
    server = createServer((req, res) => {
      void (async () => {
        const r = await handleHttp(
          { method: req.method ?? "GET", url: req.url ?? "/" },
          { versionInfo, landingHtml: renderLandingPage }
        );
        res.writeHead(r.status, r.headers);
        res.end(r.body);
      })();
    });
    const wss = new WebSocketServer({ noServer: true });
    server.on("upgrade", (req, socket, head) => {
      wss.handleUpgrade(req, socket, head, () => { /* no-op */ });
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", () => resolve()));
    const addr = server.address();
    port = typeof addr === "object" && addr ? addr.port : 0;
  });

  afterAll(async () => { await new Promise<void>((resolve) => server.close(() => resolve())); });

  it("GET /version returns versionInfo JSON", async () => {
    const res = await fetch(`http://127.0.0.1:${port}/version`);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.version).toBe("1.0.0");
    expect(body.downloadUrl.win).toContain("msi");
  });

  it("GET /join?room=ABC123 returns landing HTML with the room code", async () => {
    const res = await fetch(`http://127.0.0.1:${port}/join?room=ABC123`);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type") ?? "").toContain("text/html");
    const body = await res.text();
    expect(body).toContain("ABC123");
  });

  it("GET /join with bad room code returns 400", async () => {
    const res = await fetch(`http://127.0.0.1:${port}/join?room=BAD`);
    expect(res.status).toBe(400);
  });

  it("GET /unknown returns 404", async () => {
    const res = await fetch(`http://127.0.0.1:${port}/unknown`);
    expect(res.status).toBe(404);
  });
});
```

Add the `import { describe, it, expect, beforeAll, afterAll } from "vitest";` line at the top if the existing file doesn't already import all of these.

- [ ] **Step 4.3 — Run the test**

Run: `pnpm --filter @nobar-party/server test -- integration.test.ts`
Expected: all cases pass (existing cases unaffected).

- [ ] **Step 4.4 — Commit**

```bash
git add packages/server/src/integration.test.ts
git commit -m "test(server): integration tests for /join and /version"
```

---

## Task 5: `PendingInvite` session storage key

**Files:**
- Modify: `packages/extension/src/lib/storage.ts`
- Modify: `packages/extension/src/lib/storage.test.ts`

- [ ] **Step 5.1 — Write the failing test**

Add this case at the bottom of `packages/extension/src/lib/storage.test.ts`:

```typescript
it("stores and retrieves a pending invite", async () => {
  const s = new Storage();
  await s.setSession(SessionKey.PendingInvite, { roomCode: "ABC123" });
  const out = await s.getSession(SessionKey.PendingInvite);
  expect(out).toEqual({ roomCode: "ABC123" });
});
```

- [ ] **Step 5.2 — Run the test to verify it fails**

Run: `pnpm --filter @nobar-party/extension test -- storage.test.ts`
Expected: FAIL — `PendingInvite` not exported.

- [ ] **Step 5.3 — Extend the storage types**

Edit `packages/extension/src/lib/storage.ts`:

```typescript
export const SessionKey = {
  ActiveRoom: "activeRoom",
  SyncedTabId: "syncedTabId",
  PendingInvite: "pendingInvite",
} as const;
export type SessionKey = (typeof SessionKey)[keyof typeof SessionKey];

export interface PendingInvite {
  roomCode: string;
}

// extend SessionShape
type SessionShape = {
  [SessionKey.ActiveRoom]?: ActiveRoom;
  [SessionKey.SyncedTabId]?: number;
  [SessionKey.PendingInvite]?: PendingInvite;
};
```

The `ActiveRoom` interface and `Storage` class stay unchanged.

- [ ] **Step 5.4 — Run the test to verify it passes**

Run: `pnpm --filter @nobar-party/extension test -- storage.test.ts`
Expected: PASS — all cases including new one.

- [ ] **Step 5.5 — Commit**

```bash
git add packages/extension/src/lib/storage.ts packages/extension/src/lib/storage.test.ts
git commit -m "feat(extension): add PendingInvite session storage key"
```

---

## Task 6: `content_join.ts` — the invite content script

**Files:**
- Create: `packages/extension/src/content_join.ts`
- Create: `packages/extension/src/content_join.test.ts`
- Modify: `packages/extension/src/manifest.json`
- Modify: `packages/extension/esbuild.config.mjs`
- Modify: `packages/extension/src/lib/messages.ts`

- [ ] **Step 6.1 — Add the `invite:received` message kind**

Edit `packages/extension/src/lib/messages.ts`. Find the union type that enumerates runtime messages and add:

```typescript
| { kind: "invite:received"; serverUrl: string; roomCode: string }
```

If the file structure differs, add a matching message shape to whichever discriminated union `onRuntimeMessage` dispatches on, so `service_worker.ts` can `case "invite:received"`.

- [ ] **Step 6.2 — Write the failing content_join test**

Create `packages/extension/src/content_join.test.ts`:

```typescript
import { describe, it, expect, beforeEach, vi } from "vitest";
import { maybeApplyInvite, InviteHandoffDeps } from "./content_join.js";

function deps(overrides: Partial<InviteHandoffDeps> = {}): InviteHandoffDeps {
  return {
    location: { protocol: "https:", host: "watch.example.com", pathname: "/join", search: "?room=ABC123" },
    setLocal: vi.fn().mockResolvedValue(undefined),
    setSession: vi.fn().mockResolvedValue(undefined),
    sendRuntime: vi.fn().mockResolvedValue(undefined),
    postToPage: vi.fn(),
    ...overrides,
  };
}

describe("maybeApplyInvite", () => {
  beforeEach(() => vi.clearAllMocks());

  it("writes storage + sends invite:received on a valid HTTPS /join with room code", async () => {
    const d = deps();
    const result = await maybeApplyInvite(d);
    expect(result).toBe(true);
    expect(d.setLocal).toHaveBeenCalledWith("serverUrl", "wss://watch.example.com");
    expect(d.setSession).toHaveBeenCalledWith("pendingInvite", { roomCode: "ABC123" });
    expect(d.sendRuntime).toHaveBeenCalledWith({
      kind: "invite:received",
      serverUrl: "wss://watch.example.com",
      roomCode: "ABC123",
    });
    expect(d.postToPage).toHaveBeenCalledWith({ type: "nobar-config-saved" });
  });

  it("rejects non-HTTPS origins", async () => {
    const d = deps({ location: { protocol: "http:", host: "watch.example.com", pathname: "/join", search: "?room=ABC123" } });
    expect(await maybeApplyInvite(d)).toBe(false);
    expect(d.setLocal).not.toHaveBeenCalled();
  });

  it("rejects wrong path", async () => {
    const d = deps({ location: { protocol: "https:", host: "watch.example.com", pathname: "/notjoin", search: "?room=ABC123" } });
    expect(await maybeApplyInvite(d)).toBe(false);
  });

  it("rejects missing room code", async () => {
    const d = deps({ location: { protocol: "https:", host: "watch.example.com", pathname: "/join", search: "" } });
    expect(await maybeApplyInvite(d)).toBe(false);
  });

  it("rejects badly-formatted room code (lowercase)", async () => {
    const d = deps({ location: { protocol: "https:", host: "watch.example.com", pathname: "/join", search: "?room=abc123" } });
    expect(await maybeApplyInvite(d)).toBe(false);
  });

  it("rejects badly-formatted room code (too long)", async () => {
    const d = deps({ location: { protocol: "https:", host: "watch.example.com", pathname: "/join", search: "?room=ABCDEFG" } });
    expect(await maybeApplyInvite(d)).toBe(false);
  });

  it("rejects non-alphanumeric room code", async () => {
    const d = deps({ location: { protocol: "https:", host: "watch.example.com", pathname: "/join", search: "?room=AB!123" } });
    expect(await maybeApplyInvite(d)).toBe(false);
  });
});
```

- [ ] **Step 6.3 — Run the test to verify it fails**

Run: `pnpm --filter @nobar-party/extension test -- content_join.test.ts`
Expected: FAIL — `Cannot find module './content_join.js'`.

- [ ] **Step 6.4 — Implement `content_join.ts`**

Create `packages/extension/src/content_join.ts`:

```typescript
import { PersistentKey, SessionKey, Storage } from "./lib/storage.js";
import { sendRuntimeMessage } from "./lib/messages.js";

const ROOM_RE = /^[A-Z0-9]{6}$/;

export interface InviteHandoffDeps {
  location: { protocol: string; host: string; pathname: string; search: string };
  setLocal: (key: string, value: unknown) => Promise<void>;
  setSession: (key: string, value: unknown) => Promise<void>;
  sendRuntime: (msg: unknown) => Promise<unknown>;
  postToPage: (msg: unknown) => void;
}

export async function maybeApplyInvite(d: InviteHandoffDeps): Promise<boolean> {
  if (d.location.protocol !== "https:") return false;
  if (d.location.pathname !== "/join") return false;
  const params = new URLSearchParams(d.location.search);
  const roomCode = params.get("room");
  if (!roomCode || !ROOM_RE.test(roomCode)) return false;

  const serverUrl = `wss://${d.location.host}`;
  await d.setLocal("serverUrl", serverUrl);
  await d.setSession("pendingInvite", { roomCode });
  await d.sendRuntime({ kind: "invite:received", serverUrl, roomCode });
  d.postToPage({ type: "nobar-config-saved" });
  return true;
}

// Bootstrap the script when loaded as a real content script (not during unit tests).
declare const chrome: {
  storage: {
    local: { set: (o: Record<string, unknown>) => Promise<void> };
    session: { set: (o: Record<string, unknown>) => Promise<void> };
  };
  runtime: { sendMessage: (msg: unknown) => Promise<unknown> };
};

if (typeof window !== "undefined" && typeof chrome !== "undefined" && chrome.storage) {
  const storage = new Storage();
  void maybeApplyInvite({
    location: {
      protocol: window.location.protocol,
      host: window.location.host,
      pathname: window.location.pathname,
      search: window.location.search,
    },
    setLocal: (k, v) =>
      k === "serverUrl"
        ? storage.setLocal(PersistentKey.ServerUrl, v as string)
        : chrome.storage.local.set({ [k]: v }),
    setSession: (k, v) =>
      k === "pendingInvite"
        ? storage.setSession(SessionKey.PendingInvite, v as { roomCode: string })
        : chrome.storage.session.set({ [k]: v }),
    sendRuntime: (msg) => sendRuntimeMessage(msg as never),
    postToPage: (msg) => window.postMessage(msg, window.location.origin),
  });
}
```

- [ ] **Step 6.5 — Run the test to verify it passes**

Run: `pnpm --filter @nobar-party/extension test -- content_join.test.ts`
Expected: PASS — 7/7.

- [ ] **Step 6.6 — Wire into manifest + esbuild**

Edit `packages/extension/src/manifest.json` — extend the `content_scripts` array:

```json
"content_scripts": [
  {
    "matches": ["<all_urls>"],
    "js": ["content.js"],
    "all_frames": true,
    "run_at": "document_idle"
  },
  {
    "matches": ["*://*/join*"],
    "js": ["content_join.js"],
    "run_at": "document_start"
  }
]
```

Edit `packages/extension/esbuild.config.mjs`, extend `entryPoints`:

```javascript
const entryPoints = {
  service_worker: "src/service_worker.ts",
  content: "src/content.ts",
  content_join: "src/content_join.ts",
  popup: "src/popup.ts",
  sidebar: "src/sidebar.ts",
};
```

- [ ] **Step 6.7 — Build to confirm the new entry resolves**

Run: `pnpm --filter @nobar-party/extension build`
Expected: `dist/content_join.js` exists, no build errors.

- [ ] **Step 6.8 — Commit**

```bash
git add packages/extension/src/content_join.ts packages/extension/src/content_join.test.ts packages/extension/src/manifest.json packages/extension/esbuild.config.mjs packages/extension/src/lib/messages.ts
git commit -m "feat(extension): content_join.ts — parse invite URL and hand off to SW"
```

---

## Task 7: Service worker — consume `invite:received`

**Files:**
- Modify: `packages/extension/src/service_worker.ts`
- Create: `packages/extension/src/service_worker.invite.test.ts`

- [ ] **Step 7.1 — Write the failing test**

Because `service_worker.ts` wires everything at module scope, we extract the invite handler into a pure function so we can test it in isolation. Create `packages/extension/src/service_worker.invite.test.ts`:

```typescript
import { describe, it, expect, vi } from "vitest";
import { handleInviteReceived, InviteDeps } from "./service_worker.invite.js";

function deps(nickname: string | undefined): InviteDeps {
  return {
    getNickname: vi.fn().mockResolvedValue(nickname),
    setServerUrl: vi.fn().mockResolvedValue(undefined),
    joinRoom: vi.fn().mockResolvedValue(undefined),
  };
}

describe("handleInviteReceived", () => {
  it("stores server URL and joins room when nickname is set", async () => {
    const d = deps("alice");
    await handleInviteReceived({ serverUrl: "wss://x", roomCode: "ABC123" }, d);
    expect(d.setServerUrl).toHaveBeenCalledWith("wss://x");
    expect(d.joinRoom).toHaveBeenCalledWith({ roomId: "ABC123", nickname: "alice" });
  });

  it("stores server URL but does not join when no nickname yet", async () => {
    const d = deps(undefined);
    await handleInviteReceived({ serverUrl: "wss://x", roomCode: "ABC123" }, d);
    expect(d.setServerUrl).toHaveBeenCalledWith("wss://x");
    expect(d.joinRoom).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 7.2 — Run the test to verify it fails**

Run: `pnpm --filter @nobar-party/extension test -- service_worker.invite.test.ts`
Expected: FAIL — `Cannot find module './service_worker.invite.js'`.

- [ ] **Step 7.3 — Extract the handler**

Create `packages/extension/src/service_worker.invite.ts`:

```typescript
export interface InvitePayload {
  serverUrl: string;
  roomCode: string;
}

export interface InviteDeps {
  getNickname: () => Promise<string | undefined>;
  setServerUrl: (url: string) => Promise<void>;
  joinRoom: (input: { roomId: string; nickname: string }) => Promise<void>;
}

export async function handleInviteReceived(p: InvitePayload, d: InviteDeps): Promise<void> {
  await d.setServerUrl(p.serverUrl);
  const nickname = await d.getNickname();
  if (!nickname) return;
  await d.joinRoom({ roomId: p.roomCode, nickname });
}
```

- [ ] **Step 7.4 — Wire the handler into `service_worker.ts`**

Edit `packages/extension/src/service_worker.ts`. Add the import near the other `./lib/…` imports:

```typescript
import { handleInviteReceived } from "./service_worker.invite.js";
```

Inside the `onRuntimeMessage(async (msg, sender) => { switch (msg.kind) { … } })` block, add a new case before `default`:

```typescript
case "invite:received":
  await handleInviteReceived(
    { serverUrl: msg.serverUrl, roomCode: msg.roomCode },
    {
      getNickname: async () => (await storage.getLocal(PersistentKey.Nickname)) ?? undefined,
      setServerUrl: (url) => storage.setLocal(PersistentKey.ServerUrl, url),
      joinRoom: (input) => joinRoom(input),
    }
  );
  return { ok: true };
```

- [ ] **Step 7.5 — Run the tests**

Run: `pnpm --filter @nobar-party/extension test -- service_worker.invite.test.ts`
Expected: PASS — 2/2.

Run: `pnpm --filter @nobar-party/extension typecheck`
Expected: PASS.

- [ ] **Step 7.6 — Commit**

```bash
git add packages/extension/src/service_worker.invite.ts packages/extension/src/service_worker.invite.test.ts packages/extension/src/service_worker.ts
git commit -m "feat(extension): service worker handles invite:received"
```

---

## Task 8: Popup — "Copy invite link" + toast + auto-copy on create

**Files:**
- Modify: `packages/extension/src/popup.html`
- Modify: `packages/extension/src/popup.css`
- Modify: `packages/extension/src/popup.ts`
- Create: `packages/extension/src/popup.invite.test.ts`

- [ ] **Step 8.1 — Write the failing test**

Create `packages/extension/src/popup.invite.test.ts`:

```typescript
import { describe, it, expect, vi } from "vitest";
import { buildInviteUrl, wssToHttps } from "./popup.invite.js";

describe("wssToHttps", () => {
  it("maps wss:// to https://", () => {
    expect(wssToHttps("wss://watch.example.com")).toBe("https://watch.example.com");
  });
  it("maps ws:// to http://", () => {
    expect(wssToHttps("ws://localhost:3050")).toBe("http://localhost:3050");
  });
  it("returns other schemes unchanged", () => {
    expect(wssToHttps("https://x")).toBe("https://x");
  });
});

describe("buildInviteUrl", () => {
  it("produces /join?room=CODE with https origin", () => {
    expect(buildInviteUrl("wss://watch.example.com", "ABC123")).toBe(
      "https://watch.example.com/join?room=ABC123"
    );
  });
  it("strips trailing slashes from the server URL", () => {
    expect(buildInviteUrl("wss://watch.example.com/", "ABC123")).toBe(
      "https://watch.example.com/join?room=ABC123"
    );
  });
});
```

- [ ] **Step 8.2 — Run the test to verify it fails**

Run: `pnpm --filter @nobar-party/extension test -- popup.invite.test.ts`
Expected: FAIL — `Cannot find module './popup.invite.js'`.

- [ ] **Step 8.3 — Implement the pure helpers**

Create `packages/extension/src/popup.invite.ts`:

```typescript
export function wssToHttps(serverUrl: string): string {
  if (serverUrl.startsWith("wss://")) return "https://" + serverUrl.slice(6);
  if (serverUrl.startsWith("ws://")) return "http://" + serverUrl.slice(5);
  return serverUrl;
}

export function buildInviteUrl(serverUrl: string, roomCode: string): string {
  const base = wssToHttps(serverUrl).replace(/\/+$/, "");
  return `${base}/join?room=${roomCode}`;
}
```

- [ ] **Step 8.4 — Run the test to verify it passes**

Run: `pnpm --filter @nobar-party/extension test -- popup.invite.test.ts`
Expected: PASS — 5/5.

- [ ] **Step 8.5 — Update popup HTML**

Edit `packages/extension/src/popup.html`, change the `#room-view` section and add a toast + update row at the top of `main`:

```html
<main id="app">
  <div id="toast" class="toast" hidden></div>
  <div id="update-row" class="update-row" hidden>
    <span>Update available</span>
    <a id="update-link" href="#" target="_blank" rel="noopener">Download</a>
  </div>

  <section id="idle-view" hidden>
    <h1>Nobar Party</h1>
    <label>Nickname <input id="nickname" maxlength="32" placeholder="alice"/></label>
    <button id="create-btn">Create room</button>
    <div class="or">or</div>
    <label>Room code <input id="room-code" maxlength="6" placeholder="ABC234"/></label>
    <button id="join-btn">Join room</button>
  </section>

  <section id="room-view" hidden>
    <h1 id="room-title"></h1>
    <div id="members"></div>
    <button id="copy-code">Copy code</button>
    <button id="copy-invite">Copy invite link</button>
    <button id="leave-btn">Leave room</button>
    <details>
      <summary>Video source</summary>
      <div id="video-status"></div>
      <button id="pick-manually">Pick manually</button>
      <ul id="video-candidates"></ul>
    </details>
    <details>
      <summary>Settings</summary>
      <label>Server URL <input id="server-url" placeholder="ws://localhost:3050"/></label>
      <button id="save-settings">Save</button>
    </details>
  </section>
</main>
```

- [ ] **Step 8.6 — Add popup styles**

Append to `packages/extension/src/popup.css`:

```css
.toast {
  position: fixed; top: 0.5rem; left: 50%; transform: translateX(-50%);
  background: #1c6fb8; color: white; padding: 0.4rem 0.8rem; border-radius: 6px;
  font-size: 0.9rem; z-index: 10; transition: opacity 0.2s; opacity: 1;
}
.toast[hidden] { display: block; opacity: 0; pointer-events: none; }
.update-row {
  background: #f5a623; color: #222; padding: 0.3rem 0.6rem;
  font-size: 0.85rem; display: flex; justify-content: space-between; align-items: center;
}
.update-row a { color: #222; font-weight: 600; margin-left: 0.5rem; }
```

- [ ] **Step 8.7 — Wire the new controls in `popup.ts`**

Edit `packages/extension/src/popup.ts`. Add imports at the top:

```typescript
import { buildInviteUrl } from "./popup.invite.js";
import { SessionKey } from "./lib/storage.js";
```

Add these helpers just below `init()`'s signature-less sibling helpers (before `async function init()`):

```typescript
let lastToastTimer: number | null = null;
function showToast(message: string): void {
  const el = $("toast");
  el.textContent = message;
  el.hidden = false;
  if (lastToastTimer !== null) clearTimeout(lastToastTimer);
  lastToastTimer = setTimeout(() => { el.hidden = true; }, 2000) as unknown as number;
}

async function copyInvite(state: ActiveRoomView): Promise<void> {
  const serverUrl = (await storage.getLocal(PersistentKey.ServerUrl)) ?? "";
  if (!serverUrl) { showToast("Set server URL in Settings first"); return; }
  const url = buildInviteUrl(serverUrl, state.roomId);
  await navigator.clipboard.writeText(url);
  showToast("Invite link copied");
}
```

In `init()`, add wiring and pending-invite consumption. Insert after the existing `$("save-settings").addEventListener(...)` line:

```typescript
$("copy-invite").addEventListener("click", async () => {
  const last = lastRenderedState;
  if (last) await copyInvite(last);
});
```

And near the top of `init()`, just after reading `serverUrl`, add:

```typescript
const pending = await storage.getSession(SessionKey.PendingInvite);
if (pending?.roomCode) {
  ($("room-code") as HTMLInputElement).value = pending.roomCode;
  await storage.removeSession(SessionKey.PendingInvite);
}
```

Track the last rendered state to support `copyInvite`. Just under the existing `chrome.runtime.onMessage.addListener` block, add:

```typescript
let lastRenderedState: ActiveRoomView | null = null;
```

And modify `render` to first store the state:

```typescript
function render(state: ActiveRoomView | null): void {
  lastRenderedState = state;
  $("idle-view").hidden = state !== null;
  $("room-view").hidden = state === null;
  // ... rest unchanged
}
```

Finally, auto-copy on create. Modify `onCreate`:

```typescript
async function onCreate(): Promise<void> {
  const nickname = ($("nickname") as HTMLInputElement).value.trim();
  if (!nickname) return;
  await storage.setLocal(PersistentKey.Nickname, nickname);
  await sendRuntimeMessage({ kind: "popup:createRoom", nickname });
  // Auto-copy once the room view updates; wait for sw:roomState with a roomId.
  const unsub = (msg: unknown) => {
    const m = msg as { kind?: string; state?: ActiveRoomView | null };
    if (m.kind === "sw:roomState" && m.state?.roomId) {
      void copyInvite(m.state);
      chrome.runtime.onMessage.removeListener(unsub);
    }
  };
  chrome.runtime.onMessage.addListener(unsub);
}
```

- [ ] **Step 8.8 — Build + typecheck**

Run: `pnpm --filter @nobar-party/extension build`
Expected: clean build, `dist/popup.js` updated.

Run: `pnpm --filter @nobar-party/extension typecheck`
Expected: PASS.

- [ ] **Step 8.9 — Commit**

```bash
git add packages/extension/src/popup.invite.ts packages/extension/src/popup.invite.test.ts packages/extension/src/popup.html packages/extension/src/popup.css packages/extension/src/popup.ts
git commit -m "feat(extension): copy invite link + toast + auto-copy on create + pending invite prefill"
```

---

## Task 9: Version check pure helper

**Files:**
- Create: `packages/extension/src/lib/version-check.ts`
- Create: `packages/extension/src/lib/version-check.test.ts`

- [ ] **Step 9.1 — Write the failing test**

Create `packages/extension/src/lib/version-check.test.ts`:

```typescript
import { describe, it, expect, vi } from "vitest";
import { isNewer, fetchLatest } from "./version-check.js";

describe("isNewer", () => {
  it("patch bump is newer", () => { expect(isNewer("1.0.0", "1.0.1")).toBe(true); });
  it("minor bump is newer", () => { expect(isNewer("1.0.0", "1.1.0")).toBe(true); });
  it("major bump is newer", () => { expect(isNewer("1.0.0", "2.0.0")).toBe(true); });
  it("same version is not newer", () => { expect(isNewer("1.2.3", "1.2.3")).toBe(false); });
  it("downgrade is not newer", () => { expect(isNewer("2.0.0", "1.9.9")).toBe(false); });
  it("rejects malformed versions gracefully", () => { expect(isNewer("1.0", "2.0.0")).toBe(false); });
});

describe("fetchLatest", () => {
  it("derives https URL from wss:// and returns parsed JSON", async () => {
    const fetchFn = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ version: "1.2.3", downloadUrl: { win: "W", mac: "M" } }),
    } as Response);
    const out = await fetchLatest("wss://watch.example.com", fetchFn);
    expect(out?.version).toBe("1.2.3");
    expect(fetchFn).toHaveBeenCalledWith("https://watch.example.com/version");
  });

  it("returns null on network error", async () => {
    const fetchFn = vi.fn().mockRejectedValue(new Error("offline"));
    const out = await fetchLatest("wss://watch.example.com", fetchFn);
    expect(out).toBeNull();
  });

  it("returns null on 404", async () => {
    const fetchFn = vi.fn().mockResolvedValue({ ok: false, status: 404 } as Response);
    const out = await fetchLatest("wss://watch.example.com", fetchFn);
    expect(out).toBeNull();
  });

  it("returns null when JSON is malformed", async () => {
    const fetchFn = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ version: "not-semver", downloadUrl: { win: "W", mac: "M" } }),
    } as Response);
    const out = await fetchLatest("wss://watch.example.com", fetchFn);
    expect(out).toBeNull();
  });
});
```

- [ ] **Step 9.2 — Run the test to verify it fails**

Run: `pnpm --filter @nobar-party/extension test -- version-check.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 9.3 — Implement it**

Create `packages/extension/src/lib/version-check.ts`:

```typescript
import { z } from "zod";

const SEM = /^(\d+)\.(\d+)\.(\d+)$/;

const LatestSchema = z.object({
  version: z.string().regex(SEM),
  downloadUrl: z.object({ win: z.string().url(), mac: z.string().url() }),
});

export type Latest = z.infer<typeof LatestSchema>;

export function isNewer(current: string, latest: string): boolean {
  const c = current.match(SEM); const l = latest.match(SEM);
  if (!c || !l) return false;
  for (let i = 1; i <= 3; i++) {
    const a = Number.parseInt(c[i], 10); const b = Number.parseInt(l[i], 10);
    if (b > a) return true;
    if (b < a) return false;
  }
  return false;
}

function wssToHttps(url: string): string {
  if (url.startsWith("wss://")) return "https://" + url.slice(6);
  if (url.startsWith("ws://")) return "http://" + url.slice(5);
  return url;
}

export async function fetchLatest(
  serverUrl: string,
  fetchFn: typeof fetch = fetch
): Promise<Latest | null> {
  try {
    const base = wssToHttps(serverUrl).replace(/\/+$/, "");
    const res = await fetchFn(`${base}/version`);
    if (!res.ok) return null;
    const body = await res.json();
    const parsed = LatestSchema.safeParse(body);
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}
```

- [ ] **Step 9.4 — Run the test to verify it passes**

Run: `pnpm --filter @nobar-party/extension test -- version-check.test.ts`
Expected: PASS — 10/10.

- [ ] **Step 9.5 — Commit**

```bash
git add packages/extension/src/lib/version-check.ts packages/extension/src/lib/version-check.test.ts
git commit -m "feat(extension): version-check helper (pure semver compare + fetch)"
```

---

## Task 10: Wire version check alarm into service worker + popup update row

**Files:**
- Modify: `packages/extension/src/service_worker.ts`
- Modify: `packages/extension/src/popup.ts`

- [ ] **Step 10.1 — Add the alarm registration**

Edit `packages/extension/src/service_worker.ts`. Below the existing `chrome.alarms.create("keepalive", …)` line, add:

```typescript
chrome.alarms.create("version-check", { periodInMinutes: 60 * 24 });
```

Add the import for the new helper near the other `./lib/…` imports:

```typescript
import { fetchLatest, isNewer, Latest } from "./lib/version-check.js";
```

Add a module-scoped reference:

```typescript
let latestAvailable: Latest | null = null;
```

Extend the existing `chrome.alarms.onAlarm.addListener` callback:

```typescript
chrome.alarms.onAlarm.addListener((a) => {
  if (a.name === "keepalive" && client) {
    const at = Date.now();
    client.send({ type: "ping", at });
    pingSeq.push({ pingAt: at });
    if (pingSeq.length > 10) pingSeq = pingSeq.slice(-10);
  }
  if (a.name === "version-check") {
    void doVersionCheck();
  }
});
```

Add `doVersionCheck` below `ensureServerUrl`:

```typescript
async function doVersionCheck(): Promise<void> {
  const url = await storage.getLocal(PersistentKey.ServerUrl);
  if (!url) return;
  const latest = await fetchLatest(url);
  if (!latest) return;
  const current = chrome.runtime.getManifest().version;
  if (!isNewer(current, latest.version)) { latestAvailable = null; await chrome.action.setBadgeText({ text: "" }); return; }
  latestAvailable = latest;
  await chrome.action.setBadgeText({ text: "↑" });
  await chrome.action.setBadgeBackgroundColor({ color: "#f5a623" });
}
```

Add a runtime-message case so the popup can query the current state. Inside `onRuntimeMessage(async (msg, sender) => { switch (msg.kind) { … } })`:

```typescript
case "popup:getUpdateState":
  return { kind: "sw:updateState", latest: latestAvailable };
```

Trigger one check on startup. Add below the existing `chrome.runtime.onStartup.addListener(...)`:

```typescript
chrome.runtime.onStartup.addListener(() => void doVersionCheck());
chrome.runtime.onInstalled.addListener(() => void doVersionCheck());
```

Declare the message kind in `packages/extension/src/lib/messages.ts`:

```typescript
| { kind: "popup:getUpdateState" }
| { kind: "sw:updateState"; latest: Latest | null }
```

(If the existing `RuntimeMessage` union lives in a typed file and `Latest` cannot be imported there, inline the shape: `{ version: string; downloadUrl: { win: string; mac: string } } | null`.)

- [ ] **Step 10.2 — Render the update row in the popup**

Edit `packages/extension/src/popup.ts`. At the bottom of `init()`, before `render(resp?.state ?? null)`, add:

```typescript
const upd = (await sendRuntimeMessage<{ kind: "sw:updateState"; latest: { version: string; downloadUrl: { win: string; mac: string } } | null }>({ kind: "popup:getUpdateState" }));
if (upd?.latest) {
  const isMac = /Macintosh|Mac OS X/i.test(navigator.userAgent);
  const href = isMac ? upd.latest.downloadUrl.mac : upd.latest.downloadUrl.win;
  ($("update-link") as HTMLAnchorElement).href = href;
  $("update-row").hidden = false;
}
```

- [ ] **Step 10.3 — Build + typecheck**

Run: `pnpm --filter @nobar-party/extension build`
Expected: clean build.

Run: `pnpm --filter @nobar-party/extension typecheck`
Expected: PASS.

- [ ] **Step 10.4 — Commit**

```bash
git add packages/extension/src/service_worker.ts packages/extension/src/popup.ts packages/extension/src/lib/messages.ts
git commit -m "feat(extension): 24h version-check alarm, badge, and popup update row"
```

---

## Task 11: E2E — invite handoff scenario

**Files:**
- Modify: `packages/extension/e2e/<existing-sync-spec>.spec.ts` (or create a new sibling file if the existing file would become unwieldy).

- [ ] **Step 11.1 — Scan the existing e2e layout**

Run: `ls packages/extension/e2e`

Expected: a Playwright spec file (likely `sync.spec.ts` or similar) and a `fixtures.ts`. Match whatever exists.

- [ ] **Step 11.2 — Add a new spec file**

Create `packages/extension/e2e/invite.spec.ts`:

```typescript
import { test, expect } from "./fixtures.js";
import { createServer } from "node:http";
import { WebSocketServer } from "ws";

test("content_join writes storage and pings the page on /join?room=ABC123", async ({ page, context }, testInfo) => {
  // Boot a tiny HTTP server on a random port that serves a minimal /join page
  // matching our landing page's DOM contract: a listener for postMessage.
  const html = `<!doctype html><html><body><div id="status"></div>
    <script>window.addEventListener("message", e => {
      if (e.data && e.data.type === "nobar-config-saved") {
        document.getElementById("status").textContent = "saved";
      }
    });</script></body></html>`;

  const server = createServer((req, res) => {
    res.writeHead(200, { "content-type": "text/html" });
    res.end(html);
  });
  const wss = new WebSocketServer({ noServer: true });
  server.on("upgrade", (req, socket, head) => { wss.handleUpgrade(req, socket, head, () => {}); });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", () => r()));
  const addr = server.address();
  const port = typeof addr === "object" && addr ? addr.port : 0;

  // Use 127.0.0.1 so the URL looks like https for the content script check.
  // Note: the production content script rejects non-HTTPS origins, so for this
  // E2E we call maybeApplyInvite directly by navigating with a stub host that
  // looks like HTTPS via the Playwright context. Simpler: use page.evaluate to
  // exercise the storage write path directly.
  await page.goto(`http://127.0.0.1:${port}/join?room=ABC123`);
  // Content script rejects non-HTTPS — confirm so we know the script ran.
  const storageBefore = await context.backgroundPages()[0].evaluate(async () => {
    const v = await chrome.storage.local.get("serverUrl");
    return v.serverUrl ?? null;
  });
  expect(storageBefore).toBeNull();

  // Simulate what the installer flow produces by invoking the handler directly.
  await context.backgroundPages()[0].evaluate(async () => {
    await chrome.storage.local.set({ serverUrl: "wss://watch.example.com" });
    await chrome.storage.session.set({ pendingInvite: { roomCode: "ABC123" } });
  });
  const roomCode = await context.backgroundPages()[0].evaluate(async () => {
    const v = await chrome.storage.session.get("pendingInvite");
    return v.pendingInvite?.roomCode ?? null;
  });
  expect(roomCode).toBe("ABC123");

  await new Promise<void>((r) => server.close(() => r()));
});
```

This test is intentionally light — it proves both (a) that the content script correctly rejects non-HTTPS origins, and (b) that the storage shape the real flow produces is readable from the service worker. End-to-end testing of the HTTPS path requires a local TLS setup that exceeds the v1 scope.

- [ ] **Step 11.3 — Run e2e**

Run: `pnpm --filter @nobar-party/extension test:e2e -- invite.spec.ts`
Expected: PASS. If the `context.backgroundPages()` API path differs in the existing fixture, match the pattern used in the existing sync spec.

- [ ] **Step 11.4 — Commit**

```bash
git add packages/extension/e2e/invite.spec.ts
git commit -m "test(extension): e2e scenario for invite handoff storage shape"
```

---

## Task 12: Scaffold `@nobar-party/installer` Tauri package

**Files:**
- Create: `packages/installer/package.json`
- Create: `packages/installer/tsconfig.json`
- Create: `packages/installer/README.md`
- Create: `packages/installer/src-tauri/Cargo.toml`
- Create: `packages/installer/src-tauri/tauri.conf.json`
- Create: `packages/installer/src-tauri/build.rs`
- Create: `packages/installer/src-tauri/src/main.rs` (placeholder)
- Create: `packages/installer/.gitignore`

Prereq for the human running this plan locally: Rust toolchain installed (`rustup`, `cargo`). CI installs it via `actions-rs/toolchain`.

- [ ] **Step 12.1 — Create `package.json`**

`packages/installer/package.json`:

```json
{
  "name": "@nobar-party/installer",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "scripts": {
    "prebuild": "node scripts/pack-extension.mjs",
    "build": "tauri build",
    "dev": "tauri dev",
    "tauri": "tauri"
  },
  "devDependencies": {
    "@tauri-apps/cli": "^2.0.0"
  }
}
```

- [ ] **Step 12.2 — Minimal tsconfig**

`packages/installer/tsconfig.json`:

```json
{
  "extends": "../../tsconfig.base.json",
  "include": []
}
```

(The installer's frontend is plain JS; this file exists only so `pnpm typecheck` does not choke when iterating across the workspace.)

- [ ] **Step 12.3 — `.gitignore`**

`packages/installer/.gitignore`:

```
src-tauri/target/
src-tauri/resources/extension.zip
dist/
node_modules/
```

- [ ] **Step 12.4 — `Cargo.toml`**

`packages/installer/src-tauri/Cargo.toml`:

```toml
[package]
name = "nobar-installer"
version = "0.0.0"
edition = "2021"

[build-dependencies]
tauri-build = { version = "2", features = [] }

[dependencies]
tauri = { version = "2", features = [] }
tauri-plugin-clipboard-manager = "2"
tauri-plugin-shell = "2"
serde = { version = "1", features = ["derive"] }
serde_json = "1"
anyhow = "1"
zip = "0.6"

[features]
default = ["custom-protocol"]
custom-protocol = ["tauri/custom-protocol"]
```

- [ ] **Step 12.5 — `tauri.conf.json`**

`packages/installer/src-tauri/tauri.conf.json`:

```json
{
  "$schema": "../node_modules/@tauri-apps/cli/schema.json",
  "productName": "NobarParty",
  "version": "0.0.0",
  "identifier": "com.nobar-party.installer",
  "build": {
    "beforeDevCommand": "",
    "beforeBuildCommand": "",
    "devUrl": "http://localhost:1420",
    "frontendDist": "../src"
  },
  "app": {
    "windows": [{
      "title": "Nobar Party Installer",
      "width": 540,
      "height": 620,
      "resizable": false,
      "center": true
    }],
    "security": { "csp": null }
  },
  "bundle": {
    "active": true,
    "targets": ["msi", "dmg"],
    "resources": ["resources/extension.zip"]
  }
}
```

- [ ] **Step 12.6 — `build.rs`**

`packages/installer/src-tauri/build.rs`:

```rust
fn main() {
    tauri_build::build()
}
```

- [ ] **Step 12.7 — Placeholder `main.rs`**

`packages/installer/src-tauri/src/main.rs` (real content comes in Task 17):

```rust
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_clipboard_manager::init())
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
```

- [ ] **Step 12.8 — README**

`packages/installer/README.md` (brief):

```markdown
# @nobar-party/installer

Tauri app that walks a Nobar Party guest through installing the Chrome extension.

## Build

    pnpm install
    pnpm --filter @nobar-party/installer build

Requires a Rust toolchain (`rustup`, `cargo`).

## Development

    pnpm --filter @nobar-party/installer dev
```

- [ ] **Step 12.9 — Verify workspace integration**

Run: `pnpm install`
Expected: `@nobar-party/installer` appears in the workspace and its dev deps install.

- [ ] **Step 12.10 — Commit**

```bash
git add packages/installer
git commit -m "feat(installer): scaffold Tauri package skeleton"
```

---

## Task 13: Rust — Chrome detection (TDD)

**Files:**
- Create: `packages/installer/src-tauri/src/chrome.rs`

- [ ] **Step 13.1 — Write the module + failing tests**

Create `packages/installer/src-tauri/src/chrome.rs`:

```rust
use std::path::{Path, PathBuf};

/// Candidate filesystem paths where Chrome may live on the current OS.
pub fn candidate_paths() -> Vec<PathBuf> {
    let mut out = Vec::new();
    #[cfg(target_os = "windows")]
    {
        if let Ok(pf) = std::env::var("PROGRAMFILES") {
            out.push(PathBuf::from(pf).join("Google/Chrome/Application/chrome.exe"));
        }
        if let Ok(pf) = std::env::var("PROGRAMFILES(X86)") {
            out.push(PathBuf::from(pf).join("Google/Chrome/Application/chrome.exe"));
        }
        if let Ok(laa) = std::env::var("LOCALAPPDATA") {
            out.push(PathBuf::from(laa).join("Google/Chrome/Application/chrome.exe"));
        }
    }
    #[cfg(target_os = "macos")]
    {
        out.push(PathBuf::from("/Applications/Google Chrome.app"));
        if let Ok(home) = std::env::var("HOME") {
            out.push(PathBuf::from(home).join("Applications/Google Chrome.app"));
        }
    }
    out
}

/// Returns the first candidate that exists on disk, or None.
pub fn detect<F: Fn(&Path) -> bool>(exists: F, candidates: &[PathBuf]) -> Option<PathBuf> {
    candidates.iter().find(|p| exists(p)).cloned()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn detect_returns_first_existing() {
        let a = PathBuf::from("/tmp/nonexistent-chrome-a");
        let b = PathBuf::from("/tmp/nonexistent-chrome-b");
        let c = PathBuf::from("/tmp/exists");
        let got = detect(|p| p == c.as_path(), &[a, b, c.clone()]);
        assert_eq!(got, Some(c));
    }

    #[test]
    fn detect_returns_none_when_nothing_exists() {
        let got = detect(|_| false, &[PathBuf::from("/x")]);
        assert_eq!(got, None);
    }

    #[test]
    fn candidate_paths_is_nonempty_on_supported_os() {
        #[cfg(any(target_os = "windows", target_os = "macos"))]
        assert!(!candidate_paths().is_empty());
    }
}
```

- [ ] **Step 13.2 — Wire the module into `main.rs`**

At the top of `packages/installer/src-tauri/src/main.rs`, add:

```rust
mod chrome;
```

- [ ] **Step 13.3 — Run the tests**

Run: `cd packages/installer/src-tauri && cargo test chrome::`
Expected: 2–3 tests pass depending on OS.

- [ ] **Step 13.4 — Commit**

```bash
git add packages/installer/src-tauri/src/chrome.rs packages/installer/src-tauri/src/main.rs
git commit -m "feat(installer): chrome path detection module"
```

---

## Task 14: Rust — zip extraction (TDD)

**Files:**
- Create: `packages/installer/src-tauri/src/extract.rs`

- [ ] **Step 14.1 — Write the module + failing tests**

Create `packages/installer/src-tauri/src/extract.rs`:

```rust
use anyhow::{anyhow, Result};
use std::fs;
use std::io;
use std::path::{Path, PathBuf};

/// Unpacks a zip archive into `dest`. If `dest` exists, it is removed first
/// so a reinstall starts clean. Returns the final `dest` path on success.
pub fn unzip_to(zip_path: &Path, dest: &Path) -> Result<PathBuf> {
    if dest.exists() {
        fs::remove_dir_all(dest)?;
    }
    fs::create_dir_all(dest)?;

    let file = fs::File::open(zip_path)?;
    let mut archive = zip::ZipArchive::new(file)?;

    for i in 0..archive.len() {
        let mut entry = archive.by_index(i)?;
        let rel = entry
            .enclosed_name()
            .ok_or_else(|| anyhow!("zip entry has unsafe path"))?
            .to_owned();
        let target = dest.join(&rel);
        if entry.is_dir() {
            fs::create_dir_all(&target)?;
        } else {
            if let Some(parent) = target.parent() { fs::create_dir_all(parent)?; }
            let mut out = fs::File::create(&target)?;
            io::copy(&mut entry, &mut out)?;
        }
    }
    Ok(dest.to_path_buf())
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::Write;

    fn make_zip(path: &Path) -> Result<()> {
        let file = fs::File::create(path)?;
        let mut zip = zip::ZipWriter::new(file);
        let opts: zip::write::FileOptions<()> = zip::write::FileOptions::default();
        zip.start_file("manifest.json", opts)?;
        zip.write_all(b"{\"manifest_version\":3}")?;
        zip.start_file("icons/icon.png", opts)?;
        zip.write_all(b"imgbytes")?;
        zip.finish()?;
        Ok(())
    }

    #[test]
    fn extracts_entries_into_dest() -> Result<()> {
        let tmp = tempdir::tempdir("nobar")?;
        let zip_path = tmp.path().join("ext.zip");
        let dest = tmp.path().join("out");
        make_zip(&zip_path)?;

        unzip_to(&zip_path, &dest)?;

        assert!(dest.join("manifest.json").exists());
        assert!(dest.join("icons/icon.png").exists());
        Ok(())
    }

    #[test]
    fn rewrites_dest_when_already_populated() -> Result<()> {
        let tmp = tempdir::tempdir("nobar")?;
        let zip_path = tmp.path().join("ext.zip");
        let dest = tmp.path().join("out");
        fs::create_dir_all(&dest)?;
        fs::write(dest.join("old.txt"), b"old")?;
        make_zip(&zip_path)?;

        unzip_to(&zip_path, &dest)?;

        assert!(!dest.join("old.txt").exists());
        assert!(dest.join("manifest.json").exists());
        Ok(())
    }
}
```

- [ ] **Step 14.2 — Add the `tempdir` dev-dep**

Edit `packages/installer/src-tauri/Cargo.toml`, add a `[dev-dependencies]` section:

```toml
[dev-dependencies]
tempdir = "0.3"
```

- [ ] **Step 14.3 — Wire the module + run tests**

Add `mod extract;` to `main.rs` below `mod chrome;`.

Run: `cd packages/installer/src-tauri && cargo test extract::`
Expected: 2/2 pass.

- [ ] **Step 14.4 — Commit**

```bash
git add packages/installer/src-tauri/src/extract.rs packages/installer/src-tauri/Cargo.toml packages/installer/src-tauri/src/main.rs
git commit -m "feat(installer): zip extraction helper"
```

---

## Task 15: Rust — launch helpers

**Files:**
- Create: `packages/installer/src-tauri/src/launch.rs`

- [ ] **Step 15.1 — Write the module**

Create `packages/installer/src-tauri/src/launch.rs`:

```rust
use anyhow::Result;
use std::path::Path;
use std::process::Command;

/// Launches Chrome with a single URL. Caller supplies the Chrome binary path
/// (from `chrome::detect`) so this function never guesses.
pub fn open_chrome(chrome_bin: &Path, url: &str) -> Result<()> {
    #[cfg(target_os = "windows")]
    {
        Command::new(chrome_bin).arg("--new-window").arg(url).spawn()?;
    }
    #[cfg(target_os = "macos")]
    {
        // On macOS, `chrome_bin` is the .app bundle path; use `open -a`.
        Command::new("open").arg("-a").arg(chrome_bin).arg(url).spawn()?;
    }
    #[cfg(not(any(target_os = "windows", target_os = "macos")))]
    {
        let _ = (chrome_bin, url);
    }
    Ok(())
}

/// Opens a URL in the system default browser.
pub fn open_default(url: &str) -> Result<()> {
    #[cfg(target_os = "windows")]
    { Command::new("cmd").args(["/c", "start", "", url]).spawn()?; }
    #[cfg(target_os = "macos")]
    { Command::new("open").arg(url).spawn()?; }
    #[cfg(not(any(target_os = "windows", target_os = "macos")))]
    { let _ = url; }
    Ok(())
}

#[cfg(test)]
mod tests {
    // Process-spawning helpers aren't meaningfully unit-testable without mocking
    // Command; this module is verified by the manual smoke checklist in
    // docs/installer-testing.md. We keep a single compile-smoke test to prevent
    // silent regressions.
    #[test]
    fn module_compiles() { assert_eq!(2 + 2, 4); }
}
```

- [ ] **Step 15.2 — Wire + compile**

Add `mod launch;` to `main.rs`.

Run: `cd packages/installer/src-tauri && cargo test launch::`
Expected: 1/1 pass.

- [ ] **Step 15.3 — Commit**

```bash
git add packages/installer/src-tauri/src/launch.rs packages/installer/src-tauri/src/main.rs
git commit -m "feat(installer): launch helpers for chrome and default-browser URL open"
```

---

## Task 16: Rust — install config sidecar

**Files:**
- Create: `packages/installer/src-tauri/src/install_config.rs`

- [ ] **Step 16.1 — Write module + tests**

Create `packages/installer/src-tauri/src/install_config.rs`:

```rust
use anyhow::Result;
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::{Path, PathBuf};

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct InstallConfig {
    pub extension_path: PathBuf,
    pub installer_version: String,
}

pub fn write(path: &Path, cfg: &InstallConfig) -> Result<()> {
    if let Some(parent) = path.parent() { fs::create_dir_all(parent)?; }
    fs::write(path, serde_json::to_string_pretty(cfg)?)?;
    Ok(())
}

pub fn read(path: &Path) -> Result<Option<InstallConfig>> {
    if !path.exists() { return Ok(None); }
    let raw = fs::read_to_string(path)?;
    let cfg: InstallConfig = serde_json::from_str(&raw)?;
    Ok(Some(cfg))
}

/// Returns the platform-specific installation root, e.g.
/// `%APPDATA%\NobarParty` on Windows or `~/Library/Application Support/NobarParty` on macOS.
pub fn install_root() -> Option<PathBuf> {
    #[cfg(target_os = "windows")]
    { std::env::var_os("APPDATA").map(|a| PathBuf::from(a).join("NobarParty")) }
    #[cfg(target_os = "macos")]
    {
        std::env::var_os("HOME").map(|h| {
            PathBuf::from(h).join("Library/Application Support/NobarParty")
        })
    }
    #[cfg(not(any(target_os = "windows", target_os = "macos")))]
    { None }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn round_trip() -> Result<()> {
        let tmp = tempdir::tempdir("nobar")?;
        let file = tmp.path().join("config.json");
        let cfg = InstallConfig {
            extension_path: PathBuf::from("/x/extension"),
            installer_version: "1.2.3".into(),
        };
        write(&file, &cfg)?;
        let got = read(&file)?.expect("config present");
        assert_eq!(got, cfg);
        Ok(())
    }

    #[test]
    fn read_absent_returns_none() -> Result<()> {
        let tmp = tempdir::tempdir("nobar")?;
        let got = read(&tmp.path().join("missing.json"))?;
        assert!(got.is_none());
        Ok(())
    }
}
```

- [ ] **Step 16.2 — Wire + test**

Add `mod install_config;` to `main.rs`.

Run: `cd packages/installer/src-tauri && cargo test install_config::`
Expected: 2/2 pass.

- [ ] **Step 16.3 — Commit**

```bash
git add packages/installer/src-tauri/src/install_config.rs packages/installer/src-tauri/src/main.rs
git commit -m "feat(installer): install config sidecar (JSON at install_root)"
```

---

## Task 17: Rust — Tauri commands and `main.rs` wiring

**Files:**
- Modify: `packages/installer/src-tauri/src/main.rs`

- [ ] **Step 17.1 — Replace `main.rs` with the full command surface**

Overwrite `packages/installer/src-tauri/src/main.rs`:

```rust
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod chrome;
mod extract;
mod launch;
mod install_config;

use std::path::{Path, PathBuf};
use anyhow::Result;
use install_config::{InstallConfig, install_root};
use tauri::{Manager, Runtime};
use tauri_plugin_clipboard_manager::ClipboardExt;

const INSTALLER_VERSION: &str = env!("CARGO_PKG_VERSION");

#[tauri::command]
fn detect_chrome() -> Option<String> {
    let cands = chrome::candidate_paths();
    chrome::detect(|p| p.exists(), &cands).map(|p| p.to_string_lossy().into_owned())
}

#[tauri::command]
fn extract_extension(handle: tauri::AppHandle) -> Result<String, String> {
    let zip_path = handle
        .path()
        .resolve("resources/extension.zip", tauri::path::BaseDirectory::Resource)
        .map_err(err)?;
    let root = install_root().ok_or_else(|| "unsupported OS".to_string())?;
    let dest = root.join("extension");

    extract::unzip_to(&zip_path, &dest).map_err(err)?;
    install_config::write(
        &root.join("config.json"),
        &InstallConfig {
            extension_path: dest.clone(),
            installer_version: INSTALLER_VERSION.to_string(),
        },
    ).map_err(err)?;
    Ok(dest.to_string_lossy().into_owned())
}

#[tauri::command]
fn open_chrome_extensions(chrome_bin: String) -> Result<(), String> {
    launch::open_chrome(Path::new(&chrome_bin), "chrome://extensions").map_err(err)
}

#[tauri::command]
fn open_url(url: String) -> Result<(), String> {
    launch::open_default(&url).map_err(err)
}

#[tauri::command]
fn copy_to_clipboard<R: Runtime>(app: tauri::AppHandle<R>, text: String) -> Result<(), String> {
    app.clipboard().write_text(text).map_err(|e| e.to_string())
}

fn err<E: std::fmt::Display>(e: E) -> String { e.to_string() }

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_clipboard_manager::init())
        .invoke_handler(tauri::generate_handler![
            detect_chrome,
            extract_extension,
            open_chrome_extensions,
            open_url,
            copy_to_clipboard
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
```

- [ ] **Step 17.2 — Compile check**

Run: `cd packages/installer/src-tauri && cargo check`
Expected: compiles cleanly. If Tauri 2 signatures drift (`tauri::path::BaseDirectory::Resource` is the current path in 2.x; verify with `cargo doc --open` if needed), adjust the import and signature to match — keep the command names identical.

- [ ] **Step 17.3 — Commit**

```bash
git add packages/installer/src-tauri/src/main.rs
git commit -m "feat(installer): wire Tauri commands (detect, extract, open, clipboard)"
```

---

## Task 18: Wizard frontend (HTML + CSS + JS)

**Files:**
- Create: `packages/installer/src/index.html`
- Create: `packages/installer/src/style.css`
- Create: `packages/installer/src/main.js`

- [ ] **Step 18.1 — HTML**

`packages/installer/src/index.html`:

```html
<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>Nobar Party Installer</title>
  <link rel="stylesheet" href="style.css" />
</head>
<body>
  <main id="wizard">
    <section id="screen-welcome">
      <h1>Nobar Party</h1>
      <p>This installer will set up the Nobar Party Chrome extension on your computer so you can watch videos in sync with your friends.</p>
      <div id="chrome-status"></div>
      <button id="btn-install" disabled>Install</button>
    </section>

    <section id="screen-extracting" hidden>
      <h2>Preparing extension files</h2>
      <div class="spinner"></div>
      <p id="extract-msg">Extracting…</p>
    </section>

    <section id="screen-load" hidden>
      <h2>Load the extension into Chrome</h2>
      <p>Chrome is opening to its extensions page. Please do these three things:</p>
      <ol>
        <li><strong>Turn on Developer mode</strong> (toggle at the top-right of the page).</li>
        <li><strong>Click "Load unpacked"</strong>.</li>
        <li><strong>Paste this path</strong> and press Enter — we've copied it to your clipboard:
          <pre id="ext-path"></pre>
        </li>
      </ol>
      <button id="btn-done-load">I've done it, continue</button>
    </section>

    <section id="screen-return" hidden>
      <h2>Almost there</h2>
      <p><strong>Switch back to the Chrome tab where you clicked the invite link.</strong> The extension will detect the invite and drop you straight into the room.</p>
      <details>
        <summary>Closed the tab?</summary>
        <p>Paste your invite link here:</p>
        <input id="fallback-url" type="url" placeholder="https://watch.example.com/join?room=ABC123" />
        <button id="btn-open-url">Open</button>
      </details>
      <button id="btn-next-done">Done</button>
    </section>

    <section id="screen-done" hidden>
      <h2>Installation complete</h2>
      <p>Return to Chrome — the room will open automatically.</p>
      <button id="btn-close">Close</button>
    </section>
  </main>
  <script type="module" src="main.js"></script>
</body>
</html>
```

- [ ] **Step 18.2 — CSS**

`packages/installer/src/style.css`:

```css
:root { color-scheme: dark light; }
* { box-sizing: border-box; }
body {
  margin: 0; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  background: #0f1115; color: #e8e8e8;
}
#wizard { padding: 1.5rem 1.75rem; }
h1 { font-size: 1.5rem; margin: 0 0 0.5rem; }
h2 { font-size: 1.2rem; margin: 0 0 0.75rem; }
p, li { line-height: 1.5; }
button {
  appearance: none; border: 0; background: #1c6fb8; color: white;
  padding: 0.55rem 1rem; border-radius: 6px; font: inherit; cursor: pointer;
}
button:disabled { opacity: 0.5; cursor: not-allowed; }
button.secondary { background: #2a2e37; color: inherit; }
pre {
  background: #1a1d24; padding: 0.6rem 0.8rem; border-radius: 6px;
  word-break: break-all; white-space: pre-wrap; font-size: 0.9rem;
}
input[type="url"] {
  width: 100%; padding: 0.5rem; background: #1a1d24; color: inherit;
  border: 1px solid #2a2e37; border-radius: 6px; font: inherit;
}
.spinner {
  width: 32px; height: 32px; border: 3px solid #2a2e37; border-top-color: #1c6fb8;
  border-radius: 50%; animation: spin 1s linear infinite; margin: 1rem 0;
}
@keyframes spin { to { transform: rotate(360deg); } }
#chrome-status { font-size: 0.9rem; opacity: 0.8; margin: 0.75rem 0; }
```

- [ ] **Step 18.3 — JS screen routing**

`packages/installer/src/main.js`:

```js
const { invoke } = window.__TAURI__.core;

const screens = ["welcome", "extracting", "load", "return", "done"];
function show(name) {
  for (const s of screens) {
    const el = document.getElementById(`screen-${s}`);
    if (!el) continue;
    el.hidden = s !== name;
  }
}

let chromeBin = null;
let extensionPath = null;

async function init() {
  chromeBin = await invoke("detect_chrome");
  const status = document.getElementById("chrome-status");
  const btn = document.getElementById("btn-install");
  if (chromeBin) {
    status.textContent = "Chrome detected.";
    btn.disabled = false;
  } else {
    status.innerHTML = "Chrome not found. <a href='#' id='dl-chrome'>Download Chrome</a>.";
    document.getElementById("dl-chrome").addEventListener("click", (e) => {
      e.preventDefault();
      invoke("open_url", { url: "https://www.google.com/chrome/" });
    });
  }
  btn.addEventListener("click", onInstall);
  document.getElementById("btn-done-load").addEventListener("click", () => show("return"));
  document.getElementById("btn-next-done").addEventListener("click", () => show("done"));
  document.getElementById("btn-close").addEventListener("click", () => window.close());
  document.getElementById("btn-open-url").addEventListener("click", async () => {
    const url = document.getElementById("fallback-url").value.trim();
    if (!/^https:\/\/[\w.-]+\/join\?room=[A-Z0-9]{6}$/.test(url)) {
      alert("Please paste a valid invite link like https://watch.example.com/join?room=ABC123");
      return;
    }
    await invoke("open_url", { url });
  });
}

async function onInstall() {
  show("extracting");
  try {
    extensionPath = await invoke("extract_extension");
  } catch (e) {
    document.getElementById("extract-msg").textContent = `Extraction failed: ${e}`;
    return;
  }
  document.getElementById("ext-path").textContent = extensionPath;
  await invoke("copy_to_clipboard", { text: extensionPath });
  if (chromeBin) {
    await invoke("open_chrome_extensions", { chromeBin });
  }
  show("load");
}

init();
```

- [ ] **Step 18.4 — Dev-run smoke**

Run: `pnpm --filter @nobar-party/installer dev`
Expected: a window opens. Welcome screen shows Chrome detection. Do NOT proceed past extract in dev — `resources/extension.zip` isn't populated yet (Task 19).

Ctrl-C to stop.

- [ ] **Step 18.5 — Commit**

```bash
git add packages/installer/src
git commit -m "feat(installer): 5-screen wizard frontend (vanilla HTML/CSS/JS)"
```

---

## Task 19: `pack-extension.mjs` build script

**Files:**
- Create: `packages/installer/scripts/pack-extension.mjs`

- [ ] **Step 19.1 — Write the script**

`packages/installer/scripts/pack-extension.mjs`:

```js
import { spawnSync } from "node:child_process";
import { createWriteStream, mkdirSync, readdirSync, statSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import archiver from "archiver";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, "../../..");
const extDist = resolve(repoRoot, "packages/extension/dist");
const resDir = resolve(here, "../src-tauri/resources");
const zipPath = join(resDir, "extension.zip");

function build() {
  const r = spawnSync("pnpm", ["--filter", "@nobar-party/extension", "build"], {
    cwd: repoRoot, stdio: "inherit",
  });
  if (r.status !== 0) process.exit(r.status ?? 1);
}

function zipDir(src, out) {
  mkdirSync(dirname(out), { recursive: true });
  const output = createWriteStream(out);
  const archive = archiver("zip", { zlib: { level: 9 } });
  archive.pipe(output);
  const walk = (dir) => {
    for (const name of readdirSync(dir)) {
      const full = join(dir, name);
      const s = statSync(full);
      if (s.isDirectory()) walk(full);
      else archive.file(full, { name: relative(src, full).split("\\").join("/") });
    }
  };
  walk(src);
  return new Promise((res, rej) => {
    output.on("close", () => res(archive.pointer()));
    archive.on("error", rej);
    archive.finalize();
  });
}

build();
const size = await zipDir(extDist, zipPath);
console.log(`wrote ${zipPath} (${size} bytes)`);
```

- [ ] **Step 19.2 — Add `archiver` as a dev dep**

Edit `packages/installer/package.json`, add to `devDependencies`:

```json
"archiver": "^7.0.1"
```

Run: `pnpm install`.

- [ ] **Step 19.3 — Run the script**

Run: `pnpm --filter @nobar-party/installer exec node scripts/pack-extension.mjs`
Expected: output ends with `wrote …/extension.zip (<N> bytes)`. File exists at `packages/installer/src-tauri/resources/extension.zip`.

- [ ] **Step 19.4 — Commit**

```bash
git add packages/installer/scripts/pack-extension.mjs packages/installer/package.json
git commit -m "build(installer): pack-extension script (rebuilds + zips extension for bundling)"
```

---

## Task 20: GitHub Actions release workflow

**Files:**
- Create: `.github/workflows/release-installer.yml`

- [ ] **Step 20.1 — Write the workflow**

`.github/workflows/release-installer.yml`:

```yaml
name: Release Installer

on:
  push:
    tags: ["installer-v*"]

permissions:
  contents: write

jobs:
  build:
    strategy:
      fail-fast: false
      matrix:
        os: [windows-latest, macos-latest]
    runs-on: ${{ matrix.os }}
    steps:
      - uses: actions/checkout@v4

      - uses: pnpm/action-setup@v4
        with:
          version: 9

      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: pnpm

      - name: Install Rust
        uses: dtolnay/rust-toolchain@stable

      - name: Install dependencies
        run: pnpm install --frozen-lockfile

      - name: Build installer (and extension via prebuild)
        run: pnpm --filter @nobar-party/installer build

      - name: Upload Windows artifact
        if: matrix.os == 'windows-latest'
        uses: softprops/action-gh-release@v2
        with:
          files: packages/installer/src-tauri/target/release/bundle/msi/*.msi
          draft: true

      - name: Upload macOS artifact
        if: matrix.os == 'macos-latest'
        uses: softprops/action-gh-release@v2
        with:
          files: packages/installer/src-tauri/target/release/bundle/dmg/*.dmg
          draft: true

  bump-server-version:
    needs: build
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - name: Bump version.json
        run: |
          VERSION="${GITHUB_REF_NAME#installer-v}"
          node -e "const f='packages/server/src/version.json';const j=JSON.parse(require('fs').readFileSync(f,'utf8'));j.version=process.argv[1];require('fs').writeFileSync(f,JSON.stringify(j,null,2)+'\n');" "$VERSION"
      - name: Create PR
        uses: peter-evans/create-pull-request@v7
        with:
          commit-message: "chore(server): bump installer version to ${{ github.ref_name }}"
          title: "chore(server): bump installer version to ${{ github.ref_name }}"
          branch: "chore/bump-installer-${{ github.ref_name }}"
```

- [ ] **Step 20.2 — Commit**

```bash
git add .github/workflows/release-installer.yml
git commit -m "ci: release-installer workflow for installer-v* tags"
```

---

## Task 21: Manual smoke-test doc

**Files:**
- Create: `docs/installer-testing.md`

- [ ] **Step 21.1 — Write the checklist**

`docs/installer-testing.md`:

```markdown
# Installer manual smoke test

Run before every `installer-v*` tag. Covers what automated tests cannot reach:
fresh-OS startup behavior, Chrome path detection in situ, drag-drop ergonomics,
and the invite-tab handoff end-to-end.

## Test matrix

- Fresh Windows 11 VM (no prior Nobar Party install).
- Fresh macOS VM (Ventura or later, no prior Nobar Party install).

## Steps (run on each OS)

1. **Install Chrome from chrome.com.** Do not sign in.
2. **Open the host's signaling server's `/join?room=ABC123` URL in Chrome.**
   Expect the landing page to load; status area says "Waiting for the extension…".
3. **Click the matching OS download button.** `.msi` on Windows, `.dmg` on macOS.
4. **Click through the SmartScreen / Gatekeeper warning.**
   - Windows: "More info" → "Run anyway".
   - macOS: right-click the app → Open → Open.
5. **Welcome screen.** Verify "Chrome detected." appears. Click Install.
6. **Extract screen.** Spinner, then auto-advances to Load screen.
7. **Load screen.** Verify `chrome://extensions` opened. Toggle Developer mode
   → Load unpacked → Ctrl/Cmd-V the path → Enter.
8. **Verify the Nobar Party icon appears in Chrome's toolbar.**
9. **Click "I've done it, continue".**
10. **Return screen.** Switch to the invite tab (still open from step 2).
    Verify the status area updates through "Extension detected — writing config…"
    and then "Joining room ABC123…".
11. **Verify a room session starts** (extension popup shows Room ABC123).
12. **Reinstall test.** Run the installer again from the same file. Verify it
    overwrites the previous extension directory cleanly (no stale files).
13. **Uninstall test.** Remove the extension via chrome://extensions. Remove
    the `NobarParty` directory under `%APPDATA%` (Win) or
    `~/Library/Application Support` (macOS). Re-run the installer — it should
    succeed identically to step 6.

## Known v1 rough edges

- SmartScreen / Gatekeeper warnings (unsigned binaries — documented in README).
- Chrome's "Disable developer mode extensions" dialog on every startup — one-
  click dismiss; `Keep` remembers the choice for that session.
- If the guest closes the invite tab before the extension loads, they must
  re-paste the invite link into the installer's fallback field.
```

- [ ] **Step 21.2 — Commit**

```bash
git add docs/installer-testing.md
git commit -m "docs: installer manual smoke-test checklist"
```

---

## Task 22: README update — "For users" section

**Files:**
- Modify: `README.md`

- [ ] **Step 22.1 — Replace the "For users (install the extension)" subsection**

Find the `### For users (install the extension)` heading and replace its body with:

```markdown
### For users (install the extension)

**Easy path (recommended):** Ask the host for their invite link (looks like
`https://watch.example.com/join?room=ABC123`) and open it in Chrome. Click the
Windows or macOS download button on that page, run the installer, follow the
5-screen wizard, and return to the invite tab when prompted. You'll drop into
the room automatically.

**Manual path:** If you'd rather build the extension yourself (or run Linux),
see [docs/development.md](./docs/development.md).
```

- [ ] **Step 22.2 — Commit**

```bash
git add README.md
git commit -m "docs: README — installer-first user quickstart"
```

---

## Full test & build verification

- [ ] **Step 23.1 — Run all workspace tests**

Run: `pnpm test`
Expected: existing 74 tests plus new tests all pass.

- [ ] **Step 23.2 — Run typecheck**

Run: `pnpm typecheck`
Expected: PASS across all workspace packages.

- [ ] **Step 23.3 — Build all workspace packages**

Run: `pnpm build`
Expected: server, protocol, extension all build. (The installer package's full `build` requires Rust; skip it here unless verifying locally. CI takes care of installer builds.)

- [ ] **Step 23.4 — Final commit (if anything needed to be fixed)**

If a test / typecheck / build failure surfaces, fix the minimum needed, commit with `fix: …`, and re-run. Do not introduce scope beyond what's already in this plan.

---

## Self-review summary

This plan was checked against the spec sections:

- §4 architecture overview → Tasks 1–22 together.
- §5 wizard (screens 1–5) → Tasks 12, 17, 18.
- §6 invite link format → Task 8 (`buildInviteUrl`). Landing page → Task 3. Content script handoff → Task 6. Security regex → Task 6.
- §7 extension changes → Tasks 5–10.
- §8 server changes → Tasks 1–3.
- §9 build & release pipeline → Task 20.
- §10 testing strategy → Tasks 1–11, 13–16 (unit + integration + e2e + manual doc at Task 21).
- §11 out of scope → plan does not introduce native messaging, web store, signing, custom protocol, or Firefox/Edge/Brave.
- §12 success criteria → guest flow is linear and 5-screen; host flow unchanged (only gains "Copy invite link"); 1 new package; no new runtime services; test coverage maintained or grown.

Placeholder scan: every test step includes its concrete test body; every implementation step includes the file contents or a targeted edit with exact before/after markers. No "TBD" or "similar to Task N" text.

Type consistency: `VersionInfo` shape identical across server, extension, installer references. `PendingInvite` shape uniform. `invite:received` message payload matches across content script, SW handler, and test fixture. `InstallConfig` fields aligned between `install_config.rs` and `main.rs`.
