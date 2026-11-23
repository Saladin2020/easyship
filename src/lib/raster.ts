/** Tiny RGBA raster used by the PNG renderers (no native image dependency). */
export type RGBA = [number, number, number, number];

export function hex(c: string, a = 255): RGBA {
  const h = c.replace("#", "");
  const n = h.length === 3 ? h.split("").map((x) => x + x).join("") : h;
  return [parseInt(n.slice(0, 2), 16), parseInt(n.slice(2, 4), 16), parseInt(n.slice(4, 6), 16), n.length >= 8 ? parseInt(n.slice(6, 8), 16) : a];
}

export function shade(c: string, f: number): string {
  const [r, g, b] = hex(c);
  const k = (v: number) => Math.max(0, Math.min(255, Math.round(f >= 0 ? v + (255 - v) * f : v * (1 + f))));
  return `#${[k(r), k(g), k(b)].map((v) => v.toString(16).padStart(2, "0")).join("")}`;
}

export class Raster {
  data: Uint8Array;
  constructor(readonly width: number, readonly height: number, bg?: string) {
    this.data = new Uint8Array(width * height * 4);
    if (bg) this.rect(0, 0, width, height, bg);
  }
  set(x: number, y: number, c: string | RGBA) {
    x = Math.floor(x);
    y = Math.floor(y);
    if (x < 0 || y < 0 || x >= this.width || y >= this.height) return;
    const [r, g, b, a] = typeof c === "string" ? hex(c) : c;
    const i = (y * this.width + x) * 4;
    if (a >= 255) {
      this.data[i] = r;
      this.data[i + 1] = g;
      this.data[i + 2] = b;
      this.data[i + 3] = 255;
      return;
    }
    if (a <= 0) return;
    const sa = a / 255;
    const da = this.data[i + 3]! / 255;
    const oa = sa + da * (1 - sa);
    for (let k = 0; k < 3; k++) this.data[i + k] = Math.round(([r, g, b][k]! * sa + this.data[i + k]! * da * (1 - sa)) / oa);
    this.data[i + 3] = Math.round(oa * 255);
  }
  get(x: number, y: number): RGBA {
    const i = (y * this.width + x) * 4;
    return [this.data[i]!, this.data[i + 1]!, this.data[i + 2]!, this.data[i + 3]!];
  }
  rect(x: number, y: number, w: number, h: number, c: string | RGBA) {
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) this.set(x + i, y + j, c);
  }
  frame(x: number, y: number, w: number, h: number, c: string) {
    this.rect(x, y, w, 1, c);
    this.rect(x, y + h - 1, w, 1, c);
    this.rect(x, y, 1, h, c);
    this.rect(x + w - 1, y, 1, h, c);
  }
  /** Filled ellipse inside the box (x, y, w, h). */
  ellipse(x: number, y: number, w: number, h: number, c: string | RGBA) {
    const cx = x + w / 2 - 0.5;
    const cy = y + h / 2 - 0.5;
    const rx = w / 2;
    const ry = h / 2;
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
      const dx = (x + i - cx) / rx;
      const dy = (y + j - cy) / ry;
      if (dx * dx + dy * dy <= 1.0) this.set(x + i, y + j, c);
    }
  }
  line(x0: number, y0: number, x1: number, y1: number, c: string) {
    const n = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0), 1);
    for (let s = 0; s <= n; s++) this.set(Math.round(x0 + ((x1 - x0) * s) / n), Math.round(y0 + ((y1 - y0) * s) / n), c);
  }
  /** Filled polygon (even-odd scanline). */
  poly(pts: Array<[number, number]>, c: string | RGBA) {
    const ys = pts.map((p) => p[1]);
    const y0 = Math.floor(Math.min(...ys));
    const y1 = Math.ceil(Math.max(...ys));
    for (let y = y0; y <= y1; y++) {
      const sy = y + 0.5;
      const xs: number[] = [];
      for (let i = 0; i < pts.length; i++) {
        const [ax, ay] = pts[i]!;
        const [bx, by] = pts[(i + 1) % pts.length]!;
        if ((ay <= sy && by > sy) || (by <= sy && ay > sy)) xs.push(ax + ((sy - ay) / (by - ay)) * (bx - ax));
      }
      xs.sort((a, b) => a - b);
      for (let k = 0; k + 1 < xs.length; k += 2) for (let x = Math.round(xs[k]!); x < Math.round(xs[k + 1]!); x++) this.set(x, y, c);
    }
  }
  /** Copy flipped horizontally. */
  flipped(): Raster {
    const r = new Raster(this.width, this.height);
    for (let y = 0; y < this.height; y++) for (let x = 0; x < this.width; x++) r.set(this.width - 1 - x, y, this.get(x, y));
    return r;
  }
  blit(src: Raster, dx: number, dy: number, scale = 1) {
    for (let y = 0; y < src.height * scale; y++) for (let x = 0; x < src.width * scale; x++) {
      const p = src.get(Math.floor(x / scale), Math.floor(y / scale));
      if (p[3]) this.set(dx + x, dy + y, p);
    }
  }
  scaled(k: number): Raster {
    const r = new Raster(this.width * k, this.height * k);
    r.blit(this, 0, 0, k);
    return r;
  }
  /** 1px dark outline around opaque pixels (into transparent neighbours). */
  outline(c: string) {
    const src = new Uint8Array(this.data);
    const op = (x: number, y: number) => x >= 0 && y >= 0 && x < this.width && y < this.height && src[(y * this.width + x) * 4 + 3]! > 0;
    for (let y = 0; y < this.height; y++) for (let x = 0; x < this.width; x++) {
      if (op(x, y)) continue;
      if (op(x - 1, y) || op(x + 1, y) || op(x, y - 1) || op(x, y + 1)) this.set(x, y, c);
    }
  }
}
