import type { DamageSource } from '@/combat/DamageCalculator';

export type SpellSchool =
  | 'necromancy'
  | 'black'
  | 'fire'
  | 'ice'
  | 'lightning'
  | 'holy'
  | 'spatial'
  | 'blood'
  | 'summoning';

export type SpellEffect =
  | {
      kind: 'projectile';
      speed: number;
      radius: number;
      life: number;
      homing: number; // turn rate toward the locked target (rad/s)
      color: string;
      core: string;
      count?: number;
      spread?: number;
    }
  | { kind: 'blink'; distance: number; color: string }
  | { kind: 'nova'; radius: number; forward: number; color: string; core: string };

export interface SpellData {
  id: string;
  name: string;
  school: SpellSchool;
  description: string;
  lore: string;
  manaCost: number;
  staminaCost: number;
  castTime: number; // startup until release
  recovery: number;
  cooldown: number;
  range: number;
  /** Damage when the effect hits (scaled with attributes). */
  damage?: DamageSource & { motionValue: number; poiseDamage: number };
  effect: SpellEffect;
  /** Can be interrupted by poise break during the cast. */
  interruptible: boolean;
  /** Animation family used to cast. */
  gesture: 'thrust' | 'skyward';
  glyph: string; // UI icon colour
}
