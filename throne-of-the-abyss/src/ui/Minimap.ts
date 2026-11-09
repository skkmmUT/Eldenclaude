import { el } from './dom';

export interface MinimapMarker {
  x: number;
  z: number;
  kind: 'altar' | 'altarLit' | 'enemy' | 'enemyAlert' | 'boss' | 'echoes' | 'location';
  label?: string;
}

export interface MinimapFrame {
  x: number;
  z: number;
  facing: number;
  cameraYaw: number;
  markers: MinimapMarker[];
  place: string;
}

const SIZE = 184;
/** Pixels per metre on the minimap. */
const SCALE = 1.45;

/**
 * Circular minimap (top-right). Rotates with the camera so "up" is where you look;
 * shows terrain, buildings, altars, nearby foes and the current place name.
 * The world is mirrored like the big map: facing north, +X lies to the left.
 */
export class Minimap {
  readonly root: HTMLDivElement;
  private readonly canvas: HTMLCanvasElement;
  private readonly g: CanvasRenderingContext2D;
  private readonly label = el('div.mm-label');
  private base: HTMLCanvasElement | null = null;
  private baseHalf = 0;
  private baseMpp = 1;
  private acc = 1;

  constructor(parent: HTMLElement) {
    this.canvas = el('canvas');
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    this.canvas.width = this.canvas.height = Math.round(SIZE * dpr);
    this.canvas.style.width = this.canvas.style.height = `${SIZE}px`;
    this.g = this.canvas.getContext('2d')!;
    this.g.scale(dpr, dpr);
    this.root = el('div.minimap', {}, [this.canvas, el('div.mm-ring'), this.label]);
    parent.append(this.root);
  }

  /** Static top-down image of the world (`size` metres across, centred on the origin). */
  setBase(img: HTMLCanvasElement, worldSize: number): void {
    this.base = img;
    this.baseHalf = worldSize / 2;
    this.baseMpp = worldSize / img.width;
  }

  get hasBase(): boolean {
    return !!this.base;
  }

  setVisible(v: boolean): void {
    this.root.style.display = v ? 'block' : 'none';
  }

  update(dt: number, f: MinimapFrame): void {
    this.acc += dt;
    if (this.acc < 1 / 24) return;
    this.acc = 0;
    if (this.label.textContent !== f.place) this.label.textContent = f.place;
    const g = this.g;
    const c = SIZE / 2;
    // Camera basis on the mirrored map: forward = look direction, right = screen right.
    const fx = Math.sin(f.cameraYaw);
    const fz = Math.cos(f.cameraYaw);
    const rx = -Math.cos(f.cameraYaw);
    const rz = Math.sin(f.cameraYaw);
    const toScreen = (x: number, z: number): [number, number] => {
      const dx = x - f.x;
      const dz = z - f.z;
      return [c + SCALE * (dx * rx + dz * rz), c - SCALE * (dx * fx + dz * fz)];
    };
    g.save();
    g.clearRect(0, 0, SIZE, SIZE);
    g.beginPath();
    g.arc(c, c, c - 2, 0, Math.PI * 2);
    g.clip();
    g.fillStyle = '#121016';
    g.fillRect(0, 0, SIZE, SIZE);
    if (this.base) {
      // Image pixel (ix, iy) ↔ world (half − ix·mpp, half − iy·mpp): an affine map to screen.
      const m = this.baseMpp;
      const h = this.baseHalf;
      g.save();
      g.setTransform(
        -SCALE * m * rx, SCALE * m * fx,
        -SCALE * m * rz, SCALE * m * fz,
        c + SCALE * ((h - f.x) * rx + (h - f.z) * rz),
        c - SCALE * ((h - f.x) * fx + (h - f.z) * fz),
      );
      const dpr = this.canvas.width / SIZE;
      const t = g.getTransform();
      g.setTransform(t.a * dpr, t.b * dpr, t.c * dpr, t.d * dpr, t.e * dpr, t.f * dpr);
      g.imageSmoothingEnabled = true;
      g.drawImage(this.base, 0, 0);
      g.restore();
    }
    // Soft inner shade toward the rim.
    const grad = g.createRadialGradient(c, c, c * 0.55, c, c, c);
    grad.addColorStop(0, 'rgba(0,0,0,0)');
    grad.addColorStop(1, 'rgba(0,0,0,0.45)');
    g.fillStyle = grad;
    g.fillRect(0, 0, SIZE, SIZE);

    for (const mk of f.markers) {
      let [sx, sy] = toScreen(mk.x, mk.z);
      const dx = sx - c;
      const dy = sy - c;
      const d = Math.hypot(dx, dy);
      const rim = c - 9;
      const clamped = d > rim;
      if (clamped) {
        if (mk.kind === 'enemy' || mk.kind === 'enemyAlert' || mk.kind === 'echoes' || mk.kind === 'location') continue;
        sx = c + (dx / d) * rim;
        sy = c + (dy / d) * rim;
      }
      g.globalAlpha = clamped ? 0.75 : 1;
      switch (mk.kind) {
        case 'altar':
        case 'altarLit':
          g.save();
          g.translate(sx, sy);
          g.rotate(Math.PI / 4);
          g.fillStyle = mk.kind === 'altarLit' ? '#c08aff' : '#6a5a7a';
          g.strokeStyle = '#000';
          g.lineWidth = 1;
          g.fillRect(-4, -4, 8, 8);
          g.strokeRect(-4, -4, 8, 8);
          g.restore();
          break;
        case 'enemy':
        case 'enemyAlert':
          g.fillStyle = mk.kind === 'enemyAlert' ? '#ff3a4a' : '#c86a6a';
          g.beginPath();
          g.arc(sx, sy, 3, 0, Math.PI * 2);
          g.fill();
          break;
        case 'boss':
          g.fillStyle = '#ff2a4a';
          g.strokeStyle = '#000';
          g.beginPath();
          g.arc(sx, sy, 5.5, 0, Math.PI * 2);
          g.fill();
          g.stroke();
          break;
        case 'echoes':
          g.strokeStyle = '#ffd27a';
          g.lineWidth = 2;
          g.beginPath();
          g.arc(sx, sy, 5, 0, Math.PI * 2);
          g.stroke();
          break;
        case 'location':
          g.fillStyle = 'rgba(240,226,190,0.9)';
          g.font = '600 9px Cinzel, serif';
          g.textAlign = 'center';
          g.fillText(mk.label ?? '', sx, sy);
          break;
      }
      g.globalAlpha = 1;
    }

    // North marker on the rim.
    const [nx, ny] = toScreen(f.x, f.z + 1000);
    const nd = Math.hypot(nx - c, ny - c);
    g.fillStyle = '#e8c070';
    g.font = '700 11px Cinzel, serif';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText('N', c + ((nx - c) / nd) * (c - 11), c + ((ny - c) / nd) * (c - 11));
    g.textBaseline = 'alphabetic';

    // Player arrow (relative to the camera).
    g.translate(c, c);
    g.rotate(-(f.facing - f.cameraYaw));
    g.fillStyle = '#ffffff';
    g.strokeStyle = 'rgba(0,0,0,0.8)';
    g.lineWidth = 1.5;
    g.beginPath();
    g.moveTo(0, -8);
    g.lineTo(5.5, 6);
    g.lineTo(0, 3);
    g.lineTo(-5.5, 6);
    g.closePath();
    g.stroke();
    g.fill();
    g.restore();
  }
}
