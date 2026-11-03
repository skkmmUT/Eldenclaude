import { Vector3 } from 'three';
import { BlendSpace1D } from '@/animation/Animator';
import { attackClip } from '@/animation/HumanoidClips';
import { UPPER_BODY_MASK } from '@/animation/Skeleton';
import type { GameContext } from '@/core/GameContext';
import { angleDelta, clamp, damp, moveTowards, rotateTowardsAngle, yawFromDir } from '@/core/MathUtils';
import type { InputManager } from '@/input/InputManager';
import { InputBuffer } from '@/input/InputBuffer';
import { getAttack } from '@/data/attacks';
import { CONSUMABLES } from '@/data/items';
import { APPEARANCES } from '@/data/appearances';
import type { AttackData, HitReaction } from '@/combat/AttackData';
import type { Attributes } from '@/rpg/Attributes';
import { PlayerProgress } from '@/rpg/PlayerProgress';
import { Inventory } from '@/items/Inventory';
import type { SpellData } from '@/magic/SpellTypes';
import type { Interactable } from '@/world/Interactable';
import { Character } from '../Character';

export type PlayerState =
  | 'locomotion'
  | 'air'
  | 'airAttack'
  | 'land'
  | 'dodge'
  | 'attack'
  | 'parry'
  | 'hit'
  | 'item'
  | 'cast'
  | 'critical'
  | 'rest'
  | 'dead';

const WALK = 1.65;
const RUN = 4.3;
const SPRINT = 6.4;
const GUARD_WALK = 1.9;
const SPRINT_HOLD = 0.24;

/** Interface the player uses to reach enemies (riposte / backstab victims). */
export interface CriticalVictim {
  enterCriticalVictim(by: Character, backstab: boolean): void;
  canBeBackstabbed(): boolean;
}

export class Player extends Character {
  readonly progress = new PlayerProgress();
  readonly inventory = new Inventory();
  readonly buffer = new InputBuffer(0.36);
  state: PlayerState = 'locomotion';
  stateTime = 0;
  lockTarget: Character | null = null;
  walkToggle = false;
  sprinting = false;
  private sprintEngaged = false;
  private speed = 0;
  private readonly locomotion: BlendSpace1D;
  private readonly moveDir = new Vector3();
  private readonly camF = new Vector3();
  private readonly camR = new Vector3();
  private readonly tmp = new Vector3();
  private readonly tmp2 = new Vector3();
  // dodge
  private dodgeKind: 'roll' | 'backstep' = 'roll';
  private dodgeYaw = 0;
  private lastDodgeEnd = -10;
  // hit
  private hitDuration = 0;
  private hitInvuln: [number, number] | null = null;
  // item / spell
  private itemApplied = false;
  private spell: SpellData | null = null;
  private spellReleased = false;
  private spellCooldowns = new Map<string, number>();
  // charge
  private chargeTime = 0;
  // critical
  private critTarget: Character | null = null;
  private critDone = false;
  // air
  private airAttackKind: 'jump' | 'plunge' = 'jump';
  private landDuration = 0.3;
  // rest
  private resting = false;
  private rising = false;
  private lockSwitchAccum = 0;
  private lockSwitchCooldown = 0;
  private lostSightTime = 0;
  /** Nearest interactable with a valid prompt (HUD shows it). */
  focus: Interactable | null = null;
  focusPrompt: string | null = null;
  interactables: () => Interactable[] = () => [];
  /** Hook to open the altar menu etc. */
  onRestBegin: (() => void) | null = null;
  respawnPoint = new Vector3();
  respawnYaw = 0;
  /** Set by the HUD/menus to suppress gameplay input. */
  inputLocked = false;
  noiseTimer = 0;

  constructor(
    ctx: GameContext,
    readonly input: InputManager,
  ) {
    const progress = new PlayerProgress();
    const d = progress.derived();
    const inv = new Inventory();
    super(ctx, {
      name: 'Nameless Heir',
      faction: 'player',
      appearance: APPEARANCES.heir,
      stance: 'heir',
      maxHp: d.maxHp,
      maxStamina: d.maxStamina,
      maxMana: d.maxMana,
      maxPoise: 12,
      defense: d.defense,
      absorption: { physical: 0.14, fire: 0.1, ice: 0.1, lightning: 0.08, holy: 0.08, dark: 0.12, arcane: 0.1 },
      statusResist: d.statusResist,
      weapon: inv.weapon,
      radius: 0.36,
    });
    this.locomotion = new BlendSpace1D([
      { clip: this.clips.idle, value: 0 },
      { clip: this.clips.walk, value: WALK },
      { clip: this.clips.run, value: RUN },
      { clip: this.clips.sprint, value: SPRINT },
    ]);
    this.animator.playBlendSpace(this.locomotion, 'locomotion', 0);
    this.animator.setLayer('guard', this.clips.guardSword, 0, UPPER_BODY_MASK);
    this.staminaRegenRate = 46;
  }

  get attributes(): Attributes {
    return this.progress.attributes;
  }

  /** Re-derive vitals after level-up or loading. */
  applyProgress(fill = true): void {
    const d = this.progress.derived();
    this.maxHp = d.maxHp;
    this.maxStamina = d.maxStamina;
    this.maxMana = d.maxMana;
    this.defense = d.defense;
    this.statusResist = d.statusResist;
    if (fill) this.restoreAll();
    else {
      this.hp = Math.min(this.hp, this.maxHp);
      this.stamina = Math.min(this.stamina, this.maxStamina);
      this.mana = Math.min(this.mana, this.maxMana);
    }
  }

  get isGrounded(): boolean {
    return this.motor.grounded;
  }

