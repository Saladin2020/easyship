#!/usr/bin/env node
/**
 * Easy Ship MCP server (stdio by default; optional Streamable HTTP).
 *
 *   npx tsx src/mcp/server.ts
 *   npx tsx src/mcp/server.ts --http --port 8979
 *
 * Env: EASYSHIP_WORKSPACE  absolute path to the workspace (default: cwd)
 * Uploading to itch.io is not available over MCP: the tools plan, check and build locally, and return the butler
 * commands for a human to run (easyship ship <id> --upload).
 */
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { ENGINES, FORMAT, TARGETS, type ShipConfig } from "../shared/types.js";
import { doctor, doctorLines } from "../lib/doctor.js";
import { planShip } from "../lib/plan.js";
import { readReport, ship } from "../lib/ship.js";
import { checkWorkspace, getConfig, resolveWorkspace, saveConfig, workspaceSummary } from "../lib/workspace.js";
import { isEntry, mcpErr as err, mcpMsg as msg, mcpText as text, parseMcpArgs, startHttp } from "./http.js";

export const MCP_TOOL_NAMES = ["workspace_info", "doctor", "check_games", "write_game", "plan_ship", "build_game", "read_report"] as const;

const IdSchema = z.string().regex(/^[a-z0-9][a-z0-9_-]*$/, "Use a-z, 0-9, _ or -");
const Targets = z.array(z.enum(TARGETS)).optional();
const ConfigSchema = z.object({
  id: IdSchema,
  name: z.object({ th: z.string().min(1), en: z.string().min(1), ms: z.string().optional() }),
  version: z.string(),
  engine: z.enum(ENGINES),
  source: z.string().min(1),
  targets: z.array(z.enum(TARGETS)).min(1),
  itch: z.object({ user: z.string(), game: z.string(), channels: z.record(z.string(), z.string()).optional() }).optional(),
  web: z.object({ threads: z.boolean().optional(), canvasResize: z.enum(["none", "project", "adaptive"]).optional() }).optional(),
  windows: z.object({ console: z.boolean().optional() }).optional(),
  android: z.object({ package: z.string(), versionCode: z.number().int().optional(), minSdk: z.number().int().optional(), release: z.boolean().optional(), keystore: z.object({ path: z.string(), alias: z.string() }).optional() }).optional(),
  pixi: z.object({ entry: z.string().optional(), vendor: z.boolean().optional() }).optional(),
  exclude: z.array(z.string()).optional(),
});

export const FORMAT_CHEATSHEET = `ships/<id>.easyship.json (${FORMAT}): { id, name {th, en, ms?}, version (semver), engine ${ENGINES.join("|")},
  source (Godot folder with project.godot, or PixiJS folder with index.html), targets [${TARGETS.join(", ")}],
  itch? {user, game, channels?}, web? {threads, canvasResize}, windows? {console}, android? {package, versionCode, minSdk, release, keystore {path, alias}},
  pixi? {entry, vendor}, exclude? [globs] }
Never put secrets in the file (API keys, keystore passwords): BUTLER_API_KEY and EASYSHIP_KEYSTORE_PASSWORD live in the shell.
Builds land in releases/<id>/<version>/<target>/ + <id>-<version>-<target>.zip (APK for Android) + SHIP.md / ship-report.json.
PixiJS games ship to the web only. Uploads to itch.io are CLI-only and explicit: easyship ship <id> --build --upload.`;

export function createEasyShipMcp(workspaceRoot: string): McpServer {
  const root = resolveWorkspace(workspaceRoot);
  const server = new McpServer({ name: "easyship", version: "0.1.0" });

  server.registerTool("workspace_info", { title: "Workspace info", description: "Games (id, version, engine, targets, itch page) and the config format. Call this first.", inputSchema: {} }, async () => text({ name: "easyship", ...(await workspaceSummary(root)), format: FORMAT_CHEATSHEET }));

  server.registerTool("doctor", { title: "Toolchain doctor", description: "Godot + export templates, Java, Android SDK, butler, itch login (yes/no only — never the key), pixi.min.js.", inputSchema: {} }, async () => {
    const d = await doctor(root, { fresh: true });
    return text({ lines: doctorLines(d).map(([ok, label, detail]) => `${ok ? "✓" : "✗"} ${label}: ${detail}`), doctor: d });
  });

  server.registerTool("check_games", { title: "Check", description: "Validate every ship config: secrets, semver, source folder, itch slugs, Android package / keystore.", inputSchema: {} }, async () => text(await checkWorkspace(root)));

  server.registerTool(
    "write_game",
    { title: "Write ship config", description: "Create or replace ships/<id>.easyship.json (validated; dryRun to only validate). Secret-looking keys are refused.", inputSchema: { config: ConfigSchema, dryRun: z.boolean().optional() } },
    async ({ config, dryRun }) => {
      try {
        const r = await saveConfig(root, { format: FORMAT, ...config } as ShipConfig, { dryRun });
        return r.errors.length ? err(JSON.stringify(r.errors)) : text({ ok: r.saved, file: r.file, warnings: r.warnings });
      } catch (e) {
        return err(msg(e));
      }
    },
  );

  server.registerTool(
    "plan_ship",
    { title: "Plan (dry run)", description: "Every step and exact command per target, blockers (missing templates, Java, SDK…), and the butler commands a human would run. Writes nothing.", inputSchema: { id: IdSchema, targets: Targets } },
    async ({ id, targets }) => {
      try {
        return text(planShip(root, await getConfig(root, id), await doctor(root), { targets }));
      } catch (e) {
        return err(msg(e));
      }
    },
  );

  server.registerTool(
    "build_game",
    { title: "Build locally", description: "Build, check and zip the targets into releases/<id>/<version>/ (Godot export / static copy). Never uploads.", inputSchema: { id: IdSchema, targets: Targets } },
    async ({ id, targets }) => {
      try {
        const lines: string[] = [];
        const r = await ship(root, id, { build: true, targets, log: (l) => lines.push(l) });
        return text({ results: r.results.map((x) => ({ target: x.target, status: x.status, artifact: x.artifact, bytes: x.bytes, error: x.error, failedChecks: x.checks.filter((c) => !c.ok).map((c) => c.label) })), report: r.report, log: lines, upload: "CLI only: easyship ship <id> --upload" });
      } catch (e) {
        return err(msg(e));
      }
    },
  );

  server.registerTool("read_report", { title: "Read report", description: "The last ship-report.json for the game's current version.", inputSchema: { id: IdSchema } }, async ({ id }) => {
    try {
      return text((await readReport(root, id)) ?? { report: null, hint: "build first" });
    } catch (e) {
      return err(msg(e));
    }
  });

  return server;
}

if (isEntry() >= 0) {
  const a = parseMcpArgs(process.argv.slice(isEntry() + 1), 8979);
  if (a.http) await startHttp(() => createEasyShipMcp(a.workspace), a.workspace, a.host, a.port);
  else await createEasyShipMcp(a.workspace).connect(new StdioServerTransport());
}
