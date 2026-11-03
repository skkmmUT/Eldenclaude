import { describe, expect, it } from 'vitest';
import { Vector3 } from 'three';
import { CollisionWorld } from '@/physics/CollisionWorld';
import { CharacterMotor } from '@/physics/CharacterMotor';
import { segmentSegmentDistance } from '@/combat/CombatSystem';

function arena(): CollisionWorld {
  const w = new CollisionWorld();
  w.addBox(-20, -1, -20, 20, 0, 20); // floor
  w.addBox(5, 0, -5, 6, 4, 5); // wall
  w.addCylinder(-5, 0, 1, 0, 6); // pillar
  w.addBox(-2, 0, 8, 2, 0.35, 10); // low step
  w.addBox(-2, 0, 12, 2, 2.0, 14); // high ledge
  return w;
}

describe('collision world', () => {
  it('finds ground height and walkable tops', () => {
    const w = arena();
    expect(w.groundHeight(0, 0, 0.2, 1)).toBe(0);
    expect(w.groundHeight(0, 9, 0.2, 1)).toBe(0.35);
    expect(w.groundHeight(0, 13, 0.2, 1)).toBe(0); // ledge top above maxY ignored
    expect(w.groundHeight(0, 13, 0.2, 3)).toBe(2);
    expect(w.groundHeight(100, 100, 0.2, 3)).toBe(-Infinity);
  });

  it('pushes circles out of boxes and cylinders', () => {
    const w = arena();
    const p = { x: 4.8, z: 0 };
    expect(w.resolveCircle(p, 0.4, 0.5, 1.8)).toBe(true);
    expect(p.x).toBeCloseTo(4.6);
    const q = { x: -5, z: 1.2 };
    w.resolveCircle(q, 0.4, 0.5, 1.8);
    expect(Math.hypot(q.x + 5, q.z)).toBeCloseTo(1.4);
  });

  it('ray casts and line of sight', () => {
    const w = arena();
    const hit = w.raycast(0, 1, 0, 1, 0, 0, 20);
    expect(hit?.distance).toBeCloseTo(5);
    expect(hit?.nx).toBe(-1);
    expect(w.lineOfSight(0, 1, 0, 10, 1, 0)).toBe(false);
    expect(w.lineOfSight(0, 1, 0, 0, 1, -10)).toBe(true);
    const cyl = w.raycast(0, 1, 0, -1, 0, 0, 20);
    expect(cyl?.distance).toBeCloseTo(4);
  });
});

describe('character motor', () => {
  it('walks up a step, is blocked by a wall, falls and lands', () => {
    const w = arena();
    const m = new CharacterMotor(w, 0.36, 1.8, 0.42);
    m.teleport(0, 0, 6);
    m.desiredVelocity.set(0, 0, 3);
    for (let i = 0; i < 40; i++) m.update(1 / 60);
    expect(m.position.y).toBeCloseTo(0.35); // stepped up
    m.teleport(0, 0, 11);
    m.desiredVelocity.set(0, 0, 3);
    for (let i = 0; i < 60; i++) m.update(1 / 60);
    expect(m.position.z).toBeLessThan(12 - 0.3); // ledge is a wall, not a step
    m.teleport(0, 2, 13);
    m.desiredVelocity.set(0, 0, 3);
    let landed = false;
    for (let i = 0; i < 60; i++) {
      m.update(1 / 60);
      if (m.justLanded) landed = true;
    }
    expect(landed).toBe(true);
    expect(m.position.y).toBe(0);
    expect(m.lastFallHeight).toBeCloseTo(2, 0);
  });

  it('jumps with gravity', () => {
    const w = arena();
    const m = new CharacterMotor(w);
    m.teleport(0, 0, 0);
    m.velocity.y = 7.6;
    let peak = 0;
    for (let i = 0; i < 90; i++) {
      m.update(1 / 60);
      peak = Math.max(peak, m.position.y);
    }
    expect(peak).toBeGreaterThan(1.0);
    expect(peak).toBeLessThan(1.3);
    expect(m.grounded).toBe(true);
  });
});

describe('hit geometry', () => {
  it('segment-segment distance', () => {
    const d = segmentSegmentDistance(new Vector3(0, 0, 0), new Vector3(2, 0, 0), new Vector3(1, -1, 1), new Vector3(1, 1, 1));
    expect(d).toBeCloseTo(1);
    const parallel = segmentSegmentDistance(new Vector3(0, 0, 0), new Vector3(1, 0, 0), new Vector3(0, 2, 0), new Vector3(1, 2, 0));
    expect(parallel).toBeCloseTo(2);
    const crossing = segmentSegmentDistance(new Vector3(-1, 0, 0), new Vector3(1, 0, 0), new Vector3(0, -1, 0), new Vector3(0, 1, 0));
    expect(crossing).toBeCloseTo(0);
  });
});

describe('terrain', () => {
  it('stands on a height field and is blocked by slopes that are too steep', () => {
    const w = new CollisionWorld();
    // gentle ramp for x < 10, cliff (rise 3 m per metre) beyond
    w.terrain = { height: (x: number) => (x < 10 ? x * 0.2 : 2 + (x - 10) * 3) };
    const m = new CharacterMotor(w, 0.36, 1.8, 0.42);
    m.teleport(0, 0, 0);
    m.desiredVelocity.set(4, 0, 0);
    for (let i = 0; i < 180; i++) m.update(1 / 60);
    expect(m.position.x).toBeGreaterThan(9.5);
    expect(m.position.x).toBeLessThan(10.4);
    expect(m.position.y).toBeLessThan(3.4);
    const hit = w.raycast(0, 5, 0, 1, 0, 0, 50);
    expect(hit?.distance).toBeGreaterThan(10);
    expect(hit?.distance).toBeLessThan(11.5);
  });
});
