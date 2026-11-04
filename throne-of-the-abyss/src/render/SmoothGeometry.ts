import {
  BufferAttribute,
  BufferGeometry,
  CatmullRomCurve3,
  IcosahedronGeometry,
  LatheGeometry,
  Vector2,
  Vector3,
} from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { Noise2D } from '@/core/Noise';

/**
 * Generators for smooth, streamlined geometry (no hard box edges): tapered tubes along
 * splines, lathe profiles, rounded boxes and organic rocks. Every generator takes segment
 * counts scaled by a global detail factor so quality presets trade smoothness for speed.
 */
export const GeometryDetail = { value: 1 };

/** Segment count scaled by the detail setting (never below `min`). */
export const seg = (n: number, min = 3): number => Math.max(min, Math.round(n * GeometryDetail.value));

/**
 * Tube along a Catmull-Rom spline with a radius profile r(t) and optional elliptical
 * cross-section (`flatten` < 1 squashes the binormal axis). Ends close to rounded tips.
 */
export function taperedTube(
  points: Vector3[],
  radius: (t: number) => number,
  radial = 10,
  tubular = 16,
  flatten = 1,
  twist = 0,
): BufferGeometry {
  const curve = new CatmullRomCurve3(points, false, 'centripetal');
  const tub = seg(tubular, 4);
  const rad = seg(radial, 5);
  const frames = curve.computeFrenetFrames(tub, false);
  const pos: number[] = [];
  const idx: number[] = [];
  const p = new Vector3();
  const n = new Vector3();
  for (let i = 0; i <= tub; i++) {
    const t = i / tub;
    curve.getPointAt(t, p);
    const r = Math.max(0, radius(t));
    const N = frames.normals[i];
    const B = frames.binormals[i];
    for (let j = 0; j <= rad; j++) {
      const a = (j / rad) * Math.PI * 2 + twist * t;
      const c = Math.cos(a);
      const s = Math.sin(a);
      n.set(0, 0, 0).addScaledVector(N, c).addScaledVector(B, s * flatten);
      pos.push(p.x + n.x * r, p.y + n.y * r, p.z + n.z * r);
    }
  }
  for (let i = 0; i < tub; i++) {
    for (let j = 0; j < rad; j++) {
      const a = i * (rad + 1) + j;
      const b = (i + 1) * (rad + 1) + j;
      idx.push(a, b, a + 1, b, b + 1, a + 1);
    }
  }
  const g = new BufferGeometry();
  g.setAttribute('position', new BufferAttribute(new Float32Array(pos), 3));
  g.setIndex(idx);
  const uv = new Float32Array((pos.length / 3) * 2);
  for (let i = 0; i <= tub; i++) for (let j = 0; j <= rad; j++) uv.set([j / rad, i / tub], (i * (rad + 1) + j) * 2);
  g.setAttribute('uv', new BufferAttribute(uv, 2));
  g.computeVertexNormals();
  return g;
}

/**
 * Smooth surface of revolution around +Y from (radius, height) pairs listed bottom→top.
 * `sx`/`sz` give an elliptical cross-section (e.g. a flatter torso).
 */
export function lathe(profile: Array<[number, number]>, radial = 24, sx = 1, sz = 1, smoothSteps = 2): BufferGeometry {
  // Resample the profile with Catmull-Rom so silhouettes stay curved, not polyline.
  const pts3 = profile.map(([r, y]) => new Vector3(r, y, 0));
  const curve = new CatmullRomCurve3(pts3, false, 'centripetal');
  const count = Math.max(profile.length, seg(profile.length * smoothSteps * 2, profile.length));
  const pts = curve.getPoints(count).map((v) => new Vector2(Math.max(0, v.x), v.y));
  const g = new LatheGeometry(pts, seg(radial, 8));
  if (sx !== 1 || sz !== 1) g.scale(sx, 1, sz);
  g.computeVertexNormals();
  return g;
}

/** Box with rounded edges and corners. */
export function roundedBox(w: number, h: number, d: number, radius?: number, segments = 2): BufferGeometry {
  const r = Math.min(radius ?? Math.min(w, h, d) * 0.22, Math.min(w, h, d) * 0.49);
  return new RoundedBoxGeometry(w, h, d, Math.max(1, Math.round(segments * GeometryDetail.value)), r);
}

const rockNoise = new Noise2D(5150);
/** Organic rounded boulder: subdivided sphere with low-frequency displacement. */
export function smoothRock(seed: number, detail = 2): BufferGeometry {
  const g = new IcosahedronGeometry(1, Math.max(1, Math.round(detail * GeometryDetail.value)));
  const pos = g.attributes.position;
  const v = new Vector3();
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i);
    const n1 = rockNoise.fbm(v.x * 1.3 + seed, v.z * 1.3 + v.y * 0.7, 3);
    const n2 = rockNoise.noise(v.y * 2.1 + seed * 3, v.x * 2.1);
    const s = 0.78 + n1 * 0.38 + n2 * 0.08;
    v.multiplyScalar(s);
    v.y *= 0.82;
    pos.setXYZ(i, v.x, v.y, v.z);
  }
  g.computeVertexNormals();
  return g;
}

/** Bend a geometry's vertices into a convex dome along X and Y (shields, plates). */
export function bulge(g: BufferGeometry, amountX: number, amountY: number, axis: 'z' | 'x' = 'z'): BufferGeometry {
  const pos = g.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    const off = -(x * x) * amountX - (y * y) * amountY;
    if (axis === 'z') pos.setZ(i, pos.getZ(i) + off);
    else pos.setX(i, pos.getX(i) + off);
  }
  g.computeVertexNormals();
  return g;
}
