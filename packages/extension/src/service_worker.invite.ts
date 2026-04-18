export interface InvitePayload {
  serverUrl: string;
  roomCode: string;
}

export interface InviteDeps {
  getNickname: () => Promise<string | undefined>;
  setServerUrl: (url: string) => Promise<void>;
  joinRoom: (input: { roomId: string; nickname: string }) => Promise<void>;
}

export async function handleInviteReceived(p: InvitePayload, d: InviteDeps): Promise<void> {
  await d.setServerUrl(p.serverUrl);
  const nickname = await d.getNickname();
  if (!nickname) return;
  await d.joinRoom({ roomId: p.roomCode, nickname });
}
