import { describe, expect, it } from "vitest";
import { parseClientFrame, parseServerFrame } from "./parse.js";

describe("parseClientFrame", () => {
  it("parses a valid JSON client frame", () => {
    const result = parseClientFrame(JSON.stringify({ type: "ping", at: 1 }));
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.type).toBe("ping");
  });

  it("returns ok=false for non-JSON input", () => {
    const result = parseClientFrame("{not json");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("invalid_json");
  });

  it("returns ok=false for schema mismatch", () => {
    const result = parseClientFrame(JSON.stringify({ type: "ping" }));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("schema");
  });

  it("returns ok=false for oversize frame", () => {
    const big = JSON.stringify({ type: "chat", text: "x".repeat(17 * 1024) });
    const result = parseClientFrame(big, { maxBytes: 16 * 1024 });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("too_large");
  });
});

describe("parseServerFrame", () => {
  it("parses a valid server frame", () => {
    const result = parseServerFrame(JSON.stringify({ type: "pong", at: 1, serverAt: 2 }));
    expect(result.ok).toBe(true);
  });
});
