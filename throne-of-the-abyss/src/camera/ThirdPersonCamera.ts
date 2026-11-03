import { Vector3, type PerspectiveCamera } from 'three';
import { clamp, damp, dampAngle, lerp, yawFromDir } from '@/core/MathUtils';
import type { CollisionWorld } from '@/physics/CollisionWorld';
import { CameraShake } from './CameraShake';

export interface CameraOverride {
  position: Vector3;
  lookAt: Vector3;
  fovOffset?: number;
}

const MIN_PITCH = -0.55; // looking up
const MAX_PITCH = 1.15; // looking down

/**
 * Souls-style orbit camera: free orbit with mouse/stick, collision-aware spring arm,
 * lock-on framing (keeps player and target on screen), shake and a blendable
 * cinematic override for boss intros and scripted moments.
 */
export class ThirdPersonCamera {
  yaw = Math.PI; // facing -Z initially
  pitch = 0.32;
  distance = 4.6;
  minDistance = 2.4;
  maxDistance = 7.5;
  pivotHeight = 1.5;
  shoulder = 0.25;
  readonly shake = new CameraShake();
  readonly pivot = new Vector3();
  private currentDist = 4.6;
  private readonly tmp = new Vector3();
  private readonly desired = new Vector3();
  private readonly lookPoint = new Vector3();
  private override: CameraOverride | null = null;
  private overrideWeight = 0;
  private initialised = false;
  /** Extra distance pushed by gameplay (sprint, big enemies). */
  distanceBias = 0;
  /** Momentary FOV punch (degrees) for big impacts; decays automatically. */
  fovKick = 0;

  constructor(
    readonly camera: PerspectiveCamera,
    private readonly world: CollisionWorld,
  ) {}

  /** Horizontal forward of the camera (for camera-relative movement). */
  forward(out: Vector3): Vector3 {
    return out.set(Math.sin(this.yaw), 0, Math.cos(this.yaw));
  }
  right(out: Vector3): Vector3 {
    return out.set(-Math.cos(this.yaw), 0, Math.sin(this.yaw));
  }

  setOverride(o: CameraOverride | null): void {
    this.override = o;
  }

  snapBehind(targetYaw: number): void {
    this.yaw = targetYaw;
    this.pitch = 0.3;
  }

  zoom(steps: number): void {
    this.distance = clamp(this.distance + steps * 0.45, this.minDistance, this.maxDistance);
  }

  update(
    dt: number,
    follow: Vector3,
    lookInput: { x: number; y: number },
    lockTarget: Vector3 | null,
  ): void {
    const pivotTarget = this.tmp.set(follow.x, follow.y + this.pivotHeight, follow.z);
    if (!this.initialised) {
      this.pivot.copy(pivotTarget);
      this.initialised = true;
    }
    // Pivot follows tightly horizontally, softer vertically (jumps don't jerk the view).
    this.pivot.x = damp(this.pivot.x, pivotTarget.x, 22, dt);
    this.pivot.z = damp(this.pivot.z, pivotTarget.z, 22, dt);
    this.pivot.y = damp(this.pivot.y, pivotTarget.y, 9, dt);

    if (lockTarget) {
      const dx = lockTarget.x - follow.x;
      const dz = lockTarget.z - follow.z;
      const flat = Math.max(0.5, Math.hypot(dx, dz));
      const desiredYaw = yawFromDir(dx, dz);
      const heightDiff = lockTarget.y - (follow.y + 1.2);
      const desiredPitch = clamp(0.22 - Math.atan2(heightDiff, flat) * 0.8 + (flat < 3 ? (3 - flat) * 0.08 : 0), -0.2, 0.85);
      this.yaw = dampAngle(this.yaw, desiredYaw, 9, dt);
      this.pitch = damp(this.pitch, desiredPitch, 6, dt);
    } else {
      this.yaw -= lookInput.x;
      this.pitch = clamp(this.pitch + lookInput.y, MIN_PITCH, MAX_PITCH);
    }

    // Spring arm with collision: pull in instantly, ease back out.
    const targetDist = this.distance + this.distanceBias;
    const cp = Math.cos(this.pitch);
    const dirX = -Math.sin(this.yaw) * cp;
    const dirY = Math.sin(this.pitch);
    const dirZ = -Math.cos(this.yaw) * cp;
    const rx = -Math.cos(this.yaw) * this.shoulder;
    const rz = Math.sin(this.yaw) * this.shoulder;
    const ox = this.pivot.x + rx;
    const oy = this.pivot.y;
    const oz = this.pivot.z + rz;
    const hit = this.world.raycast(ox, oy, oz, dirX, dirY, dirZ, targetDist + 0.3);
    const allowed = hit ? Math.max(0.6, hit.distance - 0.3) : targetDist;
    this.currentDist = allowed < this.currentDist ? allowed : damp(this.currentDist, allowed, 3.5, dt);

    this.desired.set(ox + dirX * this.currentDist, oy + dirY * this.currentDist, oz + dirZ * this.currentDist);
    // Never dip below the floor the player stands on.
    this.desired.y = Math.max(this.desired.y, follow.y + 0.3);

    if (lockTarget) {
      // Frame between pivot and target, biased toward the target.
      this.lookPoint.set(
        lerp(this.pivot.x, lockTarget.x, 0.35),
        lerp(this.pivot.y - 0.1, lockTarget.y, 0.35),
        lerp(this.pivot.z, lockTarget.z, 0.35),
      );
    } else {
      this.lookPoint.set(ox - dirX * 2, oy - dirY * 2 + 0.05, oz - dirZ * 2);
    }

    // Cinematic override blending.
    const wantOverride = this.override !== null;
    this.overrideWeight = damp(this.overrideWeight, wantOverride ? 1 : 0, wantOverride ? 2.5 : 4, dt);
    if (this.override && this.overrideWeight > 0.001) {
      const w = this.overrideWeight;
      this.desired.lerp(this.override.position, w);
      this.lookPoint.lerp(this.override.lookAt, w);
    }

    this.shake.update(dt);
    this.fovKick = damp(this.fovKick, 0, 6, dt);
    this.camera.position.copy(this.desired);
    this.camera.position.y += this.shake.offsetY;
    this.camera.lookAt(this.lookPoint);
    this.camera.rotateY(this.shake.yaw);
    this.camera.rotateX(this.shake.pitch);
    this.camera.rotateZ(this.shake.roll);
  }

  get overrideActive(): boolean {
    return this.overrideWeight > 0.05;
  }
}
