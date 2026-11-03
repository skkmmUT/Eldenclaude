import { Vector3 } from 'three';
import type { GameContext } from '@/core/GameContext';
import type { Character, AttackInstance } from '@/characters/Character';
import type { AttackData, HitReaction } from './AttackData';
import { computeDamage, type DamageSource } from './DamageCalculator';
import { dominantType, type DamageProfile } from './DamageTypes';

/** Closest distance between segments p1-q1 and p2-q2; writes the closest point on seg 1. */
export function segmentSegmentDistance(
  p1: Vector3,
  q1: Vector3,
  p2: Vector3,
  q2: Vector3,
  outPoint?: Vector3,
): number {
  const d1x = q1.x - p1.x, d1y = q1.y - p1.y, d1z = q1.z - p1.z;
  const d2x = q2.x - p2.x, d2y = q2.y - p2.y, d2z = q2.z - p2.z;
  const rx = p1.x - p2.x, ry = p1.y - p2.y, rz = p1.z - p2.z;
  const a = d1x * d1x + d1y * d1y + d1z * d1z;
  const e = d2x * d2x + d2y * d2y + d2z * d2z;
  const f = d2x * rx + d2y * ry + d2z * rz;
  let s = 0;
  let t = 0;
  if (a <= 1e-9 && e <= 1e-9) {
    s = t = 0;
  } else if (a <= 1e-9) {
    t = Math.min(1, Math.max(0, f / e));
  } else {
    const c = d1x * rx + d1y * ry + d1z * rz;
    if (e <= 1e-9) {
      s = Math.min(1, Math.max(0, -c / a));
    } else {
      const b = d1x * d2x + d1y * d2y + d1z * d2z;
      const denom = a * e - b * b;
      s = denom > 1e-9 ? Math.min(1, Math.max(0, (b * f - c * e) / denom)) : 0;
      t = (b * s + f) / e;
      if (t < 0) {
        t = 0;
        s = Math.min(1, Math.max(0, -c / a));
      } else if (t > 1) {
        t = 1;
        s = Math.min(1, Math.max(0, (b - c) / a));
      }
    }
  }
  const c1x = p1.x + d1x * s, c1y = p1.y + d1y * s, c1z = p1.z + d1z * s;
  const c2x = p2.x + d2x * t, c2y = p2.y + d2y * t, c2z = p2.z + d2z * t;
  if (outPoint) outPoint.set(c1x, c1y, c1z);
  return Math.hypot(c1x - c2x, c1y - c2y, c1z - c2z);
}

export interface ExternalHit {
  source: DamageSource;
  motionValue: number;
  poiseDamage: number;
  reaction: HitReaction;
  parryable: boolean;
  guardDamage: number;
  knockback: number;
  hitStop: number;
  shake: number;
  critMultiplier?: number;
}

/**
 * Resolves every melee swing, shockwave, projectile and critical hit. Owns the
 * swept-capsule hit tests and the block → parry → damage → poise → reaction pipeline.
 */
export class CombatSystem {
  readonly characters: Character[] = [];
  private readonly a = new Vector3();
  private readonly b = new Vector3();
  private readonly lo = new Vector3();
  private readonly hi = new Vector3();
  private readonly point = new Vector3();
  private readonly dir = new Vector3();

  constructor(private readonly ctx: GameContext) {}

  register(c: Character): void {
    if (!this.characters.includes(c)) this.characters.push(c);
  }

  unregister(c: Character): void {
    const i = this.characters.indexOf(c);
    if (i >= 0) this.characters.splice(i, 1);
  }

  begin(c: Character, data: AttackData, chargeMul = 1): AttackInstance {
    const inst: AttackInstance = {
      data,
      time: 0,
      hitTargets: new Set(),
      shockwaveDone: false,
      chargeMul,
      holdActive: false,
      telegraphed: false,
    };
    c.attack = inst;
    c.trail.setColor(data.trail ?? '#d9c9ff');
    return inst;
  }

