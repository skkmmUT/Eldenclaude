/**
 * Static collision world made of axis-aligned boxes and vertical cylinders.
 *
 * Characters are treated as vertical capsules resolved in the XZ plane against any
 * collider overlapping their vertical span, and snapped to the highest walkable top
 * beneath them. This "2.5D" model is cheap, stable, supports stairs (step-up), ledges,
 * platforms and pillars — everything the gothic architecture needs — and lets the same
 * data drive camera collision and AI line-of-sight via ray casts.
 */
export interface BoxCollider {
  kind: 'box';
  id: number;
  minX: number;
  minY: number;
  minZ: number;
  maxX: number;
  maxY: number;
  maxZ: number;
  /** Blocks camera / sight rays (low rubble does not block sight). */
  blocksSight: boolean;
  tag?: string;
}

export interface CylinderCollider {
  kind: 'cylinder';
  id: number;
  x: number;
  z: number;
  radius: number;
  minY: number;
  maxY: number;
  blocksSight: boolean;
  tag?: string;
}

export type Collider = BoxCollider | CylinderCollider;

export interface RayHit {
  distance: number;
  nx: number;
  ny: number;
  nz: number;
  collider: Collider;
}

const CELL = 8;

/** Pseudo-collider reported by ray hits on the terrain. */
export const TERRAIN_COLLIDER: Collider = {
  kind: 'box',
  id: 0,
  minX: 0,
  minY: 0,
  minZ: 0,
  maxX: 0,
  maxY: 0,
  maxZ: 0,
  blocksSight: true,
  tag: 'terrain',
};

export class CollisionWorld {
  private colliders = new Map<number, Collider>();
  private grid = new Map<string, Set<Collider>>();
  private nextId = 1;
  /** Absolute floor: nothing falls below this height. */
  killY = -50;
  /** Optional height field (open-world terrain). */
  terrain: { height(x: number, z: number): number } | null = null;
  /** Water surface height, if the level has water. */
  waterLevel: number | null = null;

  terrainHeight(x: number, z: number): number {
    return this.terrain ? this.terrain.height(x, z) : -Infinity;
  }

  addBox(
    minX: number,
    minY: number,
    minZ: number,
    maxX: number,
    maxY: number,
    maxZ: number,
    opts: { blocksSight?: boolean; tag?: string } = {},
  ): BoxCollider {
    const c: BoxCollider = {
      kind: 'box',
      id: this.nextId++,
      minX: Math.min(minX, maxX),
      minY: Math.min(minY, maxY),
      minZ: Math.min(minZ, maxZ),
      maxX: Math.max(minX, maxX),
      maxY: Math.max(minY, maxY),
      maxZ: Math.max(minZ, maxZ),
      blocksSight: opts.blocksSight ?? true,
      tag: opts.tag,
    };
    this.insert(c);
    return c;
  }

  /** Box from center + half extents (convenient for level building). */
  addBoxCentered(
    cx: number,
    cy: number,
    cz: number,
    hx: number,
    hy: number,
    hz: number,
    opts: { blocksSight?: boolean; tag?: string } = {},
  ): BoxCollider {
    return this.addBox(cx - hx, cy - hy, cz - hz, cx + hx, cy + hy, cz + hz, opts);
  }

  addCylinder(
    x: number,
    z: number,
    radius: number,
    minY: number,
    maxY: number,
    opts: { blocksSight?: boolean; tag?: string } = {},
  ): CylinderCollider {
    const c: CylinderCollider = {
      kind: 'cylinder',
      id: this.nextId++,
      x,
      z,
      radius,
      minY,
      maxY,
      blocksSight: opts.blocksSight ?? true,
      tag: opts.tag,
    };
    this.insert(c);
    return c;
  }

  remove(c: Collider): void {
    if (!this.colliders.delete(c.id)) return;
    for (const set of this.grid.values()) set.delete(c);
  }

  get count(): number {
    return this.colliders.size;
  }

  /** All colliders (map rendering, debug views). */
  all(): IterableIterator<Collider> {
    return this.colliders.values();
  }

  private bounds(c: Collider): [number, number, number, number] {
    if (c.kind === 'box') return [c.minX, c.minZ, c.maxX, c.maxZ];
    return [c.x - c.radius, c.z - c.radius, c.x + c.radius, c.z + c.radius];
  }

  private insert(c: Collider): void {
    this.colliders.set(c.id, c);
    const [x0, z0, x1, z1] = this.bounds(c);
    for (let gx = Math.floor(x0 / CELL); gx <= Math.floor(x1 / CELL); gx++) {
      for (let gz = Math.floor(z0 / CELL); gz <= Math.floor(z1 / CELL); gz++) {
        const key = `${gx},${gz}`;
        let set = this.grid.get(key);
        if (!set) {
          set = new Set();
          this.grid.set(key, set);
        }
        set.add(c);
      }
    }
  }

