import { Pose } from './Pose';
import type { PoseDef } from './Skeleton';

export type Easing = 'linear' | 'in' | 'out' | 'inOut' | 'snap';

export interface KeyDef {
  /** Time in seconds. */
  t: number;
  pose: PoseDef;
  /** Easing used when interpolating from this key to the next one. */
  ease?: Easing;
}

export interface ClipDef {
  name: string;
  loop: boolean;
  keys: KeyDef[];
  /** Optional named markers (footsteps, impact frame) — fired as animation events. */
  events?: Array<{ t: number; name: string }>;
}

const EASE: Record<Easing, (t: number) => number> = {
  linear: (t) => t,
  in: (t) => t * t,
  out: (t) => 1 - (1 - t) * (1 - t),
  inOut: (t) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2),
  // Fast acceleration then hard stop — reads as a committed strike.
  snap: (t) => 1 - Math.pow(1 - t, 4),
};

/** Keyframed pose clip. Poses are pre-baked to quaternions for cheap sampling. */
export class AnimClip {
  readonly name: string;
  readonly loop: boolean;
  readonly duration: number;
  readonly events: Array<{ t: number; name: string }>;
  private readonly times: number[];
  private readonly poses: Pose[];
  private readonly eases: Array<(t: number) => number>;

  constructor(def: ClipDef) {
    if (def.keys.length === 0) throw new Error(`Clip ${def.name} has no keys`);
    const keys = [...def.keys].sort((a, b) => a.t - b.t);
    this.name = def.name;
    this.loop = def.loop;
    this.times = keys.map((k) => k.t);
    this.poses = keys.map((k) => Pose.fromDef(k.pose));
    this.eases = keys.map((k) => EASE[k.ease ?? 'inOut']);
    this.duration = Math.max(1e-3, keys[keys.length - 1].t);
    this.events = def.events ?? [];
  }

  sample(time: number, out: Pose): Pose {
    const n = this.times.length;
    if (n === 1) return out.copy(this.poses[0]);
    let t = time;
    if (this.loop) {
      t = ((t % this.duration) + this.duration) % this.duration;
    } else if (t >= this.duration) {
      return out.copy(this.poses[n - 1]);
    } else if (t <= this.times[0]) {
      return out.copy(this.poses[0]);
    }
    let i = 0;
    while (i < n - 2 && t >= this.times[i + 1]) i++;
    const t0 = this.times[i];
    const t1 = this.times[i + 1];
    const f = t1 > t0 ? (t - t0) / (t1 - t0) : 1;
    return out.blend(this.poses[i], this.poses[i + 1], this.eases[i](Math.min(1, Math.max(0, f))));
  }
}