  // ===================================================================================
  // State machine
  // ===================================================================================
  private enter(state: PlayerState): void {
    // Exit cleanup
    if (this.state === 'attack' || this.state === 'airAttack' || this.state === 'critical') {
      this.attack = null;
      this.trail.emitting = false;
      this.hyperArmor = false;
      this.motor.gravityScale = 1;
    }
    if (this.state === 'dodge' || this.state === 'critical' || this.state === 'hit') this.invulnerable = false;
    if (this.state === 'parry') this.parrying = false;
    if (this.state === 'dodge') this.lastDodgeEnd = this.ctx.time.time;
    this.state = state;
    this.stateTime = 0;
    this.guarding = false;
    if (state === 'locomotion') this.animator.playBlendSpace(this.locomotion, 'locomotion', 0.22);
  }

  protected updateState(dt: number): void {
    this.stateTime += dt;
    this.motor.desiredVelocity.set(0, 0, 0);
    if (this.noiseTimer > 0) this.noiseTimer -= dt;
    for (const [k, v] of this.spellCooldowns) this.spellCooldowns.set(k, Math.max(0, v - dt));

    if (!this.dead && !this.inputLocked) {
      this.readIntents();
      this.updateLockOn(dt);
      this.updateFocus();
    }

    switch (this.state) {
      case 'locomotion':
        this.updateLocomotion(dt);
        break;
      case 'air':
        this.updateAir(dt);
        break;
      case 'airAttack':
        this.updateAirAttack(dt);
        break;
      case 'land':
        this.updateLand(dt);
        break;
      case 'dodge':
        this.updateDodge(dt);
        break;
      case 'attack':
        this.updateAttack(dt);
        break;
      case 'parry':
        this.updateParry();
        break;
      case 'hit':
        this.updateHit();
        break;
      case 'item':
        this.updateItem(dt);
        break;
      case 'cast':
        this.updateCast(dt);
        break;
      case 'critical':
        this.updateCritical(dt);
        break;
      case 'rest':
        this.updateRest();
        break;
      case 'dead':
        break;
    }
    this.animator.setLayer('guard', this.clips.guardSword, this.guarding ? 1 : 0, UPPER_BODY_MASK, 0.1);

    // Fell out of the world.
    if (!this.dead && this.position.y <= this.ctx.world.killY + 0.5) this.applyDamage(this.hp + 1, null);
  }

  // ===================================================================================
  // Input → buffered intents
  // ===================================================================================
  private readIntents(): void {
    const inp = this.input;
    const now = this.ctx.time.time;
    // Interaction takes priority over jump on shared bindings (gamepad A).
    if (inp.pressed('Interact') && this.focus && (this.state === 'locomotion')) {
      inp.consume('Jump');
      this.focus.interact(this);
      return;
    }
    if (inp.pressed('LightAttack')) this.buffer.push('light', now);
    if (inp.pressed('HeavyAttack')) this.buffer.push('heavy', now);
    if (inp.pressed('Jump')) this.buffer.push('jump', now);
    if (inp.pressed('UseItem')) this.buffer.push('item', now);
    if (inp.pressed('CastSpell')) this.buffer.push('spell', now);
    if (inp.pressed('Parry')) this.buffer.push('parry', now);
    if (inp.pressed('ToggleWalk')) this.walkToggle = !this.walkToggle;
    if (inp.pressed('CycleItem')) {
      this.inventory.cycleItem();
    }
    if (inp.pressed('CycleSpell')) {
      this.inventory.cycleSpell();
    }
    if (inp.pressed('SwitchWeapon') && this.state === 'locomotion' && this.inventory.weapons.length > 1) {
      this.equipWeapon(this.inventory.cycleWeapon());
      this.ctx.events.emit('notify', { text: this.weapon.name, kind: 'item' });
    }
    // Dodge vs sprint on the same button: tap = dodge (on release), hold = sprint.
    if (inp.pressed('DodgeSprint')) this.sprintEngaged = false;
    if (inp.held('DodgeSprint') && inp.holdTime('DodgeSprint') >= SPRINT_HOLD && this.hasMoveInput()) this.sprintEngaged = true;
    if (inp.released('DodgeSprint') && !this.sprintEngaged) {
      this.buffer.push(this.hasMoveInput() ? 'dodge' : 'backstep', now);
    }
  }

  private hasMoveInput(): boolean {
    return Math.hypot(this.input.move.x, this.input.move.y) > 0.15;
  }

  /** World-space movement intent from camera-relative stick/keys. Returns magnitude. */
  private computeMoveDir(): number {
    const cam = this.ctx.camera;
    cam.forward(this.camF);
    cam.right(this.camR);
    const m = this.inputLocked ? { x: 0, y: 0 } : this.input.move;
    this.moveDir.set(0, 0, 0).addScaledVector(this.camF, m.y).addScaledVector(this.camR, m.x);
    const mag = Math.min(1, this.moveDir.length());
    if (mag > 1e-3) this.moveDir.normalize();
    return mag;
  }

  /** Try to start whatever the buffer asks for from a neutral state. Returns true if acted. */
  private tryNeutralActions(): boolean {
    const now = this.ctx.time.time;
    const intent = this.buffer.peek(now);
    if (!intent) return false;
    switch (intent) {
      case 'light':
      case 'heavy': {
        this.buffer.consume(intent, now);
        if (intent === 'light' && this.tryCritical()) return true;
        return this.startGroundAttack(intent);
      }
      case 'dodge':
      case 'backstep':
        this.buffer.consume(intent, now);
        return this.startDodge(intent === 'dodge' ? 'roll' : 'backstep');
      case 'jump':
        this.buffer.consume('jump', now);
        return this.startJump();
      case 'item':
        this.buffer.consume('item', now);
        return this.startItem();
      case 'spell':
        this.buffer.consume('spell', now);
        return this.startCast();
      case 'parry':
        this.buffer.consume('parry', now);
        return this.startParry();
    }
    return false;
  }

