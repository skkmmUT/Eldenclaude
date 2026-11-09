import { Noise2D } from '@/core/Noise';
import { smoothstep } from '@/core/MathUtils';

/**
 * Macro layout of the Ashen Kingdom overworld (metres; +Z is north, the castle courtyard
 * is at the origin). Everything here is data: terrain shape, water, fields, forests and
 * landmark positions are read by the terrain generator, foliage scattering and level
 * builder so they always agree with each other.
 */
export const WORLD = {
  size: 1120,
  segments: 280,
  waterLevel: -0.6,
  castle: { minX: -44, maxX: 44, minZ: -48, maxZ: 110 },
  lakes: [
    { x: 168, z: -196, r: 62 },
    { x: -218, z: 72, r: 50 },
    { x: 96, z: 150, r: 26 },
  ],
  fields: [
    { x: 58, z: -170, w: 84, d: 52, rot: 0.12 },
    { x: -72, z: -178, w: 72, d: 46, rot: -0.2 },
    { x: 112, z: -262, w: 64, d: 42, rot: 0.35 },
    { x: -40, z: -268, w: 58, d: 38, rot: 0.05 },
  ],
  forests: [
    { x: -250, z: -40, r: 120, density: 0.010 },
    { x: -150, z: 170, r: 90, density: 0.012 },
    { x: 250, z: 120, r: 110, density: 0.009 },
    { x: 60, z: -360, r: 90, density: 0.008 },
  ],
  flowerValleys: [
    { x: -200, z: 0, r: 70 },
    { x: 150, z: -120, r: 60 },
    { x: 40, z: 110, r: 55 },
  ],
  fortress: { x: -175, z: -232, r: 32, height: 16 },
  giantTree: { x: 238, z: -34 },
  bridges: [
    { x: 0, length: 34 }, // main road bridge (position on the river curve)
    { x: 124, length: 26 },
  ],
} as const;

const noise = new Noise2D(7781);

/** River centre-line z for a given x (flows east-west south of the castle). */
export function riverZ(x: number): number {
  return -104 + Math.sin(x * 0.011) * 18 + Math.sin(x * 0.027 + 1.3) * 6;
}

/** Main road centre-line x for a given z (south from the castle gate). */
export function roadX(z: number): number {
  if (z > -48) return 0;
  return Math.sin((z + 48) * 0.012) * 16 * smoothstep(-70, -150, z);
}

function rectDistance(x: number, z: number, r: { minX: number; maxX: number; minZ: number; maxZ: number }): number {
  const dx = Math.max(r.minX - x, 0, x - r.maxX);
  const dz = Math.max(r.minZ - z, 0, z - r.maxZ);
  return Math.hypot(dx, dz);
}

/** Analytic terrain height (the mesh and collision both sample this through the grid). */
export function terrainHeight(x: number, z: number): number {
  const r = Math.hypot(x, z - 2);
  // Rolling plains & hills, gentler near the castle.
  const amp = 3 + 20 * smoothstep(70, 330, r);
  let h = 2.4 + (noise.fbm(x * 0.0034, z * 0.0034) - 0.45) * 2 * amp + (noise.fbm(x * 0.014 + 5, z * 0.014) - 0.5) * 3.2;
  // Mountain ring at the edge of the playable region.
  const edge = Math.max(Math.abs(x), Math.abs(z)) * 0.55 + r * 0.45;
  const m = smoothstep(330, 480, edge);
  h += m * (55 + noise.ridged(x * 0.006, z * 0.006) * 140);
  // Landmark hills.
  const f = WORLD.fortress;
  const fd = Math.hypot(x - f.x, z - f.z);
  h += f.height * smoothstep(95, f.r, fd) * 0.95;
  if (fd < f.r + 18) h = h + (f.height - h) * smoothstep(f.r + 18, f.r, fd);
  const gt = WORLD.giantTree;
  h += 9 * smoothstep(75, 12, Math.hypot(x - gt.x, z - gt.z));
  // River channel.
  const rd = Math.abs(z - riverZ(x));
  const bank = smoothstep(7, 24, rd);
  h = Math.min(h, -1.7 + (h + 1.7) * bank);
  // Lakes.
  for (const l of WORLD.lakes) {
    const d = Math.hypot(x - l.x, z - l.z) / l.r;
    const bowl = smoothstep(0.7, 1.3, d);
    h = Math.min(h, -1.9 + (h + 1.9) * bowl);
  }
  // Castle footprint sits on a level apron.
  const cd = rectDistance(x, z, WORLD.castle);
  if (cd <= 0) return -0.35;
  const flat = smoothstep(14, 70, cd);
  h = 0.25 + (h - 0.25) * flat;
  // Soften the road.
  if (z < -40 && z > -420) {
    const roadD = Math.abs(x - roadX(z));
    const rf = smoothstep(9, 3, roadD) * 0.6;
    h = h * (1 - rf) + Math.max(h, 0.15) * rf;
  }
  return h;
}

/** 0..1 weight of golden field at a position. */
export function fieldWeight(x: number, z: number): number {
  let w = 0;
  for (const f of WORLD.fields) {
    const c = Math.cos(-f.rot);
    const s = Math.sin(-f.rot);
    const lx = (x - f.x) * c - (z - f.z) * s;
    const lz = (x - f.x) * s + (z - f.z) * c;
    const ex = smoothstep(f.w / 2, f.w / 2 - 4, Math.abs(lx));
    const ez = smoothstep(f.d / 2, f.d / 2 - 4, Math.abs(lz));
    w = Math.max(w, ex * ez);
  }
  return w;
}

export function forestWeight(x: number, z: number): number {
  let w = 0;
  for (const f of WORLD.forests) w = Math.max(w, smoothstep(f.r, f.r * 0.6, Math.hypot(x - f.x, z - f.z)));
  return w;
}

export function flowerWeight(x: number, z: number): number {
  let w = 0;
  for (const f of WORLD.flowerValleys) w = Math.max(w, smoothstep(f.r, f.r * 0.4, Math.hypot(x - f.x, z - f.z)));
  return w;
}

export function roadWeight(x: number, z: number): number {
  if (z > -46 || z < -430) return 0;
  return smoothstep(3.6, 2.2, Math.abs(x - roadX(z)));
}

export const detailNoise = noise;
