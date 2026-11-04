import { CONSUMABLES } from '@/data/items';
import { SPELLS } from '@/data/spells';
import { WEAPONS } from '@/data/weapons';
import { ACCESSORIES, ARMOR } from '@/data/armor';
import type { AccessoryData, ArmorData, ArmorSlot, ConsumableData, WeaponData } from './ItemTypes';
import type { SpellData } from '@/magic/SpellTypes';

export interface BeltSlot {
  id: string;
  count: number;
  max: number;
}

export const ARMOR_SLOTS: ArmorSlot[] = ['head', 'chest', 'hands', 'legs'];

/**
 * Inventory + equipment: owned weapons (right-hand cycle), armour by slot, two rings and
 * an amulet, consumable belt, learned spells. Pure data — serialisable for saves.
 */
export class Inventory {
  weapons: string[] = ['heirs_longsword'];
  rightHand = 0;
  armor: string[] = ['heir_crown', 'heir_cuirass', 'heir_gauntlets', 'heir_greaves'];
  equipped: Record<ArmorSlot, string | null> = { head: 'heir_crown', chest: 'heir_cuirass', hands: 'heir_gauntlets', legs: 'heir_greaves' };
  accessories: string[] = [];
  rings: [string | null, string | null] = [null, null];
  amulet: string | null = null;
  belt: BeltSlot[] = [
    { id: 'crimson_ichor', count: 4, max: 4 },
    { id: 'azure_ichor', count: 2, max: 2 },
  ];
  beltIndex = 0;
  spells: string[] = ['abyssal_bolt', 'void_step', 'black_flame'];
  spellIndex = 0;
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

  equippedArmor(): ArmorData[] {
    return ARMOR_SLOTS.map((s) => this.equipped[s]).filter((id): id is string => !!id && !!ARMOR[id]).map((id) => ARMOR[id]);
  }
  equippedAccessories(): AccessoryData[] {
    return [...this.rings, this.amulet].filter((id): id is string => !!id && !!ACCESSORIES[id]).map((id) => ACCESSORIES[id]);
  }

  /** Weight of everything worn and wielded. */
  equipWeight(): number {
    let w = this.weapon.weight;
    for (const a of this.equippedArmor()) w += a.weight;
    for (const a of this.equippedAccessories()) w += a.weight;
    return w;
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

  addWeapon(id: string): boolean {
    if (!WEAPONS[id] || this.weapons.includes(id)) return false;
    this.weapons.push(id);
    return true;
  }
  addArmor(id: string): boolean {
    if (!ARMOR[id] || this.armor.includes(id)) return false;
    this.armor.push(id);
    return true;
  }
  addAccessory(id: string): boolean {
    if (!ACCESSORIES[id] || this.accessories.includes(id)) return false;
    this.accessories.push(id);
    return true;
  }
  addSpell(id: string): boolean {
    if (!SPELLS[id] || this.spells.includes(id)) return false;
    this.spells.push(id);
    return true;
  }

  /** Equip (or with `null`, remove) the armour piece for a slot. */
  equipArmor(slot: ArmorSlot, id: string | null): boolean {
    if (id !== null && (!ARMOR[id] || ARMOR[id].slot !== slot || !this.armor.includes(id))) return false;
    this.equipped[slot] = id;
    return true;
  }

  /** Equip an accessory into ring slot 0/1 or the amulet slot ('amulet'). */
  equipAccessory(target: 0 | 1 | 'amulet', id: string | null): boolean {
    if (id !== null) {
      const a = ACCESSORIES[id];
      if (!a || !this.accessories.includes(id)) return false;
      if (target === 'amulet' ? a.slot !== 'amulet' : a.slot !== 'ring') return false;
    }
    if (target === 'amulet') this.amulet = id;
    else {
      const other = target === 0 ? 1 : 0;
      if (id !== null && this.rings[other] === id) this.rings[other] = null; // a ring can't be worn twice
      this.rings[target] = id;
    }
    return true;
  }

  refill(): void {
    for (const s of this.belt) if (CONSUMABLES[s.id].refillAtAltar) s.count = s.max;
  }

  serialize() {
    return {
      weapons: [...this.weapons],
      rightHand: this.rightHand,
      armor: [...this.armor],
      equipped: { ...this.equipped },
      accessories: [...this.accessories],
      rings: [...this.rings] as [string | null, string | null],
      amulet: this.amulet,
      belt: this.belt.map((b) => ({ ...b })),
      beltIndex: this.beltIndex,
      spells: [...this.spells],
      spellIndex: this.spellIndex,
      keyItems: [...this.keyItems],
    };
  }

  restore(d: Partial<ReturnType<Inventory['serialize']>>): void {
    const fresh = new Inventory();
    this.weapons = (d.weapons ?? fresh.weapons).filter((w) => WEAPONS[w]);
    if (this.weapons.length === 0) this.weapons = ['heirs_longsword'];
    this.rightHand = Math.min(d.rightHand ?? 0, this.weapons.length - 1);
    this.armor = (d.armor ?? fresh.armor).filter((a) => ARMOR[a]);
    this.equipped = { ...fresh.equipped, ...(d.equipped ?? {}) };
    for (const slot of ARMOR_SLOTS) {
      const id = this.equipped[slot];
      if (id && (!ARMOR[id] || !this.armor.includes(id))) this.equipped[slot] = null;
    }
    this.accessories = (d.accessories ?? []).filter((a) => ACCESSORIES[a]);
    this.rings = (d.rings ?? [null, null]).map((r) => (r && this.accessories.includes(r) ? r : null)) as [string | null, string | null];
    this.amulet = d.amulet && this.accessories.includes(d.amulet) ? d.amulet : null;
    this.belt = (d.belt ?? fresh.belt).filter((b) => CONSUMABLES[b.id]);
    this.beltIndex = Math.min(d.beltIndex ?? 0, Math.max(0, this.belt.length - 1));
    this.spells = (d.spells ?? fresh.spells).filter((s) => SPELLS[s]);
    this.spellIndex = Math.min(d.spellIndex ?? 0, Math.max(0, this.spells.length - 1));
    this.keyItems = d.keyItems ?? [];
  }
}
