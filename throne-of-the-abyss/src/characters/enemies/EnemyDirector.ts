import type { Character } from '../Character';

/**
 * Attack-token director: limits how many enemies may commit to attacking the player at
 * once. Others circle, guard and wait for an opening — group fights stay readable and
 * fair instead of a simultaneous swarm.
 */
export class EnemyDirector {
  maxTokens = 2;
  private holders = new Map<Character, number>();

  request(e: Character, cost: number): boolean {
    if (this.holders.has(e)) return true;
    let used = 0;
    for (const [c, v] of this.holders) {
      if (c.dead) this.holders.delete(c);
      else used += v;
    }
    if (used + cost > this.maxTokens) return false;
    this.holders.set(e, cost);
    return true;
  }

  release(e: Character): void {
    this.holders.delete(e);
  }

  holds(e: Character): boolean {
    return this.holders.has(e);
  }

  clear(): void {
    this.holders.clear();
  }
}
