import { WEAPONS } from '@/data/weapons';
import { ACCESSORIES, ARMOR } from '@/data/armor';
import { SPELLS } from '@/data/spells';
import type { Inventory } from './Inventory';

/** One item handed to the player by a chest, a pickup or a defeated boss. */
export interface ItemGrant {
  type: 'weapon' | 'armor' | 'accessory' | 'spell';
  id: string;
}

const KIND_LABEL: Record<ItemGrant['type'], string> = {
  weapon: 'Weapon acquired — equip it in the Equipment menu or press X',
  armor: 'Armour acquired — wear it from the Equipment menu',
  accessory: 'Talisman acquired — wear it from the Equipment menu',
  spell: 'Spell learned — attune it in the Spells menu',
};

export function grantName(g: ItemGrant): string {
  switch (g.type) {
    case 'weapon': return WEAPONS[g.id]?.name ?? g.id;
    case 'armor': return ARMOR[g.id]?.name ?? g.id;
    case 'accessory': return ACCESSORIES[g.id]?.name ?? g.id;
    case 'spell': return SPELLS[g.id]?.name ?? g.id;
  }
}

export function grantExists(g: ItemGrant): boolean {
  const table = { weapon: WEAPONS, armor: ARMOR, accessory: ACCESSORIES, spell: SPELLS }[g.type] as Record<string, unknown>;
  return !!table[g.id];
}

/** Add the item to the inventory. Returns the toast lines, or null if already owned. */
export function applyGrant(inv: Inventory, g: ItemGrant): { title: string; sub: string } | null {
  const added =
    g.type === 'weapon' ? inv.addWeapon(g.id)
    : g.type === 'armor' ? inv.addArmor(g.id)
    : g.type === 'accessory' ? inv.addAccessory(g.id)
    : inv.addSpell(g.id);
  return added ? { title: grantName(g), sub: KIND_LABEL[g.type] } : null;
}
