import { describe, it, expect, vi } from "vitest";
import { isNewer, fetchLatest } from "./version-check.js";

describe("isNewer", () => {
  it("patch bump is newer", () => { expect(isNewer("1.0.0", "1.0.1")).toBe(true); });
  it("minor bump is newer", () => { expect(isNewer("1.0.0", "1.1.0")).toBe(true); });
  it("major bump is newer", () => { expect(isNewer("1.0.0", "2.0.0")).toBe(true); });
  it("same version is not newer", () => { expect(isNewer("1.2.3", "1.2.3")).toBe(false); });
  it("downgrade is not newer", () => { expect(isNewer("2.0.0", "1.9.9")).toBe(false); });
  it("rejects malformed versions gracefully", () => { expect(isNewer("1.0", "2.0.0")).toBe(false); });
});

describe("fetchLatest", () => {
  it("derives https URL from wss:// and returns parsed JSON", async () => {
    const fetchFn = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ version: "1.2.3", downloadUrl: { win: "https://e.com/w.msi", mac: "https://e.com/m.dmg" } }),
    } as Response);
    const out = await fetchLatest("wss://watch.example.com", fetchFn);
    expect(out?.version).toBe("1.2.3");
    expect(fetchFn).toHaveBeenCalledWith("https://watch.example.com/version");
  });

  it("returns null on network error", async () => {
    const fetchFn = vi.fn().mockRejectedValue(new Error("offline"));
    const out = await fetchLatest("wss://watch.example.com", fetchFn);
    expect(out).toBeNull();
  });

  it("returns null on 404", async () => {
    const fetchFn = vi.fn().mockResolvedValue({ ok: false, status: 404 } as Response);
    const out = await fetchLatest("wss://watch.example.com", fetchFn);
    expect(out).toBeNull();
  });

  it("returns null when JSON is malformed", async () => {
    const fetchFn = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ version: "not-semver", downloadUrl: { win: "https://e.com/w.msi", mac: "https://e.com/m.dmg" } }),
    } as Response);
    const out = await fetchLatest("wss://watch.example.com", fetchFn);
    expect(out).toBeNull();
  });
});
