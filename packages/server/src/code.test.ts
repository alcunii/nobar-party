import { describe, expect, it } from "vitest";
import { generateRoomCode, ROOM_CODE_LENGTH, ROOM_CODE_ALPHABET } from "./code.js";

describe("generateRoomCode", () => {
  it("returns a string of ROOM_CODE_LENGTH", () => {
    expect(generateRoomCode()).toHaveLength(ROOM_CODE_LENGTH);
  });

  it("uses only alphabet characters", () => {
    const re = new RegExp(`^[${ROOM_CODE_ALPHABET}]+$`);
    for (let i = 0; i < 500; i++) {
      expect(generateRoomCode()).toMatch(re);
    }
  });

  it("never emits 0, O, 1, I, or L", () => {
    for (let i = 0; i < 1000; i++) {
      const code = generateRoomCode();
      expect(code).not.toMatch(/[0O1IL]/);
    }
  });

  it("accepts a deterministic RNG for testing", () => {
    let call = 0;
    const seeded = () => (call++ * 7919) % 1;
    const fixedRng = () => 0;
    expect(generateRoomCode(fixedRng)).toBe(ROOM_CODE_ALPHABET[0].repeat(ROOM_CODE_LENGTH));
  });
});
