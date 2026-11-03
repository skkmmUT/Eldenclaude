import { Vector3 } from 'three';
import { BlendSpace1D } from '@/animation/Animator';
import { attackClip } from '@/animation/HumanoidClips';
import { LEFT_ARM_MASK } from '@/animation/Skeleton';
import type { GameContext } from '@/core/GameContext';
import { angleDelta, chance, clamp, randRange, rotateTowardsAngle, yawFromDir } from '@/core/MathUtils';
import { getAttack } from '@/data/attacks';
import type { EnemyAttackOption, EnemyData } from '@/data/enemies';
import type { HitReaction } from '@/combat/AttackData';
import type { Absorptions } from '@/combat/DamageTypes';
import { buildShield } from '@/render/WeaponModels';
import { glowMaterial } from '@/render/Materials';
import type { Mesh } from 'three';
import { Character } from '../Character';
import type { Player, CriticalVictim } from '../player/Player';
import { Perception } from './Perception';
import type { EnemyDirector } from './EnemyDirector';

export type EnemyState =
  | 'idle'
  | 'patrol'
  | 'investigate'
  | 'return'
  | 'chase'
  | 'defend'
  | 'attack'
  | 'dodge'
  | 'stagger'
  | 'retreat'
  | 'phaseShift'
  | 'critVictim'
  | 'dead';

export interface EnemySpawn {
  id: string; // unique per level (save data)
  type: string; // EnemyData id
  position: Vector3;
  yaw: number;
  patrol?: Vector3[];
}

const SHIELD_GUARD: Absorptions = { physical: 0.92, fire: 0.6, ice: 0.6, lightning: 0.5, holy: 0.6, dark: 0.6, arcane: 0.6 };

/**
 * Data-driven melee AI built on a hierarchical state machine with utility-scored attack
 * selection. Tactical layer: keeps preferred range, circles with guard up, waits for an
 * attack token, punishes healing, dodges telegraphed player swings, retreats when weak.
 */
export class Enemy extends Character implements CriticalVictim {
  readonly data: EnemyData;
  readonly spawn: EnemySpawn;
  readonly perception: Perception;
  state: EnemyState = 'idle';
  stateTime = 0;
  target: Player | null = null;
  aggro = false;
  phase = 1;
  private readonly locomotion: BlendSpace1D;
  private cooldowns = new Map<string, number>();
  private option: EnemyAttackOption | null = null;
  private decisionTimer = 0;
  private strafeDir = 1;
  private strafeTimer = 0;
  private reactCooldown = 0;
  private retreatCooldown = 0;
  private staggerDuration = 0;
  private dodgeYaw = 0;
  private patrolIndex = 0;
  private waitTimer = 0;
  private speed = 0;
  private guardTimer = 0;
  private dissolve = 0;
  private alertDelay = -1;
  /** Seconds since becoming hostile — reflexes (dodge/guard) need a moment to engage. */
  private aggroTime = 0;
  private readonly tmp = new Vector3();
  private readonly dir = new Vector3();
  private shieldMesh: ReturnType<typeof buildShield> | null = null;
  /** Set when killed so the level can track it (no respawn for elites). */
  defeated = false;
  onDefeated: ((e: Enemy) => void) | null = null;

  constructor(
    ctx: GameContext,
    data: EnemyData,
    spawn: EnemySpawn,
    private readonly director: EnemyDirector,
  ) {
    super(ctx, {
      name: data.name,
      faction: 'enemy',
      appearance: data.appearance,
      stance: data.stance,
      maxHp: data.maxHp,
      maxStamina: data.maxStamina,
      maxMana: 0,
      maxPoise: data.maxPoise,
      defense: data.defense,
      absorption: data.absorption,
      statusResist: data.statusResist,
      weapon: data.weapon,
      radius: 0.38,
    });
    this.data = data;
    this.spawn = spawn;
    this.isBoss = data.elite;
    this.perception = new Perception(ctx.world, data.perception);
    this.locomotion = new BlendSpace1D([
      { clip: this.clips.idle, value: 0 },
      { clip: this.clips.walk, value: data.movement.walk },
      { clip: this.clips.run, value: data.movement.run },
    ]);
    if (data.shield) {
      this.shieldMesh = buildShield('#3a302a', '#6a4a2a', '#5a1a1a');
      this.rig.weaponSocketL.add(this.shieldMesh);
      this.animator.setLayer('guard', this.clips.guardShield, 0, LEFT_ARM_MASK);
    }
    this.staminaRegenRate = 30;
    this.reset();
    ctx.events.on('noise', (n) => {
      if (this.dead || this.aggro || n.source.faction === this.faction) return;
      if (this.perception.hear(this, n.x, n.y, n.z, n.radius)) {
        if (this.perception.awareness >= 1) this.becomeAggro();
        else if (this.state === 'idle' || this.state === 'patrol' || this.state === 'return') this.enter('investigate');
      }
    });
  }