  // ===================================================================================
  // Locomotion
  // ===================================================================================
  private updateLocomotion(dt: number): void {
    if (!this.motor.grounded) {
      this.enter('air');
      this.animator.play(this.clips.fall, 0.25);
      return;
    }
    if (this.tryNeutralActions()) return;

    const mag = this.computeMoveDir();
    const wantsGuard = !this.inputLocked && this.input.held('Block');
    this.guarding = wantsGuard;
    const canSprint = this.sprintEngaged && this.input.held('DodgeSprint') && this.stamina > 0 && !wantsGuard && mag > 0.2;
    if (canSprint) {
      this.sprinting = true;
      this.spendStamina(15 * dt, 0.4);
    } else {
      if (this.sprinting && this.stamina <= 0) this.sprintEngaged = false;
      this.sprinting = false;
    }
    let target = 0;
    if (mag > 0.05) {
      if (this.sprinting) target = SPRINT;
      else if (wantsGuard) target = GUARD_WALK * mag;
      else if (this.walkToggle || mag < 0.5) target = WALK * Math.max(mag, 0.6);
      else target = RUN * mag;
    }
    const accel = target > this.speed ? 16 : 22;
    this.speed = moveTowards(this.speed, target, accel * dt);
    if (this.speed > 0.01 && mag > 0.05) {
      this.motor.desiredVelocity.copy(this.moveDir).multiplyScalar(this.speed);
    } else if (this.speed > 0.01) {
      // decelerating: keep sliding along facing
      this.motor.desiredVelocity.set(Math.sin(this.facing) * this.speed, 0, Math.cos(this.facing) * this.speed);
    }

    const locked = this.lockTarget && !this.sprinting;
    if (locked && this.lockTarget) {
      const t = this.lockTarget.position;
      this.facing = rotateTowardsAngle(this.facing, yawFromDir(t.x - this.position.x, t.z - this.position.z), 12 * dt);
    } else if (mag > 0.05) {
      this.facing = rotateTowardsAngle(this.facing, yawFromDir(this.moveDir.x, this.moveDir.z), (this.sprinting ? 9 : 14) * dt);
    }
    // Locomotion blend: backwards when strafing away from the locked target.
    let param = this.speed;
    if (locked && mag > 0.05) {
      const rel = angleDelta(this.facing, yawFromDir(this.moveDir.x, this.moveDir.z));
      if (Math.abs(rel) > 2.0) param = this.speed; // walking backward uses reversed phase below
    }
    this.locomotion.param = param;
    this.ctx.camera.distanceBias = damp(this.ctx.camera.distanceBias, this.sprinting ? 0.6 : 0, 3, dt);
  }

  protected override onFootstep(): void {
    if (this.state !== 'locomotion') return;
    const radius = this.sprinting ? 9 : this.speed > 3 ? 5 : 1.5;
    this.emitNoise(radius);
    if (this.sprinting) this.ctx.vfx.dust(this.tmp.copy(this.position).setY(this.position.y + 0.05), 0.35);
  }

  emitNoise(radius: number): void {
    this.ctx.events.emit('noise', { x: this.position.x, y: this.position.y, z: this.position.z, radius, source: this });
  }

  // ===================================================================================
  // Jump / air / landing
  // ===================================================================================
  private startJump(): boolean {
    if (this.stamina <= 0 || !this.motor.grounded) return false;
    this.spendStamina(10);
    this.enter('air');
    const mag = this.computeMoveDir();
    const horiz = Math.max(this.speed, mag > 0.1 ? RUN * 0.6 : 0);
    if (mag > 0.1) this.motor.desiredVelocity.copy(this.moveDir).multiplyScalar(horiz);
    this.airVel.copy(mag > 0.1 ? this.moveDir : this.tmp.set(0, 0, 0)).multiplyScalar(horiz);
    if (mag > 0.1) this.facing = yawFromDir(this.moveDir.x, this.moveDir.z);
    this.motor.velocity.y = 7.6;
    this.animator.play(this.clips.jump, 0.08);
    return true;
  }

  private readonly airVel = new Vector3();

  private updateAir(dt: number): void {
    this.airControl(dt);
    const now = this.ctx.time.time;
    const intent = this.buffer.peek(now);
    if (intent === 'light' || intent === 'heavy') {
      this.buffer.consume(intent, now);
      const plunge = this.motor.velocity.y < 0 && this.motor.heightAboveGround() > 2.2;
      this.startAirAttack(plunge ? 'plunge' : 'jump');
      return;
    }
    if (this.animator.isPlaying('jump') && this.motor.velocity.y < -1) this.animator.play(this.clips.fall, 0.3);
    if (this.motor.justLanded || this.motor.grounded) this.land();
  }

  private airControl(dt: number): void {
    const mag = this.computeMoveDir();
    if (mag > 0.1) {
      this.airVel.addScaledVector(this.moveDir, 6 * dt);
      const max = Math.max(RUN * 0.9, Math.hypot(this.airVel.x, this.airVel.z) - 2 * dt);
      const l = Math.hypot(this.airVel.x, this.airVel.z);
      if (l > max) this.airVel.multiplyScalar(max / l);
    }
    this.motor.desiredVelocity.set(this.airVel.x, 0, this.airVel.z);
  }

  private land(): void {
    const fall = this.motor.lastFallHeight;
    this.airVel.set(0, 0, 0);
    this.speed = 0;
    this.emitNoise(fall > 2 ? 8 : 4);
    if (fall > 6) {
      const dmg = fall > 14 ? this.hp + 1 : Math.round(this.maxHp * (fall - 6) * 0.07);
      this.applyDamage(dmg, null);
      if (this.dead) return;
    }
    if (fall > 2.5) {
      this.ctx.vfx.dust(this.position, 0.8);
      this.ctx.camera.shake.add(Math.min(0.5, fall * 0.06));
      this.enter('land');
      this.landDuration = fall > 5 ? 0.55 : 0.3;
      this.animator.play(this.clips.land, 0.05);
    } else {
      this.enter('locomotion');
    }
  }

  private updateLand(_dt: number): void {
    void _dt;
    if (this.stateTime >= this.landDuration) this.enter('locomotion');
  }

