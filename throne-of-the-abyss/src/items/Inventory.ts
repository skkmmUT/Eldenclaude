import { CONSUMABLES } from '@/data/items';
import { SPELLS } from '@/data/spells';
import { WEAPONS } from '@/data/weapons';
import type { ConsumableData, WeaponData } from './ItemTypes';
import type { SpellData } from '@/magic/SpellTypes';

export interface BeltSlot {
  id: string;
  count: number;
  max: number;
}

/**
 * Inventory + quick slots: owned weapons (right-hand cycle), consumable belt, attuned
 * spells. Pure data — serialisable for saves.
 */
export class Inventory {
  weapons: string[] = ['heirs_longsword'];
  rightHand = 0;
  belt: BeltSlot[] = [
    { id: 'crimson_ichor', count: 4, max: 4 },
    { id: 'azure_ichor', count: 2, max: 2 },
  ];
  beltIndex = 0;
  spells: string[] = ['abyssal_bolt', 'void_step', 'black_flame'];
  spellIndex = 0;
  /** Key items / lore pickups (ids). */
  keyItems: string[] = [];

  get weapon(): WeaponData {
    return WEAPONS[this.weapons[this.rightHand]];
  }
  get currentItem(): BeltSlot | null {
    return this.belt[this.beltIndex] ?? null;
  }
  get currentItemData(): ConsumableData | null {
    const s = this.currentItem;
    return s ? CONSUMABLES[s.id] : null;
  }
  get spell(): SpellData | null {
    const id = this.spells[this.spellIndex];
    return id ? SPELLS[id] : null;
  }

  cycleWeapon(): WeaponData {
    this.rightHand = (this.rightHand + 1) % this.weapons.length;
    return this.weapon;
  }
  cycleItem(): void {
    if (this.belt.length) this.beltIndex = (this.beltIndex + 1) % this.belt.length;
  }
  cycleSpell(): void {
    if (this.spells.length) this.spellIndex = (this.spellIndex + 1) % this.spells.length;
  }

  addWeapon(id: string): void {
    if (!this.weapons.includes(id)) this.weapons.push(id);
  }

  /** Refill altar-replenished consumables. */
  refill(): void {
    for (const s of this.belt) if (CONSUMABLES[s.id].refillAtAltar) s.count = s.max;
  }

  serialize() {
    return {
      weapons: [...this.weapons],
      rightHand: this.rightHand,
      belt: this.belt.map((b) => ({ ...b })),
      beltIndex: this.beltIndex,
      spells: [...this.spells],
      spellIndex: this.spellIndex,
      keyItems: [...this.keyItems],
    };
  }

  restore(d: ReturnType<Inventory['serialize']>): void {
    this.weapons = d.weapons.filter((w) => WEAPONS[w]);
    if (this.weapons.length === 0) this.weapons = ['heirs_longsword'];
    this.rightHand = Math.min(d.rightHand, this.weapons.length - 1);
    this.belt = d.belt.filter((b) => CONSUMABLES[b.id]);
    this.beltIndex = Math.min(d.beltIndex, Math.max(0, this.belt.length - 1));
    this.spells = d.spells.filter((s) => SPELLS[s]);
    this.spellIndex = Math.min(d.spellIndex, Math.max(0, this.spells.length - 1));
    this.keyItems = d.keyItems ?? [];
  }
}
