# Nobar Party

**Watch videos in sync with friends, anywhere.** A Chrome extension + self-hostable signaling server that synchronizes play / pause / seek on any HTML5 `<video>` and adds a lightweight chat sidebar.

"Nobar" is Indonesian slang for *nonton bareng* — "watching together."

## Features

- Synchronized playback (play / pause / seek) across everyone in the room
- Works on third-party embed players (no cooperation from the host site)
- In-page chat sidebar
- Opt-in URL broadcast when someone navigates
- Self-hosted: you run the signaling server on your own VPS
- No accounts, no database, no tracking

## Quick start

### Development

```bash
pnpm install
pnpm --filter @nobar-party/server dev
pnpm --filter @nobar-party/extension dev
```

Load the extension from `packages/extension/dist` via `chrome://extensions` → Developer mode → Load unpacked.

See [`docs/development.md`](docs/development.md).

### Self-hosting

See [`docs/self-hosting.md`](docs/self-hosting.md) for a step-by-step guide: DNS → Caddy → systemd.

## Architecture

- `packages/protocol/` — shared Zod schemas and wire-format types
- `packages/server/` — Node + `ws` signaling server (in-memory rooms, no DB)
- `packages/extension/` — Chrome extension (Manifest V3, TypeScript)

Wire protocol reference: [`docs/protocol.md`](docs/protocol.md).

## Non-goals

- Voice or video chat (pair with Discord/Zoom)
- Cloud-hosted public service — self-host only
- Mobile (Chrome extensions don't run on mobile Chrome)

## License

MIT — see [`LICENSE`](LICENSE).