  private startAirAttack(kind: 'jump' | 'plunge'): void {
    const id = kind === 'plunge' ? this.weapon.moveset.plunge : this.weapon.moveset.jump;
    const data = getAttack(id);
    if (data.staminaCost > 0) this.spendStamina(data.staminaCost);
    this.enter('airAttack');
    this.airAttackKind = kind;
    const inst = this.ctx.combat.begin(this, data);
    this.animator.play(attackClip(data, this.stance), 0.06);
    if (kind === 'plunge') {
      this.motor.velocity.y = Math.min(this.motor.velocity.y, -6);
      this.motor.gravityScale = 1.7;
      this.airVel.multiplyScalar(0.3);
    }
    inst.holdActive = false;
    this.lockFacing();
  }

  private updateAirAttack(dt: number): void {
    const atk = this.attack;
    if (!atk) {
      this.enter('locomotion');
      return;
    }
    const d = atk.data;
    const grounded = this.motor.grounded;
    if (!grounded) {
      this.airControl(dt * 0.4);
      atk.time = Math.min(atk.time + dt, d.startup);
      if (atk.time >= d.startup) atk.holdActive = true;
      return;
    }
    // Landed
    if (atk.holdActive || atk.time <= d.startup) {
      atk.holdActive = false;
      const recoveryStart = d.startup + d.active;
      atk.time = recoveryStart;
      this.airVel.set(0, 0, 0);
      if (this.airAttackKind === 'plunge') {
        const c = this.tmp.set(this.position.x + Math.sin(this.facing) * 0.4, this.position.y, this.position.z + Math.cos(this.facing) * 0.4);
        this.ctx.combat.shockwave(this, c, d.shockwave?.radius ?? 2.4, d, 1, atk.hitTargets);
        this.ctx.camera.fovKick = 7;
      } else {
        this.ctx.vfx.dust(this.position, 0.6);
      }
      this.emitNoise(10);
      this.animator.play(attackClip(d, this.stance), 0.04, 1, recoveryStart);
    }
    atk.time += dt;
    if (atk.time >= d.startup + d.active + d.recovery) this.enter('locomotion');
    else if (atk.time >= d.dodgeCancel && this.tryDodgeCancel()) return;
  }

  // ===================================================================================
  // Dodge
  // ===================================================================================
  private startDodge(kind: 'roll' | 'backstep'): boolean {
    if (this.stamina <= 0) return false;
    this.spendStamina(kind === 'roll' ? 16 : 10, 0.7);
    this.enter('dodge');
    this.dodgeKind = kind;
    const mag = this.computeMoveDir();
    if (kind === 'roll') {
      this.dodgeYaw = mag > 0.1 ? yawFromDir(this.moveDir.x, this.moveDir.z) : this.facing;
      this.facing = this.dodgeYaw;
      this.animator.play(this.clips.roll, 0.06);
      this.emitNoise(5);
    } else {
      this.dodgeYaw = this.facing + Math.PI;
      this.animator.play(this.clips.backstep, 0.06);
    }
    return true;
  }

  private updateDodge(_dt: number): void {
    void _dt;
    const t = this.stateTime;
    const roll = this.dodgeKind === 'roll';
    const T = roll ? 0.52 : 0.32;
    const D = roll ? 3.5 : 1.9;
    const iStart = roll ? 0.04 : 0.02;
    const iEnd = roll ? 0.4 : 0.22;
    this.invulnerable = t >= iStart && t <= iEnd;
    if (t < T) {
      const v = ((2 * D) / T) * (1 - t / T) + 0.6;
      this.motor.desiredVelocity.set(Math.sin(this.dodgeYaw) * v, 0, Math.cos(this.dodgeYaw) * v);
    }
    const total = roll ? 0.62 : 0.45;
    const cancelAt = roll ? 0.5 : 0.34;
    if (t >= cancelAt) {
      const now = this.ctx.time.time;
      const intent = this.buffer.peek(now);
      if (intent === 'light' || intent === 'heavy') {
        this.buffer.consume(intent, now);
        this.startAttackById(intent === 'light' ? this.weapon.moveset.roll : this.weapon.moveset.heavy);
        return;
      }
      if (intent === 'dodge' || intent === 'backstep') {
        this.buffer.consume(intent, now);
        this.startDodge(intent === 'dodge' ? 'roll' : 'backstep');
        return;
      }
    }
    if (!this.motor.grounded && t > 0.2) {
      this.enter('air');
      this.animator.play(this.clips.fall, 0.2);
      return;
    }
    if (t >= total) {
      this.speed = roll ? RUN * 0.6 : 0;
      this.enter('locomotion');
    }
  }

  private tryDodgeCancel(): boolean {
    const now = this.ctx.time.time;
    const intent = this.buffer.peek(now);
    if (intent === 'dodge' || intent === 'backstep') {
      this.buffer.consume(intent, now);
      return this.startDodge(intent === 'dodge' ? 'roll' : 'backstep');
    }
    return false;
  }

  // ===================================================================================
  // Attacks
  // ===================================================================================
  private startGroundAttack(kind: 'light' | 'heavy'): boolean {
    const ms = this.weapon.moveset;
    let id = kind === 'light' ? ms.light : ms.heavy;
    if (kind === 'light' && this.sprinting) id = ms.running;
    else if (kind === 'light' && this.ctx.time.time - this.lastDodgeEnd < 0.25) id = ms.roll;
    return this.startAttackById(id);
  }

  private startAttackById(id: string, chargeMul = 1): boolean {
    if (this.stamina <= 0) return false;
    const data = getAttack(id);
    this.enter('attack');
    this.sprinting = false;
    this.spendStamina(data.staminaCost, 0.75);
    this.ctx.combat.begin(this, data, chargeMul);
    this.chargeTime = 0;
    this.animator.play(attackClip(data, this.stance), 0.08);
    this.lockFacing();
    this.speed = 0;
    this.emitNoise(6);
    return true;
  }

  /** Snap facing toward the lock target or the stick at the start of an action. */
  private lockFacing(): void {
    if (this.lockTarget) {
      const t = this.lockTarget.position;
      this.facing = yawFromDir(t.x - this.position.x, t.z - this.position.z);
    } else if (this.computeMoveDir() > 0.2) {
      this.facing = yawFromDir(this.moveDir.x, this.moveDir.z);
    }
  }

