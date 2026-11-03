import {
  AdditiveBlending,
  BufferAttribute,
  BufferGeometry,
  Color,
  DoubleSide,
  Mesh,
  PlaneGeometry,
  Points,
  ShaderMaterial,
  Vector3,
  type Scene,
} from 'three';
import { radialSprite } from '@/render/TextureFactory';

/**
 * Cheap atmospheric layers that sell "volumetric" mood on WebGL:
 *  - GPU-animated drifting embers/ash around the camera (zero CPU cost per frame),
 *  - light shafts (additive soft quads),
 *  - low ground-fog sheets with scrolling noise.
 */
export class Atmosphere {
  private readonly embers: Points;
  private readonly emberMat: ShaderMaterial;
  private readonly shafts: Mesh[] = [];
  private readonly fogSheets: Mesh[] = [];
  private readonly shaftMat: ShaderMaterial;
  private readonly fogMat: ShaderMaterial;

  constructor(
    private readonly scene: Scene,
    density: number,
  ) {
    const count = Math.round(900 * density);
    const pos = new Float32Array(count * 3);
    const seed = new Float32Array(count);
    for (let i = 0; i < count; i++) {
      pos[i * 3] = Math.random() * 60 - 30;
      pos[i * 3 + 1] = Math.random() * 18;
      pos[i * 3 + 2] = Math.random() * 60 - 30;
      seed[i] = Math.random();
    }
    const geo = new BufferGeometry();
    geo.setAttribute('position', new BufferAttribute(pos, 3));
    geo.setAttribute('aSeed', new BufferAttribute(seed, 1));
    this.emberMat = new ShaderMaterial({
      uniforms: {
        uTime: { value: 0 },
        uCam: { value: new Vector3() },
        uMap: { value: radialSprite() },
        uScale: { value: 300 },
        uColA: { value: new Color('#ff6a2a') },
        uColB: { value: new Color('#b05cff') },
      },
      vertexShader: /* glsl */ `
        attribute float aSeed; uniform float uTime; uniform vec3 uCam; uniform float uScale;
        varying float vSeed; varying float vFade;
        void main() {
          vSeed = aSeed;
          vec3 p = position;
          float t = uTime * (0.25 + aSeed * 0.4);
          p.y = mod(p.y + t * (0.6 + aSeed), 18.0);
          p.x += sin(t * 0.7 + aSeed * 31.0) * 1.5;
          p.z += cos(t * 0.5 + aSeed * 17.0) * 1.5;
          // wrap around the camera so the field is infinite
          vec3 rel = p - mod(uCam, 60.0);
          rel.xz = mod(rel.xz + 30.0, 60.0) - 30.0;
          vec3 world = vec3(uCam.x + rel.x, uCam.y - 4.0 + p.y, uCam.z + rel.z);
          vFade = smoothstep(0.0, 2.0, p.y) * (1.0 - smoothstep(14.0, 18.0, p.y));
          vec4 mv = modelViewMatrix * vec4(world, 1.0);
          gl_PointSize = (0.06 + aSeed * 0.07) * uScale / max(0.5, -mv.z);
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: /* glsl */ `
        uniform sampler2D uMap; uniform vec3 uColA; uniform vec3 uColB; uniform float uTime;
        varying float vSeed; varying float vFade;
        void main() {
          float a = texture2D(uMap, gl_PointCoord).a;
          float flick = 0.6 + 0.4 * sin(uTime * (3.0 + vSeed * 5.0) + vSeed * 40.0);
          vec3 c = mix(uColA, uColB, step(0.82, vSeed)) * 2.0;
          gl_FragColor = vec4(c * a * vFade * flick, a * vFade);
        }`,
      transparent: true,
      depthWrite: false,
      blending: AdditiveBlending,
    });
    this.embers = new Points(geo, this.emberMat);
    this.embers.frustumCulled = false;
    this.embers.renderOrder = 9;
    scene.add(this.embers);

    this.shaftMat = new ShaderMaterial({
      uniforms: { uTime: { value: 0 }, uColor: { value: new Color('#ff5a5a') }, uIntensity: { value: 0.16 } },
      vertexShader: /* glsl */ `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
      fragmentShader: /* glsl */ `
        uniform float uTime; uniform vec3 uColor; uniform float uIntensity; varying vec2 vUv;
        void main(){
          float edge = smoothstep(0.0, 0.35, vUv.x) * smoothstep(1.0, 0.65, vUv.x);
          float len = smoothstep(0.0, 0.25, vUv.y) * smoothstep(1.0, 0.55, vUv.y);
          float streak = 0.75 + 0.25 * sin(vUv.x * 40.0 + uTime * 0.6) * sin(vUv.x * 13.0 - uTime * 0.3);
          float a = edge * len * streak * uIntensity;
          gl_FragColor = vec4(uColor * a, a);
        }`,
      transparent: true,
      depthWrite: false,
      blending: AdditiveBlending,
      side: DoubleSide,
      fog: false,
    });

    this.fogMat = new ShaderMaterial({
      uniforms: { uTime: { value: 0 }, uColor: { value: new Color('#3a1838') }, uOpacity: { value: 0.32 } },
      vertexShader: /* glsl */ `varying vec2 vUv; varying vec3 vWorld; void main(){ vUv = uv; vec4 w = modelMatrix * vec4(position,1.0); vWorld = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`,
      fragmentShader: /* glsl */ `
        uniform float uTime; uniform vec3 uColor; uniform float uOpacity; varying vec2 vUv; varying vec3 vWorld;
        float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1,311.7))) * 43758.5453); }
        float noise(vec2 p){ vec2 i=floor(p); vec2 f=fract(p); f=f*f*(3.0-2.0*f);
          return mix(mix(hash(i),hash(i+vec2(1,0)),f.x), mix(hash(i+vec2(0,1)),hash(i+vec2(1,1)),f.x), f.y); }
        void main(){
          vec2 p = vWorld.xz * 0.06;
          float n = noise(p + vec2(uTime * 0.02, uTime * 0.013)) * 0.6 + noise(p * 2.7 - vec2(uTime * 0.03, 0.0)) * 0.4;
          float edge = smoothstep(0.0, 0.2, vUv.x) * smoothstep(1.0, 0.8, vUv.x) * smoothstep(0.0, 0.2, vUv.y) * smoothstep(1.0, 0.8, vUv.y);
          gl_FragColor = vec4(uColor, smoothstep(0.35, 0.9, n) * uOpacity * edge);
        }`,
      transparent: true,
      depthWrite: false,
      fog: false,
    });
  }

