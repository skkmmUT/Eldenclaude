/**
 * Short-lived queue of combat intents. Pressing attack/dodge slightly before the current
 * action ends still executes — essential for responsive souls-like combat.
 */
export type BufferedIntent = 'light' | 'heavy' | 'dodge' | 'backstep' | 'jump' | 'item' | 'spell' | 'parry' | 'art';

interface Entry {
  intent: BufferedIntent;
  time: number;
}

export class InputBuffer {
  private entries: Entry[] = [];
  constructor(public window = 0.35) {}

  push(intent: BufferedIntent, now: number): void {
    // A newer intent replaces older ones: the player's latest decision wins.
    this.entries.length = 0;
    this.entries.push({ intent, time: now });
  }

  peek(now: number): BufferedIntent | null {
    this.prune(now);
    return this.entries.length ? this.entries[this.entries.length - 1].intent : null;
  }

  consume(intent: BufferedIntent, now: number): boolean {
    this.prune(now);
    const i = this.entries.findIndex((e) => e.intent === intent);
    if (i < 0) return false;
    this.entries.splice(i, 1);
    return true;
  }

  clear(): void {
    this.entries.length = 0;
  }

  private prune(now: number): void {
    this.entries = this.entries.filter((e) => now - e.time <= this.window);
  }
}
