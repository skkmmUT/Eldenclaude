import type { AccessoryData, ArmorData } from '@/items/ItemTypes';

/** Armour pieces. Absorptions combine multiplicatively across slots. */
export const ARMOR: Record<string, ArmorData> = {
  // --- Regalia of the Nameless Heir (starting set) ---
  heir_crown: {
    id: 'heir_crown', name: 'Crown of the Nameless', slot: 'head', weight: 3.2, poise: 3,
    description: 'A blackened helm ringed with a thin gold crown.',
    lore: 'The crown was forged too small for any living king. It fits the Heir as if it had been waiting.',
    absorption: { physical: 0.05, fire: 0.04, ice: 0.04, lightning: 0.03, holy: 0.03, dark: 0.05, arcane: 0.04 },
    look: { helmet: 'crowned' },
  },
  heir_cuirass: {
    id: 'heir_cuirass', name: "Heir's Cuirass", slot: 'chest', weight: 8.5, poise: 6,
    description: 'Fluted plate of black steel with gilded rims.',
    lore: 'Every plate bears a small engraved eye, closed. Armourers of the Ashen Throne made armour for the dead the same way.',
    absorption: { physical: 0.08, fire: 0.06, ice: 0.06, lightning: 0.05, holy: 0.05, dark: 0.07, arcane: 0.06 },
    look: { armor: '#3a3444', trim: '#d8a83c' },
  },
  heir_gauntlets: {
    id: 'heir_gauntlets', name: "Heir's Gauntlets", slot: 'hands', weight: 2.6, poise: 1,
    description: 'Articulated gauntlets.', lore: 'The left palm is scorched, as if it once held something burning.',
    absorption: { physical: 0.03, fire: 0.02, ice: 0.02, lightning: 0.02, holy: 0.02, dark: 0.03, arcane: 0.02 },
  },
  heir_greaves: {
    id: 'heir_greaves', name: "Heir's Greaves", slot: 'legs', weight: 4.8, poise: 3,
    description: 'Plated greaves and sabatons.', lore: 'Light enough to run in. The Heir was never meant to stand and fight.',
    absorption: { physical: 0.05, fire: 0.04, ice: 0.04, lightning: 0.03, holy: 0.03, dark: 0.04, arcane: 0.04 },
  },
  // --- Gravebound set (heavy) ---
  gravebound_helm: {
    id: 'gravebound_helm', name: 'Gravebound Helm', slot: 'head', weight: 6.5, poise: 8,
    description: 'Horned helm of an oath-knight.', lore: 'The horns were added after death. The Gravebound wanted to be recognised by those they no longer resembled.',
    absorption: { physical: 0.08, fire: 0.06, ice: 0.06, lightning: 0.04, holy: 0.05, dark: 0.09, arcane: 0.06 },
    look: { helmet: 'horned' },
  },
  gravebound_plate: {
    id: 'gravebound_plate', name: 'Gravebound Plate', slot: 'chest', weight: 16, poise: 18,
    description: 'Massive plate with spiked pauldrons.', lore: 'Sworn to stand between the living and the gate. The plate never learned which side it was on.',
    absorption: { physical: 0.15, fire: 0.1, ice: 0.11, lightning: 0.06, holy: 0.08, dark: 0.14, arcane: 0.1 },
    look: { armor: '#4a4552', armorDark: '#24202a', trim: '#b08a3e', pauldrons: 'spiked', clothInner: '#701020' },
  },
  // --- Revenant levy kit (light) ---
  levy_sallet: {
    id: 'levy_sallet', name: 'Levy Sallet', slot: 'head', weight: 2.4, poise: 2,
    description: 'Dented open helm of the Ashen levy.', lore: 'Issued to farmers who were told they would only guard the gate for one winter.',
    absorption: { physical: 0.04, fire: 0.03, ice: 0.03, lightning: 0.03, holy: 0.02, dark: 0.03, arcane: 0.03 },
    look: { helmet: 'sallet' },
  },
  pilgrim_hood: {
    id: 'pilgrim_hood', name: 'Pilgrim Hood', slot: 'head', weight: 0.8, poise: 0,
    description: 'Wool hood of the Ordo Caelum pilgrims.', lore: 'Pilgrims wore it to the Cathedral of Eternity. None wore it back.',
    absorption: { physical: 0.01, fire: 0.02, ice: 0.04, lightning: 0.03, holy: 0.06, dark: 0.05, arcane: 0.06 },
    statusResist: { poison: 20 },
    look: { helmet: 'hood' },
  },
  ward_mantle: {
    id: 'ward_mantle', name: 'Mantle of the Ward', slot: 'chest', weight: 4.2, poise: 2,
    description: 'Embroidered mantle over a light hauberk; favoured by sorcerers.', lore: 'Its thread was spun from abyssal glass. It drinks a little of every spell cast near it.',
    absorption: { physical: 0.04, fire: 0.07, ice: 0.07, lightning: 0.07, holy: 0.08, dark: 0.09, arcane: 0.09 },
    look: { armor: '#3e4a6a', trim: '#c8d0e8', cloth: '#1c2440', clothInner: '#5a7ad8', pauldrons: 'rags' },
  },
};

