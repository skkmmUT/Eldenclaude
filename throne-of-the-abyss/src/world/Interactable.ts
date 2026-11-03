import type { Vector3 } from 'three';
import type { Player } from '@/characters/player/Player';

/** Anything the player can press "Interact" on: altars, chests, items, levers, doors. */
export interface Interactable {
  readonly id: string;
  readonly position: Vector3;
  readonly radius: number;
  prompt(player: Player): string | null; // null = not interactable right now
  interact(player: Player): void;
}
