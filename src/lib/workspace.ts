import { existsSync, statSync } from "node:fs";
import { cp, mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { ENGINES, FORMAT, TARGETS, type Diagnostic, type ShipConfig } from "../shared/types.js";
import { assertSafeId, resolveInside, resolveWorkspace, SAMPLES_DIR } from "./fsx.js";

export { assertSafeId, resolveWorkspace, resolveInside };

export const dirs = (root: string) => ({ ships: path.join(root, "ships"), games: path.join(root, "games"), releases: path.join(root, "releases") });
const EXT = ".easyship.json";
/** Never copied into a workspace or a build. */
export const ALWAYS_EXCLUDE = [".godot/**", ".import/**", ".git/**", "node_modules/**", ".env", ".env.*", "**/.env", "**/.env.*", "*.keystore", "**/*.keystore", "*.jks", "**/*.jks", "**/export_credentials.cfg", "**/butler_creds", ".DS_Store", "**/.DS_Store", "*.easyship.bak", "**/*.easyship.bak", "export_presets.cfg.easyship.bak"];

export async function initWorkspace(root: string, opts: { force?: boolean } = {}) {
  const written: string[] = [];
  for (const sub of ["ships", "games"]) {
    const src = path.join(SAMPLES_DIR, sub);
    const dst = path.join(root, sub);
    await mkdir(dst, { recursive: true });
    if (!existsSync(src)) continue;
    for (const f of await readdir(src)) {
      const t = path.join(dst, f);
      if (existsSync(t) && !opts.force) continue;
      await cp(path.join(src, f), t, { recursive: true, filter: (s) => !/[\\/]\.godot([\\/]|$)/.test(s) && !s.endsWith(".easyship.bak") });
      written.push(t);
    }
  }
  const gi = path.join(root, ".gitignore");
  if (!existsSync(gi)) await writeFile(gi, "releases/\n.env\n.env.*\n*.keystore\n*.jks\n**/.godot/\n");
  return written;
}

export interface ConfigFile {
  id: string;
  file: string;
  config?: ShipConfig;
  parseError?: string;
}

export async function listConfigs(root: string): Promise<ConfigFile[]> {
  const d = dirs(root).ships;
  if (!existsSync(d)) return [];
  const out: ConfigFile[] = [];
  for (const f of (await readdir(d)).filter((x) => x.endsWith(EXT)).sort()) {
    const file = path.join(d, f);
    const id = f.slice(0, -EXT.length);
    try {
      out.push({ id, file, config: JSON.parse(await readFile(file, "utf8")) as ShipConfig });
    } catch (e) {
      out.push({ id, file, parseError: e instanceof Error ? e.message : String(e) });
    }
  }
  return out;
}

const SECRET_KEY = /(api[_-]?key|token|password|passwd|secret|storepass|keypass|credential)/i;
const SEMVER = /^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/;
const SLUG = /^[a-z0-9][a-z0-9_-]*$/i;
const ANDROID_PKG = /^[a-zA-Z][a-zA-Z0-9_]*(\.[a-zA-Z][a-zA-Z0-9_]*)+$/;
const THAI = /[\u0E00-\u0E7F]/;

/** Keys that look like secrets, anywhere in the config (values are never echoed). */
export function secretKeys(v: unknown, at = ""): string[] {
  if (!v || typeof v !== "object") return [];
  const out: string[] = [];
  for (const [k, val] of Object.entries(v as Record<string, unknown>)) {
    const p = at ? `${at}.${k}` : k;
    if (SECRET_KEY.test(k)) out.push(p);
    out.push(...secretKeys(val, p));
  }
  return out;
}

export function sourceDir(root: string, cfg: ShipConfig): string {
  return path.isAbsolute(cfg.source) ? cfg.source : path.resolve(root, cfg.source);
}

export function validateConfig(root: string, cfg: ShipConfig, file: string): { errors: Diagnostic[]; warnings: Diagnostic[] } {
  const errors: Diagnostic[] = [];
  const warnings: Diagnostic[] = [];
  const err = (p: string, m: string) => errors.push({ path: `${file}${p}`, message: m });
  const warn = (p: string, m: string) => warnings.push({ path: `${file}${p}`, message: m });
  if (!cfg || typeof cfg !== "object") return err("", "not an object"), { errors, warnings };
  for (const k of secretKeys(cfg)) err(`:${k}`, "secrets don't belong in easyship.json — use BUTLER_API_KEY / EASYSHIP_KEYSTORE_PASSWORD in your shell");
  if (cfg.format !== FORMAT) err(":format", `must be "${FORMAT}"`);
  if (typeof cfg.id !== "string" || !/^[a-z0-9][a-z0-9_-]*$/.test(cfg.id)) err(":id", "a-z, 0-9, _ or -");
  if (!cfg.name || !cfg.name.th || !cfg.name.en) err(":name", "name needs th and en");
  else if (!THAI.test(cfg.name.th)) warn(":name.th", "Thai name is not in Thai script");
  if (typeof cfg.version !== "string" || !SEMVER.test(cfg.version)) err(":version", "use semantic versioning, e.g. 0.1.0");
  if (!ENGINES.includes(cfg.engine)) err(":engine", `one of ${ENGINES.join(", ")}`);
  if (!Array.isArray(cfg.targets) || !cfg.targets.length) err(":targets", `list of ${TARGETS.join(", ")}`);
  else for (const t of cfg.targets) if (!TARGETS.includes(t)) err(":targets", `unknown target ${JSON.stringify(t)}`);
  if (typeof cfg.source !== "string" || !cfg.source) err(":source", "path to the game folder");
  else {
    const src = sourceDir(root, cfg);
    if (!existsSync(src) || !statSync(src).isDirectory()) err(":source", `${cfg.source} is not a folder`);
    else if (cfg.engine === "godot" && !existsSync(path.join(src, "project.godot"))) err(":source", `${cfg.source} has no project.godot`);
    else if (cfg.engine === "pixi" && !existsSync(path.join(src, cfg.pixi?.entry ?? "index.html"))) err(":source", `${cfg.source} has no ${cfg.pixi?.entry ?? "index.html"}`);
    if (existsSync(src) && path.relative(path.resolve(root), src).startsWith("..")) warn(":source", "source is outside the workspace");
  }
  if (cfg.itch) {
    if (!SLUG.test(cfg.itch.user ?? "") || !SLUG.test(cfg.itch.game ?? "")) err(":itch", "itch.user and itch.game are the slugs in https://<user>.itch.io/<game>");
    else if (cfg.itch.user === "your-itch-name") warn(":itch.user", "placeholder itch.io user — uploads stay disabled until you set yours");
    for (const [t, ch] of Object.entries(cfg.itch.channels ?? {})) if (!SLUG.test(String(ch))) err(`:itch.channels.${t}`, "channel names are a-z, 0-9, - or _");
  } else warn(":itch", "no itch.io target — builds only");
  if (cfg.engine === "godot" && cfg.targets?.includes("android")) {
    if (!cfg.android?.package || !ANDROID_PKG.test(cfg.android.package)) err(":android.package", "Android needs a package name like org.studio.game");
    if (cfg.android?.release) {
      if (!cfg.android.keystore?.path || !cfg.android.keystore.alias) err(":android.keystore", "release builds need keystore {path, alias}; the password comes from EASYSHIP_KEYSTORE_PASSWORD");
      else if (!existsSync(path.resolve(root, cfg.android.keystore.path))) warn(":android.keystore.path", "keystore file not found");
    }
  }
  if (cfg.engine === "pixi") for (const t of cfg.targets ?? []) if (t !== "web") warn(":targets", `${t}: PixiJS games ship to the web only in Easy Ship 0.1 (wrap with Tauri / Electron / Capacitor yourself)`);
  return { errors, warnings };
}

export async function loadConfigs(root: string) {
  const errors: Diagnostic[] = [];
  const warnings: Diagnostic[] = [];
  const configs: ShipConfig[] = [];
  for (const c of await listConfigs(root)) {
    const f = `ships/${c.id}${EXT}`;
    if (c.parseError) {
      errors.push({ path: f, message: `JSON: ${c.parseError}` });
      continue;
    }
    const v = validateConfig(root, c.config!, f);
    errors.push(...v.errors);
    warnings.push(...v.warnings);
    if (c.config!.id !== c.id) errors.push({ path: f, message: `id "${c.config!.id}" must match the file name (${c.id})` });
    configs.push(c.config!);
  }
  return { configs, errors, warnings };
}

export async function getConfig(root: string, id: string, opts: { strict?: boolean } = {}): Promise<ShipConfig> {
  assertSafeId(id, "game id");
  const file = path.join(dirs(root).ships, `${id}${EXT}`);
  if (!existsSync(file)) {
    const all = (await listConfigs(root)).map((c) => c.id);
    throw new Error(`No ships/${id}${EXT} (have: ${all.join(", ") || "none"})`);
  }
  const cfg = JSON.parse(await readFile(file, "utf8")) as ShipConfig;
  if (opts.strict !== false) {
    const v = validateConfig(root, cfg, `ships/${id}${EXT}`);
    if (v.errors.length) throw new Error(v.errors.map((e) => `${e.path}: ${e.message}`).join("; "));
  }
  return cfg;
}

export async function saveConfig(root: string, cfg: ShipConfig, opts: { dryRun?: boolean } = {}) {
  assertSafeId(cfg.id, "game id");
  const file = path.join(dirs(root).ships, `${cfg.id}${EXT}`);
  const v = validateConfig(root, cfg, `ships/${cfg.id}${EXT}`);
  if (v.errors.length || opts.dryRun) return { saved: false, file, ...v };
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, `${JSON.stringify(cfg, null, 2)}\n`);
  return { saved: true, file, ...v };
}