/** Rings and amulets. */
export const ACCESSORIES: Record<string, AccessoryData> = {
  ember_choir_ring: {
    id: 'ember_choir_ring', name: 'Ring of the Ember Choir', slot: 'ring', weight: 0.3, glyph: '#ff7a2a',
    description: 'Raises fire damage by 15%.', lore: 'Each member of the Cinder Choir wore one. They were melted together into the bells.',
    mods: { typeBuffs: { fire: 0.15 } },
  },
  gravebound_signet: {
    id: 'gravebound_signet', name: 'Gravebound Signet', slot: 'ring', weight: 0.6, glyph: '#b08a3e',
    description: 'Raises poise by 15.', lore: 'Pressed into the wax of the Gravebound Oath. The wax is still warm.',
    mods: { poise: 15 },
  },
  swift_ash_ring: {
    id: 'swift_ash_ring', name: 'Ring of Swift Ash', slot: 'ring', weight: 0.3, glyph: '#e8e0c8',
    description: 'Stamina recovers 15% faster.', lore: 'Ash from the first pyre of the Ashen Kingdom, sealed in silver. It never settles.',
    mods: { staminaRegenMul: 1.15 },
  },
  bloodbound_ring: {
    id: 'bloodbound_ring', name: 'Bloodbound Ring', slot: 'ring', weight: 0.4, glyph: '#d4102a',
    description: 'Each kill restores 4% of maximum health.', lore: 'The blood oath of the Crimson Forest: what you take, you keep.',
    mods: { healOnKill: 0.04 },
  },
  sorcerer_band: {
    id: 'sorcerer_band', name: "Athenaeum Band", slot: 'ring', weight: 0.2, glyph: '#9a5cff',
    description: 'Spells deal 12% more damage; +20 mana.', lore: 'Given to students of the Black Athenaeum on the day they first heard the dark answer.',
    mods: { spellMul: 1.12, maxManaAdd: 20 },
  },
  seal_amulet: {
    id: 'seal_amulet', name: 'Shard-Set Amulet', slot: 'amulet', weight: 0.5, glyph: '#ff4a8a',
    description: 'All damage +8%; slowly restores mana.', lore: 'A splinter of the Seventh Seal in a silver cage. It hums when you are about to die.',
    mods: { damageMul: 1.08, manaRegen: 0.6 },
  },
  verdant_amulet: {
    id: 'verdant_amulet', name: 'Verdant Amulet', slot: 'amulet', weight: 0.4, glyph: '#7ccf3a',
    description: 'Maximum health +8%; slowly restores health.', lore: 'Carved from a twig of the Elder Bough. It still grows a single leaf every spring.',
    mods: { maxHpMul: 1.08, hpRegen: 1.2 },
  },
  kings_seal: {
    id: 'kings_seal', name: 'Seal of the Ashen Throne', slot: 'amulet', weight: 0.8, glyph: '#ffb02a',
    description: 'All damage +10%; poise +10.', lore: 'The royal seal, cracked through the middle. Whoever presses it into wax decrees nothing any more; the wax decrees for them.',
    mods: { damageMul: 1.1, poise: 10 },
  },
};
