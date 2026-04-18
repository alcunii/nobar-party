import { test, expect } from "@playwright/test";
import { startHarness, findExtensionId, type Harness } from "./utils/harness.js";

let h: Harness;

test.beforeAll(async () => { h = await startHarness(); });
test.afterAll(async () => { await h.cleanup(); });

// Full end-to-end of the /join content script handoff requires local HTTPS
// (the script rejects non-https origins). That's out of v1 scope. This spec
// verifies the popup's PendingInvite consumption: given a room code pre-
// seeded in session storage (as content_join would write), opening the popup
// pre-fills the room-code input and clears the pending entry.
test("popup consumes PendingInvite and prefills room code input", async () => {
  const ctx = h.userA;
  const extId = await findExtensionId(ctx);

  // Seed session storage with a pending invite + a server URL, as content_join
  // would write after a successful /join handoff.
  const seedPage = await ctx.newPage();
  await seedPage.goto(`chrome-extension://${extId}/popup.html`);
  await seedPage.evaluate(async () => {
    await chrome.storage.local.set({ serverUrl: "ws://127.0.0.1:3051" });
    await chrome.storage.session.set({ pendingInvite: { roomCode: "ABC123" } });
  });
  await seedPage.close();

  // Now open the popup fresh — init() should pick up the pending invite.
  const popupPage = await ctx.newPage();
  await popupPage.goto(`chrome-extension://${extId}/popup.html`);

  // Wait for init() to settle.
  await popupPage.waitForSelector("#idle-view:not([hidden])");

  const prefilled = await popupPage.inputValue("#room-code");
  expect(prefilled).toBe("ABC123");

  // Session entry should be cleared after consumption.
  const cleared = await popupPage.evaluate(async () => {
    const v = await chrome.storage.session.get("pendingInvite");
    return v.pendingInvite ?? null;
  });
  expect(cleared).toBeNull();
});
