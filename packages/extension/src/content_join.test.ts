import { describe, it, expect, beforeEach, vi } from "vitest";
import { maybeApplyInvite, InviteHandoffDeps } from "./content_join.js";

function deps(overrides: Partial<InviteHandoffDeps> = {}): InviteHandoffDeps {
  return {
    location: { protocol: "https:", host: "watch.example.com", pathname: "/join", search: "?room=ABC123" },
    setLocal: vi.fn().mockResolvedValue(undefined),
    setSession: vi.fn().mockResolvedValue(undefined),
    sendRuntime: vi.fn().mockResolvedValue(undefined),
    postToPage: vi.fn(),
    ...overrides,
  };
}

describe("maybeApplyInvite", () => {
  beforeEach(() => vi.clearAllMocks());

  it("writes storage + sends invite:received on a valid HTTPS /join with room code", async () => {
    const d = deps();
    const result = await maybeApplyInvite(d);
    expect(result).toBe(true);
    expect(d.setLocal).toHaveBeenCalledWith("serverUrl", "wss://watch.example.com");
    expect(d.setSession).toHaveBeenCalledWith("pendingInvite", { roomCode: "ABC123" });
    expect(d.sendRuntime).toHaveBeenCalledWith({
      kind: "invite:received",
      serverUrl: "wss://watch.example.com",
      roomCode: "ABC123",
    });
    expect(d.postToPage).toHaveBeenCalledWith({ type: "nobar-config-saved" });
  });

  it("rejects non-HTTPS origins", async () => {
    const d = deps({ location: { protocol: "http:", host: "watch.example.com", pathname: "/join", search: "?room=ABC123" } });
    expect(await maybeApplyInvite(d)).toBe(false);
    expect(d.setLocal).not.toHaveBeenCalled();
  });

  it("rejects wrong path", async () => {
    const d = deps({ location: { protocol: "https:", host: "watch.example.com", pathname: "/notjoin", search: "?room=ABC123" } });
    expect(await maybeApplyInvite(d)).toBe(false);
  });

  it("rejects missing room code", async () => {
    const d = deps({ location: { protocol: "https:", host: "watch.example.com", pathname: "/join", search: "" } });
    expect(await maybeApplyInvite(d)).toBe(false);
  });

  it("rejects badly-formatted room code (lowercase)", async () => {
    const d = deps({ location: { protocol: "https:", host: "watch.example.com", pathname: "/join", search: "?room=abc123" } });
    expect(await maybeApplyInvite(d)).toBe(false);
  });

  it("rejects badly-formatted room code (too long)", async () => {
    const d = deps({ location: { protocol: "https:", host: "watch.example.com", pathname: "/join", search: "?room=ABCDEFG" } });
    expect(await maybeApplyInvite(d)).toBe(false);
  });

  it("rejects non-alphanumeric room code", async () => {
    const d = deps({ location: { protocol: "https:", host: "watch.example.com", pathname: "/join", search: "?room=AB!123" } });
    expect(await maybeApplyInvite(d)).toBe(false);
  });
});
