import { describe, it, expect, vi } from "vitest";
import { handleInviteReceived, InviteDeps } from "./service_worker.invite.js";

function deps(nickname: string | undefined): InviteDeps {
  return {
    getNickname: vi.fn().mockResolvedValue(nickname),
    setServerUrl: vi.fn().mockResolvedValue(undefined),
    setPendingInvite: vi.fn().mockResolvedValue(undefined),
    joinRoom: vi.fn().mockResolvedValue(undefined),
  };
}

describe("handleInviteReceived", () => {
  it("stores server URL, pending invite, and joins room when nickname is set", async () => {
    const d = deps("alice");
    await handleInviteReceived({ serverUrl: "wss://x", roomCode: "ABC123" }, d);
    expect(d.setServerUrl).toHaveBeenCalledWith("wss://x");
    expect(d.setPendingInvite).toHaveBeenCalledWith({ roomCode: "ABC123" });
    expect(d.joinRoom).toHaveBeenCalledWith({ roomId: "ABC123", nickname: "alice" });
  });

  it("stores server URL and pending invite but does not join when no nickname yet", async () => {
    const d = deps(undefined);
    await handleInviteReceived({ serverUrl: "wss://x", roomCode: "ABC123" }, d);
    expect(d.setServerUrl).toHaveBeenCalledWith("wss://x");
    expect(d.setPendingInvite).toHaveBeenCalledWith({ roomCode: "ABC123" });
    expect(d.joinRoom).not.toHaveBeenCalled();
  });
});
