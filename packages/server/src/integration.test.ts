import { afterEach, beforeEach, beforeAll, afterAll, describe, expect, it } from "vitest";
import { createServer } from "node:http";
import { WebSocket, WebSocketServer } from "ws";
import { handleHttp } from "./http.js";
import { renderLandingPage } from "./landing.js";
import { RoomRegistry } from "./room.js";
import { ConnectionManager } from "./connection.js";
import type { ServerConfig } from "./config.js";
import type { ServerMessage, ClientMessage } from "@nobar-party/protocol";

const cfg: ServerConfig = {
  port: 0,
  host: "127.0.0.1",
  maxRoomSize: 10,
  maxRooms: 100,
  frameBytes: 16 * 1024,
  rateLimit: { capacity: 100, refillPerSec: 100 },
  graceMs: 100,
};

async function startServer() {
  const registry = new RoomRegistry({ maxRoomSize: cfg.maxRoomSize, maxRooms: cfg.maxRooms });
  const connections = new ConnectionManager(registry, cfg);
  const wss = new WebSocketServer({ host: cfg.host, port: 0, maxPayload: cfg.frameBytes });
  wss.on("connection", (ws) => connections.handle(ws));
  await new Promise<void>((resolve) => wss.once("listening", () => resolve()));
  const addr = wss.address();
  if (typeof addr === "string" || !addr) throw new Error("no addr");
  return { wss, url: `ws://${cfg.host}:${addr.port}` };
}

function openClient(url: string): Promise<WebSocket> {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(url);
    ws.once("open", () => resolve(ws));
    ws.once("error", reject);
  });
}

function waitFor<T extends ServerMessage>(
  ws: WebSocket,
  predicate: (m: ServerMessage) => m is T,
  timeoutMs = 2000
): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      ws.off("message", onMsg);
      reject(new Error("timeout waiting for message"));
    }, timeoutMs);
    const onMsg = (data: unknown) => {
      const msg = JSON.parse(String(data)) as ServerMessage;
      if (predicate(msg)) {
        clearTimeout(timer);
        ws.off("message", onMsg);
        resolve(msg);
      }
    };
    ws.on("message", onMsg);
  });
}

function send(ws: WebSocket, msg: ClientMessage): void {
  ws.send(JSON.stringify(msg));
}

