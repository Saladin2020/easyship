import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { copyFile, mkdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import type { ShipConfig, ShipPlan, Target, TargetPlan } from "../shared/types.js";
import { doctor, type Doctor } from "./doctor.js";
import { planShip } from "./plan.js";
import { mergePresets } from "./presets.js";
import { ALWAYS_EXCLUDE, excluded, getConfig, sourceDir } from "./workspace.js";
import { listFiles, readZipIndex, sha256, zipDir } from "./zip.js";

export interface ShipOptions {
  targets?: Target[];
  /** Actually build (default: dry run — nothing is written). */
  build?: boolean;
  /** Push with butler. Never implied; needs build output (this run or an earlier one). */
  upload?: boolean;
  log?: (line: string) => void;
}

export interface TargetResult {
  target: Target;
  status: "dry-run" | "built" | "blocked" | "unsupported" | "failed" | "uploaded" | "skipped";
  artifact?: string;
  bytes?: number;
  sha256?: string;
  files?: number;
  checks: Array<{ ok: boolean; label: string }>;
  error?: string;
  log?: string;
}

export interface ShipResult {
  plan: ShipPlan;
  dryRun: boolean;
  results: TargetResult[];
  report?: string;
}

/** itch.io HTML5 limits (docs, 2026): ≤ 1000 files, each ≤ 200 MB, ≤ 500 MB extracted. */
export const ITCH_WEB = { maxFiles: 1000, maxFileBytes: 200 * 1024 * 1024, maxTotalBytes: 500 * 1024 * 1024 };
const SECRET_FILE = /(^|\/)(\.env(\..*)?|.*\.keystore|.*\.jks|export_credentials\.cfg|butler_creds|id_rsa|.*\.pem)$/i;
const SECRET_TEXT = /-----BEGIN [A-Z ]*PRIVATE KEY-----|BUTLER_API_KEY\s*=\s*\S{8,}/;

function exec(cmd: string[], env: NodeJS.ProcessEnv, timeoutMs: number): Promise<{ code: number; out: string }> {
  return new Promise((resolve) => {
    const p = spawn(cmd[0]!, cmd.slice(1), { env, stdio: ["ignore", "pipe", "pipe"] });
    let out = "";
    const add = (d: Buffer) => {
      out += d.toString();
      if (out.length > 200_000) out = out.slice(-100_000);
    };
    p.stdout.on("data", add);
    p.stderr.on("data", add);
    const timer = setTimeout(() => p.kill("SIGKILL"), timeoutMs);
    p.on("close", (code) => {
      clearTimeout(timer);
      resolve({ code: code ?? 1, out });
    });
    p.on("error", (e) => {
      clearTimeout(timer);
      resolve({ code: 1, out: String(e) });
    });
  });
}

export async function scanSecrets(dir: string): Promise<string[]> {
  const bad: string[] = [];
  for (const rel of await listFiles(dir)) {
    if (SECRET_FILE.test(rel)) bad.push(rel);
    else if (/\.(js|mjs|json|html|txt|cfg|ini|env|gd|tres|tscn)$/i.test(rel)) {
      const st = await stat(path.join(dir, rel));
      if (st.size < 2_000_000 && SECRET_TEXT.test(await readFile(path.join(dir, rel), "utf8"))) bad.push(rel);
    }
  }
  return bad;
}

async function checkBuild(cfg: ShipConfig, p: TargetPlan): Promise<Array<{ ok: boolean; label: string }>> {
  const c: Array<{ ok: boolean; label: string }> = [];
  const files = existsSync(p.buildDir) ? await listFiles(p.buildDir) : [];
  const secrets = existsSync(p.buildDir) ? await scanSecrets(p.buildDir) : [];
  c.push({ ok: secrets.length === 0, label: secrets.length ? `secret-looking files in the build: ${secrets.join(", ")}` : "no secrets in the build" });
  if (p.target === "web") {
    c.push({ ok: files.includes("index.html"), label: "index.html at the root" });
    c.push({ ok: files.length <= ITCH_WEB.maxFiles, label: `${files.length} files (itch.io allows ${ITCH_WEB.maxFiles})` });
    let total = 0;
    let biggest = 0;
    for (const f of files) {
      const s = (await stat(path.join(p.buildDir, f))).size;
      total += s;
      biggest = Math.max(biggest, s);
    }
    c.push({ ok: biggest <= ITCH_WEB.maxFileBytes, label: `largest file ${(biggest / 1048576).toFixed(1)} MB (≤ 200 MB)` });
    c.push({ ok: total <= ITCH_WEB.maxTotalBytes, label: `${(total / 1048576).toFixed(1)} MB extracted (≤ 500 MB)` });
    if (cfg.engine === "godot") c.push({ ok: files.includes("index.wasm") && files.includes("index.pck"), label: "index.wasm + index.pck" });
    if (files.includes("index.html")) {
      const html = await readFile(path.join(p.buildDir, "index.html"), "utf8");
      const refs = [...html.matchAll(/(?:src|href)="([^"#?]+)"/g)].map((m) => m[1]!).filter((u) => !/^(https?:|data:|\/\/|mailto:)/.test(u));
      const missing = refs.filter((r) => !existsSync(path.join(p.buildDir, r.replace(/^\.\//, ""))));
      c.push({ ok: missing.length === 0, label: missing.length ? `index.html points at missing files: ${missing.join(", ")}` : `index.html local references resolve (${refs.length})` });
      const abs = refs.filter((r) => r.startsWith("/"));
      c.push({ ok: abs.length === 0, label: abs.length ? `absolute paths break inside itch.io's iframe: ${abs.join(", ")}` : "relative paths only" });
    }
  } else if (p.target === "windows" || p.target === "linux") {
    const bin = path.join(p.buildDir, p.target === "windows" ? `${cfg.id}.exe` : `${cfg.id}.x86_64`);
    const head = existsSync(bin) ? (await readFile(bin)).subarray(0, 4) : Buffer.alloc(0);
    const ok = p.target === "windows" ? head.subarray(0, 2).toString("latin1") === "MZ" : head.equals(Buffer.from([0x7f, 0x45, 0x4c, 0x46]));
    c.push({ ok, label: `${path.basename(bin)} is ${p.target === "windows" ? "a PE (MZ)" : "an ELF"} executable` });
    c.push({ ok: !files.some((f) => f.endsWith(".pck")), label: "game data embedded in the executable (single file)" });
  } else if (p.target === "android") {
    const apk = p.artifact;
    if (existsSync(apk)) {
      const idx = await readZipIndex(apk);
      c.push({ ok: idx.some((e) => e.name === "AndroidManifest.xml") && idx.some((e) => e.name.startsWith("classes")), label: "APK has AndroidManifest.xml and classes.dex" });
      const raw = await readFile(apk);
      c.push({ ok: raw.includes(Buffer.from("APK Sig Block 42")) || idx.some((e) => /^META-INF\/.*\.(RSA|EC|DSA)$/.test(e.name)), label: "APK is signed" });
    } else c.push({ ok: false, label: "APK present" });
  }
  return c;
}

async function copyStatic(src: string, dst: string, exclude: string[]) {
  for (const rel of await listFiles(src)) {
    if (excluded(rel, [...ALWAYS_EXCLUDE, ...exclude])) continue;
    await mkdir(path.dirname(path.join(dst, rel)), { recursive: true });
    await copyFile(path.join(src, rel), path.join(dst, rel));
  }
}

export async function ship(root: string, id: string, opts: ShipOptions = {}): Promise<ShipResult> {
  const log = opts.log ?? (() => {});
  const cfg = await getConfig(root, id);
  const doc: Doctor = await doctor(root);
  const plan = planShip(root, cfg, doc, { targets: opts.targets, upload: opts.upload });
  const results: TargetResult[] = [];
  if (!opts.build && !opts.upload) {
    for (const p of plan.targets) results.push({ target: p.target, status: p.status === "ready" ? "dry-run" : p.status, checks: [] });
    return { plan, dryRun: true, results };
  }
  const src = sourceDir(root, cfg);
  if (opts.build) {
    await mkdir(plan.outDir, { recursive: true });
    const godotTargets = plan.targets.filter((p) => p.status === "ready" && cfg.engine === "godot").map((p) => p.target);
    if (godotTargets.length) {
      const file = path.join(src, "export_presets.cfg");
      const existing = existsSync(file) ? await readFile(file, "utf8") : null;
      if (existing !== null && !existsSync(`${file}.easyship.bak`)) await writeFile(`${file}.easyship.bak`, existing);
      const merged = mergePresets(existing, cfg, godotTargets);
      await writeFile(file, merged.text);
      log(`export_presets.cfg: kept ${merged.kept.length} preset(s), added ${merged.added.join(", ")}`);
      if (!existsSync(path.join(src, ".godot"))) {
        log("importing the project (first run)…");
        for (let i = 0; i < 2; i++) await exec([doc.godot.path!, "--headless", "--editor", "--quit", "--path", src], process.env, 600_000);
      }
    }
    for (const p of plan.targets) {
      if (p.status !== "ready") {
        results.push({ target: p.target, status: p.status, checks: [], error: p.blockers.join("; ") });
        continue;
      }
      const r: TargetResult = { target: p.target, status: "built", checks: [] };
      try {
        await rm(p.buildDir, { recursive: true, force: true });
        await mkdir(p.buildDir, { recursive: true });
        for (const s of p.steps) {
          if (s.kind === "copy-static") await copyStatic(src, p.buildDir, cfg.exclude ?? []);
          if (s.kind === "vendor-pixi" && doc.pixi.path) await copyFile(doc.pixi.path, path.join(p.buildDir, "pixi.min.js"));
          if (s.kind === "godot-export") {
            log(`${p.target}: ${s.command!.slice(1).join(" ")}`);
            const env: NodeJS.ProcessEnv = { ...process.env };
            if (p.target === "android" && cfg.android?.release && cfg.android.keystore) {
              env.GODOT_ANDROID_KEYSTORE_RELEASE_PATH = path.resolve(root, cfg.android.keystore.path);
              env.GODOT_ANDROID_KEYSTORE_RELEASE_USER = cfg.android.keystore.alias;
              env.GODOT_ANDROID_KEYSTORE_RELEASE_PASSWORD = process.env.EASYSHIP_KEYSTORE_PASSWORD;
            }
            const res = await exec(s.command!, env, 900_000);
            r.log = res.out.split("\n").filter((l) => /ERROR|error|WARNING|savepack|export/i.test(l)).slice(-12).join("\n");
            const outFile = s.command!.at(-1)!;
            if (res.code !== 0 || !existsSync(outFile)) throw new Error(`Godot export failed (exit ${res.code}). ${r.log || res.out.slice(-600)}`);
            if (p.target === "android") {
              await copyFile(outFile, p.artifact);
            }
          }
        }
        r.checks = await checkBuild(cfg, p);
        for (const n of p.notes ?? []) { r.checks.push({ ok: true, label: `note: ${n}` }); log(`${p.target}: ${n}`); }
        const failed = r.checks.filter((c) => !c.ok);
        if (failed.length) throw new Error(`checks failed: ${failed.map((c) => c.label).join("; ")}`);
        if (p.target !== "android") {
          const z = await zipDir(p.buildDir, p.artifact);
          r.files = z.files;
          if (p.target === "linux") {
            const idx = await readZipIndex(p.artifact);
            const bin = idx.find((e) => e.name.endsWith(".x86_64"));
            r.checks.push({ ok: !!bin && (bin.mode & 0o111) !== 0, label: "Linux binary keeps its executable bit in the zip" });
          }
        } else r.files = 1;
        r.artifact = p.artifact;
        r.bytes = (await stat(p.artifact)).size;
        r.sha256 = await sha256(p.artifact);
        log(`${p.target}: ${path.relative(root, p.artifact)} ${(r.bytes / 1048576).toFixed(1)} MB`);
      } catch (e) {
        r.status = "failed";
        r.error = e instanceof Error ? e.message : String(e);
        log(`${p.target}: FAILED ${r.error}`);
      }
      results.push(r);
    }
  } else {
    // upload only: reuse artifacts from an earlier build
    for (const p of plan.targets) {
      if (p.status === "unsupported") results.push({ target: p.target, status: "unsupported", checks: [] });
      else if (existsSync(p.artifact)) results.push({ target: p.target, status: "built", artifact: p.artifact, bytes: (await stat(p.artifact)).size, sha256: await sha256(p.artifact), checks: [] });
      else results.push({ target: p.target, status: "skipped", checks: [], error: `no ${path.relative(root, p.artifact)} — run ship --build first` });
    }
  }
  if (opts.upload) {
    if (!plan.upload.possible) {
      for (const r of results) if (r.status === "built") r.error = `not uploaded: ${plan.upload.blockers.join("; ")}`;
    } else {
      for (const r of results) {
        if (r.status !== "built") continue;
        const cmd = plan.upload.commands.find((c) => c[2] === r.artifact)!;
        log(`upload ${r.target}: ${cmd.slice(1).join(" ")}`);
        const res = await exec(cmd, process.env, 1_800_000);
        if (res.code === 0) r.status = "uploaded";
        else {
          r.status = "failed";
          r.error = `butler exit ${res.code}: ${res.out.slice(-400)}`;
        }
      }
    }
  }
  const report = await writeReport(root, cfg, plan, results, opts);
  return { plan, dryRun: false, results, report };
}

async function writeReport(root: string, cfg: ShipConfig, plan: ShipPlan, results: TargetResult[], opts: ShipOptions): Promise<string> {
  await mkdir(plan.outDir, { recursive: true });
  const json = { format: "easyship-report/1", game: cfg.id, name: cfg.name, version: cfg.version, engine: cfg.engine, at: new Date().toISOString(), uploadRequested: !!opts.upload, results: results.map((r) => ({ ...r, artifact: r.artifact ? path.relative(plan.outDir, r.artifact) : undefined })), butler: plan.upload };
  await writeFile(path.join(plan.outDir, "ship-report.json"), `${JSON.stringify(json, null, 2)}\n`);
  const md = [
    `# ${cfg.name.en} (${cfg.name.th}) ${cfg.version}`,
    "",
    `Engine: ${cfg.engine} · source: ${path.relative(root, plan.source) || "."}`,
    "",
    "| Target | Status | File | Size | SHA-256 |",
    "|---|---|---|---|---|",
    ...results.map((r) => `| ${r.target} | ${r.status}${r.error ? ` — ${r.error.replace(/\|/g, "/").slice(0, 160)}` : ""} | ${r.artifact ? path.basename(r.artifact) : ""} | ${r.bytes ? `${(r.bytes / 1048576).toFixed(1)} MB` : ""} | ${r.sha256 ? `\`${r.sha256.slice(0, 16)}…\`` : ""} |`),
    "",
    "## Checks",
    "",
    ...results.flatMap((r) => r.checks.map((c) => `- ${c.ok ? "✓" : "✗"} ${r.target}: ${c.label}`)),
    "",
    "## itch.io",
    "",
    plan.upload.possible ? "Ready to upload:" : `Upload not possible yet: ${plan.upload.blockers.join("; ")}. Commands for later:`,
    "",
    "```sh",
    ...plan.upload.commands.map((c) => c.map((a) => (/\s/.test(a) ? JSON.stringify(a) : a)).join(" ")),
    "```",
    "",
  ].join("\n");
  const f = path.join(plan.outDir, "SHIP.md");
  await writeFile(f, md);
  return f;
}

export async function readReport(root: string, id: string) {
  const cfg = await getConfig(root, id, { strict: false });
  const f = path.join(root, "releases", cfg.id, cfg.version, "ship-report.json");
  if (!existsSync(f)) return null;
  return JSON.parse(await readFile(f, "utf8"));
}

/** For tests and the CLI's `clean`: remove one version's releases folder. */
export async function cleanRelease(root: string, id: string) {
  const cfg = await getConfig(root, id, { strict: false });
  const d = path.join(root, "releases", cfg.id, cfg.version);
  await rm(d, { recursive: true, force: true });
  return d;
}

