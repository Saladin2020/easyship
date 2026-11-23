/**
 * What a headless Godot 4.3+ needs for an Android export that the editor normally sets up by hand:
 *   - Java and Android SDK paths: Godot reads them only from Editor Settings (not JAVA_HOME / ANDROID_HOME). On
 *     Linux / BSD the export runs with a private XDG_CONFIG_HOME holding a copy of your editor settings with the
 *     two paths filled in from the doctor, so your own Godot config is never edited.
 *   - a debug keystore for debug APKs: Godot's usual one (<Godot data dir>/keystores/debug.keystore), created with
 *     keytool and the standard public Android debug credentials when it is missing, passed with
 *     GODOT_ANDROID_KEYSTORE_DEBUG_*. Release keystores stay the user's (EASYSHIP_KEYSTORE_PASSWORD).
 */
import { spawnSync } from "node:child_process";
import { existsSync, realpathSync } from "node:fs";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type { Doctor } from "./doctor.js";

/** Android's documented, public debug-keystore credentials (not a secret). */
export const DEBUG_KEYSTORE = { alias: "androiddebugkey", password: "android" } as const;

const home = () => os.homedir();
const xdgPlatform = () => process.platform !== "win32" && process.platform !== "darwin";

export function godotDataDir(): string {
  if (process.platform === "win32") return path.join(process.env.APPDATA ?? path.join(home(), "AppData", "Roaming"), "Godot");
  if (process.platform === "darwin") return path.join(home(), "Library", "Application Support", "Godot");
  return path.join(process.env.XDG_DATA_HOME ?? path.join(home(), ".local", "share"), "godot");
}

export function godotConfigDir(): string {
  if (!xdgPlatform()) return godotDataDir();
  return path.join(process.env.XDG_CONFIG_HOME ?? path.join(home(), ".config"), "godot");
}

/** JAVA_HOME of the doctor's java (…/bin/java → …), following symlinks such as /usr/bin/java. */
export function javaHome(doc: Doctor): string | null {
  const env = process.env.JAVA_HOME?.trim();
  if (env && existsSync(env)) return env;
  if (!doc.java.path) return null;
  let p = doc.java.path;
  try {
    p = realpathSync(p);
  } catch {
    // keep the path as found
  }
  return path.dirname(path.dirname(p));
}

export function keytoolPath(doc: Doctor): string | null {
  const jh = javaHome(doc);
  const k = jh ? path.join(jh, "bin", process.platform === "win32" ? "keytool.exe" : "keytool") : null;
  return k && existsSync(k) ? k : null;
}

export function debugKeystorePath(): string {
  return process.env.GODOT_ANDROID_KEYSTORE_DEBUG_PATH?.trim() || path.join(godotDataDir(), "keystores", "debug.keystore");
}

/** Editor-settings text with the two Android paths set (adds them, or replaces empty / stale values). */
export function withAndroidPaths(settings: string | null, java: string, sdk: string): string {
  const q = (s: string) => `"${s.replace(/\\/g, "/").replace(/"/g, '\\"')}"`;
  let text = settings ?? '[gd_resource type="EditorSettings" format=3]\n\n[resource]\n';
  for (const [k, v] of [["export/android/java_sdk_path", java], ["export/android/android_sdk_path", sdk]] as const) {
    const re = new RegExp(`^${k.replace(/\//g, "\\/")} = .*$`, "m");
    if (re.test(text)) text = text.replace(re, `${k} = ${q(v)}`);
    else text = text.replace(/^\[resource\]\s*$/m, `[resource]\n${k} = ${q(v)}`);
  }
  return text;
}

export interface AndroidEnv {
  env: NodeJS.ProcessEnv;
  notes: string[];
  cleanup: () => Promise<void>;
}

