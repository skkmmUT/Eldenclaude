import type { PoseDef } from '@/animation/Skeleton';
import type { DamageProfile } from './DamageTypes';

export type AttackKind =
  | 'light'
  | 'heavy'
  | 'charged'
  | 'running'
  | 'roll'
  | 'jump'
  | 'plunge'
  | 'critical'
  | 'enemy';

export type HitReaction = 'flinch' | 'stagger' | 'knockdown';

/**
 * Data asset describing one attack. Timings (seconds, usually authored with `frames()`)
 * define startup → active (hitbox live) → recovery; the animation clip is generated from
 * the key poses so animation and hit timing can never drift apart.
 */
export interface AttackData {
  id: string;
  kind: AttackKind;
  /** Key poses: anticipation peak, impact, follow-through. */
  windup: PoseDef;
  strike: PoseDef;
  follow: PoseDef;
  startup: number;
  active: number;
  recovery: number;
  staminaCost: number;
  /** Multiplier on the weapon's attack rating. */
  motionValue: number;
  poiseDamage: number;
  /** Stamina drained from a blocker. */
  guardDamage: number;
  /** Forward displacement (m) during [startup*0.4, startup+active]. */
  lunge: number;
  /** Next attack in the chain and the window (seconds from start) to input it. */
  next?: string;
  comboWindow?: [number, number];
  /** Time from start after which a roll/backstep may cancel recovery. */
  dodgeCancel: number;
  /** Hyper-armour: poise cannot break from startup*0.4 to end of active. */
  hyperArmor?: boolean;
  reaction: HitReaction;
  knockback: number;
  hitStop: number;
  shake: number;
  parryable: boolean;
  /** Turn rate (rad/s) allowed during startup so attacks can be aimed, not during active. */
  tracking: number;
  /** Extra elemental damage on top of the weapon (e.g. flame-wreathed boss slam). */
  extraDamage?: DamageProfile;
  /** Area hit at impact (ground slams). Offset forward from the attacker. */
  shockwave?: { radius: number; forward: number; damageScale: number };
  /** Telegraph: weapon flashes this colour at the end of startup (enemy readability). */
  telegraph?: string;
  /** Trail colour of the weapon swing. */
  trail?: string;
  sound?: 'swing' | 'heavy' | 'thrust';
}

/** Total duration helper. */
export const attackDuration = (a: AttackData): number => a.startup + a.active + a.recovery;
