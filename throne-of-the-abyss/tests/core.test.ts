import { describe, expect, it } from 'vitest';
import { StateMachine } from '@/core/StateMachine';
import { InputBuffer } from '@/input/InputBuffer';
import { EventBus } from '@/core/EventBus';
import { GameTime } from '@/core/Time';
import { angleDelta, wrapAngle, Rng } from '@/core/MathUtils';
import { AnimClip } from '@/animation/AnimationClip';
import { Pose } from '@/animation/Pose';
import { JOINT_INDEX } from '@/animation/Skeleton';
import { SaveSystem, SAVE_VERSION } from '@/save/SaveSystem';
import { ATTACKS } from '@/data/attacks';
import { WEAPONS } from '@/data/weapons';
import { ENEMIES } from '@/data/enemies';
import { SPELLS } from '@/data/spells';

describe('core utilities', () => {
  it('state machine transitions with enter/exit', () => {
    const log: string[] = [];
    const fsm = new StateMachine<object, 'a' | 'b'>({});
    fsm.add({ id: 'a', enter: () => log.push('enter a'), exit: () => log.push('exit a') });
    fsm.add({ id: 'b', enter: (_o, prev) => log.push(`enter b from ${prev}`) });
    fsm.change('a');
    fsm.update(0.5);
    expect(fsm.time).toBe(0.5);
    fsm.change('b');
    expect(log).toEqual(['enter a', 'exit a', 'enter b from a']);
    expect(fsm.is('b')).toBe(true);
    expect(() => fsm.change('c' as 'a')).toThrow();
  });

  it('input buffer keeps the latest intent within the window', () => {
    const b = new InputBuffer(0.3);
    b.push('light', 1.0);
    expect(b.peek(1.2)).toBe('light');
    b.push('dodge', 1.25);
    expect(b.peek(1.3)).toBe('dodge');
    expect(b.consume('light', 1.3)).toBe(false);
    expect(b.consume('dodge', 1.3)).toBe(true);
    b.push('heavy', 2);
    expect(b.peek(2.5)).toBe(null);
  });

  it('event bus subscribe/unsubscribe', () => {
    const bus = new EventBus<{ ping: number }>();
    let sum = 0;
    const off = bus.on('ping', (n) => (sum += n));
    bus.emit('ping', 2);
    off();
    bus.emit('ping', 5);
    expect(sum).toBe(2);
  });

  it('hit-stop slows simulation time', () => {
    const t = new GameTime();
    t.hitStop(0.1);
    const dt = t.advance(1 / 60);
    expect(dt).toBeLessThan(0.001);
    t.advance(0.2);
    expect(t.advance(1 / 60)).toBeCloseTo(1 / 60);
  });

  it('angle helpers wrap correctly', () => {
    expect(Math.abs(wrapAngle(3 * Math.PI))).toBeCloseTo(Math.PI);
    expect(wrapAngle(0.5 + 4 * Math.PI)).toBeCloseTo(0.5);
    expect(angleDelta(Math.PI - 0.1, -Math.PI + 0.1)).toBeCloseTo(0.2);
    const r = new Rng(42);
    const a = r.next();
    expect(new Rng(42).next()).toBe(a);
  });
});

describe('animation sampling', () => {
  it('interpolates keyed poses and clamps non-looping clips', () => {
    const clip = new AnimClip({
      name: 't',
      loop: false,
      keys: [
        { t: 0, pose: { joints: { spine: [0, 0, 0] } }, ease: 'linear' },
        { t: 1, pose: { joints: { spine: [1, 0, 0] } } },
      ],
    });
    const p = new Pose();
    clip.sample(0.5, p);
    const q = p.rot[JOINT_INDEX.spine];
    expect(2 * Math.atan2(q.x, q.w)).toBeCloseTo(0.5, 2);
    clip.sample(5, p);
    expect(2 * Math.atan2(p.rot[JOINT_INDEX.spine].x, p.rot[JOINT_INDEX.spine].w)).toBeCloseTo(1, 3);
  });
});

describe('data integrity', () => {
  it('every moveset and enemy attack references existing attacks', () => {
    for (const w of Object.values(WEAPONS)) for (const id of Object.values(w.moveset)) expect(ATTACKS[id], `${w.id}.${id}`).toBeDefined();
    for (const e of Object.values(ENEMIES)) {
      for (const o of [...e.combat.attacks, ...(e.combat.phase2Attacks ?? [])]) expect(ATTACKS[o.id], o.id).toBeDefined();
    }
    for (const a of Object.values(ATTACKS)) if (a.next) expect(ATTACKS[a.next], a.next).toBeDefined();
  });

  it('attack frame data is sane (startup > 0, combo windows inside the attack)', () => {
    for (const a of Object.values(ATTACKS)) {
      expect(a.startup).toBeGreaterThan(0);
      expect(a.active).toBeGreaterThan(0);
      const total = a.startup + a.active + a.recovery;
      if (a.comboWindow) expect(a.comboWindow[1]).toBeLessThanOrEqual(total + 1e-6);
      expect(a.dodgeCancel).toBeLessThanOrEqual(total + 1e-6);
    }
  });

  it('spells have costs and effects', () => {
    for (const s of Object.values(SPELLS)) {
      expect(s.manaCost).toBeGreaterThan(0);
      expect(s.castTime).toBeGreaterThan(0);
    }
  });

  it('save validation rejects malformed data', () => {
    expect(SaveSystem.validate(null)).toBe(false);
    expect(SaveSystem.validate({ version: 999 })).toBe(false);
    expect(
      SaveSystem.validate({
        version: SAVE_VERSION,
        player: { echoes: 0, attributes: {} },
        inventory: { weapons: [] },
        world: { kindledAltars: [] },
      }),
    ).toBe(true);
  });
});