  private updateAttack(dt: number): void {
    const atk = this.attack;
    if (!atk) {
      this.enter('locomotion');
      return;
    }
    let d = atk.data;
    // Charging heavy attacks: hold the windup while the button is held.
    if ((d.kind === 'heavy') && !this.inputLocked && this.input.held('HeavyAttack') && atk.time >= d.startup * 0.7 && this.chargeTime < 1.0) {
      this.chargeTime += dt;
      this.animator.setSpeed(0);
      if (Math.random() < 0.6) {
        this.ctx.vfx.sparks.emit(this.weaponTip, this.tmp.set((Math.random() - 0.5) * 0.5, 0.6 + Math.random(), (Math.random() - 0.5) * 0.5), '#ffb347', 0.4, 0.12, -1, 1);
      }
      if (this.chargeTime >= 1.0) this.releaseCharge();
      return;
    }
    if (d.kind === 'heavy' && this.chargeTime > 0) {
      this.releaseCharge();
      d = this.attack!.data;
    }
    atk.time += dt;
    const t = atk.time;
    const total = d.startup + d.active + d.recovery;
    this.hyperArmor = !!d.hyperArmor && t >= d.startup * 0.4 && t <= d.startup + d.active;

    // Tracking during startup only.
    if (t < d.startup && d.tracking > 0) {
      let want: number | null = null;
      if (this.lockTarget) want = yawFromDir(this.lockTarget.position.x - this.position.x, this.lockTarget.position.z - this.position.z);
      else if (this.computeMoveDir() > 0.3) want = yawFromDir(this.moveDir.x, this.moveDir.z);
      if (want !== null) this.facing = rotateTowardsAngle(this.facing, want, d.tracking * dt);
    }

    // Lunge (stop short of enemies so we don't pass through them).
    const l0 = d.startup * 0.4;
    const l1 = d.startup + d.active;
    if (d.lunge > 0 && t >= l0 && t <= l1 && !this.blockedAhead(0.9)) {
      const v = (d.lunge / (l1 - l0)) * 1.0;
      this.motor.desiredVelocity.set(Math.sin(this.facing) * v, 0, Math.cos(this.facing) * v);
    }

    // Combo chaining
    const now = this.ctx.time.time;
    const intent = this.buffer.peek(now);
    if (intent && d.comboWindow && t >= d.comboWindow[0] && t <= d.comboWindow[1]) {
      if (intent === 'light' && d.next) {
        this.buffer.consume('light', now);
        if (!this.tryCritical()) this.startAttackById(d.next);
        return;
      }
      if (intent === 'heavy') {
        this.buffer.consume('heavy', now);
        this.startAttackById(this.weapon.moveset.heavy);
        return;
      }
    }
    if (t >= d.dodgeCancel && this.tryDodgeCancel()) return;
    // Late recovery: allow any neutral action (feels responsive, still committal).
    if (t >= total - 0.12 && this.tryNeutralActions()) return;
    if (t >= total) this.enter('locomotion');
  }

  private releaseCharge(): void {
    const atk = this.attack!;
    this.animator.setSpeed(1);
    const charged = this.chargeTime > 0.28;
    if (charged) {
      const data: AttackData = getAttack(this.weapon.moveset.charged);
      const mul = 1 + Math.min(1, this.chargeTime) * 0.25;
      const inst = this.ctx.combat.begin(this, data, mul);
      inst.time = data.startup * 0.7;
      this.spendStamina(Math.max(0, data.staminaCost - atk.data.staminaCost), 0.8);
      this.animator.play(attackClip(data, this.stance), 0.05, 1, inst.time);
      this.ctx.vfx.flash(this.weaponTip, '#ffb347', 1.6, 0.18);
    }
    this.chargeTime = 0;
  }

  private blockedAhead(dist: number): boolean {
    for (const c of this.ctx.combat.characters) {
      if (c === this || c.dead) continue;
      const dx = c.position.x - this.position.x;
      const dz = c.position.z - this.position.z;
      const dd = Math.hypot(dx, dz);
      if (dd > dist + c.hurtRadius + this.motor.radius) continue;
      const rel = Math.abs(angleDelta(this.facing, yawFromDir(dx, dz)));
      if (rel < 0.9) return true;
    }
    return false;
  }

  // ===================================================================================
  // Critical attacks (riposte / backstab)
  // ===================================================================================
  private tryCritical(): boolean {
    for (const c of this.ctx.combat.characters) {
      if (c.faction === this.faction || c.dead) continue;
      const victim = c as unknown as Character & CriticalVictim;
      if (typeof victim.enterCriticalVictim !== 'function') continue;
      const dx = c.position.x - this.position.x;
      const dz = c.position.z - this.position.z;
      const dist = Math.hypot(dx, dz);
      if (dist > 2.1 * Math.max(1, c.rig.scale * 0.9)) continue;
      const toTarget = yawFromDir(dx, dz);
      const inFront = Math.abs(angleDelta(this.facing, toTarget)) < 0.9 || (this.lockTarget === c);
      if (!inFront) continue;
      // Riposte: target is open after a parry.
      if (c.ripostableTimer > 0) {
        this.startCritical(c, false);
        return true;
      }
      // Backstab: we are behind a target that is not mid-action.
      const behind = Math.abs(angleDelta(c.facing, toTarget)) < 0.75;
      if (behind && dist < 1.6 * c.rig.scale && victim.canBeBackstabbed()) {
        this.startCritical(c, true);
        return true;
      }
    }
    return false;
  }

