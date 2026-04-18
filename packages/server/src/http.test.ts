import { describe, it, expect } from "vitest";
import { handleHttp, HttpResponse } from "./http.js";

function req(method: string, url: string): { method: string; url: string } {
  return { method, url };
}

describe("handleHttp", () => {
  it("returns 404 for unknown routes", async () => {
    const res = await handleHttp(req("GET", "/nope"), {
      versionInfo: { version: "1.0.0", downloadUrl: { win: "", mac: "" } },
      landingHtml: () => "<html></html>",
    });
    expect(res.status).toBe(404);
  });

  it("returns 405 for non-GET on known routes", async () => {
    const res = await handleHttp(req("POST", "/version"), {
      versionInfo: { version: "1.0.0", downloadUrl: { win: "", mac: "" } },
      landingHtml: () => "<html></html>",
    });
    expect(res.status).toBe(405);
  });

  it("returns 204 with CORS for OPTIONS preflight on any path", async () => {
    const res = await handleHttp(req("OPTIONS", "/version"), {
      versionInfo: { version: "1.0.0", downloadUrl: { win: "", mac: "" } },
      landingHtml: () => "<html></html>",
    });
    expect(res.status).toBe(204);
    expect(res.headers["access-control-allow-origin"]).toBe("*");
    expect(res.headers["access-control-allow-methods"]).toBe("GET,OPTIONS");
    expect(res.body).toBe("");
  });

  it("returns version JSON with CORS", async () => {
    const res = await handleHttp(req("GET", "/version"), {
      versionInfo: { version: "1.2.3", downloadUrl: { win: "W", mac: "M" } },
      landingHtml: () => "<html></html>",
    });
    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toContain("application/json");
    expect(res.headers["access-control-allow-origin"]).toBe("*");
    expect(JSON.parse(res.body)).toEqual({
      version: "1.2.3",
      downloadUrl: { win: "W", mac: "M" },
    });
  });

  it("returns landing HTML for /join?room=ABC123", async () => {
    let seen: string | null = null;
    const res = await handleHttp(req("GET", "/join?room=ABC123"), {
      versionInfo: { version: "1.0.0", downloadUrl: { win: "", mac: "" } },
      landingHtml: (roomId) => { seen = roomId; return `<html>${roomId}</html>`; },
    });
    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toContain("text/html");
    expect(res.headers["cache-control"]).toContain("max-age=3600");
    expect(seen).toBe("ABC123");
    expect(res.body).toContain("ABC123");
  });

  it("returns 400 for /join without valid room code", async () => {
    const res = await handleHttp(req("GET", "/join?room=bad!"), {
      versionInfo: { version: "1.0.0", downloadUrl: { win: "", mac: "" } },
      landingHtml: () => "<html></html>",
    });
    expect(res.status).toBe(400);
  });

  it("returns 400 for /join missing room", async () => {
    const res = await handleHttp(req("GET", "/join"), {
      versionInfo: { version: "1.0.0", downloadUrl: { win: "", mac: "" } },
      landingHtml: () => "<html></html>",
    });
    expect(res.status).toBe(400);
  });
});
