import { Group, Vector3 } from 'three';
import { Animator } from '@/animation/Animator';
import { buildClipSet, type ClipSet } from '@/animation/HumanoidClips';
import { JOINT_INDEX } from '@/animation/Skeleton';
import { clamp, damp, dampAngle, yawFromDir } from '@/core/MathUtils';
import type { GameContext } from '@/core/GameContext';
import { CharacterMotor } from '@/physics/CharacterMotor';
import type { AttackData, HitReaction } from '@/combat/AttackData';
import type { DamageSource } from '@/combat/DamageCalculator';
import type { Absorptions, DirectDamageType, StatusResistances } from '@/combat/DamageTypes';
import type { Attributes } from '@/rpg/Attributes';
import { addModifiers, emptyModifiers, type Buff, type Modifiers } from '@/rpg/Modifiers';
import { DIRECT_DAMAGE_TYPES } from '@/combat/DamageTypes';
import type { WeaponData } from '@/items/ItemTypes';
import { buildWeapon, type WeaponModel } from '@/render/WeaponModels';
import { SlashTrail } from '@/vfx/SlashTrail';
import { HumanoidRig, type HumanoidAppearance } from './HumanoidRig';
import { CapeCloth } from './CapeCloth';
import { banneredClothTexture } from '@/render/TextureFactory';

export type Faction = 'player' | 'enemy';

/** Live attack being performed by a character. */
export interface AttackInstance {
  data: AttackData;
  time: number;
  hitTargets: Set<Character>;
  shockwaveDone: boolean;
  /** Damage multiplier from charging heavy attacks. */
  chargeMul: number;
  /** For jump/plunge: active window held open until landing. */
  holdActive: boolean;
  telegraphed: boolean;
  /** Ground-warning handle for area attacks (−1 = none yet). */
  zone: number;
}

export interface CharacterConfig {
  name: string;
  faction: Faction;
  appearance: HumanoidAppearance;
  stance: 'heir' | 'revenant' | 'knight';
  maxHp: number;
  maxStamina: number;
  maxMana: number;
  maxPoise: number;
  defense: Partial<Record<DirectDamageType, number>>;
  absorption: Absorptions;
  statusResist: StatusResistances;
  weapon: WeaponData;
  radius?: number;
}

/**
 * Shared character runtime: vitals, poise, statuses, motor, rig/animator, weapon & hit
 * segment, and generic hit handling. Player and AI subclasses add their own state machine
 * and decide how to react through the abstract `react*` hooks.
 */
export abstract class Character {
  private static nextId = 1;
  readonly id = Character.nextId++;
  readonly name: string;
  readonly faction: Faction;
  readonly model = new Group();
  rig: HumanoidRig;
  readonly animator = new Animator();
  readonly clips: ClipSet;
  readonly motor: CharacterMotor;
  readonly stance: 'heir' | 'revenant' | 'knight';
  cape: CapeCloth | null = null;
  facing = 0;

  hp: number;
  maxHp: number;
  stamina: number;
  maxStamina: number;
  mana: number;
  maxMana: number;
  poise: number;
  maxPoise: number;
  defense: Partial<Record<DirectDamageType, number>>;
  absorption: Absorptions;
  statusResist: StatusResistances;
  buildup = { poison: 0, bleed: 0 };
  poisonTimer = 0;
  staminaRegenDelay = 0;
  staminaRegenRate = 42;
  poiseRegenDelay = 0;
  damageTakenMultiplier = 1;
  damageBuff = 1;

  // --- combat flags (set by states each frame) ---
  invulnerable = false;
  guarding = false;
  parrying = false;
  hyperArmor = false;
  /** Open to a riposte (after being parried / guard broken) until this timer expires. */
  ripostableTimer = 0;
  dead = false;
  isBoss = false;
  attack: AttackInstance | null = null;