  private startCritical(target: Character, backstab: boolean): void {
    const data = getAttack('critical_stab');
    this.enter('critical');
    this.critTarget = target;
    this.critDone = false;
    this.invulnerable = true;
    const toYaw = yawFromDir(target.position.x - this.position.x, target.position.z - this.position.z);
    this.facing = toYaw;
    // Snap into position in front of / behind the target.
    const gap = 1.0 + target.hurtRadius;
    const sx = target.position.x - Math.sin(toYaw) * gap;
    const sz = target.position.z - Math.cos(toYaw) * gap;
    this.motor.position.x = sx;
    this.motor.position.z = sz;
    this.ctx.combat.begin(this, data);
    this.animator.play(attackClip(data, this.stance), 0.08);
    (target as unknown as CriticalVictim).enterCriticalVictim(this, backstab);
    this.ctx.events.emit('notify', { text: backstab ? 'Backstab' : 'Riposte', kind: 'info' });
  }

  private updateCritical(dt: number): void {
    const atk = this.attack;
    if (!atk) {
      this.enter('locomotion');
      return;
    }
    atk.time += dt;
    const d = atk.data;
    if (!this.critDone && atk.time >= d.startup && this.critTarget) {
      this.critDone = true;
      this.ctx.combat.critical(this, this.critTarget, d);
    }
    if (atk.time >= d.startup + d.active + d.recovery) this.enter('locomotion');
  }

  // ===================================================================================
  // Parry
  // ===================================================================================
  private startParry(): boolean {
    if (this.stamina <= 0) return false;
    this.spendStamina(10);
    this.enter('parry');
    this.parrySucceeded = false;
    this.animator.play(this.clips.parry, 0.05);
    this.lockFacing();
    return true;
  }

  /** Set by the combat system when our parry deflected an attack. */
  parrySucceeded = false;

  private updateParry(): void {
    const t = this.stateTime;
    this.parrying = t >= 0.05 && t <= 0.25;
    // A successful parry lets you act almost immediately (riposte window).
    if (this.parrySucceeded && t >= 0.12 && this.tryNeutralActions()) return;
    if (t >= 0.62) this.enter('locomotion');
  }

  // ===================================================================================
  // Items
  // ===================================================================================
  private startItem(): boolean {
    const slot = this.inventory.currentItem;
    const data = this.inventory.currentItemData;
    if (!slot || !data) return false;
    if (slot.count <= 0) {
      this.ctx.events.emit('notify', { text: `${data.name} is empty`, kind: 'info' });
      return false;
    }
    this.enter('item');
    this.itemApplied = false;
    this.animator.play(this.clips.drink, 0.12);
    return true;
  }

  private updateItem(dt: number): void {
    const mag = this.computeMoveDir();
    if (mag > 0.1) {
      this.motor.desiredVelocity.copy(this.moveDir).multiplyScalar(1.1);
      if (!this.lockTarget) this.facing = rotateTowardsAngle(this.facing, yawFromDir(this.moveDir.x, this.moveDir.z), 6 * dt);
    }
    if (!this.itemApplied && this.stateTime >= 0.6) {
      this.itemApplied = true;
      const slot = this.inventory.currentItem;
      if (slot && slot.count > 0) {
        slot.count--;
        const data = CONSUMABLES[slot.id];
        if (data.effect.kind === 'heal') this.heal(this.maxHp * data.effect.fraction);
        else if (data.effect.kind === 'mana') this.mana = Math.min(this.maxMana, this.mana + this.maxMana * data.effect.fraction);
        else this.buildup[data.effect.status] = 0;
        const col = data.icon;
        this.ctx.vfx.soulRelease(this.centerPoint(this.tmp), col, 40);
        this.ctx.vfx.light(this.centerPoint(this.tmp), col, 4, 0.5);
      }
    }
    if (this.stateTime >= 1.25) this.enter('locomotion');
  }

  // ===================================================================================
  // Spells
  // ===================================================================================
  private startCast(): boolean {
    const spell = this.inventory.spell;
    if (!spell) return false;
    if ((this.spellCooldowns.get(spell.id) ?? 0) > 0) return false;
    if (this.mana < spell.manaCost) {
      this.ctx.events.emit('notify', { text: 'Not enough mana', kind: 'info' });
      return false;
    }
    if (this.stamina <= 0) return false;
    this.enter('cast');
    this.spell = spell;
    this.spellReleased = false;
    this.lockFacing();
    const clip = spell.gesture === 'skyward' ? this.clips.castSkyward : this.clips.castThrust;
    // Fast spells (blink) skip most of the gesture.
    this.animator.play(clip, 0.08, spell.castTime < 0.2 ? 2.4 : 1);
    return true;
  }

  private updateCast(dt: number): void {
    const s = this.spell;
    if (!s) {
      this.enter('locomotion');
      return;
    }
    const hand = this.rig.joint('handL').getWorldPosition(this.tmp2);
    if (!this.spellReleased) {
      if (this.lockTarget) {
        const t = this.lockTarget.position;
        this.facing = rotateTowardsAngle(this.facing, yawFromDir(t.x - this.position.x, t.z - this.position.z), 8 * dt);
      }
      if (Math.random() < 0.8) {
        this.ctx.vfx.sparks.emit(
          hand,
          this.tmp.set((Math.random() - 0.5) * 1.2, (Math.random() - 0.5) * 1.2, (Math.random() - 0.5) * 1.2),
          s.glyph,
          0.35,
          0.1,
          0,
          3,
        );
      }
      if (this.stateTime >= s.castTime) {
        this.spellReleased = true;
        this.mana -= s.manaCost;
        this.spendStamina(s.staminaCost);
        this.spellCooldowns.set(s.id, s.cooldown);
        this.releaseSpell(s, hand);
      }
    }
    if (this.stateTime >= s.castTime + s.recovery) this.enter('locomotion');
  }

