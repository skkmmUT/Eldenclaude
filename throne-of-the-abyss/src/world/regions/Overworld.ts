import { BoxGeometry, BufferAttribute, Color, ConeGeometry, Mesh, MeshStandardMaterial, Vector3, type Scene } from 'three';
import { Rng, smoothstep } from '@/core/MathUtils';
import { Noise2D } from '@/core/Noise';
import type { CollisionWorld } from '@/physics/CollisionWorld';
import type { GraphicsProfile } from '@/render/GraphicsSettings';
import { StaticBatcher } from '../StaticBatcher';
import { Terrain } from '../terrain/Terrain';
import { Foliage } from '../terrain/Foliage';
import { WaterSurface } from '../terrain/WaterSurface';
import { WORLD, riverZ, roadX } from '../terrain/WorldLayout';
import { archBetween, archFrameGeometry, curtainWall, gothicPillar, mat4, rubble, solidBox, tower, type BuildCtx } from '../Architecture';

export interface OverworldInstance {
  terrain: Terrain;
  water: WaterSurface;
  foliage: Foliage;
  /** Landmark anchor points (altars, spawns, pickups) resolved on the terrain. */
  anchors: {
    keepAltar: Vector3;
    keepSpawnA: Vector3;
    keepSpawnB: Vector3;
    bridgeGuard: Vector3;
    bridgeNorth: Vector3;
    treeShrine: Vector3;
    treeSpawn: Vector3;
  };
}

/**
 * The open landscape around the castle: terrain, water, vegetation and the outdoor
 * landmarks (stone bridges, the ruined keep, distant castles, mountain backdrop).
 */
