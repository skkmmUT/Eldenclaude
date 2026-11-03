import { BufferAttribute, BufferGeometry, Color, LineSegments, ShaderMaterial, Vector3, AdditiveBlending } from 'three';

/** GPU-animated rain streaks in a box that follows the camera. */
export class Rain {
  readonly mesh: LineSegments;
  private readonly mat: ShaderMaterial;

  constructor(count = 6000) {
    const pos = new Float32Array(count * 2 * 3);
    const end = new Float32Array(count * 2);
    const seed = new Float32Array(count * 2);
    for (let i = 0; i < count; i++) {
      const x = Math.random() * 60 - 30;
      const y = Math.random() * 30;
      const z = Math.random() * 60 - 30;
      const s = Math.random();
      for (let k = 0; k < 2; k++) {
        pos.set([x, y, z], (i * 2 + k) * 3);
        end[i * 2 + k] = k;
        seed[i * 2 + k] = s;
      }
    }
    const geo = new BufferGeometry();
    geo.setAttribute('position', new BufferAttribute(pos, 3));
    geo.setAttribute('aEnd', new BufferAttribute(end, 1));
    geo.setAttribute('aSeed', new BufferAttribute(seed, 1));
    this.mat = new ShaderMaterial({
      uniforms: {
        uTime: { value: 0 },
        uCam: { value: new Vector3() },
        uIntensity: { value: 0 },
        uColor: { value: new Color('#c8d4e6') },
      },
      vertexShader: /* glsl */ `
        attribute float aEnd; attribute float aSeed;
        uniform float uTime; uniform vec3 uCam; uniform float uIntensity;
        varying float vA;
        void main() {
          vec3 p = position;
          float speed = 22.0 + aSeed * 8.0;
          p.y = mod(p.y - uTime * speed, 30.0);
          vec3 rel = p;
          rel.xz = mod(rel.xz - uCam.xz + 30.0, 60.0) - 30.0;
          vec3 w = vec3(uCam.x + rel.x, uCam.y - 8.0 + p.y, uCam.z + rel.z);
          w += vec3(0.35, 1.0, 0.1) * aEnd * 0.55; // streak tail (slanted by wind)
          vA = step(aSeed, uIntensity) * (0.25 + 0.35 * aEnd);
          gl_Position = projectionMatrix * modelViewMatrix * vec4(w, 1.0);
        }`,
      fragmentShader: /* glsl */ `
        uniform vec3 uColor; varying float vA;
        void main() { if (vA <= 0.0) discard; gl_FragColor = vec4(uColor * vA, vA); }`,
      transparent: true,
      depthWrite: false,
      blending: AdditiveBlending,
    });
    this.mesh = new LineSegments(geo, this.mat);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 14;
  }

  update(dt: number, cam: Vector3, intensity: number): void {
    this.mat.uniforms.uTime.value += dt;
    (this.mat.uniforms.uCam.value as Vector3).copy(cam);
    this.mat.uniforms.uIntensity.value = intensity;
    this.mesh.visible = intensity > 0.02;
  }
}
