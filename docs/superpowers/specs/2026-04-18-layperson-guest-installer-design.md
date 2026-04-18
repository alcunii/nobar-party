# Layperson guest installer — design spec

**Status:** Approved (2026-04-18)
**Scope:** Nobar Party v0.2 track — guest-side onboarding

## 1. Problem

Nobar Party today requires every guest to clone the repo, run `pnpm install`, build
the extension, sideload it via Chrome's developer mode, and paste a server URL into
the popup. That is fine for the host (who already set up a VPS, Caddy, systemd, and
DNS), but it is an immovable wall for the laypeople the host actually wants to watch
movies with.

We want to reduce the guest's path to "click invite link → download installer → click
through a short wizard → drag-drop once → movie starts" without sacrificing the
project's self-hosted, no-central-service ethos.

The host's path stays unchanged from today.

## 2. Constraints that shaped the design

- **Chrome blocks external `.crx` installs on consumer machines** since ~Chrome 73.
  Registry/plist-based "external extension" installs only work on domain-joined or
  MDM-managed machines, and `ExtensionInstallForcelist` installs show a permanent
  "Managed by your organization" banner that reads as spyware to laypeople. The
  Chrome Web Store is the only way to get truly one-click consumer installs, and the
  project has chosen to stay off the Web Store for v0.2.
- **Therefore the only realistic path is Developer-mode "Load unpacked"** with a
  polished wizard around it. One manual drag-drop action is the floor of the UX.
- **No central project-run infrastructure.** Everything lives on either the host's
  existing signaling server or the guest's own machine. GitHub Releases is used for
  binary hosting only, not as a runtime dependency.
- **No budget for code-signing certificates.** Windows SmartScreen and macOS
  Gatekeeper warnings are accepted as v1 friction, with in-line click-through
  instructions.
- **Zero changes to the wire protocol, sync engine, or room-state logic.** The
  installer is purely a bootstrapping concern.

## 3. Decisions

| Topic | Decision |
|---|---|
| Audience | Guest-focused. Host flow unchanged. |
| Platform | Windows `.msi` + macOS `.dmg`. |
| Install mechanism | Polished Developer-mode sideload wizard. |
| Config delivery | Generic installer + host-owned invite link. |
| Landing page location | Host's own signaling server. |
| Browser scope | Chrome only (Edge, Brave, Firefox later). |
| Invite link UI | Auto-copy on room create + persistent "Copy invite link" button. |
| Updates | In-popup notifier via server `/version` endpoint. |
| Distribution | GitHub Releases, unsigned. |
| Installer tech | Tauri (Rust + system webview). |

## 4. High-level architecture

One new package is added to the monorepo:

- **`@nobar-party/installer`** — a Tauri application that extracts a bundled packed
  extension folder, detects Chrome, opens `chrome://extensions`, walks the guest
  through enabling Developer mode and drag-dropping the folder, then opens the
  invite URL to complete auto-configuration.

Two existing packages grow a small feature each:

- **`@nobar-party/server`** — adds `GET /join` (static landing HTML) and
  `GET /version` (JSON with current installer version + download URLs).
- **`@nobar-party/extension`** — adds a `*://*/join*` content script that reads
  `?room=` from the URL and writes `{serverUrl, roomCode}` into
  `chrome.storage.local`, a "Copy invite link" button in the popup, and an
  "Update available" badge driven by the server's `/version` endpoint.

The full guest journey:

```
invite link  →  landing page (host's server, tab stays open)
            →  download installer (GitHub Releases)
            →  wizard extracts extension  →  chrome://extensions (guided drag-drop)
            →  wizard says "return to the invite tab"
            →  guest switches back to the original tab
            →  content script fires (extension now loaded)  →  writes storage
            →  extension auto-joins room  →  movie starts
```

The invite tab remaining open across the installer run is the key mechanism: the
wizard never needs to know the invite URL, because the landing page is already
where it needs to be in the guest's browser. The paste-in field in the wizard is
only a fallback if the guest accidentally closed the tab.

The host's only new action is clicking "Copy invite link" in the extension popup
and pasting it wherever they currently paste the 6-character room code.

## 5. Installer wizard (Tauri app)