  get attributes(): undefined {
    return undefined;
  }

  override get guardAbsorption(): Absorptions {
    return this.data.shield ? SHIELD_GUARD : this.weapon.guard;
  }
  override get guardBoost(): number {
    return this.data.shield ? 0.62 : this.weapon.guardBoost;
  }

  /** Back to spawn state (altar rest / first load). */
  reset(): void {
    this.dead = false;
    this.defeated = false;
    this.hp = this.maxHp;
    this.poise = this.maxPoise;
    this.stamina = this.maxStamina;
    this.buildup.poison = this.buildup.bleed = 0;
    this.poisonTimer = 0;
    this.attack = null;
    this.invulnerable = false;
    this.guarding = false;
    this.hyperArmor = false;
    this.ripostableTimer = 0;
    this.aggro = false;
    this.target = null;
    this.phase = 1;
    this.perception.awareness = 0;
    this.perception.hasLastKnown = false;
    this.cooldowns.clear();
    this.motor.teleport(this.spawn.position.x, this.spawn.position.y, this.spawn.position.z);
    this.facing = this.spawn.yaw;
    this.model.rotation.y = this.spawn.yaw;
    this.dissolve = 0;
    this.model.visible = true;
    this.model.position.y = this.spawn.position.y;
    this.cape?.reset();
    this.cape?.setVisible(true);
    this.director.release(this);
    this.animator.reset();
    this.state = 'idle';
    this.enter(this.spawn.patrol && this.spawn.patrol.length > 1 ? 'patrol' : 'idle');
    this.weaponModel.group.visible = true;
    if (this.weapon.visual.runeColor) this.setRuneColor(this.weapon.visual.runeColor);
  }

  setPlayer(p: Player | null): void {
    this.target = p;
  }

  // ===================================================================================
  // State machine core
  // ===================================================================================
  private enter(state: EnemyState): void {
    if (this.state === 'attack') {
      this.attack = null;
      this.trail.emitting = false;
      this.hyperArmor = false;
      this.motor.gravityScale = 1;
    }
    if (this.state === 'dodge' || this.state === 'critVictim' || this.state === 'phaseShift') this.invulnerable = false;
    this.state = state;
    this.stateTime = 0;
    this.guarding = false;
    switch (state) {
      case 'idle':
      case 'patrol':
      case 'investigate':
      case 'return':
      case 'chase':
      case 'defend':
      case 'retreat':
        this.animator.playBlendSpace(this.locomotion, 'locomotion', 0.25);
        break;
      default:
        break;
    }
    if (state === 'defend') {
      this.decisionTimer = randRange(0.3, 0.9);
      this.guardTimer = this.data.shield && chance(this.data.combat.blockChance + 0.25) ? randRange(1.2, 3) : 0;
    }
  }

