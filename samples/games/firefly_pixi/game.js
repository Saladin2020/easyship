// หิ่งห้อย · Firefly Night — the Easy Ship sample game (PixiJS v8). Click / tap fireflies before dawn.
async function pixi() {
  try { await import("./pixi.min.js"); if (globalThis.PIXI) return globalThis.PIXI; } catch {}
  return await import("https://cdn.jsdelivr.net/npm/pixi.js@8/dist/pixi.min.mjs");
}
const PIXI = await pixi();
await document.fonts.load("14px Kanit").catch(() => {});
const W = 480, H = 270, COUNT = 14, NIGHT = 60;
let seed = 2026;
const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
const app = new PIXI.Application();
await app.init({ width: W, height: H, background: "#0b1630", antialias: false, resolution: 1 });
document.body.appendChild(app.canvas);

const sky = new PIXI.Graphics();
const scene = new PIXI.Graphics();
for (let i = 0; i < 40; i++) scene.rect((i * 97) % W, (i * 53) % 120, 1, 1).fill({ color: 0xfffff0, alpha: 0.6 });
scene.rect(0, H - 60, W, 60).fill(0x0f2a18);
for (let x = 0; x < W; x += 6) scene.moveTo(x, H - 60).lineTo(x + 2, H - 70 - ((x * 7) % 9)).stroke({ color: 0x1d4a2a, width: 1 });
for (const px of [60, 380]) {
  scene.rect(px, H - 140, 4, 80).fill(0x081008);
  for (let a = 0; a < 5; a++) {
    const ang = -Math.PI / 2 + (a - 2) * 0.55;
    scene.moveTo(px + 2, H - 140).lineTo(px + 2 + Math.cos(ang) * 26, H - 140 + (Math.sin(ang) + 0.6) * 26).stroke({ color: 0x081008, width: 3 });
  }
}
scene.rect(250, H - 110, 70, 40).fill(0x140c06);
scene.poly([242, H - 110, 285, H - 140, 328, H - 110]).fill(0x140c06);
scene.rect(275, H - 100, 14, 12).fill(0xf4ae3d);
for (const x of [254, 314]) scene.rect(x, H - 70, 3, 14).fill(0x140c06);
const flyLayer = new PIXI.Graphics();
const label = new PIXI.Text({ text: "", style: { fontFamily: "Kanit, sans-serif", fontSize: 14, fill: "#f7ebd3" } });
label.position.set(10, 8);
app.stage.addChild(sky, scene, flyLayer, label);

const newFly = () => ({ x: 20 + rnd() * (W - 40), y: 40 + rnd() * (H - 110), vx: (rnd() - 0.5) * 24, vy: (rnd() - 0.5) * 16, phase: rnd() * Math.PI * 2 });
const flies = Array.from({ length: COUNT }, newFly);
const state = { score: 0, t: 0, lang: new URLSearchParams(location.search).get("lang") ?? "th" };
app.stage.eventMode = "static";
app.stage.hitArea = new PIXI.Rectangle(0, 0, W, H);
app.stage.on("pointerdown", (e) => {
  const p = e.getLocalPosition(app.stage);
  const i = flies.findIndex((f) => Math.hypot(f.x - p.x, f.y - p.y) < 12);
  if (i >= 0) { state.score++; flies[i] = newFly(); }
});
addEventListener("keydown", (e) => { if (e.key === "l") state.lang = state.lang === "th" ? "en" : "th"; });
app.ticker.add((tk) => {
  const dt = tk.deltaMS / 1000;
  state.t += dt;
  const dawn = Math.min(1, state.t / NIGHT);
  sky.clear().rect(0, 0, W, H).fill({ color: lerp(0x0b1630, 0x3a3a6a, dawn) });
  flyLayer.clear();
  for (const f of flies) {
    f.vx = clamp(f.vx + (rnd() - 0.5) * 40 * dt, -18, 18);
    f.vy = clamp(f.vy + (rnd() - 0.5) * 40 * dt, -18, 18);
    f.x = (f.x + f.vx * dt + W) % W;
    f.y = clamp(f.y + f.vy * dt, 30, H - 60);
    const glow = 0.55 + 0.45 * Math.sin(state.t * 3 + f.phase);
    flyLayer.circle(f.x, f.y, 5).fill({ color: 0xfff266, alpha: 0.18 * glow });
    flyLayer.rect(f.x - 1, f.y - 1, 2, 2).fill({ color: 0xfff280, alpha: glow });
  }
  const left = Math.max(0, Math.floor(NIGHT - state.t));
  label.text = state.lang === "th" ? `หิ่งห้อย ${state.score} ตัว · อีก ${left} วินาทีฟ้าสาง` : `Fireflies ${state.score} · dawn in ${left} s`;
});
function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
function lerp(a, b, t) {
  const c = (s) => [(s >> 16) & 255, (s >> 8) & 255, s & 255];
  const [r1, g1, b1] = c(a), [r2, g2, b2] = c(b);
  return (Math.round(r1 + (r2 - r1) * t) << 16) | (Math.round(g1 + (g2 - g1) * t) << 8) | Math.round(b1 + (b2 - b1) * t);
}
window.__game = { app, state, flies };
window.__ready = true;
