/** Lore pickups — the story is told through objects, not exposition. */
export interface LoreEntry {
  id: string;
  title: string;
  text: string[];
}

export const LORE: Record<string, LoreEntry> = {
  torn_proclamation: {
    id: 'torn_proclamation',
    title: 'Torn Proclamation',
    text: [
      'BY DECREE OF HIS RADIANCE, KING AURELION OF THE ASHEN THRONE —',
      'Let it be known that the Seventh Seal is secured within the Cathedral of Eternity, and that the Heir',
      'shall be sealed beside it, that the line of the Throne may never wake while the Abyss stirs.',
      '…the rest is burned away. Someone has scratched a single word into the margin: "LIAR."',
    ],
  },
  gravebound_oath: {
    id: 'gravebound_oath',
    title: 'Gravebound Oath',
    text: [
      'We who are bound to the grave swear:',
      'that no living hand shall open the Gate of Eternity,',
      'that no dead hand shall close it,',
      'and that we shall stand between, until the last bell rings.',
      '— Vaelor, First of the Gravebound, in the ninth year of the Long Dusk',
    ],
  },
  seal_fragment: {
    id: 'seal_fragment',
    title: 'Fragment of the Seventh Seal',
    text: [
      'A shard of black glass, warm as skin. Within it, something like an eye opens when you are not looking.',
      'The Seals of Being were seven. The Cataclysm broke one. The kings of Eldrakar broke the other six',
      'trying to mend it — and buried the pieces in the hearts of their greatest champions.',
    ],
  },
};