  protected updateState(dt: number): void {
    this.stateTime += dt;
    this.motor.desiredVelocity.set(0, 0, 0);
    for (const [k, v] of this.cooldowns) this.cooldowns.set(k, v - dt);
    if (this.reactCooldown > 0) this.reactCooldown -= dt;
    if (this.retreatCooldown > 0) this.retreatCooldown -= dt;

    if (this.dead) {
      this.updateDead(dt);
      return;
    }

    if (this.aggro) this.aggroTime += dt;
    const p = this.target;
    const stealthy = !!p && (p.walkToggle || p.speedNow < 2) && !p.sprinting;
    this.perception.update(dt, this, p && !p.dead ? p : null, stealthy);
    if (!this.aggro && this.perception.awareness >= 1) this.becomeAggro();
    if (this.alertDelay > 0) {
      this.alertDelay -= dt;
      if (this.alertDelay <= 0) this.becomeAggro();
    }
    if (this.aggro && p && p.dead) {
      this.loseAggro();
    } else if (this.aggro && this.perception.timeSinceSeen > 7 && this.state !== 'attack') {
      this.loseAggro();
      this.enter('investigate');
    }

    // Phase transition for elites.
    if (this.data.combat.phase2Attacks && this.phase === 1 && this.hp <= this.maxHp * 0.5 && this.state !== 'attack' && this.state !== 'stagger' && this.state !== 'critVictim') {
      this.enterPhaseShift();
    }

    switch (this.state) {
      case 'idle':
        this.updateIdle(dt);
        break;
      case 'patrol':
        this.updatePatrol(dt);
        break;
      case 'investigate':
        this.updateInvestigate(dt);
        break;
      case 'return':
        this.updateReturn(dt);
        break;
      case 'chase':
        this.updateChase(dt);
        break;
      case 'defend':
        this.updateDefend(dt);
        break;
      case 'attack':
        this.updateAttack(dt);
        break;
      case 'dodge':
        this.updateDodge();
        break;
      case 'stagger':
        if (this.stateTime >= this.staggerDuration) this.enter(this.aggro ? 'defend' : 'idle');
        break;
      case 'retreat':
        this.updateRetreat(dt);
        break;
      case 'phaseShift':
        this.updatePhaseShift();
        break;
      case 'critVictim':
        if (this.stateTime >= 3.0) {
          this.invulnerable = false;
          this.enter('defend');
        } else this.invulnerable = this.stateTime > 0.6 && this.stateTime < 2.6;
        break;
      case 'dead':
        break;
    }
    if (this.data.shield) this.animator.setLayer('guard', this.clips.guardShield, this.guarding ? 1 : 0, LEFT_ARM_MASK, 0.12);
    this.locomotion.param = this.speed;
  }

  becomeAggro(): void {
    if (this.aggro || this.dead || !this.target || this.target.dead) return;
    this.aggro = true;
    this.aggroTime = 0;
    this.alertDelay = -1;
    this.perception.awareness = 1.2;
    if (this.state === 'idle' || this.state === 'patrol' || this.state === 'investigate' || this.state === 'return') {
      this.enter(this.distanceTo(this.target) > this.data.combat.preferredRange[1] + 1 ? 'chase' : 'defend');
    }
    if (this.isBoss) this.ctx.events.emit('bossEngaged', { boss: this });
    // Alert nearby allies (with a short, staggered delay — it reads as a shout spreading).
    for (const c of this.ctx.combat.characters) {
      if (c === this || c.faction !== this.faction || c.dead) continue;
      const e = c as Enemy;
      if (e.aggro || e.alertDelay > 0 || typeof e.becomeAggro !== 'function') continue;
      if (this.distanceTo(e) < 11) e.alertDelay = randRange(0.4, 1.1);
    }
  }

  private loseAggro(): void {
    this.aggro = false;
    this.perception.awareness = 0.6;
    this.director.release(this);
  }

  // ===================================================================================
  // Movement helpers
  // ===================================================================================
  /** Context steering: find a clear direction close to the desired one. */
  private steer(desiredYaw: number): number {
    const p = this.position;
    const y = p.y + 0.9;
    const offsets = [0, 0.5, -0.5, 1.0, -1.0, 1.5, -1.5];
    for (const o of offsets) {
      const yaw = desiredYaw + o;
      const dx = Math.sin(yaw);
      const dz = Math.cos(yaw);
      if (!this.ctx.world.raycast(p.x, y, p.z, dx, 0, dz, 1.4 * this.rig.scale + this.motor.radius)) return yaw;
    }
    return desiredYaw;
  }

  private moveTowardsYaw(yaw: number, speed: number, dt: number, face = true): void {
    this.speed += clamp(speed - this.speed, -10 * dt, 8 * dt);
    let vx = Math.sin(yaw) * this.speed;
    let vz = Math.cos(yaw) * this.speed;
    // Separation from allies so groups don't stack.
    for (const c of this.ctx.combat.characters) {
      if (c === this || c.dead || c.faction !== this.faction) continue;
      const dx = this.position.x - c.position.x;
      const dz = this.position.z - c.position.z;
      const d = Math.hypot(dx, dz);
      const min = (this.motor.radius + c.motor.radius) * 1.8;
      if (d < min && d > 1e-3) {
        vx += (dx / d) * (min - d) * 3;
        vz += (dz / d) * (min - d) * 3;
      }
    }
    this.motor.desiredVelocity.set(vx, 0, vz);
    if (face) this.facing = rotateTowardsAngle(this.facing, yaw, this.data.movement.turnRate * dt);
  }

