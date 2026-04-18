<div align="center">

# 🎬 Nobar Party

**Watch videos in perfect sync with friends — on any site, from anywhere, with one-click install.**

*A free, open-source, self-hosted [Teleparty](https://www.teleparty.com) / [Netflix Party](https://www.netflixparty.com) alternative that works on **more than just Netflix** — YouTube, HBO Max, Disney+, Prime Video, Indonesian streaming sites, academic lectures, any page with an HTML5 `<video>` tag.*

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](./LICENSE)
[![Manifest V3](https://img.shields.io/badge/Chrome-Manifest%20V3-34a853?logo=googlechrome&logoColor=white)](https://developer.chrome.com/docs/extensions/mv3/intro/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.5-3178c6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Node.js](https://img.shields.io/badge/Node.js-20+-43853d?logo=node.js&logoColor=white)](https://nodejs.org/)
[![Tauri](https://img.shields.io/badge/Tauri-2.x-ffc131?logo=tauri&logoColor=white)](https://tauri.app/)
[![Tests](https://img.shields.io/badge/tests-128%20passing-success)](#-testing)
[![Self-hosted](https://img.shields.io/badge/self--hosted-yes-ff69b4)](./docs/self-hosting.md)
[![GitHub stars](https://img.shields.io/github/stars/alcunii/nobar-party?style=social)](https://github.com/alcunii/nobar-party/stargazers)

</div>

---

## What is Nobar Party?

**Nobar Party** is a Chrome extension + self-hosted signaling server that lets a small group of friends watch the same video together in perfect sync — *play, pause, and seek propagate to everyone in the room within ~500 ms* — with a built-in chat sidebar and a "click to follow" URL broadcast so nobody has to coordinate links.

Unlike Teleparty's shrinking list of officially supported services, Nobar Party works on **any website that uses an HTML5 `<video>` element**. There's no cloud account to sign up for, no tracking, no analytics — just a tiny signaling server you run on your own $4 VPS (or reuse an existing one) and a one-click desktop installer friends can run in under a minute.

> **"Nobar"** is Indonesian slang for *nonton bareng* — "watching together."

### Who is this for?

- 👫 **Long-distance couples and friend groups** watching movies across time zones without a lag-heavy screen-share hack
- 🎓 **Study groups and book clubs** following the same video lecture in lockstep
- 🌐 **Open-source and privacy-minded people** who don't want a third-party service mediating their movie nights
- 💻 **Developers** who want a clean reference implementation of a real-time multi-user Chrome extension (TypeScript, Manifest V3, WebSocket, Tauri installer, Let's Encrypt auto-TLS, E2E tests with Playwright)

---

## ✨ Features

- 🖱️ **One-click desktop installer** (Windows `.msi`, macOS `.dmg`) — your friends don't need to touch the command line or GitHub
- 🎯 **Synchronized playback** — play, pause, and seek reach every peer within ~500 ms on a reasonable connection
- 🌍 **Works on any site with an HTML5 `<video>`** — no hardcoded host allowlist, no per-site integrations
- 🪟 **In-page chat sidebar** with local echo + peer events (joins, leaves, URL changes)
- 🔗 **"Follow URL" banner** — when the host navigates to a new video, peers get a one-click follow button
- 🔒 **Host-owned invite links** — `https://your-domain.com/join?room=ABC123` auto-configures the guest's extension
- 🧠 **Drift-corrected sync** — NTP-lite clock-offset estimation keeps dialogue timing right even on flaky Wi-Fi
- 🏷️ **Update-available notifier** — extensions check `/version` every 24h and surface a badge when the host publishes a newer installer
- 🔐 **TLS by default** via Caddy's automatic Let's Encrypt
- 🚫 **Privacy by design** — the server sees no video content, only tiny JSON events (`play`, `pause`, `seek`, `chat`, `url`)
- 🏠 **100% self-hosted** — your friends, your server, your rules, MIT licensed
- 🪶 **Tiny footprint** — ~4 MB installer, ~200 LOC signaling server, runs in a Docker container on a $4 VPS
- 🧪 **Rigorously tested** — 128 unit + integration tests across four packages, plus a Playwright E2E harness

---

## 🚀 Quick start

### For guests (one-click install)

Your host will send you an invite link that looks like:

```
https://their-domain.com/join?room=ABC123
```

Three steps:

1. **Click the invite link** in Chrome. A page appears: "Joining room ABC123…"
2. **Click the big download button** on the page (it auto-detects your OS). You get `NobarParty-windows.msi` or `NobarParty-macos.dmg`.
3. **Run the installer**. SmartScreen (Windows) or Gatekeeper (macOS) will show a warning — click **More info → Run anyway** (Windows) or **right-click → Open → Open** (macOS). A small wizard opens:

   - Welcome screen → click **Install**
   - Extracting → happens automatically
   - Load into Chrome → the wizard opens `chrome://extensions`, copies the extension path to your clipboard. Toggle **Developer mode** (top-right), click **Load unpacked**, paste (Ctrl/⌘-V), press Enter.
   - Return to the invite tab. Room joins automatically. Enter a nickname if asked.

**That's it.** Next time the same host invites you, clicking the link drops you straight into the room with no wizard — the extension stays installed.

> **Why the warnings?** The installer is unsigned (no $200/yr Windows cert, no $99/yr Apple Developer ID). The installer is open source and auditable; if you're not comfortable, build the extension yourself from source.

### For hosts — option 1: Docker (fastest, recommended)

Requirements: a VPS with Docker + a domain pointing at it + ports 80/443 open.

```bash
# On your VPS
git clone https://github.com/alcunii/nobar-party.git
cd nobar-party
docker compose -f deploy/docker-compose.yml up -d --build
```

The container listens on `127.0.0.1:3050`. Point Caddy at it for TLS:

```bash
# /etc/caddy/Caddyfile
your-domain.com {
    reverse_proxy 127.0.0.1:3050
}
```

`sudo systemctl reload caddy`. Caddy auto-obtains a Let's Encrypt cert.

Install the extension on your own machine using the same installer your guests use (download from your [Releases page](https://github.com/alcunii/nobar-party/releases)). In the extension popup → Settings → Server URL, set `wss://your-domain.com`. Save. Set your nickname.

### For hosts — option 2: native Node + systemd

See **[→ docs/self-hosting.md](./docs/self-hosting.md)** for the full DNS → Caddy → systemd walkthrough.

---

## 🎥 How to run a watch party — full walkthrough

Once your server is live and you + your friends have the extension installed:

### Step 1 — Create a room (host)

1. Click the Nobar Party icon in Chrome's toolbar → popup appears
2. Set your nickname (first time only — persists after)
3. Click **Create room**
4. Popup shows `Room ABC123` and the invite link is auto-copied to your clipboard ("Invite link copied" toast)

### Step 2 — Share the invite

Paste the auto-copied link into Discord, WhatsApp, iMessage, email, or any chat app:

```
https://your-domain.com/join?room=ABC123
```

### Step 3 — Guests join

Each guest clicks the link. First-time guests go through the one-click installer flow (see above). Returning guests get dropped into the room automatically — the extension detects the invite URL and joins the room in the background.

Watch the members list in your popup fill up as friends join.

### Step 4 — Pick a video

Navigate to the video URL in a new tab — YouTube, Disney+, Prime Video, an academic lecture, anything with an HTML5 `<video>` tag. Everyone in the room gets a small banner on their current tab:

> **→ dmr is now watching https://www.youtube.com/watch?v=...  [Follow]**

They click **Follow** → their Chrome navigates to the same URL.

### Step 5 — Press play

Click play. Your play event reaches every peer within ~500 ms. Pauses, seeks, and playback-rate changes all propagate. Anyone can control — no "host" role.

### Step 6 — Chat alongside the video

On any page with the extension loaded, a sidebar slides in from the right. Type in the composer at the bottom, press Enter:

- You see your own message (local echo)
- Everyone in the room sees it within ~500 ms
- Peer-join, peer-leave, and URL-change events also show in the sidebar with a `*` prefix

### Step 7 — Leave when done

Click **Leave room** in the popup. The WebSocket closes gracefully; the sidebar hides on your next page load.

---

## 🆚 How does this compare to Teleparty / Netflix Party?

| | **Nobar Party** | Teleparty / Netflix Party |
|---|---|---|
| **Install friction** | **One-click installer** (Windows `.msi`, macOS `.dmg`) | Chrome Web Store (slightly simpler) |
| **Site coverage** | **Any site with HTML5 `<video>`** — YouTube, HBO Max, Disney+, Prime Video, regional streaming, academic lectures | Fixed allowlist (Netflix, Disney+, Hulu, HBO Max, Amazon Prime) |
| **Hosting model** | **Self-hosted** — your domain, your server, your rules | Cloud SaaS |
| **Privacy** | **No accounts, no analytics, no server-side video** | Third-party service, analytics |
| **Source code** | **MIT, fully open** | Proprietary |
| **Cost** | **Free forever** (you pay your $4 VPS bill) | Free tier with paid upgrades |
| **Chat** | **Text sidebar with local echo** | Text sidebar + emoji reactions |
| **Cross-browser** | **Chrome / Chromium / Edge / Brave** (Manifest V3) | Chrome + Edge |
| **Voice / video** | Out of scope — pair with Discord or Zoom | Not included |
| **Mobile** | ❌ Chrome extensions don't run on mobile | ❌ Same |

**TL;DR:** Pick Teleparty if you want a polished turnkey product with Netflix's branding and you only watch Netflix. Pick Nobar Party if you want something that works on *the actual site you're trying to watch*, you value privacy and open source, and you're willing to spend 15 minutes on the first-time VPS setup.

---

## 🏗️ Architecture

```
┌─────────────── Host's Chrome ──────────────────┐       ┌─────────────── Guest's Chrome ─────────────────┐
│                                                │       │                                                │
│   [popup]  →  [service_worker]  ←──── wss:// ──┼───────┼→ [service_worker]  ←  [popup]                  │
│                 ↕          ↕                   │       │     ↕         ↕                                │
│         [content script] [sidebar iframe]      │       │  [content]  [sidebar]                          │
│                 ↓                              │       │     ↓                                          │
│           drives <video>                       │       │   drives <video>                               │
└────────────────────────────────────────────────┘       └────────────────────────────────────────────────┘
                              ↕  wss:// (TLS via Caddy)  ↕
                      ┌──────────────────────────────┐
                      │ Your VPS (any $4 box)        │
                      │  Caddy → Node + ws container │
                      │  HTTP /join + /version       │
                      │  WS signaling                │
                      │  In-memory Map<roomId,…>     │
                      │  No database, no disk        │
                      └──────────────────────────────┘
```

**Four packages in a pnpm monorepo, zero circular dependencies:**

| Package | Purpose |
|---|---|
| [`@nobar-party/protocol`](./packages/protocol) | Shared Zod schemas and TypeScript types for every wire message |
| [`@nobar-party/server`](./packages/server) | Node + [`ws`](https://github.com/websockets/ws) signaling server with `/join` landing page and `/version` endpoint, in-memory rooms, no database |
| [`@nobar-party/extension`](./packages/extension) | Chrome extension — Manifest V3, TypeScript, built with [esbuild](https://esbuild.github.io/), content scripts as IIFE and service worker as ESM |
| [`@nobar-party/installer`](./packages/installer) | Tauri 2.x desktop app that bundles + installs the extension into Chrome |

**Key design choices:**

- **Democratic control** — anyone in the room can play, pause, seek. No "host" role at the protocol level.
- **Opt-in URL follow** — when the host navigates, peers get a banner, not a surprise navigate.
- **Auto-detect video with manual override** — biggest `<video>` wins; user can correct it via the popup.
- **500 ms echo-loop suppression** — remote events don't rebroadcast via the native `play`/`pause` DOM events.
- **NTP-lite clock sync** — 3 pings on join, lowest-RTT wins, re-measures every 60 s via `chrome.alarms`.
- **Server knows nothing about the video** — only relays `{play, pause, seek, url, chat}` JSON, max 16 KB per frame.
- **Content script privilege separation** — content scripts only parse URLs and post messages; the service worker handles all `chrome.storage` writes (MV3 session storage is restricted from content scripts).
- **Stable installer filenames** — `NobarParty-windows.msi` / `NobarParty-macos.dmg` stay stable across releases so landing-page links never break.

---

## 📚 Documentation

- **[→ Self-hosting guide](./docs/self-hosting.md)** — DNS → Caddy → systemd walkthrough (non-Docker path)
- **[→ Development guide](./docs/development.md)** — Local dev workflow + manual test checklist
- **[→ Wire protocol reference](./docs/protocol.md)** — For anyone building a compatible client or server
- **[→ Installer manual smoke test](./docs/installer-testing.md)** — 13-step checklist for maintainers before tagging a release
- **[→ Design spec](./docs/superpowers/specs/2026-04-18-layperson-guest-installer-design.md)** — The one-shot installer redesign from April 2026

---

## 🧪 Testing

```bash
pnpm test         # 128 unit + integration tests across TS packages
pnpm test:e2e     # Playwright two-Chromium-contexts sync test
pnpm typecheck    # Strict TypeScript across the workspace
pnpm build        # Builds protocol, server, extension (Tauri installer builds via CI)
```

**Coverage:**
- `@nobar-party/protocol`: 28 tests (Zod schema validation, parse helpers)
- `@nobar-party/server`: 41 tests (code generator, rate limiter, room lifecycle, HTTP routes, real WebSocket integration)
- `@nobar-party/extension`: 51 tests (clock offset math, drift correction, video detection, storage, backoff, invite flow, popup helpers, version-check)
- `@nobar-party/installer`: 8 Rust unit tests (Chrome path detection, zip extraction, launch helpers, install config)
- **End-to-end**: Playwright launches two real Chromium contexts with the extension loaded unpacked, creates a room, and asserts play/pause/seek propagate across both, plus an invite-handoff scenario.

---

## 🔐 Security & privacy

- 🔒 All traffic is TLS-encrypted via Caddy's automatic Let's Encrypt
- 🚫 The signaling server **never sees video content** — only tiny JSON events
- 🗝️ **The room code is the only access control.** Anyone with the code can join — intentional trade-off for a personal tool. Don't share codes with strangers
- 🔨 Every incoming frame is validated with Zod; malformed or oversized frames (>16 KB) are dropped
- 💬 Chat is rendered via `textContent`, never `innerHTML` — XSS-safe by construction
- 🚦 Per-connection rate limiting (20 msgs/sec via token bucket) and per-IP connection caps
- 🛡️ Content scripts request only the minimum permissions needed (`storage`, `alarms`, `tabs`)
- 🧱 Content scripts never touch `chrome.storage.session` — only the service worker does (MV3 privilege separation)
- 🔐 The installer's webview runs with CSP, no remote content, bundles the extension into the OS app resources directory
- 👀 **No analytics, no tracking, no telemetry.** The code you read is the code that runs

---

## 🗺️ Roadmap

Planned for future versions (contributions welcome):

- [ ] Chrome Web Store listing (avoids the "Developer mode" dialog on Chrome startup)
- [ ] Firefox / MV3-compatible port
- [ ] Emoji reactions and live sentiment overlay
- [ ] Timestamped comments pinned to video moments
- [ ] Optional voice chat via WebRTC peer-to-peer
- [ ] Native messaging between installer and extension (auto-verify extension loaded, skip the drag-drop step)
- [ ] Code signing (Apple Developer ID + Windows EV cert) to eliminate SmartScreen/Gatekeeper warnings
- [ ] Linux `.AppImage` / `.deb` installer
- [ ] Intel macOS `.dmg` via `--target universal-apple-darwin`
- [ ] Demo mode — try the extension without a server (peer-to-peer signaling)
- [ ] Translations (en, id, es, pt-br, ja, zh)

---

## 🙋 FAQ

**Q: Does this work on Netflix / Disney+ / Hulu / YouTube / [regional streaming site]?**
Technically — yes, anywhere there's an HTML5 `<video>` element. Legally / practically — YouTube and most regional streaming sites work great. Big-name DRM-heavy services (Netflix, Disney+, HBO Max) sometimes actively block tampering with their players. Expect full success on YouTube and most regional embeds, partial success on the big-name DRM services. The project is designed to work *without* needing per-site special cases.

**Q: Will the developers run a public server so I don't have to?**
No — this is intentionally a self-hosted project. Running a public server would invite legal liability around what sites people use it on. The installation docs make self-hosting fast.

**Q: Do I need to keep the tab focused?**
Yes, for the video driver. The chat sidebar and WebSocket stay alive in the background via a Manifest V3 `chrome.alarms` keepalive, but video play/pause only fires when the tab is loaded.

**Q: How many people can be in a room?**
Default cap is 10, configurable via `MAX_ROOM_SIZE`. RAM usage is ~50 KB per connection — you could raise this to hundreds without noticing on a $4 VPS.

**Q: What happens when my Wi-Fi drops?**
The extension reconnects with exponential backoff (1s → 2s → 4s → 8s → 30s cap). Server keeps your room slot open for 30 seconds of grace before announcing "peer-left." On reconnect you re-sync from the current room state.

**Q: Why does Chrome show an "extensions in developer mode" dialog on every startup?**
Because the extension is sideloaded, not installed from the Chrome Web Store. Each startup Chrome shows a dismissible prompt. Clicking "Keep" remembers the choice for that session. Publishing to the Web Store (on the roadmap) would eliminate this.

**Q: Is this legal?**
The extension is. What you watch with it is your responsibility. The project authors don't endorse piracy and this tool explicitly doesn't integrate with or depend on any particular streaming site.

**Q: Why is the installer unsigned?**
Code-signing certificates cost money ($200-400/yr for a Windows EV cert, $99/yr for an Apple Developer ID). The project has no budget. SmartScreen (Windows) and Gatekeeper (macOS) will warn your guests once on install, click-through in ~10 seconds. If/when the project gets enough traction, signing is on the roadmap.

**Q: Can I change the noVNC basic-auth password / reuse the same Caddy for other subdomains?**
Yes. The Caddyfile is plain text on your VPS. Reuse is encouraged — the same Caddy can reverse-proxy Nobar Party's signaling alongside whatever else you host.

**Q: Why "Nobar"?**
It's Indonesian slang for *nonton bareng* — "watching together." The original developer is Indonesian, the name is short, and the `.com` landscape for "watch party" clones is saturated.

---

## 🤝 Contributing

This is a young project and PRs are welcome. Before opening one:

1. Read the [development guide](./docs/development.md) and the [wire protocol](./docs/protocol.md)
2. Check [open issues](https://github.com/alcunii/nobar-party/issues) — ask before you build, especially for larger features
3. Run `pnpm test && pnpm typecheck && pnpm build` locally before submitting

Good first contributions:
- Translate the popup UI strings to a new language
- Replace the placeholder installer icon with real artwork
- Add a real manual test on a streaming site you use
- Port to Firefox (Manifest V3 with WebExtensions)
- Add a Linux `.AppImage` target to the release workflow

---

## 📜 License

[MIT](./LICENSE) — do whatever you want, just don't blame me.

---

## 🌟 Star history

If Nobar Party saves you an awkward "ok, play… now!" count-down on Discord, please consider starring the repo — it's free, it helps other people find the project, and it means a lot.

<div align="center">

<a href="https://star-history.com/#alcunii/nobar-party&Date">
  <img src="https://api.star-history.com/svg?repos=alcunii/nobar-party&type=Date" alt="Star History Chart" width="600">
</a>

</div>

---

<div align="center">

**Built with ☕ by [@alcunii](https://github.com/alcunii) and contributors.**

<sub>Keywords: watch party chrome extension · teleparty alternative · netflix party alternative · self-hosted watch party · synchronized video playback · watch movies with friends online · open source · tauri installer · nobar · nonton bareng · manifest v3 · typescript · websocket · one click installer · let's encrypt · caddy</sub>

</div>
