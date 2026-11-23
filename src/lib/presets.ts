/**
 * Godot 4.3+ export_presets.cfg handling. Easy Ship adds its own presets ("Easy Ship · Web" …) and leaves the
 * project's own presets alone (renumbered to stay contiguous, which Godot requires). No secrets are written: Android
 * keystores come from GODOT_ANDROID_KEYSTORE_* environment variables at export time.
 */
import type { ShipConfig, Target } from "../shared/types.js";

export const PRESET_NAME: Record<Target, string> = { web: "Easy Ship · Web", windows: "Easy Ship · Windows", linux: "Easy Ship · Linux", android: "Easy Ship · Android" };
const PLATFORM: Record<Target, string> = { web: "Web", windows: "Windows Desktop", linux: "Linux", android: "Android" };

interface Section {
  name: string;
  lines: string[];
}

export function parseCfg(text: string): { head: string[]; sections: Section[] } {
  const head: string[] = [];
  const sections: Section[] = [];
  for (const line of text.split(/\r?\n/)) {
    const m = line.match(/^\[([^\]]+)\]\s*$/);
    if (m) sections.push({ name: m[1]!, lines: [] });
    else if (sections.length) sections.at(-1)!.lines.push(line);
    else head.push(line);
  }
  return { head, sections };
}

const q = (s: string) => `"${s.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;

function presetBody(cfg: ShipConfig, t: Target): { main: Record<string, string>; options: Record<string, string> } {
  const main: Record<string, string> = { name: q(PRESET_NAME[t]), platform: q(PLATFORM[t]), runnable: "false", advanced_options: "false", dedicated_server: "false", custom_features: '""', export_filter: '"all_resources"', include_filter: '""', exclude_filter: q("*.easyship.bak, releases/*"), export_path: '""', encryption_include_filters: '""', encryption_exclude_filters: '""', encrypt_pck: "false", encrypt_directory: "false", script_export_mode: "2" };
  const o: Record<string, string> = { "custom_template/debug": '""', "custom_template/release": '""' };
  if (t === "web") {
    Object.assign(o, {
      "variant/extensions_support": "false",
      "variant/thread_support": cfg.web?.threads ? "true" : "false",
      "vram_texture_compression/for_desktop": "true",
      "vram_texture_compression/for_mobile": "false",
      "html/export_icon": "true",
      "html/custom_html_shell": '""',
      "html/head_include": '""',
      "html/canvas_resize_policy": String({ none: 0, project: 1, adaptive: 2 }[cfg.web?.canvasResize ?? "adaptive"]),
      "html/focus_canvas_on_start": "true",
      "html/experimental_virtual_keyboard": "false",
      "progressive_web_app/enabled": "false",
    });
  }
  if (t === "windows") {
    Object.assign(o, {
      "debug/export_console_wrapper": cfg.windows?.console ? "2" : "0",
      "binary_format/embed_pck": "true",
      "texture_format/s3tc_bptc": "true",
      "texture_format/etc2_astc": "false",
      "binary_format/architecture": '"x86_64"',
      "codesign/enable": "false",
      "application/modify_resources": "false",
      "application/product_name": q(cfg.name.en),
      "application/file_version": q(`${cfg.version.replace(/[-+].*$/, "")}.0`),
      "application/product_version": q(`${cfg.version.replace(/[-+].*$/, "")}.0`),
      "ssh_remote_deploy/enabled": "false",
    });
  }
  if (t === "linux") {
    Object.assign(o, { "debug/export_console_wrapper": "0", "binary_format/embed_pck": "true", "texture_format/s3tc_bptc": "true", "texture_format/etc2_astc": "false", "binary_format/architecture": '"x86_64"', "ssh_remote_deploy/enabled": "false" });
  }
  if (t === "android") {
    Object.assign(o, {
      "gradle_build/use_gradle_build": "false",
      "gradle_build/min_sdk": q(String(cfg.android?.minSdk ?? "")),
      "architectures/armeabi-v7a": "false",
      "architectures/arm64-v8a": "true",
      "architectures/x86": "false",
      "architectures/x86_64": "false",
      "version/code": String(cfg.android?.versionCode ?? 1),
      "version/name": q(cfg.version),
      "package/unique_name": q(cfg.android?.package ?? "org.example.game"),
      "package/name": q(cfg.name.en),
      "package/signed": "true",
      "screen/immersive_mode": "true",
      "keystore/debug": '""',
      "keystore/debug_user": '""',
      "keystore/debug_password": '""',
      "keystore/release": '""',
      "keystore/release_user": '""',
      "keystore/release_password": '""',
    });
  }
  return { main, options: o };
}

/** New export_presets.cfg text: the project's presets first (renumbered), then Easy Ship's for `targets`. */
export function mergePresets(existing: string | null, cfg: ShipConfig, targets: Target[]): { text: string; kept: string[]; added: string[] } {
  const { sections } = parseCfg(existing ?? "");
  const groups = new Map<number, { main?: Section; options?: Section }>();
  const other: Section[] = [];
  for (const s of sections) {
    const m = s.name.match(/^preset\.(\d+)(\.options)?$/);
    if (!m) {
      other.push(s);
      continue;
    }
    const g = groups.get(Number(m[1])) ?? {};
    if (m[2]) g.options = s;
    else g.main = s;
    groups.set(Number(m[1]), g);
  }
  const nameOf = (s?: Section) => s?.lines.map((l) => l.match(/^name="(.*)"$/)?.[1]).find(Boolean) ?? "";
  const kept = [...groups.entries()].sort((a, b) => a[0] - b[0]).filter(([, g]) => !nameOf(g.main).startsWith("Easy Ship")).map(([, g]) => g);
  const out: string[] = [];
  let i = 0;
  const trim = (lines: string[]) => {
    const l = [...lines];
    while (l.length && !l.at(-1)!.trim()) l.pop();
    return l;
  };
  for (const g of kept) {
    out.push(`[preset.${i}]`, ...trim(g.main?.lines ?? []), "");
    out.push(`[preset.${i}.options]`, ...trim(g.options?.lines ?? []), "");
    i++;
  }
  for (const t of targets) {
    const b = presetBody(cfg, t);
    out.push(`[preset.${i}]`, "", ...Object.entries(b.main).map(([k, v]) => `${k}=${v}`), "");
    out.push(`[preset.${i}.options]`, "", ...Object.entries(b.options).map(([k, v]) => `${k}=${v}`), "");
    i++;
  }
  for (const s of other) out.push(`[${s.name}]`, ...trim(s.lines), "");
  return { text: out.join("\n"), kept: kept.map((g) => nameOf(g.main)), added: targets.map((t) => PRESET_NAME[t]) };
}