  private stopMoving(dt: number): void {
    this.speed += clamp(-this.speed, -10 * dt, 10 * dt);
  }

  private faceTarget(dt: number, rate = this.data.movement.turnRate): void {
    if (!this.target) return;
    const t = this.target.position;
    this.facing = rotateTowardsAngle(this.facing, yawFromDir(t.x - this.position.x, t.z - this.position.z), rate * dt);
  }

  // ===================================================================================
  // Non-combat states
  // ===================================================================================
  private updateIdle(dt: number): void {
    this.stopMoving(dt);
    // Slowly turn back to the guard direction.
    this.facing = rotateTowardsAngle(this.facing, this.spawn.yaw, 1.5 * dt);
  }

  private updatePatrol(dt: number): void {
    const pts = this.spawn.patrol;
    if (!pts || pts.length < 2) {
      this.enter('idle');
      return;
    }
    if (this.waitTimer > 0) {
      this.waitTimer -= dt;
      this.stopMoving(dt);
      return;
    }
    const wp = pts[this.patrolIndex];
    const dx = wp.x - this.position.x;
    const dz = wp.z - this.position.z;
    if (Math.hypot(dx, dz) < 0.6) {
      this.patrolIndex = (this.patrolIndex + 1) % pts.length;
      this.waitTimer = randRange(1.5, 3.5);
      return;
    }
    this.moveTowardsYaw(this.steer(yawFromDir(dx, dz)), this.data.movement.walk, dt);
  }

  private updateInvestigate(dt: number): void {
    const lk = this.perception.lastKnown;
    const dx = lk.x - this.position.x;
    const dz = lk.z - this.position.z;
    if (Math.hypot(dx, dz) > 1.2 && this.stateTime < 10) {
      this.moveTowardsYaw(this.steer(yawFromDir(dx, dz)), this.data.movement.walk * 1.3, dt);
    } else {
      this.stopMoving(dt);
      // Look around.
      this.facing += Math.sin(this.stateTime * 1.5) * dt * 1.2;
      if (this.stateTime > 14 || (Math.hypot(dx, dz) <= 1.2 && this.stateTime > 4)) this.enter('return');
    }
  }

  private updateReturn(dt: number): void {
    const h = this.spawn.position;
    const dx = h.x - this.position.x;
    const dz = h.z - this.position.z;
    // Leashing: recover while walking home.
    this.hp = Math.min(this.maxHp, this.hp + this.maxHp * 0.08 * dt);
    if (Math.hypot(dx, dz) < 0.7) {
      this.enter(this.spawn.patrol && this.spawn.patrol.length > 1 ? 'patrol' : 'idle');
      return;
    }
    this.moveTowardsYaw(this.steer(yawFromDir(dx, dz)), this.data.movement.walk * 1.2, dt);
  }

  // ===================================================================================
  // Combat states
  // ===================================================================================
  private updateChase(dt: number): void {
    const t = this.target;
    if (!t || !this.aggro) {
      this.enter('return');
      return;
    }
    const dist = this.distanceTo(t);
    // Leash: never chase too far from home.
    if (this.position.distanceTo(this.spawn.position) > 32) {
      this.loseAggro();
      this.enter('return');
      return;
    }
    if (dist <= this.data.combat.preferredRange[1] + 0.5) {
      this.enter('defend');
      return;
    }
    // Gap closers from range.
    if (this.tryAttack(dist, true)) return;
    const goal = this.perception.canSee ? t.position : this.perception.lastKnown;
    this.moveTowardsYaw(this.steer(yawFromDir(goal.x - this.position.x, goal.z - this.position.z)), this.data.movement.run, dt);
  }