describe("server integration", () => {
  let server: Awaited<ReturnType<typeof startServer>>;

  beforeEach(async () => {
    server = await startServer();
  });
  afterEach(async () => {
    server.wss.close();
  });

  it("relays play/pause/seek/chat between two peers", async () => {
    const a = await openClient(server.url);
    const b = await openClient(server.url);

    // A creates a room
    send(a, { type: "join", nickname: "alice", create: true });
    const aRoom = await waitFor(a, (m): m is Extract<ServerMessage, { type: "room" }> => m.type === "room");
    const roomId = aRoom.roomId;

    // B joins it
    send(b, { type: "join", nickname: "bob", roomId });
    await waitFor(b, (m): m is Extract<ServerMessage, { type: "room" }> => m.type === "room");
    await waitFor(a, (m): m is Extract<ServerMessage, { type: "peer-joined" }> => m.type === "peer-joined");

    // A plays → B receives
    send(a, { type: "play", t: 5, at: Date.now() });
    const bPlay = await waitFor(b, (m): m is Extract<ServerMessage, { type: "play" }> => m.type === "play");
    expect(bPlay.t).toBe(5);

    // A pauses → B receives
    send(a, { type: "pause", t: 6, at: Date.now() });
    const bPause = await waitFor(b, (m): m is Extract<ServerMessage, { type: "pause" }> => m.type === "pause");
    expect(bPause.t).toBe(6);

    // A seeks → B receives
    send(a, { type: "seek", t: 99, at: Date.now() });
    const bSeek = await waitFor(b, (m): m is Extract<ServerMessage, { type: "seek" }> => m.type === "seek");
    expect(bSeek.t).toBe(99);

    // A chats → B receives with nickname
    send(a, { type: "chat", text: "hello" });
    const bChat = await waitFor(b, (m): m is Extract<ServerMessage, { type: "chat" }> => m.type === "chat");
    expect(bChat.text).toBe("hello");
    expect(bChat.nickname).toBe("alice");

    a.close();
    b.close();
  });

  it("late joiner receives lastState snapshot", async () => {
    const a = await openClient(server.url);
    send(a, { type: "join", nickname: "alice", create: true });
    const aRoom = await waitFor(a, (m): m is Extract<ServerMessage, { type: "room" }> => m.type === "room");
    send(a, { type: "url", url: "https://example.com/ep2" });
    send(a, { type: "play", t: 42, at: Date.now() });
    await new Promise((r) => setTimeout(r, 50));

    const b = await openClient(server.url);
    send(b, { type: "join", nickname: "bob", roomId: aRoom.roomId });
    const bRoom = await waitFor(b, (m): m is Extract<ServerMessage, { type: "room" }> => m.type === "room");

    expect(bRoom.url).toBe("https://example.com/ep2");
    expect(bRoom.playing).toBe(true);
    expect(bRoom.t).toBe(42);

    a.close();
    b.close();
  });

  it("returns error for join on unknown room", async () => {
    const a = await openClient(server.url);
    send(a, { type: "join", nickname: "alice", roomId: "ZZZZZZ" });
    const err = await waitFor(
      a,
      (m): m is Extract<ServerMessage, { type: "error" }> => m.type === "error"
    );
    expect(err.code).toBe("not_found");
    a.close();
  });

  it("rejects a create request that also provides roomId", async () => {
    const a = await openClient(server.url);
    send(a, { type: "join", nickname: "alice", create: true, roomId: "ABC234" });
    const err = await waitFor(
      a,
      (m): m is Extract<ServerMessage, { type: "error" }> => m.type === "error"
    );
    expect(err.code).toBe("bad_request");
    a.close();
  });
});

describe("http routes (integration)", () => {
  let server: ReturnType<typeof createServer>;
  let port: number;

  beforeAll(async () => {
    const versionInfo = { version: "1.0.0", downloadUrl: { win: "https://e.com/w.msi", mac: "https://e.com/m.dmg" } };
    server = createServer((req, res) => {
      void (async () => {
        const r = await handleHttp(
          { method: req.method ?? "GET", url: req.url ?? "/" },
          { versionInfo, landingHtml: renderLandingPage }
        );
        res.writeHead(r.status, r.headers);
        res.end(r.body);
      })();
    });
    const wss = new WebSocketServer({ noServer: true });
    server.on("upgrade", (req, socket, head) => {
      wss.handleUpgrade(req, socket, head, () => { /* no-op */ });
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", () => resolve()));
    const addr = server.address();
    port = typeof addr === "object" && addr ? addr.port : 0;
  });

  afterAll(async () => { await new Promise<void>((resolve) => server.close(() => resolve())); });

  it("GET /version returns versionInfo JSON", async () => {
    const res = await fetch(`http://127.0.0.1:${port}/version`);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.version).toBe("1.0.0");
    expect(body.downloadUrl.win).toContain("msi");
  });

  it("GET /join?room=ABC123 returns landing HTML with the room code", async () => {
    const res = await fetch(`http://127.0.0.1:${port}/join?room=ABC123`);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type") ?? "").toContain("text/html");
    const body = await res.text();
    expect(body).toContain("ABC123");
  });

  it("GET /join with bad room code returns 400", async () => {
    const res = await fetch(`http://127.0.0.1:${port}/join?room=BAD`);
    expect(res.status).toBe(400);
  });

  it("GET /unknown returns 404", async () => {
    const res = await fetch(`http://127.0.0.1:${port}/unknown`);
    expect(res.status).toBe(404);
  });
});
