import type { ConsumableData } from '@/items/ItemTypes';

export const CONSUMABLES: Record<string, ConsumableData> = {
  crimson_ichor: {
    id: 'crimson_ichor',
    name: 'Crimson Ichor',
    description: 'Restores a large portion of health. Refilled at Sigil Altars.',
    lore:
      'The altars weep this ichor when kindled. The pilgrims who first drank it called it a blessing; ' +
      'the ones who drank it for a century stopped calling it anything at all.',
    icon: '#d4243c',
    effect: { kind: 'heal', fraction: 0.45 },
    refillAtAltar: true,
    maxStack: 5,
  },
  azure_ichor: {
    id: 'azure_ichor',
    name: 'Azure Ichor',
    description: 'Restores a portion of mana. Refilled at Sigil Altars.',
    lore: 'Distilled from the same altars by the Ordo Caelum, who believed thought itself could be bottled.',
    icon: '#4d7dff',
    effect: { kind: 'mana', fraction: 0.5 },
    refillAtAltar: true,
    maxStack: 3,
  },
};
