import { describe, expect, it, beforeEach, vi } from "vitest";
import { Storage, PersistentKey, SessionKey } from "./storage.js";

function makeFakeChrome() {
  const local = new Map<string, unknown>();
  const session = new Map<string, unknown>();
  const mk = (m: Map<string, unknown>) => ({
    get: vi.fn(async (keys: string | string[]) => {
      const arr = Array.isArray(keys) ? keys : [keys];
      const out: Record<string, unknown> = {};
      for (const k of arr) if (m.has(k)) out[k] = m.get(k);
      return out;
    }),
    set: vi.fn(async (items: Record<string, unknown>) => {
      for (const [k, v] of Object.entries(items)) m.set(k, v);
    }),
    remove: vi.fn(async (keys: string | string[]) => {
      const arr = Array.isArray(keys) ? keys : [keys];
      for (const k of arr) m.delete(k);
    }),
  });
  return { storage: { local: mk(local), session: mk(session) } };
}

describe("Storage", () => {
  let fake: ReturnType<typeof makeFakeChrome>;
  beforeEach(() => {
    fake = makeFakeChrome();
    (globalThis as any).chrome = fake;
  });

  it("sets and gets a persistent value", async () => {
    const s = new Storage();
    await s.setLocal(PersistentKey.Nickname, "alice");
    expect(await s.getLocal(PersistentKey.Nickname)).toBe("alice");
  });

  it("returns undefined for missing key", async () => {
    const s = new Storage();
    expect(await s.getLocal(PersistentKey.ServerUrl)).toBeUndefined();
  });

  it("session storage is separate", async () => {
    const s = new Storage();
    await s.setSession(SessionKey.ActiveRoom, { roomId: "ABC234", nickname: "alice" });
    expect(await s.getSession(SessionKey.ActiveRoom)).toEqual({ roomId: "ABC234", nickname: "alice" });
    expect(await s.getLocal(PersistentKey.Nickname)).toBeUndefined();
  });

  it("stores and retrieves a pending invite", async () => {
    const s = new Storage();
    await s.setSession(SessionKey.PendingInvite, { roomCode: "ABC123" });
    const out = await s.getSession(SessionKey.PendingInvite);
    expect(out).toEqual({ roomCode: "ABC123" });
  });
});
