import { Pose } from './Pose';
import { AnimClip } from './AnimationClip';
import { JOINT_COUNT, JOINT_INDEX, type JointName } from './Skeleton';

export interface BlendSpaceEntry {
  clip: AnimClip;
  value: number;
  /** Playback speed multiplier for this sample (e.g. sprint cycles faster). */
  rate?: number;
}

/**
 * 1D blend space (idle → walk → run → sprint). Neighbouring samples are blended by the
 * parameter and share one normalised phase so foot contacts stay in sync.
 */
export class BlendSpace1D {
  param = 0;
  private phase = 0;
  private readonly a = new Pose();
  private readonly b = new Pose();

  constructor(private readonly entries: BlendSpaceEntry[]) {
    this.entries.sort((x, y) => x.value - y.value);
  }

  private neighbours(): [BlendSpaceEntry, BlendSpaceEntry, number] {
    const e = this.entries;
    if (this.param <= e[0].value) return [e[0], e[0], 0];
    for (let i = 0; i < e.length - 1; i++) {
      if (this.param <= e[i + 1].value) {
        const t = (this.param - e[i].value) / (e[i + 1].value - e[i].value);
        return [e[i], e[i + 1], t];
      }
    }
    const last = e[e.length - 1];
    return [last, last, 0];
  }

  update(dt: number): void {
    const [a, b, t] = this.neighbours();
    const durA = a.clip.duration / (a.rate ?? 1);
    const durB = b.clip.duration / (b.rate ?? 1);
    const dur = durA + (durB - durA) * t;
    this.phase = (this.phase + dt / Math.max(0.05, dur)) % 1;
  }

  get normalizedPhase(): number {
    return this.phase;
  }

  sample(out: Pose): Pose {
    const [a, b, t] = this.neighbours();
    a.clip.sample(this.phase * a.clip.duration, this.a);
    if (t <= 0.0001 || a === b) return out.copy(this.a);
    b.clip.sample(this.phase * b.clip.duration, this.b);
    return out.blend(this.a, this.b, t);
  }
}

type Source = { kind: 'clip'; clip: AnimClip; speed: number } | { kind: 'blend'; space: BlendSpace1D };

interface OverlayLayer {
  source: AnimClip | null;
  time: number;
  weight: number;
  targetWeight: number;
  fadeSpeed: number;
  mask: number[] | null;
}

/**
 * Animation state player with snapshot cross-fades and masked overlay layers.
 * Gameplay state machines decide *what* plays; the animator only blends.
 */
export class Animator {
  readonly output = new Pose();
  private source: Source | null = null;
  private time = 0;
  private fadeFrom = new Pose();
  private fadeT = 1;
  private fadeDuration = 0.15;
  private readonly sampleBuf = new Pose();
  private readonly layerBuf = new Pose();
  private layers = new Map<string, OverlayLayer>();
  private firedEvents = new Set<string>();
  /** Animation event callback (footsteps, impact markers). */
  onEvent: ((name: string) => void) | null = null;
  currentName = '';

  get clipTime(): number {
    return this.time;
  }

  /** Play a clip with a cross-fade from whatever is currently shown. */
  play(clip: AnimClip, fade = 0.15, speed = 1, startTime = 0): void {
    this.beginFade(fade);
    this.source = { kind: 'clip', clip, speed };
    this.time = startTime;
    this.currentName = clip.name;
    this.firedEvents.clear();
  }

  playBlendSpace(space: BlendSpace1D, name: string, fade = 0.2): void {
    if (this.source?.kind === 'blend' && this.source.space === space) return;
    this.beginFade(fade);
    this.source = { kind: 'blend', space };
    this.time = 0;
    this.currentName = name;
    this.firedEvents.clear();
  }

  /** Change playback speed of the current clip (0 freezes — used for charge holds). */
  setSpeed(speed: number): void {
    if (this.source?.kind === 'clip') this.source.speed = speed;
  }

  isPlaying(name: string): boolean {
    return this.currentName === name;
  }

  private beginFade(fade: number): void {
    this.fadeFrom.copy(this.output);
    this.fadeT = fade > 0 ? 0 : 1;
    this.fadeDuration = Math.max(1e-3, fade);
  }

  /** Configure (or update) a masked overlay layer, e.g. upper-body guard while walking. */
  setLayer(name: string, clip: AnimClip | null, targetWeight: number, mask: JointName[] | null, fadeTime = 0.12): void {
    let layer = this.layers.get(name);
    if (!layer) {
      layer = { source: clip, time: 0, weight: 0, targetWeight, fadeSpeed: 1 / fadeTime, mask: null };
      this.layers.set(name, layer);
    }
    if (layer.source !== clip) {
      layer.source = clip;
      layer.time = 0;
    }
    layer.targetWeight = targetWeight;
    layer.fadeSpeed = 1 / Math.max(1e-3, fadeTime);
    layer.mask = mask ? mask.map((j) => JOINT_INDEX[j]) : null;
  }

  update(dt: number): Pose {
    const src = this.source;
    if (src) {
      if (src.kind === 'clip') {
        const prev = this.time;
        this.time += dt * src.speed;
        src.clip.sample(this.time, this.sampleBuf);
        for (const ev of src.clip.events) {
          const key = `${ev.name}@${ev.t}`;
          const crossed = src.clip.loop
            ? Math.floor((prev - ev.t) / src.clip.duration) !== Math.floor((this.time - ev.t) / src.clip.duration)
            : prev < ev.t && this.time >= ev.t && !this.firedEvents.has(key);
          if (crossed) {
            this.firedEvents.add(key);
            this.onEvent?.(ev.name);
          }
        }
      } else {
        const before = src.space.normalizedPhase;
        src.space.update(dt);
        src.space.sample(this.sampleBuf);
        const after = src.space.normalizedPhase;
        // Footstep events at phase 0 and 0.5 of the locomotion cycle.
        if (src.space.param > 0.05) {
          if (after < before) this.onEvent?.('footstep');
          else if (before < 0.5 && after >= 0.5) this.onEvent?.('footstep');
        }
      }
    } else {
      this.sampleBuf.identity();
    }

    if (this.fadeT < 1) {
      this.fadeT = Math.min(1, this.fadeT + dt / this.fadeDuration);
      const w = this.fadeT * this.fadeT * (3 - 2 * this.fadeT);
      this.output.blend(this.fadeFrom, this.sampleBuf, w);
    } else {
      this.output.copy(this.sampleBuf);
    }

    for (const layer of this.layers.values()) {
      const step = layer.fadeSpeed * dt;
      layer.weight += Math.max(-step, Math.min(step, layer.targetWeight - layer.weight));
      if (layer.weight <= 0.001 || !layer.source) continue;
      layer.time += dt;
      layer.source.sample(layer.time, this.layerBuf);
      this.output.blendMasked(this.layerBuf, layer.weight, layer.mask);
    }
    return this.output;
  }

  get clipFinished(): boolean {
    const s = this.source;
    return !!s && s.kind === 'clip' && !s.clip.loop && this.time >= s.clip.duration;
  }

  /** Reset the per-joint pose (used when respawning). */
  reset(): void {
    this.output.identity();
    this.fadeFrom.identity();
    this.fadeT = 1;
    this.source = null;
    for (let i = 0; i < JOINT_COUNT; i++) this.sampleBuf.rot[i].identity();
  }
}
