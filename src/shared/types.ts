export const FORMAT = "easyship/1";
export const ENGINES = ["godot", "pixi"] as const;
export type Engine = (typeof ENGINES)[number];
export const TARGETS = ["web", "windows", "linux", "android"] as const;
export type Target = (typeof TARGETS)[number];
/** Default itch.io channel per target (butler picks the platform tag from the channel name). */
export const ITCH_CHANNELS: Record<Target, string> = { web: "html5", windows: "windows", linux: "linux", android: "android" };
export const TARGET_TH: Record<Target, string> = { web: "เว็บ", windows: "วินโดวส์", linux: "ลินุกซ์", android: "แอนดรอยด์" };

export interface Name {
  th: string;
  en: string;
  ms?: string;
}

export interface ShipConfig {
  format: string;
  id: string;
  name: Name;
  /** Semantic version, sent to butler as --userversion and used in file names. */
  version: string;
  engine: Engine;
  /** Godot project folder (has project.godot) or the static Pixi game folder (has index.html); relative to the workspace. */
  source: string;
  targets: Target[];
  itch?: { user: string; game: string; channels?: Partial<Record<Target, string>> };
  web?: { threads?: boolean; canvasResize?: "none" | "project" | "adaptive" };
  windows?: { console?: boolean };
  android?: { package: string; versionCode?: number; minSdk?: number; release?: boolean; keystore?: { path: string; alias: string } };
  pixi?: { entry?: string; vendor?: boolean };
  exclude?: string[];
}

export interface Diagnostic {
  path: string;
  message: string;
}

export type StepKind = "import" | "project-setting" | "presets" | "godot-export" | "copy-static" | "vendor-pixi" | "package" | "checks" | "butler-push";
export interface Step {
  kind: StepKind;
  label: string;
  /** Exact argv when the step runs a program (shown in dry runs). */
  command?: string[];
  out?: string;
}
export type TargetStatus = "ready" | "blocked" | "unsupported";
export interface TargetPlan {
  target: Target;
  status: TargetStatus;
  steps: Step[];
  blockers: string[];
  notes: string[];
  /** Folder the build lands in, and the file butler pushes. */
  buildDir: string;
  artifact: string;
  channel?: string;
}
export interface ShipPlan {
  game: string;
  version: string;
  engine: Engine;
  source: string;
  outDir: string;
  targets: TargetPlan[];
  upload: { possible: boolean; blockers: string[]; commands: string[][] };
}
