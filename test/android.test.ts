import { describe, expect, it } from "vitest";
import { godotExportError, hasEtc2Astc, withAndroidPaths, withEtc2Astc } from "../src/lib/android.js";
import { peInfo } from "../src/lib/ship.js";

describe("Android export helpers", () => {
  it("fills Java / Android SDK paths into editor settings (replacing empty values, keeping the rest)", () => {
    const own = '[gd_resource type="EditorSettings" format=3]\n\n[resource]\ninterface/editor/editor_language = "th"\nexport/android/java_sdk_path = ""\nexport/android/android_sdk_path = ""\n';
    const out = withAndroidPaths(own, "/opt/jdk17", "/opt/android");
    expect(out).toContain('export/android/java_sdk_path = "/opt/jdk17"');
    expect(out).toContain('export/android/android_sdk_path = "/opt/android"');
    expect(out).toContain('interface/editor/editor_language = "th"');
    expect(out.match(/java_sdk_path/g)).toHaveLength(1);
    const fresh = withAndroidPaths(null, "C:\\jdk", "/sdk");
    expect(fresh).toMatch(/^\[gd_resource type="EditorSettings" format=3\]/);
    expect(fresh).toContain('export/android/java_sdk_path = "C:/jdk"');
  });

  it("turns on ETC2/ASTC import in [rendering] without touching other settings", () => {
    const p = '[application]\n\nconfig/name="X"\n\n[rendering]\n\nrenderer/rendering_method="gl_compatibility"\n';
    expect(hasEtc2Astc(p)).toBe(false);
    const q = withEtc2Astc(p);
    expect(hasEtc2Astc(q)).toBe(true);
    expect(q).toContain('renderer/rendering_method="gl_compatibility"');
    expect(withEtc2Astc(q)).toBe(q);
    const none = withEtc2Astc('[application]\n\nconfig/name="X"\n');
    expect(hasEtc2Astc(none)).toBe(true);
    const off = withEtc2Astc("[rendering]\n\ntextures/vram_compression/import_etc2_astc=false\n");
    expect(off).toBe("[rendering]\n\ntextures/vram_compression/import_etc2_astc=true\n");
    expect(hasEtc2Astc('[other]\ntextures/vram_compression/import_etc2_astc=true\n')).toBe(false);
  });

  it("keeps Godot's configuration-error reasons (they are not on ERROR lines)", () => {
    const out = 'Godot Engine v4.3\nERROR: Cannot export project with preset "Easy Ship · Android" due to configuration errors:\nDebug keystore not configured in the Editor Settings nor in the preset.\nA valid Java SDK path is required in Editor Settings.\n   at: _fs_changed (editor/editor_node.cpp:1012)\nERROR: Project export for preset "Easy Ship · Android" failed.\n';
    const e = godotExportError(out);
    expect(e).toContain("Debug keystore not configured");
    expect(e).toContain("A valid Java SDK path is required");
    expect(e).not.toContain("at: _fs_changed");
  });
});

describe("Windows executable check", () => {
  const pe = (machine: number, magic: number, subsystem: number) => {
    const b = Buffer.alloc(0x200);
    b.write("MZ", 0, "latin1");
    b.writeUInt32LE(0x80, 0x3c);
    b.write("PE\0\0", 0x80, "latin1");
    b.writeUInt16LE(machine, 0x84);
    b.writeUInt16LE(magic, 0x98);
    b.writeUInt16LE(subsystem, 0x98 + 68);
    return b;
  };
  it("reads machine, PE32+ magic and subsystem", () => {
    expect(peInfo(pe(0x8664, 0x20b, 2))).toEqual({ machine: 0x8664, magic: 0x20b, subsystem: 2 });
    expect(peInfo(Buffer.from("MZ not really a PE file at all, just text padding padding padding padding"))).toBeNull();
    expect(peInfo(Buffer.from("\x7fELF"))).toBeNull();
  });
});
