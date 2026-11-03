import {
  ATTRIBUTE_DAMAGE_TYPES,
  ATTRIBUTE_IDS,
  GRADE_COEFF,
  SOFT_CAPS,
  curve,
  type AttributeId,
  type Attributes,
  type ScalingGrade,
} from '@/rpg/Attributes';
import {
  DIRECT_DAMAGE_TYPES,
  type Absorptions,
  type BuildupProfile,
  type DamageProfile,
  type DirectDamageType,
} from './DamageTypes';

/** Anything that deals damage: weapons, spells, enemy natural attacks. */
export interface DamageSource {
  base: DamageProfile;
  scaling?: Partial<Record<AttributeId, ScalingGrade>>;
  requirements?: Partial<Record<AttributeId, number>>;
  buildup?: BuildupProfile;
}

export interface OutgoingContext {
  attributes?: Attributes; // undefined → no stat scaling (enemies use flat values)
  motionValue: number; // per-attack multiplier
  buffMultiplier?: number; // e.g. "Death Crown" +15%
  typeBuffs?: Partial<Record<DirectDamageType, number>>; // additive % per type
  critMultiplier?: number; // riposte/backstab
  counterHit?: boolean; // hit during the target's attack
}

export interface DefenseContext {
  defense: Partial<Record<DirectDamageType, number>>;
  absorption: Absorptions;
  damageTakenMultiplier?: number; // debuffs on the defender
  guardAbsorption?: Absorptions; // set when the hit was blocked
}

export interface DamageResult {
  perType: DamageProfile;
  total: number;
  buildup: BuildupProfile;
  blocked: boolean;
  critical: boolean;
}

/** Fraction of a weapon's scaling bonus realised at a given attribute value (soft caps). */
export const attributeSaturation = (value: number): number => curve(SOFT_CAPS.scaling, value);

/** Attack rating (before defenses) per damage type for a source + attributes. */
export function attackRating(src: DamageSource, attributes?: Attributes): DamageProfile {
  const out: DamageProfile = {};
  let unmetPenalty = 1;
  if (attributes && src.requirements) {
    for (const id of ATTRIBUTE_IDS) {
      const req = src.requirements[id];
      if (req !== undefined && attributes[id] < req) unmetPenalty = 0.6;
    }
  }
  for (const type of DIRECT_DAMAGE_TYPES) {
    const base = src.base[type] ?? 0;
    if (base <= 0) continue;
    let bonus = 0;
    if (attributes && src.scaling && unmetPenalty === 1) {
      for (const id of ATTRIBUTE_IDS) {
        const grade = src.scaling[id];
        if (!grade || !ATTRIBUTE_DAMAGE_TYPES[id].includes(type)) continue;
        bonus += base * GRADE_COEFF[grade] * attributeSaturation(attributes[id]);
      }
    }
    out[type] = (base + bonus) * unmetPenalty;
  }
  return out;
}

/** Diminishing-returns defense: high damage pierces defense, chip damage is mostly stopped. */
export function applyDefense(raw: number, defense: number): number {
  if (raw <= 0) return 0;
  const reduced = (raw * raw) / (raw + Math.max(0, defense));
  return Math.max(raw * 0.1, reduced);
}

/** Full pipeline: rating → motion value → buffs → defense → absorption → crit → debuffs. */
export function computeDamage(src: DamageSource, out: OutgoingContext, def: DefenseContext): DamageResult {
  const rating = attackRating(src, out.attributes);
  const perType: DamageProfile = {};
  let total = 0;
  const crit = out.critMultiplier ?? 1;
  const counter = out.counterHit ? 1.15 : 1;
  for (const type of DIRECT_DAMAGE_TYPES) {
    const r = rating[type] ?? 0;
    if (r <= 0) continue;
    const typeBuff = 1 + (out.typeBuffs?.[type] ?? 0);
    let dmg = r * out.motionValue * (out.buffMultiplier ?? 1) * typeBuff;
    dmg = applyDefense(dmg, def.defense[type] ?? 0);
    dmg *= 1 - Math.min(0.95, def.absorption[type] ?? 0);
    if (def.guardAbsorption) dmg *= 1 - Math.min(1, def.guardAbsorption[type] ?? 0);
    dmg *= crit * counter * (def.damageTakenMultiplier ?? 1);
    perType[type] = dmg;
    total += dmg;
  }
  const buildup: BuildupProfile = {};
  if (src.buildup) {
    const arcBonus = out.attributes ? 1 + attributeSaturation(out.attributes.arcane) * 0.6 : 1;
    for (const k of ['poison', 'bleed'] as const) {
      const v = src.buildup[k];
      if (v) buildup[k] = v * arcBonus * (def.guardAbsorption ? 0.3 : 1);
    }
  }
  return { perType, total: Math.round(total), buildup, blocked: !!def.guardAbsorption, critical: crit > 1 };
}
