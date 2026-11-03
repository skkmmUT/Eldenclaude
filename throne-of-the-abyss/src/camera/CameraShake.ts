/**
 * Trauma-based camera shake (squared falloff, smooth noise). Hits add trauma; it decays
 * over time, so many small hits feel jittery and one huge hit feels like a quake.
 */
export class CameraShake {
  trauma = 0;
  decay = 1.6;
  maxYaw = 0.05;
  maxPitch = 0.05;
  maxRoll = 0.07;
  maxOffset = 0.18;
  private t = 0;
  yaw = 0;
  pitch = 0;
  roll = 0;
  offsetY = 0;
  /** Global intensity setting (accessibility). */
  intensity = 1;

  add(amount: number): void {
    this.trauma = Math.min(1, this.trauma + amount);
  }

  update(dt: number): void {
    this.t += dt;
    this.trauma = Math.max(0, this.trauma - this.decay * dt);
    const s = this.trauma * this.trauma * this.intensity;
    const f = 23;
    this.yaw = this.maxYaw * s * noise(this.t * f, 1.3);
    this.pitch = this.maxPitch * s * noise(this.t * f, 7.1);
    this.roll = this.maxRoll * s * noise(this.t * f, 13.7);
    this.offsetY = this.maxOffset * s * noise(this.t * f, 21.9);
  }
}

/** Cheap smooth 1D value noise in [-1, 1]. */
function noise(x: number, seed: number): number {
  const i = Math.floor(x);
  const f = x - i;
  const h = (n: number) => {
    const s = Math.sin((n + seed * 57.0) * 127.1) * 43758.5453;
    return (s - Math.floor(s)) * 2 - 1;
  };
  const u = f * f * (3 - 2 * f);
  return h(i) * (1 - u) + h(i + 1) * u;
}
