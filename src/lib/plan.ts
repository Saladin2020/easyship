import { existsSync, readFileSync } from "node:fs";
import { hasEtc2Astc } from "./android.js";
import path from "node:path";
import { ITCH_CHANNELS, type ShipConfig, type ShipPlan, type Step, type Target, type TargetPlan } from "../shared/types.js";
import { TEMPLATE_FILES, type Doctor } from "./doctor.js";
import { PRESET_NAME } from "./presets.js";
import { dirs, sourceDir } from "./workspace.js";

export interface PlanOptions {
  targets?: Target[];
  upload?: boolean;
}

export const artifactName = (cfg: ShipConfig, t: Target) => (t === "android" ? `${cfg.id}-${cfg.version}.apk` : `${cfg.id}-${cfg.version}-${t}.zip`);
const binaryName = (cfg: ShipConfig, t: Target) => ({ web: "index.html", windows: `${cfg.id}.exe`, linux: `${cfg.id}.x86_64`, android: `${cfg.id}-${cfg.version}.apk` })[t];

/** What `ship` would do, without touching anything. */
export function planShip(root: string, cfg: ShipConfig, doc: Doctor, opts: PlanOptions = {}): ShipPlan {
  const src = sourceDir(root, cfg);
  const outDir = path.join(dirs(root).releases, cfg.id, cfg.version);
  const wanted = opts.targets?.length ? opts.targets : cfg.targets;
  const plans: TargetPlan[] = [];
  const godot = doc.godot.path ?? "godot";
  for (const t of wanted) {
    const buildDir = path.join(outDir, t);
    const artifact = path.join(outDir, artifactName(cfg, t));
    const steps: Step[] = [];
    const blockers: string[] = [];
    const notes: string[] = [];
    if (!cfg.targets.includes(t)) notes.push(`${t} is not in the config's targets; building it anyway because it was asked for`);
    if (cfg.engine === "pixi") {
      if (t !== "web") {
        plans.push({ target: t, status: "unsupported", steps: [], blockers: [`PixiJS games ship to the web only in Easy Ship 0.1 — wrap the web build with Tauri / Electron (desktop) or Capacitor (Android) yourself`], notes, buildDir, artifact });
        continue;
      }
      steps.push({ kind: "copy-static", label: `copy ${path.relative(root, src) || "."} → ${path.relative(root, buildDir)} (skipping secrets, .git, node_modules${cfg.exclude?.length ? `, ${cfg.exclude.join(", ")}` : ""})`, out: buildDir });
      const hasLocal = existsSync(path.join(src, "pixi.min.js"));
      if (cfg.pixi?.vendor !== false && !hasLocal) {
        if (doc.pixi.path) steps.push({ kind: "vendor-pixi", label: `vendor ${doc.pixi.path} as pixi.min.js (offline-safe on itch.io)`, out: path.join(buildDir, "pixi.min.js") });
        else notes.push("pixi.min.js not found locally (EASYSHIP_PIXI or workspace node_modules/pixi.js): the game will load PixiJS from the CDN");
      }
    } else {
      if (!doc.godot.path) blockers.push("Godot not found (set EASYSHIP_GODOT)");
      const tf = t === "web" ? (cfg.web?.threads ? TEMPLATE_FILES.web_threads : TEMPLATE_FILES.web) : t === "android" ? (cfg.android?.release ? TEMPLATE_FILES.android : TEMPLATE_FILES.android_debug) : TEMPLATE_FILES[t];
      const tk = (Object.entries(TEMPLATE_FILES).find(([, f]) => f === tf) ?? [t])[0] as keyof typeof TEMPLATE_FILES;
      if (doc.godot.path && !doc.godot.templates[tk]) blockers.push(`export template ${tf} missing in ${doc.godot.templatesDir ?? "the templates folder"} (Godot → Editor → Manage Export Templates)`);
      if (t === "android") {
        if (!doc.java.path) blockers.push("Java 17 not found (set JAVA_HOME)");
        if (!doc.androidSdk.path) blockers.push("Android SDK not found (set ANDROID_HOME)");
        else if (!doc.androidSdk.apksigner) blockers.push("apksigner missing (install Android SDK build-tools)");
        if (cfg.android?.release && !process.env.EASYSHIP_KEYSTORE_PASSWORD) blockers.push("release APK: set EASYSHIP_KEYSTORE_PASSWORD in your shell");
        if (!cfg.android?.release) notes.push("debug-signed APK (set android.release + keystore for the Play Store / itch release)");
      }
      if (t === "windows") notes.push("icon/metadata patching (rcedit) is off; the exe works without it. Not code-signed: Windows SmartScreen may warn");
      if (t === "web" && !cfg.web?.threads) notes.push("single-threaded web build: runs on itch.io without SharedArrayBuffer / COOP-COEP headers");
      if (t === "web" && cfg.web?.threads) notes.push("threaded web build: enable 'SharedArrayBuffer support' in the itch.io embed options");
      if (t === "android" && existsSync(path.join(src, "project.godot")) && !hasEtc2Astc(readFileSync(path.join(src, "project.godot"), "utf8"))) {
        steps.push({ kind: "project-setting", label: "turn on ETC2/ASTC texture import in project.godot (Android needs it; backup project.godot.easyship.bak) and re-import", out: path.join(src, "project.godot") });
      }
      if (!existsSync(path.join(src, ".godot"))) steps.push({ kind: "import", label: "first import of the project (creates .godot/)", command: [godot, "--headless", "--editor", "--quit", "--path", src] });
      steps.push({ kind: "presets", label: `add "${PRESET_NAME[t]}" to export_presets.cfg (your presets are kept; backup export_presets.cfg.easyship.bak)`, out: path.join(src, "export_presets.cfg") });
      const debug = t === "android" && !cfg.android?.release;
      steps.push({ kind: "godot-export", label: `export ${t}${debug ? " (debug)" : ""}`, command: [godot, "--headless", "--path", src, debug ? "--export-debug" : "--export-release", PRESET_NAME[t], path.join(buildDir, binaryName(cfg, t))], out: buildDir });
    }
    steps.push({ kind: "checks", label: t === "web" ? "index.html at the root, ≤ 1000 files, no file over 200 MB (itch.io HTML limits), no secrets" : "binary present and valid, no secrets in the build" });
    if (t !== "android") steps.push({ kind: "package", label: `zip → ${path.relative(root, artifact)}`, out: artifact });
    const channel = cfg.itch?.channels?.[t] ?? ITCH_CHANNELS[t];
    plans.push({ target: t, status: blockers.length ? "blocked" : "ready", steps, blockers, notes, buildDir, artifact, channel });
  }
  const upBlockers: string[] = [];
  if (!cfg.itch) upBlockers.push("no itch config in the ship file");
  else if (cfg.itch.user === "your-itch-name") upBlockers.push("itch.user is still the placeholder");
  if (!doc.butler.path) upBlockers.push("butler not installed");
  if (!doc.butler.apiKeyEnv && !doc.butler.credentialsFile) upBlockers.push("not logged in to itch.io (butler login, or BUTLER_API_KEY in your shell)");
  const commands = cfg.itch ? plans.filter((p) => p.status !== "unsupported").map((p) => [doc.butler.path ?? "butler", "push", p.artifact, `${cfg.itch!.user}/${cfg.itch!.game}:${p.channel}`, "--userversion", cfg.version]) : [];
  for (const p of plans) if (opts.upload && p.status === "ready") p.steps.push({ kind: "butler-push", label: `butler push → ${cfg.itch?.user}/${cfg.itch?.game}:${p.channel}`, command: commands.find((c) => c[2] === p.artifact) });
  return { game: cfg.id, version: cfg.version, engine: cfg.engine, source: src, outDir, targets: plans, upload: { possible: upBlockers.length === 0, blockers: upBlockers, commands } };
}
