/**
 * Optional real export: GODOT=/path/to/godot npx vitest run test/godot.test.ts
 * Needs the Godot 4.3 export templates (web_nothreads_release.zip, linux_release.x86_64, windows_release_x86_64.exe).
 * Ships the sample Godot game to web, Windows and Linux, checks the artifacts and runs the Linux build headless.
 */
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { chmod, writeFile } from "node:fs/promises";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { doctor } from "../src/lib/doctor.js";
import { ship } from "../src/lib/ship.js";
import { readZipIndex } from "../src/lib/zip.js";
import { tempWorkspace } from "./helpers.js";

const GODOT = process.env.GODOT;
let root: string;
let cleanup: () => Promise<void>;
beforeAll(async () => {
  if (GODOT) ({ root, cleanup } = await tempWorkspace());
});
afterAll(() => cleanup?.());

describe.skipIf(!GODOT)("Godot export", () => {
  it("web + windows + linux builds that run", async () => {
    const d = await doctor(root, { fresh: true });
    expect(d.godot.version).toMatch(/^4\./);
    const preset = path.join(root, "games", "firefly_godot", "export_presets.cfg");
    await writeFile(preset, `[preset.0]\n\nname="Mine"\nplatform="Linux"\n\n[preset.0.options]\n\n`);
    const r = await ship(root, "firefly_godot", { build: true, targets: ["web", "windows", "linux"] });
    for (const t of r.results) expect(t.status, `${t.target}: ${t.error}`).toBe("built");
    expect(existsSync(`${preset}.easyship.bak`)).toBe(true);
    const web = (await readZipIndex(r.results[0]!.artifact!)).map((e) => e.name);
    expect(web).toEqual(expect.arrayContaining(["index.html", "index.wasm", "index.pck", "index.js"]));
    const lin = await readZipIndex(r.results[2]!.artifact!);
    expect(lin[0]!.mode & 0o111).toBeTruthy();
    const bin = path.join(root, "releases", "firefly_godot", "0.1.0", "linux", "firefly_godot.x86_64");
    await chmod(bin, 0o755);
    const run = spawnSync(bin, ["--headless", "--quit-after", "10"], { encoding: "utf8", timeout: 60_000 });
    expect(run.stdout).toMatch(/FIREFLY READY 0\.1\.0/);
  }, 900_000);
});
