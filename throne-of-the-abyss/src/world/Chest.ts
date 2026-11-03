import { BoxGeometry, Group, Mesh, Vector3 } from 'three';
import type { Player } from '@/characters/player/Player';
import { glowMaterial, surfaceMaterial } from '@/render/Materials';
import { metalTexture } from '@/render/TextureFactory';
import type { Interactable } from './Interactable';

/** Treasure chest with an opening lid; grants its contents once. */
export class Chest implements Interactable {
  readonly group = new Group();
  readonly radius = 2.0;
  opened = false;
  private readonly lid = new Group();
  private lidAngle = 0;
  private readonly glow: Mesh;
  onOpen: ((c: Chest, p: Player) => void) | null = null;

  constructor(
    readonly id: string,
    readonly position: Vector3,
    yaw: number,
    readonly contents: { weapon?: string; consumable?: string },
  ) {
    this.group.position.copy(position);
    this.group.rotation.y = yaw;
    const wood = surfaceMaterial({ color: '#3a2216' });
    const iron = surfaceMaterial({ color: '#8a8070', map: metalTexture() });
    const gold = surfaceMaterial({ color: '#d8a83c', map: metalTexture(), emissive: '#d8a83c', emissiveIntensity: 0.1 });
    const body = new Mesh(new BoxGeometry(1.2, 0.6, 0.75), wood);
    body.position.y = 0.3;
    body.castShadow = body.receiveShadow = true;
    this.group.add(body);
    for (const x of [-0.5, 0.5]) {
      const band = new Mesh(new BoxGeometry(0.08, 0.62, 0.77), iron);
      band.position.set(x, 0.3, 0);
      this.group.add(band);
    }
    this.lid.position.set(0, 0.6, -0.375);
    const lidMesh = new Mesh(new BoxGeometry(1.22, 0.22, 0.77), wood);
    lidMesh.position.set(0, 0.11, 0.375);
    lidMesh.castShadow = true;
    const lidTrim = new Mesh(new BoxGeometry(1.24, 0.05, 0.79), gold);
    lidTrim.position.set(0, 0.0, 0.375);
    const lock = new Mesh(new BoxGeometry(0.14, 0.16, 0.05), gold);
    lock.position.set(0, -0.02, 0.77);
    this.lid.add(lidMesh, lidTrim, lock);
    this.group.add(this.lid);
    this.glow = new Mesh(new BoxGeometry(1.0, 0.05, 0.6), glowMaterial('#ffd27a', 2.5));
    this.glow.position.y = 0.58;
    this.glow.visible = false;
    this.group.add(this.glow);
  }

  prompt(): string | null {
    return this.opened ? null : 'Open Chest';
  }

  interact(player: Player): void {
    if (this.opened) return;
    this.setOpened(true);
    this.onOpen?.(this, player);
  }

  setOpened(o: boolean): void {
    this.opened = o;
    this.glow.visible = o;
    if (!o) this.lidAngle = 0;
  }

  update(dt: number): void {
    const target = this.opened ? -1.9 : 0;
    this.lidAngle += (target - this.lidAngle) * Math.min(1, dt * 4);
    this.lid.rotation.x = this.lidAngle;
    if (this.opened) this.glow.visible = this.lidAngle < -0.3 && this.lidAngle > -1.85;
  }
}
