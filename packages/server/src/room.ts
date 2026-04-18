import { generateRoomCode } from "./code.js";

export interface Member {
  id: string;
  nickname: string;       // as supplied by client
  displayName: string;    // after collision disambiguation
}

export interface RoomLastState {
  url: string | null;
  playing: boolean;
  t: number;
  at: number;
}

export interface RegistryOptions {
  maxRoomSize: number;
  maxRooms: number;
  evictionAfterEmptyMs?: number;    // defaults to 5 min
}

type AdmitResult =
  | { ok: true; member: Member }
  | { ok: false; error: "room_full" };

type CreateResult =
  | { ok: true; room: Room }
  | { ok: false; error: "max_rooms" };

export class Room {
  public lastState: RoomLastState | null = null;
  private readonly members = new Map<string, Member>();
  private evictionTimer: NodeJS.Timeout | null = null;

  constructor(
    public readonly id: string,
    private readonly maxSize: number,
    private readonly onEvict: () => void,
    private readonly evictionDelayMs: number
  ) {}

  size(): number {
    return this.members.size;
  }

  memberList(): Member[] {
    return Array.from(this.members.values());
  }

  has(id: string): boolean {
    return this.members.has(id);
  }

  tryAdmit(input: { id: string; nickname: string }): AdmitResult {
    if (this.members.size >= this.maxSize && !this.members.has(input.id)) {
      return { ok: false, error: "room_full" };
    }
    this.cancelEviction();
    const displayName = this.disambiguate(input.nickname);
    const member: Member = { id: input.id, nickname: input.nickname, displayName };
    this.members.set(input.id, member);
    return { ok: true, member };
  }

  remove(id: string): void {
    this.members.delete(id);
    if (this.members.size === 0) this.scheduleEviction();
  }

  updateState(s: RoomLastState): void {
    this.lastState = s;
  }

  private disambiguate(nickname: string): string {
    const existing = Array.from(this.members.values()).map((m) => m.displayName);
    if (!existing.includes(nickname)) return nickname;
    for (let n = 2; n <= this.maxSize + 1; n++) {
      const candidate = `${nickname} (${n})`;
      if (!existing.includes(candidate)) return candidate;
    }
    return `${nickname} (${this.maxSize + 2})`;
  }

  private scheduleEviction(): void {
    this.cancelEviction();
    this.evictionTimer = setTimeout(() => this.onEvict(), this.evictionDelayMs);
  }

  private cancelEviction(): void {
    if (this.evictionTimer !== null) {
      clearTimeout(this.evictionTimer);
      this.evictionTimer = null;
    }
  }
}

export class RoomRegistry {
  private readonly rooms = new Map<string, Room>();
  private readonly evictionDelayMs: number;

  constructor(private readonly opts: RegistryOptions) {
    this.evictionDelayMs = opts.evictionAfterEmptyMs ?? 5 * 60 * 1000;
  }

  create(): CreateResult {
    if (this.rooms.size >= this.opts.maxRooms) return { ok: false, error: "max_rooms" };
    let code = "";
    for (let attempt = 0; attempt < 5; attempt++) {
      code = generateRoomCode();
      if (!this.rooms.has(code)) break;
    }
    if (this.rooms.has(code)) return { ok: false, error: "max_rooms" };
    const room = new Room(code, this.opts.maxRoomSize, () => this.rooms.delete(code), this.evictionDelayMs);
    this.rooms.set(code, room);
    return { ok: true, room };
  }

  get(id: string): Room | undefined {
    return this.rooms.get(id);
  }

  stats(): { rooms: number } {
    return { rooms: this.rooms.size };
  }
}
