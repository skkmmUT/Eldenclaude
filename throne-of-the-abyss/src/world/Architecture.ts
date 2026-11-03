import {
  BoxGeometry,
  ConeGeometry,
  CylinderGeometry,
  DodecahedronGeometry,
  Euler,
  ExtrudeGeometry,
  Matrix4,
  PlaneGeometry,
  Quaternion,
  Shape,
  SphereGeometry,
  TorusGeometry,
  Vector3,
  type BufferGeometry,
  type Material,
} from 'three';
import type { CollisionWorld } from '@/physics/CollisionWorld';
import { Rng } from '@/core/MathUtils';
import type { StaticBatcher } from './StaticBatcher';

export const mat4 = (x: number, y: number, z: number, rx = 0, ry = 0, rz = 0, sx = 1, sy = 1, sz = 1): Matrix4 =>
  new Matrix4().compose(new Vector3(x, y, z), new Quaternion().setFromEuler(new Euler(rx, ry, rz)), new Vector3(sx, sy, sz));

/** Pointed (gothic) arch outline as a Shape; origin at bottom centre. */
export function pointedArchShape(width: number, springY: number, rise: number, outerPad = 0): Shape {
  const w = width / 2 + outerPad;
  const s = new Shape();
  s.moveTo(-w, 0);
  s.lineTo(-w, springY);
  // Two circular arcs meeting at the apex: approximate with quadratic curves.
  s.quadraticCurveTo(-w, springY + rise * 0.75, 0, springY + rise);
  s.quadraticCurveTo(w, springY + rise * 0.75, w, springY);
  s.lineTo(w, 0);
  s.lineTo(-w, 0);
  return s;
}

/** Arch frame: a wall slab with a pointed opening cut out (extruded). */
export function archFrameGeometry(width: number, height: number, opening: number, springY: number, rise: number, depth: number): BufferGeometry {
  const outer = new Shape();
  outer.moveTo(-width / 2, 0);
  outer.lineTo(-width / 2, height);
  outer.lineTo(width / 2, height);
  outer.lineTo(width / 2, 0);
  outer.lineTo(-width / 2, 0);
  outer.holes.push(pointedArchShape(opening, springY, rise));
  const g = new ExtrudeGeometry(outer, { depth, bevelEnabled: false, curveSegments: 10 });
  g.translate(0, 0, -depth / 2);
  return g;
}

export interface BuildCtx {
  batch: StaticBatcher;
  world: CollisionWorld;
  mats: {
    stone: Material;
    stoneDark: Material;
    floor: Material;
    trim: Material;
    wood: Material;
    iron: Material;
    bark: Material;
    glowCrimson: Material;
    glowViolet: Material;
    banner: Material;
    statue: Material;
    roof: Material;
    window: Material;
  };
}

const UV = 0.25; // texture repeats every 4 m

/** Solid box: visual + collider. */
export function solidBox(b: BuildCtx, cx: number, cy: number, cz: number, hx: number, hy: number, hz: number, mat?: Material, sight = true): void {
  b.batch.add(new BoxGeometry(hx * 2, hy * 2, hz * 2), mat ?? b.mats.stone, mat4(cx, cy, cz), true, true, UV);
  b.world.addBoxCentered(cx, cy, cz, hx, hy, hz, { blocksSight: sight });
}

