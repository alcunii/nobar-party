import { randomUUID } from "node:crypto";
import type { WebSocket } from "ws";
import {
  parseClientFrame,
  ServerMessage,
  ClientMessage,
} from "@nobar-party/protocol";
import { RoomRegistry, Room, Member } from "./room.js";
import { TokenBucket } from "./ratelimit.js";
import { log } from "./log.js";
import type { ServerConfig } from "./config.js";

interface ConnCtx {
  id: string;
  ws: WebSocket;
  bucket: TokenBucket;
  room: Room | null;
  member: Member | null;
  graceTimer: NodeJS.Timeout | null;
}

export class ConnectionManager {
  private readonly conns = new Set<ConnCtx>();
  private readonly pendingGraceByMember = new Map<string, ConnCtx>();

  constructor(
    private readonly registry: RoomRegistry,
    private readonly cfg: ServerConfig
  ) {}

  handle(ws: WebSocket): void {
    const ctx: ConnCtx = {
      id: randomUUID(),
      ws,
      bucket: new TokenBucket(this.cfg.rateLimit),
      room: null,
      member: null,
      graceTimer: null,
    };
    this.conns.add(ctx);

    ws.on("message", (data, isBinary) => {
      if (isBinary) {
        this.send(ctx, { type: "error", code: "bad_request", message: "binary frames not allowed" });
        return;
      }
      const text = typeof data === "string" ? data : data.toString("utf8");
      if (!ctx.bucket.tryConsume(1)) {
        this.send(ctx, { type: "error", code: "rate_limited", message: "slow down" });
        return;
      }
      const parsed = parseClientFrame(text, { maxBytes: this.cfg.frameBytes });
      if (!parsed.ok) {
        this.send(ctx, { type: "error", code: "invalid", message: parsed.error.message });
        return;
      }
      this.dispatch(ctx, parsed.value);
    });

    ws.on("close", () => {
      this.conns.delete(ctx);
      this.onDisconnect(ctx);
    });
    ws.on("error", (err) => log.warn("ws error", { id: ctx.id, err: String(err) }));
  }

  private dispatch(ctx: ConnCtx, msg: ClientMessage): void {
    switch (msg.type) {
      case "join": return this.onJoin(ctx, msg);
      case "leave": return this.onLeave(ctx);
      case "play":
      case "pause":
      case "seek":  return this.onPlayback(ctx, msg);
      case "url":   return this.onUrl(ctx, msg);
      case "chat":  return this.onChat(ctx, msg);
      case "ping":  return this.onPing(ctx, msg);
    }
  }

  private onJoin(ctx: ConnCtx, msg: Extract<ClientMessage, { type: "join" }>): void {
    if (ctx.room) {
      this.send(ctx, { type: "error", code: "bad_request", message: "already in a room" });
      return;
    }
    let room: Room | undefined;
    if (msg.create) {
      if (msg.roomId) {
        this.send(ctx, { type: "error", code: "bad_request", message: "create must omit roomId" });
        return;
      }
      const result = this.registry.create();
      if (!result.ok) {
        this.send(ctx, { type: "error", code: "room_full", message: "server at max rooms" });
        return;
      }
      room = result.room;
    } else {
      if (!msg.roomId) {
        this.send(ctx, { type: "error", code: "bad_request", message: "roomId required" });
        return;
      }
      room = this.registry.get(msg.roomId);
      if (!room) {
        this.send(ctx, { type: "error", code: "not_found", message: "room not found" });
        return;
      }
    }

    const admit = room.tryAdmit({ id: ctx.id, nickname: msg.nickname });
    if (!admit.ok) {
      this.send(ctx, { type: "error", code: "room_full", message: "room at capacity" });
      return;
    }

    ctx.room = room;
    ctx.member = admit.member;

    const state = room.lastState ?? { url: null, playing: false, t: 0, at: Date.now() };
    this.send(ctx, {
      type: "room",
      roomId: room.id,
      selfId: ctx.id,
      members: room.memberList().map((m) => ({ id: m.id, nickname: m.displayName })),
      url: state.url,
      playing: state.playing,
      t: state.t,
      at: state.at,
    });
    this.broadcast(room, ctx.id, {
      type: "peer-joined",
      id: ctx.id,
      nickname: admit.member.displayName,
    });
  }

  private onLeave(ctx: ConnCtx): void {
    const room = ctx.room;
    const member = ctx.member;
    if (!room || !member) return;
    room.remove(member.id);
    this.broadcast(room, ctx.id, { type: "peer-left", id: member.id });
    ctx.room = null;
    ctx.member = null;
  }

  private onPlayback(
    ctx: ConnCtx,
    msg: Extract<ClientMessage, { type: "play" | "pause" | "seek" }>
  ): void {
    if (!ctx.room || !ctx.member) return;
    if (msg.type !== "seek") {
      ctx.room.updateState({
        url: ctx.room.lastState?.url ?? null,
        playing: msg.type === "play",
        t: msg.t,
        at: msg.at,
      });
    } else {
      ctx.room.updateState({
        url: ctx.room.lastState?.url ?? null,
        playing: ctx.room.lastState?.playing ?? false,
        t: msg.t,
        at: msg.at,
      });
    }
    this.broadcast(ctx.room, ctx.id, {
      type: msg.type,
      t: msg.t,
      at: msg.at,
      fromId: ctx.id,
    });
  }

  private onUrl(ctx: ConnCtx, msg: Extract<ClientMessage, { type: "url" }>): void {
    if (!ctx.room || !ctx.member) return;
    ctx.room.updateState({
      url: msg.url,
      playing: false,
      t: 0,
      at: Date.now(),
    });
    this.broadcast(ctx.room, ctx.id, {
      type: "url",
      url: msg.url,
      fromId: ctx.id,
      nickname: ctx.member.displayName,
    });
  }

  private onChat(ctx: ConnCtx, msg: Extract<ClientMessage, { type: "chat" }>): void {
    if (!ctx.room || !ctx.member) return;
    this.broadcast(ctx.room, ctx.id, {
      type: "chat",
      text: msg.text,
      fromId: ctx.id,
      nickname: ctx.member.displayName,
      at: Date.now(),
    });
  }

  private onPing(ctx: ConnCtx, msg: Extract<ClientMessage, { type: "ping" }>): void {
    this.send(ctx, { type: "pong", at: msg.at, serverAt: Date.now() });
  }

  private onDisconnect(ctx: ConnCtx): void {
    const room = ctx.room;
    const member = ctx.member;
    if (!room || !member) return;
    // 30 s grace for clean reconnect. For v1 we announce leave immediately after grace.
    // (A reconnecting client uses a new ctx.id, so we keep this simple: just announce after grace.)
    ctx.graceTimer = setTimeout(() => {
      room.remove(member.id);
      this.broadcast(room, member.id, { type: "peer-left", id: member.id });
    }, this.cfg.graceMs);
  }

  private broadcast(room: Room, exceptId: string, msg: ServerMessage): void {
    for (const c of this.conns) {
      if (c.room !== room) continue;
      if (c.id === exceptId) continue;
      this.send(c, msg);
    }
  }

  private send(ctx: ConnCtx, msg: ServerMessage): void {
    if (ctx.ws.readyState !== ctx.ws.OPEN) return;
    ctx.ws.send(JSON.stringify(msg));
  }
}
