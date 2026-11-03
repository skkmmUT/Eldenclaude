import { BackSide, Color, Mesh, ShaderMaterial, SphereGeometry, Vector3 } from 'three';

/**
 * Procedural sky dome: blood-red horizon, violet zenith, slow cloud bands, faint stars and
 * the Black Sun — an eclipsed sun with a crimson corona, the visual signature of the
 * Abyss over Eldrakar.
 */
export class Sky {
  readonly mesh: Mesh;
  readonly material: ShaderMaterial;

  constructor(sunDir = new Vector3(0.1, 0.32, 1).normalize()) {
    this.material = new ShaderMaterial({
      uniforms: {
        uTime: { value: 0 },
        uSunDir: { value: sunDir },
        uZenith: { value: new Color('#0d0418') },
        uMid: { value: new Color('#3a0a26') },
        uHorizon: { value: new Color('#9a1424') },
        uGlow: { value: new Color('#ff4a2a') },
        uCorona: { value: new Color('#ff2a3a') },
      },
      vertexShader: /* glsl */ `
        varying vec3 vDir;
        void main() {
          vDir = normalize(position);
          vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
          gl_Position = p.xyww;
        }`,
      fragmentShader: /* glsl */ `
        uniform float uTime; uniform vec3 uSunDir, uZenith, uMid, uHorizon, uGlow, uCorona;
        varying vec3 vDir;
        float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1,311.7))) * 43758.5453); }
        float noise(vec2 p){ vec2 i=floor(p); vec2 f=fract(p); f=f*f*(3.0-2.0*f);
          return mix(mix(hash(i),hash(i+vec2(1,0)),f.x), mix(hash(i+vec2(0,1)),hash(i+vec2(1,1)),f.x), f.y); }
        float fbm(vec2 p){ float v=0.0; float a=0.5; for(int i=0;i<5;i++){ v+=a*noise(p); p*=2.03; a*=0.5;} return v; }
        void main() {
          vec3 d = normalize(vDir);
          float h = d.y;
          vec3 col = mix(uHorizon, uMid, smoothstep(0.0, 0.25, h));
          col = mix(col, uZenith, smoothstep(0.2, 0.75, h));
          col = mix(col, uHorizon * 0.35, smoothstep(0.0, -0.25, h));
          // horizon glow band
          col += uGlow * 0.35 * exp(-abs(h) * 9.0);
          // clouds: streaked bands lit from below
          vec2 cp = d.xz / max(0.12, h + 0.25) * 1.4 + vec2(uTime * 0.008, uTime * 0.003);
          float c = fbm(cp * vec2(1.0, 2.6));
          float cloud = smoothstep(0.48, 0.85, c) * smoothstep(-0.05, 0.25, h) * (1.0 - smoothstep(0.55, 0.9, h));
          vec3 cloudCol = mix(vec3(0.05, 0.01, 0.05), uHorizon * 1.4, smoothstep(0.5, 0.9, c) * 0.6);
          col = mix(col, cloudCol, cloud * 0.85);
          // stars near the zenith
          float s = step(0.9975, hash(floor(d.xz / max(0.2, h) * 220.0)));
          col += vec3(0.8, 0.75, 1.0) * s * smoothstep(0.45, 0.8, h) * (1.0 - cloud);
          // Black Sun: dark disc, bright crimson corona, long rays
          float sd = dot(d, normalize(uSunDir));
          float ang = acos(clamp(sd, -1.0, 1.0));
          float disc = smoothstep(0.072, 0.066, ang);
          float corona = exp(-max(0.0, ang - 0.068) * 38.0) * 1.7;
          float rays = pow(max(0.0, sin(atan(d.x - uSunDir.x, d.y - uSunDir.y) * 18.0 + uTime * 0.05)), 8.0) * exp(-ang * 7.0) * 0.6;
          col += uCorona * (corona + rays) * (1.0 - disc);
          col += vec3(1.0, 0.85, 0.75) * exp(-max(0.0, ang - 0.068) * 220.0) * 1.5 * (1.0 - disc);
          col = mix(col, vec3(0.0), disc * 0.97);
          col += uGlow * 0.25 * exp(-ang * 3.0);
          gl_FragColor = vec4(col, 1.0);
        }`,
      side: BackSide,
      depthWrite: false,
      depthTest: true,
      fog: false,
    });
    this.mesh = new Mesh(new SphereGeometry(1, 48, 24), this.material);
    this.mesh.scale.setScalar(900);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = -10;
  }

  update(dt: number, cameraPos: Vector3): void {
    this.material.uniforms.uTime.value += dt;
    this.mesh.position.copy(cameraPos);
  }
}
