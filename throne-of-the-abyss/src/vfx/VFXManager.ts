import {
  AdditiveBlending,
  CircleGeometry,
  Mesh,
  MeshBasicMaterial,
  NormalBlending,
  PointLight,
  RingGeometry,
  Sprite,
  SpriteMaterial,
  Vector3,
  type Scene,
} from 'three';
import { radialSprite } from '@/render/TextureFactory';
import { DAMAGE_COLORS, type DirectDamageType } from '@/combat/DamageTypes';
import { ParticlePool } from './ParticlePool';

interface Flash {
  sprite: Sprite;
  life: number;
  max: number;
  size: number;
}
interface Ring {
  mesh: Mesh;
  life: number;
  max: number;
  radius: number;
}
interface Warning {
  disc: Mesh;
  edge: Mesh;
  life: number;
  max: number;
  radius: number;
}
interface LightFlash {
  light: PointLight;
  life: number;
  max: number;
  intensity: number;
}

/** Central effects service; gameplay emits intents, this turns them into particles/light. */
export class VFXManager {
  readonly sparks = new ParticlePool(1800, AdditiveBlending);
  readonly smoke = new ParticlePool(700, NormalBlending);
  private flashes: Flash[] = [];
  private rings: Ring[] = [];
  private lights: LightFlash[] = [];
  private warnings: Warning[] = [];
  private readonly up = new Vector3(0, 1, 0);
  private readonly tmp = new Vector3();

  constructor(scene: Scene) {
    scene.add(this.sparks.points, this.smoke.points);
    for (let i = 0; i < 10; i++) {
      const sprite = new Sprite(
        new SpriteMaterial({ map: radialSprite(), blending: AdditiveBlending, depthWrite: false, transparent: true, color: '#ffffff' }),
      );
      sprite.visible = false;
      sprite.renderOrder = 13;
      scene.add(sprite);
      this.flashes.push({ sprite, life: 0, max: 1, size: 1 });
    }
    for (let i = 0; i < 6; i++) {
      const mesh = new Mesh(
        new RingGeometry(0.85, 1, 48),
        new MeshBasicMaterial({ color: '#ffffff', transparent: true, blending: AdditiveBlending, depthWrite: false, side: 2 }),
      );
      mesh.rotation.x = -Math.PI / 2;
      mesh.visible = false;
      mesh.renderOrder = 12;
      scene.add(mesh);
      this.rings.push({ mesh, life: 0, max: 1, radius: 1 });
    }
    // Ground danger zones: a faint disc that fills toward its edge until impact.
    for (let i = 0; i < 4; i++) {
      const disc = new Mesh(
        new CircleGeometry(1, 48),
        new MeshBasicMaterial({ color: '#ff2a3a', transparent: true, blending: AdditiveBlending, depthWrite: false, opacity: 0 }),
      );
      const edge = new Mesh(
        new RingGeometry(0.93, 1, 64),
        new MeshBasicMaterial({ color: '#ff2a3a', transparent: true, blending: AdditiveBlending, depthWrite: false, opacity: 0 }),
      );
      for (const m of [disc, edge]) {
        m.rotation.x = -Math.PI / 2;
        m.visible = false;
        m.renderOrder = 11;
        scene.add(m);
      }
      this.warnings.push({ disc, edge, life: 0, max: 1, radius: 1 });
    }
    // Pooled flash lights: always in the scene (intensity 0 when idle) so the light count
    // never changes and shaders never recompile mid-fight.
    for (let i = 0; i < 2; i++) {
      const light = new PointLight('#ffffff', 0, 6, 2);
      scene.add(light);
      this.lights.push({ light, life: 0, max: 1, intensity: 0 });
    }
  }

  setDensity(d: number): void {
    this.sparks.density = d;
    this.smoke.density = d;
  }

  setViewportHeight(h: number): void {
    this.sparks.setViewportScale(h);
    this.smoke.setViewportScale(h);
  }

