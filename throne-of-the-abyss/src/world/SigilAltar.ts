import { CylinderGeometry, Group, Mesh, OctahedronGeometry, TorusGeometry, Vector3 } from 'three';
import type { Player } from '@/characters/player/Player';
import { glowMaterial, toonMaterial } from '@/render/Materials';
import { wallTexture } from '@/render/TextureFactory';
import type { VFXManager } from '@/vfx/VFXManager';
import type { Interactable } from './Interactable';
import { Fire } from './Fire';

/**
 * Sigil Altar — checkpoint. Kindle once; then rest to heal, refill ichor, level up,
 * save and travel. Resting makes ordinary enemies rise again.
 */
export class SigilAltar implements Interactable {
  readonly group = new Group();
  readonly radius = 2.4;
  kindled = false;
  readonly fire: Fire;
  private readonly ring: Mesh;
  private readonly ring2: Mesh;
  private readonly crystal: Mesh;
  private t = 0;
  onKindle: ((a: SigilAltar) => void) | null = null;
  onRest: ((a: SigilAltar) => void) | null = null;

  constructor(
    readonly id: string,
    readonly name: string,
    readonly position: Vector3,
    readonly respawnYaw: number,
    vfx: VFXManager,
  ) {
    this.group.position.copy(position);
    const stone = toonMaterial({ color: '#4a4452', map: wallTexture() });
    const dark = toonMaterial({ color: '#1a1620' });
    const gold = toonMaterial({ color: '#d8a83c', emissive: '#d8a83c', emissiveIntensity: 0.15 });
    const base = new Mesh(new CylinderGeometry(1.15, 1.35, 0.35, 8), stone);
    base.position.y = 0.175;
    const step2 = new Mesh(new CylinderGeometry(0.85, 1.0, 0.3, 8), stone);
    step2.position.y = 0.5;
    const pillar = new Mesh(new CylinderGeometry(0.28, 0.42, 1.2, 6), dark);
    pillar.position.y = 1.25;
    const bowl = new Mesh(new CylinderGeometry(0.6, 0.3, 0.3, 8, 1, true), gold);
    bowl.position.y = 1.95;
    for (const m of [base, step2, pillar, bowl]) {
      m.castShadow = true;
      m.receiveShadow = true;
      this.group.add(m);
    }
    this.ring = new Mesh(new TorusGeometry(0.85, 0.025, 6, 48), glowMaterial('#b46bff', 2.2));
    this.ring.position.y = 2.6;
    this.ring2 = new Mesh(new TorusGeometry(0.62, 0.018, 6, 40), glowMaterial('#ffcf7a', 2.0));
    this.ring2.position.y = 2.6;
    this.crystal = new Mesh(new OctahedronGeometry(0.18, 0), glowMaterial('#d9b8ff', 2.5));
    this.crystal.position.y = 2.6;
    this.group.add(this.ring, this.ring2, this.crystal);
    this.fire = new Fire(new Vector3(0, 2.1, 0), 0.9, '#9a4dff', '#ffd9a8', true, vfx);
    this.group.add(this.fire.group);
    this.setKindled(false);
  }

  setKindled(k: boolean): void {
    this.kindled = k;
    this.fire.setLit(k);
    this.ring.visible = k;
    this.ring2.visible = k;
  }

  prompt(player: Player): string | null {
    if (player.dead) return null;
    return this.kindled ? 'Rest at Sigil Altar' : 'Kindle Sigil Altar';
  }

  interact(): void {
    if (!this.kindled) {
      this.setKindled(true);
      this.onKindle?.(this);
    } else {
      this.onRest?.(this);
    }
  }

  update(dt: number): void {
    this.t += dt;
    this.ring.rotation.x = Math.PI / 2 + Math.sin(this.t * 0.7) * 0.3;
    this.ring.rotation.y = this.t * 0.6;
    this.ring2.rotation.x = Math.PI / 2 - Math.sin(this.t * 0.9) * 0.35;
    this.ring2.rotation.z = -this.t * 0.8;
    this.crystal.rotation.y = this.t * 1.5;
    this.crystal.position.y = 2.6 + Math.sin(this.t * 2) * 0.06;
    this.fire.update(dt);
  }

  /** Where the player stands when resting/respawning. */
  standPoint(): Vector3 {
    return new Vector3(this.position.x - Math.sin(this.respawnYaw) * 1.6, this.position.y, this.position.z - Math.cos(this.respawnYaw) * 1.6);
  }
}