  private releaseSpell(s: SpellData, hand: Vector3): void {
    const e = s.effect;
    const fwd = new Vector3(Math.sin(this.facing), 0, Math.cos(this.facing));
    if (e.kind === 'projectile' && s.damage) {
      const origin = hand.clone().addScaledVector(fwd, 0.3);
      const dir = fwd.clone();
      if (this.lockTarget) dir.copy(this.lockTarget.centerPoint(new Vector3()).sub(origin)).normalize();
      this.ctx.projectiles.spawn(
        this,
        origin,
        dir,
        e,
        {
          source: s.damage,
          motionValue: s.damage.motionValue,
          poiseDamage: s.damage.poiseDamage,
          reaction: 'flinch',
          parryable: false,
          guardDamage: 25,
          knockback: 0.6,
          hitStop: 0.05,
          shake: 0.18,
        },
        this.lockTarget,
      );
      this.ctx.vfx.flash(origin, e.color, 1.4, 0.15);
      this.emitNoise(7);
    } else if (e.kind === 'blink') {
      const mag = this.computeMoveDir();
      const dir = mag > 0.1 ? this.moveDir.clone() : fwd.clone().negate();
      const from = this.position.clone();
      this.ctx.vfx.soulRelease(this.centerPoint(new Vector3()), e.color, 50);
      // Walk the blink path in small steps so we never end up inside geometry.
      const step = 0.25;
      const p = { x: from.x, z: from.z };
      let y = from.y;
      for (let d = 0; d < e.distance; d += step) {
        const nx = p.x + dir.x * step;
        const nz = p.z + dir.z * step;
        const g = this.ctx.world.groundHeight(nx, nz, this.motor.radius * 0.5, y + 0.6);
        if (g === -Infinity || g < y - 1.5) break;
        const probe = { x: nx, z: nz };
        if (this.ctx.world.resolveCircle(probe, this.motor.radius, g + 0.45, g + this.motor.height)) break;
        p.x = nx;
        p.z = nz;
        y = g;
      }
      this.motor.position.set(p.x, y, p.z);
      this.invulnerable = true;
      this.blinkInvuln = 0.25;
      if (mag > 0.1 && !this.lockTarget) this.facing = yawFromDir(dir.x, dir.z);
      this.ctx.vfx.soulRelease(this.centerPoint(new Vector3()), e.color, 50);
      this.ctx.vfx.flash(this.centerPoint(new Vector3()), e.color, 2.5, 0.2);
      this.ctx.camera.shake.add(0.1);
    } else if (e.kind === 'nova' && s.damage) {
      const center = this.position.clone().addScaledVector(fwd, e.forward);
      center.y += 0.1;
      this.ctx.vfx.sparks.burst(center.clone().setY(center.y + 0.6), { count: 140, color: e.core, color2: '#ff2a6a', speed: 5, life: 0.8, size: 0.32, gravity: -3, drag: 2.2, spread: 2, radius: 0.8 });
      this.ctx.vfx.smoke.burst(center.clone().setY(center.y + 0.4), { count: 40, color: e.color, color2: '#000000', speed: 2.5, life: 1.2, size: 1.0, gravity: -1.5, drag: 2, spread: 2, radius: 0.8 });
      this.ctx.vfx.ring(center, e.radius * 1.3, e.core, 0.5);
      this.ctx.vfx.light(center.clone().setY(center.y + 1), e.core, 14, 0.6);
      this.ctx.camera.shake.add(0.25);
      this.emitNoise(9);
      for (const c of this.ctx.combat.characters) {
        if (c.faction === this.faction || c.dead) continue;
        if (Math.hypot(c.position.x - center.x, c.position.z - center.z) > e.radius + c.hurtRadius) continue;
        if (Math.abs(c.position.y - this.position.y) > 2) continue;
        const dir = new Vector3(c.position.x - this.position.x, 0, c.position.z - this.position.z).normalize();
        this.ctx.combat.resolve(
          this,
          c,
          {
            source: s.damage,
            motionValue: s.damage.motionValue,
            poiseDamage: s.damage.poiseDamage,
            reaction: 'stagger',
            parryable: false,
            guardDamage: 50,
            knockback: 1.2,
            hitStop: 0.08,
            shake: 0.3,
          },
          c.centerPoint(new Vector3()),
          dir,
        );
      }
    }
  }

  private blinkInvuln = 0;

  // ===================================================================================
  // Rest at altar
  // ===================================================================================
  beginRest(): void {
    this.enter('rest');
    this.resting = true;
    this.rising = false;
    this.lockTarget = null;
    this.animator.play(this.clips.kneel, 0.25);
    this.onRestBegin?.();
  }

  /** Kneel without opening the altar menu (opening scene, title screen). */
  beginRestSilently(): void {
    this.enter('rest');
    this.resting = true;
    this.rising = false;
    this.animator.play(this.clips.kneel, 0, 1, 10);
  }

  endRest(): void {
    if (this.state !== 'rest') return;
    this.resting = false;
    this.rising = true;
    this.stateTime = 0;
    this.animator.play(this.clips.rise, 0.2);
  }

  private updateRest(): void {
    if (this.rising && this.stateTime >= 1.05) {
      this.rising = false;
      this.enter('locomotion');
    }
  }

  get isResting(): boolean {
    return this.state === 'rest' && this.resting;
  }

  // ===================================================================================
  // Damage reactions (called by CombatSystem)
  // ===================================================================================
  reactToHit(reaction: HitReaction, from: Vector3): void {
    if (this.state === 'dead') return;
    this.enter('hit');
    this.faceTowards(from);
    this.hitInvuln = null;
    if (reaction === 'flinch') {
      this.hitDuration = 0.4;
      this.animator.play(this.clips.hitLight, 0.04);
    } else if (reaction === 'stagger') {
      this.hitDuration = 0.85;
      this.animator.play(this.clips.hitHeavy, 0.04);
    } else {
      this.hitDuration = 2.0;
      this.hitInvuln = [0.3, 1.85];
      this.animator.play(this.clips.knockdown, 0.04);
    }
  }

  reactGuardBreak(): void {
    this.enter('hit');
    this.hitDuration = 1.25;
    this.hitInvuln = null;
    this.animator.play(this.clips.guardBreak, 0.04);
  }

  reactParried(_by: Character): void {
    void _by;
    this.enter('hit');
    this.hitDuration = 1.6;
    this.animator.play(this.clips.parried, 0.04);
  }