  private updateDefend(dt: number): void {
    const t = this.target;
    if (!t || !this.aggro) {
      this.enter('return');
      return;
    }
    const dist = this.distanceTo(t);
    const [minR, maxR] = this.data.combat.preferredRange;
    if (dist > maxR + 2.5) {
      this.enter('chase');
      return;
    }
    this.faceTarget(dt);

    // React to the player's attack wind-up.
    if (this.reactCooldown <= 0 && this.aggroTime > 0.7 && t.attack && t.attack.time < t.attack.data.startup && dist < 3.6) {
      this.reactCooldown = 1.6;
      if (chance(this.data.combat.dodgeChance)) {
        this.startDodge(t);
        return;
      }
      if (this.data.shield && chance(this.data.combat.blockChance)) this.guardTimer = Math.max(this.guardTimer, 0.9);
    }
    // Retreat when badly hurt.
    if (this.data.combat.retreatHpFraction > 0 && this.hp < this.maxHp * this.data.combat.retreatHpFraction && this.retreatCooldown <= 0) {
      this.retreatCooldown = 14;
      this.director.release(this);
      this.enter('retreat');
      return;
    }

    if (this.guardTimer > 0) this.guardTimer -= dt;
    this.guarding = this.guardTimer > 0 && this.stamina > 10 && this.aggroTime > 0.6;

    // Spacing: approach, back off or circle.
    const toYaw = yawFromDir(t.position.x - this.position.x, t.position.z - this.position.z);
    this.strafeTimer -= dt;
    if (this.strafeTimer <= 0) {
      this.strafeTimer = randRange(1.6, 3.4);
      this.strafeDir = chance(0.5) ? 1 : -1;
    }
    const mv = this.data.movement;
    if (dist > maxR) this.moveTowardsYaw(this.steer(toYaw), mv.walk * 1.4, dt, false);
    else if (dist < minR - 0.6) this.moveTowardsYaw(toYaw + Math.PI, mv.strafe, dt, false);
    else {
      const strafeYaw = toYaw + (Math.PI / 2) * this.strafeDir;
      const sx = Math.sin(strafeYaw);
      const sz = Math.cos(strafeYaw);
      if (this.ctx.world.raycast(this.position.x, this.position.y + 0.9, this.position.z, sx, 0, sz, 1.5)) this.strafeDir *= -1;
      this.moveTowardsYaw(strafeYaw, mv.strafe, dt, false);
    }

    // Decide to attack.
    this.decisionTimer -= dt;
    const punish = t.state === 'item' || t.state === 'cast' || t.state === 'hit';
    if (this.decisionTimer <= 0 || (punish && this.decisionTimer < 0.4)) {
      this.decisionTimer = randRange(0.35, 0.9) / (this.phase === 2 ? 1.4 : 1);
      const commit = punish || chance(this.data.combat.aggression);
      if (commit) this.tryAttack(dist, false);
    }
  }

  private tryAttack(dist: number, gapCloserOnly: boolean): boolean {
    const t = this.target;
    if (!t) return false;
    const list = this.phase === 2 && this.data.combat.phase2Attacks ? this.data.combat.phase2Attacks : this.data.combat.attacks;
    const angle = Math.abs(angleDelta(this.facing, yawFromDir(t.position.x - this.position.x, t.position.z - this.position.z)));
    const candidates = list.filter(
      (o) =>
        dist >= o.minRange &&
        dist <= o.maxRange * (this.isBoss ? 1 : 1) &&
        (this.cooldowns.get(o.id) ?? 0) <= 0 &&
        angle < (gapCloserOnly ? 0.6 : 1.1) &&
        (!gapCloserOnly || o.minRange > 2),
    );
    if (!candidates.length) return false;
    if (!this.director.request(this, this.data.combat.tokenCost)) return false;
    let total = 0;
    for (const c of candidates) total += c.weight;
    let r = Math.random() * total;
    let pick = candidates[0];
    for (const c of candidates) {
      r -= c.weight;
      if (r <= 0) {
        pick = c;
        break;
      }
    }
    this.startAttack(pick, pick.id);
    return true;
  }

  private startAttack(option: EnemyAttackOption, attackId: string): void {
    const data = getAttack(attackId);
    this.enter('attack');
    this.option = option;
    this.speed = 0;
    this.ctx.combat.begin(this, data);
    this.animator.play(attackClip(data, this.stance), 0.1, this.phase === 2 ? 1.08 : 1);
    this.cooldowns.set(option.id, option.cooldown * randRange(0.8, 1.3));
  }

