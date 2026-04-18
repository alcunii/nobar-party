import { build, context } from "esbuild";
import { cpSync, mkdirSync } from "node:fs";

const watch = process.argv.includes("--watch");
const outdir = "dist";

mkdirSync(outdir, { recursive: true });

const entryPoints = {
  service_worker: "src/service_worker.ts",
  content: "src/content.ts",
  popup: "src/popup.ts",
  sidebar: "src/sidebar.ts",
};

const shared = {
  bundle: true,
  format: "esm",
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
  const ctx = await context({ ...shared, entryPoints, outdir });
  await ctx.watch();
  console.log("esbuild watching…");
  copyStatic();
} else {
  await build({ ...shared, entryPoints, outdir });
  copyStatic();
}
