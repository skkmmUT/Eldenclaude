import type { DamageSource } from '@/combat/DamageCalculator';
import type { Buff } from '@/rpg/Modifiers';

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
      /** Fraction of damage dealt returned to the caster as health. */
      drain?: number;
      /** Seconds the target is frozen on hit. */
      freeze?: number;
    }
  | { kind: 'blink'; distance: number; color: string }
  | { kind: 'nova'; radius: number; forward: number; color: string; core: string; freeze?: number }
  | { kind: 'meteor'; radius: number; delay: number; color: string; core: string }
  | { kind: 'strike'; radius: number; delay: number; color: string; core: string }
  | { kind: 'rift'; radius: number; forward: number; pullTime: number; color: string; core: string }
  | { kind: 'buff'; buff: Buff }
  | { kind: 'pact'; hpFraction: number; manaFraction: number; color: string }
  | { kind: 'summon'; duration: number; color: string };

export interface SpellData {
  id: string;
  name: string;
  school: SpellSchool;
  description: string;
  lore: string;
  manaCost: number;
  /** Blood magic: fraction of maximum health paid on casting. */
  hpCost?: number;
  staminaCost: number;
  castTime: number; // startup until release
  recovery: number;
  cooldown: number;
  range: number;
  damage?: DamageSource & { motionValue: number; poiseDamage: number };
  effect: SpellEffect;
  interruptible: boolean;
  gesture: 'thrust' | 'skyward';
  glyph: string; // UI icon colour
}

export const SCHOOL_NAMES: Record<SpellSchool, string> = {
  necromancy: 'Necromancy',
  black: 'Black sorcery',
  fire: 'Fire',
  ice: 'Ice',
  lightning: 'Lightning',
  holy: 'Holy',
  spatial: 'Spatial',
  blood: 'Blood',
  summoning: 'Summoning',
};
