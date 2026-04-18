# Development

## Prerequisites

- Node 20+
- pnpm 9+
- Chrome/Chromium (for loading the extension unpacked and running E2E tests)

## Setup

```bash
pnpm install
```

## Running locally

Two terminals:

```bash
# terminal 1
pnpm --filter @nobar-party/server dev

# terminal 2
pnpm --filter @nobar-party/extension dev
```

Load the extension:

1. Open `chrome://extensions`.
2. Enable **Developer mode**.
3. Click **Load unpacked**, pick `packages/extension/dist`.
4. Click the Nobar Party icon → nickname → Create room.

Dev server URL is baked in at `ws://localhost:3050`. Change it in the popup's Settings panel if you run the server elsewhere.

## Tests

```bash
pnpm test         # unit + integration (all packages)
pnpm test:e2e     # Playwright two-context sync test
pnpm typecheck    # tsc --noEmit across workspace
```

## Manual test checklist

Before shipping, run through this on a real embed site you trust:

- [ ] Create a room; join from a second browser profile.
- [ ] Play and pause on A; verify B follows within 1 second.
- [ ] Seek on A; verify B follows.
- [ ] Type a chat message from each side.
- [ ] Navigate the synced tab on A to a different URL; verify the banner appears for B.
- [ ] Click "Follow" on B; verify B navigates.
- [ ] Kill Wi-Fi for 10 seconds on B; verify it reconnects and re-syncs.
- [ ] Close the synced tab; verify the popup prompts to pick a new one.