  weapon: WeaponData;
  weaponModel: WeaponModel;
  readonly trail: SlashTrail;
  readonly weaponBase = new Vector3();
  readonly weaponTip = new Vector3();
  readonly prevWeaponBase = new Vector3();
  readonly prevWeaponTip = new Vector3();
  hurtRadius: number;
  hurtHeight: number;
  /** Additive flinch (procedural hit wobble on top of the clip). */
  private flinch = 0;
  private flinchDir = 1;
  private leanZ = 0;
  protected lastFacing = 0;
  /** Seconds since this character was last hit. */
  sinceHit = 99;
  /** Modifiers from equipment (set by the owner); buffs are layered on top. */
  baseMods: Modifiers = emptyModifiers();
  readonly buffs: Buff[] = [];
  private modsCache: Modifiers | null = null;
  /** Timer of an active freeze (frost spells); characters cannot act while frozen. */
  frozen = 0;

  /** Equipment + active buffs combined. */
  get mods(): Modifiers {
    if (!this.modsCache) {
      const m = addModifiers(emptyModifiers(), this.baseMods);
      for (const b of this.buffs) addModifiers(m, b.mods);
      this.modsCache = m;
    }
    return this.modsCache;
  }

  /** Drop the cached modifier sum without triggering `onModsChanged`. */
  protected resetModsCache(): void {
    this.modsCache = null;
  }

  /** Mark modifiers stale (call after changing baseMods or buffs). */
  invalidateMods(): void {
    this.modsCache = null;
    this.onModsChanged();
  }

  /** Hook: derived stats that depend on modifiers (players recompute here). */
  protected onModsChanged(): void {}

  addBuff(b: Buff): void {
    const i = this.buffs.findIndex((x) => x.id === b.id);
    const copy: Buff = { ...b, time: 0 };
    if (i >= 0) this.buffs[i] = copy;
    else this.buffs.push(copy);
    this.invalidateMods();
  }

  /** Absorption including temporary wards. */
  get effectiveAbsorption(): Absorptions {
    const extra = this.mods.absorption;
    const out: Absorptions = {};
    for (const t of DIRECT_DAMAGE_TYPES) out[t] = 1 - (1 - (this.absorption[t] ?? 0)) * (1 - (extra[t] ?? 0));
    return out;
  }

  /** Freeze in place (frost magic). Bosses shrug it off faster. */
  freeze(seconds: number): void {
    if (this.dead) return;
    this.frozen = Math.max(this.frozen, this.isBoss ? seconds * 0.35 : seconds);
  }

  /** External push velocity (knockback, shoves) — decays exponentially. */
  readonly push = new Vector3();

  constructor(
    protected readonly ctx: GameContext,
    cfg: CharacterConfig,
  ) {
    this.name = cfg.name;
    this.faction = cfg.faction;
    this.stance = cfg.stance;
    this.rig = new HumanoidRig(cfg.appearance);
    this.model.add(this.rig.root);
    this.clips = buildClipSet(cfg.stance);
    const s = this.rig.scale;
    this.motor = new CharacterMotor(ctx.world, (cfg.radius ?? 0.36) * s, 1.8 * s, 0.42);
    this.hurtRadius = 0.4 * s;
    this.hurtHeight = 1.8 * s;
    this.maxHp = this.hp = cfg.maxHp;
    this.maxStamina = this.stamina = cfg.maxStamina;
    this.maxMana = this.mana = cfg.maxMana;
    this.maxPoise = this.poise = cfg.maxPoise;
    this.defense = cfg.defense;
    this.absorption = cfg.absorption;
    this.statusResist = cfg.statusResist;
    this.weapon = cfg.weapon;
    this.weaponModel = buildWeapon(cfg.weapon.visual);
    this.rig.weaponSocketR.add(this.weaponModel.group);
    this.trail = new SlashTrail();
    ctx.scene.add(this.trail.mesh);
    ctx.scene.add(this.model);
    this.buildCape(cfg.appearance);
    this.animator.onEvent = (name) => this.onAnimEvent(name);
    this.setOutlines(ctx.profile.outlines);
  }

