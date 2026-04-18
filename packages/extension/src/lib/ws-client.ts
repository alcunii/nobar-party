import type { ClientMessage, ServerMessage } from "@nobar-party/protocol";
import { parseServerFrame } from "@nobar-party/protocol";

export const BACKOFF_BASE_MS = 1000;
export const BACKOFF_CAP_MS = 30_000;

export function nextBackoffMs(attempt: number): number {
  if (attempt <= 0) return BACKOFF_BASE_MS;
  return Math.min(BACKOFF_CAP_MS, BACKOFF_BASE_MS * 2 ** attempt);
}

type State = "idle" | "connecting" | "open" | "closed";

export interface WsClientOptions {
  url: string;
  onOpen(): void;
  onMessage(msg: ServerMessage): void;
  onClose(reconnectingInMs: number | null): void;
  onError(err: Error): void;
}

export class WsClient {
  private ws: WebSocket | null = null;
  private state: State = "idle";
  private attempt = 0;
  private reconnectTimer: number | null = null;
  private shouldReconnect = true;

  constructor(private readonly opts: WsClientOptions) {}

  connect(): void {
    if (this.state === "connecting" || this.state === "open") return;
    this.shouldReconnect = true;
    this.state = "connecting";
    try {
      this.ws = new WebSocket(this.opts.url);
    } catch (err) {
      this.opts.onError(err as Error);
      this.scheduleReconnect();
      return;
    }
    this.ws.onopen = () => {
      this.state = "open";
      this.attempt = 0;
      this.opts.onOpen();
    };
    this.ws.onmessage = (ev) => {
      const parsed = parseServerFrame(typeof ev.data === "string" ? ev.data : "");
      if (parsed.ok) this.opts.onMessage(parsed.value);
    };
    this.ws.onerror = () => this.opts.onError(new Error("WebSocket error"));
    this.ws.onclose = () => {
      this.state = "closed";
      this.ws = null;
      if (this.shouldReconnect) this.scheduleReconnect();
      else this.opts.onClose(null);
    };
  }

  send(msg: ClientMessage): boolean {
    if (this.state !== "open" || !this.ws) return false;
    this.ws.send(JSON.stringify(msg));
    return true;
  }

  disconnect(): void {
    this.shouldReconnect = false;
    if (this.reconnectTimer !== null) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    this.ws?.close();
  }

  private scheduleReconnect(): void {
    const delay = nextBackoffMs(this.attempt);
    this.attempt += 1;
    this.opts.onClose(delay);
    this.reconnectTimer = setTimeout(() => this.connect(), delay) as unknown as number;
  }
}
