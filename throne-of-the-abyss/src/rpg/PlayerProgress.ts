import {
  ATTRIBUTE_IDS,
  defensesFor,
  levelOf,
  levelUpCost,
  maxHpFor,
  maxManaFor,
  maxStaminaFor,
  statusResistFor,
  type AttributeId,
  type Attributes,
} from './Attributes';

/** Starting class of the Nameless Heir: a balanced, slightly dexterous knight. */
export const STARTING_ATTRIBUTES: Attributes = {
  vitality: 12,
  endurance: 11,
  strength: 12,
  dexterity: 13,
  intelligence: 11,
  faith: 10,
  arcane: 9,
};

/** Level, attributes and currency ("Echoes" — the residue of souls). */
export class PlayerProgress {
  attributes: Attributes;
  echoes = 0;
  constructor(attrs: Attributes = { ...STARTING_ATTRIBUTES }) {
    this.attributes = { ...attrs };
  }

  get level(): number {
    return levelOf(this.attributes);
  }

  get nextLevelCost(): number {
    return levelUpCost(this.level);
  }

  /** Cost of buying `points` levels in a row starting from the current level. */
  costFor(points: number): number {
    let total = 0;
    for (let i = 0; i < points; i++) total += levelUpCost(this.level + i);
    return total;
  }

  /** Spend echoes to apply allocations. Returns false if unaffordable. */
  levelUp(alloc: Partial<Record<AttributeId, number>>): boolean {
    const points = ATTRIBUTE_IDS.reduce((s, id) => s + Math.max(0, alloc[id] ?? 0), 0);
    if (points === 0) return false;
    const cost = this.costFor(points);
    if (cost > this.echoes) return false;
    for (const id of ATTRIBUTE_IDS) {
      const add = Math.max(0, alloc[id] ?? 0);
      this.attributes[id] = Math.min(99, this.attributes[id] + add);
    }
    this.echoes -= cost;
    return true;
  }

  derived() {
    const a = this.attributes;
    return {
      maxHp: maxHpFor(a),
      maxStamina: maxStaminaFor(a),
      maxMana: maxManaFor(a),
      defense: defensesFor(a),
      statusResist: statusResistFor(a),
    };
  }
}
