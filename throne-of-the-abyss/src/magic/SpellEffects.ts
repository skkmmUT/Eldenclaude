import { Vector3 } from 'three';
import type { GameContext } from '@/core/GameContext';
import type { Character } from '@/characters/Character';
import type { ExternalHit } from '@/combat/CombatSystem';
import type { HitReaction } from '@/combat/AttackData';
import type { SpellData } from './SpellTypes';
import { SpectralGuardian } from './Summons';

/** How strong the caster's spells are right now (rings, buffs, catalyst). */
export function spellPower(caster: Character): number {
  return caster.mods.spellMul * (caster.weapon.catalyst?.spellMul ?? 1);
}

function hitFor(s: SpellData, caster: Character, reaction: HitReaction, extra: Partial<ExternalHit> = {}): ExternalHit {
  const d = s.damage!;
  return {
    source: d,
    motionValue: d.motionValue * spellPower(caster),
    poiseDamage: d.poiseDamage,
    reaction,
    parryable: false,
    guardDamage: 30,
    knockback: 0.8,
    hitStop: 0.06,
    shake: 0.2,
    ...extra,
  };
}

/** Deal an area hit to every opponent of `caster` inside the radius. */
export function areaHit(ctx: GameContext, caster: Character, center: Vector3, radius: number, hit: ExternalHit, onHit?: (c: Character) => void): number {
  let n = 0;
  for (const c of ctx.combat.characters) {
    if (c.faction === caster.faction || c.dead) continue;
    if (Math.hypot(c.position.x - center.x, c.position.z - center.z) > radius + c.hurtRadius) continue;
    if (Math.abs(c.position.y - center.y) > 3) continue;
    const dir = new Vector3(c.position.x - center.x, 0, c.position.z - center.z).normalize();
    const r = ctx.combat.resolve(caster, c, hit, c.centerPoint(new Vector3()), dir);
    if (r !== 'dodged') {
      n++;
      onHit?.(c);
    }
  }
  return n;
}

/**
 * Executes every spell effect except Void Step (which moves the caster and is handled by
 * the player). Delayed effects (meteors, lightning, rifts, summons) are scheduled on the
 * projectile system's timed-effect list.
 */