  private buildCape(look: HumanoidAppearance): void {
    if (this.cape) {
      this.ctx.scene.remove(this.cape.mesh);
      this.cape = null;
    }
    if (!look.cape) return;
    const p = look.palette;
    const tex = banneredClothTexture(p.cloth, p.trim, p.clothInner);
    const cape = new CapeCloth(this.rig.capeAnchor, 0.5, 1.25, tex, this.rig.scale);
    cape.addCollider(this.rig.joint('chest'), new Vector3(0, 0.12, 0.02), 0.2);
    cape.addCollider(this.rig.joint('hips'), new Vector3(0, 0, 0.0), 0.2);
    for (const side of ['L', 'R'] as const) {
      cape.addCollider(this.rig.joint(`thigh${side}`), new Vector3(0, -0.22, 0), 0.12);
      cape.addCollider(this.rig.joint(`shin${side}`), new Vector3(0, -0.2, 0), 0.1);
    }
    this.ctx.scene.add(cape.mesh);
    this.cape = cape;
  }

  /** Replace the body model (armour changes). Pose, weapon and cape carry over. */
  rebuildRig(look: HumanoidAppearance): void {
    const old = this.rig;
    this.rig = new HumanoidRig(look);
    this.model.remove(old.root);
    this.model.add(this.rig.root);
    old.weaponSocketR.remove(this.weaponModel.group);
    this.rig.weaponSocketR.add(this.weaponModel.group);
    this.buildCape(look);
    this.setOutlines(this.ctx.profile.outlines);
  }

  setOutlines(v: boolean): void {
    this.rig.setOutlines(v);
    this.weaponModel.group.traverse((o) => {
      if (o.name === 'outline') o.visible = v;
    });
  }

  equipWeapon(w: WeaponData): void {
    this.rig.weaponSocketR.remove(this.weaponModel.group);
    this.weapon = w;
    this.weaponModel = buildWeapon(w.visual);
    this.rig.weaponSocketR.add(this.weaponModel.group);
    this.setOutlines(this.ctx.profile.outlines);
  }

  get position(): Vector3 {
    return this.motor.position;
  }

  get alive(): boolean {
    return !this.dead;
  }

  /** World-space point the camera locks on to. */
  lockPoint(out: Vector3): Vector3 {
    return out.set(this.position.x, this.position.y + this.rig.eyeHeight * 0.82, this.position.z);
  }

  /** Chest-height point for projectiles and effects. */
  centerPoint(out: Vector3): Vector3 {
    return out.set(this.position.x, this.position.y + this.hurtHeight * 0.6, this.position.z);
  }

  /** Attributes for stat scaling (players); enemies return undefined (flat damage). */
  abstract get attributes(): Attributes | undefined;

  /** Guard stats used when blocking (weapon by default; shields override). */
  get guardAbsorption(): Absorptions {
    return this.weapon.guard;
  }
  get guardBoost(): number {
    return this.weapon.guardBoost;
  }

  /** Damage source used for melee attacks (weapon + extra). */
  damageSource(): DamageSource {
    const extra = this.mods.weaponExtra;
    const keys = Object.keys(extra);
    if (!keys.length) return this.weapon;
    const base = { ...this.weapon.base };
    for (const k of keys) base[k as keyof typeof base] = (base[k as keyof typeof base] ?? 0) + (extra[k as keyof typeof extra] ?? 0);
    return { ...this.weapon, base };
  }

  // ---------------------------------------------------------------------------------
  // Hooks for subclasses (state machine transitions)
  // ---------------------------------------------------------------------------------
  abstract reactToHit(reaction: HitReaction, from: Vector3): void;
  abstract reactGuardBreak(): void;
  abstract reactParried(by: Character): void;
  abstract reactDeath(killer: Character | null): void;
  /** Called when this character's attack is blocked by a sturdy guard. */
  reactAttackBlocked(): void {}
  protected onAnimEvent(name: string): void {
    if (name === 'footstep') this.onFootstep();
  }
  protected onFootstep(): void {}

  // ---------------------------------------------------------------------------------
  // Resource helpers
  // ---------------------------------------------------------------------------------
  spendStamina(amount: number, delay = 0.65): void {
    this.stamina -= amount;
    if (this.stamina < -10) this.stamina = -10;
    this.staminaRegenDelay = Math.max(this.staminaRegenDelay, delay);
  }

  heal(amount: number): void {
    this.hp = Math.min(this.maxHp, this.hp + amount);
  }

