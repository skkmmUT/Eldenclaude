import { damp, randRange } from '@/core/MathUtils';

export type WeatherKind = 'clear' | 'fair' | 'overcast' | 'rain';

export interface WeatherParams {
  coverage: number; // cloud cover 0..1
  darkness: number; // cloud underside darkening
  sunDim: number; // multiplier on direct sunlight
  haze: number; // multiplier on distance haze density
  rain: number; // precipitation intensity 0..1
  wind: number; // cloud drift speed multiplier
}

const PRESETS: Record<WeatherKind, WeatherParams> = {
  clear: { coverage: 0.22, darkness: 0.05, sunDim: 1, haze: 1, rain: 0, wind: 1 },
  fair: { coverage: 0.42, darkness: 0.12, sunDim: 0.95, haze: 1.1, rain: 0, wind: 1.2 },
  overcast: { coverage: 0.74, darkness: 0.35, sunDim: 0.55, haze: 1.5, rain: 0, wind: 1.5 },
  rain: { coverage: 0.88, darkness: 0.55, sunDim: 0.35, haze: 2.4, rain: 1, wind: 2 },
};

/**
 * Weather state machine with smooth transitions. Clear and fair skies dominate; overcast
 * and rain are occasional so the world stays bright most of the time.
 */
export class Weather {
  kind: WeatherKind = 'clear';
  readonly current: WeatherParams = { ...PRESETS.clear };
  private timer = randRange(160, 260);
  /** Disable automatic changes (tests, scripted scenes). */
  locked = false;

  set(kind: WeatherKind, instant = false): void {
    this.kind = kind;
    if (instant) Object.assign(this.current, PRESETS[kind]);
    this.timer = randRange(160, 300);
  }

  private pickNext(): WeatherKind {
    const r = Math.random();
    switch (this.kind) {
      case 'clear':
        return r < 0.6 ? 'fair' : 'clear';
      case 'fair':
        return r < 0.45 ? 'clear' : r < 0.8 ? 'fair' : 'overcast';
      case 'overcast':
        return r < 0.45 ? 'rain' : r < 0.8 ? 'fair' : 'overcast';
      case 'rain':
        return r < 0.7 ? 'overcast' : 'fair';
    }
  }

  update(realDt: number): void {
    if (!this.locked) {
      this.timer -= realDt;
      if (this.timer <= 0) this.set(this.pickNext());
    }
    const target = PRESETS[this.kind];
    const c = this.current;
    const k = 0.05; // ~20 s transitions
    c.coverage = damp(c.coverage, target.coverage, k, realDt);
    c.darkness = damp(c.darkness, target.darkness, k, realDt);
    c.sunDim = damp(c.sunDim, target.sunDim, k, realDt);
    c.haze = damp(c.haze, target.haze, k, realDt);
    c.rain = damp(c.rain, target.rain, k * 1.5, realDt);
    c.wind = damp(c.wind, target.wind, k, realDt);
  }
}
