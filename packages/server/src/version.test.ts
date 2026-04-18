import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { readFileSync } from "node:fs";
import { loadVersionInfo, parseVersionInfo } from "./version.js";

vi.mock("node:fs", () => ({
  readFileSync: vi.fn(),
}));

describe("parseVersionInfo", () => {
  it("accepts well-formed JSON", () => {
    const out = parseVersionInfo(
      JSON.stringify({
        version: "1.2.3",
        downloadUrl: { win: "https://x/w.msi", mac: "https://x/m.dmg" },
      })
    );
    expect(out.version).toBe("1.2.3");
  });

  it("rejects missing version", () => {
    expect(() =>
      parseVersionInfo(JSON.stringify({ downloadUrl: { win: "x", mac: "y" } }))
    ).toThrow();
  });

  it("rejects missing download URLs", () => {
    expect(() =>
      parseVersionInfo(JSON.stringify({ version: "1.0.0", downloadUrl: { win: "x" } }))
    ).toThrow();
  });

  it("rejects non-JSON input", () => {
    expect(() => parseVersionInfo("oops")).toThrow();
  });
});

describe("loadVersionInfo", () => {
  beforeEach(() => vi.clearAllMocks());
  afterEach(() => vi.restoreAllMocks());

  it("reads and parses the sidecar file", () => {
    vi.mocked(readFileSync).mockReturnValue(
      JSON.stringify({
        version: "9.9.9",
        downloadUrl: { win: "https://example.com/w.msi", mac: "https://example.com/m.dmg" },
      }) as unknown as Buffer
    );
    const info = loadVersionInfo();
    expect(info.version).toBe("9.9.9");
  });
});