Five screens, one manual action.

### Screen 1 — Welcome

Title, one-line description, **Install** button.

Backend scans for Chrome at well-known paths:

- Windows: `%PROGRAMFILES%\Google\Chrome\Application\chrome.exe`,
  `%PROGRAMFILES(X86)%\Google\Chrome\Application\chrome.exe`,
  `%LOCALAPPDATA%\Google\Chrome\Application\chrome.exe`.
- macOS: `/Applications/Google Chrome.app`,
  `~/Applications/Google Chrome.app`.

If not found, Install button is replaced with "Chrome not found — Download Chrome"
linking to `https://www.google.com/chrome/`.

### Screen 2 — Extracting

Progress bar while Rust extracts the bundled extension zip (shipped inside
`src-tauri/resources/extension.zip`) to a stable location:

- Windows: `%APPDATA%\NobarParty\extension\`
- macOS: `~/Library/Application Support/NobarParty/extension/`

Stability matters: if the guest ever reinstalls or upgrades, Chrome must see the
same path or it will unload the extension.

A JSON config is written alongside: `config.json` with
`{extensionPath, installerVersion}` for future upgrade detection.

### Screen 3 — Load into Chrome (the one manual step)

The wizard:

1. Launches Chrome with `chrome --new-window chrome://extensions`.
2. Copies the extension folder path to the clipboard.
3. Shows a three-step animated checklist:
   - **Toggle Developer mode** (top-right) — animated GIF of the toggle.
   - **Click Load unpacked** → paste (⌘V / Ctrl-V) the path → Enter — animated GIF.
   - Wait for the Nobar Party icon to appear in the toolbar.
4. Below the checklist: **I've done it, continue** button.

No native-messaging handshake in v1; manual confirmation is good enough to keep the
scope tight. The wizard does not try to verify the extension is actually loaded.

### Screen 4 — Return to invite

Primary instruction: "**Switch back to the Chrome tab where you clicked the invite
link.** The extension will detect the invite and drop you straight into the room."
An illustrative thumbnail of the landing page is shown so the guest knows what tab
to look for.

Secondary, collapsible fallback: "Closed the tab? Paste your invite link here:"
text field + **Open** button. Wizard validates the URL against
`^https://[\w.-]+/join\?room=[A-Z0-9]{6}$` (strict) and launches it via the
platform's default-browser opener (`open` on macOS, `start` via `cmd /c` on
Windows, or Tauri's `shell::open` plugin). Chrome should already be the default
browser at this point, and the extension's content script fires on page load.

The wizard deliberately does not try to carry the invite URL across the install
step itself — browsers do not let plain download links pass launch arguments to
the downloaded binary, and we rejected the `nobar://` custom-protocol path
earlier (§2 decisions). Keeping the URL where the guest put it (the browser tab)
is simpler and needs no OS-level protocol registration.

### Screen 5 — Done

"Installation complete. Return to Chrome — the room will open automatically."
**Close** button. The wizard does not assert it verified the handoff; that's the
landing page's job, visible to the guest in the original tab.

### Rust backend surface

Roughly 400 lines total:

- `chrome_detection.rs` — probe well-known paths, return `Option<PathBuf>`.
- `extract.rs` — unzip bundled resource to AppData/Application Support.
- `launch.rs` — spawn Chrome with URL, open URL in default browser.
- `clipboard.rs` — Tauri's `clipboard` plugin.
- `config.rs` — read/write `config.json` via `serde_json`.
- `main.rs` — wires Tauri commands invokable from the webview.

The webview frontend is vanilla HTML/CSS/JS (no React/Vue) because 5 screens does
not justify a framework.

## 6. Invite link and landing page

### Invite URL format

`https://watch.host.com/join?room=ABC123`

- **Origin is the server URL.** The extension derives `serverUrl` as
  `wss://<origin.host>` from the landing page's location, so no second URL-encoded
  parameter is needed and typos are impossible.
- **Room code is the only query parameter.** Must match `^[A-Z0-9]{6}$`.

### Host side: extension popup changes

On room-create success, the popup:

1. Builds the invite URL from the configured server URL (stored as `wss://`) mapped
   to `https://`, plus `/join?room=<code>`.
