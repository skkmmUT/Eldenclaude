import {
  CanvasTexture,
  Color,
  Mesh,
  MeshStandardMaterial,
  PlaneGeometry,
  RepeatWrapping,
  Vector3,
  type Scene,
} from 'three';
import { Water } from 'three/examples/jsm/objects/Water.js';
import { Noise2D } from '@/core/Noise';
import { WORLD } from './WorldLayout';

/** Procedural tangent-space normal map (rippled water) — no external texture needed. */
function waterNormals(): CanvasTexture {
  const size = 256;
  const cv = document.createElement('canvas');
  cv.width = cv.height = size;
  const g = cv.getContext('2d')!;
  const img = g.createImageData(size, size);
  const n = new Noise2D(31);
  const h = (x: number, y: number) => {
    // tileable by sampling on a torus-like wrap
    const u = (x / size) * Math.PI * 2;
    const v = (y / size) * Math.PI * 2;
    return n.fbm(Math.cos(u) * 2 + 10, Math.sin(u) * 2 + Math.cos(v) * 2, 4) + n.fbm(Math.sin(v) * 2 + 30, Math.cos(u + v) * 2, 3) * 0.5;
  };
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = h(x + 1, y) - h(x - 1, y);
      const dy = h(x, y + 1) - h(x, y - 1);
      const nx = -dx * 6;
      const ny = -dy * 6;
      const l = Math.hypot(nx, ny, 1);
      const o = (y * size + x) * 4;
      img.data[o] = ((nx / l) * 0.5 + 0.5) * 255;
      img.data[o + 1] = ((ny / l) * 0.5 + 0.5) * 255;
      img.data[o + 2] = ((1 / l) * 0.5 + 0.5) * 255;
      img.data[o + 3] = 255;
    }
  }
  g.putImageData(img, 0, 0);
  const t = new CanvasTexture(cv);
  t.wrapS = t.wrapT = RepeatWrapping;
  return t;
}

/**
 * Lakes and rivers: a single water plane at the world water level (terrain below it reads
 * as water). High presets use planar reflections (mirrors the castle, trees and sky);
 * lower presets use a PBR surface reflecting the sky's environment map.
 */
export class WaterSurface {
  readonly reflective: Water;
  readonly simple: Mesh;
  private readonly normals = waterNormals();
  private readonly simpleMat: MeshStandardMaterial;

  /** Coarse map of where water exists (16 m cells) — reflections only render near it. */
  private readonly wetCells: Uint8Array;
  private readonly cell = 16;
  private readonly cells: number;
  private reflectionsEnabled = true;
  /** Is the planar-reflection pass active this frame (for diagnostics/tests). */
  reflecting = false;

  constructor(scene: Scene, reflections: boolean, heightAt: (x: number, z: number) => number) {
    this.cells = Math.ceil(WORLD.size / this.cell);
    this.wetCells = new Uint8Array(this.cells * this.cells);
    const half = WORLD.size / 2;
    for (let j = 0; j < this.cells; j++) {
      for (let i = 0; i < this.cells; i++) {
        let wet = 0;
        for (let sy = 0; sy < 3 && !wet; sy++) {
          for (let sx = 0; sx < 3 && !wet; sx++) {
            const x = -half + (i + (sx + 0.5) / 3) * this.cell;
            const z = -half + (j + (sy + 0.5) / 3) * this.cell;
            if (heightAt(x, z) < WORLD.waterLevel) wet = 1;
          }
        }
        this.wetCells[j * this.cells + i] = wet;
      }
    }
    const size = WORLD.size;
    const geo = new PlaneGeometry(size, size);
    this.reflective = new Water(geo, {
      textureWidth: 512,
      textureHeight: 512,
      waterNormals: this.normals,
      sunDirection: new Vector3(0.5, 0.8, 0.2),
      sunColor: 0xffffff,
      waterColor: 0x16465a,
      distortionScale: 1.6,
      fog: true,
      alpha: 1,
    });
    this.reflective.rotation.x = -Math.PI / 2;
    this.reflective.position.y = WORLD.waterLevel;
    const nm = this.normals.clone();
    nm.repeat.set(size / 14, size / 14);
    nm.needsUpdate = true;
    this.simpleMat = new MeshStandardMaterial({
      color: new Color('#2e6f86'),
      roughness: 0.06,
      metalness: 0.1,
      normalMap: nm,
      transparent: true,
      opacity: 0.88,
    });
    this.simple = new Mesh(new PlaneGeometry(size, size), this.simpleMat);
    this.simple.rotation.x = -Math.PI / 2;
    this.simple.position.y = WORLD.waterLevel;
    this.simple.receiveShadow = true;
    scene.add(this.reflective, this.simple);
    this.setReflections(reflections);
  }

  /** Hide cheap-to-miss detail (grass, pebbles) while the mirror pass renders. */
  excludeFromReflection(hide: (hidden: boolean) => void): void {
    const original = this.reflective.onBeforeRender.bind(this.reflective);
    this.reflective.onBeforeRender = (...args: Parameters<typeof original>) => {
      hide(true);
      original(...args);
      hide(false);
    };
  }

  setReflections(on: boolean): void {
    this.reflectionsEnabled = on;
    this.reflective.visible = on;
    this.simple.visible = !on;
  }

  private waterNear(x: number, z: number, radius: number): boolean {
    const half = WORLD.size / 2;
    const r = Math.ceil(radius / this.cell);
    const ci = Math.floor((x + half) / this.cell);
    const cj = Math.floor((z + half) / this.cell);
    for (let j = cj - r; j <= cj + r; j++) {
      if (j < 0 || j >= this.cells) continue;
      for (let i = ci - r; i <= ci + r; i++) {
        if (i < 0 || i >= this.cells) continue;
        if (!this.wetCells[j * this.cells + i]) continue;
        const cx = -half + (i + 0.5) * this.cell;
        const cz = -half + (j + 0.5) * this.cell;
        if (Math.hypot(cx - x, cz - z) <= radius + this.cell * 0.7) return true;
      }
    }
    return false;
  }

  update(dt: number, sunDir: Vector3, sunColor: Color, night: number, cameraPos?: Vector3): void {
    // Planar reflections re-render the whole scene; only pay for them near water.
    const near = !!cameraPos && this.waterNear(cameraPos.x, cameraPos.z, 46);
    this.reflecting = this.reflectionsEnabled && near;
    this.reflective.visible = this.reflecting;
    this.simple.visible = !this.reflecting;
    const u = this.reflective.material.uniforms;
    u.time.value += dt * 0.6;
    u.sunDirection.value.copy(sunDir).normalize();
    u.sunColor.value.copy(sunColor).multiplyScalar(1 - night * 0.7);
    u.waterColor.value.set(night > 0.5 ? '#0a1c28' : '#16465a');
    const nm = this.simpleMat.normalMap!;
    nm.offset.x += dt * 0.004;
    nm.offset.y += dt * 0.0025;
  }
}
