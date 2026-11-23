import { existsSync, readdirSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { doctor } from "../src/lib/doctor.js";
import { planShip } from "../src/lib/plan.js";
import { ship } from "../src/lib/ship.js";
import { checkWorkspace, getConfig, saveConfig, validateConfig, workspaceSummary } from "../src/lib/workspace.js";
import { readZipIndex } from "../src/lib/zip.js";
import { tempWorkspace } from "./helpers.js";

let root: string;
let cleanup: () => Promise<void>;
const saved = { ...process.env };
beforeAll(async () => {
  ({ root, cleanup } = await tempWorkspace());
  // a fake toolchain-free environment: no Godot, no butler, a local pixi.min.js
  for (const k of ["EASYSHIP_GODOT", "GODOT", "EASYSHIP_BUTLER", "BUTLER_API_KEY", "JAVA_HOME", "ANDROID_HOME", "ANDROID_SDK_ROOT"]) delete process.env[k];
  await mkdir(path.join(root, "vendor"), { recursive: true });
  await writeFile(path.join(root, "vendor", "pixi.min.js"), "globalThis.PIXI = {};");
  process.env.EASYSHIP_PIXI = path.join(root, "vendor", "pixi.min.js");
  process.env.PATH = "/usr/bin:/bin";
});
afterAll(async () => {
  process.env = saved;
  await cleanup();
});

describe("configs", () => {
  it("init gives two clean games (placeholder itch user warned)", async () => {
    const s = await workspaceSummary(root);
    expect(s.games.map((g) => g.id)).toEqual(["firefly_godot", "firefly_pixi"]);
    const c = await checkWorkspace(root);
    expect(c.ok).toBe(true);
    expect(c.warnings.some((w) => /placeholder/.test(w.message))).toBe(true);
    expect(existsSync(path.join(root, "games", "firefly_godot", ".godot"))).toBe(false);
  });
  it("refuses secrets, bad versions, missing sources and Android packages", async () => {
    const base = await getConfig(root, "firefly_godot");
    const v = validateConfig(root, { ...base, version: "1.0", source: "games/nope", itch: { user: "me", game: "g", apiKey: "abc" } as never, android: { package: "nodots" } }, "x");
    const msgs = v.errors.map((e) => `${e.path} ${e.message}`).join("\n");
    expect(msgs).toMatch(/itch\.apiKey secrets don't belong/);
    expect(msgs).not.toMatch(/abc/);
    expect(msgs).toMatch(/:version/);
    expect(msgs).toMatch(/:source/);
    expect(msgs).toMatch(/android\.package/);
    const r = await saveConfig(root, { ...base, id: "bad", itch: { user: "me", game: "g", token: "t" } as never });
    expect(r.saved).toBe(false);
    expect(existsSync(path.join(root, "ships", "bad.easyship.json"))).toBe(false);
  });
});

describe("plan + dry run", () => {
  it("Godot without a toolchain is blocked, with exact commands", async () => {
    const p = planShip(root, await getConfig(root, "firefly_godot"), await doctor(root, { fresh: true }));
    expect(p.targets.map((t) => t.status)).toEqual(["blocked", "blocked", "blocked", "blocked"]);
    const web = p.targets[0]!;
    expect(web.steps.find((s) => s.kind === "godot-export")!.command).toContain("Easy Ship · Web");
    expect(p.upload.possible).toBe(false);
    expect(p.upload.blockers.join()).toMatch(/placeholder/);
    expect(p.upload.commands[0]).toEqual(["butler", "push", path.join(root, "releases/firefly_godot/0.1.0/firefly_godot-0.1.0-web.zip"), "your-itch-name/firefly-night:html5", "--userversion", "0.1.0"]);
  });
  it("Pixi ships to the web only", async () => {
    const cfg = await getConfig(root, "firefly_pixi");
    const p = planShip(root, { ...cfg, targets: ["web", "windows"] }, await doctor(root));
    expect(p.targets.map((t) => t.status)).toEqual(["ready", "unsupported"]);
    expect(p.targets[0]!.steps.map((s) => s.kind)).toEqual(["copy-static", "vendor-pixi", "checks", "package"]);
  });
  it("ship without flags is a dry run that writes nothing", async () => {
    const r = await ship(root, "firefly_pixi");
    expect(r.dryRun).toBe(true);
    expect(r.results[0]!.status).toBe("dry-run");
    expect(existsSync(path.join(root, "releases"))).toBe(false);
  });
});

describe("build (PixiJS)", () => {
  it("copies without secrets, vendors pixi, checks and zips", async () => {
    const src = path.join(root, "games", "firefly_pixi");
    await writeFile(path.join(src, ".env"), "BUTLER_API_KEY=should-never-ship");
    await writeFile(path.join(src, "game.js.map"), "{}");
    const r = await ship(root, "firefly_pixi", { build: true });
    const web = r.results[0]!;
    expect(web.status, web.error).toBe("built");
    const idx = (await readZipIndex(web.artifact!)).map((e) => e.name);
    expect(idx).toContain("index.html");
    expect(idx).toContain("pixi.min.js");
    expect(idx).not.toContain(".env");
    expect(idx).not.toContain("game.js.map");
    expect(web.checks.every((c) => c.ok)).toBe(true);
    const md = await readFile(r.report!, "utf8");
    expect(md).toMatch(/Upload not possible yet/);
    expect(md).not.toMatch(/should-never-ship/);
    expect(readdirSync(path.join(root, "releases", "firefly_pixi", "0.1.0")).sort()).toEqual(["SHIP.md", "firefly_pixi-0.1.0-web.zip", "ship-report.json", "web"]);
  });
  it("a private key in the game fails the build", async () => {
    await writeFile(path.join(root, "games", "firefly_pixi", "deploy.pem"), "-----BEGIN PRIVATE KEY-----\nx\n");
    const r = await ship(root, "firefly_pixi", { build: true });
    expect(r.results[0]!.status).toBe("failed");
    expect(r.results[0]!.error).toMatch(/deploy\.pem/);
  });
  it("--upload without butler / login uploads nothing", async () => {
    const r = await ship(root, "firefly_pixi", { upload: true });
    expect(r.results.every((x) => x.status !== "uploaded")).toBe(true);
  });
});