/** Gothic compound pier: core + four shafts, plinth and capital. */
export function gothicPillar(b: BuildCtx, x: number, z: number, height: number, r = 0.7, y = 0, broken = false): void {
  const m = b.mats;
  b.batch.add(new BoxGeometry(r * 2.6, 0.5, r * 2.6), m.stoneDark, mat4(x, y + 0.25, z), true, true, UV);
  b.batch.add(new CylinderGeometry(r, r * 1.05, height, 10), m.stone, mat4(x, y + height / 2, z), true, true, UV);
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
    b.batch.add(new CylinderGeometry(r * 0.32, r * 0.32, height, 6), m.stone, mat4(x + Math.cos(a) * r * 0.95, y + height / 2, z + Math.sin(a) * r * 0.95), true, true, UV);
  }
  if (!broken) {
    b.batch.add(new BoxGeometry(r * 2.8, 0.45, r * 2.8), m.stoneDark, mat4(x, y + height + 0.2, z), true, true, UV);
    b.batch.add(new TorusGeometry(r * 1.05, 0.08, 6, 16), m.trim, mat4(x, y + height - 0.3, z, Math.PI / 2), false, false);
  } else {
    // jagged broken top
    const rng = new Rng(Math.floor(x * 13 + z * 7));
    for (let i = 0; i < 5; i++) {
      b.batch.add(new DodecahedronGeometry(r * rng.range(0.3, 0.6), 0), m.stone, mat4(x + rng.range(-r, r) * 0.5, y + height + rng.range(-0.2, 0.3), z + rng.range(-r, r) * 0.5, rng.range(0, 3), rng.range(0, 3), 0), true, true, UV);
    }
  }
  b.world.addCylinder(x, z, r * 1.25, y, y + height + 0.4);
}

/** Pointed arch bridging two piers (visual only — sits above head height). */
export function archBetween(b: BuildCtx, a: Vector3, c: Vector3, springY: number, thickness = 0.8): void {
  const mid = a.clone().add(c).multiplyScalar(0.5);
  const span = a.distanceTo(c);
  const yaw = Math.atan2(c.x - a.x, c.z - a.z) + Math.PI / 2;
  const rise = span * 0.55;
  const geo = archFrameGeometry(span + 0.8, rise + 1.2, span - 0.6, 0.01, rise, thickness);
  b.batch.add(geo, b.mats.stone, mat4(mid.x, springY, mid.z, 0, yaw), true, true, UV);
}

/** Crenellated curtain wall from (x0,z0) to (x1,z1). */
export function curtainWall(b: BuildCtx, x0: number, z0: number, x1: number, z1: number, height: number, thick = 2, baseY = 0): void {
  const len = Math.hypot(x1 - x0, z1 - z0);
  const cx = (x0 + x1) / 2;
  const cz = (z0 + z1) / 2;
  const alongX = Math.abs(x1 - x0) > Math.abs(z1 - z0);
  const hx = alongX ? len / 2 : thick / 2;
  const hz = alongX ? thick / 2 : len / 2;
  solidBox(b, cx, baseY + height / 2, cz, hx, height / 2, hz);
  // merlons
  const n = Math.floor(len / 2.2);
  for (let i = 0; i < n; i++) {
    const f = (i + 0.5) / n;
    const mx = x0 + (x1 - x0) * f;
    const mz = z0 + (z1 - z0) * f;
    b.batch.add(new BoxGeometry(alongX ? 1.1 : thick, 1.2, alongX ? thick : 1.1), b.mats.stone, mat4(mx, baseY + height + 0.6, mz), true, true, UV);
  }
  // buttresses
  const nb = Math.floor(len / 8);
  for (let i = 1; i < nb; i++) {
    const f = i / nb;
    const bx = x0 + (x1 - x0) * f;
    const bz = z0 + (z1 - z0) * f;
    b.batch.add(new BoxGeometry(alongX ? 1.2 : thick + 1.6, height * 0.7, alongX ? thick + 1.6 : 1.2), b.mats.stoneDark, mat4(bx, baseY + height * 0.35, bz), true, true, UV);
  }
}

/** Round tower with crenels and a steep conical roof + spire. */
export function tower(b: BuildCtx, x: number, z: number, r: number, h: number, roofH: number, baseY = 0, collide = true): void {
  const y = baseY;
  b.batch.add(new CylinderGeometry(r, r * 1.08, h, 16), b.mats.stone, mat4(x, y + h / 2, z), true, true, UV);
  b.batch.add(new CylinderGeometry(r * 1.18, r * 1.05, 1.4, 16), b.mats.stoneDark, mat4(x, y + h + 0.7, z), true, true, UV);
  if (roofH > 0) {
    b.batch.add(new ConeGeometry(r * 1.25, roofH, 16), b.mats.roof, mat4(x, y + h + 1.4 + roofH / 2, z), true, false);
    b.batch.add(new ConeGeometry(0.15, roofH * 0.35, 6), b.mats.trim, mat4(x, y + h + 1.4 + roofH + roofH * 0.15, z), false, false);
  }
  // narrow arrow-slit windows
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2;
    b.batch.add(new BoxGeometry(0.25, 1.6, 0.1), b.mats.window, mat4(x + Math.sin(a) * (r + 0.02), y + h * 0.7, z + Math.cos(a) * (r + 0.02), 0, a), false, false);
  }
  if (collide) b.world.addCylinder(x, z, r, y, y + h + 1.4);
}