export function castSpell(ctx: GameContext, caster: Character, s: SpellData, hand: Vector3, facing: number, target: Character | null): void {
  const e = s.effect;
  const fwd = new Vector3(Math.sin(facing), 0, Math.cos(facing));
  const vfx = ctx.vfx;
  switch (e.kind) {
    case 'projectile': {
      if (!s.damage) return;
      const origin = hand.clone().addScaledVector(fwd, 0.3);
      const aim = fwd.clone();
      if (target) aim.copy(target.centerPoint(new Vector3()).sub(origin)).normalize();
      const count = e.count ?? 1;
      const spread = e.spread ?? 0;
      for (let i = 0; i < count; i++) {
        const off = count > 1 ? (i / (count - 1) - 0.5) * spread : 0;
        const dir = aim.clone().applyAxisAngle(new Vector3(0, 1, 0), off);
        ctx.projectiles.spawn(caster, origin, dir, e, hitFor(s, caster, 'flinch'), count > 1 ? null : target, { drain: e.drain, freeze: e.freeze });
      }
      vfx.flash(origin, e.color, 1.4, 0.15);
      break;
    }
    case 'nova': {
      if (!s.damage) return;
      const center = caster.position.clone().addScaledVector(fwd, e.forward);
      center.y += 0.1;
      vfx.sparks.burst(center.clone().setY(center.y + 0.6), { count: 140, color: e.core, color2: e.color, speed: 5, life: 0.8, size: 0.3, gravity: e.freeze ? 1 : -3, drag: 2.2, spread: 2, radius: 0.8 });
      vfx.smoke.burst(center.clone().setY(center.y + 0.4), { count: 40, color: e.color, color2: e.freeze ? '#ffffff' : '#000000', speed: 2.5, life: 1.2, size: 1.0, gravity: -1.5, drag: 2, spread: 2, radius: 0.8 });
      vfx.ring(center, e.radius * 1.3, e.core, 0.5);
      vfx.light(center.clone().setY(center.y + 1), e.core, 14, 0.6);
      ctx.camera.shake.add(0.25);
      areaHit(ctx, caster, center, e.radius, hitFor(s, caster, e.freeze ? 'flinch' : 'stagger', { knockback: e.freeze ? 0 : 1.2 }), (c) => {
        if (e.freeze) c.freeze(e.freeze);
      });
      break;
    }
    case 'meteor': {
      if (!s.damage) return;
      const at = target ? target.position.clone() : caster.position.clone().addScaledVector(fwd, 10);
      const ground = ctx.world.groundHeight(at.x, at.z, 0.3, at.y + 2);
      if (ground > -Infinity) at.y = ground;
      ctx.projectiles.schedule(new MeteorFall(ctx, caster, at, e.radius, e.delay, e.color, e.core, hitFor(s, caster, 'knockdown', { knockback: 2, hitStop: 0.14, shake: 0.7 })));
      break;
    }
    case 'strike': {
      if (!s.damage) return;
      const tgt = target;
      const at = tgt ? tgt.position.clone() : caster.position.clone().addScaledVector(fwd, 8);
      let t = 0;
      vfx.ring(at, e.radius * 1.4, e.core, e.delay);
      ctx.projectiles.schedule({
        update: (dt) => {
          t += dt;
          if (tgt && !tgt.dead) at.copy(tgt.position); // the bolt follows its mark until it lands
          if (t < e.delay) return true;
          const top = at.clone().setY(at.y + 14);
          for (let i = 0; i < 18; i++) {
            const p = top.clone().lerp(at, i / 17);
            p.x += (Math.random() - 0.5) * 0.5;
            p.z += (Math.random() - 0.5) * 0.5;
            vfx.sparks.emit(p, new Vector3(0, -2, 0), i % 3 ? e.core : e.color, 0.35, 0.35, 0, 4);
          }
          vfx.flash(at.clone().setY(at.y + 1), e.core, 4, 0.25);
          vfx.light(at.clone().setY(at.y + 2), e.color, 30, 0.3);
          vfx.shockwave(at, e.radius * 1.3, e.color);
          ctx.camera.shake.add(0.4);
          areaHit(ctx, caster, at, e.radius, hitFor(s, caster, 'stagger', { hitStop: 0.1, shake: 0.5 }));
          return false;
        },
      });
      break;
    }
    case 'rift': {
      if (!s.damage) return;
      const center = (target ? target.position.clone() : caster.position.clone().addScaledVector(fwd, e.forward));
      let t = 0;
      ctx.projectiles.schedule({
        update: (dt) => {
          t += dt;
          if (Math.random() < 0.8) vfx.sparks.burst(center.clone().setY(center.y + 1), { count: 4, color: e.core, color2: e.color, speed: 4, life: 0.4, size: 0.12, drag: 1, spread: 2, radius: e.radius * 0.6 });
          if (t < e.pullTime) {
            for (const c of ctx.combat.characters) {
              if (c.faction === caster.faction || c.dead) continue;
              const dx = center.x - c.position.x;
              const dz = center.z - c.position.z;
              const d = Math.hypot(dx, dz);
              if (d > e.radius || d < 0.6) continue;
              c.push.x += (dx / d) * 22 * dt;
              c.push.z += (dz / d) * 22 * dt;
            }
            return true;
          }
          vfx.shockwave(center, 3, e.core);
          vfx.flash(center.clone().setY(center.y + 1), e.core, 3, 0.2);
          areaHit(ctx, caster, center, 2.6, hitFor(s, caster, 'knockdown', { knockback: 1.5, hitStop: 0.1, shake: 0.5 }));
          return false;
        },
      });
      vfx.ring(center, e.radius, e.color, e.pullTime);
      break;
    }
    case 'buff': {
      caster.addBuff(e.buff);
      const c = caster.centerPoint(new Vector3());
      vfx.soulRelease(c, e.buff.color, 60);
      vfx.ring(caster.position, 1.6, e.buff.color, 0.5);
      vfx.light(c, e.buff.color, 8, 0.5);
      break;
    }
    case 'pact': {
      caster.mana = Math.min(caster.maxMana, caster.mana + caster.maxMana * e.manaFraction);
      vfx.sparks.burst(caster.centerPoint(new Vector3()), { count: 50, color: e.color, color2: '#4d7dff', speed: 3, life: 0.8, size: 0.12, gravity: -1, drag: 2, spread: 2 });
      break;
    }
    case 'summon': {
      if (!s.damage) return;
      const g = new SpectralGuardian(ctx, caster, e.duration, e.color, hitFor(s, caster, 'stagger', { hitStop: 0.05, shake: 0.12 }));
      ctx.projectiles.schedule(g);
      break;
    }
    case 'blink':
      break;
  }
}

/** A meteor falling from the sky onto a marked point. */
class MeteorFall {
  private t = 0;
  private readonly from: Vector3;
  constructor(
    private readonly ctx: GameContext,
    private readonly caster: Character,
    private readonly at: Vector3,
    private readonly radius: number,
    private readonly delay: number,
    private readonly color: string,
    private readonly core: string,
    private readonly hit: ExternalHit,
  ) {
    this.from = at.clone().add(new Vector3(-6, 26, 4));
    ctx.vfx.ring(at, radius, color, delay + 0.2);
  }
  update(dt: number): boolean {
    this.t += dt;
    const k = Math.min(1, this.t / this.delay);
    const p = this.from.clone().lerp(this.at, k * k);
    const vfx = this.ctx.vfx;
    for (let i = 0; i < 3; i++) vfx.sparks.emit(p, new Vector3((Math.random() - 0.5) * 2, 2, (Math.random() - 0.5) * 2), i ? this.color : this.core, 0.6, 0.9 * (1 - k * 0.4), 0, 2);
    vfx.smoke.emit(p, new Vector3(0, 1, 0), '#2a1838', 1.2, 1.4, -0.5, 1);
    if (k < 1) return true;
    vfx.shockwave(this.at, this.radius * 1.4, this.color);
    vfx.sparks.burst(this.at.clone().setY(this.at.y + 0.5), { count: 160, color: this.core, color2: this.color, speed: 10, life: 0.9, size: 0.3, gravity: 8, drag: 2, spread: 2, upBias: 0.6 });
    vfx.flash(this.at.clone().setY(this.at.y + 1), this.core, 6, 0.3);
    vfx.light(this.at.clone().setY(this.at.y + 2), this.color, 40, 0.5);
    this.ctx.camera.shake.add(0.8);
    this.ctx.camera.fovKick = 5;
    areaHit(this.ctx, this.caster, this.at, this.radius, this.hit);
    return false;
  }
}