  restoreAll(): void {
    this.hp = this.maxHp;
    this.stamina = this.maxStamina;
    this.mana = this.maxMana;
    this.poise = this.maxPoise;
    this.buildup.poison = this.buildup.bleed = 0;
    this.poisonTimer = 0;
  }

  /** Is `point` within ±halfAngle of this character's facing? */
  isFacing(point: Vector3, halfAngle: number): boolean {
    const dx = point.x - this.position.x;
    const dz = point.z - this.position.z;
    const yaw = yawFromDir(dx, dz);
    let d = yaw - this.facing;
    d = Math.atan2(Math.sin(d), Math.cos(d));
    return Math.abs(d) <= halfAngle;
  }

  faceTowards(point: Vector3, maxStep = Infinity): void {
    const dx = point.x - this.position.x;
    const dz = point.z - this.position.z;
    if (dx * dx + dz * dz < 1e-6) return;
    const target = yawFromDir(dx, dz);
    let d = target - this.facing;
    d = Math.atan2(Math.sin(d), Math.cos(d));
    this.facing += clamp(d, -maxStep, maxStep);
  }

  distanceTo(o: Character): number {
    return Math.hypot(o.position.x - this.position.x, o.position.z - this.position.z);
  }

  /** Applies a hit's numbers; returns true if this killed the character. */
  applyDamage(amount: number, killer: Character | null): boolean {
    if (this.dead) return false;
    this.hp -= amount;
    this.sinceHit = 0;
    if (this.hp <= 0) {
      this.hp = 0;
      this.dead = true;
      this.attack = null;
      this.trail.emitting = false;
      this.reactDeath(killer);
      this.ctx.events.emit('died', { character: this, killer });
      return true;
    }
    return false;
  }

  /** Adds procedural flinch so even hyper-armoured hits read visually. */
  addFlinch(amount: number, fromLeft: boolean): void {
    this.flinch = Math.min(1, this.flinch + amount);
    this.flinchDir = fromLeft ? 1 : -1;
  }

  // ---------------------------------------------------------------------------------
  // Frame update
  // ---------------------------------------------------------------------------------
  protected abstract updateState(dt: number): void;

  update(dt: number): void {
    this.sinceHit += dt;
    if (!this.dead) this.updateVitals(dt);
    if (this.frozen > 0 && !this.dead) {
      // Encased in frost: no actions, no animation; ice crystals drift off.
      this.motor.desiredVelocity.set(0, 0, 0);
      this.attack = null;
      this.trail.emitting = false;
      this.guarding = false;
      if (Math.random() < dt * 14) {
        const c = this.centerPoint(new Vector3());
        this.ctx.vfx.sparks.emit(c.add(new Vector3((Math.random() - 0.5) * 0.6, (Math.random() - 0.3) * 1.2, (Math.random() - 0.5) * 0.6)), new Vector3(0, 0.4, 0), '#bfe8ff', 0.8, 0.1, -0.2, 1);
      }
      this.motor.update(dt);
      this.syncTransform(dt);
      this.updateAnimation(0);
      this.updateWeaponSegment(dt);
      return;
    }
    this.updateState(dt);
    if (this.push.lengthSq() > 1e-4) {
      this.motor.desiredVelocity.x += this.push.x;
      this.motor.desiredVelocity.z += this.push.z;
      this.push.multiplyScalar(Math.exp(-7 * dt));
    }
    this.motor.update(dt);
    this.syncTransform(dt);
    this.updateAnimation(dt);
    this.updateWeaponSegment(dt);
  }

