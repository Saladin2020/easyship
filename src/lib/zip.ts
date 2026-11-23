/** Minimal deterministic ZIP writer (deflate, Unix modes kept so Linux binaries stay executable). No dependencies. */
import { createReadStream } from "node:fs";
import { readdir, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { deflateRawSync } from "node:zlib";

const TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();
export function crc32(buf: Uint8Array): number {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = TABLE[(c ^ buf[i]!) & 0xff]! ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

export async function listFiles(dir: string, rel = ""): Promise<string[]> {
  const out: string[] = [];
  for (const e of (await readdir(path.join(dir, rel), { withFileTypes: true })).sort((a, b) => (a.name < b.name ? -1 : 1))) {
    const r = rel ? `${rel}/${e.name}` : e.name;
    if (e.isDirectory()) out.push(...(await listFiles(dir, r)));
    else if (e.isFile()) out.push(r);
  }
  return out;
}

/** Zip every file under dir (paths relative to dir, so index.html sits at the zip root). Fixed timestamp → reproducible. */
export async function zipDir(dir: string, outFile: string): Promise<{ files: number; bytes: number }> {
  const files = await listFiles(dir);
  const locals: Buffer[] = [];
  const centrals: Buffer[] = [];
  let offset = 0;
  const DOS_TIME = 0; // 00:00:00
  const DOS_DATE = ((2026 - 1980) << 9) | (1 << 5) | 1; // 2026-01-01
  for (const rel of files) {
    const abs = path.join(dir, rel);
    const data = await readFile(abs);
    const st = await stat(abs);
    const crc = crc32(data);
    const comp = data.length > 64 ? deflateRawSync(data, { level: 9 }) : null;
    const useDeflate = comp !== null && comp.length < data.length;
    const body = useDeflate ? comp! : data;
    const name = Buffer.from(rel, "utf8");
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0x0800, 6); // UTF-8 names
    local.writeUInt16LE(useDeflate ? 8 : 0, 8);
    local.writeUInt16LE(DOS_TIME, 10);
    local.writeUInt16LE(DOS_DATE, 12);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(body.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(name.length, 26);
    local.writeUInt16LE(0, 28);
    locals.push(local, name, body);
    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE((3 << 8) | 20, 4); // made by Unix
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(0x0800, 8);
    central.writeUInt16LE(useDeflate ? 8 : 0, 10);
    central.writeUInt16LE(DOS_TIME, 12);
    central.writeUInt16LE(DOS_DATE, 14);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(body.length, 20);
    central.writeUInt32LE(data.length, 24);
    central.writeUInt16LE(name.length, 28);
    central.writeUInt32LE((((st.mode & 0o111 ? 0o755 : 0o644) | 0o100000) << 16) >>> 0, 38);
    central.writeUInt32LE(offset, 42);
    centrals.push(central, name);
    offset += local.length + name.length + body.length;
  }
  const cd = Buffer.concat(centrals);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(files.length, 8);
  end.writeUInt16LE(files.length, 10);
  end.writeUInt32LE(cd.length, 12);
  end.writeUInt32LE(offset, 16);
  const all = Buffer.concat([...locals, cd, end]);
  if (all.length > 0xffffffff) throw new Error("zip over 4 GB is not supported");
  await writeFile(outFile, all);
  return { files: files.length, bytes: all.length };
}

/** Entries of a zip (name, size, unix mode) — for checks and tests. */
export async function readZipIndex(file: string): Promise<Array<{ name: string; size: number; mode: number }>> {
  const buf = await readFile(file);
  const endAt = buf.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
  if (endAt < 0) throw new Error(`${file}: not a zip`);
  const count = buf.readUInt16LE(endAt + 10);
  let p = buf.readUInt32LE(endAt + 16);
  const out = [];
  for (let i = 0; i < count; i++) {
    const nameLen = buf.readUInt16LE(p + 28);
    const extra = buf.readUInt16LE(p + 30);
    const comment = buf.readUInt16LE(p + 32);
    out.push({ name: buf.toString("utf8", p + 46, p + 46 + nameLen), size: buf.readUInt32LE(p + 24), mode: (buf.readUInt32LE(p + 38) >>> 16) & 0o777 });
    p += 46 + nameLen + extra + comment;
  }
  return out;
}

export async function sha256(file: string): Promise<string> {
  const { createHash } = await import("node:crypto");
  return new Promise((resolve, reject) => {
    const h = createHash("sha256");
    createReadStream(file).on("data", (d) => h.update(d)).on("end", () => resolve(h.digest("hex"))).on("error", reject);
  });
}
