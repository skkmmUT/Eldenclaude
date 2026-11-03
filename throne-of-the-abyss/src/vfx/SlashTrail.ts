import { AdditiveBlending, BufferAttribute, BufferGeometry, Color, DoubleSide, Mesh, ShaderMaterial, Vector3 } from 'three';

const MAX_SAMPLES = 48;

/**
 * Weapon swing ribbon: records blade base/tip positions while the attack is live and
 * renders a fading additive strip. Sub-samples between frames keep arcs smooth at low fps.
 */
export class SlashTrail {
  readonly mesh: Mesh;
  private readonly base: Vector3[] = [];
  private readonly tip: Vector3[] = [];
  private readonly age: number[] = [];
  private count = 0;
  private readonly positions: Float32Array;
  private readonly alphas: Float32Array;
  private readonly material: ShaderMaterial;
  emitting = false;
  lifetime = 0.16;

  constructor(color = '#d9c9ff') {
    const geo = new BufferGeometry();
    this.positions = new Float32Array(MAX_SAMPLES * 2 * 3);
    this.alphas = new Float32Array(MAX_SAMPLES * 2);
    geo.setAttribute('position', new BufferAttribute(this.positions, 3));
    geo.setAttribute('aAlpha', new BufferAttribute(this.alphas, 1));
    const edge = new Float32Array(MAX_SAMPLES * 2);
    for (let i = 0; i < MAX_SAMPLES; i++) edge[i * 2 + 1] = 1;
    geo.setAttribute('aEdge', new BufferAttribute(edge, 1));
    const index: number[] = [];
    for (let i = 0; i < MAX_SAMPLES - 1; i++) {
      const a = i * 2;
      index.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
    }
    geo.setIndex(index);
    this.material = new ShaderMaterial({
      uniforms: { uColor: { value: new Color(color) } },
      vertexShader: /* glsl */ `
        attribute float aAlpha; attribute float aEdge; varying float vAlpha; varying float vEdge;
        void main() {
          vAlpha = aAlpha;
          vEdge = aEdge;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }`,
      fragmentShader: /* glsl */ `
        uniform vec3 uColor; varying float vAlpha; varying float vEdge;
        void main() {
          float edge = smoothstep(0.0, 1.0, vEdge);
          vec3 c = mix(uColor * 0.6, vec3(1.0) * 1.6 + uColor, edge * edge);
          gl_FragColor = vec4(c * vAlpha * (0.25 + edge), vAlpha * (0.2 + edge * 0.8));
        }`,
      transparent: true,
      depthWrite: false,
      blending: AdditiveBlending,
      side: DoubleSide,
    });
    this.mesh = new Mesh(geo, this.material);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 10;
    for (let i = 0; i < MAX_SAMPLES; i++) {
      this.base.push(new Vector3());
      this.tip.push(new Vector3());
      this.age.push(0);
    }
  }

  setColor(c: string): void {
    (this.material.uniforms.uColor.value as Color).set(c);
  }

  private push(b: Vector3, t: Vector3): void {
    if (this.count === MAX_SAMPLES) {
      // shift oldest out
      const ob = this.base.shift()!;
      const ot = this.tip.shift()!;
      this.age.shift();
      this.base.push(ob);
      this.tip.push(ot);
      this.age.push(0);
      this.count--;
    }
    this.base[this.count].copy(b);
    this.tip[this.count].copy(t);
    this.age[this.count] = 0;
    this.count++;
  }

  private lastB = new Vector3();
  private lastT = new Vector3();
  private hasLast = false;
  private tmpB = new Vector3();
  private tmpT = new Vector3();

  update(dt: number, base: Vector3, tip: Vector3): void {
    for (let i = 0; i < this.count; i++) this.age[i] += dt;
    while (this.count > 0 && this.age[0] > this.lifetime) {
      const ob = this.base.shift()!;
      const ot = this.tip.shift()!;
      this.age.shift();
      this.base.push(ob);
      this.tip.push(ot);
      this.age.push(0);
      this.count--;
    }
    if (this.emitting) {
      if (this.hasLast) {
        const sub = 3;
        for (let s = 1; s < sub; s++) {
          const f = s / sub;
          this.push(this.tmpB.lerpVectors(this.lastB, base, f), this.tmpT.lerpVectors(this.lastT, tip, f));
          this.age[this.count - 1] = dt * (1 - f);
        }
      }
      this.push(base, tip);
      this.lastB.copy(base);
      this.lastT.copy(tip);
      this.hasLast = true;
    } else {
      this.hasLast = false;
    }
    for (let i = 0; i < MAX_SAMPLES; i++) {
      const k = Math.min(i, Math.max(0, this.count - 1));
      const b = this.base[k];
      const t = this.tip[k];
      this.positions.set([b.x, b.y, b.z], i * 6);
      this.positions.set([t.x, t.y, t.z], i * 6 + 3);
      const a = i < this.count ? Math.max(0, 1 - this.age[k] / this.lifetime) : 0;
      this.alphas[i * 2] = a * 0.4;
      this.alphas[i * 2 + 1] = a;
    }
    const geo = this.mesh.geometry;
    geo.attributes.position.needsUpdate = true;
    geo.attributes.aAlpha.needsUpdate = true;
    this.mesh.visible = this.count > 1;
  }
}
