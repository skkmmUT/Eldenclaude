import { describe, expect, it } from 'vitest';
import { levelOf, levelUpCost, maxHpFor, maxStaminaFor, curve, SOFT_CAPS } from '@/rpg/Attributes';
import { PlayerProgress, STARTING_ATTRIBUTES } from '@/rpg/PlayerProgress';

describe('attributes & levelling', () => {
  it('starting class is level 9', () => {
    expect(levelOf(STARTING_ATTRIBUTES)).toBe(9);
  });

  it('HP curve has soft caps (smaller gains per point after each cap)', () => {
    const per = (a: number, b: number) => (curve(SOFT_CAPS.hp, b) - curve(SOFT_CAPS.hp, a)) / (b - a);
    expect(per(10, 25)).toBeGreaterThan(per(25, 40));
    expect(per(25, 40)).toBeGreaterThan(per(40, 60));
    expect(per(40, 60)).toBeGreaterThan(per(60, 99));
    expect(maxHpFor({ ...STARTING_ATTRIBUTES, vitality: 99 })).toBe(1900);
  });

  it('endurance raises stamina', () => {
    expect(maxStaminaFor({ ...STARTING_ATTRIBUTES, endurance: 30 })).toBeGreaterThan(maxStaminaFor(STARTING_ATTRIBUTES));
  });

  it('level-up costs grow and are paid in echoes', () => {
    expect(levelUpCost(20)).toBeGreaterThan(levelUpCost(10));
    const p = new PlayerProgress();
    p.echoes = p.costFor(3) + 10;
    expect(p.levelUp({ vitality: 2, strength: 1 })).toBe(true);
    expect(p.level).toBe(12);
    expect(p.echoes).toBe(10);
    expect(p.levelUp({ vitality: 1 })).toBe(false); // can't afford
    expect(p.levelUp({})).toBe(false);
  });
});