  /** Called every frame after characters update their attack timers. */
  update(): void {
    for (const c of this.characters) {
      const atk = c.attack;
      if (!atk || c.dead) {
        c.trail.emitting = false;
        continue;
      }
      const d = atk.data;
      const activeStart = d.startup;
      const activeEnd = d.startup + d.active;
      const isActive = (atk.time >= activeStart && atk.time < activeEnd) || atk.holdActive;
      c.trail.emitting = !!d.trail && (isActive || (atk.time >= activeStart - 0.03 && atk.time < activeEnd + 0.04));

      if (d.telegraph && !atk.telegraphed && atk.time >= d.startup - 0.32) {
        atk.telegraphed = true;
        this.ctx.vfx.glint(c.weaponTip, d.telegraph);
      }
      if (!isActive) continue;
      if (d.shockwave && !atk.shockwaveDone && d.kind !== 'plunge' && atk.time >= activeStart) {
        atk.shockwaveDone = true;
        const f = d.shockwave.forward;
        const center = this.a.set(c.position.x + Math.sin(c.facing) * f, c.position.y, c.position.z + Math.cos(c.facing) * f);
        this.shockwave(c, center, d.shockwave.radius, d, d.shockwave.damageScale * atk.chargeMul, atk.hitTargets);
      }
      this.sweep(c, atk);
    }
  }

  private opponents(c: Character): Character[] {
    return this.characters.filter((o) => o !== c && o.faction !== c.faction && !o.dead);
  }

  private sweep(c: Character, atk: AttackInstance): void {
    const steps = 4;
    const wr = c.weaponModel.hitRadius;
    for (const t of this.opponents(c)) {
      if (atk.hitTargets.has(t)) continue;
      const p = t.position;
      // Cheap reject.
      const reach = 4 * c.rig.scale;
      if (Math.abs(p.x - c.position.x) > reach + 1 || Math.abs(p.z - c.position.z) > reach + 1) continue;
      this.lo.set(p.x, p.y + t.hurtRadius, p.z);
      this.hi.set(p.x, p.y + t.hurtHeight - t.hurtRadius, p.z);
      for (let s = 0; s <= steps; s++) {
        const f = s / steps;
        this.a.lerpVectors(c.prevWeaponBase, c.weaponBase, f);
        this.b.lerpVectors(c.prevWeaponTip, c.weaponTip, f);
        const dist = segmentSegmentDistance(this.a, this.b, this.lo, this.hi, this.point);
        if (dist <= wr + t.hurtRadius) {
          this.dir.set(p.x - c.position.x, 0, p.z - c.position.z).normalize();
          this.resolveMelee(c, t, atk, this.point, this.dir);
          break;
        }
      }
    }
  }

  /** Radial area hit (ground slams, plunges, landing shockwaves). */
  shockwave(c: Character, center: Vector3, radius: number, d: AttackData, scale: number, exclude?: Set<Character>): void {
    this.ctx.vfx.shockwave(center, radius, d.trail ?? '#ffb070');
    if (c.faction === 'player' || this.isNearPlayer(center, 10)) this.ctx.camera.shake.add(d.shake * 0.8);
    for (const t of this.opponents(c)) {
      if (exclude?.has(t)) continue;
      const dx = t.position.x - center.x;
      const dz = t.position.z - center.z;
      if (Math.hypot(dx, dz) > radius + t.hurtRadius || Math.abs(t.position.y - center.y) > 1.6) continue;
      exclude?.add(t);
      const dir = new Vector3(dx, 0, dz).normalize();
      const pt = t.centerPoint(new Vector3());
      this.resolve(c, t, {
        source: this.withExtra(c.damageSource(), d.extraDamage),
        motionValue: d.motionValue * scale,
        poiseDamage: d.poiseDamage * Math.max(0.6, scale),
        reaction: d.reaction,
        parryable: false,
        guardDamage: d.guardDamage,
        knockback: d.knockback + 2.5,
        hitStop: d.hitStop,
        shake: d.shake,
      }, pt, dir);
    }
  }

