function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function renderLandingPage(roomId: string): string {
  const safe = escapeHtml(roomId);
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <title>Nobar Party — joining room ${safe}</title>
  <style>
    :root { color-scheme: dark light; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      max-width: 40rem; margin: 2rem auto; padding: 0 1rem; line-height: 1.5;
    }
    h1 { font-size: 1.5rem; margin-bottom: 0.25rem; }
    .room { font-family: ui-monospace, monospace; background: #0002; padding: 0.1em 0.4em; border-radius: 4px; }
    .status { margin: 1.5rem 0; padding: 1rem; border-radius: 8px; background: #0001; }
    .status.ok { background: #2a7a2e22; }
    .status.go { background: #1c6fb822; }
    .downloads a { display: inline-block; padding: 0.6rem 1rem; margin-right: 0.5rem; border-radius: 6px; background: #1c6fb8; color: white; text-decoration: none; }
    .downloads a.secondary { background: #0003; color: inherit; }
    .hint { font-size: 0.9rem; opacity: 0.8; margin-top: 1rem; }
  </style>
</head>
<body>
  <h1>Joining room <span class="room">${safe}</span></h1>
  <p>You're about to join a Nobar Party watch-along.</p>

  <div id="status" class="status">
    <div id="status-msg">Waiting for the extension…</div>
    <div class="hint">Keep this tab open while you install. We'll detect the extension and drop you into the room.</div>
  </div>

  <h2>Don't have the extension yet?</h2>
  <div class="downloads">
    <a id="dl-win" href="https://github.com/alcunii/nobar-party/releases/latest/download/NobarParty.msi">Download for Windows</a>
    <a id="dl-mac" class="secondary" href="https://github.com/alcunii/nobar-party/releases/latest/download/NobarParty.dmg">Download for macOS</a>
  </div>

  <script>
    (function () {
      try {
        var ua = navigator.userAgent;
        var win = /Windows/i.test(ua);
        var mac = /Macintosh|Mac OS X/i.test(ua);
        if (mac) {
          document.getElementById("dl-mac").classList.remove("secondary");
          document.getElementById("dl-win").classList.add("secondary");
        } else if (win) {
          // default — win primary
        }
      } catch (e) {}

      var msg = document.getElementById("status-msg");
      var statusEl = document.getElementById("status");
      window.addEventListener("message", function (ev) {
        if (!ev.data || typeof ev.data !== "object") return;
        if (ev.data.type === "nobar-config-saved") {
          statusEl.className = "status ok";
          msg.textContent = "Extension detected — writing config…";
          setTimeout(function () {
            statusEl.className = "status go";
            msg.textContent = "Joining room ${safe}…";
          }, 400);
        }
      });
    })();
  </script>
</body>
</html>`;
}
