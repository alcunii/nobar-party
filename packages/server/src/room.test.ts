import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { RoomRegistry } from "./room.js";

describe("RoomRegistry", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("creates a room with a generated code", () => {
    const reg = new RoomRegistry({ maxRoomSize: 10, maxRooms: 100 });
    const r = reg.create();
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.room.id).toHaveLength(6);
  });

  it("rejects create when MAX_ROOMS reached", () => {
    const reg = new RoomRegistry({ maxRoomSize: 10, maxRooms: 2 });
    expect(reg.create().ok).toBe(true);
    expect(reg.create().ok).toBe(true);
    expect(reg.create().ok).toBe(false);
  });

  it("joining returns the existing room", () => {
    const reg = new RoomRegistry({ maxRoomSize: 10, maxRooms: 100 });
    const created = reg.create();
    if (!created.ok) throw new Error("unreachable");
    const joined = reg.get(created.room.id);
    expect(joined?.id).toBe(created.room.id);
  });

  it("rejects join when room at capacity", () => {
    const reg = new RoomRegistry({ maxRoomSize: 2, maxRooms: 100 });
    const { room } = reg.create() as { ok: true; room: any };
    const res1 = room.tryAdmit({ id: "a", nickname: "alice" });
    const res2 = room.tryAdmit({ id: "b", nickname: "bob" });
    const res3 = room.tryAdmit({ id: "c", nickname: "carol" });
    expect(res1.ok).toBe(true);
    expect(res2.ok).toBe(true);
    expect(res3.ok).toBe(false);
    if (!res3.ok) expect(res3.error).toBe("room_full");
  });

  it("assigns collision-safe displayName for duplicate nicknames", () => {
    const reg = new RoomRegistry({ maxRoomSize: 10, maxRooms: 100 });
    const { room } = reg.create() as { ok: true; room: any };
    const a = room.tryAdmit({ id: "1", nickname: "alice" });
    const b = room.tryAdmit({ id: "2", nickname: "alice" });
    const c = room.tryAdmit({ id: "3", nickname: "alice" });
    if (!a.ok || !b.ok || !c.ok) throw new Error("unreachable");
    expect(a.member.displayName).toBe("alice");
    expect(b.member.displayName).toBe("alice (2)");
    expect(c.member.displayName).toBe("alice (3)");
  });

  it("evicts empty room after 5 minutes", () => {
    const reg = new RoomRegistry({ maxRoomSize: 10, maxRooms: 100 });
    const { room } = reg.create() as { ok: true; room: any };
    const admitted = room.tryAdmit({ id: "1", nickname: "alice" });
    if (!admitted.ok) throw new Error("unreachable");
    room.remove("1");
    expect(reg.get(room.id)).toBeDefined();
    vi.advanceTimersByTime(5 * 60 * 1000 + 1);
    expect(reg.get(room.id)).toBeUndefined();
  });

  it("cancels eviction if a peer rejoins before the timer fires", () => {
    const reg = new RoomRegistry({ maxRoomSize: 10, maxRooms: 100 });
    const { room } = reg.create() as { ok: true; room: any };
    room.tryAdmit({ id: "1", nickname: "alice" });
    room.remove("1");
    vi.advanceTimersByTime(60_000);
    room.tryAdmit({ id: "1", nickname: "alice" });
    vi.advanceTimersByTime(5 * 60 * 1000);
    expect(reg.get(room.id)).toBeDefined();
  });

  it("tracks lastState on updateState", () => {
    const reg = new RoomRegistry({ maxRoomSize: 10, maxRooms: 100 });
    const { room } = reg.create() as { ok: true; room: any };
    room.updateState({ url: "https://example.com/v", playing: true, t: 5, at: 100 });
    expect(room.lastState).toEqual({ url: "https://example.com/v", playing: true, t: 5, at: 100 });
  });
});
