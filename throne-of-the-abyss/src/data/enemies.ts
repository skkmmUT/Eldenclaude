import type { HumanoidAppearance } from '@/characters/HumanoidRig';
import type { Absorptions, DirectDamageType, StatusResistances } from '@/combat/DamageTypes';
import { APPEARANCES } from './appearances';
import { WEAPONS } from './weapons';
import type { WeaponData } from '@/items/ItemTypes';

export interface EnemyAttackOption {
  id: string;
  minRange: number;
  maxRange: number;
  weight: number;
  cooldown: number;
  /** Probability to continue into the attack's `next` chain. */
  chainChance: number;
}

/** Data asset for an enemy archetype. Behaviour parameters are tuned here, not in code. */
export interface EnemyData {
  id: string;
  name: string;
  title?: string;
  appearance: HumanoidAppearance;
  stance: 'revenant' | 'knight';
  weapon: WeaponData;
  shield: boolean;
  maxHp: number;
  maxPoise: number;
  maxStamina: number;
  defense: Partial<Record<DirectDamageType, number>>;
  /** Positive = resistance, negative = weakness. */
  absorption: Absorptions;
  statusResist: StatusResistances;
  echoes: number;
  perception: { sightRange: number; fovDeg: number; hearing: number; proximity: number };
  movement: { walk: number; run: number; strafe: number; turnRate: number };
  combat: {
    attacks: EnemyAttackOption[];
    phase2Attacks?: EnemyAttackOption[];
    preferredRange: [number, number];
    aggression: number; // 0..1, how often it commits when holding a token
    blockChance: number;
    dodgeChance: number;
    retreatHpFraction: number;
    tokenCost: number;
  };
  elite: boolean;
  respawns: boolean;
  /** Items granted when a non-respawning foe falls. */
  drops?: import('@/items/Grants').ItemGrant[];
  /** HUD bar flavour line for elites/bosses. */
  bossTitle?: string;
}

export const ENEMIES: Record<string, EnemyData> = {
  ashen_revenant: {
    id: 'ashen_revenant',
    name: 'Ashen Revenant',
    appearance: APPEARANCES.revenant,
    stance: 'revenant',
    weapon: WEAPONS.revenant_rustblade,
    shield: true,
    maxHp: 420,
    maxPoise: 22,
    maxStamina: 90,
    defense: { physical: 70, fire: 50, ice: 60, lightning: 60, holy: 40, dark: 80, arcane: 60 },
    // Undead: weak to holy and fire, resistant to dark.
    absorption: { physical: 0.1, fire: -0.2, holy: -0.35, dark: 0.3 },
    statusResist: { poison: 999, bleed: 120 },
    echoes: 185,
    perception: { sightRange: 17, fovDeg: 120, hearing: 1, proximity: 2.6 },
    movement: { walk: 1.35, run: 3.9, strafe: 1.5, turnRate: 5 },
    combat: {
      attacks: [
        { id: 'rev_slash', minRange: 0, maxRange: 2.4, weight: 3, cooldown: 1.2, chainChance: 0.55 },
        { id: 'rev_thrust', minRange: 2.4, maxRange: 5.2, weight: 2, cooldown: 3.5, chainChance: 0 },
        { id: 'rev_overhead', minRange: 0, maxRange: 2.6, weight: 1.5, cooldown: 4, chainChance: 0 },
        { id: 'rev_bash', minRange: 0, maxRange: 1.7, weight: 1, cooldown: 5, chainChance: 0 },
      ],
      preferredRange: [2.6, 4.2],
      aggression: 0.65,
      blockChance: 0.45,
      dodgeChance: 0.2,
      retreatHpFraction: 0.3,
      tokenCost: 1,
    },
    elite: false,
    respawns: true,
  },
  gravebound_knight: {
    id: 'gravebound_knight',
    name: 'Vaelor, the Gravebound',
    title: 'Oathkeeper of the Ashen Gate',
    appearance: APPEARANCES.gravebound,
    stance: 'knight',
    weapon: WEAPONS.gravebound_greatsword,
    shield: false,
    maxHp: 2600,
    maxPoise: 140,
    maxStamina: 200,
    defense: { physical: 110, fire: 90, ice: 100, lightning: 70, holy: 80, dark: 120, arcane: 90 },
    // Lightning finds the seams of the heavy plate; dark barely touches an oath-bound soul.
    absorption: { physical: 0.2, lightning: -0.25, holy: -0.15, dark: 0.4, fire: 0.1 },
    statusResist: { poison: 400, bleed: 300 },
    echoes: 2400,
    perception: { sightRange: 22, fovDeg: 140, hearing: 1.2, proximity: 4 },
    movement: { walk: 1.6, run: 4.4, strafe: 1.9, turnRate: 3.8 },
    combat: {
      attacks: [
        { id: 'gk_sweep', minRange: 0, maxRange: 3.6, weight: 3, cooldown: 2.4, chainChance: 0.5 },
        { id: 'gk_overhead', minRange: 0, maxRange: 3.4, weight: 2, cooldown: 3, chainChance: 0 },
        { id: 'gk_thrust', minRange: 3.2, maxRange: 7.5, weight: 2, cooldown: 5, chainChance: 0 },
        { id: 'gk_leap', minRange: 5.5, maxRange: 11, weight: 2.5, cooldown: 8, chainChance: 0 },
      ],
      phase2Attacks: [
        { id: 'gk_sweep', minRange: 0, maxRange: 3.6, weight: 2, cooldown: 2, chainChance: 0.7 },
        { id: 'gk_p2_delay', minRange: 0, maxRange: 3.6, weight: 3, cooldown: 4, chainChance: 0.8 },
        { id: 'gk_thrust', minRange: 3.2, maxRange: 7.5, weight: 2, cooldown: 4, chainChance: 0 },
        { id: 'gk_leap', minRange: 5, maxRange: 12, weight: 3, cooldown: 6, chainChance: 0 },
      ],
      preferredRange: [3.2, 5.5],
      aggression: 0.8,
      blockChance: 0,
      dodgeChance: 0.12,
      retreatHpFraction: 0,
      tokenCost: 2,
    },
    elite: true,
    respawns: false,
    drops: [
      { type: 'armor', id: 'gravebound_helm' },
      { type: 'armor', id: 'gravebound_plate' },
      { type: 'accessory', id: 'gravebound_signet' },
    ],
    bossTitle: 'Oathkeeper of the Ashen Gate',
  },
};