  /** Colliders whose XZ bounds may overlap the given rectangle. */
  query(x0: number, z0: number, x1: number, z1: number, out: Collider[] = []): Collider[] {
    out.length = 0;
    const seen = new Set<number>();
    for (let gx = Math.floor(x0 / CELL); gx <= Math.floor(x1 / CELL); gx++) {
      for (let gz = Math.floor(z0 / CELL); gz <= Math.floor(z1 / CELL); gz++) {
        const set = this.grid.get(`${gx},${gz}`);
        if (!set) continue;
        for (const c of set) {
          if (!seen.has(c.id)) {
            seen.add(c.id);
            out.push(c);
          }
        }
      }
    }
    return out;
  }

  private scratch: Collider[] = [];

  /** Does a circle (XZ) overlap the collider's footprint? */
  static circleOverlapsXZ(c: Collider, x: number, z: number, r: number): boolean {
    if (c.kind === 'box') {
      const cx = Math.max(c.minX, Math.min(x, c.maxX));
      const cz = Math.max(c.minZ, Math.min(z, c.maxZ));
      const dx = x - cx;
      const dz = z - cz;
      return dx * dx + dz * dz < r * r;
    }
    const dx = x - c.x;
    const dz = z - c.z;
    const rr = r + c.radius;
    return dx * dx + dz * dz < rr * rr;
  }

  /**
   * Highest walkable surface under a circle footprint, no higher than `maxY`.
   * Returns -Infinity when there is nothing below (falling into the void).
   */
  groundHeight(x: number, z: number, r: number, maxY: number): number {
    let best = -Infinity;
    if (this.terrain) {
      const th = this.terrain.height(x, z);
      if (th <= maxY + 1e-4) best = th;
    }
    for (const c of this.query(x - r, z - r, x + r, z + r, this.scratch)) {
      if (c.maxY > maxY + 1e-4) continue;
      if (c.maxY <= best) continue;
      if (CollisionWorld.circleOverlapsXZ(c, x, z, r)) best = c.maxY;
    }
    return best;
  }

  /** Lowest ceiling above `minY` over the footprint (Infinity if open sky). */
  ceilingHeight(x: number, z: number, r: number, minY: number): number {
    let best = Infinity;
    for (const c of this.query(x - r, z - r, x + r, z + r, this.scratch)) {
      if (c.minY < minY - 1e-4) continue;
      if (c.minY >= best) continue;
      if (CollisionWorld.circleOverlapsXZ(c, x, z, r)) best = c.minY;
    }
    return best;
  }

  /**
   * Push a circle out of every collider whose vertical extent overlaps [y0, y1].
   * Mutates and returns `pos`; `hitWall` reports whether anything was touched.
   */
  resolveCircle(pos: { x: number; z: number }, r: number, y0: number, y1: number): boolean {
    let touched = false;
    for (let iter = 0; iter < 3; iter++) {
      let moved = false;
      for (const c of this.query(pos.x - r - 0.1, pos.z - r - 0.1, pos.x + r + 0.1, pos.z + r + 0.1, this.scratch)) {
        if (c.maxY <= y0 || c.minY >= y1) continue;
        if (c.kind === 'box') {
          const cx = Math.max(c.minX, Math.min(pos.x, c.maxX));
          const cz = Math.max(c.minZ, Math.min(pos.z, c.maxZ));
          let dx = pos.x - cx;
          let dz = pos.z - cz;
          const d2 = dx * dx + dz * dz;
          if (d2 >= r * r) continue;
          if (d2 > 1e-10) {
            const d = Math.sqrt(d2);
            const push = r - d;
            pos.x += (dx / d) * push;
            pos.z += (dz / d) * push;
          } else {
            // Center inside the box: exit through the nearest face.
            const left = pos.x - c.minX;
            const right = c.maxX - pos.x;
            const back = pos.z - c.minZ;
            const front = c.maxZ - pos.z;
            const m = Math.min(left, right, back, front);
            if (m === left) pos.x = c.minX - r;
            else if (m === right) pos.x = c.maxX + r;
            else if (m === back) pos.z = c.minZ - r;
            else pos.z = c.maxZ + r;
            dx = dz = 0;
          }
          touched = moved = true;
        } else {
          const dx = pos.x - c.x;
          const dz = pos.z - c.z;
          const rr = r + c.radius;
          const d2 = dx * dx + dz * dz;
          if (d2 >= rr * rr) continue;
          const d = Math.sqrt(d2) || 1e-5;
          const push = rr - d;
          pos.x += (dx / d) * push;
          pos.z += (dz / d) * push;
          touched = moved = true;
        }
      }
      if (!moved) break;
    }
    return touched;
  }

