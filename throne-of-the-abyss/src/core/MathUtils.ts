/** Small, allocation-free math helpers shared by every system. */

export const TAU = Math.PI * 2;
export const DEG2RAD = Math.PI / 180;

export const clamp = (v: number, min: number, max: number): number => (v < min ? min : v > max ? max : v);
export const clamp01 = (v: number): number => (v < 0 ? 0 : v > 1 ? 1 : v);
export const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;
export const invLerp = (a: number, b: number, v: number): number => (b === a ? 0 : (v - a) / (b - a));
export const remap = (v: number, a0: number, a1: number, b0: number, b1: number): number =>
  lerp(b0, b1, clamp01(invLerp(a0, a1, v)));

/** Frame-rate independent exponential smoothing. `lambda` ≈ responsiveness (1/s). */
export const damp = (current: number, target: number, lambda: number, dt: number): number =>
  lerp(current, target, 1 - Math.exp(-lambda * dt));

export const moveTowards = (current: number, target: number, maxDelta: number): number => {
  if (Math.abs(target - current) <= maxDelta) return target;
  return current + Math.sign(target - current) * maxDelta;
};

/** Wrap angle to (-PI, PI]. */
export const wrapAngle = (a: number): number => {
  a = (a + Math.PI) % TAU;
  if (a < 0) a += TAU;
  return a - Math.PI;
};

export const angleDelta = (from: number, to: number): number => wrapAngle(to - from);

export const dampAngle = (current: number, target: number, lambda: number, dt: number): number =>
  current + angleDelta(current, target) * (1 - Math.exp(-lambda * dt));

export const rotateTowardsAngle = (current: number, target: number, maxDelta: number): number => {
  const d = angleDelta(current, target);
  if (Math.abs(d) <= maxDelta) return target;
  return current + Math.sign(d) * maxDelta;
};

export const smoothstep = (e0: number, e1: number, x: number): number => {
  const t = clamp01((x - e0) / (e1 - e0));
  return t * t * (3 - 2 * t);
};

export const easeOutCubic = (t: number): number => 1 - Math.pow(1 - t, 3);
export const easeInCubic = (t: number): number => t * t * t;
export const easeInOutSine = (t: number): number => -(Math.cos(Math.PI * t) - 1) / 2;
export const easeOutBack = (t: number): number => {
  const c1 = 1.70158;
  const c3 = c1 + 1;
  return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
};

/** Yaw (rotation about +Y) that faces from (0,0) toward direction (dx,dz); model forward is +Z. */
export const yawFromDir = (dx: number, dz: number): number => Math.atan2(dx, dz);

/** Deterministic PRNG (mulberry32) — used for procedural content so layouts are stable. */
export class Rng {
  private s: number;
  constructor(seed: number) {
    this.s = seed >>> 0;
  }
  next(): number {
    let t = (this.s += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  range(min: number, max: number): number {
    return min + (max - min) * this.next();
  }
  int(min: number, maxInclusive: number): number {
    return Math.floor(this.range(min, maxInclusive + 1));
  }
  pick<T>(arr: readonly T[]): T {
    return arr[Math.floor(this.next() * arr.length)];
  }
  chance(p: number): boolean {
    return this.next() < p;
  }
}

/** Unseeded helpers for runtime variation (AI decisions, VFX jitter). */
export const randRange = (min: number, max: number): number => min + Math.random() * (max - min);
export const chance = (p: number): boolean => Math.random() < p;

/** Seconds from frames authored at 60 fps — combat data is written in frames for readability. */
export const frames = (n: number): number => n / 60;
