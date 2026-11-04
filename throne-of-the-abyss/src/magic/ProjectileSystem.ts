import { AdditiveBlending, Group, Sprite, SpriteMaterial, Vector3 } from 'three';
import type { GameContext } from '@/core/GameContext';
import type { Character } from '@/characters/Character';
import type { ExternalHit } from '@/combat/CombatSystem';
import { radialSprite } from '@/render/TextureFactory';

/** Anything time-based that a spell leaves behind (returns false when finished). */
export interface TimedEffect {
  update(dt: number): boolean;
  /** Remove anything the effect added to the scene (called when effects are cleared). */
  dispose?(): void;
}

interface Projectile {
  owner: Character;
  pos: Vector3;
  vel: Vector3;
  speed: number;
  radius: number;
  life: number;
  homing: number;
  target: Character | null;
  color: string;
  core: string;
  hit: ExternalHit;
  group: Group;
  alive: boolean;
  drain: number;
  freeze: number;
}

/** Magic missiles: homing, collide with geometry and opposing hurtboxes. */
export class ProjectileSystem {
  private list: Projectile[] = [];
  private effects: TimedEffect[] = [];

  /** Run a timed spell effect (meteor, lightning, rift, summon) until it reports done. */
  schedule(e: TimedEffect): void {
    this.effects.push(e);
  }

  get activeEffects(): number {
    return this.effects.length;
  }
  private readonly tmp = new Vector3();
  private readonly tmp2 = new Vector3();

  constructor(private readonly ctx: GameContext) {}

  spawn(
    owner: Character,
    origin: Vector3,
    dir: Vector3,
    opts: { speed: number; radius: number; life: number; homing: number; color: string; core: string },
    hit: ExternalHit,
    target: Character | null,
    extra: { drain?: number; freeze?: number } = {},
  ): void {
    const group = new Group();
    const glow = new Sprite(new SpriteMaterial({ map: radialSprite(), color: opts.color, blending: AdditiveBlending, depthWrite: false, transparent: true }));
    glow.scale.setScalar(opts.radius * 6);
    const core = new Sprite(new SpriteMaterial({ map: radialSprite(), color: opts.core, blending: AdditiveBlending, depthWrite: false, transparent: true }));
    core.scale.setScalar(opts.radius * 2.6);
    group.add(glow, core);
    group.position.copy(origin);
    this.ctx.scene.add(group);
    this.list.push({
      owner,
      pos: origin.clone(),
      vel: dir.clone().normalize().multiplyScalar(opts.speed),
      speed: opts.speed,
      radius: opts.radius,
      life: opts.life,
      homing: opts.homing,
      target,
      color: opts.color,
      core: opts.core,
      hit,
      group,
      alive: true,
      drain: extra.drain ?? 0,
      freeze: extra.freeze ?? 0,
    });
  }

  update(dt: number): void {
    if (this.effects.length) this.effects = this.effects.filter((e) => e.update(dt));
    for (const p of this.list) {
      if (!p.alive) continue;
      p.life -= dt;
      if (p.target && !p.target.dead && p.homing > 0) {
        const want = p.target.centerPoint(this.tmp).sub(p.pos).normalize().multiplyScalar(p.speed);
        const k = Math.min(1, p.homing * dt);
        p.vel.lerp(want, k).setLength(p.speed);
      }
      const step = this.tmp2.copy(p.vel).multiplyScalar(dt);
      const len = step.length();
      const hitWorld = this.ctx.world.raycast(p.pos.x, p.pos.y, p.pos.z, step.x / len, step.y / len, step.z / len, len + p.radius);
      if (hitWorld) {
        p.pos.addScaledVector(step, hitWorld.distance / (len + p.radius));
        this.explode(p);
        continue;
      }
      p.pos.add(step);
      p.group.position.copy(p.pos);
      // trailing motes
      this.ctx.vfx.sparks.emit(p.pos, this.tmp.set((Math.random() - 0.5) * 0.6, (Math.random() - 0.5) * 0.6, (Math.random() - 0.5) * 0.6), p.color, 0.35, p.radius * 1.4, 0, 2);
      // character hits
      for (const c of this.ctx.combat.characters) {
        if (c.dead || c.faction === p.owner.faction) continue;
        const cx = c.position.x;
        const cz = c.position.z;
        const y = Math.min(Math.max(p.pos.y, c.position.y + c.hurtRadius), c.position.y + c.hurtHeight - c.hurtRadius);
        const d = Math.hypot(p.pos.x - cx, p.pos.y - y, p.pos.z - cz);
        if (d <= p.radius + c.hurtRadius) {
          const dir = this.tmp.copy(p.vel).setY(0).normalize();
          const hp0 = c.hp;
          const r = this.ctx.combat.resolve(p.owner, c, p.hit, p.pos.clone(), dir.clone());
          if (r !== 'dodged') {
            if (p.drain > 0 && r !== 'parried') {
              p.owner.heal(Math.max(0, hp0 - c.hp) * p.drain);
              this.ctx.vfx.soulRelease(p.owner.centerPoint(new Vector3()), p.color, 20);
            }
            if (p.freeze > 0 && (r === 'hit' || r === 'blocked')) c.freeze(p.freeze);
            this.explode(p);
            break;
          }
        }
      }
      if (p.alive && p.life <= 0) this.explode(p);
    }
    this.list = this.list.filter((p) => p.alive);
  }

  private explode(p: Projectile): void {
    p.alive = false;
    this.ctx.scene.remove(p.group);
    p.group.traverse((o) => {
      const s = o as Sprite;
      if (s.isSprite) s.material.dispose();
    });
    this.ctx.vfx.sparks.burst(p.pos, { count: 36, color: p.core, color2: p.color, speed: 5, life: 0.45, size: 0.14, gravity: 2, drag: 3 });
    this.ctx.vfx.flash(p.pos, p.color, 2, 0.15);
    this.ctx.vfx.light(p.pos, p.color, 5, 0.2);
  }

  clear(): void {
    for (const p of this.list) this.ctx.scene.remove(p.group);
    this.list = [];
    for (const e of this.effects) e.dispose?.();
    this.effects = [];
  }
}
