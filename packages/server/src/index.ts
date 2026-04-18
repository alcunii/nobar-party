import { createServer } from "node:http";
import { WebSocketServer } from "ws";
import { loadConfig } from "./config.js";
import { RoomRegistry } from "./room.js";
import { ConnectionManager } from "./connection.js";
import { log } from "./log.js";
import { handleHttp } from "./http.js";
import { renderLandingPage } from "./landing.js";
import { loadVersionInfo } from "./version.js";

const cfg = loadConfig();
const registry = new RoomRegistry({ maxRoomSize: cfg.maxRoomSize, maxRooms: cfg.maxRooms });
const connections = new ConnectionManager(registry, cfg);
const versionInfo = loadVersionInfo();

const httpServer = createServer((req, res) => {
  void (async () => {
    const r = await handleHttp(
      { method: req.method ?? "GET", url: req.url ?? "/" },
      { versionInfo, landingHtml: renderLandingPage }
    );
    res.writeHead(r.status, r.headers);
    res.end(r.body);
  })();
});

const wss = new WebSocketServer({ noServer: true, maxPayload: cfg.frameBytes });

httpServer.on("upgrade", (req, socket, head) => {
  wss.handleUpgrade(req, socket, head, (ws) => {
    log.info("connection", { remote: req.socket.remoteAddress });
    connections.handle(ws);
  });
});

httpServer.listen(cfg.port, cfg.host, () => {
  log.info("listening", { host: cfg.host, port: cfg.port });
});

function shutdown(): void {
  log.info("shutting down");
  httpServer.close(() => process.exit(0));
  setTimeout(() => process.exit(1), 5000).unref();
}
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
