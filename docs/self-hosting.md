# Self-hosting Nobar Party

Run your own signaling server. The repo never contains your domain or IP — you fill them in locally from the `*.example` templates.

## 1. Prerequisites

- A VPS with a public IPv4 or IPv6 address (1 vCPU, 512 MB free RAM is plenty).
- A domain you control (e.g., `example.com`). A subdomain is fine.
- Node 20+ and Caddy 2+ on the VPS.

## 2. DNS

Point an A (or AAAA) record at your server:

```
watch.example.com  A  <your-server-ip>
```

## 3. Build

On your local machine or the VPS:

```bash
git clone https://github.com/<your-org>/nobar-party.git
cd nobar-party
pnpm install
pnpm --filter @nobar-party/server build
```

Copy `packages/server/` plus `packages/protocol/` and `node_modules/` (or rebuild on the VPS) to `/opt/nobar-party/`.

## 4. Caddy

Install Caddy, then:

```bash
sudo cp deploy/Caddyfile.example /etc/caddy/Caddyfile
sudo nano /etc/caddy/Caddyfile   # replace watch.example.com with your host
sudo systemctl reload caddy
```

Caddy auto-obtains a Let's Encrypt certificate on first request. `/etc/caddy/Caddyfile` is local to the host and must not be committed back to the repo.

## 5. systemd

```bash
sudo cp deploy/nobar-party.service.example /etc/systemd/system/nobar-party.service
sudo nano /etc/systemd/system/nobar-party.service   # adjust WorkingDirectory, User
sudo useradd --system --no-create-home nobar
sudo systemctl daemon-reload
sudo systemctl enable --now nobar-party
sudo journalctl -u nobar-party -f   # tail logs
```

## 6. Configure the extension

In the extension popup → Settings → Server URL, set `wss://watch.example.com`.

## 7. Verify

```bash
curl -i https://watch.example.com   # 426 Upgrade Required is good — it means Caddy + WS server are live.
```

## Security notes

- The room code is the only access control. Don't share it with strangers.
- On reconnect, the server's snapshot overrides your local state — if you paused during a drop, the room's state wins when you come back.
- `Caddyfile`, `nobar-party.service`, and `.env` must stay local. They are in `.gitignore` — do not force-add them.
