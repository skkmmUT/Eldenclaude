import { AdditiveBlending, BufferAttribute, BufferGeometry, Color, Points, ShaderMaterial, Vector3, type Scene } from 'three';
import { radialSprite } from '@/render/TextureFactory';

/**
 * Living-air particles around the camera, animated entirely on the GPU: drifting pollen
 * and dust motes in daylight, fireflies after dusk.
 */
export class Atmosphere {
  private readonly points: Points;
  private readonly mat: ShaderMaterial;

  constructor(scene: Scene, density: number) {
    const count = Math.round(700 * density);
    const pos = new Float32Array(count * 3);
    const seed = new Float32Array(count);
    for (let i = 0; i < count; i++) {
      pos[i * 3] = Math.random() * 60 - 30;
      pos[i * 3 + 1] = Math.random() * 10;
      pos[i * 3 + 2] = Math.random() * 60 - 30;
      seed[i] = Math.random();
    }
    const geo = new BufferGeometry();
    geo.setAttribute('position', new BufferAttribute(pos, 3));
    geo.setAttribute('aSeed', new BufferAttribute(seed, 1));
    this.mat = new ShaderMaterial({
      uniforms: {
        uTime: { value: 0 },
        uCam: { value: new Vector3() },
        uMap: { value: radialSprite() },
        uScale: { value: 300 },
        uNight: { value: 0 },
        uDay: { value: new Color('#fff3d6') },
        uFly: { value: new Color('#d8ff7a') },
      },
      vertexShader: /* glsl */ `
        attribute float aSeed; uniform float uTime; uniform vec3 uCam; uniform float uScale; uniform float uNight;
        varying float vSeed; varying float vFade;
        void main() {
          vSeed = aSeed;
          vec3 p = position;
          float t = uTime * (0.15 + aSeed * 0.25);
          p.x += sin(t * 1.3 + aSeed * 31.0) * 2.0;
          p.z += cos(t * 1.1 + aSeed * 17.0) * 2.0;
          p.y += sin(t * 2.0 + aSeed * 9.0) * 0.6;
          vec3 rel = p;
          rel.xz = mod(rel.xz - uCam.xz + 30.0, 60.0) - 30.0;
          float baseY = mix(uCam.y - 3.0, uCam.y - 4.0, uNight);
          vec3 world = vec3(uCam.x + rel.x, baseY + p.y * mix(1.0, 0.45, uNight), uCam.z + rel.z);
          float d = length(rel.xz);
          vFade = smoothstep(30.0, 18.0, d);
          vec4 mv = modelViewMatrix * vec4(world, 1.0);
          gl_PointSize = mix(0.012, 0.09, uNight) * (0.6 + aSeed) * uScale / max(0.5, -mv.z);
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: /* glsl */ `
        uniform sampler2D uMap; uniform vec3 uDay; uniform vec3 uFly; uniform float uTime; uniform float uNight;
        varying float vSeed; varying float vFade;
        void main() {
          float a = texture2D(uMap, gl_PointCoord).a;
          float blink = 0.5 + 0.5 * sin(uTime * (1.5 + vSeed * 3.0) + vSeed * 40.0);
          vec3 c = mix(uDay * 0.35, uFly * (0.8 + 1.6 * blink), uNight);
          float alpha = mix(0.18 * step(0.7, vSeed), 0.9 * step(0.45, vSeed), uNight);
          gl_FragColor = vec4(c * a * vFade * alpha, a * vFade * alpha);
        }`,
      transparent: true,
      depthWrite: false,
      blending: AdditiveBlending,
    });
    this.points = new Points(geo, this.mat);
    this.points.frustumCulled = false;
    this.points.renderOrder = 9;
    scene.add(this.points);
  }

  setViewportHeight(h: number): void {
    this.mat.uniforms.uScale.value = h * 0.5;
  }

  update(dt: number, cam: Vector3, night: number): void {
    this.mat.uniforms.uTime.value += dt;
    (this.mat.uniforms.uCam.value as Vector3).copy(cam);
    this.mat.uniforms.uNight.value = night;
  }
}
