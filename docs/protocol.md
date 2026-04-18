# Nobar Party — Wire Protocol

Everything between extension and signaling server is JSON over a single WebSocket. All frames are validated with Zod schemas from `@nobar-party/protocol`.

## Connection

- `wss://watch.example.com` in production; `ws://localhost:3050` in dev.
- Max frame size: 16 KB (configurable via `FRAME_KB` env var).
- Binary frames are rejected with `{type:"error", code:"bad_request"}`.

## Message types

### Client → server

| `type`  | Fields | Notes |
|---------|--------|-------|
| `join`  | `roomId?`, `nickname`, `create?` | Either `create: true` (no roomId) or `roomId` provided |
| `leave` | — | Clean leave |
| `play`  | `t`, `at` | Broadcast play event (t = video seconds, at = wall-clock ms) |
| `pause` | `t`, `at` | Broadcast pause event |
| `seek`  | `t`, `at` | Broadcast seek event |
| `url`   | `url` | Current URL of the synced tab |
| `chat`  | `text` | Max 1000 chars |
| `ping`  | `at` | Latency probe |

### Server → client

| `type`         | Fields |
|----------------|--------|
| `room`         | `roomId`, `selfId`, `members`, `url`, `playing`, `t`, `at` |
| `peer-joined`  | `id`, `nickname` |
| `peer-left`    | `id` |
| `play`/`pause`/`seek` | echoed with `fromId` |
| `url`          | `url`, `fromId`, `nickname` |
| `chat`         | `text`, `fromId`, `nickname`, `at` |
| `pong`         | `at`, `serverAt` |
| `error`        | `code`, `message` |

## Error codes

- `room_full` — room at MAX_ROOM_SIZE
- `not_found` — join with unknown roomId
- `bad_request` — e.g. `create` with roomId, or `join` when already in a room
- `rate_limited` — >20 frames/sec
- `invalid` — malformed JSON or schema mismatch

## Clock sync

After `join`, send 3 `ping` frames 200 ms apart. Compute:

```
rtt    = nowReceived - ping.at
offset = serverAt - (ping.at + rtt/2)
```

Keep the lowest-RTT sample. Re-measure every 60 s.
