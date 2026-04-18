import { describe, it, expect } from "vitest";
import { renderLandingPage } from "./landing.js";

describe("renderLandingPage", () => {
  it("embeds the room id in the title and status area", () => {
    const html = renderLandingPage("ABC123");
    expect(html).toContain("ABC123");
    expect(html.toLowerCase()).toContain("<title>");
    expect(html.toLowerCase()).toContain("</html>");
  });

  it("contains both download links with stable filenames", () => {
    const html = renderLandingPage("ABC123");
    expect(html).toContain("NobarParty-windows.msi");
    expect(html).toContain("NobarParty-macos.dmg");
  });

  it("fetches /version to let hosts override download URLs", () => {
    const html = renderLandingPage("ABC123");
    expect(html).toContain('fetch("/version")');
    expect(html).toContain("downloadUrl");
  });

  it("listens for postMessage from the content script", () => {
    const html = renderLandingPage("ABC123");
    expect(html).toContain("addEventListener");
    expect(html).toContain("message");
    expect(html).toContain("nobar-config-saved");
  });

  it("html-escapes special characters in the room id parameter", () => {
    const safe = renderLandingPage("ABC123");
    const hostile = renderLandingPage("<script>alert(1)</script>");
    const countSafe = (safe.match(/<script>/g) || []).length;
    const countHostile = (hostile.match(/<script>/g) || []).length;
    expect(countHostile).toBe(countSafe);
    expect(hostile).toContain("&lt;script&gt;");
    expect(hostile).not.toContain("<script>alert(1)");
  });
});
