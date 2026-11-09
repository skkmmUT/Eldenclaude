import { Vector3 } from 'three';
import type { CollisionWorld } from './CollisionWorld';

export const GRAVITY = 26;

/**
 * Kinematic capsule controller. Gameplay states set `desiredVelocity` (horizontal) and
 * may write `velocity.y` (jumps); the motor integrates, resolves collisions, handles
 * step-up / step-down snapping and tracks fall height for plunge attacks & fall damage.
 */
export class CharacterMotor {
  readonly position = new Vector3();
  readonly velocity = new Vector3();
  /** Horizontal velocity requested by gameplay this frame (m/s). */
  readonly desiredVelocity = new Vector3();
  grounded = true;
  wasGrounded = true;
  /** Highest Y reached since leaving the ground. */
  airPeakY = 0;
  /** Height fallen in the landing that just happened (valid on `justLanded`). */
  lastFallHeight = 0;
  justLanded = false;
  touchingWall = false;
  gravityScale = 1;
  /** When false the motor ignores gravity (scripted lunges, cutscenes). */
  useGravity = true;

  constructor(
    private readonly world: CollisionWorld,
    public radius = 0.38,
    public height = 1.8,
    public stepHeight = 0.42,
  ) {}

  teleport(x: number, y: number, z: number): void {
    this.position.set(x, y, z);
    this.velocity.set(0, 0, 0);
    this.desiredVelocity.set(0, 0, 0);
    this.grounded = true;
    this.airPeakY = y;
  }

  update(dt: number): void {
    this.wasGrounded = this.grounded;
    this.justLanded = false;
    this.velocity.x = this.desiredVelocity.x;
    this.velocity.z = this.desiredVelocity.z;
    if (this.useGravity && !this.grounded) this.velocity.y -= GRAVITY * this.gravityScale * dt;

    // Sub-step so fast movement (rolls, lunges) can never tunnel through thin walls.
    const travel = Math.hypot(this.velocity.x, this.velocity.z) * dt + Math.abs(this.velocity.y * dt);
    const steps = Math.min(8, Math.max(1, Math.ceil(travel / (this.radius * 0.5))));
    const h = dt / steps;
    this.touchingWall = false;
    for (let i = 0; i < steps; i++) this.step(h);

    if (this.position.y < this.world.killY) {
      this.position.y = this.world.killY;
      this.velocity.y = 0;
    }
  }

  private step(dt: number): void {
    const p = this.position;
    // Horizontal move + wall resolution (ignore geometry we can step over).
    const ox = p.x;
    const oz = p.z;
    p.x += this.velocity.x * dt;
    p.z += this.velocity.z * dt;
    const stepTop = this.grounded ? this.stepHeight : 0.05;
    if (this.world.resolveCircle(p, this.radius, p.y + stepTop, p.y + this.height)) this.touchingWall = true;
    // Terrain too steep to climb acts as a wall; slide along whichever axis is walkable.
    if (this.world.terrain && this.tooSteep(ox, oz, p.x, p.z)) {
      this.touchingWall = true;
      if (!this.tooSteep(ox, oz, p.x, oz)) p.z = oz;
      else if (!this.tooSteep(ox, oz, ox, p.z)) p.x = ox;
      else {
        p.x = ox;
        p.z = oz;
      }
    }

    // Vertical.
    const footR = this.radius * 0.55;
    if (this.grounded) {
      if (this.velocity.y > 0) {
        this.grounded = false; // jump
        this.airPeakY = p.y;
      } else {
        let g = this.world.groundHeight(p.x, p.z, footR, p.y + this.stepHeight);
        // Rising terrain under the feet (steeper than a step but not a wall) lifts us.
        g = Math.max(g, this.world.terrainHeight(p.x, p.z));
        if (g >= p.y - this.stepHeight - 0.05) {
          p.y = g; // follow stairs up and down
          this.velocity.y = 0;
          return;
        }
        this.grounded = false; // walked off a ledge
        this.velocity.y = Math.min(this.velocity.y, 0);
        this.airPeakY = p.y;
      }
    }

    const newY = p.y + this.velocity.y * dt;
    if (this.velocity.y > 0) {
      const ceil = this.world.ceilingHeight(p.x, p.z, footR, p.y + this.height - 0.05);
      if (newY + this.height > ceil) {
        p.y = ceil - this.height;
        this.velocity.y = 0;
        return;
      }
    }
    const g = this.world.groundHeight(p.x, p.z, footR, Math.max(p.y, newY) + 0.01);
    // The terrain is solid everywhere: never let the feet end up under its surface (the
    // height-field is otherwise only a floor when approached from above).
    const th = this.world.terrainHeight(p.x, p.z);
    if (newY < th && th > g) {
      p.y = th;
      this.lastFallHeight = Math.max(0, this.airPeakY - th);
      this.velocity.y = 0;
      this.grounded = true;
      this.justLanded = true;
      return;
    }
    if (newY <= g) {
      p.y = g;
      this.lastFallHeight = Math.max(0, this.airPeakY - g);
      this.velocity.y = 0;
      this.grounded = true;
      this.justLanded = true;
    } else {
      p.y = newY;
      if (p.y > this.airPeakY) this.airPeakY = p.y;
    }
  }

  /** Max climbable rise per metre on terrain (≈ 50° slopes). */
  maxSlope = 1.2;

  private tooSteep(x0: number, z0: number, x1: number, z1: number): boolean {
    const base = this.position.y;
    const th = this.world.terrainHeight(x1, z1);
    const rise = th - base;
    if (rise <= 0.05) return false;
    const run = Math.hypot(x1 - x0, z1 - z0);
    return rise > Math.max(0.06, run * this.maxSlope) && th > this.world.terrainHeight(x0, z0) + 0.01;
  }

  /** Current height above whatever is beneath (for plunge-attack eligibility). */
  heightAboveGround(): number {
    const g = this.world.groundHeight(this.position.x, this.position.z, this.radius * 0.55, this.position.y + 0.01);
    return g === -Infinity ? 999 : this.position.y - g;
  }
}
