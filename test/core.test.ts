import { mkdtemp, mkdir, readFile, writeFile, chmod } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { inflateRawSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import { mergePresets, parseCfg } from "../src/lib/presets.js";
import { excluded, globRe, secretKeys } from "../src/lib/workspace.js";
import { crc32, readZipIndex, zipDir } from "../src/lib/zip.js";
import type { ShipConfig } from "../src/shared/types.js";

const cfg: ShipConfig = { format: "easyship/1", id: "g", name: { th: "เกม", en: "Game" }, version: "1.2.3", engine: "godot", source: "g", targets: ["web", "windows", "linux", "android"], android: { package: "org.x.game", versionCode: 7 } };

describe("zip", () => {
  it("crc32 matches the reference value", () => {
    expect(crc32(Buffer.from("123456789"))).toBe(0xcbf43926);
  });
  it("round-trips files, keeps the executable bit, and is reproducible", async () => {
    const d = await mkdtemp(path.join(os.tmpdir(), "easyship-zip-"));
    await mkdir(path.join(d, "src", "sub"), { recursive: true });
    await writeFile(path.join(d, "src", "index.html"), "<html>".repeat(100));
    await writeFile(path.join(d, "src", "sub", "ไทย.txt"), "สวัสดี");
    await writeFile(path.join(d, "src", "game.x86_64"), Buffer.from([0x7f, 0x45, 0x4c, 0x46, 1, 2, 3]));
    await chmod(path.join(d, "src", "game.x86_64"), 0o755);
    const a = path.join(d, "a.zip");
    const b = path.join(d, "b.zip");
    await zipDir(path.join(d, "src"), a);
    await zipDir(path.join(d, "src"), b);
    expect((await readFile(a)).equals(await readFile(b))).toBe(true);
    const idx = await readZipIndex(a);
    expect(idx.map((e) => e.name)).toEqual(["game.x86_64", "index.html", "sub/ไทย.txt"]);
    expect(idx.find((e) => e.name === "game.x86_64")!.mode & 0o111).toBeTruthy();
    expect(idx.find((e) => e.name === "index.html")!.mode & 0o111).toBe(0);
    // the deflated index.html inflates back
    const buf = await readFile(a);
    const at = buf.indexOf(Buffer.from("index.html"));
    const local = buf.lastIndexOf(Buffer.from([0x50, 0x4b, 0x03, 0x04]), at);
    const csize = buf.readUInt32LE(local + 18);
    const data = buf.subarray(local + 30 + buf.readUInt16LE(local + 26), local + 30 + buf.readUInt16LE(local + 26) + csize);
    expect(inflateRawSync(data).toString()).toBe("<html>".repeat(100));
  });
});

describe("export presets", () => {
  const user = `[preset.0]\n\nname="My Web"\nplatform="Web"\n\n[preset.0.options]\n\nhtml/head_include=""\n\n[preset.1]\n\nname="Easy Ship · Web"\nplatform="Web"\n\n[preset.1.options]\n\nold=1\n\n[preset.2]\n\nname="Mac"\nplatform="macOS"\n\n[preset.2.options]\n\nx=1\n`;
  it("keeps the project's presets (renumbered) and replaces Easy Ship's", () => {
    const m = mergePresets(user, cfg, ["web", "linux"]);
    expect(m.kept).toEqual(["My Web", "Mac"]);
    const names = parseCfg(m.text).sections.filter((s) => /^preset\.\d+$/.test(s.name)).map((s) => [s.name, s.lines.find((l) => l.startsWith("name="))]);
    expect(names).toEqual([["preset.0", 'name="My Web"'], ["preset.1", 'name="Mac"'], ["preset.2", 'name="Easy Ship · Web"'], ["preset.3", 'name="Easy Ship · Linux"']]);
    expect(m.text).not.toMatch(/old=1/);
    expect(m.text).toMatch(/variant\/thread_support=false/);
  });
  it("android preset: package, version, no keystore secrets", () => {
    const m = mergePresets(null, cfg, ["android", "windows"]);
    expect(m.text).toMatch(/package\/unique_name="org.x.game"/);
    expect(m.text).toMatch(/version\/code=7/);
    expect(m.text).toMatch(/keystore\/release_password=""/);
    expect(m.text).toMatch(/application\/modify_resources=false/);
    expect(m.text).toMatch(/application\/file_version="1.2.3.0"/);
  });
});

describe("config helpers", () => {
  it("finds secret-looking keys anywhere", () => {
    expect(secretKeys({ itch: { user: "a", apiKey: "x" }, android: { keystore: { storePassword: "y" } } })).toEqual(["itch.apiKey", "android.keystore.storePassword"]);
    expect(secretKeys(cfg)).toEqual([]);
  });
  it("globs", () => {
    expect(globRe("*.map").test("a.map")).toBe(true);
    expect(globRe("*.map").test("x/a.map")).toBe(false);
    expect(globRe("**/*.map").test("x/y/a.map")).toBe(true);
    expect(excluded("node_modules/pixi/x.js", ["node_modules/**"])).toBe(true);
    expect(excluded("deep/.env", ["**/.env"])).toBe(true);
  });
});
