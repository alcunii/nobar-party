export function wssToHttps(serverUrl: string): string {
  if (serverUrl.startsWith("wss://")) return "https://" + serverUrl.slice(6);
  if (serverUrl.startsWith("ws://")) return "http://" + serverUrl.slice(5);
  return serverUrl;
}

export function buildInviteUrl(serverUrl: string, roomCode: string): string {
  const base = wssToHttps(serverUrl).replace(/\/+$/, "");
  return `${base}/join?room=${roomCode}`;
}
