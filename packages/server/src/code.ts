import { ROOM_CODE_ALPHABET, ROOM_CODE_LENGTH } from "@nobar-party/protocol";

export { ROOM_CODE_ALPHABET, ROOM_CODE_LENGTH };

export function generateRoomCode(rng: () => number = Math.random): string {
  let code = "";
  for (let i = 0; i < ROOM_CODE_LENGTH; i++) {
    const idx = Math.floor(rng() * ROOM_CODE_ALPHABET.length);
    code += ROOM_CODE_ALPHABET[idx];
  }
  return code;
}
