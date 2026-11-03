import {
  AdditiveBlending,
  BufferAttribute,
  BufferGeometry,
  Color,
  NormalBlending,
  Points,
  ShaderMaterial,
  Vector3,
  type Blending,
} from 'three';
import { radialSprite } from '@/render/TextureFactory';

export interface BurstOptions {
  count: number;
  color: string | Color;
  color2?: string | Color;
  speed: number;
  speedJitter?: number;
  life: number;
  size: number;
  gravity?: number;
  drag?: number;
  /** Preferred direction; particles spread inside a cone around it. */
  direction?: Vector3;
  spread?: number; // 0 = tight beam, 1 = hemisphere, 2 = sphere
  radius?: number; // spawn sphere radius
  upBias?: number;
}

/**
 * Fixed-size CPU particle pool rendered as one Points draw call. Used for sparks, blood,
 * embers, dust and spell motes. No allocation after construction.
 */
export class ParticlePool {
  readonly points: Points;
  private readonly cap: number;
  private readonly pos: Float32Array;
  private readonly vel: Float32Array;
  private readonly col: Float32Array;
  private readonly size: Float32Array;
  private readonly alpha: Float32Array;
  private readonly life: Float32Array;
  private readonly maxLife: Float32Array;
  private readonly startSize: Float32Array;
  private readonly gravity: Float32Array;
  private readonly drag: Float32Array;
  private cursor = 0;
  density = 1;
  private readonly tmpC = new Color();
  private readonly tmpC2 = new Color();
  private readonly tmpV = new Vector3();