  private updateAttack(dt: number): void {
    const atk = this.attack;
    if (!atk) {
      this.director.release(this);
      this.enter('defend');
      return;
    }
    const d = atk.data;
    const prev = atk.time;
    atk.time += dt * (this.phase === 2 ? 1.08 : 1);
    const t = atk.time;
    this.hyperArmor = !!d.hyperArmor && t >= d.startup * 0.3 && t <= d.startup + d.active;
    if (t < d.startup) this.faceTarget(dt, d.tracking);
    // Leap attacks hop into the air.
    if (d.lunge >= 5 && prev < d.startup * 0.55 && t >= d.startup * 0.55) {
      this.motor.velocity.y = 7.5;
      this.motor.grounded = false;
    }
    const l0 = d.startup * (d.lunge >= 5 ? 0.55 : 0.4);
    const l1 = d.startup + d.active;
    if (d.lunge > 0 && t >= l0 && t <= l1 && this.target) {
      const dist = this.distanceTo(this.target);
      const stopAt = this.motor.radius + this.target.motor.radius + 0.25;
      if (dist > stopAt) {
        const v = Math.min(d.lunge / (l1 - l0), (dist - stopAt) / Math.max(dt, 1e-3));
        this.motor.desiredVelocity.set(Math.sin(this.facing) * v, 0, Math.cos(this.facing) * v);
      }
    }
    if (t >= d.startup + d.active + d.recovery) {
      if (d.next && this.option && chance(this.option.chainChance) && this.target && this.distanceTo(this.target) < 4.5 * this.rig.scale) {
        const opt = this.option;
        this.startAttack(opt, d.next);
        return;
      }
      this.director.release(this);
      this.enter('defend');
    }
  }

  override reactAttackBlocked(): void {
    // Light attacks bouncing off a sturdy guard: brief recoil.
    if (this.state === 'attack' && this.attack && !this.hyperArmor) {
      this.director.release(this);
      this.attack = null;
      this.enter('stagger');
      this.staggerDuration = 0.6;
      this.animator.play(this.clips.hitLight, 0.05);
    }
  }

  private startDodge(from: Player): void {
    this.enter('dodge');
    const away = yawFromDir(this.position.x - from.position.x, this.position.z - from.position.z);
    this.dodgeYaw = away + (chance(0.5) ? 0.9 : -0.9) * (chance(0.5) ? 1 : 0);
    this.animator.play(this.clips.backstep, 0.06);
  }

  private updateDodge(): void {
    const t = this.stateTime;
    this.invulnerable = t >= 0.03 && t <= 0.3;
    if (t < 0.35) {
      const v = 7.5 * (1 - t / 0.35);
      this.motor.desiredVelocity.set(Math.sin(this.dodgeYaw) * v, 0, Math.cos(this.dodgeYaw) * v);
    }
    if (t >= 0.5) {
      this.enter('defend');
      // Counter-attack out of a dodge sometimes.
      if (this.target && chance(0.5)) this.tryAttack(this.distanceTo(this.target), false);
    }
  }

  private updateRetreat(dt: number): void {
    const t = this.target;
    if (!t) {
      this.enter('return');
      return;
    }
    this.faceTarget(dt);
    this.guarding = !!this.data.shield;
    const away = yawFromDir(this.position.x - t.position.x, this.position.z - t.position.z);
    if (this.distanceTo(t) < 7 && this.stateTime < 3) this.moveTowardsYaw(this.steer(away), this.data.movement.strafe * 1.4, dt, false);
    else this.stopMoving(dt);
    if (this.stateTime > 3.2) this.enter('defend');
  }

  private enterPhaseShift(): void {
    this.phase = 2;
    this.roar();
    this.ctx.events.emit('bossPhase', { boss: this, phase: 2 });
    this.setRuneColor('#b05cff');
    this.damageBuff = 1.15;
  }

  /** Invulnerable roar used for the boss introduction and the phase transition. */
  roar(): void {
    this.director.release(this);
    this.enter('phaseShift');
    this.invulnerable = true;
    this.animator.play(this.clips.castSkyward, 0.2, 0.6);
    this.ctx.camera.shake.add(0.5);
  }

