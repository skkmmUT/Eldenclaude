import {
  BufferAttribute,
  CanvasTexture,
  Color,
  LinearMipmapLinearFilter,
  Mesh,
  MeshStandardMaterial,
  PlaneGeometry,
  RepeatWrapping,
  SRGBColorSpace,
} from 'three';
import { Rng, smoothstep } from '@/core/MathUtils';
import { WORLD, detailNoise, fieldWeight, flowerWeight, forestWeight, roadWeight, terrainHeight } from './WorldLayout';

/** Grid-sampled height field shared by the terrain mesh and the collision world. */
export class Terrain {
  readonly size = WORLD.size;
  readonly segs = WORLD.segments;
  readonly heights: Float32Array;
  readonly mesh: Mesh;
  private readonly step: number;
  private readonly half: number;

  constructor() {
    const n = this.segs + 1;
    this.step = this.size / this.segs;
    this.half = this.size / 2;
    this.heights = new Float32Array(n * n);
    for (let j = 0; j < n; j++) {
      for (let i = 0; i < n; i++) {
        const x = -this.half + i * this.step;
        const z = -this.half + j * this.step;
        this.heights[j * n + i] = terrainHeight(x, z);
      }
    }
    this.mesh = this.buildMesh();
  }

  /** Bilinear height at (x, z) matching the rendered surface closely. */
  height(x: number, z: number): number {
    const n = this.segs + 1;
    const fx = (x + this.half) / this.step;
    const fz = (z + this.half) / this.step;
    if (fx < 0 || fz < 0 || fx >= this.segs || fz >= this.segs) return 200;
    const i = Math.floor(fx);
    const j = Math.floor(fz);
    const tx = fx - i;
    const tz = fz - j;
    const h00 = this.heights[j * n + i];
    const h10 = this.heights[j * n + i + 1];
    const h01 = this.heights[(j + 1) * n + i];
    const h11 = this.heights[(j + 1) * n + i + 1];
    // Same diagonal split as PlaneGeometry triangles (a-b-d / b-c-d).
    if (tx + tz <= 1) return h00 + (h10 - h00) * tx + (h01 - h00) * tz;
    return h11 + (h01 - h11) * (1 - tx) + (h10 - h11) * (1 - tz);
  }

  /** Approximate surface slope (0 = flat, 1 = 45°). */
  slope(x: number, z: number): number {
    const e = this.step;
    const dx = this.height(x + e, z) - this.height(x - e, z);
    const dz = this.height(x, z + e) - this.height(x, z - e);
    return Math.hypot(dx, dz) / (2 * e);
  }

  private buildMesh(): Mesh {
    const geo = new PlaneGeometry(this.size, this.size, this.segs, this.segs);
    geo.rotateX(-Math.PI / 2);
    const pos = geo.attributes.position;
    const n = this.segs + 1;
    // PlaneGeometry after rotation: vertex (i, j) with z running from -half (row 0 → +half?)
    for (let k = 0; k < pos.count; k++) {
      const x = pos.getX(k);
      const z = pos.getZ(k);
      const i = Math.round((x + this.half) / this.step);
      const j = Math.round((z + this.half) / this.step);
      pos.setY(k, this.heights[j * n + i]);
    }
    geo.computeVertexNormals();
    const colors = new Float32Array(pos.count * 3);
    const c = new Color();
    const grass = new Color('#557f33');
    const grassLight = new Color('#71913f');
    const grassDark = new Color('#3f6527');
    const forest = new Color('#3f6428');
    const gold = new Color('#cfa94c');
    const goldDark = new Color('#b38d38');
    const dirt = new Color('#9a7e58');
    const sand = new Color('#c8b98f');
    const bed = new Color('#6f6450');
    const rock = new Color('#8a857d');
    const rockDark = new Color('#6c6862');
    const snow = new Color('#f1f3f7');
    const flower = new Color('#7c9a48');
    const nor = geo.attributes.normal;
    for (let k = 0; k < pos.count; k++) {
      const x = pos.getX(k);
      const y = pos.getY(k);
      const z = pos.getZ(k);
      const v = detailNoise.fbm(x * 0.03, z * 0.03, 3);
      c.copy(grassDark).lerp(grass, smoothstep(0.3, 0.55, v)).lerp(grassLight, smoothstep(0.55, 0.8, v));
      c.lerp(forest, forestWeight(x, z) * 0.7);
      c.lerp(flower, flowerWeight(x, z) * 0.35);
      const fw = fieldWeight(x, z);
      if (fw > 0) {
        const rows = 0.5 + 0.5 * Math.sin(x * 1.6 + z * 0.4);
        c.lerp(new Color().copy(gold).lerp(goldDark, rows * 0.5), fw);
      }
      c.lerp(dirt, roadWeight(x, z) * 0.9);
      const steep = 1 - nor.getY(k);
      c.lerp(rockDark, smoothstep(0.18, 0.4, steep)).lerp(rock, smoothstep(0.25, 0.5, steep) * 0.6);
      c.lerp(rock, smoothstep(40, 70, y) * 0.8);
      c.lerp(snow, smoothstep(118, 140, y) * (1 - smoothstep(0.35, 0.6, steep)));
      c.lerp(sand, smoothstep(-0.05, -0.45, y) * 0.85);
      c.lerp(bed, smoothstep(-0.65, -1.2, y));
      colors[k * 3] = c.r;
      colors[k * 3 + 1] = c.g;
      colors[k * 3 + 2] = c.b;
    }
    geo.setAttribute('color', new BufferAttribute(colors, 3));
    // World-space UVs for the tiling detail texture (1 repeat per 6 m).
    const uv = geo.attributes.uv;
    for (let k = 0; k < uv.count; k++) uv.setXY(k, pos.getX(k) / 6, pos.getZ(k) / 6);
    const mat = new MeshStandardMaterial({ vertexColors: true, map: detailTexture(), roughness: 0.95, metalness: 0 });
    const mesh = new Mesh(geo, mat);
    mesh.receiveShadow = true;
    mesh.castShadow = false;
    mesh.matrixAutoUpdate = false;
    return mesh;
  }

