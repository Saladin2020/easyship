import { existsSync } from "node:fs";
import { copyFile, mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));

/** Package root, whether running from src/lib (tsx), dist/ (built) or a test. */
export const pkgRoot = [path.resolve(here, "../.."), path.resolve(here, "..")].find((p) => existsSync(path.join(p, "package.json")) && existsSync(path.join(p, "samples"))) ?? path.resolve(here, "../..");
export const RUNTIME_DIR = path.join(pkgRoot, "runtime");
export const SAMPLES_DIR = path.join(pkgRoot, "samples");
export const FONT_DIR = path.join(pkgRoot, "assets", "fonts");

export const SAFE_ID = /^[a-z0-9][a-z0-9_-]*$/;

export function assertSafeId(id: unknown, label = "id"): string {
  if (typeof id !== "string" || !SAFE_ID.test(id)) throw new Error(`Invalid ${label} ${JSON.stringify(id)} (use a-z, 0-9, _ or -)`);
  return id;
}

export const resolveWorkspace = (dir = process.cwd()) => path.resolve(dir);

export function allowedRoots(root: string): string[] {
  const extra = (process.env.EASYSHIP_ALLOWED_DIRS ?? "").split(path.delimiter).map((s) => s.trim()).filter(Boolean).map((p) => path.resolve(p));
  return [path.resolve(root), ...extra];
}

/** Resolve p against the workspace and refuse paths outside it (or EASYSHIP_ALLOWED_DIRS). */
export function resolveInside(root: string, p: string): string {
  const abs = path.resolve(root, p);
  const ok = allowedRoots(root).some((r) => abs === r || abs.startsWith(r + path.sep));
  if (!ok) throw new Error(`Path ${p} is outside the workspace (allow it with EASYSHIP_ALLOWED_DIRS)`);
  return abs;
}

export class Writer {
  files: string[] = [];
  constructor(readonly dir: string) {}
  async write(rel: string, body: string | Buffer | Uint8Array) {
    const f = path.join(this.dir, rel);
    await mkdir(path.dirname(f), { recursive: true });
    await writeFile(f, body);
    this.files.push(f);
  }
  async copy(src: string, rel: string) {
    const f = path.join(this.dir, rel);
    await mkdir(path.dirname(f), { recursive: true });
    await copyFile(src, f);
    this.files.push(f);
  }
}
