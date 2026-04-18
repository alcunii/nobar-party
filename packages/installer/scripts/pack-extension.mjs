import { spawnSync } from "node:child_process";
import { createWriteStream, mkdirSync, readdirSync, statSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import archiver from "archiver";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, "../../..");
const extDist = resolve(repoRoot, "packages/extension/dist");
const resDir = resolve(here, "../src-tauri/resources");
const zipPath = join(resDir, "extension.zip");

function build() {
  const r = spawnSync("pnpm", ["-r", "--filter", "@nobar-party/extension...", "build"], {
    cwd: repoRoot, stdio: "inherit", shell: true,
  });
  if (r.status !== 0) process.exit(r.status ?? 1);
}

function zipDir(src, out) {
  mkdirSync(dirname(out), { recursive: true });
  const output = createWriteStream(out);
  const archive = archiver("zip", { zlib: { level: 9 } });
  archive.pipe(output);
  const walk = (dir) => {
    for (const name of readdirSync(dir)) {
      const full = join(dir, name);
      const s = statSync(full);
      if (s.isDirectory()) walk(full);
      else archive.file(full, { name: relative(src, full).split("\\").join("/") });
    }
  };
  walk(src);
  return new Promise((res, rej) => {
    output.on("close", () => res(archive.pointer()));
    archive.on("error", rej);
    archive.finalize();
  });
}

build();
const size = await zipDir(extDist, zipPath);
console.log(`wrote ${zipPath} (${size} bytes)`);
