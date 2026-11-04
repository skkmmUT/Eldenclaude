import { describe, expect, it } from 'vitest';
import { attackRating } from '@/combat/DamageCalculator';
import { totalDamage } from '@/combat/DamageTypes';
import { WEAPONS } from '@/data/weapons';
import { SPELLS } from '@/data/spells';
import { ATTACKS } from '@/data/attacks';
import type { Attributes } from '@/rpg/Attributes';

const base: Attributes = { vitality: 20, endurance: 16, strength: 10, dexterity: 10, intelligence: 9, faith: 9, arcane: 9 };
const BUILDS: Record<string, { attrs: Partial<Attributes>; weapon: string; spell?: string }> = {
  strength: { attrs: { strength: 32, dexterity: 12 }, weapon: 'gravel_maul' },
  dexterity: { attrs: { dexterity: 32, strength: 12, arcane: 14 }, weapon: 'crimson_fang' },
  sorcerer: { attrs: { intelligence: 32, arcane: 14 }, weapon: 'athenaeum_grimoire', spell: 'abyssal_bolt' },
  faith: { attrs: { faith: 32, intelligence: 12 }, weapon: 'elder_bough_staff', spell: 'black_flame' },
};

/** Damage of one basic action: the build's light attack, or its signature spell. */
function strike(name: string): number {
  const b = BUILDS[name];
  const a = { ...base, ...b.attrs };
  const w = WEAPONS[b.weapon];
  if (b.spell) {
    const s = SPELLS[b.spell];
    return totalDamage(attackRating(s.damage!, a)) * s.damage!.motionValue * (w.catalyst?.spellMul ?? 1);
  }
  return totalDamage(attackRating(w, a)) * ATTACKS[w.moveset.light].motionValue;
}

describe('build balance', () => {
  it('melee, sorcery and faith builds of equal level deal comparable damage per action', () => {
    const out = Object.fromEntries(Object.keys(BUILDS).map((k) => [k, Math.round(strike(k))]));
    const vals = Object.values(out);
    const ratio = Math.max(...vals) / Math.min(...vals);
    expect(ratio, JSON.stringify(out)).toBeLessThan(2.0);
  });

  it('investing in the scaling attribute raises damage', () => {
    for (const k of Object.keys(BUILDS)) {
      const b = BUILDS[k];
      const hi = strike(k);
      const saved = b.attrs;
      b.attrs = {};
      const lo = strike(k);
      b.attrs = saved;
      expect(hi, k).toBeGreaterThan(lo * 1.15);
    }
  });
});
