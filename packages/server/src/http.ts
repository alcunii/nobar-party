export interface HttpRequest {
  method: string;
  url: string;
}

export interface HttpResponse {
  status: number;
  headers: Record<string, string>;
  body: string;
}

export interface VersionInfo {
  version: string;
  downloadUrl: { win: string; mac: string };
}

export interface HttpDeps {
  versionInfo: VersionInfo;
  landingHtml: (roomId: string) => string;
}

const ROOM_RE = /^[A-Z0-9]{6}$/;

const CORS: Record<string, string> = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "GET,OPTIONS",
};

export async function handleHttp(req: HttpRequest, deps: HttpDeps): Promise<HttpResponse> {
  const url = new URL(req.url, "http://x");
  const path = url.pathname;

  if (req.method === "OPTIONS") {
    return { status: 204, headers: { ...CORS }, body: "" };
  }

  if (path === "/version") {
    if (req.method !== "GET") return text(405, "method not allowed");
    return {
      status: 200,
      headers: { ...CORS, "content-type": "application/json; charset=utf-8" },
      body: JSON.stringify(deps.versionInfo),
    };
  }

  if (path === "/join") {
    if (req.method !== "GET") return text(405, "method not allowed");
    const roomId = url.searchParams.get("room");
    if (!roomId || !ROOM_RE.test(roomId)) return text(400, "invalid room code");
    return {
      status: 200,
      headers: {
        ...CORS,
        "content-type": "text/html; charset=utf-8",
        "cache-control": "public, max-age=3600",
      },
      body: deps.landingHtml(roomId),
    };
  }

  return text(404, "not found");
}

function text(status: number, body: string): HttpResponse {
  return {
    status,
    headers: { ...CORS, "content-type": "text/plain; charset=utf-8" },
    body,
  };
}