2. Calls `navigator.clipboard.writeText(inviteUrl)`.
3. Shows a 2-second toast: "Invite link copied".
4. Renders a persistent **Copy invite link** button adjacent to the existing "Copy
   room code" button. Clicking it re-copies and re-shows the toast.

Returning guests who already have the extension can still use the 6-char code as
today; the invite link is purely additive.

### Server side: `GET /join` route

The existing Node HTTP server (which `ws` already upgrades from) adds one handler
serving a single static HTML document embedded as a string constant in a new
`src/landing.ts`.

The page:

- Displays "Nobar Party — joining room ABC123" (room code pulled from query).
- Detects guest OS via `navigator.userAgent`.
- Shows a big **Download installer** button pointing at the current GitHub Release
  asset URL for the detected OS, plus a secondary link for the other OS.
- Below the download button, instruction text: "**Keep this tab open** while you
  install. We'll detect the extension automatically and put you in the room."
- Renders a live status area with three states:
  - *Waiting for extension…* — initial state, a spinner and the "keep this tab
    open" reminder.
  - *Extension detected — writing config…* — after the content script's
    `postMessage` lands (see §6 Extension handoff).
  - *Joining room ABC123…* — after storage write, before the extension redirects
    to the sync session.

The page polls for the content script by listening to a `message` event; the
content script posts once on load. No polling via `fetch` needed.

~100 lines including inline CSS and vanilla JS, no external requests, no CDN,
fully self-contained so it works even if the guest's network is heavily
firewalled.

Cache-Control: `public, max-age=3600`.

### Server side: `GET /version` route

Returns JSON:

```json
{
  "version": "1.0.0",
  "downloadUrl": {
    "win": "https://github.com/alcunii/nobar-party/releases/download/installer-v1.0.0/NobarParty-1.0.0.msi",
    "mac": "https://github.com/alcunii/nobar-party/releases/download/installer-v1.0.0/NobarParty-1.0.0.dmg"
  }
}
```

Backed by a `version.json` file shipped with the server package. Host bumps it
when they want to advertise a new version to their friend-group. Zod-validated on
load.

Rate-limited by the existing per-IP connection cap that the WS upgrade uses.
CORS set to `*` because the extension fetches it from any origin.

### Extension handoff: `content/join.ts`

Content script matched on `*://*/join*` in `manifest.json`. On page load:

1. Parses `window.location`. Rejects if any of:
   - protocol ≠ `https:`,
   - path ≠ `/join`,
   - `?room=` missing or does not match `/^[A-Z0-9]{6}$/`.
2. Derives `serverUrl = "wss://" + location.host`.
3. Writes `{serverUrl, roomCode}` to `chrome.storage.local`.
4. Posts `{type: "nobar-config-saved"}` to the page so the landing page can update
   its status area.
5. After 500 ms, sends a message to the background service worker to initiate
   room join, reusing the existing popup → background → peer-joined flow.

### Security model

The content script's strict origin (`https://` only) and strict room-code regex
mean a random malicious page at `http://evil.example/join?room=abc123` cannot
inject arbitrary server URLs or room codes. The existing per-frame 16 KB limit
and Zod validation on the server handle anything that slips past. There is no
new attack surface on the server beyond two idempotent GET routes.

## 7. Extension changes (summary)

| File | Lines | Purpose |
|---|---|---|
| `content/join.ts` | ~40 | Parse invite URL, write to `chrome.storage.local`, trigger join. |
| `popup/index.tsx` (delta) | ~30 | "Copy invite link" button, toast, auto-copy on room create. |
| `popup/index.css` (delta) | ~20 | Toast styling. |
| `background/version-check.ts` | ~60 | Fetch `/version` on startup + every 24h via `chrome.alarms`, set `BADGE: "↑"`, render update row in popup. |
| `manifest.json` (delta) | ~5 | Register content script, add `alarms` permission. |

All additive. No existing file grows past its current line budget. No refactor of
the sync engine.

## 8. Server changes (summary)

