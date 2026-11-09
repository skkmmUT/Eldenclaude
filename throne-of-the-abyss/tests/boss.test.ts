import { describe, expect, it } from 'vitest';
import { ENEMIES } from '@/data/enemies';
import { ATTACKS } from '@/data/attacks';
import { WEAPONS } from '@/data/weapons';
import { ACCESSORIES } from '@/data/armor';
import type { AttackData } from '@/combat/AttackData';

/** Shortest i-frame window of a roll (heavy load) — see Player.startDodge. */
const HEAVY_ROLL_IFRAMES = 0.3 - 0.04;

function bossAttacks(id: string, phase: 1 | 2): AttackData[] {
  const e = ENEMIES[id];
  const ids = new Set<string>();
  const add = (a: string) => {
    if (ids.has(a)) return;
    ids.add(a);
    const n = ATTACKS[a].next;
    if (n) add(n);
  };
  const list = phase === 1 ? e.combat.attacks : e.combat.phase2Attacks ?? [];
  for (const o of list) if (!o.special) add(o.id);
  if (e.counter) add(e.counter.attack);
  return [...ids].map((a) => ATTACKS[a]);
}

describe('The Fallen King — fair, readable boss', () => {
  const king = ENEMIES.fallen_king;
  const phases = [
    { attacks: bossAttacks('fallen_king', 1), tempo: 1 },
    { attacks: bossAttacks('fallen_king', 2), tempo: king.phase2!.speed },
  ];
  const attacks = [...new Set([...phases[0].attacks, ...phases[1].attacks])];
  const chained = new Set(attacks.map((a) => a.next).filter(Boolean));

  it('every attack has a readable wind-up, also at phase-two tempo', () => {
    for (const { attacks: list, tempo } of phases) {
      for (const a of list) {
        const min = chained.has(a.id) ? 0.3 : 0.5;
        expect(a.startup, a.id).toBeGreaterThanOrEqual(min);
        // Phase two is faster but never below ~0.8 of the readable minimum.
        expect(a.startup / tempo, a.id).toBeGreaterThanOrEqual(min * 0.82);
      }
    }
  });

  it('every hit window fits inside the shortest roll i-frames (always dodgeable)', () => {
    for (const a of attacks) expect(a.active, a.id).toBeLessThanOrEqual(HEAVY_ROLL_IFRAMES);
  });

  it('area attacks are telegraphed and small enough to run out of', () => {
    for (const { attacks: list, tempo } of phases) {
      for (const a of list) {
        if (!a.shockwave) continue;
        expect(a.telegraph, a.id).toBeTruthy();
        expect(a.shockwave.radius, a.id).toBeLessThanOrEqual(5);
        // Running (~3.8 m/s) from the centre of the zone reaches its edge before impact.
        expect(a.shockwave.radius / 3.8, a.id).toBeLessThan(a.startup / tempo + 0.2);
      }
    }
  });

  it('has two phases, a counter, summons and a unique reward', () => {
    expect(king.combat.phase2Attacks!.some((o) => !king.combat.attacks.some((p) => p.id === o.id))).toBe(true);
    expect(king.counter).toBeDefined();
    expect(king.summon!.count).toBeGreaterThan(0);
    expect(king.drops!.map((d) => d.id)).toEqual(['kings_greatblade', 'kings_seal']);
    expect(WEAPONS.kings_greatblade.art?.kind).toBe('attack');
    expect(ACCESSORIES.kings_seal.slot).toBe('amulet');
  });
});
