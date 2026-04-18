# Nobar Party

Synchronized video watch-along as a self-hostable Chrome extension + signaling server.

"Nobar" is Indonesian slang for *nonton bareng* — "watching together."

**Status:** in development. See `docs/superpowers/specs/2026-04-18-nobar-party-design.md` for the full design.

## Quick start (dev)

```bash
pnpm install
pnpm --filter @nobar-party/server dev     # terminal 1
pnpm --filter @nobar-party/extension dev  # terminal 2
```

Load the extension from `packages/extension/dist` via `chrome://extensions` in Developer mode.

## Self-hosting

See `docs/self-hosting.md`.

## License

MIT.
