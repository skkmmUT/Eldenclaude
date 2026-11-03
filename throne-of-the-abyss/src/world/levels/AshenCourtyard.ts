import {
  BoxGeometry,
  ConeGeometry,
  CylinderGeometry,
  Group,
  Mesh,
  Vector3,
} from 'three';
import type { GameContext } from '@/core/GameContext';
import { Rng } from '@/core/MathUtils';
import { glowMaterial, surfaceMaterial } from '@/render/Materials';
import { HumanoidRig } from '@/characters/HumanoidRig';
import { Pose } from '@/animation/Pose';
import { POSES } from '@/data/poses';
import { APPEARANCES } from '@/data/appearances';
import type { EnemySpawn } from '@/characters/enemies/Enemy';
import { StaticBatcher } from '../StaticBatcher';
import { Atmosphere } from '../Atmosphere';
import { architectureMaterials } from '../Palette';
import { buildOverworld, type OverworldInstance } from '../regions/Overworld';
import { Fire } from '../Fire';
import { SigilAltar } from '../SigilAltar';
import { Chest } from '../Chest';
import { Pickup } from '../Pickup';
import { Breakable } from '../Breakable';
import {
  archBetween,
  archFrameGeometry,
  banner,
  brazier,
  curtainWall,
  deadTree,
  fallenColumn,
  gothicPillar,
  gravestone,
  mat4,
  roseWindow,
  rubble,
  solidBox,
  stairs,
  tower,
  type BuildCtx,
} from '../Architecture';

export interface GateState {
  group: Group;
  open: boolean;
  setOpen(o: boolean): void;
  update(dt: number): void;
}

export interface LevelInstance {
  id: string;
  name: string;
  region: string;
  playerStart: Vector3;
  playerYaw: number;
  altars: SigilAltar[];
  chests: Chest[];
  pickups: Pickup[];
  breakables: Breakable[];
  fires: Fire[];
  enemySpawns: EnemySpawn[];
  atmosphere: Atmosphere;
  overworld: OverworldInstance;
  gate: GateState;
  update(dt: number, cameraPos: Vector3, env: { night: number; wind: number }): void;
  /** Re-apply the light budget when graphics settings change. */
  applyLightBudget(maxLights: number): void;
}

/**
 * Region 1 test arena: the Ashen Gate Courtyard — the shattered forecourt of the Ashen
 * Kingdom's cathedral. Contains: altar checkpoints, a ring of gothic piers around the
 * Fallen King's statue, a graveyard, a raised terrace (plunge-attack ledge), a collapsed
 * west cloister with a chest, a hidden nook (secret), and the cathedral steps guarded by
 * an elite whose defeat unseals the great door.
 */