export function buildOverworld(scene: Scene, world: CollisionWorld, profile: GraphicsProfile, mats: BuildCtx['mats']): OverworldInstance {
  const terrain = new Terrain();
  scene.add(terrain.mesh);
  world.terrain = terrain;
  world.waterLevel = WORLD.waterLevel;
  world.killY = -30;
  const water = new WaterSurface(scene, profile.waterReflections);
  const foliage = new Foliage(terrain, world, profile.foliageDensity);
  foliage.treeDistance = profile.treeDistance;
  scene.add(foliage.group);

  const batch = new StaticBatcher(64);
  const b: BuildCtx = { batch, world, mats };
  const H = (x: number, z: number) => terrain.height(x, z);

  // ---------------------------------------------------------------------------------
  // Stone bridges over the river
  // ---------------------------------------------------------------------------------
  const bridge = (cx: number, length: number, width: number): Vector3 => {
    const cz = riverZ(cx);
    const north = new Vector3(cx, H(cx, cz + length / 2), cz + length / 2);
    const deckY = 1.7;
    const steps = 9;
    // Arched deck as gentle steps (each ≤ stepHeight) up to the crown and back down.
    for (let i = 0; i <= steps * 2; i++) {
      const f = i / (steps * 2);
      const z0 = cz + length / 2 - f * length;
      const rise = Math.sin(f * Math.PI);
      const top = 0.2 + rise * (deckY - 0.2);
      const segLen = length / (steps * 2) + 0.05;
      solidBox(b, cx, (top - 1.6) / 2, z0, width / 2, (top + 1.6) / 2, segLen / 2, mats.stone, false);
    }
    // Parapets
    for (const side of [-1, 1]) {
      for (let i = 0; i < steps * 2; i++) {
        const f = (i + 0.5) / (steps * 2);
        const z0 = cz + length / 2 - f * length;
        const top = 0.2 + Math.sin(f * Math.PI) * (deckY - 0.2);
        solidBox(b, cx + side * (width / 2 - 0.25), top + 0.5, z0, 0.25, 0.5, length / (steps * 2) / 2 + 0.02, mats.stone, false);
      }
    }
    // Arches and piers under the deck (visual)
    const arches = Math.max(2, Math.round(length / 12));
    for (let i = 0; i < arches; i++) {
      const z0 = cz - length / 2 + ((i + 0.5) / arches) * length;
      batch.add(archFrameGeometry(length / arches + 0.2, 3.2, length / arches - 2.2, 0.0, 1.8, width - 0.4), mats.stone, mat4(cx, -2.0, z0, 0, Math.PI / 2), true, true, 0.25);
    }
    for (let i = 0; i <= arches; i++) {
      const z0 = cz - length / 2 + (i / arches) * length;
      batch.add(new BoxGeometry(width + 1.2, 4.2, 1.6), mats.stoneDark, mat4(cx, -0.9, z0), true, true, 0.25);
    }
    return north;
  };
  // Main road bridge: centre on the road where it meets the river.
  let bx = 0;
  for (let i = 0; i < 4; i++) bx = roadX(riverZ(bx));
  const bridgeNorth = bridge(bx, WORLD.bridges[0].length, 6.5);
  bridge(WORLD.bridges[1].x, WORLD.bridges[1].length, 3.8);

  // ---------------------------------------------------------------------------------
  // The Fallen Keep: ruined fortress on its plateau
  // ---------------------------------------------------------------------------------
  const f = WORLD.fortress;
  const fy = f.height;
  const rng = new Rng(5150);
  const ring = 9;
  for (let i = 0; i < ring; i++) {
    const a0 = (i / ring) * Math.PI * 2;
    const a1 = ((i + 1) / ring) * Math.PI * 2;
    if (i === 6) continue; // breach (entrance faces the castle road)
    const r = f.r - 6;
    const x0 = f.x + Math.cos(a0) * r;
    const z0 = f.z + Math.sin(a0) * r;
    const x1 = f.x + Math.cos(a1) * r;
    const z1 = f.z + Math.sin(a1) * r;
    const hgt = rng.range(2.5, 6.5);
    const len = Math.hypot(x1 - x0, z1 - z0);
    const yaw = Math.atan2(x1 - x0, z1 - z0);
    batch.add(new BoxGeometry(1.6, hgt, len), mats.stone, mat4((x0 + x1) / 2, fy + hgt / 2, (z0 + z1) / 2, 0, yaw), true, true, 0.25);
    // collider approximated by short boxes along the segment
    for (let k = 0; k < 4; k++) {
      const t = (k + 0.5) / 4;
      world.addCylinder(x0 + (x1 - x0) * t, z0 + (z1 - z0) * t, 1.6, fy, fy + hgt);
    }
  }
  tower(b, f.x + 18, f.z + 14, 3.2, 14, 7, fy - 0.5);
  tower(b, f.x - 20, f.z + 10, 3.4, 6, 0, fy - 0.5); // broken tower stump
  rubble(b, f.x - 20, f.z + 15, 4, 18, 61);
  for (let i = 0; i < 4; i++) gothicPillar(b, f.x - 6 + i * 4, f.z - 4, i % 2 ? 7 : 3.5, 0.55, fy, i % 2 === 0);
  archBetween(b, new Vector3(f.x - 2, 0, f.z - 4), new Vector3(f.x + 6, 0, f.z - 4), fy + 7.2, 0.6);
  rubble(b, f.x + 4, f.z + 6, 5, 20, 62);
  // keep foundation platform
  solidBox(b, f.x + 2, fy + 0.25, f.z + 2, 7, 0.25, 6, mats.floor, false);

  // ---------------------------------------------------------------------------------
  // Riverside watchtower ruin and field arches (landmarks)
  // ---------------------------------------------------------------------------------
  const wx = -60;
  const wz = riverZ(wx) + 20;
  tower(b, wx, wz, 3, 9, 0, H(wx, wz) - 0.5);
  rubble(b, wx + 4, wz + 3, 4, 12, 71);
  for (const [ax, az] of [
    [70, -228],
    [-118, -120],
  ] as const) {
    const y = H(ax, az);
    archBetween(b, new Vector3(ax - 4, 0, az), new Vector3(ax + 4, 0, az), y + 4.5, 0.9);
    gothicPillar(b, ax - 4, az, 4.6, 0.6, y - 0.2, false);
    gothicPillar(b, ax + 4, az, 4.6, 0.6, y - 0.2, false);
  }

  // ---------------------------------------------------------------------------------
  // Ancient castles on the mountain spurs (distant, visual only)
  // ---------------------------------------------------------------------------------
  const castle = (x: number, z: number, scale: number) => {
    const y = H(x, z) - 2;
    tower(b, x, z, 5 * scale, 34 * scale, 14 * scale, y, false);
    tower(b, x + 16 * scale, z - 8 * scale, 3.5 * scale, 24 * scale, 10 * scale, y, false);
    tower(b, x - 15 * scale, z + 6 * scale, 3.8 * scale, 27 * scale, 11 * scale, y, false);
    batch.add(new BoxGeometry(30 * scale, 14 * scale, 18 * scale), mats.stone, mat4(x, y + 7 * scale, z), true, true, 0.25);
    batch.add(new ConeGeometry(17 * scale, 9 * scale, 4), mats.roof, mat4(x, y + 18.5 * scale, z, 0, Math.PI / 4, 0, 1, 1, 0.65), true, false);
  };
  castle(-300, 395, 1.3);
  castle(405, -250, 1.1);
  castle(330, 360, 0.9);

  // Curtain wall stretch with a gate on the northern road (visual landmark).
  curtainWall(b, -60, 120, -20, 120, 7, 2, H(-40, 120) - 0.3);

  batch.build(scene);

  // ---------------------------------------------------------------------------------
  // Distant mountain range beyond the playable terrain (with snow caps)
  // ---------------------------------------------------------------------------------
  const mountainMat = new MeshStandardMaterial({ vertexColors: true, roughness: 0.95, flatShading: true });
  const n = new Noise2D(404);
  const mrng = new Rng(808);
  for (let i = 0; i < 46; i++) {
    const a = (i / 46) * Math.PI * 2 + mrng.range(-0.04, 0.04);
    const d = mrng.range(640, 860);
    const h = mrng.range(160, 360);
    const geo = new ConeGeometry(mrng.range(140, 230), h, 9, 6);
    const pos = geo.attributes.position;
    const col = new Float32Array(pos.count * 3);
    const c = new Color();
    for (let k = 0; k < pos.count; k++) {
      const y = pos.getY(k) + h / 2;
      const jx = pos.getX(k);
      const jz = pos.getZ(k);
      const nn = n.fbm(jx * 0.01 + i, jz * 0.01, 3);
      if (y > 2 && y < h - 2) pos.setXYZ(k, jx * (0.85 + nn * 0.4), pos.getY(k) + (nn - 0.5) * 30, jz * (0.85 + nn * 0.4));
      const snowLine = 0.62 + (nn - 0.5) * 0.2;
      c.set('#5f5c58').lerp(new Color('#4d6a3c'), smoothstep(0.3, 0.0, y / h) * 0.85);
      c.lerp(new Color('#f4f6fa'), smoothstep(snowLine, snowLine + 0.06, y / h));
      col[k * 3] = c.r;
      col[k * 3 + 1] = c.g;
      col[k * 3 + 2] = c.b;
    }
    geo.setAttribute('color', new BufferAttribute(col, 3));
    geo.computeVertexNormals();
    const m = new Mesh(geo, mountainMat);
    m.position.set(Math.sin(a) * d, h / 2 - 25, Math.cos(a) * d);
    m.rotation.y = mrng.range(0, Math.PI);
    m.matrixAutoUpdate = false;
    m.updateMatrix();
    scene.add(m);
  }

  const at = (x: number, z: number) => new Vector3(x, H(x, z), z);
  const gt = WORLD.giantTree;
  return {
    terrain,
    water,
    foliage,
    anchors: {
      keepAltar: new Vector3(f.x + 2, fy + 0.5, f.z + 2),
      keepSpawnA: new Vector3(f.x - 6, fy, f.z + 6),
      keepSpawnB: new Vector3(f.x + 10, fy, f.z - 8),
      bridgeGuard: at(bx + 1.5, riverZ(bx) - WORLD.bridges[0].length / 2 - 6),
      bridgeNorth: bridgeNorth,
      treeShrine: at(gt.x - 14, gt.z - 6),
      treeSpawn: at(gt.x - 20, gt.z + 12),
    },
  };
}

