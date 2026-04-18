import { WebSocketServer } from "ws";
import { loadConfig } from "./config.js";
import { RoomRegistry } from "./room.js";
import { ConnectionManager } from "./connection.js";
import { log } from "./log.js";

const cfg = loadConfig();
const registry = new RoomRegistry({ maxRoomSize: cfg.maxRoomSize, maxRooms: cfg.maxRooms });
const connections = new ConnectionManager(registry, cfg);

const wss = new WebSocketServer({
  host: cfg.host,
  port: cfg.port,
  maxPayload: cfg.frameBytes,
});

wss.on("connection", (ws, req) => {
  log.info("connection", { remote: req.socket.remoteAddress });
  connections.handle(ws);
});

wss.on("listening", () => log.info("listening", { host: cfg.host, port: cfg.port }));

function shutdown(): void {
  log.info("shutting down");
  wss.close(() => process.exit(0));
  setTimeout(() => process.exit(1), 5000).unref();
}
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
