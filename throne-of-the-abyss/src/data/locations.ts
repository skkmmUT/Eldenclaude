import { WORLD, riverZ, roadX } from '@/world/terrain/WorldLayout';

/** Named places of the open world: discovered on first visit, shown on the maps. */
export interface LocationDef {
  id: string;
  name: string;
  x: number;
  z: number;
  /** Discovery radius (metres). */
  r: number;
  kind: 'castle' | 'landmark' | 'nature' | 'water';
}

let bx = 0;
for (let i = 0; i < 4; i++) bx = roadX(riverZ(bx));

export const LOCATIONS: LocationDef[] = [
  { id: 'loc_courtyard', name: 'Ashen Gate Courtyard', x: 0, z: 0, r: 40, kind: 'castle' },
  { id: 'loc_throne_hall', name: 'Throne Hall', x: 0, z: 86, r: 16, kind: 'castle' },
  { id: 'loc_crossing', name: 'Ashen River Crossing', x: bx, z: riverZ(bx), r: 30, kind: 'landmark' },
  { id: 'loc_ford', name: 'Eastern Ford Bridge', x: WORLD.bridges[1].x, z: riverZ(WORLD.bridges[1].x), r: 24, kind: 'landmark' },
  { id: 'loc_fields', name: 'Golden Fields', x: WORLD.fields[0].x, z: WORLD.fields[0].z, r: 55, kind: 'nature' },
  { id: 'loc_west_fields', name: 'Harvest Terraces', x: WORLD.fields[1].x, z: WORLD.fields[1].z, r: 45, kind: 'nature' },
  { id: 'loc_keep', name: 'The Fallen Keep', x: WORLD.fortress.x, z: WORLD.fortress.z, r: 45, kind: 'landmark' },
  { id: 'loc_elder_bough', name: 'Roots of the Elder Bough', x: WORLD.giantTree.x, z: WORLD.giantTree.z, r: 50, kind: 'landmark' },
  { id: 'loc_mirror_lake', name: 'Mirror Lake', x: WORLD.lakes[0].x, z: WORLD.lakes[0].z, r: WORLD.lakes[0].r + 20, kind: 'water' },
  { id: 'loc_stillwater', name: 'Stillwater', x: WORLD.lakes[1].x, z: WORLD.lakes[1].z, r: WORLD.lakes[1].r + 20, kind: 'water' },
  { id: 'loc_heron_pool', name: 'Heron Pool', x: WORLD.lakes[2].x, z: WORLD.lakes[2].z, r: WORLD.lakes[2].r + 18, kind: 'water' },
  { id: 'loc_whispering_wood', name: 'Whispering Wood', x: WORLD.forests[0].x, z: WORLD.forests[0].z, r: 80, kind: 'nature' },
  { id: 'loc_ashwood', name: 'Ashwood', x: WORLD.forests[1].x, z: WORLD.forests[1].z, r: 60, kind: 'nature' },
  { id: 'loc_greywood', name: 'Greywood Thicket', x: WORLD.forests[2].x, z: WORLD.forests[2].z, r: 70, kind: 'nature' },
  { id: 'loc_petals', name: 'Valley of Petals', x: WORLD.flowerValleys[2].x, z: WORLD.flowerValleys[2].z, r: 40, kind: 'nature' },
  { id: 'loc_blossom', name: 'Blossom Hollow', x: WORLD.flowerValleys[0].x, z: WORLD.flowerValleys[0].z, r: 45, kind: 'nature' },
  { id: 'loc_watchtower', name: 'Riverside Watchtower', x: -60, z: riverZ(-60) + 20, r: 22, kind: 'landmark' },
  { id: 'loc_north_wall', name: 'The Northern Wall', x: -40, z: 120, r: 30, kind: 'landmark' },
  { id: 'loc_field_arch', name: 'Arch of the Harvest', x: 70, z: -228, r: 20, kind: 'landmark' },
  { id: 'loc_west_arch', name: 'Pilgrim Arch', x: -118, z: -120, r: 20, kind: 'landmark' },
];

/** Exploration grid for the map's fog of war. */
export const EXPLORE_CELL = 20;
export const EXPLORE_N = Math.ceil(WORLD.size / EXPLORE_CELL);
