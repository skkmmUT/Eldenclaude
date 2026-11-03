import type { DamageSource } from '@/combat/DamageCalculator';
import type { Absorptions } from '@/combat/DamageTypes';
import type { WeaponVisual } from '@/render/WeaponModels';
import type { AttributeId } from '@/rpg/Attributes';

export type WeaponCategory =
  | 'straightSword'
  | 'greatsword'
  | 'spear'
  | 'halberd'
  | 'dagger'
  | 'axe'
  | 'hammer'
  | 'staff'
  | 'katana'
  | 'grimoire';

export interface WeaponMoveset {
  light: string; // first attack of the light chain
  heavy: string;
  charged: string;
  running: string;
  roll: string;
  jump: string;
  plunge: string;
}

export interface WeaponData extends DamageSource {
  id: string;
  name: string;
  category: WeaponCategory;
  description: string;
  lore: string;
  weight: number;
  requirements: Partial<Record<AttributeId, number>>;
  /** Damage absorbed when guarding with this weapon. */
  guard: Absorptions;
  /** Stability: reduces stamina lost when blocking. */
  guardBoost: number;
  /** Multiplier on critical (riposte/backstab) damage. */
  critical: number;
  moveset: WeaponMoveset;
  visual: WeaponVisual;
}

export type ConsumableEffect =
  | { kind: 'heal'; fraction: number }
  | { kind: 'mana'; fraction: number }
  | { kind: 'cure'; status: 'poison' | 'bleed' };

export interface ConsumableData {
  id: string;
  name: string;
  description: string;
  lore: string;
  icon: string; // CSS colour of the vial glyph
  effect: ConsumableEffect;
  /** Refilled at altars (flask-type) or consumed permanently. */
  refillAtAltar: boolean;
  maxStack: number;
}
