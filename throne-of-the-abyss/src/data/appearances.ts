import type { HumanoidAppearance } from '@/characters/HumanoidRig';

export const APPEARANCES: Record<string, HumanoidAppearance> = {
  /** The Nameless Heir — black-and-gold crowned knight with a crimson-lined cape. */
  heir: {
    height: 1.85,
    bulk: 1,
    palette: {
      armor: '#3a3444',
      armorDark: '#1a1720',
      trim: '#d8a83c',
      cloth: '#16080e',
      clothInner: '#8a1026',
      skin: '#eadad2',
      eyes: '#b46bff',
      hair: '#e6e3f2',
    },
    helmet: 'crowned',
    pauldrons: 'ornate',
    tassets: true,
    cape: true,
    hairStrands: 7,
    hunch: 0,
  },
  /** Ashen Revenant — risen levy soldier of the Ashen Kingdom. */
  revenant: {
    height: 1.8,
    bulk: 0.95,
    palette: {
      armor: '#4c4138',
      armorDark: '#221c1a',
      trim: '#7a5a2a',
      cloth: '#3a2a2c',
      clothInner: '#5a1a1a',
      skin: '#8a8274',
      eyes: '#ff7a2a',
    },
    helmet: 'sallet',
    pauldrons: 'rags',
    tassets: true,
    cape: false,
    hairStrands: 0,
    hunch: 0.25,
    boneArms: true,
  },
  /** Gravebound Knight — oath-knight elite guarding the cathedral steps. */
  gravebound: {
    height: 2.35,
    bulk: 1.22,
    palette: {
      armor: '#3a3444',
      armorDark: '#1c1820',
      trim: '#c09a48',
      cloth: '#1c0a10',
      clothInner: '#701020',
      skin: '#5a5060',
      eyes: '#ff2a4a',
      hair: '#2c2236',
    },
    helmet: 'horned',
    pauldrons: 'spiked',
    tassets: true,
    cape: true,
    hairStrands: 5,
    hunch: 0,
  },
};
