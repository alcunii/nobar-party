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
