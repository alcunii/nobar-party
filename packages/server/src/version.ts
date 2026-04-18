import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { z } from "zod";

export const VersionInfoSchema = z.object({
  version: z.string().regex(/^\d+\.\d+\.\d+$/, "expected semver x.y.z"),
  downloadUrl: z.object({
    win: z.string().url(),
    mac: z.string().url(),
  }),
});

export type VersionInfo = z.infer<typeof VersionInfoSchema>;

export function parseVersionInfo(raw: string): VersionInfo {
  const obj = JSON.parse(raw);
  return VersionInfoSchema.parse(obj);
}

export function loadVersionInfo(): VersionInfo {
  const here = dirname(fileURLToPath(import.meta.url));
  const file = join(here, "version.json");
  const raw = readFileSync(file, "utf8");
  return parseVersionInfo(raw);
}
