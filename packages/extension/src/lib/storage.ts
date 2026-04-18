export const PersistentKey = {
  Nickname: "nickname",
  ServerUrl: "serverUrl",
} as const;
export type PersistentKey = (typeof PersistentKey)[keyof typeof PersistentKey];

export const SessionKey = {
  ActiveRoom: "activeRoom",
  SyncedTabId: "syncedTabId",
} as const;
export type SessionKey = (typeof SessionKey)[keyof typeof SessionKey];

export interface ActiveRoom {
  roomId: string;
  selfId: string;
  nickname: string;
}

type LocalShape = {
  [PersistentKey.Nickname]?: string;
  [PersistentKey.ServerUrl]?: string;
};

type SessionShape = {
  [SessionKey.ActiveRoom]?: ActiveRoom;
  [SessionKey.SyncedTabId]?: number;
};

export class Storage {
  async getLocal<K extends PersistentKey>(key: K): Promise<LocalShape[K]> {
    const result = await chrome.storage.local.get(key);
    return result[key] as LocalShape[K];
  }

  async setLocal<K extends PersistentKey>(key: K, value: NonNullable<LocalShape[K]>): Promise<void> {
    await chrome.storage.local.set({ [key]: value });
  }

  async removeLocal<K extends PersistentKey>(key: K): Promise<void> {
    await chrome.storage.local.remove(key);
  }

  async getSession<K extends SessionKey>(key: K): Promise<SessionShape[K]> {
    const result = await chrome.storage.session.get(key);
    return result[key] as SessionShape[K];
  }

  async setSession<K extends SessionKey>(key: K, value: NonNullable<SessionShape[K]>): Promise<void> {
    await chrome.storage.session.set({ [key]: value });
  }

  async removeSession<K extends SessionKey>(key: K): Promise<void> {
    await chrome.storage.session.remove(key);
  }
}