/** Straight stairs rising along +dir; each step collider spans to the top landing. */
export function stairs(
  b: BuildCtx,
  start: Vector3,
  dirX: number,
  dirZ: number,
  steps: number,
  rise: number,
  depth: number,
  width: number,
): void {
  for (let i = 0; i < steps; i++) {
    const top = start.y + (i + 1) * rise;
    const runStart = i * depth;
    const runEnd = steps * depth;
    const len = runEnd - runStart;
    const along = runStart + len / 2;
    const cx = start.x + dirX * along;
    const cz = start.z + dirZ * along;
    const hx = Math.abs(dirX) > 0.5 ? len / 2 : width / 2;
    const hz = Math.abs(dirX) > 0.5 ? width / 2 : len / 2;
    const hy = (top - start.y) / 2;
    b.batch.add(new BoxGeometry(hx * 2, hy * 2, hz * 2), b.mats.stoneDark, mat4(cx, start.y + hy, cz), true, true, UV);
    b.world.addBox(cx - hx, start.y, cz - hz, cx + hx, top, cz + hz, { blocksSight: false });
  }
}

export function deadTree(b: BuildCtx, x: number, z: number, h: number, seed: number): void {
  const rng = new Rng(seed);
  b.batch.add(new CylinderGeometry(0.12 * h * 0.2, 0.3 * h * 0.12 + 0.15, h, 6), b.mats.bark, mat4(x, h / 2, z, rng.range(-0.08, 0.08), 0, rng.range(-0.08, 0.08)), true, true);
  for (let i = 0; i < 6; i++) {
    const y = h * rng.range(0.45, 0.95);
    const len = h * rng.range(0.25, 0.45);
    const yaw = rng.range(0, Math.PI * 2);
    const tilt = rng.range(0.6, 1.2);
    const g = new CylinderGeometry(0.02, 0.09, len, 5);
    g.translate(0, len / 2, 0);
    b.batch.add(g, b.mats.bark, mat4(x, y, z, 0, yaw, tilt), true, false);
  }
  b.world.addCylinder(x, z, 0.35, 0, h * 0.8, { blocksSight: false });
}

export function gravestone(b: BuildCtx, x: number, z: number, yaw: number, rng: Rng): void {
  const kind = rng.int(0, 2);
  const tilt = rng.range(-0.15, 0.15);
  if (kind === 0) {
    b.batch.add(new BoxGeometry(0.7, 1.0, 0.18), b.mats.stone, mat4(x, 0.5, z, 0, yaw, tilt), true, true, UV);
    b.batch.add(new CylinderGeometry(0.35, 0.35, 0.18, 10, 1, false, 0, Math.PI), b.mats.stone, mat4(x, 1.0, z, Math.PI / 2, yaw + Math.PI / 2, tilt, 1, 1, 1), true, true, UV);
  } else if (kind === 1) {
    b.batch.add(new BoxGeometry(0.16, 1.4, 0.16), b.mats.stoneDark, mat4(x, 0.7, z, 0, yaw, tilt), true, true, UV);
    b.batch.add(new BoxGeometry(0.75, 0.16, 0.16), b.mats.stoneDark, mat4(x, 1.05, z, 0, yaw, tilt), true, true, UV);
  } else {
    b.batch.add(new BoxGeometry(0.9, 0.35, 1.8), b.mats.stoneDark, mat4(x, 0.175, z, 0, yaw), true, true, UV);
    b.batch.add(new BoxGeometry(0.6, 0.9, 0.2), b.mats.stone, mat4(x - Math.sin(yaw) * 0.9, 0.45, z - Math.cos(yaw) * 0.9, 0, yaw, tilt), true, true, UV);
  }
  b.world.addCylinder(x, z, 0.45, 0, kind === 1 ? 1.4 : 1.0, { blocksSight: false });
}

