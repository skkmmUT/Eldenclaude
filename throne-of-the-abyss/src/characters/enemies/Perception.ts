import { Vector3 } from 'three';
import type { CollisionWorld } from '@/physics/CollisionWorld';
import { angleDelta, yawFromDir } from '@/core/MathUtils';
import type { Character } from '../Character';

export interface PerceptionConfig {
  sightRange: number;
  fovDeg: number;
  hearing: number;
  proximity: number;
}

/**
 * Sight (distance + view cone + line of sight) and hearing (noise events). Awareness
 * fills gradually so a careful player can sneak; crossing 1 means the enemy has spotted
 * the player. Line-of-sight raycasts are throttled.
 */
export class Perception {
  awareness = 0;
  canSee = false;
  readonly lastKnown = new Vector3();
  hasLastKnown = false;
  timeSinceSeen = 99;
  private losTimer = Math.random() * 0.2;
  private losCached = false;
  private readonly eye = new Vector3();
  private readonly tp = new Vector3();

  constructor(
    private readonly world: CollisionWorld,
    public cfg: PerceptionConfig,
  ) {}

  update(dt: number, self: Character, target: Character | null, stealthy: boolean): void {
    if (!target || target.dead) {
      this.canSee = false;
      this.awareness = Math.max(0, this.awareness - 0.2 * dt);
      return;
    }
    const dx = target.position.x - self.position.x;
    const dz = target.position.z - self.position.z;
    const dist = Math.hypot(dx, dz);
    const ang = Math.abs(angleDelta(self.facing, yawFromDir(dx, dz)));
    const inCone = ang <= (this.cfg.fovDeg * Math.PI) / 360;
    const inRange = dist <= this.cfg.sightRange;
    const close = dist <= this.cfg.proximity;
    this.losTimer -= dt;
    if ((inRange && (inCone || close)) && this.losTimer <= 0) {
      this.losTimer = 0.2;
      self.lockPoint(this.eye);
      target.centerPoint(this.tp);
      this.losCached = this.world.lineOfSight(this.eye.x, this.eye.y, this.eye.z, this.tp.x, this.tp.y + 0.3, this.tp.z);
    }
    this.canSee = inRange && (inCone || close) && this.losCached && Math.abs(target.position.y - self.position.y) < 6;
    if (this.canSee) {
      this.timeSinceSeen = 0;
      this.lastKnown.copy(target.position);
      this.hasLastKnown = true;
      let rate = 1.9 * (1 - dist / this.cfg.sightRange) + 0.35;
      if (stealthy) rate *= 0.4;
      if (close) rate *= 3;
      this.awareness = Math.min(1.5, this.awareness + rate * dt);
    } else {
      this.timeSinceSeen += dt;
      if (this.awareness < 1) this.awareness = Math.max(0, this.awareness - 0.12 * dt);
    }
  }

  /** Returns true if the noise was heard. */
  hear(self: Character, x: number, y: number, z: number, radius: number): boolean {
    const d = Math.hypot(x - self.position.x, z - self.position.z);
    if (d > radius * this.cfg.hearing || Math.abs(y - self.position.y) > 6) return false;
    const strength = 1 - d / (radius * this.cfg.hearing);
    this.awareness = Math.min(1.5, this.awareness + 0.35 + strength * 0.5);
    this.lastKnown.set(x, y, z);
    this.hasLastKnown = true;
    return true;
  }
}
