import { describe, expect, it } from "vitest";
import {
  ServerMessage,
  ServerRoom,
  ServerPlay,
  ServerChat,
  ServerError,
} from "./server.js";

describe("ServerRoom snapshot", () => {
  it("accepts a full snapshot", () => {
    const msg = {
      type: "room",
      roomId: "ABC234",
      selfId: "c-1",
      members: [{ id: "c-1", nickname: "alice" }],
      url: null,
      playing: false,
      t: 0,
      at: 1776507500123,
    };
    expect(ServerRoom.parse(msg)).toEqual(msg);
  });

  it("rejects snapshot with non-string member nickname", () => {
    expect(() =>
      ServerRoom.parse({
        type: "room",
        roomId: "ABC234",
        selfId: "c-1",
        members: [{ id: "c-1", nickname: 42 }],
        url: null,
        playing: false,
        t: 0,
        at: 1,
      })
    ).toThrow();
  });
});

describe("ServerPlay", () => {
  it("accepts echoed play with fromId", () => {
    const msg = { type: "play", t: 12, at: 1, fromId: "c-2" };
    expect(ServerPlay.parse(msg)).toEqual(msg);
  });

  it("rejects missing fromId", () => {
    expect(() => ServerPlay.parse({ type: "play", t: 12, at: 1 })).toThrow();
  });
});

describe("ServerChat", () => {
  it("accepts echoed chat with nickname + fromId + at", () => {
    const msg = {
      type: "chat",
      text: "hello",
      fromId: "c-2",
      nickname: "bob",
      at: 1,
    };
    expect(ServerChat.parse(msg)).toEqual(msg);
  });
});

describe("ServerError", () => {
  it("accepts known codes", () => {
    for (const code of ["room_full", "rate_limited", "invalid", "not_found", "bad_request"] as const) {
      expect(ServerError.parse({ type: "error", code, message: "x" })).toBeTruthy();
    }
  });

  it("rejects unknown code", () => {
    expect(() => ServerError.parse({ type: "error", code: "oopsie", message: "x" })).toThrow();
  });
});

describe("ServerMessage union", () => {
  it("parses peer-joined / peer-left / pong / url", () => {
    expect(
      ServerMessage.parse({ type: "peer-joined", id: "c-2", nickname: "bob" })
    ).toBeTruthy();
    expect(ServerMessage.parse({ type: "peer-left", id: "c-2" })).toBeTruthy();
    expect(
      ServerMessage.parse({ type: "pong", at: 1, serverAt: 2 })
    ).toBeTruthy();
    expect(
      ServerMessage.parse({
        type: "url",
        url: "https://example.com/x",
        fromId: "c-2",
        nickname: "bob",
      })
    ).toBeTruthy();
  });
});
