/**
 * Optional integration with the other Easy Suite tools. Looks for a CLI next to this install (studio layout:
 * tools/<tool>-cli.mjs or tools/<tool>/dist/cli.js), or at EASYSHIP_<TOOL>_CLI. Nothing here is required:
 * exports fall back to built-in assets when a tool is missing.
 */
import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import { promisify } from "node:util";
import { pkgRoot } from "./fsx.js";

const run = promisify(execFile);

export function siblingCli(tool: string): string | null {
  const env = process.env[`EASYSHIP_${tool.toUpperCase()}_CLI`]?.trim();
  if (env) return existsSync(env) ? env : null;
  const parent = path.resolve(pkgRoot, "..");
  for (const c of [path.join(parent, `${tool}-cli.mjs`), path.join(parent, tool, "dist", "cli.js"), path.join(parent, "..", "tools", `${tool}-cli.mjs`), "/workspace/indie-studio/tools/" + `${tool}-cli.mjs`]) if (existsSync(c)) return c;
  return null;
}

export async function runSibling(cli: string, args: string[], timeout = 60_000): Promise<{ stdout: string; stderr: string }> {
  return run(process.execPath, [cli, ...args], { timeout, maxBuffer: 32 * 1024 * 1024 });
}