export function buildAshenCourtyard(ctx: GameContext): LevelInstance {
  const scene = ctx.scene;
  const world = ctx.world;
  const batch = new StaticBatcher(36);
  const mats = architectureMaterials();
  const b: BuildCtx = { batch, world, mats };
  const rng = new Rng(20261103);

  // ---------------------------------------------------------------------------------
  // Ground & enclosure
  // ---------------------------------------------------------------------------------
  batch.add(new BoxGeometry(84, 2, 96), mats.floor, mat4(0, -1, 2), false, true, 0.22);
  world.addBox(-42, -4, -46, 42, 0, 50, { blocksSight: false });

  curtainWall(b, -41, -45, -41, 49, 10); // west
  curtainWall(b, 41, -45, 41, 49, 10); // east
  curtainWall(b, -41, -45, -6, -45, 10); // south-left
  curtainWall(b, 6, -45, 41, -45, 10); // south-right
  curtainWall(b, 26, 49, 41, 49, 10);
  curtainWall(b, -41, 49, -26, 49, 10);
  // South gatehouse (closed portcullis behind the player's waking place)
  batch.add(archFrameGeometry(12, 14, 7, 5, 4, 3), mats.stone, mat4(0, 0, -45), true, true, 0.25);
  // The gate stands open (portcullis raised): the road leads out into the kingdom.
  world.addBox(-6, 0, -46.5, -3.5, 14, -43.5);
  world.addBox(3.5, 0, -46.5, 6, 14, -43.5);
  world.addBox(-6, 8.2, -46.5, 6, 14, -43.5);
  for (let i = -3; i <= 3; i++) batch.add(new BoxGeometry(0.15, 4.5, 0.15), mats.iron, mat4(i * 0.9, 10.6, -43.3), true, false);
  for (let j = 0; j < 3; j++) batch.add(new BoxGeometry(6.6, 0.12, 0.12), mats.iron, mat4(0, 8.8 + j * 1.5, -43.3), true, false);
  tower(b, -41, -45, 4, 20, 10);
  tower(b, 41, -45, 4, 20, 10);
  tower(b, -41, 49, 4.5, 24, 12);
  tower(b, 41, 49, 4.5, 24, 12);

  // ---------------------------------------------------------------------------------
  // Cathedral facade (north) with steps and landing
  // ---------------------------------------------------------------------------------
  const landingY = 2.0;
  stairs(b, new Vector3(0, 0, 33), 0, 1, 5, 0.4, 1.0, 26);
  solidBox(b, 0, landingY / 2, 43, 15, landingY / 2, 5, mats.stoneDark);
  // facade wall with a deep pointed doorway
  batch.add(archFrameGeometry(52, 26, 11, 9, 6.5, 3.5), mats.stone, mat4(0, landingY, 49.5), true, true, 0.25);
  world.addBox(-26, 0, 47.7, -5.5, 30, 51.5);
  world.addBox(5.5, 0, 47.7, 26, 30, 51.5);
  world.addBox(-5.5, landingY + 15.5, 47.7, 5.5, 30, 51.5);
  batch.add(new ConeGeometry(18, 12, 4), mats.stoneDark, mat4(0, landingY + 32, 49.5, 0, Math.PI / 4, 0, 1, 1, 0.2), true, false);
  for (const x of [-12, 12]) batch.add(new ConeGeometry(0.9, 7, 6), mats.stoneDark, mat4(x, landingY + 29.5, 48.2), true, false);
  roseWindow(b, 0, landingY + 18.5, 47.6, 4.2);
  for (const x of [-22, 22]) {
    batch.add(new CylinderGeometry(3.2, 3.6, 36, 8), mats.stone, mat4(x, 18, 49.5), true, true, 0.25);
    batch.add(new CylinderGeometry(3.6, 3.4, 1.2, 8), mats.trim, mat4(x, 36.6, 49.5), false, false);
    batch.add(new ConeGeometry(3.4, 18, 8), mats.stoneDark, mat4(x, 46.2, 49.5), true, false);
    batch.add(new ConeGeometry(0.25, 5, 6), mats.trim, mat4(x, 57, 49.5), false, false);
    for (let k = 0; k < 3; k++) batch.add(new BoxGeometry(0.6, 4, 0.2), mats.glowCrimson, mat4(x, 12 + k * 8, 46.1), false, false);
    world.addCylinder(x, 49.5, 3.6, 0, 40);
  }
  // Sealed great door — two leaves hinged on their outer edges; opens when the elite falls.
  const gateGroup = new Group();
  const doorMat = surfaceMaterial({ color: '#1a1418' });
  const leaves: Group[] = [];
  for (const side of [-1, 1]) {
    const leaf = new Group();
    leaf.position.set(side * 5.2, 0, 0);
    const slab = new Mesh(new BoxGeometry(5.2, 14.5, 0.5), doorMat);
    slab.position.set(-side * 2.6, 7.25, 0);
    slab.castShadow = true;
    leaf.add(slab);
    for (let r = 0; r < 4; r++) {
      const band = new Mesh(new BoxGeometry(5.2, 0.25, 0.6), mats.trim);
      band.position.set(-side * 2.6, 2 + r * 3.4, 0);
      leaf.add(band);
    }
    gateGroup.add(leaf);
    leaves.push(leaf);
  }
  const sealRing = new Mesh(new CylinderGeometry(1.6, 1.6, 0.1, 32), glowMaterial('#ff2a4a', 2.4));
  sealRing.rotation.x = Math.PI / 2;
  sealRing.position.set(0, 7, -0.35);
  gateGroup.add(sealRing);
  gateGroup.position.set(0, landingY, 48.2);
  scene.add(gateGroup);
  const gateCollider = world.addBox(-5.5, landingY, 47.7, 5.5, landingY + 15, 48.8);
  let gateAngle = 0;
  const gate: GateState = {
    group: gateGroup,
    open: false,
    setOpen(o: boolean) {
      if (gate.open === o) return;
      gate.open = o;
      sealRing.visible = !o;
      if (o) world.remove(gateCollider);
    },
    update(dt: number) {
      const target = gate.open ? 1.3 : 0;
      gateAngle += (target - gateAngle) * Math.min(1, dt * 0.8);
      leaves[0].rotation.y = -gateAngle;
      leaves[1].rotation.y = gateAngle;
    },
  };
  // Inner nave stub behind the door (so the opening reads as depth)
  batch.add(new BoxGeometry(10.6, 15, 0.4), surfaceMaterial({ color: '#05030a', rim: 0 }), mat4(0, landingY + 7.5, 60), false, false);
  solidBox(b, 0, landingY / 2, 55, 6, landingY / 2, 6.5, mats.stoneDark, false);
  world.addBox(-6, landingY, 60, 6, 20, 61);
  world.addBox(-6.5, landingY, 50, -5.5, 20, 61);
  world.addBox(5.5, landingY, 50, 6.5, 20, 61);

  // ---------------------------------------------------------------------------------
  // Central ring of piers + the Fallen King's statue
  // ---------------------------------------------------------------------------------
  const ringR = 14;
  const piers: Array<{ p: Vector3; full: boolean }> = [];
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2 + Math.PI / 8;
    const p = new Vector3(Math.sin(a) * ringR, 0, Math.cos(a) * ringR);
    const full = i !== 2 && i !== 5;
    gothicPillar(b, p.x, p.z, full ? 8 : rng.range(2.5, 4.5), 0.75, 0, !full);
    piers.push({ p, full });
  }
  for (let i = 0; i < 8; i++) {
    const a = piers[i];
    const c = piers[(i + 1) % 8];
    if (a.full && c.full) archBetween(b, a.p, c.p, 8.4, 0.9);
  }
  solidBox(b, 0, 0.5, 0, 2.6, 0.5, 2.6, mats.stoneDark);
  batch.add(new BoxGeometry(5.6, 0.2, 5.6), mats.trim, mat4(0, 1.05, 0), false, true);
  solidBox(b, 0, 1.4, 0, 1.9, 0.3, 1.9, mats.stone);
  // The Fallen King: a colossal kneeling statue, head bowed over a planted sword.
  const statue = new HumanoidRig({
    ...APPEARANCES.heir,
    height: 1.85 * 2.3,
    hairStrands: 0,
    cape: false,
    palette: { ...APPEARANCES.heir.palette, eyes: '#ff2a3a' },
  });
  statue.applyPose(Pose.fromDef(POSES.kneelRest));
  statue.root.position.set(0, 1.7, 0.3);
  statue.root.rotation.y = Math.PI;
  statue.root.updateMatrixWorld(true);
  for (const m of statue.meshes) {
    const isGlow = (m.material as { isMeshBasicMaterial?: boolean }).isMeshBasicMaterial;
    batch.add(m.geometry, isGlow ? mats.glowCrimson : mats.statue, m.matrixWorld.clone(), true, true);
  }
  batch.add(new BoxGeometry(0.35, 5.2, 0.08), mats.statue, mat4(0, 3.9, -1.4, 0.12), true, true, 0.25);
  batch.add(new BoxGeometry(1.6, 0.25, 0.25), mats.statue, mat4(0, 6.2, -1.1, 0.12), true, true);
  world.addCylinder(0, 0, 1.6, 1.7, 6.5);
  fallenColumn(b, -7, 6, 0.7, 5, 0.6);
  fallenColumn(b, 8.5, -7.5, -0.4, 4.2, 0.55);
  rubble(b, -6, 7, 3, 14, 11);
  rubble(b, 9, -8, 2.5, 10, 12);
  rubble(b, 11.5, 9.5, 2, 8, 13);

  // ---------------------------------------------------------------------------------
  // Graveyard (south-east)
  // ---------------------------------------------------------------------------------
  for (let gx = 0; gx < 5; gx++) {
    for (let gz = 0; gz < 5; gz++) {
      if (rng.chance(0.2)) continue;
      const x = 17 + gx * 3.6 + rng.range(-0.6, 0.6);
      const z = -27 + gz * 4.2 + rng.range(-0.6, 0.6);
      gravestone(b, x, z, rng.range(-0.25, 0.25), rng);
    }
  }
  deadTree(b, 15, -9, 7, 3);
  deadTree(b, 34, -30, 8.5, 4);
  deadTree(b, -20, -30, 6.5, 5);
  deadTree(b, -16, 26, 7.5, 6);

  // ---------------------------------------------------------------------------------
  // East terrace (raised; stairs on the west side, open ledge for plunge attacks)
  // ---------------------------------------------------------------------------------
  const terraceY = 3.2;
  solidBox(b, 31, terraceY / 2, 16, 9, terraceY / 2, 10, mats.stoneDark);
  batch.add(new BoxGeometry(18.2, 0.15, 20.2), mats.floor, mat4(31, terraceY + 0.01, 16), false, true, 0.22);
  stairs(b, new Vector3(13.6, 0, 10), 1, 0, 8, 0.4, 1.05, 4);
  solidBox(b, 31, terraceY + 0.5, 6.3, 9, 0.5, 0.3, mats.stone);
  solidBox(b, 31, terraceY + 0.5, 25.7, 9, 0.5, 0.3, mats.stone);
  solidBox(b, 22.3, terraceY + 0.5, 14, 0.3, 0.5, 2, mats.stone);
  solidBox(b, 22.3, terraceY + 0.5, 25, 0.3, 0.5, 0.9, mats.stone);
  for (const z of [6.3, 25.7]) for (let x = 23; x <= 39; x += 4) batch.add(new BoxGeometry(0.5, 1.4, 0.5), mats.stoneDark, mat4(x, terraceY + 0.7, z), true, true, 0.25);
  gothicPillar(b, 25, 24, 5, 0.5, terraceY, false);
  gothicPillar(b, 37, 24, 5, 0.5, terraceY, true);

  // ---------------------------------------------------------------------------------
  // West cloister (collapsed colonnade) + chest
  // ---------------------------------------------------------------------------------
  for (let z = -24; z <= 24; z += 6) {
    gothicPillar(b, -30, z, 7, 0.55, 0, z === 0 || z === 12);
    if (z !== 6) gothicPillar(b, -37, z, 7, 0.55, 0, false);
  }
  solidBox(b, -33.5, 7.6, -12, 4.8, 0.4, 13, mats.stoneDark);
  for (let z = -24; z < 0; z += 6) archBetween(b, new Vector3(-30, 0, z), new Vector3(-30, 0, z + 6), 5.2, 0.6);
  batch.add(new BoxGeometry(9, 0.8, 5), mats.stoneDark, mat4(-33, 1.2, 9, 0.35, 0.2, 0.3), true, true, 0.25);
  world.addBox(-37, 0, 7, -29, 2.0, 11.5, { blocksSight: false });
  rubble(b, -33, 14, 3, 16, 21);

  // ---------------------------------------------------------------------------------
  // Hidden nook (secret) between the terrace and the facade
  // ---------------------------------------------------------------------------------
  solidBox(b, 33, 1.5, 36, 7, 1.5, 0.4, mats.stone);
  solidBox(b, 26.4, 1.5, 40.5, 0.4, 1.5, 4.5, mats.stone);
  rubble(b, 37, 42, 2, 8, 31);

  for (const x of [-9, 9]) banner(b, x, landingY + 14, 47.5, 0, 2.4, 7);
  for (const x of [-14, 14]) banner(b, x, 9.5, -43.8, 0, 2.2, 6);
  for (const z of [-20, 0, 20]) banner(b, 39.8, 9, z, -Math.PI / 2, 2, 5.5);

  // ---------------------------------------------------------------------------------
  // Interactables
  // ---------------------------------------------------------------------------------
  const altar = new SigilAltar('altar_ashen_gate', 'Ashen Gate', new Vector3(-5, 0, -31), 0, ctx.vfx);
  scene.add(altar.group);
  world.addCylinder(-5, -31, 1.2, 0, 2.2, { blocksSight: false });
  const altar2 = new SigilAltar('altar_cathedral_steps', 'Cathedral Steps', new Vector3(10.5, landingY, 41), Math.PI, ctx.vfx);
  scene.add(altar2.group);
  world.addCylinder(10.5, 41, 1.2, landingY, landingY + 2.2, { blocksSight: false });

  const chest = new Chest('chest_cloister', new Vector3(-34, 0, 19.5), Math.PI / 2, { weapon: 'gravecleaver' });
  scene.add(chest.group);
  world.addBox(-34.4, 0, 18.9, -33.6, 0.85, 20.1, { blocksSight: false });

  const pickups = [
    new Pickup('lore_proclamation', new Vector3(0, 0, -3.6), { kind: 'lore', loreId: 'torn_proclamation' }, ctx.vfx),
    new Pickup('lore_oath', new Vector3(-7, 0, 33.5), { kind: 'lore', loreId: 'gravebound_oath' }, ctx.vfx),
    new Pickup('secret_seal_fragment', new Vector3(34, 0, 43), { kind: 'lore', loreId: 'seal_fragment' }, ctx.vfx, '#ff6a8a'),
    new Pickup('ichor_shard_terrace', new Vector3(37.5, terraceY, 23.5), { kind: 'flaskUpgrade', id: 'crimson_ichor' }, ctx.vfx, '#ff5a6a'),
    new Pickup('echoes_grave', new Vector3(31, 0, -25), { kind: 'echoes', amount: 400 }, ctx.vfx, '#ffd27a'),
    new Pickup('azure_cloister', new Vector3(-36, 0, -20), { kind: 'consumable', id: 'azure_ichor', amount: 1 }, ctx.vfx, '#6a8aff'),
  ];
  for (const p of pickups) scene.add(p.group);

  const breakables: Breakable[] = [];
  const urnSpots: Array<[number, number]> = [
    [-28.5, -14], [-28.8, -13.2], [-28.2, -12.4], [-35, 2], [-34.3, 2.6],
    [21, -6], [21.7, -5.4], [31.5, 41.5], [32.2, 40.8], [33, 41.9], [-12, 37.5], [-12.7, 38.2],
  ];
  urnSpots.forEach(([x, z], i) => {
    const y = z > 37 && Math.abs(x) < 15 ? landingY : 0;
    const br = new Breakable(`urn_${i}`, new Vector3(x, y, z), world, rng.chance(0.4) ? rng.int(40, 120) : 0, rng.range(0.85, 1.2));
    scene.add(br.group);
    breakables.push(br);
  });

  // Braziers (ordered by lighting priority; the altar flames come first)
  const fires: Fire[] = [altar.fire, altar2.fire];
  const brazierSpots: Array<[number, number, number, string, string]> = [
    [-11, landingY, 39.5, '#ff5a2a', '#ffd27a'],
    [11, landingY, 44.5, '#ff5a2a', '#ffd27a'],
    [-3.6, 0, -3.8, '#ff6a2a', '#ffe0a0'],
    [3.6, 0, -3.8, '#ff6a2a', '#ffe0a0'],
    [30, terraceY, 8.2, '#ff4a2a', '#ffc070'],
    [-31, 0, -5, '#9a4dff', '#ffd9ff'],
    [24, 0, -16, '#ff4a2a', '#ffc070'],
    [5, 0, -38, '#ff6a2a', '#ffe0a0'],
  ];
  for (const [x, y, z, c1, c2] of brazierSpots) {
    const top = brazier(b, x, y, z);
    const f = new Fire(top, 0.7, c1, c2, true, ctx.vfx);
    scene.add(f.group);
    fires.push(f);
  }
  const applyLightBudget = (max: number) => {
    fires.forEach((f, i) => {
      if (f.light) f.light.visible = i < max;
    });
  };
  applyLightBudget(ctx.profile.maxPointLights);

  batch.build(scene);

  // ---------------------------------------------------------------------------------
  // The open kingdom beyond the walls
  // ---------------------------------------------------------------------------------
  const overworld = buildOverworld(scene, world, ctx.profile, mats);
  const A = overworld.anchors;
  const altar3 = new SigilAltar('altar_fallen_keep', 'The Fallen Keep', A.keepAltar.clone(), Math.PI * 0.75, ctx.vfx);
  const altar4 = new SigilAltar('altar_elder_bough', 'Roots of the Elder Bough', A.treeShrine.clone(), Math.PI / 2, ctx.vfx);
  for (const a of [altar3, altar4]) {
    scene.add(a.group);
    world.addCylinder(a.position.x, a.position.z, 1.2, a.position.y, a.position.y + 2.2, { blocksSight: false });
    fires.push(a.fire);
  }
  const worldPickups = [
    new Pickup('lore_elder_bough', A.treeShrine.clone().add(new Vector3(6, 0, 4)), { kind: 'lore', loreId: 'elder_bough' }, ctx.vfx),
    new Pickup('ichor_shard_keep', A.keepAltar.clone().add(new Vector3(-9, -0.4, 7)), { kind: 'flaskUpgrade', id: 'crimson_ichor' }, ctx.vfx, '#ff5a6a'),
    new Pickup('echoes_bridge', A.bridgeNorth.clone().add(new Vector3(5, 0, 3)), { kind: 'echoes', amount: 300 }, ctx.vfx, '#ffd27a'),
  ];
  for (const p of worldPickups) {
    p.position.y = overworld.terrain.height(p.position.x, p.position.z) > p.position.y ? overworld.terrain.height(p.position.x, p.position.z) : p.position.y;
    p.group.position.copy(p.position);
    scene.add(p.group);
    pickups.push(p);
  }
  applyLightBudget(ctx.profile.maxPointLights);
  const atmosphere = new Atmosphere(scene, ctx.profile.particleDensity);
  const altarFires = new Set([altar.fire, altar2.fire, altar3.fire, altar4.fire]);

  // ---------------------------------------------------------------------------------
  // Enemy placement
  // ---------------------------------------------------------------------------------
  const enemySpawns: EnemySpawn[] = [
    { id: 'rev_gate', type: 'ashen_revenant', position: new Vector3(5, 0, -17), yaw: -Math.PI / 2 },
    {
      id: 'rev_ring',
      type: 'ashen_revenant',
      position: new Vector3(-9, 0, -8),
      yaw: Math.PI / 2,
      patrol: [new Vector3(-9, 0, -8), new Vector3(9, 0, -9), new Vector3(10, 0, 9), new Vector3(-9, 0, 9)],
    },
    { id: 'rev_cloister', type: 'ashen_revenant', position: new Vector3(-25, 0, 2), yaw: Math.PI / 2 },
    {
      id: 'rev_terrace',
      type: 'ashen_revenant',
      position: new Vector3(27, terraceY, 11),
      yaw: Math.PI,
      patrol: [new Vector3(27, terraceY, 11), new Vector3(35, terraceY, 21), new Vector3(27, terraceY, 21)],
    },
    { id: 'rev_graves', type: 'ashen_revenant', position: new Vector3(26, 0, -10), yaw: 0 },
    { id: 'elite_vaelor', type: 'gravebound_knight', position: new Vector3(0, landingY, 41.5), yaw: Math.PI },
    {
      id: 'rev_bridge',
      type: 'ashen_revenant',
      position: A.bridgeGuard.clone(),
      yaw: 0,
      patrol: [A.bridgeGuard.clone(), A.bridgeGuard.clone().add(new Vector3(-3, 0, -14))],
    },
    { id: 'rev_keep_a', type: 'ashen_revenant', position: A.keepSpawnA.clone(), yaw: 0.6 },
    { id: 'rev_keep_b', type: 'ashen_revenant', position: A.keepSpawnB.clone(), yaw: -2.2 },
    { id: 'rev_bough', type: 'ashen_revenant', position: A.treeSpawn.clone(), yaw: -1.2 },
  ];
  for (const sp of enemySpawns) for (const p of sp.patrol ?? []) p.y = Math.max(p.y, overworld.terrain.height(p.x, p.z));

  return {
    id: 'ashen_courtyard',
    name: 'Ashen Gate Courtyard',
    region: 'Ashen Kingdom',
    playerStart: new Vector3(0, 0, -37),
    playerYaw: 0,
    altars: [altar, altar2, altar3, altar4],
    chests: [chest],
    pickups,
    breakables,
    fires,
    enemySpawns,
    atmosphere,
    overworld,
    gate,
    applyLightBudget,
    update(dt: number, cameraPos: Vector3, env: { night: number; wind: number }) {
      atmosphere.update(dt, cameraPos, env.night);
      for (const a of [altar, altar2, altar3, altar4]) a.update(dt);
      chest.update(dt);
      for (const p of pickups) p.update(dt);
      for (const f of fires) f.night = env.night;
      for (const f of fires) if (!altarFires.has(f)) f.update(dt);
      gate.update(dt);
      overworld.foliage.update(dt, cameraPos, env.wind);
    },
  };
}
