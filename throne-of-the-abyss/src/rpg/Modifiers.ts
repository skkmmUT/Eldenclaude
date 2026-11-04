import { DIRECT_DAMAGE_TYPES, type Absorptions, type DamageProfile, type DirectDamageType } from '@/combat/DamageTypes';

/**
 * Additive/multiplicative stat modifiers contributed by rings, amulets, armour and timed
 * buffs. Everything that changes numbers outside the base attributes goes through here.
 */
export interface Modifiers {
  damageMul: number;
  typeBuffs: Partial<Record<DirectDamageType, number>>;
  spellMul: number;
  poise: number;
  staminaRegenMul: number;
  maxHpMul: number;
  maxStaminaAdd: number;
  maxManaAdd: number;
  absorption: Absorptions;
  healOnKill: number;
  echoGainMul: number;
  critMul: number;
  hpRegen: number; // HP per second
  manaRegen: number; // mana per second
  weaponExtra: DamageProfile; // flat extra damage added to weapon attacks
}

export function emptyModifiers(): Modifiers {
  return {
    damageMul: 1,
    typeBuffs: {},
    spellMul: 1,
    poise: 0,
    staminaRegenMul: 1,
    maxHpMul: 1,
    maxStaminaAdd: 0,
    maxManaAdd: 0,
    absorption: {},
    healOnKill: 0,
    echoGainMul: 1,
    critMul: 1,
    hpRegen: 0,
    manaRegen: 0,
    weaponExtra: {},
  };
}

/** Fold a partial modifier into an accumulator (multipliers multiply, the rest add). */
export function addModifiers(acc: Modifiers, m: Partial<Modifiers>): Modifiers {
  if (m.damageMul) acc.damageMul *= m.damageMul;
  if (m.spellMul) acc.spellMul *= m.spellMul;
  if (m.staminaRegenMul) acc.staminaRegenMul *= m.staminaRegenMul;
  if (m.maxHpMul) acc.maxHpMul *= m.maxHpMul;
  if (m.echoGainMul) acc.echoGainMul *= m.echoGainMul;
  if (m.critMul) acc.critMul *= m.critMul;
  acc.poise += m.poise ?? 0;
  acc.maxStaminaAdd += m.maxStaminaAdd ?? 0;
  acc.maxManaAdd += m.maxManaAdd ?? 0;
  acc.healOnKill += m.healOnKill ?? 0;
  acc.hpRegen += m.hpRegen ?? 0;
  acc.manaRegen += m.manaRegen ?? 0;
  for (const t of DIRECT_DAMAGE_TYPES) {
    if (m.typeBuffs?.[t]) acc.typeBuffs[t] = (acc.typeBuffs[t] ?? 0) + m.typeBuffs[t]!;
    if (m.weaponExtra?.[t]) acc.weaponExtra[t] = (acc.weaponExtra[t] ?? 0) + m.weaponExtra[t]!;
    // Absorptions stack multiplicatively on the damage that gets through.
    if (m.absorption?.[t]) acc.absorption[t] = 1 - (1 - (acc.absorption[t] ?? 0)) * (1 - m.absorption[t]!);
  }
  return acc;
}

/** Combine several absorption sources (armour pieces): 1 − Π(1 − aᵢ). */
export function combineAbsorptions(list: Absorptions[]): Absorptions {
  const out: Absorptions = {};
  for (const t of DIRECT_DAMAGE_TYPES) {
    let through = 1;
    for (const a of list) through *= 1 - (a[t] ?? 0);
    out[t] = 1 - through;
  }
  return out;
}

/** Timed effect (spell buffs, weapon arts). */
export interface Buff {
  id: string;
  name: string;
  color: string;
  duration: number;
  time: number;
  mods: Partial<Modifiers>;
}

export type EquipLoadClass = 'light' | 'medium' | 'heavy' | 'overloaded';

export function maxEquipLoad(endurance: number): number {
  return Math.round(28 + endurance * 1.6 + Math.max(0, endurance - 25) * 0.6);
}

export function equipLoadClass(weight: number, max: number): EquipLoadClass {
  const r = weight / max;
  if (r <= 0.3) return 'light';
  if (r <= 0.7) return 'medium';
  if (r <= 1) return 'heavy';
  return 'overloaded';
}
