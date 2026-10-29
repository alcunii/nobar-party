# Changelog

All notable changes to this project are documented here.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the
project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

Release tags are `installer-v<version>` and must match the version in
`package.json`; run `pnpm version:set <version>` to move every file that stamps
a version at once, and `pnpm version:check` to verify consistency.

## [Unreleased]

### Fixed

- `pnpm build` no longer fails on machines without a Rust toolchain. The root
  script now builds only the TypeScript packages; the Tauri installer is built
  explicitly with `pnpm build:installer` (as CI does).
- `pnpm test` works on a fresh clone. Server tests import
  `@nobar-party/protocol` through its package entry point, which is only
  populated by a build, so a `pretest` step now builds it first.
- Version numbers are consistent across `package.json`, the extension manifest,
  the Tauri config, and the version served by `/version`. They had drifted apart
  (0.1.0 vs 0.0.0 vs 0.1.11), which meant the update badge could never fire.

### Added

- `scripts/version.mjs` (`pnpm version:check`, `pnpm version:set <x.y.z>`) as the
  single source of truth for the shipped version.
- CI workflow running install, version check, build, typecheck, unit/integration
  tests on Node 20 and 22, plus the two-context Playwright E2E suite.
- Release workflow now produces a single published release per tag with both
  installers attached, and fails if the tag disagrees with `package.json`.

## [0.1.11] — 2026-04-18

Last release before this changelog existed. Content from the repository history:

### Added

- Layperson guest installer (Tauri 2) for Windows `.msi` and macOS `.dmg`, with
  stable artifact filenames so landing-page download links never break.
- `/join?room=CODE` landing page that hands the invite to the extension and
  reports install progress back to the page.
- `/version` endpoint backing an update-available badge in the extension popup.
- In-page chat sidebar with local echo, peer join/leave notices, and a
  follow-the-URL banner.
- NTP-lite clock-offset estimation, 500 ms echo suppression, exponential
  backoff reconnect.
- Playwright E2E harness driving two real Chrome contexts.

### Changed

- Chat messages now bridge from the sidebar iframe through the content script to
  the service worker instead of writing session storage from a content script.

### Fixed

- Join is queued until the socket opens, and the synced tab is chosen from
  non-extension web tabs.

### Security

- Every inbound frame validated with Zod and size-capped; chat rendered with
  `textContent`; per-connection token-bucket rate limiting.