  private updatePhaseShift(): void {
    if (Math.random() < 0.7) {
      const c = this.centerPoint(this.tmp);
      this.ctx.vfx.sparks.burst(c, { count: 3, color: '#b05cff', color2: '#ff2a6a', speed: 3, life: 0.8, size: 0.18, gravity: -3, drag: 1, radius: 0.8 });
    }
    if (this.stateTime > 0.9 && this.stateTime - 0.016 <= 0.9) {
      this.ctx.vfx.shockwave(this.position, 4, '#b05cff');
    }
    if (this.stateTime >= 1.8) {
      this.invulnerable = false;
      this.enter('defend');
    }
  }

  private setRuneColor(color: string): void {
    this.weaponModel.group.traverse((o) => {
      const m = o as Mesh;
      const mat = m.material as { isMeshBasicMaterial?: boolean } | undefined;
      if (m.isMesh && mat?.isMeshBasicMaterial) m.material = glowMaterial(color, 2.6);
    });
  }

  // ===================================================================================
  // Reactions
  // ===================================================================================
  reactToHit(reaction: HitReaction, _from: Vector3): void {
    void _from;
    if (this.state === 'phaseShift' || this.state === 'critVictim') return;
    this.director.release(this);
    if (!this.aggro) this.becomeAggro();
    this.enter('stagger');
    if (reaction === 'flinch') {
      this.staggerDuration = 0.4;
      this.animator.play(this.clips.hitLight, 0.04);
    } else if (reaction === 'stagger') {
      this.staggerDuration = this.isBoss ? 1.1 : 1.35;
      this.animator.play(this.clips.stagger, 0.04);
    } else {
      this.staggerDuration = 2.2;
      this.animator.play(this.clips.knockdown, 0.04);
    }
  }

  reactGuardBreak(): void {
    this.director.release(this);
    this.enter('stagger');
    this.staggerDuration = 1.3;
    this.animator.play(this.clips.guardBreak, 0.04);
  }

  reactParried(_by: Character): void {
    void _by;
    this.director.release(this);
    this.enter('stagger');
    this.staggerDuration = 2.3;
    this.animator.play(this.clips.parried, 0.04);
  }

  enterCriticalVictim(_by: Character, _backstab: boolean): void {
    void _by;
    void _backstab;
    this.director.release(this);
    this.attack = null;
    this.ripostableTimer = 0;
    if (!this.aggro) this.becomeAggro();
    this.enter('critVictim');
    this.facing = yawFromDir(_by.position.x - this.position.x, _by.position.z - this.position.z) + (_backstab ? Math.PI : 0);
    this.animator.play(this.clips.criticalVictim, 0.06);
  }

  canBeBackstabbed(): boolean {
    if (this.isBoss) return false;
    return this.state === 'idle' || this.state === 'patrol' || this.state === 'investigate' || this.state === 'return' || this.state === 'defend' || this.state === 'chase';
  }

  reactDeath(_killer: Character | null): void {
    void _killer;
    this.director.release(this);
    this.state = 'dead';
    this.stateTime = 0;
    this.guarding = false;
    this.invulnerable = false;
    this.defeated = true;
    this.animator.play(this.clips.death, 0.06);
    this.onDefeated?.(this);
  }

  private updateDead(dt: number): void {
    this.speed = 0;
    if (this.stateTime > 2.2) {
      this.dissolve += dt;
      if (this.dissolve < 1.2 && Math.random() < 0.9) {
        const c = this.centerPoint(this.tmp);
        c.y -= 0.6;
        this.ctx.vfx.sparks.burst(c, { count: 2, color: this.isBoss ? '#ff4a6a' : '#ffb070', color2: '#ffffff', speed: 0.8, life: 1.4, size: 0.12, gravity: -1.8, drag: 0.6, radius: 0.7 });
      }
      this.model.position.y -= dt * 0.35;
      if (this.dissolve > 1.4 && this.model.visible) {
        this.model.visible = false;
        this.cape?.setVisible(false);
      }
    }
  }

  /** HUD helpers */
  get alertLevel(): number {
    return this.aggro ? 1 : Math.min(1, this.perception.awareness);
  }

  get isDefeatedPermanently(): boolean {
    return this.defeated && !this.data.respawns;
  }

  /** Direction helper for HUD: is this enemy within the player's view? */
  get worldTop(): Vector3 {
    return this.dir.set(this.position.x, this.position.y + this.hurtHeight + 0.35, this.position.z);
  }
}