export async function workspaceSummary(root: string) {
  const r = await loadConfigs(root);
  return {
    root,
    games: r.configs.map((c) => ({ id: c.id, name: c.name, version: c.version, engine: c.engine, source: c.source, targets: c.targets, itch: c.itch ? `${c.itch.user}/${c.itch.game}` : null })),
    errors: r.errors,
    warnings: r.warnings,
  };
}

export async function checkWorkspace(root: string) {
  const r = await loadConfigs(root);
  return { ok: r.errors.length === 0, games: r.configs.length, errors: r.errors, warnings: r.warnings };
}

/** Glob (`*`, `**`, `?`) → RegExp over forward-slash relative paths. */
export function globRe(g: string): RegExp {
  let re = "";
  for (let i = 0; i < g.length; i++) {
    const c = g[i]!;
    if (c === "*" && g[i + 1] === "*") {
      re += g[i + 2] === "/" ? "(?:.*/)?" : ".*";
      i += g[i + 2] === "/" ? 2 : 1;
    } else if (c === "*") re += "[^/]*";
    else if (c === "?") re += "[^/]";
    else re += c.replace(/[.+^${}()|[\]\\]/g, "\\$&");
  }
  return new RegExp(`^${re}$`);
}
export function excluded(rel: string, patterns: string[]): boolean {
  return patterns.some((p) => globRe(p).test(rel));
}
