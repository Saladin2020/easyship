/**
 * Toolchain report: what can build and ship on this machine. Reads versions and checks that files exist; never reads
 * or prints credentials (only whether BUTLER_API_KEY is set and whether butler's credentials file exists).
 */
import { execFile } from "node:child_process";
import { existsSync, readdirSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";

const run = promisify(execFile);

export interface Tool {
  path: string | null;
  version: string | null;
  note?: string;
}
export interface Doctor {
  platform: string;
  node: string;
  godot: Tool & { templatesDir: string | null; templates: Record<string, boolean> };
  java: Tool;
  androidSdk: { path: string | null; apksigner: boolean; buildTools: string | null };
  butler: Tool & { apiKeyEnv: boolean; credentialsFile: boolean };
  pixi: { path: string | null };
}

export const TEMPLATE_FILES = {
  web: "web_nothreads_release.zip",
  web_threads: "web_release.zip",
  windows: "windows_release_x86_64.exe",
  linux: "linux_release.x86_64",
  android: "android_release.apk",
  android_debug: "android_debug.apk",
} as const;

const exe = (n: string) => (process.platform === "win32" ? `${n}.exe` : n);
function onPath(names: string[]): string | null {
  for (const dir of (process.env.PATH ?? "").split(path.delimiter).filter(Boolean))
    for (const n of names) {
      const p = path.join(dir, exe(n));
      if (existsSync(p)) return p;
    }
  return null;
}
async function version(cmd: string, args: string[]): Promise<string | null> {
  try {
    const { stdout, stderr } = await run(cmd, args, { timeout: 20_000 });
    return (stdout.trim() || stderr.trim()).split("\n")[0]!.trim() || null;
  } catch (e) {
    const err = e as { stdout?: string; stderr?: string };
    const t = (err.stdout ?? "").trim() || (err.stderr ?? "").trim();
    return t ? t.split("\n")[0]!.trim() : null;
  }
}

export function findGodot(): string | null {
  for (const k of ["EASYSHIP_GODOT", "GODOT"]) {
    const v = process.env[k]?.trim();
    if (v && existsSync(v)) return v;
  }
  return onPath(["godot", "godot4", "Godot", "godot-4"]);
}

export function templatesDir(godotVersion: string | null): string | null {
  const m = godotVersion?.match(/^(\d+\.\d+(?:\.\d+)?)\.([a-z0-9]+)/);
  if (!m) return null;
  const ver = `${m[1]}.${m[2]}`;
  const home = os.homedir();
  const base =
    process.platform === "win32" ? path.join(process.env.APPDATA ?? path.join(home, "AppData", "Roaming"), "Godot") : process.platform === "darwin" ? path.join(home, "Library", "Application Support", "Godot") : path.join(process.env.XDG_DATA_HOME ?? path.join(home, ".local", "share"), "godot");
  return path.join(base, "export_templates", ver);
}

function butlerCredsFile(): string {
  const home = os.homedir();
  if (process.platform === "win32") return path.join(process.env.APPDATA ?? path.join(home, "AppData", "Roaming"), "itch", "butler_creds");
  if (process.platform === "darwin") return path.join(home, "Library", "Application Support", "itch", "butler_creds");
  return path.join(process.env.XDG_CONFIG_HOME ?? path.join(home, ".config"), "itch", "butler_creds");
}

/** pixi.min.js to vendor into Pixi web builds: EASYSHIP_PIXI, or node_modules/pixi.js under the workspace. */
export function findPixi(workspace?: string): string | null {
  const env = process.env.EASYSHIP_PIXI?.trim();
  if (env && existsSync(env)) return env;
  if (workspace) {
    const p = path.join(workspace, "node_modules", "pixi.js", "dist", "pixi.min.js");
    if (existsSync(p)) return p;
  }
  return null;
}

let cache: { at: number; key: string; value: Doctor } | null = null;

export async function doctor(workspace?: string, opts: { fresh?: boolean } = {}): Promise<Doctor> {
  const key = `${workspace ?? ""}|${process.env.EASYSHIP_GODOT ?? ""}|${process.env.GODOT ?? ""}|${process.env.PATH ?? ""}`;
  if (!opts.fresh && cache && cache.key === key && Date.now() - cache.at < 30_000) return cache.value;
  const g = findGodot();
  const gv = g ? await version(g, ["--headless", "--version"]) : null;
  const tdir = templatesDir(gv);
  const templates = Object.fromEntries(Object.entries(TEMPLATE_FILES).map(([k, f]) => [k, !!tdir && existsSync(path.join(tdir, f))]));
  const javaHome = process.env.JAVA_HOME?.trim();
  const java = javaHome && existsSync(path.join(javaHome, "bin", exe("java"))) ? path.join(javaHome, "bin", exe("java")) : onPath(["java"]);
  const jv = java ? await version(java, ["-version"]) : null;
  const sdk = [process.env.ANDROID_HOME, process.env.ANDROID_SDK_ROOT].map((s) => s?.trim()).find((s) => s && existsSync(s)) ?? null;
  let buildTools: string | null = null;
  let apksigner = false;
  if (sdk && existsSync(path.join(sdk, "build-tools"))) {
    const vers = readdirSync(path.join(sdk, "build-tools")).sort();
    buildTools = vers.at(-1) ?? null;
    apksigner = !!buildTools && (existsSync(path.join(sdk, "build-tools", buildTools, "apksigner")) || existsSync(path.join(sdk, "build-tools", buildTools, "apksigner.bat")));
  }
  const butler = process.env.EASYSHIP_BUTLER?.trim() && existsSync(process.env.EASYSHIP_BUTLER.trim()) ? process.env.EASYSHIP_BUTLER.trim() : onPath(["butler"]);
  const bv = butler ? await version(butler, ["-V"]) : null;
  const value: Doctor = {
    platform: `${process.platform}-${process.arch}`,
    node: process.version,
    godot: { path: g, version: gv, templatesDir: tdir, templates, ...(g ? {} : { note: "set EASYSHIP_GODOT to the Godot 4.3+ editor binary" }) },
    java: { path: java, version: jv, ...(java ? {} : { note: "Android export needs JDK 17 (set JAVA_HOME)" }) },
    androidSdk: { path: sdk, apksigner, buildTools },
    butler: { path: butler, version: bv, apiKeyEnv: !!process.env.BUTLER_API_KEY, credentialsFile: existsSync(butlerCredsFile()), ...(butler ? {} : { note: "install butler from itch.io/docs/butler to upload" }) },
    pixi: { path: findPixi(workspace) },
  };
  cache = { at: Date.now(), key, value };
  return value;
}

/** One line per check for the CLI / web: [ok, label, detail]. */
export function doctorLines(d: Doctor): Array<[boolean, string, string]> {
  const t = d.godot.templates;
  return [
    [!!d.godot.path, "Godot", d.godot.path ? `${d.godot.version ?? "?"} (${d.godot.path})` : (d.godot.note ?? "not found")],
    [!!t.web, "templates · web", d.godot.templatesDir ? `${TEMPLATE_FILES.web}${t.web ? "" : " missing"} in ${d.godot.templatesDir}` : "no Godot version"],
    [!!t.windows, "templates · windows", t.windows ? TEMPLATE_FILES.windows : `${TEMPLATE_FILES.windows} missing`],
    [!!t.linux, "templates · linux", t.linux ? TEMPLATE_FILES.linux : `${TEMPLATE_FILES.linux} missing`],
    [!!t.android, "templates · android", t.android ? TEMPLATE_FILES.android : `${TEMPLATE_FILES.android} missing`],
    [!!d.java.path, "Java (Android)", d.java.path ? `${d.java.version ?? "?"}` : (d.java.note ?? "not found")],
    [!!d.androidSdk.path && d.androidSdk.apksigner, "Android SDK", d.androidSdk.path ? `${d.androidSdk.path} · build-tools ${d.androidSdk.buildTools ?? "none"}${d.androidSdk.apksigner ? " · apksigner" : " · no apksigner"}` : "set ANDROID_HOME"],
    [!!d.butler.path, "butler", d.butler.path ? `${d.butler.version ?? "?"}` : (d.butler.note ?? "not found")],
    [d.butler.apiKeyEnv || d.butler.credentialsFile, "itch.io login", d.butler.apiKeyEnv ? "BUTLER_API_KEY is set" : d.butler.credentialsFile ? "butler credentials file present (butler login)" : "run butler login, or set BUTLER_API_KEY in your shell (never in easyship.json)"],
    [!!d.pixi.path, "pixi.min.js", d.pixi.path ?? "not found (set EASYSHIP_PIXI or npm i pixi.js in the workspace) — Pixi builds will load PixiJS from the CDN"],
  ];
}