  addShaft(from: Vector3, to: Vector3, width: number, color?: string, intensity = 0.16): void {
    const len = from.distanceTo(to);
    const geo = new PlaneGeometry(width, len);
    geo.translate(0, -len / 2, 0);
    const mat = this.shaftMat.clone();
    if (color) (mat.uniforms.uColor.value as Color).set(color);
    mat.uniforms.uIntensity.value = intensity;
    mat.uniforms.uTime = this.shaftMat.uniforms.uTime;
    const m = new Mesh(geo, mat);
    m.position.copy(from);
    // orient the quad's -Y axis along the shaft
    const dir = to.clone().sub(from).normalize();
    m.quaternion.setFromUnitVectors(new Vector3(0, -1, 0), dir);
    m.renderOrder = 8;
    this.scene.add(m);
    this.shafts.push(m);
    // a crossed second quad gives volume from every angle
    const m2 = m.clone();
    m2.rotateY(Math.PI / 2);
    this.scene.add(m2);
    this.shafts.push(m2);
  }

  addFogSheet(center: Vector3, w: number, d: number, height = 0.4): void {
    for (let i = 0; i < 2; i++) {
      const m = new Mesh(new PlaneGeometry(w, d), this.fogMat);
      m.rotation.x = -Math.PI / 2;
      m.position.set(center.x, center.y + height + i * 0.55, center.z);
      m.renderOrder = 7;
      this.scene.add(m);
      this.fogSheets.push(m);
    }
  }

  setVolumetrics(enabled: boolean): void {
    for (const m of this.shafts) m.visible = enabled;
    for (const m of this.fogSheets) m.visible = enabled;
  }

  setViewportHeight(h: number): void {
    this.emberMat.uniforms.uScale.value = h * 0.5;
  }

  update(dt: number, cam: Vector3): void {
    this.emberMat.uniforms.uTime.value += dt;
    (this.emberMat.uniforms.uCam.value as Vector3).copy(cam);
    this.shaftMat.uniforms.uTime.value += dt;
    this.fogMat.uniforms.uTime.value += dt;
  }
}