  reactDeath(_killer: Character | null): void {
    void _killer;
    this.enter('dead');
    this.lockTarget = null;
    this.invulnerable = false;
    this.guarding = false;
    this.animator.play(this.clips.death, 0.08);
  }

  private updateHit(): void {
    if (this.hitInvuln) this.invulnerable = this.stateTime >= this.hitInvuln[0] && this.stateTime <= this.hitInvuln[1];
    if (this.stateTime >= this.hitDuration) this.enter('locomotion');
  }

  /** Respawn at the last altar. */
  respawn(): void {
    this.dead = false;
    this.applyProgress(true);
    this.inventory.refill();
    this.motor.teleport(this.respawnPoint.x, this.respawnPoint.y, this.respawnPoint.z);
    this.facing = this.respawnYaw;
    this.model.rotation.y = this.respawnYaw;
    this.attack = null;
    this.invulnerable = false;
    this.ripostableTimer = 0;
    this.speed = 0;
    this.state = 'locomotion';
    this.enter('locomotion');
    this.animator.reset();
    this.animator.playBlendSpace(this.locomotion, 'locomotion', 0);
    this.cape?.reset();
    this.ctx.camera.snapBehind(this.respawnYaw);
  }

  // ===================================================================================
  // Lock-on
  // ===================================================================================
  private lockCandidates(): Character[] {
    return this.ctx.combat.characters.filter((c) => c.faction !== this.faction && !c.dead);
  }

  private scoreCandidate(c: Character, camYaw: number): number {
    const dx = c.position.x - this.position.x;
    const dz = c.position.z - this.position.z;
    const dist = Math.hypot(dx, dz);
    if (dist > 26) return -Infinity;
    const ang = Math.abs(angleDelta(camYaw, yawFromDir(dx, dz)));
    if (ang > 1.1) return -Infinity;
    const eye = this.tmp.set(this.position.x, this.position.y + 1.5, this.position.z);
    const p = c.lockPoint(this.tmp2);
    if (!this.ctx.world.lineOfSight(eye.x, eye.y, eye.z, p.x, p.y, p.z)) return -Infinity;
    return -(ang * 8 + dist * 0.35);
  }

  private updateLockOn(dt: number): void {
    const inp = this.input;
    const camYaw = this.ctx.camera.yaw;
    if (inp.pressed('LockOn')) {
      if (this.lockTarget) this.lockTarget = null;
      else {
        let best: Character | null = null;
        let bestScore = -Infinity;
        for (const c of this.lockCandidates()) {
          const s = this.scoreCandidate(c, camYaw);
          if (s > bestScore) {
            bestScore = s;
            best = c;
          }
        }
        this.lockTarget = best;
        if (!best) this.ctx.camera.snapBehind(this.facing);
      }
    }
    const t = this.lockTarget;
    if (!t) return;
    if (t.dead || t.distanceTo(this) > 30) {
      this.lockTarget = null;
      return;
    }
    const eye = this.tmp.set(this.position.x, this.position.y + 1.5, this.position.z);
    const p = t.lockPoint(this.tmp2);
    if (!this.ctx.world.lineOfSight(eye.x, eye.y, eye.z, p.x, p.y, p.z)) {
      this.lostSightTime += dt;
      if (this.lostSightTime > 2) {
        this.lockTarget = null;
        return;
      }
    } else this.lostSightTime = 0;

    // Switching: mouse flick, right stick flick or wheel.
    if (this.lockSwitchCooldown > 0) this.lockSwitchCooldown -= dt;
    this.lockSwitchAccum = this.lockSwitchAccum * Math.exp(-10 * dt) + inp.look.x;
    let dirSign = 0;
    if (inp.wheel !== 0) dirSign = inp.wheel > 0 ? 1 : -1;
    else if (Math.abs(this.lockSwitchAccum) > 0.12 && this.lockSwitchCooldown <= 0) dirSign = this.lockSwitchAccum > 0 ? 1 : -1;
    if (dirSign !== 0) {
      this.lockSwitchAccum = 0;
      this.lockSwitchCooldown = 0.35;
      const baseYaw = yawFromDir(t.position.x - this.position.x, t.position.z - this.position.z);
      let best: Character | null = null;
      let bestAng = Infinity;
      for (const c of this.lockCandidates()) {
        if (c === t || c.distanceTo(this) > 26) continue;
        const a = angleDelta(baseYaw, yawFromDir(c.position.x - this.position.x, c.position.z - this.position.z));
        // screen-right = negative yaw delta (camera convention)
        if ((dirSign > 0 && a < 0) || (dirSign < 0 && a > 0)) {
          if (Math.abs(a) < bestAng) {
            bestAng = Math.abs(a);
            best = c;
          }
        }
      }
      if (best) {
        this.lockTarget = best;
      }
    }
  }

  // ===================================================================================
  // Interaction focus
  // ===================================================================================
  private updateFocus(): void {
    this.focus = null;
    this.focusPrompt = null;
    if (this.state !== 'locomotion') return;
    let best = Infinity;
    for (const it of this.interactables()) {
      const d = Math.hypot(it.position.x - this.position.x, it.position.z - this.position.z);
      if (d > it.radius || Math.abs(it.position.y - this.position.y) > 2) continue;
      const prompt = it.prompt(this);
      if (!prompt) continue;
      if (d < best) {
        best = d;
        this.focus = it;
        this.focusPrompt = prompt;
      }
    }
  }

  override update(dt: number): void {
    if (this.blinkInvuln > 0) {
      this.blinkInvuln -= dt;
      if (this.blinkInvuln <= 0 && this.state !== 'dodge') this.invulnerable = false;
    }
    super.update(dt);
  }

  get lockPointTarget(): Vector3 | null {
    return this.lockTarget ? this.lockTarget.lockPoint(new Vector3()) : null;
  }

  get speedNow(): number {
    return this.speed;
  }

  clampStamina(): void {
    this.stamina = clamp(this.stamina, -10, this.maxStamina);
  }
}
