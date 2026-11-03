import { BufferAttribute, BufferGeometry, Matrix4, Mesh, Vector3, type Material, type Object3D } from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

interface Entry {
  geo: BufferGeometry;
  mat: Material;
  cast: boolean;
  receive: boolean;
  cell: string;
}

/**
 * Collects static level geometry and merges it per (material, shadow flags, spatial cell).
 * Hundreds of primitives become a few dozen draw calls while keeping per-cell frustum
 * culling — the WebGL stand-in for Nanite/HLOD style batching.
 */
export class StaticBatcher {
  private entries: Entry[] = [];
  constructor(private readonly cellSize = 36) {}

  /**
   * @param worldUV  if > 0, replace UVs with world-space planar projection (texels per
   *                 metre = worldUV) so tiling textures have uniform density everywhere.
   */
  add(geo: BufferGeometry, mat: Material, matrix: Matrix4, cast = true, receive = true, worldUV = 0): void {
    const g = (geo.index ? geo.toNonIndexed() : geo.clone()).applyMatrix4(matrix);
    for (const name of Object.keys(g.attributes)) {
      if (name !== 'position' && name !== 'normal' && name !== 'uv') g.deleteAttribute(name);
    }
    if (worldUV > 0 && g.attributes.normal) {
      const pos = g.attributes.position;
      const nor = g.attributes.normal;
      const uv = new Float32Array(pos.count * 2);
      for (let i = 0; i < pos.count; i++) {
        const nx = Math.abs(nor.getX(i));
        const ny = Math.abs(nor.getY(i));
        const nz = Math.abs(nor.getZ(i));
        let u: number;
        let v: number;
        if (ny >= nx && ny >= nz) {
          u = pos.getX(i);
          v = pos.getZ(i);
        } else if (nx >= nz) {
          u = pos.getZ(i);
          v = pos.getY(i);
        } else {
          u = pos.getX(i);
          v = pos.getY(i);
        }
        uv[i * 2] = u * worldUV;
        uv[i * 2 + 1] = v * worldUV;
      }
      g.setAttribute('uv', new BufferAttribute(uv, 2));
    }
    if (!g.attributes.uv) {
      const count = g.attributes.position.count;
      const uv = new Float32Array(count * 2);
      g.setAttribute('uv', new BufferAttribute(uv, 2));
    }
    g.computeBoundingBox();
    const c = g.boundingBox!.getCenter(new Vector3());
    const cell = `${Math.floor(c.x / this.cellSize)},${Math.floor(c.z / this.cellSize)}`;
    this.entries.push({ geo: g, mat, cast, receive, cell });
  }

  build(parent: Object3D): Mesh[] {
    const groups = new Map<string, Entry[]>();
    for (const e of this.entries) {
      const key = `${e.mat.uuid}|${e.cast}|${e.receive}|${e.cell}`;
      const arr = groups.get(key) ?? [];
      arr.push(e);
      groups.set(key, arr);
    }
    const meshes: Mesh[] = [];
    for (const list of groups.values()) {
      const merged = mergeGeometries(
        list.map((e) => e.geo),
        false,
      );
      if (!merged) continue;
      merged.computeBoundingSphere();
      const mesh = new Mesh(merged, list[0].mat);
      mesh.castShadow = list[0].cast;
      mesh.receiveShadow = list[0].receive;
      mesh.matrixAutoUpdate = false;
      mesh.updateMatrix();
      parent.add(mesh);
      meshes.push(mesh);
    }
    for (const e of this.entries) e.geo.dispose();
    this.entries = [];
    return meshes;
  }

  get pending(): number {
    return this.entries.length;
  }
}
