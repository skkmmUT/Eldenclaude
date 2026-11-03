import { AdditiveBlending, Group, PointLight, Sprite, SpriteMaterial, Vector3 } from 'three';
import { radialSprite } from '@/render/TextureFactory';
import type { VFXManager } from '@/vfx/VFXManager';

/** Stylised flame: layered flickering additive sprites + embers + optional point light. */
export class Fire {
  readonly group = new Group();
  readonly light: PointLight | null;
  private readonly sprites: Sprite[] = [];
  private t = Math.random() * 10;
  private emberTimer = 0;
  private readonly tmp = new Vector3();
  private readonly baseIntensity: number;
  enabled = true;

  constructor(
    position: Vector3,
    private readonly scale: number,
    private readonly color: string,
    private readonly core: string,
    withLight: boolean,
    private readonly vfx: VFXManager,
  ) {
    this.group.position.copy(position);
    const layers: Array<[string, number, number]> = [
      [color, 1.6, 0.0],
      [color, 1.1, 0.25],
      [core, 0.7, 0.15],
    ];
    for (const [c, s, y] of layers) {
      const sp = new Sprite(new SpriteMaterial({ map: radialSprite(), color: c, blending: AdditiveBlending, depthWrite: false, transparent: true }));
      sp.scale.setScalar(s * scale);
      sp.position.y = y * scale;
      sp.renderOrder = 9;
      this.group.add(sp);
      this.sprites.push(sp);
    }
    this.baseIntensity = 7 * scale;
    this.light = withLight ? new PointLight(color, this.baseIntensity, 14 * scale, 1.8) : null;
    if (this.light) {
      this.light.position.y = 0.5 * scale;
      this.group.add(this.light);
    }
  }

  setLit(lit: boolean): void {
    this.enabled = lit;
    this.group.visible = lit;
  }

  /** 0 = noon (fire light barely matters), 1 = night (full strength). */
  night = 1;

  update(dt: number): void {
    if (!this.enabled) return;
    this.t += dt;
    const f = 0.85 + Math.sin(this.t * 11.0) * 0.06 + Math.sin(this.t * 23.7) * 0.05 + Math.sin(this.t * 5.3) * 0.04;
    this.sprites.forEach((s, i) => {
      const base = [1.6, 1.1, 0.7][i] * this.scale;
      s.scale.set(base * (0.9 + f * 0.15), base * (1.05 + f * 0.25), 1);
    });
    if (this.light) this.light.intensity = this.baseIntensity * f * (0.3 + 0.7 * this.night);
    this.emberTimer -= dt;
    if (this.emberTimer <= 0) {
      this.emberTimer = 0.12 + Math.random() * 0.2;
      const p = this.group.getWorldPosition(this.tmp);
      p.y += 0.3 * this.scale;
      this.vfx.sparks.emit(p, new Vector3((Math.random() - 0.5) * 0.6, 1.2 + Math.random() * 1.5, (Math.random() - 0.5) * 0.6), Math.random() < 0.5 ? this.color : this.core, 1.2, 0.06 * this.scale + 0.03, -0.3, 0.6);
    }
  }
}
