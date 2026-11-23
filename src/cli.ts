#!/usr/bin/env node
import path from "node:path";
import { serve } from "@hono/node-server";
import { Command } from "commander";
import open from "open";
import { createApp } from "./server/app.js";
import { defaultWebRoot } from "./server/base.js";
import { resolveToken } from "./shared/requestGuard.js";
import { ENGINES, FORMAT, TARGETS, type ShipConfig, type Target } from "./shared/types.js";
import { doctor, doctorLines } from "./lib/doctor.js";
import { planShip } from "./lib/plan.js";
import { cleanRelease, readReport, ship } from "./lib/ship.js";
import { checkWorkspace, getConfig, initWorkspace, resolveWorkspace, saveConfig, workspaceSummary } from "./lib/workspace.js";

const program = new Command();

function workspaceOf(cli?: string): string {
  const v = cli?.trim() || process.env.EASYSHIP_WORKSPACE?.trim() || process.env.EASYSHIP_HOME?.trim() || process.cwd();
  return resolveWorkspace(v);
}
const fail = (e: unknown) => {
  console.error(`error: ${e instanceof Error ? e.message : String(e)}`);
  process.exit(1);
};
const targetsOf = (v?: string): Target[] | undefined => {
  if (!v) return undefined;
  const t = v.split(",").map((s) => s.trim()).filter(Boolean);
  for (const x of t) if (!TARGETS.includes(x as Target)) throw new Error(`unknown target ${x} (${TARGETS.join(", ")})`);
  return t as Target[];
};
const sh = (argv: string[]) => argv.map((a) => (/[\s"'$`]/.test(a) ? JSON.stringify(a) : a)).join(" ");

program.name("easyship").description("Ship Godot 4.3+ and PixiJS v8 games: toolchain doctor, web / Windows / Linux / Android builds, itch.io zips and butler (dry run by default; uploads only with --upload)").version("0.1.0");

program
  .command("init")
  .description("Create ships/ and games/ with the firefly sample (one Godot project, one PixiJS game)")
  .option("--force", "Overwrite sample files")
  .option("--workspace <path>")
  .action(async (o: { force?: boolean; workspace?: string }) => {
    try {
      const root = workspaceOf(o.workspace);
      const written = await initWorkspace(root, { force: o.force });
      const s = await workspaceSummary(root);
      console.log(`Initialized Easy Ship workspace at ${root} (${written.length} items)`);
      console.log(`  ships/   ${s.games.map((g) => `${g.id}.easyship.json`).join(", ")}`);
      console.log("  games/   firefly_godot (Godot 4.3 project) · firefly_pixi (PixiJS v8) · releases/ appear after ship --build");
    } catch (e) {
      fail(e);
    }
  });

program
  .command("info")
  .description("Workspace summary")
  .option("--workspace <path>")
  .option("--json")
  .action(async (o: { workspace?: string; json?: boolean }) => {
    const s = await workspaceSummary(workspaceOf(o.workspace));
    if (o.json) return console.log(JSON.stringify(s, null, 2));
    console.log(`Easy Ship workspace ${s.root}`);
    for (const g of s.games) console.log(`  ${g.id.padEnd(16)} ${g.version.padEnd(8)} ${g.engine.padEnd(6)} ${g.targets.join(",").padEnd(26)} ${g.itch ?? "(no itch)"}  ${g.name.th}`);
    console.log(`  ${s.errors.length} errors, ${s.warnings.length} warnings`);
  });

program
  .command("doctor")
  .description("What can build and ship on this machine (Godot, export templates, Java, Android SDK, butler, pixi.min.js)")
  .option("--workspace <path>")
  .option("--json")
  .action(async (o: { workspace?: string; json?: boolean }) => {
    const d = await doctor(workspaceOf(o.workspace), { fresh: true });
    if (o.json) return console.log(JSON.stringify(d, null, 2));
    console.log(`Easy Ship doctor · ${d.platform} · node ${d.node}`);
    for (const [ok, label, detail] of doctorLines(d)) console.log(`  ${ok ? "✓" : "✗"} ${label.padEnd(20)} ${detail}`);
  });

program
  .command("check [id]")
  .description("Validate ship configs (secrets, versions, sources, itch slugs, Android package) — exit 1 on errors")
  .option("--workspace <path>")
  .option("--json")
  .action(async (id: string | undefined, o: { workspace?: string; json?: boolean }) => {
    const r = await checkWorkspace(workspaceOf(o.workspace));
    const pick = <T extends { path: string }>(l: T[]) => (id ? l.filter((d) => d.path.startsWith(`ships/${id}.`)) : l);
    const errors = pick(r.errors);
    const warnings = pick(r.warnings);
    if (o.json) console.log(JSON.stringify({ ok: errors.length === 0, errors, warnings }, null, 2));
    else {
      for (const e of errors) console.log(`error   ${e.path}: ${e.message}`);
      for (const w of warnings) console.log(`warning ${w.path}: ${w.message}`);
      console.log(errors.length ? `${errors.length} errors` : `ok — ${id ?? `${r.games} games`}, ${warnings.length} warnings`);
    }
    if (errors.length) process.exit(1);
  });

program
  .command("plan <id>")
  .description("Show every step and command ship would run, per target (writes nothing)")
  .option("--targets <list>", `Subset of ${TARGETS.join(",")}`)
  .option("--workspace <path>")
  .option("--json")
  .action(async (id: string, o: { targets?: string; workspace?: string; json?: boolean }) => {
    try {
      const root = workspaceOf(o.workspace);
      const p = planShip(root, await getConfig(root, id), await doctor(root), { targets: targetsOf(o.targets) });
      if (o.json) return console.log(JSON.stringify(p, null, 2));
      printPlan(root, p);
    } catch (e) {
      fail(e);
    }
  });

function printPlan(root: string, p: ReturnType<typeof planShip>) {
  console.log(`${p.game} ${p.version} (${p.engine}) → ${path.relative(root, p.outDir)}/`);
  for (const t of p.targets) {
    console.log(`\n  ${t.target} — ${t.status}${t.channel ? ` · itch channel ${t.channel}` : ""}`);
    for (const b of t.blockers) console.log(`    ✗ ${b}`);
    for (const s of t.steps) console.log(`    · ${s.label}${s.command ? `\n        $ ${sh(s.command)}` : ""}`);
    for (const n of t.notes) console.log(`    note: ${n}`);
  }
  console.log(`\n  itch.io upload: ${p.upload.possible ? "possible (only with --upload)" : `not possible yet — ${p.upload.blockers.join("; ")}`}`);
  for (const c of p.upload.commands) console.log(`    $ ${sh(c)}`);
}

program
  .command("ship <id>")
  .description("Dry run by default. --build builds and packages locally; --upload pushes to itch.io with butler (explicit only)")
  .option("--targets <list>", `Subset of ${TARGETS.join(",")}`)
  .option("--build", "Build + check + zip into releases/<id>/<version>/")
  .option("--upload", "Push the zips / APK with butler (needs butler login or BUTLER_API_KEY)")
  .option("--workspace <path>")
  .option("--json")
  .action(async (id: string, o: { targets?: string; build?: boolean; upload?: boolean; workspace?: string; json?: boolean }) => {
    try {
      const root = workspaceOf(o.workspace);
      const r = await ship(root, id, { targets: targetsOf(o.targets), build: o.build, upload: o.upload, log: o.json ? undefined : (l) => console.log(`  ${l}`) });
      if (o.json) return console.log(JSON.stringify(r, null, 2));
      if (r.dryRun) {
        console.log("DRY RUN — nothing built or uploaded. Add --build to build locally; --upload to push to itch.io.\n");
        printPlan(root, r.plan);
        return;
      }
      for (const t of r.results) console.log(`${t.target.padEnd(8)} ${t.status.padEnd(11)} ${t.artifact ? path.relative(root, t.artifact) : ""}${t.bytes ? ` ${(t.bytes / 1048576).toFixed(1)} MB` : ""}${t.error ? `  ${t.error}` : ""}`);
      if (r.report) console.log(`report: ${r.report}`);
      if (r.results.some((t) => t.status === "failed")) process.exit(1);
    } catch (e) {
      fail(e);
    }
  });

program
  .command("report <id>")
  .description("Last ship report for the game's current version")
  .option("--workspace <path>")
  .action(async (id: string, o: { workspace?: string }) => {
    try {
      const r = await readReport(workspaceOf(o.workspace), id);
      console.log(r ? JSON.stringify(r, null, 2) : "no report yet (ship <id> --build)");
    } catch (e) {
      fail(e);
    }
  });

program
  .command("clean <id>")
  .description("Delete releases/<id>/<version>/ (local build output only)")
  .option("--workspace <path>")
  .action(async (id: string, o: { workspace?: string }) => {
    try {
      console.log(`removed ${await cleanRelease(workspaceOf(o.workspace), id)}`);
    } catch (e) {
      fail(e);
    }
  });

program
  .command("new <id>")
  .description("Create a ship config for a game folder")
  .requiredOption("--source <dir>", "Godot project folder or PixiJS game folder (relative to the workspace)")
  .requiredOption("--th <name>")
  .requiredOption("--en <name>")
  .option("--ms <name>")
  .option("--engine <e>", ENGINES.join(" | "))
  .option("--targets <list>", "Targets", "web")
  .option("--release <v>", "Version of the game (semver)", "0.1.0")
  .option("--itch <user/game>")
  .option("--android-package <pkg>")
  .option("--workspace <path>")
  .action(async (id: string, o: { source: string; th: string; en: string; ms?: string; engine?: string; targets: string; release: string; itch?: string; androidPackage?: string; workspace?: string }) => {
    try {
      const root = workspaceOf(o.workspace);
      const { existsSync } = await import("node:fs");
      const engine = (o.engine ?? (existsSync(path.resolve(root, o.source, "project.godot")) ? "godot" : "pixi")) as ShipConfig["engine"];
      const [user, game] = o.itch?.split("/") ?? [];
      const cfg: ShipConfig = { format: FORMAT, id, name: { th: o.th, en: o.en, ...(o.ms ? { ms: o.ms } : {}) }, version: o.release, engine, source: o.source, targets: targetsOf(o.targets)!, ...(user && game ? { itch: { user, game } } : {}), ...(o.androidPackage ? { android: { package: o.androidPackage } } : {}) };
      const r = await saveConfig(root, cfg);
      for (const e of r.errors) console.log(`error   ${e.path}: ${e.message}`);
      for (const w of r.warnings) console.log(`warning ${w.path}: ${w.message}`);
      if (!r.saved) process.exit(1);
      console.log(`wrote ${r.file}`);
    } catch (e) {
      fail(e);
    }
  });

program
  .command("bump <id> [part]")
  .description("Bump the version: patch (default) | minor | major — also the Android versionCode")
  .option("--workspace <path>")
  .action(async (id: string, part: string | undefined, o: { workspace?: string }) => {
    try {
      const root = workspaceOf(o.workspace);
      const cfg = await getConfig(root, id, { strict: false });
      const [ma, mi, pa] = cfg.version.replace(/[-+].*$/, "").split(".").map(Number) as [number, number, number];
      cfg.version = part === "major" ? `${ma + 1}.0.0` : part === "minor" ? `${ma}.${mi + 1}.0` : `${ma}.${mi}.${pa + 1}`;
      if (cfg.android) cfg.android.versionCode = (cfg.android.versionCode ?? 1) + 1;
      const r = await saveConfig(root, cfg);
      if (!r.saved) throw new Error(r.errors.map((e) => e.message).join("; "));
      console.log(`${id} → ${cfg.version}${cfg.android ? ` (versionCode ${cfg.android.versionCode})` : ""}`);
    } catch (e) {
      fail(e);
    }
  });

program
  .command("serve")
  .description("Web dashboard + API (default http://127.0.0.1:8978)")
  .option("--port <n>", "Port", "8978")
  .option("--host <h>", "Host", "127.0.0.1")
  .option("--dev", "API only (use the Vite UI on :5197)")
  .option("--no-open")
  .option("--workspace <path>")
  .action(async (o: { port: string; host: string; dev?: boolean; open: boolean; workspace?: string }) => {
    const root = workspaceOf(o.workspace);
    const token = resolveToken(o.host);
    const app = createApp({ workspaceRoot: root, webRoot: defaultWebRoot(), dev: o.dev, host: o.host, token });
    serve({ fetch: app.fetch, port: Number(o.port), hostname: o.host });
    const url = `http://${o.host === "0.0.0.0" ? "127.0.0.1" : o.host}:${o.port}/${token ? `?token=${token}` : ""}`;
    console.log(`Easy Ship ${o.dev ? "API" : "dashboard"} on http://${o.host}:${o.port} · workspace ${root}`);
    if (token) console.log(`Token (needed off loopback): ${token}`);
    if (o.open && !o.dev && process.stdout.isTTY) await open(url).catch(() => {});
  });

program.parseAsync().catch(fail);
