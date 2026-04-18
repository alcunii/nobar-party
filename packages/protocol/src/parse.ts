import { ClientMessage } from "./client.js";
import { ServerMessage } from "./server.js";

export type ParseResult<T> =
  | { ok: true; value: T }
  | { ok: false; error: ParseError };

export interface ParseError {
  code: "too_large" | "invalid_json" | "schema";
  message: string;
}

export interface ParseOptions {
  maxBytes?: number;
}

const DEFAULT_MAX_BYTES = 16 * 1024;

function parseFrame<T>(
  data: string,
  schema: { parse: (v: unknown) => T },
  opts: ParseOptions
): ParseResult<T> {
  const maxBytes = opts.maxBytes ?? DEFAULT_MAX_BYTES;
  if (data.length > maxBytes) {
    return { ok: false, error: { code: "too_large", message: `frame exceeds ${maxBytes} bytes` } };
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(data);
  } catch (err) {
    return { ok: false, error: { code: "invalid_json", message: (err as Error).message } };
  }
  try {
    const value = schema.parse(parsed);
    return { ok: true, value };
  } catch (err) {
    return { ok: false, error: { code: "schema", message: (err as Error).message } };
  }
}

export function parseClientFrame(
  data: string,
  opts: ParseOptions = {}
): ParseResult<import("./client.js").ClientMessage> {
  return parseFrame(data, ClientMessage, opts);
}

export function parseServerFrame(
  data: string,
  opts: ParseOptions = {}
): ParseResult<import("./server.js").ServerMessage> {
  return parseFrame(data, ServerMessage, opts);
}
