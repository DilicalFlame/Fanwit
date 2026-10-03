"use strict";
// Deprecated: superseded by `pnpm fw version` (pre releases, Cargo.lock, --tag, --changelog).
// Kept as a thin wrapper for one release.
const { spawnSync } = require("node:child_process");
const path = require("node:path");
console.warn("scripts/version.cjs is deprecated; use `pnpm fw version`.");
const r = spawnSync(process.execPath, [path.join(__dirname, "..", "packages", "fw", "fw.mjs"), "version", ...process.argv.slice(2)], { stdio: "inherit" });
process.exit(r.status ?? 1);
