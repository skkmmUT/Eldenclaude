import { Color, Mesh, ShaderMaterial, SphereGeometry, Vector3, BackSide } from 'three';

/**
 * Sky overlay dome: lit cloud layer (fbm density with a light-march toward the sun for
 * self-shadowing, silver lining and warm sunset tint) plus the night sky (stars, moon).
 * It is a 2.5D layer — a projected cloud plane, not ray-marched volumes — which keeps
 * the cost to a single full-screen pass.
 */
export class CloudLayer {
  readonly mesh: Mesh;
  readonly uniforms = {
    uTime: { value: 0 },
    uSunDir: { value: new Vector3(0, 1, 0) },
    uMoonDir: { value: new Vector3(0, 1, 0) },
    uSunColor: { value: new Color('#ffffff') },
    uSkyTint: { value: new Color('#9ab8e0') },
    uCoverage: { value: 0.3 },
    uDarkness: { value: 0.1 },
    uNight: { value: 0 },
    uWind: { value: 1 },
  };

  constructor() {
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
        uniform float uTime, uCoverage, uDarkness, uNight, uWind;
        uniform vec3 uSunDir, uMoonDir, uSunColor, uSkyTint;
        varying vec3 vDir;
        float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1,311.7))) * 43758.5453); }
        float noise(vec2 p){ vec2 i=floor(p); vec2 f=fract(p); f=f*f*(3.0-2.0*f);
          return mix(mix(hash(i),hash(i+vec2(1,0)),f.x), mix(hash(i+vec2(0,1)),hash(i+vec2(1,1)),f.x), f.y); }
        float fbm(vec2 p){ float v=0.0; float a=0.5; mat2 r = mat2(0.8,-0.6,0.6,0.8);
          for(int i=0;i<6;i++){ v+=a*noise(p); p=r*p*2.03; a*=0.5;} return v; }
        float density(vec2 p) {
          float base = fbm(p * 0.9);
          float detail = fbm(p * 3.1 + 7.0) * 0.35;
          float d = base + detail - (1.0 - uCoverage) * 1.05;
          return clamp(d * 2.2, 0.0, 1.0);
        }
        void main() {
          vec3 d = normalize(vDir);
          // --- night sky (stars + moon), composited under the clouds ---
          vec3 nightCol = mix(vec3(0.03, 0.05, 0.11), vec3(0.08, 0.11, 0.2), 1.0 - clamp(d.y, 0.0, 1.0));
          vec2 sp = d.xz / max(0.15, d.y + 0.2) * 260.0;
          float star = step(0.9965, hash(floor(sp))) * smoothstep(0.05, 0.4, d.y);
          star *= 0.6 + 0.4 * sin(uTime * 2.0 + hash(floor(sp)) * 40.0);
          nightCol += vec3(0.9, 0.92, 1.0) * star;
          float md = acos(clamp(dot(d, normalize(uMoonDir)), -1.0, 1.0));
          nightCol += vec3(0.85, 0.9, 1.0) * (smoothstep(0.03, 0.026, md) * 1.6 + exp(-md * 18.0) * 0.25);
          float nightA = uNight * smoothstep(-0.1, 0.05, d.y);

          // --- clouds on a virtual plane ---
          float h = d.y;
          float cloudA = 0.0;
          vec3 cloudCol = vec3(0.0);
          if (h > 0.0) {
            vec2 p = d.xz / (h + 0.12) * 1.6 + vec2(uTime * 0.012, uTime * 0.005) * uWind;
            float den = density(p);
            // light march toward the sun for self-shadowing
            vec2 toSun = normalize(uSunDir.xz + 1e-4) * 0.12;
            float shade = 0.0;
            shade += density(p + toSun) * 0.5;
            shade += density(p + toSun * 2.0) * 0.3;
            shade += density(p + toSun * 3.5) * 0.2;
            float lightAmt = exp(-shade * 2.2);
            float cosA = max(dot(d, normalize(uSunDir)), 0.0);
            float silver = pow(cosA, 12.0) * 1.4 + pow(cosA, 3.0) * 0.25;
            vec3 lit = uSunColor * (0.55 + 0.65 * lightAmt + silver * (1.0 - den * 0.6));
            vec3 ambient = mix(uSkyTint, vec3(0.62, 0.66, 0.74), 0.4) * (0.55 - uDarkness * 0.45);
            cloudCol = mix(ambient, lit, 0.55 * (1.0 - uDarkness)) ;
            cloudCol = mix(cloudCol, vec3(0.08, 0.09, 0.13), uNight * 0.85);
            cloudA = den * smoothstep(0.0, 0.12, h);
          }
          float a = nightA * (1.0 - cloudA) + cloudA;
          vec3 col = (nightCol * nightA * (1.0 - cloudA) + cloudCol * cloudA) / max(a, 1e-4);
          gl_FragColor = vec4(col, a);
        }`,
      side: BackSide,
      transparent: true,
      depthWrite: false,
      fog: false,
    });
    this.mesh = new Mesh(new SphereGeometry(1, 48, 24), mat);
    this.mesh.scale.setScalar(500);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = -9;
  }

  update(dt: number, cameraPos: Vector3): void {
    this.uniforms.uTime.value += dt;
    this.mesh.position.copy(cameraPos);
  }
}
