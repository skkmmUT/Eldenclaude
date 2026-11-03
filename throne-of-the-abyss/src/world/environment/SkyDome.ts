import { BackSide, Color, Mesh, ShaderMaterial, SphereGeometry, Vector3 } from 'three';

/**
 * Art-directed analytic sky: deep blue zenith, pale horizon, sun disc with a soft
 * forward-scattering halo and warm horizon glow at dawn/dusk. Values stay in a moderate
 * HDR range so the ACES tone-mapper keeps the blue saturated instead of washing it white.
 */
export class SkyDome {
  readonly mesh: Mesh;
  readonly uniforms = {
    uSunDir: { value: new Vector3(0, 1, 0) },
    uZenith: { value: new Color('#2f6bc0') },
    uHorizon: { value: new Color('#a9c9ea') },
    uGround: { value: new Color('#7f8c80') },
    uSunColor: { value: new Color('#fff2dc') },
    uGlow: { value: new Color('#ffcf9a') },
    uGlowAmount: { value: 0 },
    uSunVisible: { value: 1 },
  };

  constructor(scale = 1000) {
    const mat = new ShaderMaterial({
      uniforms: this.uniforms,
      vertexShader: /* glsl */ `
        varying vec3 vDir;
        void main() {
          vDir = normalize(position);
          vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
          gl_Position = p.xyww;
        }`,
      fragmentShader: /* glsl */ `
        uniform vec3 uSunDir, uZenith, uHorizon, uGround, uSunColor, uGlow;
        uniform float uGlowAmount, uSunVisible;
        varying vec3 vDir;
        void main() {
          vec3 d = normalize(vDir);
          float h = d.y;
          vec3 sky = mix(uHorizon, uZenith, pow(clamp(h, 0.0, 1.0), 0.55));
          // ground hemisphere seen below the horizon (rarely visible)
          sky = mix(sky, uGround, smoothstep(0.0, -0.12, h));
          vec3 sd = normalize(uSunDir);
          float c = max(dot(d, sd), 0.0);
          // horizon glow around the sun direction at low sun
          float az = max(dot(normalize(vec3(d.x, 0.0, d.z) + 1e-5), normalize(vec3(sd.x, 0.0, sd.z) + 1e-5)), 0.0);
          sky += uGlow * uGlowAmount * pow(az, 3.0) * exp(-abs(h) * 6.0) * 0.9;
          // halo + disc
          sky += uSunColor * (pow(c, 32.0) * 0.35 + pow(c, 220.0) * 0.8) * uSunVisible;
          sky += uSunColor * smoothstep(0.99955, 0.9997, c) * 6.0 * uSunVisible;
          gl_FragColor = vec4(sky, 1.0);
        }`,
      side: BackSide,
      depthWrite: false,
      fog: false,
    });
    this.mesh = new Mesh(new SphereGeometry(1, 48, 24), mat);
    this.mesh.scale.setScalar(scale);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = -10;
  }

  /** Configure colours from the sun height (sin altitude), night factor and cloud cover. */
  configure(sunDir: Vector3, night: number, coverage: number): void {
    const u = this.uniforms;
    const h = sunDir.y;
    const low = 1 - Math.min(1, Math.max(0, (h - 0.02) / 0.3));
    u.uSunDir.value.copy(sunDir);
    const zenithDay = new Color('#2d66bb');
    const horizonDay = new Color('#9fc3e6');
    const zenithDusk = new Color('#3b4f8e');
    const horizonDusk = new Color('#f2a877');
    const zenithNight = new Color('#05091a');
    const horizonNight = new Color('#121c34');
    const overcast = new Color('#9aa3ad');
    u.uZenith.value.copy(zenithDay).lerp(zenithDusk, low * 0.8).lerp(zenithNight, night).lerp(overcast.clone().multiplyScalar(1 - night * 0.9), coverage * 0.55);
    u.uHorizon.value.copy(horizonDay).lerp(horizonDusk, low * 0.85).lerp(horizonNight, night).lerp(new Color('#b4bac2').multiplyScalar(1 - night * 0.9), coverage * 0.5);
    u.uSunColor.value.set('#fff1dc').lerp(new Color('#ff9a50'), low);
    u.uGlowAmount.value = low * (1 - night) * 1.2;
    u.uSunVisible.value = (1 - night) * (1 - coverage * 0.7);
  }
}