export function rubble(b: BuildCtx, x: number, z: number, radius: number, count: number, seed: number): void {
  const rng = new Rng(seed);
  for (let i = 0; i < count; i++) {
    const a = rng.range(0, Math.PI * 2);
    const d = rng.range(0, radius);
    const s = rng.range(0.15, 0.55);
    b.batch.add(new DodecahedronGeometry(s, 0), rng.chance(0.5) ? b.mats.stone : b.mats.stoneDark, mat4(x + Math.cos(a) * d, s * 0.4, z + Math.sin(a) * d, rng.range(0, 3), rng.range(0, 3), rng.range(0, 3), 1, rng.range(0.5, 0.9), 1), true, true, UV);
  }
}

/** Fallen column drum lying on its side (collider = box approximation). */
export function fallenColumn(b: BuildCtx, x: number, z: number, yaw: number, len: number, r: number): void {
  b.batch.add(new CylinderGeometry(r, r, len, 10), b.mats.stone, mat4(x, r, z, 0, yaw, Math.PI / 2), true, true, UV);
  const c = Math.cos(yaw);
  const s = Math.sin(yaw);
  const hx = Math.abs(c) * len * 0.5 + Math.abs(s) * r;
  const hz = Math.abs(s) * len * 0.5 + Math.abs(c) * r;
  b.world.addBox(x - hx * 0.9, 0, z - hz * 0.9, x + hx * 0.9, r * 2, z + hz * 0.9, { blocksSight: false });
}

/** Brazier: tripod bowl (fire is added separately). */
export function brazier(b: BuildCtx, x: number, y: number, z: number): Vector3 {
  b.batch.add(new CylinderGeometry(0.5, 0.25, 0.35, 10, 1, true), b.mats.iron, mat4(x, y + 1.05, z), true, false);
  b.batch.add(new CylinderGeometry(0.42, 0.42, 0.05, 10), b.mats.iron, mat4(x, y + 0.9, z), true, false);
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2;
    b.batch.add(new CylinderGeometry(0.035, 0.035, 1.1, 5), b.mats.iron, mat4(x + Math.cos(a) * 0.22, y + 0.5, z + Math.sin(a) * 0.22, Math.sin(a) * 0.2, 0, -Math.cos(a) * 0.2), true, false);
  }
  b.world.addCylinder(x, z, 0.4, y, y + 1.2, { blocksSight: false });
  return new Vector3(x, y + 1.15, z);
}

/** Hanging banner (double-sided cloth with alpha-cut edges). */
export function banner(b: BuildCtx, x: number, y: number, z: number, yaw: number, w: number, h: number): void {
  b.batch.add(new PlaneGeometry(w, h), b.mats.banner, mat4(x, y - h / 2, z, 0, yaw), false, false);
  b.batch.add(new CylinderGeometry(0.05, 0.05, w + 0.4, 6), b.mats.iron, mat4(x, y + 0.05, z, 0, yaw, Math.PI / 2), false, false);
}

/** Decorative rose window: concentric glowing rings and spokes. */
export function roseWindow(b: BuildCtx, x: number, y: number, z: number, r: number): void {
  b.batch.add(new CylinderGeometry(r, r, 0.2, 32), b.mats.glowCrimson, mat4(x, y, z, Math.PI / 2), false, false);
  b.batch.add(new TorusGeometry(r, 0.3, 8, 40), b.mats.stoneDark, mat4(x, y, z - 0.15), true, false);
  b.batch.add(new TorusGeometry(r * 0.55, 0.18, 8, 32), b.mats.stoneDark, mat4(x, y, z - 0.15), false, false);
  b.batch.add(new SphereGeometry(r * 0.22, 16, 8), b.mats.glowViolet, mat4(x, y, z - 0.12, 0, 0, 0, 1, 1, 0.3), false, false);
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    b.batch.add(new BoxGeometry(0.16, r * 2, 0.2), b.mats.stoneDark, mat4(x, y, z - 0.2, 0, 0, a), false, false);
  }
}