  flash(pos: Vector3, color: string, size: number, life = 0.12): void {
    const f = this.flashes.find((x) => x.life <= 0) ?? this.flashes[0];
    f.sprite.position.copy(pos);
    (f.sprite.material as SpriteMaterial).color.set(color);
    f.life = f.max = life;
    f.size = size;
    f.sprite.visible = true;
  }

  ring(pos: Vector3, radius: number, color: string, life = 0.45): void {
    const r = this.rings.find((x) => x.life <= 0) ?? this.rings[0];
    r.mesh.position.set(pos.x, pos.y + 0.05, pos.z);
    (r.mesh.material as MeshBasicMaterial).color.set(color);
    r.life = r.max = life;
    r.radius = radius;
    r.mesh.visible = true;
  }

  /**
   * Telegraph for an area attack: marks the exact danger zone on the ground for `life`
   * seconds (until impact). The inner disc grows to the edge as the hit approaches.
   */
  groundWarning(pos: Vector3, radius: number, color: string, life: number): number {
    const i = Math.max(0, this.warnings.findIndex((x) => x.life <= 0));
    const w = this.warnings[i];
    for (const m of [w.disc, w.edge]) {
      m.position.set(pos.x, pos.y + 0.06, pos.z);
      (m.material as MeshBasicMaterial).color.set(color);
      m.visible = true;
    }
    w.edge.scale.setScalar(radius);
    w.life = w.max = Math.max(0.05, life);
    w.radius = radius;
    return i;
  }

  /** Keep a warning on the predicted impact point while the attacker still aims. */
  moveWarning(i: number, pos: Vector3): void {
    const w = this.warnings[i];
    if (!w || w.life <= 0) return;
    w.disc.position.set(pos.x, pos.y + 0.06, pos.z);
    w.edge.position.set(pos.x, pos.y + 0.06, pos.z);
  }

  get activeWarnings(): number {
    return this.warnings.filter((w) => w.life > 0).length;
  }

  light(pos: Vector3, color: string, intensity: number, life = 0.15): void {
    const l = this.lights.reduce((a, b) => (a.life < b.life ? a : b));
    l.light.position.copy(pos);
    l.light.color.set(color);
    l.life = l.max = life;
    l.intensity = intensity;
  }

  /** Weapon connects with flesh/armour. */
  hitImpact(point: Vector3, type: DirectDamageType, dir: Vector3, heavy: boolean, critical: boolean): void {
    const color = DAMAGE_COLORS[type];
    this.sparks.burst(point, {
      count: heavy ? 34 : 20,
      color: '#fff1d6',
      color2: color,
      speed: heavy ? 9 : 6.5,
      life: 0.3,
      size: 0.09,
      gravity: 9,
      drag: 3,
      direction: dir,
      spread: 1.4,
    });
    // stylised blood: dark crimson droplets + bright core
    this.sparks.burst(point, {
      count: heavy ? 26 : 14,
      color: '#ff1438',
      color2: '#7a0012',
      speed: 4.5,
      life: 0.55,
      size: 0.11,
      gravity: 12,
      drag: 1.2,
      direction: dir,
      spread: 1.1,
      upBias: 0.3,
    });
    if (type !== 'physical') {
      this.sparks.burst(point, { count: 18, color, speed: 3, life: 0.5, size: 0.16, gravity: -2, drag: 2, spread: 2 });
    }
    this.flash(point, critical ? '#ffd7f0' : '#ffe7c4', critical ? 1.6 : heavy ? 1.1 : 0.7, critical ? 0.18 : 0.09);
    this.light(point, color === DAMAGE_COLORS.physical ? '#ffb070' : color, critical ? 9 : heavy ? 5 : 3, 0.12);
  }

