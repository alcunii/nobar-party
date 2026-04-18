import { describe, it, expect } from "vitest";
import { renderLandingPage } from "./landing.js";

describe("renderLandingPage", () => {
  it("embeds the room id in the title and status area", () => {
    const html = renderLandingPage("ABC123");
    expect(html).toContain("ABC123");
    expect(html.toLowerCase()).toContain("<title>");
    expect(html.toLowerCase()).toContain("</html>");
  });

  it("contains both download links", () => {
    const html = renderLandingPage("ABC123");
    expect(html).toMatch(/releases.*\.msi/i);
    expect(html).toMatch(/releases.*\.dmg/i);
  });

  it("listens for postMessage from the content script", () => {
    const html = renderLandingPage("ABC123");
    expect(html).toContain("addEventListener");
    expect(html).toContain("message");
    expect(html).toContain("nobar-config-saved");
  });

  it("html-escapes special characters in the room id parameter", () => {
    const html = renderLandingPage("<script>");
    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;");
  });
});
