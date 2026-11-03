import { DoubleSide, Mesh, MeshToonMaterial, PlaneGeometry, Vector3, type Object3D } from 'three';
import { toonRamp } from '@/render/Materials';
import type { Texture } from 'three';

interface Collider {
  joint: Object3D;
  offset: Vector3;
  radius: number;
}

/**
 * Verlet cloth strip pinned to the chest — gives the long anime capes their motion.
 * ~50 particles, a handful of sphere colliders on torso/legs; cheap enough for every
 * caped character on screen.
 */
export class CapeCloth {
  readonly mesh: Mesh;
  private readonly cols: number;
  private readonly rows: number;
  private readonly pos: Vector3[] = [];
  private readonly prev: Vector3[] = [];
  private readonly colliders: Collider[] = [];
  private readonly restX: number;
  private readonly restY: number;
  private readonly tmp = new Vector3();
  private readonly tmp2 = new Vector3();
  private initialised = false;
  wind = new Vector3(0.6, 0, 0.3);

  constructor(
    private readonly anchor: Object3D,
    width: number,
    length: number,
    texture: Texture,
    private readonly worldScale: number,
    cols = 6,
    rows = 9,
  ) {
    this.cols = cols;
    this.rows = rows;
    this.restX = (width / (cols - 1)) * worldScale;
    this.restY = (length / (rows - 1)) * worldScale;
    const geo = new PlaneGeometry(width, length, cols - 1, rows - 1);
    const mat = new MeshToonMaterial({ map: texture, gradientMap: toonRamp(), side: DoubleSide, alphaTest: 0.5 });
    this.mesh = new Mesh(geo, mat);
    this.mesh.frustumCulled = false;
    this.mesh.castShadow = true;
    this.mesh.receiveShadow = true;
    this.mesh.matrixAutoUpdate = false;
    for (let i = 0; i < cols * rows; i++) {
      this.pos.push(new Vector3());
      this.prev.push(new Vector3());
    }
  }

  addCollider(joint: Object3D, offset: Vector3, radius: number): void {
    this.colliders.push({ joint, offset, radius: radius * this.worldScale });
  }

  private pinPosition(c: number, out: Vector3): Vector3 {
    const w = this.restX * (this.cols - 1);
    out.set((c / (this.cols - 1) - 0.5) * (w / this.worldScale), 0, 0);
    return this.anchor.localToWorld(out);
  }

  reset(): void {
    this.initialised = false;
  }

  update(dt: number): void {
    const h = Math.min(dt, 1 / 30);
    if (h <= 0) return;
    this.anchor.updateWorldMatrix(true, false);
    const back = this.tmp2.set(0, 0, -1).transformDirection(this.anchor.matrixWorld);
    if (!this.initialised) {
      for (let r = 0; r < this.rows; r++) {
        for (let c = 0; c < this.cols; c++) {
          const p = this.pinPosition(c, new Vector3());
          p.y -= r * this.restY;
          p.addScaledVector(back, r * 0.02);
          this.pos[r * this.cols + c].copy(p);
          this.prev[r * this.cols + c].copy(p);
        }
      }
      this.initialised = true;
    }

    const gravity = -9.8 * h * h;
    const t = performance.now() * 0.001;
    const gust = 0.5 + 0.5 * Math.sin(t * 1.3) * Math.sin(t * 0.7 + 1.0);
    for (let i = this.cols; i < this.pos.length; i++) {
      const p = this.pos[i];
      const q = this.prev[i];
      const vx = (p.x - q.x) * 0.985;
      const vy = (p.y - q.y) * 0.985;
      const vz = (p.z - q.z) * 0.985;
      q.copy(p);
      p.x += vx + this.wind.x * gust * h * h * 2;
      p.y += vy + gravity;
      p.z += vz + this.wind.z * gust * h * h * 2;
    }
    // Pin the top row to the anchor.
    for (let c = 0; c < this.cols; c++) {
      this.pinPosition(c, this.pos[c]);
      this.prev[c].copy(this.pos[c]);
    }

    for (let iter = 0; iter < 4; iter++) {
      for (let r = 0; r < this.rows; r++) {
        for (let c = 0; c < this.cols; c++) {
          const i = r * this.cols + c;
          if (c < this.cols - 1) this.satisfy(i, i + 1, this.restX);
          if (r < this.rows - 1) this.satisfy(i, i + this.cols, this.restY);
        }
      }
      this.collide(back);
    }
    this.writeMesh();
  }

  private satisfy(a: number, b: number, rest: number): void {
    const pa = this.pos[a];
    const pb = this.pos[b];
    const d = this.tmp.subVectors(pb, pa);
    const len = d.length() || 1e-6;
    const diff = (len - rest) / len;
    const pinnedA = a < this.cols;
    const pinnedB = b < this.cols;
    if (pinnedA && pinnedB) return;
    if (pinnedA) pb.addScaledVector(d, -diff);
    else if (pinnedB) pa.addScaledVector(d, diff);
    else {
      pa.addScaledVector(d, diff * 0.5);
      pb.addScaledVector(d, -diff * 0.5);
    }
  }

  private collide(back: Vector3): void {
    for (const col of this.colliders) {
      const c = col.joint.localToWorld(this.tmp.copy(col.offset));
      for (let i = this.cols; i < this.pos.length; i++) {
        const p = this.pos[i];
        const dx = p.x - c.x;
        const dy = p.y - c.y;
        const dz = p.z - c.z;
        const d2 = dx * dx + dy * dy + dz * dz;
        if (d2 < col.radius * col.radius) {
          const d = Math.sqrt(d2) || 1e-5;
          let nx = dx / d;
          let ny = dy / d;
          let nz = dz / d;
          if (d < 1e-4) {
            nx = back.x;
            ny = back.y;
            nz = back.z;
          }
          p.set(c.x + nx * col.radius, c.y + ny * col.radius, c.z + nz * col.radius);
        }
      }
    }
  }

  private writeMesh(): void {
    const attr = this.mesh.geometry.getAttribute('position');
    // PlaneGeometry vertex order: rows top→bottom, columns left→right.
    for (let r = 0; r < this.rows; r++) {
      for (let c = 0; c < this.cols; c++) {
        const p = this.pos[r * this.cols + c];
        attr.setXYZ(r * this.cols + (this.cols - 1 - c), p.x, p.y, p.z);
      }
    }
    attr.needsUpdate = true;
    this.mesh.geometry.computeVertexNormals();
    this.mesh.geometry.computeBoundingSphere();
    this.mesh.matrixWorld.identity();
  }

  setVisible(v: boolean): void {
    this.mesh.visible = v;
  }
}