  constructor(cap: number, blending: Blending = AdditiveBlending) {
    this.cap = cap;
    this.pos = new Float32Array(cap * 3);
    this.vel = new Float32Array(cap * 3);
    this.col = new Float32Array(cap * 3);
    this.size = new Float32Array(cap);
    this.alpha = new Float32Array(cap);
    this.life = new Float32Array(cap);
    this.maxLife = new Float32Array(cap);
    this.startSize = new Float32Array(cap);
    this.gravity = new Float32Array(cap);
    this.drag = new Float32Array(cap);
    const geo = new BufferGeometry();
    geo.setAttribute('position', new BufferAttribute(this.pos, 3));
    geo.setAttribute('aColor', new BufferAttribute(this.col, 3));
    geo.setAttribute('aSize', new BufferAttribute(this.size, 1));
    geo.setAttribute('aAlpha', new BufferAttribute(this.alpha, 1));
    const additive = blending === AdditiveBlending;
    const mat = new ShaderMaterial({
      uniforms: { uMap: { value: radialSprite() }, uScale: { value: 300 } },
      vertexShader: /* glsl */ `
        attribute vec3 aColor; attribute float aSize; attribute float aAlpha;
        varying vec3 vColor; varying float vAlpha;
        uniform float uScale;
        void main() {
          vColor = aColor; vAlpha = aAlpha;
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          gl_PointSize = aSize * uScale / max(0.1, -mv.z);
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: /* glsl */ `
        uniform sampler2D uMap; varying vec3 vColor; varying float vAlpha;
        void main() {
          float a = texture2D(uMap, gl_PointCoord).a * vAlpha;
          if (a < 0.01) discard;
          ${additive ? 'gl_FragColor = vec4(vColor * a, a);' : 'gl_FragColor = vec4(vColor, a);'}
        }`,
      transparent: true,
      depthWrite: false,
      blending: additive ? AdditiveBlending : NormalBlending,
    });
    this.points = new Points(geo, mat);
    this.points.frustumCulled = false;
    this.points.renderOrder = additive ? 12 : 11;
  }

  setViewportScale(heightPx: number): void {
    (this.points.material as ShaderMaterial).uniforms.uScale.value = heightPx * 0.5;
  }

  burst(origin: Vector3, o: BurstOptions): void {
    const n = Math.max(1, Math.round(o.count * this.density));
    const c1 = this.tmpC.set(o.color as never);
    const c2 = this.tmpC2.set((o.color2 ?? o.color) as never);
    const dir = o.direction;
    const spread = o.spread ?? 2;
    for (let k = 0; k < n; k++) {
      const i = this.cursor;
      this.cursor = (this.cursor + 1) % this.cap;
      // random direction
      let x = Math.random() * 2 - 1;
      let y = Math.random() * 2 - 1;
      let z = Math.random() * 2 - 1;
      const l = Math.hypot(x, y, z) || 1;
      x /= l;
      y /= l;
      z /= l;
      if (dir) {
        x = dir.x + x * spread * 0.5;
        y = dir.y + y * spread * 0.5;
        z = dir.z + z * spread * 0.5;
        const l2 = Math.hypot(x, y, z) || 1;
        x /= l2;
        y /= l2;
        z /= l2;
      }
      y += o.upBias ?? 0;
      const sp = o.speed * (1 + (Math.random() * 2 - 1) * (o.speedJitter ?? 0.5));
      const r = (o.radius ?? 0) * Math.random();
      this.pos[i * 3] = origin.x + x * r;
      this.pos[i * 3 + 1] = origin.y + y * r;
      this.pos[i * 3 + 2] = origin.z + z * r;
      this.vel[i * 3] = x * sp;
      this.vel[i * 3 + 1] = y * sp;
      this.vel[i * 3 + 2] = z * sp;
      const t = Math.random();
      this.col[i * 3] = c1.r + (c2.r - c1.r) * t;
      this.col[i * 3 + 1] = c1.g + (c2.g - c1.g) * t;
      this.col[i * 3 + 2] = c1.b + (c2.b - c1.b) * t;
      const life = o.life * (0.6 + Math.random() * 0.8);
      this.life[i] = life;
      this.maxLife[i] = life;
      this.startSize[i] = o.size * (0.6 + Math.random() * 0.8);
      this.gravity[i] = o.gravity ?? 0;
      this.drag[i] = o.drag ?? 1.5;
    }
  }

  /** Emit a single particle with explicit velocity (trails, auras). */
  emit(p: Vector3, v: Vector3, color: string | Color, life: number, size: number, gravity = 0, drag = 1): void {
    const i = this.cursor;
    this.cursor = (this.cursor + 1) % this.cap;
    this.pos[i * 3] = p.x;
    this.pos[i * 3 + 1] = p.y;
    this.pos[i * 3 + 2] = p.z;
    this.vel[i * 3] = v.x;
    this.vel[i * 3 + 1] = v.y;
    this.vel[i * 3 + 2] = v.z;
    const c = this.tmpC.set(color as never);
    this.col[i * 3] = c.r;
    this.col[i * 3 + 1] = c.g;
    this.col[i * 3 + 2] = c.b;
    this.life[i] = life;
    this.maxLife[i] = life;
    this.startSize[i] = size;
    this.gravity[i] = gravity;
    this.drag[i] = drag;
  }

  update(dt: number): void {
    for (let i = 0; i < this.cap; i++) {
      if (this.life[i] <= 0) {
        this.alpha[i] = 0;
        this.size[i] = 0;
        continue;
      }
      this.life[i] -= dt;
      const d = Math.exp(-this.drag[i] * dt);
      this.vel[i * 3] *= d;
      this.vel[i * 3 + 1] = this.vel[i * 3 + 1] * d - this.gravity[i] * dt;
      this.vel[i * 3 + 2] *= d;
      this.pos[i * 3] += this.vel[i * 3] * dt;
      this.pos[i * 3 + 1] += this.vel[i * 3 + 1] * dt;
      this.pos[i * 3 + 2] += this.vel[i * 3 + 2] * dt;
      const f = Math.max(0, this.life[i] / this.maxLife[i]);
      this.alpha[i] = f < 0.8 ? f / 0.8 : (1 - f) * 5;
      this.size[i] = this.startSize[i] * (0.4 + 0.6 * f);
    }
    const g = this.points.geometry;
    g.attributes.position.needsUpdate = true;
    g.attributes.aColor.needsUpdate = true;
    g.attributes.aSize.needsUpdate = true;
    g.attributes.aAlpha.needsUpdate = true;
    void this.tmpV;
  }
}
