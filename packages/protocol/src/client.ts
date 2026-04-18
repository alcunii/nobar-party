import { z } from "zod";

export const ROOM_CODE_LENGTH = 6;
export const NICKNAME_MAX = 32;
export const CHAT_MAX = 1000;

export const ROOM_CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";

const RoomIdSchema = z
  .string()
  .length(ROOM_CODE_LENGTH)
  .regex(new RegExp(`^[${ROOM_CODE_ALPHABET}]+$`));

const NicknameSchema = z.string().min(1).max(NICKNAME_MAX);

const VideoTimeSchema = z.number().nonnegative().finite();
const WallClockMsSchema = z.number().int().positive();

export const ClientJoin = z.object({
  type: z.literal("join"),
  roomId: RoomIdSchema.optional(),
  nickname: NicknameSchema,
  create: z.boolean().optional(),
});

export const ClientLeave = z.object({
  type: z.literal("leave"),
});

export const ClientPlay = z.object({
  type: z.literal("play"),
  t: VideoTimeSchema,
  at: WallClockMsSchema,
});

export const ClientPause = z.object({
  type: z.literal("pause"),
  t: VideoTimeSchema,
  at: WallClockMsSchema,
});

export const ClientSeek = z.object({
  type: z.literal("seek"),
  t: VideoTimeSchema,
  at: WallClockMsSchema,
});

export const ClientUrl = z.object({
  type: z.literal("url"),
  url: z.string().url().max(2048),
});

export const ClientChat = z.object({
  type: z.literal("chat"),
  text: z.string().min(1).max(CHAT_MAX),
});

export const ClientPing = z.object({
  type: z.literal("ping"),
  at: WallClockMsSchema,
});

export const ClientMessage = z.discriminatedUnion("type", [
  ClientJoin,
  ClientLeave,
  ClientPlay,
  ClientPause,
  ClientSeek,
  ClientUrl,
  ClientChat,
  ClientPing,
]);

export type ClientJoin = z.infer<typeof ClientJoin>;
export type ClientLeave = z.infer<typeof ClientLeave>;
export type ClientPlay = z.infer<typeof ClientPlay>;
export type ClientPause = z.infer<typeof ClientPause>;
export type ClientSeek = z.infer<typeof ClientSeek>;
export type ClientUrl = z.infer<typeof ClientUrl>;
export type ClientChat = z.infer<typeof ClientChat>;
export type ClientPing = z.infer<typeof ClientPing>;
export type ClientMessage = z.infer<typeof ClientMessage>;