  /** Ray cast against all colliders. Direction must be normalised. */
  raycast(
    ox: number,
    oy: number,
    oz: number,
    dx: number,
    dy: number,
    dz: number,
    maxDist: number,
    sightOnly = false,
  ): RayHit | null {
    const ex = ox + dx * maxDist;
    const ez = oz + dz * maxDist;
    let best: RayHit | null = null;
    let bestT = maxDist;
    for (const c of this.query(Math.min(ox, ex), Math.min(oz, ez), Math.max(ox, ex), Math.max(oz, ez), this.scratch)) {
      if (sightOnly && !c.blocksSight) continue;
      const hit = c.kind === 'box' ? rayBox(c, ox, oy, oz, dx, dy, dz, bestT) : rayCylinder(c, ox, oy, oz, dx, dy, dz, bestT);
      if (hit && hit.distance < bestT) {
        bestT = hit.distance;
        best = hit;
      }
    }
    if (this.terrain) {
      const th = this.rayTerrain(ox, oy, oz, dx, dy, dz, bestT);
      if (th !== null && th < bestT) {
        best = { distance: th, nx: 0, ny: 1, nz: 0, collider: TERRAIN_COLLIDER };
      }
    }
    return best;
  }

  /** March a ray against the height field (1 m steps + bisection refine). */
  private rayTerrain(ox: number, oy: number, oz: number, dx: number, dy: number, dz: number, maxT: number): number | null {
    const t = this.terrain!;
    const stepLen = 1;
    let prevT = 0;
    let prevAbove = oy - t.height(ox, oz);
    if (prevAbove < 0) return null; // origin below ground (inside geometry) — ignore
    for (let s = stepLen; s <= maxT + 1e-6; s += stepLen) {
      const tt = Math.min(s, maxT);
      const above = oy + dy * tt - t.height(ox + dx * tt, oz + dz * tt);
      if (above < 0) {
        let a = prevT;
        let b = tt;
        for (let i = 0; i < 6; i++) {
          const m = (a + b) / 2;
          if (oy + dy * m - t.height(ox + dx * m, oz + dz * m) < 0) b = m;
          else a = m;
        }
        return a;
      }
      prevT = tt;
      prevAbove = above;
    }
    void prevAbove;
    return null;
  }

  /** True if nothing that blocks sight lies between the two points. */
  lineOfSight(ax: number, ay: number, az: number, bx: number, by: number, bz: number): boolean {
    const dx = bx - ax;
    const dy = by - ay;
    const dz = bz - az;
    const len = Math.hypot(dx, dy, dz);
    if (len < 1e-4) return true;
    return this.raycast(ax, ay, az, dx / len, dy / len, dz / len, len, true) === null;
  }
}

function rayBox(c: BoxCollider, ox: number, oy: number, oz: number, dx: number, dy: number, dz: number, maxT: number): RayHit | null {
  let tmin = 0;
  let tmax = maxT;
  let nx = 0;
  let ny = 0;
  let nz = 0;
  const axes: Array<[number, number, number, number, 0 | 1 | 2]> = [
    [ox, dx, c.minX, c.maxX, 0],
    [oy, dy, c.minY, c.maxY, 1],
    [oz, dz, c.minZ, c.maxZ, 2],
  ];
  for (const [o, d, mn, mx, axis] of axes) {
    if (Math.abs(d) < 1e-9) {
      if (o < mn || o > mx) return null;
      continue;
    }
    let t1 = (mn - o) / d;
    let t2 = (mx - o) / d;
    let sign = -1;
    if (t1 > t2) {
      const tmp = t1;
      t1 = t2;
      t2 = tmp;
      sign = 1;
    }
    if (t1 > tmin) {
      tmin = t1;
      nx = axis === 0 ? sign : 0;
      ny = axis === 1 ? sign : 0;
      nz = axis === 2 ? sign : 0;
    }
    if (t2 < tmax) tmax = t2;
    if (tmin > tmax) return null;
  }
  if (tmin <= 0) return null; // origin inside the box: ignore (camera starts at pivot)
  return { distance: tmin, nx, ny, nz, collider: c };
}

function rayCylinder(
  c: CylinderCollider,
  ox: number,
  oy: number,
  oz: number,
  dx: number,
  dy: number,
  dz: number,
  maxT: number,
): RayHit | null {
  const px = ox - c.x;
  const pz = oz - c.z;
  const a = dx * dx + dz * dz;
  if (a < 1e-9) return null;
  const b = 2 * (px * dx + pz * dz);
  const cc = px * px + pz * pz - c.radius * c.radius;
  const disc = b * b - 4 * a * cc;
  if (disc < 0) return null;
  const t = (-b - Math.sqrt(disc)) / (2 * a);
  if (t <= 0 || t > maxT) return null;
  const y = oy + dy * t;
  if (y < c.minY || y > c.maxY) return null;
  const hx = px + dx * t;
  const hz = pz + dz * t;
  const l = Math.hypot(hx, hz) || 1;
  return { distance: t, nx: hx / l, ny: 0, nz: hz / l, collider: c };
}
