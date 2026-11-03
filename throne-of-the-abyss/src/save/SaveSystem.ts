import type { Attributes } from '@/rpg/Attributes';
import type { Inventory } from '@/items/Inventory';

export const SAVE_VERSION = 1;
const KEY = 'throne_of_the_abyss_save_v1';

/** Everything persistent about a playthrough. */
export interface SaveData {
  version: number;
  savedAt: number;
  playtime: number;
  player: {
    attributes: Attributes;
    echoes: number;
    lastAltar: string | null;
    position: [number, number, number] | null;
    yaw: number;
  };
  inventory: ReturnType<Inventory['serialize']>;
  world: {
    level: string;
    kindledAltars: string[];
    openedChests: string[];
    takenPickups: string[];
    defeatedBosses: string[];
    gateOpen: boolean;
    discoveredRegions: string[];
    readLore: string[];
  };
  lostEchoes: { amount: number; position: [number, number, number] } | null;
  npcs: Record<string, { state: string }>;
  quests: Record<string, { stage: number; done: boolean }>;
}

/**
 * localStorage-backed save slot with versioning and validation. Writes are atomic
 * (single setItem) and failures never crash the game.
 */
export class SaveSystem {
  lastError: string | null = null;

  has(): boolean {
    try {
      return localStorage.getItem(KEY) !== null;
    } catch {
      return false;
    }
  }

  save(data: SaveData): boolean {
    try {
      localStorage.setItem(KEY, JSON.stringify(data));
      this.lastError = null;
      return true;
    } catch (e) {
      this.lastError = String(e);
      return false;
    }
  }

  load(): SaveData | null {
    try {
      const raw = localStorage.getItem(KEY);
      if (!raw) return null;
      const d = JSON.parse(raw) as SaveData;
      if (!SaveSystem.validate(d)) return null;
      return d;
    } catch (e) {
      this.lastError = String(e);
      return null;
    }
  }

  clear(): void {
    try {
      localStorage.removeItem(KEY);
    } catch {
      /* ignore */
    }
  }

  static validate(d: unknown): d is SaveData {
    if (!d || typeof d !== 'object') return false;
    const s = d as SaveData;
    return (
      s.version === SAVE_VERSION &&
      !!s.player &&
      typeof s.player.echoes === 'number' &&
      !!s.player.attributes &&
      !!s.inventory &&
      Array.isArray(s.inventory.weapons) &&
      !!s.world &&
      Array.isArray(s.world.kindledAltars)
    );
  }
}
