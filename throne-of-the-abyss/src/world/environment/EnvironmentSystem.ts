import {
  Color,
  DirectionalLight,
  FogExp2,
  HemisphereLight,
  PMREMGenerator,
  Scene,
  Vector3,
  type WebGLRenderer,
  type WebGLRenderTarget,
} from 'three';
import { SkyDome } from './SkyDome';
import type { GraphicsProfile } from '@/render/GraphicsSettings';
import { lerp } from '@/core/MathUtils';
import { TimeOfDay } from './TimeOfDay';
import { Weather } from './Weather';
import { CloudLayer } from './CloudLayer';
import { Rain } from './Rain';

/**
 * Owns everything that makes the world feel lit and alive: the physical sky (Preetham
 * scattering), cloud layer and night sky, the sun/moon shadow light, hemisphere fill,
 * image-based lighting from the sky (reflections on metal and water), distance haze,
 * time of day and weather.
 */
export class EnvironmentSystem {
  readonly time = new TimeOfDay();
  readonly weather = new Weather();
  readonly sun = new DirectionalLight('#ffffff', 3);
  readonly hemi = new HemisphereLight('#b4d2ff', '#7a6a48', 1.2);
  readonly sky = new SkyDome(1000);
  readonly clouds = new CloudLayer();
  readonly rain = new Rain();
  readonly fog = new FogExp2('#bfd3e8', 0.0016);
  private readonly envSky = new SkyDome(10);
  private readonly envScene = new Scene();
  private readonly pmrem: PMREMGenerator;
  private envTarget: WebGLRenderTarget | null = null;
  private lastEnvSun = new Vector3(0, -1, 0);
  private lastEnvTurbidity = -1;
  private profile: GraphicsProfile;
  /** Night factor of the last update (0 day … 1 night) — read by fires, fireflies, UI. */
  night = 0;
  exposure = 0.85;

  constructor(
    private readonly scene: Scene,
    renderer: WebGLRenderer,
    profile: GraphicsProfile,
  ) {
    this.profile = profile;
    this.pmrem = new PMREMGenerator(renderer);
    scene.add(this.sky.mesh, this.clouds.mesh, this.rain.mesh);
    this.envScene.add(this.envSky.mesh);

    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(profile.shadowMapSize, profile.shadowMapSize);
    const sc = this.sun.shadow.camera;
    sc.left = -42;
    sc.right = 42;
    sc.top = 42;
    sc.bottom = -42;
    sc.near = 1;
    sc.far = 260;
    this.sun.shadow.bias = -0.0004;
    this.sun.shadow.normalBias = 0.04;
    scene.add(this.sun, this.sun.target, this.hemi);
    scene.fog = this.fog;
    scene.background = new Color('#9ec2ea');
    this.applyProfile(profile);
  }

  applyProfile(p: GraphicsProfile): void {
    this.profile = p;
    this.sun.shadow.mapSize.set(p.shadowMapSize, p.shadowMapSize);
    this.sun.shadow.map?.dispose();
    (this.sun.shadow as { map: unknown }).map = null;
    this.rain.mesh.visible = false;
  }

  update(realDt: number, focus: Vector3, cameraPos: Vector3): void {
    this.time.update(realDt);
    this.weather.update(realDt);
    const L = this.time.lighting();
    const w = this.weather.current;
    this.night = L.night;

    // Sky
    this.sky.configure(L.sunDir, L.night, w.coverage);
    this.sky.mesh.position.copy(cameraPos);
    const turbidity = w.coverage * 10 + L.night * 5;

    // Clouds & night sky
    const cu = this.clouds.uniforms;
    cu.uSunDir.value.copy(L.sunDir.y > -0.1 ? L.sunDir : L.moonDir);
    cu.uMoonDir.value.copy(L.moonDir);
    cu.uSunColor.value.copy(L.keyColor).multiplyScalar(L.night > 0.5 ? 0.35 : 1);
    cu.uSkyTint.value.copy(L.skyColor);
    cu.uCoverage.value = w.coverage;
    cu.uDarkness.value = w.darkness;
    cu.uNight.value = L.night;
    cu.uWind.value = w.wind;
    this.clouds.update(realDt, cameraPos);

    // Lights
    const keyDir = L.night > 0.5 ? L.moonDir : L.sunDir;
    this.sun.color.copy(L.keyColor);
    this.sun.intensity = L.keyIntensity * (L.night > 0.5 ? 1 : w.sunDim);
    this.hemi.color.copy(L.skyColor).lerp(new Color('#9aa4b4'), w.coverage * 0.5);
    this.hemi.groundColor.copy(L.groundColor);
    this.hemi.intensity = L.hemiIntensity * lerp(1, 1.15, w.coverage); // overcast = softer, more fill
    // Shadow frustum follows the player with texel snapping for stable shadows.
    const snap = (this.sun.shadow.camera.right * 2) / this.sun.shadow.mapSize.x;
    const fx = Math.round(focus.x / snap) * snap;
    const fz = Math.round(focus.z / snap) * snap;
    this.sun.target.position.set(fx, focus.y, fz);
    this.sun.position.set(fx + keyDir.x * 120, focus.y + Math.max(0.08, keyDir.y) * 120, fz + keyDir.z * 120);

    // Haze: clears to the far plane on clear days, thickens with weather.
    const baseDensity = 0.85 / this.profile.viewDistance;
    this.fog.density = baseDensity * w.haze;
    this.fog.color.copy(L.hazeColor).lerp(new Color('#9aa0aa'), w.coverage * 0.45 * (1 - L.night));
    (this.scene.background as Color).copy(this.fog.color);
    this.exposure = L.exposure;

    // Rain
    this.rain.update(realDt, cameraPos, w.rain);

    // Image-based lighting from the sky: refresh when the sun moved or weather changed.
    const moved = this.lastEnvSun.angleTo(L.sunDir) > 0.02;
    if (moved || Math.abs(turbidity - this.lastEnvTurbidity) > 0.5 || !this.envTarget) this.refreshEnvironment(L.sunDir, turbidity, L.night, w.coverage);
    this.scene.environmentIntensity = lerp(0.9, 0.18, L.night) * lerp(1, 0.75, w.coverage);
  }

  private refreshEnvironment(sunDir: Vector3, turbidity: number, night: number, coverage: number): void {
    this.envSky.configure(sunDir, night, coverage);
    this.envSky.uniforms.uSunVisible.value = 0; // the sun itself comes from the direct light
    const rt = this.pmrem.fromScene(this.envScene, 0, 0.1, 100);
    this.envTarget?.dispose();
    this.envTarget = rt;
    this.scene.environment = rt.texture;
    this.lastEnvSun.copy(sunDir);
    this.lastEnvTurbidity = turbidity;
  }

  /** Readable summary for menus. */
  describe(): string {
    const w = { clear: 'Clear', fair: 'Fair', overcast: 'Overcast', rain: 'Rain' }[this.weather.kind];
    const h = Math.floor(this.time.hours);
    const m = Math.floor((this.time.hours - h) * 60);
    return `${this.time.label} · ${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')} · ${w}`;
  }
}
