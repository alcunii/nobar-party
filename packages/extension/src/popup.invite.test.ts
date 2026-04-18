import { describe, it, expect } from "vitest";
import { buildInviteUrl, wssToHttps } from "./popup.invite.js";

describe("wssToHttps", () => {
  it("maps wss:// to https://", () => {
    expect(wssToHttps("wss://watch.example.com")).toBe("https://watch.example.com");
  });
  it("maps ws:// to http://", () => {
    expect(wssToHttps("ws://localhost:3050")).toBe("http://localhost:3050");
  });
  it("returns other schemes unchanged", () => {
    expect(wssToHttps("https://x")).toBe("https://x");
  });
});

describe("buildInviteUrl", () => {
  it("produces /join?room=CODE with https origin", () => {
    expect(buildInviteUrl("wss://watch.example.com", "ABC123")).toBe(
      "https://watch.example.com/join?room=ABC123"
    );
  });
  it("strips trailing slashes from the server URL", () => {
    expect(buildInviteUrl("wss://watch.example.com/", "ABC123")).toBe(
      "https://watch.example.com/join?room=ABC123"
    );
  });
});
