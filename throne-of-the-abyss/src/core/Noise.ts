/** Deterministic 2D value noise + fbm/ridged variants for procedural terrain. */
export class Noise2D {
  private readonly perm = new Uint8Array(512);
  private readonly vals = new Float32Array(256);

  constructor(seed = 1) {
    let s = seed >>> 0;
    const rnd = () => {
      s = (s + 0x6d2b79f5) >>> 0;
      let t = s;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
    const p = Array.from({ length: 256 }, (_, i) => i);
    for (let i = 255; i > 0; i--) {
      const j = Math.floor(rnd() * (i + 1));
      [p[i], p[j]] = [p[j], p[i]];
    }
    for (let i = 0; i < 512; i++) this.perm[i] = p[i & 255];
    for (let i = 0; i < 256; i++) this.vals[i] = rnd();
  }

  private v(ix: number, iz: number): number {
    return this.vals[this.perm[(ix & 255) + this.perm[iz & 255]]];
  }

  /** Smooth value noise in [0, 1]. */
  noise(x: number, z: number): number {
    const ix = Math.floor(x);
    const iz = Math.floor(z);
    const fx = x - ix;
    const fz = z - iz;
    const ux = fx * fx * fx * (fx * (fx * 6 - 15) + 10);
    const uz = fz * fz * fz * (fz * (fz * 6 - 15) + 10);
    const a = this.v(ix, iz);
    const b = this.v(ix + 1, iz);
    const c = this.v(ix, iz + 1);
    const d = this.v(ix + 1, iz + 1);
    return a + (b - a) * ux + (c - a) * uz + (a - b - c + d) * ux * uz;
  }

  fbm(x: number, z: number, octaves = 5): number {
    let sum = 0;
    let amp = 0.5;
    let norm = 0;
    for (let i = 0; i < octaves; i++) {
      sum += this.noise(x, z) * amp;
      norm += amp;
      const nx = x * 0.8 - z * 0.6;
      z = x * 0.6 + z * 0.8;
      x = nx * 2.03 + 13.7;
      z = z * 2.03 + 7.1;
      amp *= 0.5;
    }
    return sum / norm;
  }

  /** Ridged multifractal (sharp crests) in [0, 1]. */
  ridged(x: number, z: number, octaves = 5): number {
    let sum = 0;
    let amp = 0.5;
    let norm = 0;
    for (let i = 0; i < octaves; i++) {
      const n = 1 - Math.abs(this.noise(x, z) * 2 - 1);
      sum += n * n * amp;
      norm += amp;
      x = x * 2.1 + 3.3;
      z = z * 2.1 + 9.1;
      amp *= 0.5;
    }
    return sum / norm;
  }
}
