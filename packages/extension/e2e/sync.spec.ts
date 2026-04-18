import { test, expect, type Page } from "@playwright/test";
import { startHarness, findExtensionId, type Harness } from "./utils/harness.js";

let h: Harness;

test.beforeAll(async () => { h = await startHarness(); });
test.afterAll(async () => { await h.cleanup(); });

async function prepareUser(ctxIndex: 0 | 1, nickname: string): Promise<{
  page: Page; popupPage: Page; extId: string;
}> {
  const ctx = ctxIndex === 0 ? h.userA : h.userB;
  const extId = await findExtensionId(ctx);

  // Configure the server URL in storage directly (skip the popup's settings UI).
  const cfgPage = await ctx.newPage();
  await cfgPage.goto(`chrome-extension://${extId}/popup.html`);
  await cfgPage.evaluate(async (url) => {
    await chrome.storage.local.set({ serverUrl: url, nickname: "" });
  }, `ws://127.0.0.1:3051`);
  await cfgPage.close();

  const page = await ctx.newPage();
  await page.goto(`http://127.0.0.1:${h.httpPort}/page.html`);

  const popupPage = await ctx.newPage();
  await popupPage.goto(`chrome-extension://${extId}/popup.html`);
  await popupPage.fill("#nickname", nickname);
  return { page, popupPage, extId };
}

test("two peers sync play/pause/seek and chat", async () => {
  const A = await prepareUser(0, "alice");
  const B = await prepareUser(1, "bob");

  // A creates a room
  await A.popupPage.click("#create-btn");
  await A.popupPage.waitForSelector("#room-view:not([hidden])");
  const roomTitle = await A.popupPage.textContent("#room-title");
  const roomId = (roomTitle || "").replace(/^Room /, "").trim();
  expect(roomId).toMatch(/^[A-Z2-9]{6}$/);

  // B joins it
  await B.popupPage.fill("#room-code", roomId);
  await B.popupPage.click("#join-btn");
  await B.popupPage.waitForSelector("#room-view:not([hidden])");

  // A plays → B's video plays within 2 s
  await A.page.evaluate(() => {
    const v = document.getElementById("v") as HTMLVideoElement;
    v.currentTime = 1;
    void v.play();
  });
  await B.page.waitForFunction(
    () => !(document.getElementById("v") as HTMLVideoElement).paused,
    null,
    { timeout: 4000 }
  );

  // A pauses → B pauses
  await A.page.evaluate(() => {
    const v = document.getElementById("v") as HTMLVideoElement;
    v.pause();
  });
  await B.page.waitForFunction(
    () => (document.getElementById("v") as HTMLVideoElement).paused,
    null,
    { timeout: 4000 }
  );

  // A seeks to 3 s → B's currentTime within 0.6 s of 3
  await A.page.evaluate(() => {
    const v = document.getElementById("v") as HTMLVideoElement;
    v.currentTime = 3;
  });
  await B.page.waitForFunction(
    () => {
      const v = document.getElementById("v") as HTMLVideoElement;
      return Math.abs(v.currentTime - 3) < 0.6;
    },
    null,
    { timeout: 4000 }
  );
});
