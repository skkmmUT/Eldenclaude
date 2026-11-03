import { Group, LatheGeometry, Mesh, Vector2, Vector3 } from 'three';
import type { CollisionWorld, Collider } from '@/physics/CollisionWorld';
import { toonMaterial } from '@/render/Materials';
import type { VFXManager } from '@/vfx/VFXManager';

let urnGeo: LatheGeometry | null = null;
function urnGeometry(): LatheGeometry {
  if (urnGeo) return urnGeo;
  const pts = [
    [0.0, 0],
    [0.18, 0.0],
    [0.26, 0.12],
    [0.3, 0.35],
    [0.24, 0.6],
    [0.14, 0.72],
    [0.16, 0.8],
    [0.0, 0.8],
  ].map(([x, y]) => new Vector2(x, y));
  urnGeo = new LatheGeometry(pts, 10);
  return urnGeo;
}

/** Destructible funerary urn: shatters when struck, sometimes holding echoes. */
export class Breakable {
  readonly group = new Group();
  broken = false;
  private collider: Collider | null;
  readonly radius = 0.32;

  constructor(
    readonly id: string,
    readonly position: Vector3,
    private readonly world: CollisionWorld,
    readonly echoes: number,
    scale = 1,
  ) {
    const mat = toonMaterial({ color: '#5a3e34' });
    const m = new Mesh(urnGeometry(), mat);
    m.scale.setScalar(scale);
    m.castShadow = true;
    m.receiveShadow = true;
    this.group.add(m);
    this.group.position.copy(position);
    this.collider = world.addCylinder(position.x, position.z, this.radius * scale, position.y, position.y + 0.8 * scale, { blocksSight: false });
  }

  shatter(vfx: VFXManager): void {
    if (this.broken) return;
    this.broken = true;
    this.group.visible = false;
    if (this.collider) this.world.remove(this.collider);
    this.collider = null;
    const p = this.position.clone();
    p.y += 0.4;
    vfx.smoke.burst(p, { count: 18, color: '#4a3a32', color2: '#7a6050', speed: 3.5, life: 0.9, size: 0.18, gravity: 9, drag: 1.5, spread: 2, upBias: 0.6 });
    vfx.dust(this.position, 0.5);
  }

  /** Segment-vs-sphere test for weapon sweeps. */
  hitBy(a: Vector3, b: Vector3, r: number): boolean {
    if (this.broken) return false;
    const c = this.position;
    const cy = c.y + 0.4;
    const abx = b.x - a.x, aby = b.y - a.y, abz = b.z - a.z;
    const l2 = abx * abx + aby * aby + abz * abz || 1;
    let t = ((c.x - a.x) * abx + (cy - a.y) * aby + (c.z - a.z) * abz) / l2;
    t = Math.max(0, Math.min(1, t));
    const dx = a.x + abx * t - c.x, dy = a.y + aby * t - cy, dz = a.z + abz * t - c.z;
    return Math.hypot(dx, dy, dz) < this.radius + r + 0.1;
  }
}
