import { AdditiveBlending, Group, Sprite, SpriteMaterial, Vector3 } from 'three';
import type { Player } from '@/characters/player/Player';
import { radialSprite } from '@/render/TextureFactory';
import type { VFXManager } from '@/vfx/VFXManager';
import type { Interactable } from './Interactable';

export type PickupContent =
  | { kind: 'lore'; loreId: string }
  | { kind: 'consumable'; id: string; amount: number }
  | { kind: 'flaskUpgrade'; id: string }
  | { kind: 'echoes'; amount: number };

/** Glowing item on the ground. */
export class Pickup implements Interactable {
  readonly group = new Group();
  readonly radius = 1.6;
  taken = false;
  private t = Math.random() * 6;
  private readonly sprite: Sprite;
  private readonly tmp = new Vector3();
  onTake: ((p: Pickup, player: Player) => void) | null = null;

  constructor(
    readonly id: string,
    readonly position: Vector3,
    readonly content: PickupContent,
    private readonly vfx: VFXManager,
    color = '#e8d8ff',
  ) {
    this.group.position.copy(position);
    this.sprite = new Sprite(new SpriteMaterial({ map: radialSprite(), color, blending: AdditiveBlending, depthWrite: false, transparent: true }));
    this.sprite.scale.setScalar(0.6);
    this.sprite.position.y = 0.4;
    this.group.add(this.sprite);
  }

  prompt(): string | null {
    return this.taken ? null : 'Pick up';
  }

  interact(player: Player): void {
    if (this.taken) return;
    this.setTaken(true);
    this.onTake?.(this, player);
  }

  setTaken(t: boolean): void {
    this.taken = t;
    this.group.visible = !t;
  }

  update(dt: number): void {
    if (this.taken) return;
    this.t += dt;
    const s = 0.5 + Math.sin(this.t * 3) * 0.12;
    this.sprite.scale.setScalar(s);
    this.sprite.position.y = 0.4 + Math.sin(this.t * 1.7) * 0.06;
    if (Math.random() < dt * 6) {
      const p = this.group.getWorldPosition(this.tmp);
      p.y += 0.3;
      this.vfx.sparks.emit(p, new Vector3((Math.random() - 0.5) * 0.4, 0.6 + Math.random() * 0.6, (Math.random() - 0.5) * 0.4), '#d9c9ff', 1.0, 0.05, -0.2, 0.5);
    }
  }
}
