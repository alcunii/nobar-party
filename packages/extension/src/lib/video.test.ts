import { describe, expect, it, beforeEach } from "vitest";
import { findBestVideo, videoSignature } from "./video.js";

function makeVideo(width: number, height: number, readyState: number, src = "http://v/x.mp4"): HTMLVideoElement {
  const v = document.createElement("video");
  v.src = src;
  // jsdom doesn't lay out; fake the bounding rect + readyState
  Object.defineProperty(v, "videoWidth", { value: width, configurable: true });
  Object.defineProperty(v, "videoHeight", { value: height, configurable: true });
  Object.defineProperty(v, "readyState", { value: readyState, configurable: true });
  v.getBoundingClientRect = () => ({
    x: 0, y: 0, width, height, top: 0, left: 0, right: width, bottom: height, toJSON() {}
  }) as DOMRect;
  return v;
}

describe("findBestVideo", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
  });

  it("returns null when no videos exist", () => {
    expect(findBestVideo(document)).toBeNull();
  });

  it("ignores videos with readyState 0 (no metadata)", () => {
    document.body.append(makeVideo(1920, 1080, 0));
    expect(findBestVideo(document)).toBeNull();
  });

  it("picks the largest loaded video", () => {
    const small = makeVideo(320, 240, 2);
    const big = makeVideo(1920, 1080, 2);
    document.body.append(small, big);
    expect(findBestVideo(document)).toBe(big);
  });

  it("prefers a loaded smaller video over an unloaded bigger one", () => {
    const bigUnloaded = makeVideo(1920, 1080, 0);
    const smallLoaded = makeVideo(400, 300, 2);
    document.body.append(bigUnloaded, smallLoaded);
    expect(findBestVideo(document)).toBe(smallLoaded);
  });
});

describe("videoSignature", () => {
  it("captures src and dimensions", () => {
    const v = makeVideo(100, 50, 2, "http://v/a.mp4");
    expect(videoSignature(v)).toBe("http://v/a.mp4|100x50");
  });
});