  blocked(point: Vector3, dir: Vector3): void {
    this.sparks.burst(point, { count: 28, color: '#ffe9a0', color2: '#ff9a3a', speed: 8, life: 0.35, size: 0.07, gravity: 10, drag: 2.5, direction: dir, spread: 1.6 });
    this.flash(point, '#ffd88a', 1.2, 0.08);
    this.light(point, '#ffc070', 4, 0.1);
  }

  parry(point: Vector3): void {
    this.sparks.burst(point, { count: 45, color: '#ffffff', color2: '#ffd36a', speed: 10, life: 0.4, size: 0.08, gravity: 6, drag: 2.5, spread: 2 });
    this.flash(point, '#fff4cc', 3.2, 0.22);
    this.ring(point, 1.8, '#ffe3a0', 0.3);
    this.light(point, '#fff0c0', 12, 0.25);
  }

  shockwave(pos: Vector3, radius: number, color: string): void {
    this.ring(pos, radius, color, 0.5);
    this.dust(pos, radius);
    this.sparks.burst(this.tmp.copy(pos).setY(pos.y + 0.1), { count: 30, color, color2: '#ffffff', speed: radius * 3, life: 0.4, size: 0.1, gravity: 4, drag: 3, direction: this.up, spread: 3 });
    this.light(this.tmp.copy(pos).setY(pos.y + 0.5), color, 8, 0.3);
  }

  dust(pos: Vector3, scale = 1): void {
    this.smoke.burst(pos, { count: Math.round(10 * scale), color: '#3a3040', color2: '#5a4c58', speed: 2.2 * scale, life: 0.9, size: 0.7, gravity: -0.3, drag: 3, direction: this.up, spread: 3, radius: 0.3 });
  }

  /** Telegraph glint on an enemy weapon — readable warning before a big attack. */
  glint(pos: Vector3, color: string): void {
    this.flash(pos, color, 1.4, 0.35);
    this.sparks.burst(pos, { count: 10, color, color2: '#ffffff', speed: 1.5, life: 0.35, size: 0.08, drag: 4 });
  }

  /** Souls leaving a body / echoes. */
  soulRelease(pos: Vector3, color: string, count = 60): void {
    this.sparks.burst(pos, { count, color, color2: '#ffffff', speed: 1.4, life: 1.6, size: 0.12, gravity: -1.6, drag: 0.8, spread: 2, radius: 0.5 });
  }

  update(dt: number): void {
    this.sparks.update(dt);
    this.smoke.update(dt);
    for (const f of this.flashes) {
      if (f.life <= 0) continue;
      f.life -= dt;
      const k = Math.max(0, f.life / f.max);
      f.sprite.scale.setScalar(f.size * (1.3 - 0.3 * k));
      (f.sprite.material as SpriteMaterial).opacity = k;
      if (f.life <= 0) f.sprite.visible = false;
    }
    for (const r of this.rings) {
      if (r.life <= 0) continue;
      r.life -= dt;
      const k = 1 - Math.max(0, r.life / r.max);
      const s = r.radius * (0.2 + 0.8 * Math.sqrt(k));
      r.mesh.scale.set(s, s, s);
      (r.mesh.material as MeshBasicMaterial).opacity = (1 - k) * 0.9;
      if (r.life <= 0) r.mesh.visible = false;
    }
    for (const w of this.warnings) {
      if (w.life <= 0) continue;
      w.life -= dt;
      const k = 1 - Math.max(0, w.life / w.max);
      w.disc.scale.setScalar(w.radius * Math.max(0.05, k));
      (w.disc.material as MeshBasicMaterial).opacity = 0.18 + 0.22 * k;
      (w.edge.material as MeshBasicMaterial).opacity = 0.55 + 0.35 * Math.sin(k * Math.PI * 6) ** 2;
      if (w.life <= 0) w.disc.visible = w.edge.visible = false;
    }
    for (const l of this.lights) {
      if (l.life <= 0) {
        l.light.intensity = 0;
        continue;
      }
      l.life -= dt;
      l.light.intensity = l.intensity * Math.max(0, l.life / l.max);
    }
  }
}
