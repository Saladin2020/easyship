#!/usr/bin/env node
/**
 * Studio CLI wrapper around Easy Ship (doctor / check / plan / ship / report without MCP).
 *
 * Usage:
 *   node /workspace/indie-studio/tools/easyship-cli.mjs <command> [options]
 *
 * Install:  EASYSHIP_HOME, else this folder's easyship/
 * The firefly sample lives in the install (init copies it). Ship configs and releases may be written under
 * /workspace/indie-studio/projects/<Name> (pre-allowed).
 * ship is a dry run unless --build; --upload is never added by the wrapper.
 */
import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { existsSync } from "node:fs";

const here = path.dirname(fileURLToPath(import.meta.url));
const HOME = path.resolve(process.env.EASYSHIP_HOME?.trim() || path.join(here, "easyship"));
const STUDIO_PROJECTS = path.resolve(here, "..", "projects");
const cli = path.join(HOME, "dist", "cli.js");

if (!existsSync(cli)) {
  console.error(`Easy Ship CLI not found at ${cli}. Set EASYSHIP_HOME and run npm ci && npm run build there.`);
  process.exit(1);
}

const env = {
  ...process.env,
  EASYSHIP_HOME: HOME,
  EASYSHIP_WORKSPACE: process.env.EASYSHIP_WORKSPACE?.trim() || HOME,
};
const allowed = new Set(
  (env.EASYSHIP_ALLOWED_DIRS ?? "")
    .split(path.delimiter)
    .map((s) => s.trim())
    .filter(Boolean),
);
allowed.add(STUDIO_PROJECTS);
env.EASYSHIP_ALLOWED_DIRS = [...allowed].join(path.delimiter);

const child = spawn(process.execPath, [cli, ...process.argv.slice(2)], {
  cwd: HOME,
  stdio: "inherit",
  env,
});
child.on("exit", (code, signal) => process.exit(signal ? 1 : (code ?? 0)));
for (const sig of ["SIGINT", "SIGTERM"]) process.on(sig, () => child.kill(sig));
