import { Color, Vector3 } from 'three';
import { clamp01, lerp, smoothstep } from '@/core/MathUtils';

/** Lighting state derived from the time of day (before weather is applied). */
export interface DayLighting {
  sunDir: Vector3; // direction TO the sun
  moonDir: Vector3;
  /** Sun elevation as sin(altitude) in [-1, 1]. */
  sunHeight: number;
  /** 0 = full day, 1 = full night. */
  night: number;
  keyColor: Color; // colour of the shadow-casting light (sun by day, moon by night)
  keyIntensity: number;
  skyColor: Color; // hemisphere sky term
  groundColor: Color; // hemisphere bounce from the ground
  hemiIntensity: number;
  hazeColor: Color;
  exposure: number;
}

/**
 * World clock. One in-game day lasts `dayLengthMinutes` real minutes (default 24).
 * Produces a natural day palette: warm low sun at dawn/dusk, neutral-warm white at noon,
 * a cool moonlit night that stays readable (never pitch black).
 */
export class TimeOfDay {
  /** Hours in [0, 24). */
  hours = 9.5;
  dayLengthMinutes = 24;
  paused = false;
  private readonly out: DayLighting = {
    sunDir: new Vector3(),
    moonDir: new Vector3(),
    sunHeight: 0,
    night: 0,
    keyColor: new Color(),
    keyIntensity: 0,
    skyColor: new Color(),
    groundColor: new Color(),
    hemiIntensity: 0,
    hazeColor: new Color(),
    exposure: 1,
  };

  update(realDt: number): void {
    if (this.paused) return;
    const hoursPerSecond = 24 / (this.dayLengthMinutes * 60);
    this.hours = (this.hours + realDt * hoursPerSecond) % 24;
  }

  /** Jump to a given hour (resting at an altar can pass time). */
  set(hours: number): void {
    this.hours = ((hours % 24) + 24) % 24;
  }

  get label(): string {
    const h = this.hours;
    if (h >= 4.5 && h < 7.5) return 'Dawn';
    if (h >= 7.5 && h < 11.5) return 'Morning';
    if (h >= 11.5 && h < 14.5) return 'Noon';
    if (h >= 14.5 && h < 18) return 'Afternoon';
    if (h >= 18 && h < 21) return 'Dusk';
    return 'Night';
  }

  lighting(): DayLighting {
    const o = this.out;
    // Sun travels east (+X) → overhead (tilted south) → west; long summer day 05:30–19:30.
    const a = ((this.hours - 5.5) / 14) * Math.PI; // 0 at sunrise, PI at sunset
    const tilt = 0.42; // sun passes south of zenith
    o.sunDir.set(Math.cos(a), Math.sin(a) * Math.cos(tilt), -Math.sin(a) * Math.sin(tilt) - 0.08).normalize();
    o.moonDir.copy(o.sunDir).negate();
    o.moonDir.y = Math.max(0.25, o.moonDir.y);
    o.moonDir.normalize();
    const h = o.sunHeight = o.sunDir.y;
    o.night = 1 - smoothstep(-0.16, 0.04, h);
    const day = 1 - o.night;
    const golden = 1 - smoothstep(0.05, 0.35, h); // 1 near the horizon

    // Key light: sun by day, moon by night.
    const sunCol = new Color('#fff1dc').lerp(new Color('#ffb070'), golden * 0.85);
    const sunI = lerp(1.1, 3.4, smoothstep(0.0, 0.45, h)) * smoothstep(-0.04, 0.06, h);
    const moonCol = new Color('#a8bcff');
    const moonI = 0.85;
    if (day > 0.5) {
      o.keyColor.copy(sunCol);
      o.keyIntensity = sunI;
    } else {
      o.keyColor.copy(moonCol);
      o.keyIntensity = moonI * smoothstep(0.5, 1, o.night);
    }

    // Hemisphere (sky fill + warm ground bounce).
    const daySky = new Color('#b4d2ff');
    const duskSky = new Color('#ffb898');
    const nightSky = new Color('#3a4f86');
    o.skyColor.copy(daySky).lerp(duskSky, golden * day * 0.7).lerp(nightSky, o.night);
    o.groundColor.copy(new Color('#7a6a48')).lerp(new Color('#1e2230'), o.night);
    o.hemiIntensity = lerp(1.15, 0.95, o.night) * lerp(1, 0.85, golden * day);

    // Aerial perspective haze.
    o.hazeColor.copy(new Color('#a7c0dc')).lerp(new Color('#e8b896'), golden * day * 0.75).lerp(new Color('#1e2a46'), o.night);
    o.exposure = lerp(0.72, 1.25, o.night);
    return o;
  }

  /** Normalised 0..1 for UI/serialisation. */
  get fraction(): number {
    return clamp01(this.hours / 24);
  }
}
