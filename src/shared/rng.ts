/** mulberry32: tiny seeded PRNG, mirrored bit-for-bit by the Godot and Pixi runtimes. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Integer in [min, max] inclusive. */
export const rint = (rnd: () => number, min: number, max: number) => min + Math.floor(rnd() * (max - min + 1));
