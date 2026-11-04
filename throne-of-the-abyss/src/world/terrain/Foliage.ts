import {
  BufferAttribute,
  BufferGeometry,
  CanvasTexture,
  SRGBColorSpace,
  Color,
  ConeGeometry,
  CylinderGeometry,
  DoubleSide,
  Euler,
  Group,
  IcosahedronGeometry,
  InstancedMesh,
  Matrix4,
  MeshStandardMaterial,
  Quaternion,
  Vector3,
  type Material,
  type Object3D,
} from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { Rng, smoothstep } from '@/core/MathUtils';
import { lathe, smoothRock, taperedTube } from '@/render/SmoothGeometry';
import type { CollisionWorld } from '@/physics/CollisionWorld';
import type { Terrain } from './Terrain';
import { WORLD, fieldWeight, flowerWeight, forestWeight, roadWeight, riverZ } from './WorldLayout';

/** Shared wind clock for all foliage shaders. */
export const Wind = { time: { value: 0 }, strength: { value: 1 } };

function windMaterial(mat: MeshStandardMaterial, amount: number, heightScale: number): MeshStandardMaterial {
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uWindTime = Wind.time;
    shader.uniforms.uWindStrength = Wind.strength;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nuniform float uWindTime; uniform float uWindStrength;')
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
        {
          vec3 ip = vec3(0.0);
          #ifdef USE_INSTANCING
            ip = instanceMatrix[3].xyz;
          #endif
          float hgt = max(0.0, position.y) * ${heightScale.toFixed(3)};
          float ph = uWindTime * 1.6 + ip.x * 0.11 + ip.z * 0.07;
          float gust = 0.6 + 0.4 * sin(uWindTime * 0.37 + ip.x * 0.013);
          float bend = (sin(ph) * 0.7 + sin(ph * 2.3 + 1.7) * 0.3) * gust * uWindStrength * ${amount.toFixed(3)} * hgt * hgt;
          transformed.x += bend;
          transformed.z += bend * 0.45;
        }`,
      );
  };
  mat.customProgramCacheKey = () => `wind_${amount}_${heightScale}`;
  return mat;
}


let leafTex: CanvasTexture | null = null;
let needleTex: CanvasTexture | null = null;

/** Procedural leaf-cluster sprite (alpha cut-out), tinted per tree by instance colour. */
function leafTexture(): CanvasTexture {
  if (leafTex) return leafTex;
  const size = 256;
  const cv = document.createElement('canvas');
  cv.width = cv.height = size;
  const g = cv.getContext('2d')!;
  const rng = new Rng(17);
  for (let i = 0; i < 70; i++) {
    const x = rng.range(28, size - 28);
    const y = rng.range(28, size - 28);
    const d = Math.hypot(x - size / 2, y - size / 2);
    if (d > size * 0.44) continue;
    const a = rng.range(0, Math.PI * 2);
    const l = rng.range(14, 24);
    const w = l * rng.range(0.38, 0.5);
    const v = Math.floor(rng.range(150, 245));
    g.save();
    g.translate(x, y);
    g.rotate(a);
    g.fillStyle = `rgb(${v - 20},${v},${v - 40})`;
    g.beginPath();
    g.ellipse(0, 0, l, w, 0, 0, Math.PI * 2);
    g.fill();
    g.strokeStyle = `rgba(40,60,20,0.35)`;
    g.lineWidth = 1;
    g.beginPath();
    g.moveTo(-l, 0);
    g.lineTo(l, 0);
    g.stroke();
    g.restore();
  }
  leafTex = new CanvasTexture(cv);
  leafTex.colorSpace = SRGBColorSpace;
  leafTex.anisotropy = 4;
  return leafTex;
}

/** Needle spray for conifer branch cards. */
function needleTexture(): CanvasTexture {
  if (needleTex) return needleTex;
  const w = 128;
  const h = 256;
  const cv = document.createElement('canvas');
  cv.width = w;
  cv.height = h;
  const g = cv.getContext('2d')!;
  const rng = new Rng(23);
  g.strokeStyle = 'rgb(120,110,90)';
  g.lineWidth = 3;
  g.beginPath();
  g.moveTo(w / 2, h);
  g.lineTo(w / 2, 6);
  g.stroke();
  for (let y = 10; y < h - 4; y += 3) {
    const spread = (1 - y / h) * 0.2 + ((y / h) * w) / 2.3;
    for (const side of [-1, 1]) {
      const v = Math.floor(rng.range(160, 240));
      g.strokeStyle = `rgb(${v - 30},${v},${v - 50})`;
      g.lineWidth = 1.6;
      g.beginPath();
      g.moveTo(w / 2, y);
      g.lineTo(w / 2 + side * spread * rng.range(0.7, 1), y - rng.range(6, 14));
      g.stroke();
    }
  }
  needleTex = new CanvasTexture(cv);
  needleTex.colorSpace = SRGBColorSpace;
  return needleTex;
}

/**
 * Crown made of many alpha-tested leaf cards spread through ellipsoid volumes. Normals
 * point away from the crown centre so the canopy shades like a soft volume (lit side /
 * shaded side) instead of flat billboards.
 */
function cardCrown(spots: Array<[number, number, number, number]>, perBlob: number, cardSize: number, rng: Rng): BufferGeometry {
  const center = new Vector3();
  for (const [x, y, z] of spots) center.add(new Vector3(x, y, z));
  center.multiplyScalar(1 / spots.length);
  const pos: number[] = [];
  const nor: number[] = [];
  const uv: number[] = [];
  const idx: number[] = [];
  const q = new Quaternion();
  const e = new Euler();
  const corners = [
    [-0.5, -0.5, 0, 0],
    [0.5, -0.5, 1, 0],
    [0.5, 0.5, 1, 1],
    [-0.5, 0.5, 0, 1],
  ];
  for (const [bx, by, bz, r] of spots) {
    for (let i = 0; i < perBlob; i++) {
      const dir = new Vector3(rng.range(-1, 1), rng.range(-0.7, 1), rng.range(-1, 1)).normalize();
      const p = new Vector3(bx, by, bz).addScaledVector(dir, r * Math.cbrt(rng.range(0.25, 1)));
      const n = p.clone().sub(center).normalize().multiplyScalar(0.8).add(new Vector3(0, 0.35, 0)).normalize();
      q.setFromEuler(e.set(rng.range(0, Math.PI), rng.range(0, Math.PI * 2), rng.range(0, Math.PI)));
      const size = cardSize * rng.range(0.75, 1.25);
      const base = pos.length / 3;
      for (const [cx, cy, u, v] of corners) {
        const c = new Vector3(cx * size, cy * size, 0).applyQuaternion(q).add(p);
        pos.push(c.x, c.y, c.z);
        nor.push(n.x, n.y, n.z);
        uv.push(u, v);
      }
      idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
    }
  }
  const g = new BufferGeometry();
  g.setAttribute('position', new BufferAttribute(new Float32Array(pos), 3));
  g.setAttribute('normal', new BufferAttribute(new Float32Array(nor), 3));
  g.setAttribute('uv', new BufferAttribute(new Float32Array(uv), 2));
  g.setIndex(idx);
  return g;
}

function leafMaterial(amount: number, heightScale: number, tex: CanvasTexture = leafTexture()): MeshStandardMaterial {
  return windMaterial(new MeshStandardMaterial({ color: '#ffffff', map: tex, alphaTest: 0.42, side: DoubleSide, roughness: 0.78 }), amount, heightScale);
}

/** Strip to position/normal so heterogeneous generators merge cleanly. */
function clean(g: BufferGeometry): BufferGeometry {
  const out = g.index ? g.toNonIndexed() : g;
  for (const n of Object.keys(out.attributes)) if (n !== 'position' && n !== 'normal') out.deleteAttribute(n);
  return out;
}

function place(geo: BufferGeometry, x: number, y: number, z: number, rx = 0, ry = 0, rz = 0, s = 1, sy = s): BufferGeometry {
  const m = new Matrix4().compose(new Vector3(x, y, z), new Quaternion().setFromEuler(new Euler(rx, ry, rz)), new Vector3(s, sy, s));
  const g = (geo.index ? geo.toNonIndexed() : geo.clone()).applyMatrix4(m);
  for (const n of Object.keys(g.attributes)) if (n !== 'position' && n !== 'normal') g.deleteAttribute(n);
  return g;
}

interface Species {
  name: string;
  trunk: BufferGeometry;
  crown: BufferGeometry;
  trunkMat: Material;
  crownMat: MeshStandardMaterial;
  crownColors: Color[];
  trunkRadius: number;
}

function broadleaf(rng: Rng): Species {
  // Curved, tapering trunk with a root flare and two limbs that blend into the crown.
  const trunk = mergeGeometries([
    clean(taperedTube([new Vector3(0, -0.3, 0), new Vector3(0.05, 1.2, 0.02), new Vector3(-0.08, 3.2, 0.06), new Vector3(0.05, 5.2, -0.03)], (t) => 0.44 * Math.pow(1 - t, 0.6) * (1 + 0.5 * Math.max(0, 0.12 - t) / 0.12) + 0.12, 8, 8)),
    clean(taperedTube([new Vector3(0, 3.6, 0), new Vector3(0.5, 4.4, 0.05), new Vector3(1.2, 5.4, 0.2)], (t) => 0.15 * (1 - t) + 0.04, 5, 5)),
    clean(taperedTube([new Vector3(0, 3.9, 0), new Vector3(-0.45, 4.6, 0.2), new Vector3(-1.0, 5.6, 0.45)], (t) => 0.14 * (1 - t) + 0.04, 5, 5)),
  ])!;
  const spots: Array<[number, number, number, number]> = [
    [0, 6.6, 0, 2.6],
    [1.5, 5.8, 0.4, 1.9],
    [-1.4, 6.0, -0.5, 2.0],
    [0.3, 7.8, -0.8, 1.8],
    [-0.4, 5.4, 1.5, 1.7],
    [0.9, 7.0, 1.2, 1.6],
  ];
  const crown = cardCrown(spots, 20, 1.7, rng);
  return {
    name: 'broadleaf',
    trunk,
    crown,
    trunkMat: new MeshStandardMaterial({ color: '#5e4a36', roughness: 0.95 }),
    crownMat: leafMaterial(0.012, 0.35),
    crownColors: ['#4a6e2a', '#557a2e', '#5f8434', '#40632a', '#6a8a38', '#a8873a'].map((c) => new Color(c)),
    trunkRadius: 0.42,
  };
}

function birch(rng: Rng): Species {
  const trunk = clean(taperedTube([new Vector3(0, -0.2, 0), new Vector3(0.06, 2.5, 0.03), new Vector3(-0.05, 5.0, -0.02), new Vector3(0.04, 7.5, 0.02)], (t) => 0.25 * (1 - t * 0.55), 7, 8));
  const spots: Array<[number, number, number, number]> = [];
  for (let i = 0; i < 5; i++) spots.push([rng.range(-0.8, 0.8), 5.6 + i * 0.75, rng.range(-0.8, 0.8), 1.3]);
  return {
    name: 'birch',
    trunk,
    crown: cardCrown(spots, 16, 1.1, rng),
    trunkMat: new MeshStandardMaterial({ color: '#d8d4ca', roughness: 0.8 }),
    crownMat: leafMaterial(0.016, 0.3),
    crownColors: ['#6f9440', '#7a9c46', '#66893a', '#8f9e48'].map((c) => new Color(c)),
    trunkRadius: 0.24,
  };
}

function conifer(): Species {
  const trunk = clean(taperedTube([new Vector3(0, -0.2, 0), new Vector3(0, 1.4, 0.02), new Vector3(0, 3.0, 0)], (t) => 0.34 * (1 - t * 0.5), 7, 4));
  // Drooping branch cards radiating from the trunk in tiers, around a thin dark core.
  const pos: number[] = [];
  const nor: number[] = [];
  const uv: number[] = [];
  const idx: number[] = [];
  const tiers = 7;
  for (let t = 0; t < tiers; t++) {
    const y = 1.8 + t * 1.05;
    const len = 2.6 * (1 - t / (tiers + 0.5)) + 0.4;
    const n = 9 - Math.floor(t / 2);
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + t * 0.5;
      const dx = Math.cos(a);
      const dz = Math.sin(a);
      const droop = 0.45;
      const w = 0.75;
      const base = pos.length / 3;
      const px = -dz * w;
      const pz = dx * w;
      const tip = new Vector3(dx * len, y - len * droop, dz * len);
      const root = new Vector3(0, y + 0.2, 0);
      for (const [p, u, v] of [
        [root.clone().add(new Vector3(px, 0, pz)), 0, 0],
        [root.clone().add(new Vector3(-px, 0, -pz)), 1, 0],
        [tip.clone().add(new Vector3(-px, 0, -pz)), 1, 1],
        [tip.clone().add(new Vector3(px, 0, pz)), 0, 1],
      ] as Array<[Vector3, number, number]>) {
        pos.push(p.x, p.y, p.z);
        const nn = new Vector3(dx, 0.9, dz).normalize();
        nor.push(nn.x, nn.y, nn.z);
        uv.push(u, v);
      }
      idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
    }
  }
  const cards = new BufferGeometry();
  cards.setAttribute('position', new BufferAttribute(new Float32Array(pos), 3));
  cards.setAttribute('normal', new BufferAttribute(new Float32Array(nor), 3));
  cards.setAttribute('uv', new BufferAttribute(new Float32Array(uv), 2));
  cards.setIndex(idx);
  const core = place(new ConeGeometry(0.9, 8.5, 6), 0, 5.6, 0);
  const coreUv = new Float32Array(core.attributes.position.count * 2).fill(0.5);
  core.setAttribute('uv', new BufferAttribute(coreUv, 2));
  return {
    name: 'conifer',
    trunk,
    crown: mergeGeometries([cards.toNonIndexed(), core])!,
    trunkMat: new MeshStandardMaterial({ color: '#5a4330', roughness: 0.95 }),
    crownMat: windMaterial(new MeshStandardMaterial({ color: '#ffffff', map: needleTexture(), alphaTest: 0.35, side: DoubleSide, roughness: 0.85 }), 0.006, 0.3),
    crownColors: ['#2f4f2a', '#36592e', '#2c4828', '#3d6234'].map((c) => new Color(c)),
    trunkRadius: 0.34,
  };
}

interface Chunk {
  center: Vector3;
  meshes: Object3D[];
}

/**
 * Scatters and renders vegetation as instanced meshes grouped in spatial chunks; chunks
 * beyond the quality-dependent distance are hidden (cheap distance culling / LOD).
 */
export class Foliage {
  readonly group = new Group();
  private treeChunks: Chunk[] = [];
  private grassChunks: Chunk[] = [];
  treeDistance = 600;
  grassDistance = 110;

  constructor(
    private readonly terrain: Terrain,
    private readonly world: CollisionWorld,
    density: number,
  ) {
    this.buildTrees();
    this.buildGrass(density);
    this.buildRocks();
  }

  private blocked(x: number, z: number, h: number): boolean {
    const c = WORLD.castle;
    if (x > c.minX - 26 && x < c.maxX + 26 && z > c.minZ - 26 && z < c.maxZ + 26) return true;
    if (h < WORLD.waterLevel + 0.6) return true;
    if (roadWeight(x, z) > 0.05 || Math.abs(x - 0) < 7 && z < -40 && z > -140) return true;
    if (Math.abs(z - riverZ(x)) < 12) return true;
    const f = WORLD.fortress;
    if (Math.hypot(x - f.x, z - f.z) < f.r + 6) return true;
    const gt = WORLD.giantTree;
    if (Math.hypot(x - gt.x, z - gt.z) < 22) return true;
    return false;
  }

  private buildTrees(): void {
    const rng = new Rng(4242);
    const species = [broadleaf(rng), birch(rng), conifer()];
    const cell = 160;
    const buckets = new Map<string, Array<{ s: number; m: Matrix4; c: Color }>>();
    const half = WORLD.size / 2 - 20;
    const tries = 26000;
    for (let i = 0; i < tries; i++) {
      const x = rng.range(-half, half);
      const z = rng.range(-half, half);
      const h = this.terrain.height(x, z);
      if (this.blocked(x, z, h) || fieldWeight(x, z) > 0.05) continue;
      const slope = this.terrain.slope(x, z);
      if (slope > 0.75 || h > 115) continue;
      const fw = forestWeight(x, z);
      const mountain = smoothstep(18, 60, h);
      const p = 0.012 + fw * 0.22 + mountain * 0.12;
      if (!rng.chance(p)) continue;
      let s: number;
      if (mountain > 0.5 || (h > 12 && rng.chance(0.5))) s = 2;
      else if (fw > 0.3 && rng.chance(0.4)) s = 1;
      else s = rng.chance(0.15) ? 1 : 0;
      const scale = rng.range(0.85, 1.45) * (s === 2 ? 1.2 : 1);
      const m = new Matrix4().compose(
        new Vector3(x, h - 0.15, z),
        new Quaternion().setFromEuler(new Euler(rng.range(-0.04, 0.04), rng.range(0, Math.PI * 2), rng.range(-0.04, 0.04))),
        new Vector3(scale, scale * rng.range(0.9, 1.15), scale),
      );
      const colors = species[s].crownColors;
      const col = colors[rng.int(0, colors.length - 1)].clone().multiplyScalar(rng.range(0.9, 1.1));
      const key = `${Math.floor(x / cell)},${Math.floor(z / cell)}`;
      const list = buckets.get(key) ?? [];
      list.push({ s, m, c: col });
      buckets.set(key, list);
      this.world.addCylinder(x, z, species[s].trunkRadius * scale, h - 0.5, h + 5 * scale, { blocksSight: true, tag: 'tree' });
    }
    for (const [key, list] of buckets) {
      const [cx, cz] = key.split(',').map(Number);
      const chunk: Chunk = { center: new Vector3((cx + 0.5) * cell, 0, (cz + 0.5) * cell), meshes: [] };
      species.forEach((sp, si) => {
        const items = list.filter((t) => t.s === si);
        if (!items.length) return;
        const trunk = new InstancedMesh(sp.trunk, sp.trunkMat, items.length);
        const crown = new InstancedMesh(sp.crown, sp.crownMat, items.length);
        items.forEach((t, i) => {
          trunk.setMatrixAt(i, t.m);
          crown.setMatrixAt(i, t.m);
          crown.setColorAt(i, t.c);
        });
        for (const im of [trunk, crown]) {
          im.castShadow = true;
          im.receiveShadow = true;
          im.computeBoundingSphere();
          this.group.add(im);
          chunk.meshes.push(im);
        }
      });
      this.treeChunks.push(chunk);
    }
    this.buildGiantTree();
  }

  /** The Elder Bough: a colossal ancient tree on its hill east of the castle. */
  private buildGiantTree(): void {
    const rng = new Rng(777);
    const gt = WORLD.giantTree;
    const base = this.terrain.height(gt.x, gt.z) - 1;
    // Flared trunk (lathe), sinuous surface roots and sweeping limbs (tapered splines).
    const parts: BufferGeometry[] = [clean(lathe([[6.5, -1.5], [4.6, 1.5], [3.3, 6], [2.8, 18], [2.6, 32], [2.0, 42], [0.4, 45]], 36))];
    for (let i = 0; i < 9; i++) {
      const a = (i / 9) * Math.PI * 2 + rng.range(-0.2, 0.2);
      const d = rng.range(7, 11);
      parts.push(clean(taperedTube([new Vector3(Math.cos(a) * 2.5, 3.5, Math.sin(a) * 2.5), new Vector3(Math.cos(a) * 5, 0.8, Math.sin(a) * 5), new Vector3(Math.cos(a) * d, -0.4, Math.sin(a) * d)], (t) => 1.3 * (1 - t) + 0.15, 10, 14, 0.7)));
    }
    for (let i = 0; i < 9; i++) {
      const a = (i / 9) * Math.PI * 2 + 0.3;
      const y = 24 + (i % 3) * 6;
      const r = rng.range(11, 17);
      parts.push(clean(taperedTube([new Vector3(0, y, 0), new Vector3(Math.cos(a) * r * 0.45, y + 5, Math.sin(a) * r * 0.45), new Vector3(Math.cos(a) * r, y + 12, Math.sin(a) * r)], (t) => 1.25 * (1 - t) + 0.2, 10, 14)));
    }
    const trunk = new InstancedMesh(mergeGeometries(parts)!, new MeshStandardMaterial({ color: '#6e5a42', roughness: 0.95 }), 1);
    const spots: Array<[number, number, number, number]> = [];
    for (let i = 0; i < 26; i++) {
      const a = rng.range(0, Math.PI * 2);
      const d = rng.range(0, 18);
      spots.push([Math.cos(a) * d, rng.range(36, 54) - d * 0.35, Math.sin(a) * d, rng.range(6, 11)]);
    }
    const crown = new InstancedMesh(cardCrown(spots, 40, 4.6, rng), leafMaterial(0.002, 0.05), 1);
    const m = new Matrix4().makeTranslation(gt.x, base, gt.z);
    trunk.setMatrixAt(0, m);
    crown.setMatrixAt(0, m);
    crown.setColorAt(0, new Color('#56802f'));
    for (const im of [trunk, crown]) {
      im.castShadow = true;
      im.receiveShadow = true;
      im.computeBoundingSphere();
      this.group.add(im);
    }
    this.world.addCylinder(gt.x, gt.z, 4.4, base, base + 40, { tag: 'giantTree' });
  }

  private buildGrass(density: number): void {
    const rng = new Rng(9090);
    // Clump: 7 tapered blades with base→tip gradient (vertex colours), normals up.
    const blade = (h: number, w: number, ox: number, oz: number, yaw: number, lean: number): BufferGeometry => {
      const g = new BufferGeometry();
      const p = [-w, 0, 0, w, 0, 0, -w * 0.5, h * 0.55, lean * 0.5, w * 0.5, h * 0.55, lean * 0.5, 0, h, lean];
      g.setAttribute('position', new BufferAttribute(new Float32Array(p), 3));
      g.setIndex([0, 1, 2, 1, 3, 2, 2, 3, 4]);
      g.setAttribute('normal', new BufferAttribute(new Float32Array([0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0]), 3));
      const c = [0.7, 0.7, 0.7, 0.7, 0.7, 0.7, 0.9, 0.9, 0.9, 0.9, 0.9, 0.9, 1.05, 1.05, 1.05];
      g.setAttribute('color', new BufferAttribute(new Float32Array(c), 3));
      const m = new Matrix4().compose(new Vector3(ox, 0, oz), new Quaternion().setFromEuler(new Euler(0, yaw, 0)), new Vector3(1, 1, 1));
      return g.toNonIndexed().applyMatrix4(m);
    };
    const clump = (hScale: number) => {
      const blades: BufferGeometry[] = [];
      for (let i = 0; i < 9; i++) blades.push(blade(rng.range(0.35, 0.7) * hScale, 0.035, rng.range(-0.25, 0.25), rng.range(-0.25, 0.25), rng.range(0, Math.PI), rng.range(-0.15, 0.15)));
      return mergeGeometries(blades)!;
    };
    const grassGeo = clump(1);
    const wheatGeo = clump(1.9);
    const flowerGeo = mergeGeometries([
      place(new CylinderGeometry(0.01, 0.01, 0.35, 3), 0, 0.17, 0),
      place(new IcosahedronGeometry(0.06, 0), 0, 0.38, 0),
    ])!;
    const grassMat = windMaterial(new MeshStandardMaterial({ color: '#ffffff', vertexColors: true, roughness: 0.9, side: DoubleSide }), 0.35, 1.0);
    const wheatMat = windMaterial(new MeshStandardMaterial({ color: '#ffffff', vertexColors: true, roughness: 0.75, side: DoubleSide }), 0.28, 0.75);
    const flowerMat = windMaterial(new MeshStandardMaterial({ color: '#ffffff', roughness: 0.6 }), 0.3, 1.2);
    const flowerColors = ['#f5f1e6', '#f2d24a', '#b48ae8', '#e8554a', '#f0a0c8'].map((c) => new Color(c));
    const cell = 48;
    const radius = 300;
    for (let cx = -radius; cx < radius; cx += cell) {
      for (let cz = -radius - 120; cz < radius; cz += cell) {
        const gM: Matrix4[] = [];
        const gC: Color[] = [];
        const wM: Matrix4[] = [];
        const wC: Color[] = [];
        const fM: Matrix4[] = [];
        const fC: Color[] = [];
        const n = Math.round(1500 * density);
        for (let i = 0; i < n; i++) {
          const x = cx + rng.range(0, cell);
          const z = cz + rng.range(0, cell);
          const h = this.terrain.height(x, z);
          const c = WORLD.castle;
          if (x > c.minX - 2 && x < c.maxX + 2 && z > c.minZ - 2 && z < c.maxZ + 2) continue;
          if (h < WORLD.waterLevel + 0.35 || h > 45 || this.terrain.slope(x, z) > 0.6) continue;
          if (roadWeight(x, z) > 0.3) continue;
          const fw = fieldWeight(x, z);
          const m = new Matrix4().compose(new Vector3(x, h - 0.02, z), new Quaternion().setFromEuler(new Euler(0, rng.range(0, 6.28), 0)), new Vector3(1, rng.range(0.8, 1.25), 1).multiplyScalar(rng.range(0.85, 1.2)));
          if (fw > 0.4) {
            wM.push(m);
            wC.push(new Color('#e2c070').multiplyScalar(rng.range(0.92, 1.08)));
            // fields are dense: add a second clump nearby
            const m2 = m.clone().setPosition(x + rng.range(-0.6, 0.6), h - 0.02, z + rng.range(-0.6, 0.6));
            wM.push(m2);
            wC.push(new Color('#d6b25e').multiplyScalar(rng.range(0.92, 1.08)));
            continue;
          }
          gM.push(m);
          gC.push(new Color('#5a8434').lerp(new Color('#86a24a'), rng.next() * 0.6).multiplyScalar(rng.range(0.85, 1.1)));
          const fl = flowerWeight(x, z);
          if (rng.chance(0.05 + fl * 0.55)) {
            fM.push(new Matrix4().compose(new Vector3(x + rng.range(-0.3, 0.3), h, z + rng.range(-0.3, 0.3)), new Quaternion(), new Vector3(1, rng.range(0.8, 1.3), 1)));
            fC.push(flowerColors[rng.int(0, flowerColors.length - 1)]);
          }
        }
        const chunk: Chunk = { center: new Vector3(cx + cell / 2, 0, cz + cell / 2), meshes: [] };
        const add = (geo: BufferGeometry, mat: Material, ms: Matrix4[], cs: Color[]) => {
          if (!ms.length) return;
          const im = new InstancedMesh(geo, mat, ms.length);
          ms.forEach((m, i) => {
            im.setMatrixAt(i, m);
            im.setColorAt(i, cs[i]);
          });
          im.receiveShadow = true;
          im.computeBoundingSphere();
          this.group.add(im);
          chunk.meshes.push(im);
        };
        add(grassGeo, grassMat, gM, gC);
        add(wheatGeo, wheatMat, wM, wC);
        add(flowerGeo, flowerMat, fM, fC);
        if (chunk.meshes.length) this.grassChunks.push(chunk);
      }
    }
  }

  private buildRocks(): void {
    const rng = new Rng(3131);
    const geo = smoothRock(7, 1);
    const mat = new MeshStandardMaterial({ color: '#ffffff', roughness: 0.9 });
    const ms: Matrix4[] = [];
    const cs: Color[] = [];
    const half = WORLD.size / 2 - 30;
    for (let i = 0; i < 9000 && ms.length < 900; i++) {
      const x = rng.range(-half, half);
      const z = rng.range(-half, half);
      const h = this.terrain.height(x, z);
      if (this.blocked(x, z, h) || fieldWeight(x, z) > 0.1) continue;
      const slope = this.terrain.slope(x, z);
      const p = 0.02 + smoothstep(0.3, 0.8, slope) * 0.06 + smoothstep(25, 70, h) * 0.02;
      if (!rng.chance(p)) continue;
      const s = rng.range(0.4, 1.4) * (1 + smoothstep(20, 90, h) * 1.2);
      ms.push(new Matrix4().compose(new Vector3(x, h - s * 0.3, z), new Quaternion().setFromEuler(new Euler(rng.range(0, 3), rng.range(0, 3), rng.range(0, 3))), new Vector3(s, s * rng.range(0.55, 0.9), s * rng.range(0.8, 1.2))));
      cs.push(new Color('#7c776f').multiplyScalar(rng.range(0.8, 1.1)));
      if (s > 1.1) this.world.addCylinder(x, z, s * 0.85, h - 1, h + s * 0.6, { blocksSight: false });
    }
    const im = new InstancedMesh(geo, mat, ms.length);
    ms.forEach((m, i) => {
      im.setMatrixAt(i, m);
      im.setColorAt(i, cs[i]);
    });
    im.castShadow = true;
    im.receiveShadow = true;
    im.computeBoundingSphere();
    this.group.add(im);
    this.rocks = im;
  }

  /** Temporarily hide ground cover (used while rendering water reflections). */
  setGroundCoverVisible(v: boolean): void {
    if (v) {
      for (const m of this.hiddenForReflection) m.visible = true;
      this.hiddenForReflection.length = 0;
      return;
    }
    for (const c of this.grassChunks) for (const m of c.meshes) if (m.visible) {
      m.visible = false;
      this.hiddenForReflection.push(m);
    }
    if (this.rocks?.visible) {
      this.rocks.visible = false;
      this.hiddenForReflection.push(this.rocks);
    }
  }
  private readonly hiddenForReflection: Object3D[] = [];
  private rocks: InstancedMesh | null = null;

  update(dt: number, camPos: Vector3, windStrength: number): void {
    Wind.time.value += dt;
    Wind.strength.value = windStrength;
    for (const c of this.treeChunks) {
      const vis = Math.hypot(c.center.x - camPos.x, c.center.z - camPos.z) < this.treeDistance + 120;
      for (const m of c.meshes) m.visible = vis;
    }
    for (const c of this.grassChunks) {
      const vis = Math.hypot(c.center.x - camPos.x, c.center.z - camPos.z) < this.grassDistance + 34;
      for (const m of c.meshes) m.visible = vis;
    }
  }
}
