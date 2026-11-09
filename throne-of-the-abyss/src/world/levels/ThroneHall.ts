import { AdditiveBlending, ConeGeometry, DoubleSide, Group, Mesh, MeshBasicMaterial, PlaneGeometry, Vector3 } from 'three';
import type { GameContext } from '@/core/GameContext';
import { seg } from '@/render/SmoothGeometry';
import type { EnemySpawn } from '@/characters/enemies/Enemy';
import type { Collider } from '@/physics/CollisionWorld';
import { Fire } from '../Fire';
import { SigilAltar } from '../SigilAltar';
import { archBetween, banner, brazier, gothicPillar, mat4, rbox, rubble, solidBox, stairs, type BuildCtx } from '../Architecture';

/** Mist barrier across the hall entrance while the boss fight is on. */
export interface BossBarrier {
  sealed: boolean;
  setSealed(s: boolean): void;
  update(dt: number): void;
}

export interface ThroneHall {
  kingSpawn: EnemySpawn;
  knightSpawns: EnemySpawn[];
  barrier: BossBarrier;
  altar: SigilAltar;
  fires: Fire[];
  /** Inside the hall proper (past the barrier line). */
  contains(p: Vector3): boolean;
  /** Where summoned knights rise, relative to the king. */
  summonPoints(king: Vector3, facing: number): Vector3[];
  readonly bounds: { minX: number; maxX: number; minZ: number; maxZ: number };
}

/**
 * The Throne Hall behind the Gate of Eternity: a ruined, roofless nave (daylight falls
 * in through the broken vault) with two rows of piers for cover, a raised dais and the
 * Ashen Throne. Floor level matches the cathedral landing.
 */
