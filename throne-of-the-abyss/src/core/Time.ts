/**
 * Game clock with time scaling and hit-stop. Hit-stop freezes simulation for a few
 * milliseconds on impactful hits — the single most important "game feel" trick for
 * making blows land with weight.
 */
export class GameTime {
  /** Unscaled seconds since start. */
  realTime = 0;
  /** Scaled simulation seconds since start. */
  time = 0;
  /** Global time scale (slow-motion, pause = 0). */
  timeScale = 1;
  private hitStopRemaining = 0;
  private hitStopScale = 0.02;

  /** Freeze the simulation for `seconds` (real time). Longer requests win. */
  hitStop(seconds: number, scale = 0.02): void {
    if (seconds > this.hitStopRemaining) {
      this.hitStopRemaining = seconds;
      this.hitStopScale = scale;
    }
  }

  get inHitStop(): boolean {
    return this.hitStopRemaining > 0;
  }

  /** Converts a real frame delta into the simulation delta. */
  advance(realDt: number): number {
    this.realTime += realDt;
    let scale = this.timeScale;
    if (this.hitStopRemaining > 0) {
      this.hitStopRemaining -= realDt;
      scale *= this.hitStopScale;
    }
    const dt = realDt * scale;
    this.time += dt;
    return dt;
  }
}
