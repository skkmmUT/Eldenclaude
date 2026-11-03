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

  constructor(scene: Scene, reflections: boolean) {
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

  setReflections(on: boolean): void {
    this.reflective.visible = on;
    this.simple.visible = !on;
  }

  update(dt: number, sunDir: Vector3, sunColor: Color, night: number): void {
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
