import { z } from "zod";

const ClientIdSchema = z.string().min(1).max(64);
const WallClockMsSchema = z.number().int().positive();
const VideoTimeSchema = z.number().nonnegative().finite();

export const ServerRoom = z.object({
  type: z.literal("room"),
  roomId: z.string(),
  selfId: ClientIdSchema,
  members: z.array(
    z.object({ id: ClientIdSchema, nickname: z.string() })
  ),
  url: z.string().url().nullable(),
  playing: z.boolean(),
  t: VideoTimeSchema,
  at: WallClockMsSchema,
});

export const ServerPeerJoined = z.object({
  type: z.literal("peer-joined"),
  id: ClientIdSchema,
  nickname: z.string(),
});

export const ServerPeerLeft = z.object({
  type: z.literal("peer-left"),
  id: ClientIdSchema,
});

export const ServerPlay = z.object({
  type: z.literal("play"),
  t: VideoTimeSchema,
  at: WallClockMsSchema,
  fromId: ClientIdSchema,
});

export const ServerPause = z.object({
  type: z.literal("pause"),
  t: VideoTimeSchema,
  at: WallClockMsSchema,
  fromId: ClientIdSchema,
});

export const ServerSeek = z.object({
  type: z.literal("seek"),
  t: VideoTimeSchema,
  at: WallClockMsSchema,
  fromId: ClientIdSchema,
});

export const ServerUrl = z.object({
  type: z.literal("url"),
  url: z.string().url().max(2048),
  fromId: ClientIdSchema,
  nickname: z.string(),
});

export const ServerChat = z.object({
  type: z.literal("chat"),
  text: z.string().min(1).max(1000),
  fromId: ClientIdSchema,
  nickname: z.string(),
  at: WallClockMsSchema,
});

export const ServerPong = z.object({
  type: z.literal("pong"),
  at: WallClockMsSchema,
  serverAt: WallClockMsSchema,
});

export const ServerErrorCode = z.enum([
  "room_full",
  "rate_limited",
  "invalid",
  "not_found",
  "bad_request",
]);

export const ServerError = z.object({
  type: z.literal("error"),
  code: ServerErrorCode,
  message: z.string(),
});

export const ServerMessage = z.discriminatedUnion("type", [
  ServerRoom,
  ServerPeerJoined,
  ServerPeerLeft,
  ServerPlay,
  ServerPause,
  ServerSeek,
  ServerUrl,
  ServerChat,
  ServerPong,
  ServerError,
]);

export type ServerRoom = z.infer<typeof ServerRoom>;
export type ServerPeerJoined = z.infer<typeof ServerPeerJoined>;
export type ServerPeerLeft = z.infer<typeof ServerPeerLeft>;
export type ServerPlay = z.infer<typeof ServerPlay>;
export type ServerPause = z.infer<typeof ServerPause>;
export type ServerSeek = z.infer<typeof ServerSeek>;
export type ServerUrl = z.infer<typeof ServerUrl>;
export type ServerChat = z.infer<typeof ServerChat>;
export type ServerPong = z.infer<typeof ServerPong>;
export type ServerError = z.infer<typeof ServerError>;
export type ServerMessage = z.infer<typeof ServerMessage>;