export function buildThroneHall(b: BuildCtx, ctx: GameContext, Y: number): ThroneHall {
  const { world } = b;
  const m = b.mats;
  const bounds = { minX: -18, maxX: 18, minZ: 67, maxZ: 104 };

  // --- Vestibule (gate → hall) -------------------------------------------------------
  solidBox(b, 0, (Y - 1) / 2, 59, 6, (Y + 1) / 2, 7.5, m.stoneDark, false);
  for (const x of [-6.2, 6.2]) solidBox(b, x, (Y + 13) / 2, 58.5, 0.6, (Y + 15) / 2, 8.1);
  solidBox(b, 0, Y + 14.6, 58.5, 6.8, 0.6, 8.1);
  for (const z of [54, 60]) b.batch.add(rbox(0.5, 9, 0.5), m.stoneDark, mat4(0, Y + 9.5, z), true, true, 0.25);

  // --- Hall shell ---------------------------------------------------------------------
  const H = 20; // wall top
  solidBox(b, 0, (Y - 1) / 2, 85.5, 19, (Y + 1) / 2, 19, m.floor, false);
  b.batch.add(rbox(36.6, 0.12, 37), m.floor, mat4(0, Y + 0.02, 85.5), false, true, 0.22);
  const wallC = (H - 1) / 2;
  const wallH = (H + 1) / 2;
  for (const s of [-1, 1]) {
    solidBox(b, s * 19.2, wallC, 85.5, 0.7, wallH, 19.6);
    solidBox(b, s * 12.2, wallC, 66.6, 6.6, wallH, 0.6);
    // Tall lancet windows and buttress ribs.
    for (let z = 72; z <= 100; z += 7) {
      b.batch.add(rbox(0.12, 8, 1.5), m.window, mat4(s * 18.45, Y + 8, z), false, false);
      b.batch.add(rbox(1.1, H + 1, 1.2), m.stoneDark, mat4(s * 19.9, wallC, z + 3.5), true, true, 0.25);
    }
    // Broken wall crowns.
    for (let z = 69; z < 104; z += 5.5) b.batch.add(rbox(1.5, 1 + ((z * 7) % 3), 2.2), m.stone, mat4(s * 19.2, H + 0.4, z), true, true, 0.25);
  }
  solidBox(b, 0, wallC, 104.8, 19.9, wallH, 0.7);
  solidBox(b, 0, Y + 13, 66.6, 5.6, 5, 0.6); // lintel over the entrance
  // Fallen ribs of the vault lying across the floor.
  b.batch.add(rbox(14, 1.1, 1.3), m.stone, mat4(-9, Y + 0.4, 78, 0.1, 0.5, 0.05), true, true, 0.25);
  // Its collision: a row of short cylinders along the fallen rib.
  for (let k = -6.5; k <= 6.5; k += 1.3) {
    world.addCylinder(-9 + Math.cos(0.5) * k, 78 - Math.sin(0.5) * k, 0.72, Y, Y + 1.05 + k * 0.05);
  }
  rubble(b, 14, 84, 2.5, 10, 77);
  rubble(b, -14, 95, 2.5, 9, 78);

  // --- Piers (cover from leaps and charges) -----------------------------------------
  const pierZ = [73, 81, 89];
  for (const s of [-1, 1]) {
    pierZ.forEach((z, i) => gothicPillar(b, s * 11, z, 15, 0.8, Y, (i === 1 && s < 0) || (i === 2 && s > 0)));
    archBetween(b, new Vector3(s * 11, 0, 73), new Vector3(s * 11, 0, 81), Y + 15.2, 0.9);
  }

  // --- Dais and the Ashen Throne ----------------------------------------------------
  stairs(b, new Vector3(0, Y, 96.5), 0, 1, 2, 0.5, 0.9, 20);
  solidBox(b, 0, Y + 0.5, 101.2, 10, 0.5, 3.4, m.stoneDark, false);
  const daisY = Y + 1;
  solidBox(b, 0, daisY + 0.6, 102.6, 1.4, 0.6, 1.1, m.stoneDark);
  b.batch.add(rbox(2.9, 5.6, 0.7), m.stoneDark, mat4(0, daisY + 2.8, 103.6), true, true, 0.25);
  b.batch.add(rbox(3.1, 0.3, 0.8), m.trim, mat4(0, daisY + 5.7, 103.6), true, false);
  for (const s of [-1, 1]) b.batch.add(rbox(0.4, 1.4, 2.2), m.trim, mat4(s * 1.5, daisY + 1.6, 102.6), true, true);
  for (let i = -2; i <= 2; i++) {
    b.batch.add(new ConeGeometry(0.16, 1.1 - Math.abs(i) * 0.2, seg(10)), m.trim, mat4(i * 0.62, daisY + 6.35 - Math.abs(i) * 0.1, 103.6), true, false);
  }
  for (const x of [-8, 8]) banner(b, x, Y + 15, 104.05, Math.PI, 3, 10);
  for (const s of [-1, 1]) for (const z of [76, 92]) banner(b, s * 18.4, Y + 13, z, s > 0 ? -Math.PI / 2 : Math.PI / 2, 2.4, 7);

  // --- Light: braziers along the nave and beside the throne -------------------------
  const fires: Fire[] = [];
  const brazierSpots: Array<[number, number, number]> = [
    [-15.5, Y, 72], [15.5, Y, 72], [-15.5, Y, 97], [15.5, Y, 97], [-4.5, daisY, 101], [4.5, daisY, 101],
  ];
  for (const [x, y, z] of brazierSpots) {
    const top = brazier(b, x, y, z);
    const f = new Fire(top, 0.75, '#ff6a2a', '#ffd27a', true, ctx.vfx);
    ctx.scene.add(f.group);
    fires.push(f);
  }

  // --- Mist barrier ---------------------------------------------------------------------
  const veilMat = new MeshBasicMaterial({ color: '#ffcf7a', transparent: true, opacity: 0, blending: AdditiveBlending, depthWrite: false, side: DoubleSide });
  const veil = new Group();
  for (let i = 0; i < 3; i++) {
    const plane = new Mesh(new PlaneGeometry(11, 12, 1, 1), veilMat);
    plane.position.set(0, Y + 6, 66.2 + i * 0.25);
    veil.add(plane);
  }
  veil.visible = false;
  ctx.scene.add(veil);
  let veilCollider: Collider | null = null;
  let veilT = 0;
  const barrier: BossBarrier = {
    sealed: false,
    setSealed(sealed: boolean) {
      if (barrier.sealed === sealed) return;
      barrier.sealed = sealed;
      if (sealed) {
        veil.visible = true;
        veilCollider = world.addBox(-5.6, Y, 65.9, 5.6, Y + 12, 66.9);
        ctx.vfx.ring(new Vector3(0, Y, 66.4), 5, '#ffcf7a', 0.8);
      } else if (veilCollider) {
        world.remove(veilCollider);
        veilCollider = null;
      }
    },
    update(dt: number) {
      veilT += dt;
      const target = barrier.sealed ? 0.22 + Math.sin(veilT * 2.3) * 0.05 : 0;
      veilMat.opacity += (target - veilMat.opacity) * Math.min(1, dt * 3);
      veil.visible = veilMat.opacity > 0.01;
      veil.children.forEach((c, i) => (c.position.x = Math.sin(veilT * 0.7 + i * 2) * 0.15));
    },
  };

  // --- Altar that kindles once the king has fallen -----------------------------------
  const altar = new SigilAltar('altar_throne', 'The Ashen Throne', new Vector3(0, daisY, 98.6), Math.PI, ctx.vfx);
  ctx.scene.add(altar.group);
  fires.unshift(altar.fire);

  return {
    kingSpawn: { id: 'boss_fallen_king', type: 'fallen_king', position: new Vector3(0, Y, 91), yaw: Math.PI },
    knightSpawns: [
      { id: 'fk_knight_a', type: 'fallen_knight', position: new Vector3(-6, Y, 86), yaw: Math.PI, dormant: true },
      { id: 'fk_knight_b', type: 'fallen_knight', position: new Vector3(6, Y, 86), yaw: Math.PI, dormant: true },
    ],
    barrier,
    altar,
    fires,
    bounds,
    contains(p: Vector3) {
      return p.x > bounds.minX && p.x < bounds.maxX && p.z > bounds.minZ && p.z < bounds.maxZ && p.y > Y - 1;
    },
    summonPoints(king: Vector3, facing: number) {
      const out: Vector3[] = [];
      for (const s of [-1, 1]) {
        const a = facing + s * 1.9;
        const p = new Vector3(king.x + Math.sin(a) * 3.4, Y, king.z + Math.cos(a) * 3.4);
        p.x = Math.max(bounds.minX + 1.5, Math.min(bounds.maxX - 1.5, p.x));
        p.z = Math.max(bounds.minZ + 1.5, Math.min(bounds.maxZ - 5, p.z));
        out.push(p);
      }
      return out;
    },
  };
}
