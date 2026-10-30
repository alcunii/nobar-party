import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  timeout: 60_000,
  fullyParallel: false,    // two-context tests share state
  // One worker: each spec file calls startHarness(), which binds the signaling
  // server to a fixed port (3051). Two files in parallel collide with
  // EADDRINUSE and the loser fails the whole run.
  workers: 1,
  reporter: "list",
  use: {
    headless: false,       // extensions require headed mode
    viewport: { width: 1280, height: 800 },
    trace: "retain-on-failure",
    video: "retain-on-failure",
  },
});
