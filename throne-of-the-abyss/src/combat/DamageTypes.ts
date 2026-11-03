/**
 * Damage taxonomy. Seven "direct" types deal damage on hit; Poison and Bleed are
 * build-up types: hits accumulate build-up and the effect procs when it exceeds the
 * target's resistance (poison = damage over time, bleed = burst of % max HP).
 */
export const DIRECT_DAMAGE_TYPES = ['physical', 'fire', 'ice', 'lightning', 'holy', 'dark', 'arcane'] as const;
export const BUILDUP_TYPES = ['poison', 'bleed'] as const;

export type DirectDamageType = (typeof DIRECT_DAMAGE_TYPES)[number];
export type BuildupType = (typeof BUILDUP_TYPES)[number];
export type DamageType = DirectDamageType | BuildupType;

export type DamageProfile = Partial<Record<DirectDamageType, number>>;
export type BuildupProfile = Partial<Record<BuildupType, number>>;
/** Absorption per direct type: 0.2 = 20% less damage, -0.3 = weakness (30% more). */
export type Absorptions = Partial<Record<DirectDamageType, number>>;
/** Build-up needed to proc a status effect. */
export type StatusResistances = Record<BuildupType, number>;

export const DAMAGE_COLORS: Record<DamageType, string> = {
  physical: '#e8e2d4',
  fire: '#ff7a2a',
  ice: '#8fd8ff',
  lightning: '#ffe45c',
  holy: '#ffe9a8',
  dark: '#b05cff',
  arcane: '#5cf2d0',
  poison: '#7ccf3a',
  bleed: '#d4102a',
};

export function totalDamage(p: DamageProfile): number {
  let t = 0;
  for (const k of DIRECT_DAMAGE_TYPES) t += p[k] ?? 0;
  return t;
}

/** The type contributing most damage (drives hit VFX colour / sound). */
export function dominantType(p: DamageProfile): DirectDamageType {
  let best: DirectDamageType = 'physical';
  let bestV = -1;
  for (const k of DIRECT_DAMAGE_TYPES) {
    const v = p[k] ?? 0;
    if (v > bestV) {
      bestV = v;
      best = k;
    }
  }
  return best;
}
