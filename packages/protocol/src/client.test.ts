import { describe, expect, it } from "vitest";
import {
  ClientMessage,
  ClientJoin,
  ClientPlay,
  ClientChat,
  NICKNAME_MAX,
  CHAT_MAX,
  ROOM_CODE_LENGTH,
} from "./client.js";

describe("ClientJoin", () => {
  it("accepts a valid join with roomId", () => {
    const msg = { type: "join", roomId: "ABC234", nickname: "alice" };
    expect(ClientJoin.parse(msg)).toEqual(msg);
  });

  it("accepts a valid create request (no roomId)", () => {
    const msg = { type: "join", nickname: "alice", create: true };
    expect(ClientJoin.parse(msg)).toEqual(msg);
  });

  it("rejects nickname longer than NICKNAME_MAX", () => {
    const msg = { type: "join", roomId: "ABC234", nickname: "x".repeat(NICKNAME_MAX + 1) };
    expect(() => ClientJoin.parse(msg)).toThrow();
  });

  it("rejects empty nickname", () => {
    expect(() => ClientJoin.parse({ type: "join", roomId: "ABC234", nickname: "" })).toThrow();
  });

  it("rejects roomId of wrong length", () => {
    expect(() => ClientJoin.parse({ type: "join", roomId: "AB", nickname: "a" })).toThrow();
  });
});

describe("ClientPlay", () => {
  it("accepts a valid play event", () => {
    const msg = { type: "play", t: 12.5, at: 1776507500123 };
    expect(ClientPlay.parse(msg)).toEqual(msg);
  });

  it("rejects negative t", () => {
    expect(() => ClientPlay.parse({ type: "play", t: -1, at: 1 })).toThrow();
  });

  it("rejects non-integer at", () => {
    expect(() => ClientPlay.parse({ type: "play", t: 1, at: 1.5 })).toThrow();
  });
});

describe("ClientChat", () => {
  it("accepts a message up to CHAT_MAX chars", () => {
    const text = "x".repeat(CHAT_MAX);
    expect(ClientChat.parse({ type: "chat", text })).toEqual({ type: "chat", text });
  });

  it("rejects a message longer than CHAT_MAX", () => {
    const text = "x".repeat(CHAT_MAX + 1);
    expect(() => ClientChat.parse({ type: "chat", text })).toThrow();
  });

  it("rejects empty chat text", () => {
    expect(() => ClientChat.parse({ type: "chat", text: "" })).toThrow();
  });
});

describe("ClientMessage union", () => {
  it("parses each variant by type discriminator", () => {
    expect(ClientMessage.parse({ type: "leave" })).toEqual({ type: "leave" });
    expect(ClientMessage.parse({ type: "ping", at: 1 })).toEqual({ type: "ping", at: 1 });
    expect(ClientMessage.parse({ type: "seek", t: 1, at: 1 })).toEqual({ type: "seek", t: 1, at: 1 });
    expect(ClientMessage.parse({ type: "pause", t: 1, at: 1 })).toEqual({ type: "pause", t: 1, at: 1 });
    expect(ClientMessage.parse({ type: "url", url: "https://example.com/x" })).toEqual({
      type: "url",
      url: "https://example.com/x",
    });
  });

  it("rejects unknown type", () => {
    expect(() => ClientMessage.parse({ type: "evil" })).toThrow();
  });

  it("rejects url that is not a valid URL", () => {
    expect(() => ClientMessage.parse({ type: "url", url: "not a url" })).toThrow();
  });
});

describe("constants", () => {
  it("exposes ROOM_CODE_LENGTH = 6", () => {
    expect(ROOM_CODE_LENGTH).toBe(6);
  });
});