  private isNearPlayer(p: Vector3, r: number): boolean {
    return this.characters.some((c) => c.faction === 'player' && c.position.distanceTo(p) < r);
  }

  private withExtra(src: DamageSource, extra?: DamageProfile): DamageSource {
    if (!extra) return src;
    const base: DamageProfile = { ...src.base };
    for (const [k, v] of Object.entries(extra) as Array<[keyof DamageProfile, number]>) base[k] = (base[k] ?? 0) + v;
    return { ...src, base };
  }

  private resolveMelee(c: Character, t: Character, atk: AttackInstance, point: Vector3, dir: Vector3): void {
    const d = atk.data;
    const outcome = this.resolve(
      c,
      t,
      {
        source: this.withExtra(c.damageSource(), d.extraDamage),
        motionValue: d.motionValue * atk.chargeMul,
        poiseDamage: d.poiseDamage * atk.chargeMul,
        reaction: d.reaction,
        parryable: d.parryable,
        guardDamage: d.guardDamage * atk.chargeMul,
        knockback: d.knockback,
        hitStop: d.hitStop,
        shake: d.shake,
      },
      point,
      dir,
    );
    if (outcome !== 'dodged') atk.hitTargets.add(t);
  }

  /**
   * Core hit pipeline shared by melee, shockwaves, projectiles and spells.
   * Returns what happened so callers (e.g. projectiles) can react.
   */
  resolve(
    attacker: Character | null,
    target: Character,
    h: ExternalHit,
    point: Vector3,
    dir: Vector3,
  ): 'dodged' | 'parried' | 'blocked' | 'guardBreak' | 'hit' | 'killed' {
    if (target.dead) return 'dodged';
    if (target.invulnerable) return 'dodged';
    const from = attacker ? attacker.position : point;
    const facing = target.isFacing(from, 1.25);
    const involvesPlayer = target.faction === 'player' || attacker?.faction === 'player';

    // Parry
    if (target.parrying && h.parryable && facing && attacker) {
      attacker.attack = null;
      attacker.trail.emitting = false;
      attacker.ripostableTimer = 2.3;
      attacker.reactParried(target);
      (target as Character & { parrySucceeded?: boolean }).parrySucceeded = true;
      this.ctx.vfx.parry(point);
      this.ctx.events.emit('parried', { parrier: target, attacker, point: point.clone() });
      this.ctx.time.hitStop(0.14);
      if (involvesPlayer) this.ctx.camera.shake.add(0.35);
      return 'parried';
    }

    const counterHit = !!target.attack && target.attack.time < target.attack.data.startup + target.attack.data.active;
    const guarded = target.guarding && facing;
    const result = computeDamage(
      h.source,
      {
        attributes: attacker?.attributes,
        motionValue: h.motionValue,
        buffMultiplier: attacker?.damageBuff ?? 1,
        critMultiplier: h.critMultiplier,
        counterHit: counterHit && !guarded,
      },
      {
        defense: target.defense,
        absorption: target.absorption,
        damageTakenMultiplier: target.damageTakenMultiplier,
        guardAbsorption: guarded ? target.guardAbsorption : undefined,
      },
    );

    if (guarded) {
      const staminaDamage = h.guardDamage * (1.15 - target.guardBoost * 0.6);
      target.spendStamina(staminaDamage, 0.6);
      target.push.addScaledVector(dir, 2.2 + h.knockback * 2);
      const killed = target.applyDamage(result.total, attacker);
      if (killed) return 'killed';
      if (target.stamina <= 0) {
        target.stamina = 0;
        target.attack = null;
        target.reactGuardBreak();
        this.ctx.events.emit('guardBreak', { target });
        this.ctx.vfx.blocked(point, dir);
        this.ctx.time.hitStop(0.12);
        if (involvesPlayer) this.ctx.camera.shake.add(0.45);
        return 'guardBreak';
      }
      this.ctx.vfx.blocked(point, dir);
      this.ctx.events.emit('blocked', { attacker, target, point: point.clone(), dir: dir.clone(), chip: result.total });
      this.ctx.time.hitStop(h.hitStop * 0.6);
      if (involvesPlayer) this.ctx.camera.shake.add(h.shake * 0.5);
      if (attacker && target.guardBoost >= 0.7 && h.poiseDamage < 30) attacker.reactAttackBlocked();
      return 'blocked';
    }

    // Status build-up
    for (const k of ['poison', 'bleed'] as const) {
      const v = result.buildup[k];
      if (!v) continue;
      target.buildup[k] += v;
      if (target.buildup[k] >= target.statusResist[k]) {
        target.buildup[k] = 0;
        let dmg = 0;
        if (k === 'bleed') dmg = Math.round(target.maxHp * 0.12 + 60);
        else target.poisonTimer = 18;
        if (dmg > 0) result.total += dmg;
        this.ctx.events.emit('statusProc', { target, status: k, damage: dmg });
        this.ctx.vfx.sparks.burst(point, { count: 40, color: k === 'bleed' ? '#ff0a2a' : '#8adf3a', speed: 5, life: 0.7, size: 0.13, gravity: 8, spread: 2 });
      }
    }

    const killed = target.applyDamage(result.total, attacker);
    const heavy = h.poiseDamage >= 28 || (h.critMultiplier ?? 1) > 1;
    let reaction: HitReaction | 'none' = 'none';
    if (!killed) {
      target.poise -= h.poiseDamage;
      target.poiseRegenDelay = 2.5;
      const broken = target.poise <= 0;
      if (broken) target.poise = target.maxPoise;
      if (broken) reaction = h.reaction === 'flinch' ? 'stagger' : h.reaction;
      else if (!target.hyperArmor && target.faction === 'player') reaction = 'flinch';
      if (reaction !== 'none') {
        target.attack = null;
        target.trail.emitting = false;
        target.reactToHit(reaction, from);
      } else {
        const side = (point.x - target.position.x) * Math.cos(target.facing) - (point.z - target.position.z) * Math.sin(target.facing);
        target.addFlinch(heavy ? 0.9 : 0.55, side > 0);
      }
      target.push.addScaledVector(dir, h.knockback * (reaction === 'knockdown' ? 9 : reaction === 'stagger' ? 5 : 3));
    }
    const type = dominantType(result.perType);
    this.ctx.vfx.hitImpact(point, type, dir, heavy, result.critical);
    this.ctx.events.emit('hit', {
      attacker,
      target,
      result,
      point: point.clone(),
      dir: dir.clone(),
      type,
      reaction,
      heavy,
    });
    if (involvesPlayer) {
      this.ctx.time.hitStop(killed ? h.hitStop * 1.6 : h.hitStop);
      this.ctx.camera.shake.add(target.faction === 'player' ? h.shake * 1.2 : h.shake);
    }
    return killed ? 'killed' : 'hit';
  }

  /** Riposte / backstab: guaranteed hit with critical multiplier. */
  critical(attacker: Character, target: Character, d: AttackData): void {
    const pt = target.centerPoint(new Vector3());
    const dir = new Vector3(target.position.x - attacker.position.x, 0, target.position.z - attacker.position.z).normalize();
    const wasInv = target.invulnerable;
    target.invulnerable = false;
    target.guarding = false;
    target.parrying = false;
    this.resolve(
      attacker,
      target,
      {
        source: attacker.damageSource(),
        motionValue: d.motionValue,
        poiseDamage: 0,
        reaction: 'flinch',
        parryable: false,
        guardDamage: 0,
        knockback: 0.2,
        hitStop: d.hitStop,
        shake: d.shake,
        critMultiplier: 2.2 * attacker.weapon.critical,
      },
      pt,
      dir,
    );
    target.invulnerable = wasInv;
  }
}
