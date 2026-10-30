#!/usr/bin/env node
/**
 * Single source of truth for the shipped version.
 *
 *   node scripts/version.mjs current        print the version from the root package.json
 *   node scripts/version.mjs check          exit 1 if any file disagrees with it
 *   node scripts/version.mjs set 0.2.0      write 0.2.0 into every file below
 *
 * The version has to move in lockstep across four places, because they are read
 * by four different consumers:
 *
 *   package.json / packages' package.json  -> workspace + installer naming
 *   packages/extension/src/manifest.json   -> what Chrome reports to the page
 *   packages/installer/src-tauri/tauri.conf.json -> what the .msi/.dmg is stamped with
 *   packages/server/src/version.json       -> what /version serves, and therefore
 *                                             what the update badge compares against
 *
 * Files are edited textually (not re-serialised) so formatting and key order
 * survive and the diff stays one line per file.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

const TARGETS = [
  "package.json",
  "packages/protocol/package.json",
  "packages/server/package.json",
  "packages/extension/package.json",
  "packages/installer/package.json",
  "packages/extension/src/manifest.json",
  "packages/installer/src-tauri/tauri.conf.json",
  "packages/server/src/version.json",
];

const SEMVER = /^\d+\.\d+\.\d+$/;
const VERSION_LINE = /"version"\s*:\s*"([^"]*)"/;

function readVersion(rel) {
  const text = readFileSync(join(root, rel), "utf8");
  const matches = text.match(new RegExp(VERSION_LINE.source, "g")) ?? [];
  if (matches.length !== 1) {
    throw new Error(
      `${rel}: expected exactly one "version" key, found ${matches.length}. ` +
        `Update TARGETS or fix the file.`
    );
  }
  const m = text.match(VERSION_LINE);
  return { text, version: m[1] };
}

function setVersion(rel, next) {
  const { text, version } = readVersion(rel);
  if (version === next) return false;
  const updated = text.replace(VERSION_LINE, `"version": "${next}"`);
  writeFileSync(join(root, rel), updated);
  return true;
}

const [command, arg] = process.argv.slice(2);

if (command === "current") {
  console.log(readVersion("package.json").version);
  process.exit(0);
}

if (command === "check") {
  const expected = readVersion("package.json").version;
  if (!SEMVER.test(expected)) {
    console.error(`package.json has a non-semver version: ${expected}`);
    process.exit(1);
  }
  const drift = [];
  for (const rel of TARGETS) {
    const { version } = readVersion(rel);
    if (version !== expected) drift.push({ rel, version });
  }
  if (drift.length > 0) {
    console.error(`Version drift detected (expected ${expected}):`);
    for (const d of drift) {
      console.error(`  ${relative(".", d.rel)}: ${d.version}`);
    }
    console.error(`\nFix with: pnpm version:set ${expected}`);
    process.exit(1);
  }
  console.log(`versions consistent at ${expected} (${TARGETS.length} files)`);
  process.exit(0);
}

if (command === "set") {
  if (!arg || !SEMVER.test(arg)) {
    console.error(`usage: pnpm version:set <x.y.z>   (got: ${arg ?? "nothing"})`);
    process.exit(1);
  }
  let changed = 0;
  for (const rel of TARGETS) {
    if (setVersion(rel, arg)) {
      console.log(`  ${rel} -> ${arg}`);
      changed++;
    }
  }
  console.log(changed === 0 ? `already at ${arg}` : `updated ${changed} file(s) to ${arg}`);
  process.exit(0);
}

console.error("usage: node scripts/version.mjs <current|check|set <x.y.z>>");
process.exit(1);
