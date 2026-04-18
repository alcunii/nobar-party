import { build, context } from "esbuild";
import { cpSync, mkdirSync } from "node:fs";

const watch = process.argv.includes("--watch");
const outdir = "dist";

mkdirSync(outdir, { recursive: true });

// Service worker is a module (manifest.json: "type": "module") — keep ESM.
// Popup and sidebar are loaded via <script type="module"> in their HTML — ESM.
const moduleEntries = {
  service_worker: "src/service_worker.ts",
  popup: "src/popup.ts",
  sidebar: "src/sidebar.ts",
};

// Content scripts are CLASSIC scripts — cannot contain ES `export`/`import`.
// Must use IIFE format so esbuild strips top-level exports.
const contentEntries = {
  content: "src/content.ts",
  content_join: "src/content_join.ts",
};

const shared = {
  bundle: true,
  target: "chrome120",
  sourcemap: true,
  logLevel: "info",
  define: {
    "process.env.DEFAULT_SERVER_URL": JSON.stringify(process.env.DEFAULT_SERVER_URL ?? "ws://localhost:3050"),
  },
};

function copyStatic() {
  for (const f of ["manifest.json", "popup.html", "popup.css", "sidebar.html", "sidebar.css"]) {
    try { cpSync(`src/${f}`, `${outdir}/${f}`); } catch { /* missing ok during early phases */ }
  }
  try { cpSync("src/icons", `${outdir}/icons`, { recursive: true }); } catch { /* missing ok during early phases */ }
}

if (watch) {
  const ctxModules = await context({ ...shared, format: "esm", entryPoints: moduleEntries, outdir });
  const ctxContent = await context({ ...shared, format: "iife", entryPoints: contentEntries, outdir });
  await Promise.all([ctxModules.watch(), ctxContent.watch()]);
  console.log("esbuild watching…");
  copyStatic();
} else {
  await build({ ...shared, format: "esm", entryPoints: moduleEntries, outdir });
  await build({ ...shared, format: "iife", entryPoints: contentEntries, outdir });
  copyStatic();
}
