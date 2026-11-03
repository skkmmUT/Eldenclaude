import type { DirectDamageType } from '@/combat/DamageTypes';

export const ATTRIBUTE_IDS = ['vitality', 'endurance', 'strength', 'dexterity', 'intelligence', 'faith', 'arcane'] as const;
export type AttributeId = (typeof ATTRIBUTE_IDS)[number];
export type Attributes = Record<AttributeId, number>;

export const ATTRIBUTE_INFO: Record<AttributeId, { short: string; name: string; desc: string }> = {
  vitality: { short: 'VIG', name: 'Vitality', desc: 'Raises maximum health and resistance to poison.' },
  endurance: { short: 'END', name: 'Endurance', desc: 'Raises maximum stamina and stamina recovery.' },
  strength: { short: 'STR', name: 'Strength', desc: 'Physical damage of heavy weapons; physical defense.' },
  dexterity: { short: 'DEX', name: 'Dexterity', desc: 'Physical damage of swift weapons; casting speed.' },
  intelligence: { short: 'INT', name: 'Intelligence', desc: 'Sorcery potency (dark, ice, void); mana.' },
  faith: { short: 'FTH', name: 'Faith', desc: 'Incantation potency (holy, fire, lightning); mana.' },
  arcane: { short: 'ARC', name: 'Arcane', desc: 'Blood & necromancy, bleed/poison build-up, discovery.' },
};

/** Piecewise-linear curve through [input, output] points; flat outside the range. */
export function curve(points: ReadonlyArray<readonly [number, number]>, x: number): number {
  if (x <= points[0][0]) return points[0][1];
  for (let i = 0; i < points.length - 1; i++) {
    const [x0, y0] = points[i];
    const [x1, y1] = points[i + 1];
    if (x <= x1) return y0 + ((y1 - y0) * (x - x0)) / (x1 - x0);
  }
  return points[points.length - 1][1];
}

/**
 * Soft caps: each curve has steep early segments then diminishing returns, so pumping a
 * single stat stops being efficient and hybrid builds stay attractive.
 */
export const SOFT_CAPS = {
  hp: [
    [1, 300],
    [25, 1000],
    [40, 1380],
    [60, 1720],
    [99, 1900],
  ],
  stamina: [
    [1, 80],
    [15, 108],
    [30, 135],
    [50, 158],
    [99, 170],
  ],
  mana: [
    [1, 55],
    [20, 125],
    [40, 190],
    [60, 230],
    [99, 260],
  ],
  /** Attribute → share of a weapon's scaling bonus realised (0..1). */
  scaling: [
    [1, 0],
    [18, 0.25],
    [60, 0.75],
    [80, 0.9],
    [99, 1],
  ],
} as const;

export function maxHpFor(a: Attributes): number {
  return Math.round(curve(SOFT_CAPS.hp, a.vitality));
}
export function maxStaminaFor(a: Attributes): number {
  return Math.round(curve(SOFT_CAPS.stamina, a.endurance));
}
export function maxManaFor(a: Attributes): number {
  return Math.round(curve(SOFT_CAPS.mana, (a.intelligence + a.faith) / 2 + Math.min(a.intelligence, a.faith) * 0.25));
}

export function levelOf(a: Attributes): number {
  // Every class starts at 10 in each stat → level 1 baseline of 70 points.
  let sum = 0;
  for (const id of ATTRIBUTE_IDS) sum += a[id];
  return Math.max(1, sum - 69);
}

/** Echoes required to go from `level` to `level + 1`. */
export function levelUpCost(level: number): number {
  return Math.round(400 + 55 * level + 7 * level * level);
}

/** Defense against each direct type, from level and relevant attributes. */
export function defensesFor(a: Attributes): Record<DirectDamageType, number> {
  const lvl = levelOf(a);
  const base = 40 + lvl * 0.9;
  return {
    physical: base + a.strength * 0.5 + a.vitality * 0.2,
    fire: base + a.faith * 0.35 + a.vitality * 0.3,
    ice: base + a.intelligence * 0.3 + a.endurance * 0.3,
    lightning: base + a.endurance * 0.4,
    holy: base + a.faith * 0.5,
    dark: base + a.intelligence * 0.45,
    arcane: base + a.arcane * 0.5,
  };
}

export function statusResistFor(a: Attributes): { poison: number; bleed: number } {
  return {
    poison: 80 + a.vitality * 2.2,
    bleed: 80 + a.arcane * 2.4 + a.vitality * 0.6,
  };
}

export type ScalingGrade = 'S' | 'A' | 'B' | 'C' | 'D' | 'E';
export const GRADE_COEFF: Record<ScalingGrade, number> = { S: 1.6, A: 1.3, B: 1.0, C: 0.72, D: 0.45, E: 0.22 };

/** Which damage types each attribute amplifies when a weapon/spell scales with it. */
export const ATTRIBUTE_DAMAGE_TYPES: Record<AttributeId, DirectDamageType[]> = {
  vitality: [],
  endurance: [],
  strength: ['physical'],
  dexterity: ['physical', 'lightning'],
  intelligence: ['dark', 'ice', 'arcane'],
  faith: ['holy', 'fire', 'lightning'],
  arcane: ['arcane', 'dark'],
};