  private updateVitals(dt: number): void {
    // Buffs & regeneration
    if (this.buffs.length) {
      let expired = false;
      for (const b of this.buffs) {
        b.time += dt;
        if (b.time >= b.duration) expired = true;
      }
      if (expired) {
        for (let i = this.buffs.length - 1; i >= 0; i--) if (this.buffs[i].time >= this.buffs[i].duration) this.buffs.splice(i, 1);
        this.invalidateMods();
      }
    }
    const m = this.mods;
    if (m.hpRegen > 0) this.hp = Math.min(this.maxHp, this.hp + m.hpRegen * dt);
    if (m.manaRegen > 0) this.mana = Math.min(this.maxMana, this.mana + m.manaRegen * dt);
    if (this.frozen > 0) this.frozen = Math.max(0, this.frozen - dt);
    // Stamina
    if (this.staminaRegenDelay > 0) this.staminaRegenDelay -= dt;
    else {
      const rate = this.staminaRegenRate * this.mods.staminaRegenMul * (this.guarding ? 0.35 : 1);
      this.stamina = Math.min(this.maxStamina, this.stamina + rate * dt);
    }
    // Poise regenerates after a short delay without being hit.
    if (this.poiseRegenDelay > 0) this.poiseRegenDelay -= dt;
    else this.poise = Math.min(this.maxPoise, this.poise + this.maxPoise * 0.5 * dt);
    // Status build-up decays slowly.
    this.buildup.poison = Math.max(0, this.buildup.poison - 6 * dt);
    this.buildup.bleed = Math.max(0, this.buildup.bleed - 8 * dt);
    if (this.poisonTimer > 0) {
      this.poisonTimer -= dt;
      const dps = Math.max(4, this.maxHp * 0.012);
      this.hp = Math.max(1, this.hp - dps * dt);
    }
    if (this.ripostableTimer > 0) this.ripostableTimer -= dt;
  }

  private syncTransform(dt: number): void {
    // Teleports (fast travel, respawn) must not drag cloth across the map.
    if (this.model.position.distanceToSquared(this.motor.position) > 9) this.cape?.reset();
    this.model.position.copy(this.motor.position);
    // Lean into turns (anime-style dynamic silhouette).
    const turnRate = Math.atan2(Math.sin(this.facing - this.lastFacing), Math.cos(this.facing - this.lastFacing)) / Math.max(dt, 1e-4);
    this.lastFacing = this.facing;
    const speed = Math.hypot(this.motor.velocity.x, this.motor.velocity.z);
    this.leanZ = damp(this.leanZ, clamp(-turnRate * speed * 0.012, -0.22, 0.22), 8, dt);
    this.model.rotation.y = dampAngle(this.model.rotation.y, this.facing, 30, dt);
  }

  private updateAnimation(dt: number): void {
    // Distance LOD: full detail near the camera, simplified farther away.
    const cam = this.ctx.camera.camera.position;
    const d = Math.hypot(cam.x - this.position.x, cam.z - this.position.z);
    this.rig.setLod(d < 14 ? 0 : d < 32 ? 1 : 2);
    const pose = this.animator.update(dt);
    if (this.flinch > 0.001) {
      const f = this.flinch;
      pose.addEuler(JOINT_INDEX.spine, -0.25 * f, 0.2 * f * this.flinchDir, 0.1 * f * this.flinchDir);
      pose.addEuler(JOINT_INDEX.head, -0.3 * f, 0.2 * f * this.flinchDir, 0);
      this.flinch = Math.max(0, this.flinch - dt * 4.5);
    }
    if (Math.abs(this.leanZ) > 0.001) pose.addEuler(JOINT_INDEX.hips, 0, 0, this.leanZ);
    this.rig.applyPose(pose);
    this.model.updateMatrixWorld(true);
    this.cape?.update(dt);
  }

  private updateWeaponSegment(dt: number): void {
    this.prevWeaponBase.copy(this.weaponBase);
    this.prevWeaponTip.copy(this.weaponTip);
    const g = this.weaponModel.group;
    this.weaponBase.set(0, this.weaponModel.hitBase, 0);
    this.weaponTip.set(0, this.weaponModel.hitTip, 0);
    g.localToWorld(this.weaponBase);
    g.localToWorld(this.weaponTip);
    this.trail.update(dt, this.weaponBase, this.weaponTip);
  }

  /** Remove from the scene permanently (despawn). */
  dispose(): void {
    this.ctx.scene.remove(this.model);
    this.ctx.scene.remove(this.trail.mesh);
    if (this.cape) this.ctx.scene.remove(this.cape.mesh);
  }

  /** Hook: struck by a hit that did not break poise (bosses may counter). */
  onStruck(_attacker: Character | null): void {
    void _attacker;
  }

  setVisible(v: boolean): void {
    this.model.visible = v;
    this.trail.mesh.visible = v && this.trail.mesh.visible;
    this.cape?.setVisible(v);
  }
}