/** Environment for `godot --export-debug|--export-release "Easy Ship · Android"`. Throws with a clear reason. */
export async function prepareAndroidEnv(doc: Doctor, opts: { release: boolean; godotVersion: string | null }): Promise<AndroidEnv> {
  const env: NodeJS.ProcessEnv = {};
  const notes: string[] = [];
  let tmp: string | null = null;
  const java = javaHome(doc);
  const sdk = doc.androidSdk.path;
  if (!java) throw new Error("Java not found (set JAVA_HOME to a JDK 17)");
  if (!sdk) throw new Error("Android SDK not found (set ANDROID_HOME)");
  // apksigner (a shell script) runs `java` from PATH: without it Godot leaves the APK unsigned
  env.JAVA_HOME = java;
  env.PATH = `${path.join(java, "bin")}${path.delimiter}${process.env.PATH ?? ""}`;
  if (xdgPlatform()) {
    const ver = opts.godotVersion?.match(/^(\d+\.\d+)/)?.[1] ?? "4.3";
    const name = `editor_settings-${ver}.tres`;
    const own = path.join(godotConfigDir(), name);
    tmp = await mkdtemp(path.join(os.tmpdir(), "easyship-godot-cfg-"));
    await mkdir(path.join(tmp, "godot"), { recursive: true });
    const text = existsSync(own) ? await readFile(own, "utf8") : null;
    await writeFile(path.join(tmp, "godot", name), withAndroidPaths(text, java, sdk));
    env.XDG_CONFIG_HOME = tmp;
    notes.push(`Godot Editor Settings for this export: Java ${java}, Android SDK ${sdk} (your own editor settings are not changed)`);
  } else {
    notes.push("set Editor Settings → Export → Android → Java SDK Path / Android SDK Path in Godot once (Godot ignores JAVA_HOME / ANDROID_HOME)");
  }
  if (!opts.release) {
    const ks = debugKeystorePath();
    if (!existsSync(ks)) {
      const keytool = keytoolPath(doc);
      if (!keytool) throw new Error(`no debug keystore at ${ks} and no keytool to create one (install a JDK 17)`);
      await mkdir(path.dirname(ks), { recursive: true });
      const r = spawnSync(keytool, ["-genkeypair", "-keystore", ks, "-storepass", DEBUG_KEYSTORE.password, "-alias", DEBUG_KEYSTORE.alias, "-keypass", DEBUG_KEYSTORE.password, "-keyalg", "RSA", "-keysize", "2048", "-validity", "10000", "-dname", "CN=Android Debug,O=Android,C=US"], { encoding: "utf8" });
      if (r.status !== 0 || !existsSync(ks)) throw new Error(`keytool could not create the debug keystore: ${(r.stderr || r.stdout || "").slice(-300)}`);
      notes.push(`created the standard Android debug keystore at ${ks}`);
    }
    env.GODOT_ANDROID_KEYSTORE_DEBUG_PATH = ks;
    env.GODOT_ANDROID_KEYSTORE_DEBUG_USER = process.env.GODOT_ANDROID_KEYSTORE_DEBUG_USER?.trim() || DEBUG_KEYSTORE.alias;
    env.GODOT_ANDROID_KEYSTORE_DEBUG_PASSWORD = process.env.GODOT_ANDROID_KEYSTORE_DEBUG_PASSWORD?.trim() || DEBUG_KEYSTORE.password;
  }
  return { env, notes, cleanup: async () => { if (tmp) await rm(tmp, { recursive: true, force: true }); } };
}

/** Godot's export error with its reasons (the lines after "configuration errors:" do not start with ERROR). */
export function godotExportError(out: string): string {
  const lines = out.split("\n").map((l) => l.trimEnd());
  const keep: string[] = [];
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i]!;
    if (/configuration errors:/.test(l)) {
      keep.push(l.replace(/^ERROR:\s*/, ""));
      for (let j = i + 1; j < lines.length && !/^\s+at: /.test(lines[j]!) && !/^ERROR:/.test(lines[j]!); j++) if (lines[j]!.trim()) keep.push(`  ${lines[j]!.trim()}`);
    } else if (/^(ERROR|WARNING):|savepack|export/i.test(l) && !keep.includes(l)) keep.push(l);
  }
  return keep.slice(-16).join("\n");
}

/** Godot refuses Android exports (with an empty error list in 4.3) unless ETC2/ASTC texture import is on. */
export const ETC2_ASTC_KEY = "textures/vram_compression/import_etc2_astc";

export function hasEtc2Astc(projectGodot: string): boolean {
  let section = "";
  for (const line of projectGodot.split(/\r?\n/)) {
    const m = line.match(/^\[([^\]]+)\]\s*$/);
    if (m) section = m[1]!;
    else if (section === "rendering" && line.replace(/\s+/g, "") === `${ETC2_ASTC_KEY}=true`) return true;
  }
  return false;
}

/** project.godot with ETC2/ASTC import turned on (nothing else changes). */
export function withEtc2Astc(projectGodot: string): string {
  if (hasEtc2Astc(projectGodot)) return projectGodot;
  const re = new RegExp(`^${ETC2_ASTC_KEY.replace(/\//g, "\\/")}=.*$`, "m");
  if (/^\[rendering\]\s*$/m.test(projectGodot)) {
    const lines = projectGodot.split("\n");
    let inR = false;
    for (let i = 0; i < lines.length; i++) {
      const m = lines[i]!.match(/^\[([^\]]+)\]\s*$/);
      if (m) inR = m[1] === "rendering";
      else if (inR && re.test(lines[i]!)) { lines[i] = `${ETC2_ASTC_KEY}=true`; return lines.join("\n"); }
    }
    return projectGodot.replace(/^\[rendering\]\s*$/m, `[rendering]\n\n${ETC2_ASTC_KEY}=true`);
  }
  return `${projectGodot.replace(/\s*$/, "")}\n\n[rendering]\n\n${ETC2_ASTC_KEY}=true\n`;
}
