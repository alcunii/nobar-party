import { z } from "zod";

const SEM = /^(\d+)\.(\d+)\.(\d+)$/;

const LatestSchema = z.object({
  version: z.string().regex(SEM),
  downloadUrl: z.object({ win: z.string().url(), mac: z.string().url() }),
});

export type Latest = z.infer<typeof LatestSchema>;

export function isNewer(current: string, latest: string): boolean {
  const c = current.match(SEM); const l = latest.match(SEM);
  if (!c || !l) return false;
  for (let i = 1; i <= 3; i++) {
    const a = Number.parseInt(c[i] ?? "0", 10); const b = Number.parseInt(l[i] ?? "0", 10);
    if (b > a) return true;
    if (b < a) return false;
  }
  return false;
}

function wssToHttps(url: string): string {
  if (url.startsWith("wss://")) return "https://" + url.slice(6);
  if (url.startsWith("ws://")) return "http://" + url.slice(5);
  return url;
}

export async function fetchLatest(
  serverUrl: string,
  fetchFn: typeof fetch = fetch
): Promise<Latest | null> {
  try {
    const base = wssToHttps(serverUrl).replace(/\/+$/, "");
    const res = await fetchFn(`${base}/version`);
    if (!res.ok) return null;
    const body = await res.json();
    const parsed = LatestSchema.safeParse(body);
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}