| File | Lines | Purpose |
|---|---|---|
| `src/landing.ts` | ~100 | Inline HTML+CSS+JS landing page served at `GET /join`. |
| `src/version-endpoint.ts` | ~20 | `GET /version` handler with Zod-validated JSON from `version.json`. |
| `version.json` | — | Current installer version and GitHub Release download URLs. |
| `src/index.ts` (delta) | ~10 | Wire the two new routes into the existing HTTP server, shared rate-limit middleware. |

No changes to room state, room lifecycle, or WebSocket handlers. Both new routes
are idempotent GETs with no database.

## 9. Build and release pipeline

One new GitHub Actions workflow: **`.github/workflows/release-installer.yml`**,
triggered on git tag `installer-v*`.

Matrix over `{windows-latest, macos-latest}`. Each runner:

1. `pnpm install`
2. `pnpm --filter @nobar-party/extension build`
3. Zip `packages/extension/dist/` into
   `packages/installer/src-tauri/resources/extension.zip` (embeds the current
   extension build inside the installer binary).
4. `pnpm --filter @nobar-party/installer tauri build`
5. Upload `.msi` (Windows) / `.dmg` (macOS) artifacts to the GitHub Release.
6. Bump `packages/server/version.json` and open a PR.

No code signing. Release notes include a canned blurb for the host explaining the
SmartScreen and Gatekeeper click-through for their guests.

Extension and server packages keep their current release cadence; installer
release is a separate tag lifecycle (`installer-v*`) so protocol patches don't
trigger installer rebuilds.

## 10. Testing strategy

### Unit (Vitest)

- `content/join.ts` — origin regex, malformed `?room=`, non-HTTPS rejection,
  storage write called with correct shape. ~8 tests.
- Popup toast + copy-link helper — clipboard call, toast visibility timing. ~3 tests.
- `background/version-check.ts` — version comparison, badge set, alarm registration.
  ~4 tests.
- Server `/version` — JSON shape validation, 404 when `version.json` missing. ~3 tests.
- Server `/join` — 200 status, content-type, room code interpolation. ~3 tests.

Target: maintains the 80% coverage bar, adds ~21 tests.

### Integration

New file: `packages/server/src/__tests__/http-routes.test.ts`. Spins up the server,
makes real HTTP requests to `/join` and `/version`, asserts status, body,
headers, Cache-Control, CORS. ~8 tests.

### E2E (Playwright)

The existing two-Chromium harness gains one scenario:

- Start the signaling server.
- Launch Chromium A with extension loaded unpacked.
- Navigate A to `http://localhost:<port>/join?room=ABC123`.
- Assert `chrome.storage.local` contains `{serverUrl, roomCode: "ABC123"}`.
- Assert the extension auto-connects and appears in the sidebar.

### Manual smoke test

`docs/installer-testing.md` — one-page checklist for maintainers to run on fresh
Windows and macOS VMs before tagging a release. Covers: Chrome not found path,
invite launch arg vs paste-in fallback, clipboard path write, reinstall over
existing install.

Installer CI automation is explicitly deferred to v1.1 — Tauri CI adds
substantial infra for a narrow win on the first release.

## 11. Out of scope (v1)

- Chrome Web Store publication (separate roadmap track).
- Firefox, Edge, Brave, Arc, Vivaldi installer paths.
- Native messaging between installer and extension (would enable auto-verify of
  Screen 3, considered for v1.1).
- Passing the invite URL from the browser into the installer automatically
  (rejected — requires either a custom protocol handler, which we decided against,
  or native messaging, which is v1.1). Guest returns to the open tab instead.
- Code signing (considered if project gets traction).
- Per-invite binary rebuilds (rejected earlier; generic installer + invite link
  is the decision).
- A central project-run landing page or update server (explicitly rejected —
  everything lives on the host's own infra).
- Telemetry, analytics, crash reporting (against the project's privacy ethos).

## 12. Success criteria

- A guest with no prior exposure to the project can go from "friend sent me an
  invite" to "watching the movie" in under 3 minutes on a reasonably fast
  connection.
- The host's flow gains exactly one new capability (the invite link) and loses
  nothing.
- Project dependency footprint grows by exactly one package
  (`@nobar-party/installer`), no new runtime services.
- 80% test coverage maintained.
- No changes to wire protocol, room state, or sync engine.
