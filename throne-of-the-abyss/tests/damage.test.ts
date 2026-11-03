import { describe, expect, it } from 'vitest';
import { applyDefense, attackRating, attributeSaturation, computeDamage } from '@/combat/DamageCalculator';
import { totalDamage } from '@/combat/DamageTypes';
import { STARTING_ATTRIBUTES } from '@/rpg/PlayerProgress';
import { WEAPONS } from '@/data/weapons';

const sword = WEAPONS.heirs_longsword;

describe('damage pipeline', () => {
  it('scales attack rating with attributes (soft-capped)', () => {
    const low = totalDamage(attackRating(sword, { ...STARTING_ATTRIBUTES, dexterity: 10, strength: 10 }));
    const mid = totalDamage(attackRating(sword, { ...STARTING_ATTRIBUTES, dexterity: 40, strength: 20 }));
    const high = totalDamage(attackRating(sword, { ...STARTING_ATTRIBUTES, dexterity: 80, strength: 20 }));
    expect(mid).toBeGreaterThan(low);
    expect(high).toBeGreaterThan(mid);
    // Diminishing returns: the 40→80 DEX gain is smaller per point than 10→40.
    expect((high - mid) / 40).toBeLessThan((mid - low) / 30);
  });

  it('saturation curve respects soft caps', () => {
    expect(attributeSaturation(1)).toBe(0);
    expect(attributeSaturation(18)).toBeCloseTo(0.25);
    expect(attributeSaturation(60)).toBeCloseTo(0.75);
    expect(attributeSaturation(99)).toBe(1);
    expect(attributeSaturation(150)).toBe(1);
  });

  it('penalises unmet requirements', () => {
    const gs = WEAPONS.gravecleaver;
    const weak = totalDamage(attackRating(gs, { ...STARTING_ATTRIBUTES, strength: 8 }));
    const ok = totalDamage(attackRating(gs, { ...STARTING_ATTRIBUTES, strength: 16 }));
    expect(weak).toBeLessThan(ok * 0.7);
  });

  it('defense has diminishing effect and never fully negates', () => {
    expect(applyDefense(100, 0)).toBe(100);
    expect(applyDefense(100, 100)).toBeCloseTo(50);
    expect(applyDefense(10, 1000)).toBeCloseTo(1); // floor of 10%
    expect(applyDefense(0, 50)).toBe(0);
  });

  it('applies weakness, resistance, crit, counter-hit and guard', () => {
    const src = { base: { holy: 100, physical: 100 } };
    const base = computeDamage(src, { motionValue: 1 }, { defense: {}, absorption: {} }).total;
    const weakHoly = computeDamage(src, { motionValue: 1 }, { defense: {}, absorption: { holy: -0.5 } }).total;
    const resistPhys = computeDamage(src, { motionValue: 1 }, { defense: {}, absorption: { physical: 0.5 } }).total;
    const crit = computeDamage(src, { motionValue: 1, critMultiplier: 2 }, { defense: {}, absorption: {} });
    const counter = computeDamage(src, { motionValue: 1, counterHit: true }, { defense: {}, absorption: {} }).total;
    const guarded = computeDamage(src, { motionValue: 1 }, { defense: {}, absorption: {}, guardAbsorption: { physical: 1, holy: 0.5 } });
    expect(weakHoly).toBe(250);
    expect(resistPhys).toBe(150);
    expect(crit.total).toBe(base * 2);
    expect(crit.critical).toBe(true);
    expect(counter).toBe(230);
    expect(guarded.blocked).toBe(true);
    expect(guarded.total).toBe(50);
  });

  it('accumulates status build-up (reduced when blocked)', () => {
    const src = { base: { physical: 50 }, buildup: { bleed: 20 } };
    const open = computeDamage(src, { motionValue: 1 }, { defense: {}, absorption: {} });
    const blocked = computeDamage(src, { motionValue: 1 }, { defense: {}, absorption: {}, guardAbsorption: { physical: 0.9 } });
    expect(open.buildup.bleed).toBe(20);
    expect(blocked.buildup.bleed).toBeCloseTo(6);
  });
});