  /** Small top-down colour image for the world map. */
  mapImage(px: number): HTMLCanvasElement {
    const cv = document.createElement('canvas');
    cv.width = cv.height = px;
    const g = cv.getContext('2d')!;
    const img = g.createImageData(px, px);
    const col = this.mesh.geometry.attributes.color;
    const n = this.segs + 1;
    const rgb = [0, 0, 0];
    for (let y = 0; y < px; y++) {
      for (let x = 0; x < px; x++) {
        // map is mirrored in X so +X (west when facing north) appears on the left
        const wx = this.half - ((x + 0.5) / px) * this.size;
        const wz = this.half - ((y + 0.5) / px) * this.size;
        // Bilinear colour and height between grid vertices: smooth shores and fields.
        const fx = Math.min(this.segs - 1e-4, Math.max(0, (wx + this.half) / this.step));
        const fz = Math.min(this.segs - 1e-4, Math.max(0, (wz + this.half) / this.step));
        const i = Math.floor(fx);
        const j = Math.floor(fz);
        const tx = fx - i;
        const tz = fz - j;
        const k00 = j * n + i;
        const k10 = k00 + 1;
        const k01 = k00 + n;
        const k11 = k01 + 1;
        const w00 = (1 - tx) * (1 - tz);
        const w10 = tx * (1 - tz);
        const w01 = (1 - tx) * tz;
        const w11 = tx * tz;
        const h = this.heights[k00] * w00 + this.heights[k10] * w10 + this.heights[k01] * w01 + this.heights[k11] * w11;
        rgb[0] = col.getX(k00) * w00 + col.getX(k10) * w10 + col.getX(k01) * w01 + col.getX(k11) * w11;
        rgb[1] = col.getY(k00) * w00 + col.getY(k10) * w10 + col.getY(k01) * w01 + col.getY(k11) * w11;
        rgb[2] = col.getZ(k00) * w00 + col.getZ(k10) * w10 + col.getZ(k01) * w01 + col.getZ(k11) * w11;
        // Soft shoreline: blend into water colour over 0.3 m of depth.
        const wet = Math.min(1, Math.max(0, (WORLD.waterLevel - 0.05 - h) / 0.3));
        const shade = 0.75 + Math.min(0.35, Math.max(-0.2, h * 0.006));
        const o = (y * px + x) * 4;
        img.data[o] = Math.min(255, rgb[0] * 255 * shade) * (1 - wet) + 70 * wet;
        img.data[o + 1] = Math.min(255, rgb[1] * 255 * shade) * (1 - wet) + 120 * wet;
        img.data[o + 2] = Math.min(255, rgb[2] * 255 * shade) * (1 - wet) + 170 * wet;
        img.data[o + 3] = 255;
      }
    }
    g.putImageData(img, 0, 0);
    return cv;
  }
}

let detail: CanvasTexture | null = null;
/** Neutral-bright tiling detail (grain, pebbles, grass strokes) multiplied over biome colours. */
function detailTexture(): CanvasTexture {
  if (detail) return detail;
  const size = 256;
  const cv = document.createElement('canvas');
  cv.width = cv.height = size;
  const g = cv.getContext('2d')!;
  g.fillStyle = '#f2f2f2';
  g.fillRect(0, 0, size, size);
  const rng = new Rng(99);
  for (let i = 0; i < 2600; i++) {
    const v = Math.floor(rng.range(200, 255));
    g.fillStyle = `rgba(${v},${v},${v},0.5)`;
    g.fillRect(rng.range(0, size), rng.range(0, size), rng.range(1, 3), rng.range(1, 3));
  }
  for (let i = 0; i < 900; i++) {
    const x = rng.range(0, size);
    const y = rng.range(0, size);
    g.strokeStyle = `rgba(${Math.floor(rng.range(170, 230))},${Math.floor(rng.range(190, 240))},${Math.floor(rng.range(160, 210))},0.45)`;
    g.beginPath();
    g.moveTo(x, y);
    g.lineTo(x + rng.range(-2, 2), y - rng.range(3, 7));
    g.stroke();
  }
  detail = new CanvasTexture(cv);
  detail.wrapS = detail.wrapT = RepeatWrapping;
  detail.colorSpace = SRGBColorSpace;
  detail.minFilter = LinearMipmapLinearFilter;
  detail.anisotropy = 8;
  return detail;
}
