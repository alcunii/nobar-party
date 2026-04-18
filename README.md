<div align="center">

# 🎬 Nobar Party

**Watch videos in sync with your friends — on any site, from anywhere.**

*A free, open-source, self-hostable [Netflix Party](https://www.netflixparty.com) / [Teleparty](https://www.teleparty.com) alternative that works on more than just Netflix.*

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](./LICENSE)
[![Manifest V3](https://img.shields.io/badge/Chrome-Manifest%20V3-34a853?logo=googlechrome&logoColor=white)](https://developer.chrome.com/docs/extensions/mv3/intro/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.5-3178c6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Node.js](https://img.shields.io/badge/Node.js-20+-43853d?logo=node.js&logoColor=white)](https://nodejs.org/)
[![Tests](https://img.shields.io/badge/tests-74%20passing-success)](#-testing)
[![Self-hosted](https://img.shields.io/badge/self--hosted-yes-ff69b4)](./docs/self-hosting.md)
[![GitHub stars](https://img.shields.io/github/stars/alcunii/nobar-party?style=social)](https://github.com/alcunii/nobar-party/stargazers)

</div>

---

## What is Nobar Party?

**Nobar Party** is a Chrome extension that lets a small group of friends watch the same video together in perfect sync — *play, pause, and seek propagate to everyone in the room instantly* — with a built-in chat sidebar so you can react in real time.

It works on **any website that uses an HTML5 `<video>` element** (not just Netflix), so it fills the gap left by Teleparty's shrinking list of officially supported services. There's no cloud service to sign up for, no account to create, and no tracking — just a ~200-line [signaling server](./packages/server) you run on your own $4 VPS, and a [Chrome extension](./packages/extension) you sideload.

> **"Nobar"** is Indonesian slang for *nonton bareng* — "watching together."

### Who is this for?

- 👫 **Long-distance couples and friends** watching movies across time zones without a screen-share hack.
- 🎓 **Study groups and book clubs** following the same video lecture in lockstep.
- 🌐 **Open-source / privacy-minded users** who don't want a third-party service mediating their movie nights.
- 💻 **Developers** who want a clean, modern reference implementation of a real-time multi-user browser extension.

---

## ✨ Features

- 🎯 **Synchronized playback** — play, pause, and seek propagate to every peer within ~500 ms on a reasonable connection
- 🌍 **Works on any site with an HTML5 `<video>`** — no hardcoded host allowlist
- 🪟 **In-page chat sidebar** — text chat without switching tabs
- 🔗 **Opt-in URL broadcast** — when someone picks a new episode, you see a banner and one-click follow (never an auto-navigate surprise)
- 🎬 **Smart video detection** — auto-picks the main video, with manual override for sites that embed ads
- 🧠 **Drift-corrected sync** — NTP-lite clock-offset estimation keeps dialogue timing right even on flaky Wi-Fi
- 🔒 **Privacy by design** — no accounts, no analytics, no video content ever touches the server, only tiny JSON events
- 🏠 **100% self-hosted** — your friends, your server, your rules. MIT licensed, no vendor lock-in
- 🪶 **Tiny footprint** — ~200 LOC signaling server handles hundreds of concurrent rooms on a $4 VPS
- 🧪 **Rigorously tested** — 74 unit + integration tests and a Playwright end-to-end harness that launches two real Chromium instances

---

## 🖼️ How it works

```
┌─────────────── User A's Chrome ──────────────┐       ┌─────────────── User B's Chrome ──────────────┐
│                                              │       │                                              │
│   [popup]  →  [service_worker]  ←──── wss:// ┼───────┼→ [service_worker]  ←  [popup]                │
│                 ↕          ↕                 │       │     ↕         ↕                              │
│         [content script] [sidebar iframe]    │       │  [content]  [sidebar]                        │
│                 ↓                            │       │     ↓                                        │
│           drives <video>                     │       │   drives <video>                             │
└──────────────────────────────────────────────┘       └──────────────────────────────────────────────┘
                              ↕  wss:// (TLS)  ↕
                      ┌────────────────────────────┐
                      │ Your VPS (any $4 box)      │
                      │  Caddy → Node + ws         │
                      │  In-memory Map<roomId,…>   │
                      │  No database. No disk.     │
                      └────────────────────────────┘
```

1. Each user installs the extension (sideloaded — no Chrome Web Store listing required for v0.1).
2. Friend A clicks **Create room** → gets a 6-character code.
3. Friend B enters the code → **Join room**.
4. The extension finds the video on whichever page you're on and keeps everyone's playback in sync.
5. The chat sidebar slides in on the right.

The only shared infrastructure is a tiny signaling server that relays `{play, pause, seek, chat, url}` events — *the video itself never touches the server*. See the full [wire protocol](./docs/protocol.md) for details.

---

## 🆚 How does this compare to Teleparty / Netflix Party?

| | **Nobar Party** | Teleparty / Netflix Party |
|---|---|---|
| Site coverage | **Any site with HTML5 `<video>`** | Fixed allowlist (Netflix, Disney+, Hulu, HBO Max, Amazon Prime) |
| Hosting model | **Self-hosted** on your own VPS | Cloud SaaS |
| Privacy | **No accounts, no analytics, no server-side video** | Third-party service, analytics |
| Source code | **MIT, fully open** | Proprietary |
| Cost | **Free forever** (you pay your $4 VPS bill) | Free tier with paid upgrades |
| Chat | **Text sidebar** | Text sidebar + emoji reactions |
| Installation | Sideload (developer mode) | Chrome Web Store one-click |
| Cross-browser | **Chrome / Chromium / Edge / Brave** (Manifest V3) | Chrome + Edge |
| Voice / video | **Out of scope** — pair with Discord or Zoom | Not included |
| Mobile | ❌ Chrome extensions don't run on mobile | ❌ Same |

**TL;DR:** if you want a polished turnkey product with Netflix branding, pick Teleparty. If you want something that works on *the actual site you're trying to watch* and you don't mind spending 15 minutes on [self-hosting](./docs/self-hosting.md), pick Nobar Party.

---

## 🚀 Quick start

### For users (install the extension)

**Easy path (recommended):** Ask the host for their invite link (looks like
`https://watch.example.com/join?room=ABC123`) and open it in Chrome. Click the
Windows or macOS download button on that page, run the installer, follow the
5-screen wizard, and return to the invite tab when prompted. You'll drop into
the room automatically.

**Manual path:** If you'd rather build the extension yourself (or run Linux),
see [docs/development.md](./docs/development.md).

### For hosts (run the signaling server)

You need **one** server per friend-group, and it costs almost nothing to run.

**Minimum requirements:** Linux with systemd, 1 vCPU, 512 MB free RAM, Node 20+, Caddy 2+, a domain name pointing at your VPS.

```bash
git clone https://github.com/alcunii/nobar-party.git
cd nobar-party
pnpm install
pnpm --filter @nobar-party/server build

# Copy and edit the templates locally (never committed back)
sudo cp deploy/Caddyfile.example /etc/caddy/Caddyfile
sudo cp deploy/nobar-party.service.example /etc/systemd/system/nobar-party.service
# Edit both to use your domain and paths

sudo systemctl enable --now nobar-party
sudo systemctl reload caddy
```

Full step-by-step: **[→ docs/self-hosting.md](./docs/self-hosting.md)**

**Docker alternative:** `docker compose -f deploy/docker-compose.yml up -d` also works.

---

## 📚 Documentation

- **[→ Self-hosting guide](./docs/self-hosting.md)** — DNS → Caddy → systemd walkthrough
- **[→ Development guide](./docs/development.md)** — Local dev workflow + manual test checklist
- **[→ Wire protocol reference](./docs/protocol.md)** — For anyone building a compatible client or server

---

## 🏗️ Architecture

Three packages in a pnpm monorepo, zero circular dependencies:

| Package | Purpose |
|---|---|
| [`@nobar-party/protocol`](./packages/protocol) | Shared Zod schemas and TypeScript types for every wire message |
| [`@nobar-party/server`](./packages/server) | Node + [`ws`](https://github.com/websockets/ws) signaling server, in-memory rooms, no database |
| [`@nobar-party/extension`](./packages/extension) | Chrome extension — Manifest V3, TypeScript, built with [esbuild](https://esbuild.github.io/) |

**Key design choices:**

- **Democratic control** — anyone in the room can play, pause, seek. No "host" role.
- **Opt-in URL follow** — when the host navigates, peers get a banner, not a surprise navigate.
- **Auto-detect video with manual override** — biggest `<video>` wins, user can correct it.
- **500 ms echo-loop suppression window** — remote events don't rebroadcast via the native `play`/`pause` DOM events.
- **NTP-lite clock sync** — 3 pings on join, lowest-RTT wins, re-measures every 60 s.
- **Server knows nothing about the video** — only relays `{play, pause, seek, url, chat}` JSON.

---

## 🧪 Testing

```bash
pnpm test         # 74 unit + integration tests across all packages
pnpm test:e2e     # Playwright two-Chromium-contexts sync test
pnpm typecheck    # Strict TypeScript across the workspace
```

- **74 unit + integration tests passing**
  - `@nobar-party/protocol`: 28 tests (Zod schema validation, parse helpers)
  - `@nobar-party/server`: 20 tests (code generator, rate limiter, room lifecycle, real WebSocket integration)
  - `@nobar-party/extension`: 26 tests (clock offset math, drift correction, video detection, storage, backoff)
- **End-to-end**: Playwright launches two real Chromium contexts with the extension loaded unpacked, creates a room, and asserts play/pause/seek propagate across both.

---

## 🔐 Security & privacy

- 🔒 All traffic is TLS-encrypted via Caddy's automatic Let's Encrypt.
- 🚫 The signaling server **never sees video content** — only tiny JSON events (`play`, `pause`, `seek`, `chat`, `url`).
- 🗝️ **The room code is the only access control.** Anyone with the code can join — intentional trade-off for a personal tool. Don't share codes with strangers.
- 🔨 Every incoming frame is validated with Zod; malformed or oversized frames (>16 KB) are dropped.
- 💬 Chat is rendered via `textContent`, never `innerHTML` — XSS-safe by construction.
- 🚦 Per-connection rate limiting (20 msgs/sec via token bucket) and per-IP connection caps.
- 👀 **No analytics, no tracking, no telemetry.** The code you read is the code that runs.

---

## 🗺️ Roadmap

Planned for future versions (contributions welcome):

- [ ] Chrome Web Store listing (v0.2)
- [ ] Firefox / MV3-compatible port (v0.3)
- [ ] Emoji reactions and live sentiment overlay
- [ ] Timestamped comments pinned to video moments
- [ ] Optional voice chat via WebRTC peer-to-peer
- [ ] Prebuilt Docker image on GHCR
- [ ] Demo mode — try the extension without a server (peer-to-peer signaling)
- [ ] Translations (en, id, es, pt-br, ja, zh)

---

## 🙋 FAQ

**Q: Does this work on Netflix / Disney+ / Hulu / YouTube?**
Technically — yes, because those all use HTML5 `<video>`. Legally / practically — YouTube's aggressive DRM and some streaming services actively break tampering with their players. Expect full success on YouTube and most regional streaming embeds, partial success on big-name DRM-heavy services. The project is designed to work *without* needing per-site special cases.

**Q: Will the developers run a public server so I don't have to?**
No — this is intentionally a self-hosted project. Running a public server would invite legal liability around what sites people use it on. The installation docs make self-hosting fast.

**Q: Do I need to keep the tab focused?**
Yes, for the video driver. The chat sidebar and WebSocket stay alive in the background via a Manifest V3 `chrome.alarms` keepalive, but video play/pause only fires when the tab is loaded.

**Q: How many people can be in a room?**
Default cap is 10, configurable via `MAX_ROOM_SIZE`. RAM usage is ~50 KB per connection — you could raise this to hundreds without noticing on a $4 VPS.

**Q: What happens when my Wi-Fi drops?**
The extension reconnects with exponential backoff (1s → 2s → 4s → 8s → 30s cap). Server keeps your room slot open for 30 seconds of grace before announcing "peer-left." On reconnect you re-sync from the current room state.

**Q: Is this legal?**
The extension is. What you watch with it is your responsibility. The project authors don't endorse piracy and this tool explicitly doesn't integrate with or depend on any particular streaming site.

**Q: Why "Nobar"?**
It's Indonesian slang for *nonton bareng* — "watching together." The original developer is Indonesian, the name is short, and the `.com` landscape for "watch party" clones is saturated.

---

## 🤝 Contributing

This is a young project and PRs are welcome! Before opening one:

1. Read the [development guide](./docs/development.md) and the [wire protocol](./docs/protocol.md)
2. Check [open issues](https://github.com/alcunii/nobar-party/issues) — ask before you build, especially for larger features
3. Run `pnpm test && pnpm typecheck` locally before submitting

Good first contributions:
- Translate the popup UI strings to a new language
- Replace the placeholder icons with real artwork
- Add a real manual test on a streaming site you use
- Port to Firefox (Manifest V3 with WebExtensions)

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

<sub>Keywords: watch party chrome extension · netflix party alternative · teleparty alternative · self-hosted watch party · synchronized video playback · watch movies with friends online · open source · nobar · nonton bareng · manifest v3 · typescript · websocket · chrome extension · streaming sync</sub>

</div>
