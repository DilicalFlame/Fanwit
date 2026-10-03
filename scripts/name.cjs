"use strict";
// Deprecated: superseded by `pnpm fw rename` (format preserving, validates the identifier).
// Kept as a thin wrapper for one release.
const { spawnSync } = require("node:child_process");
const path = require("node:path");
console.warn("scripts/name.cjs is deprecated; use `pnpm fw rename`.");
const r = spawnSync(process.execPath, [path.join(__dirname, "..", "packages", "fw", "fw.mjs"), "rename", ...process.argv.slice(2)], { stdio: "inherit" });
process.exit(r.status ?? 1);
