import { CanvasTexture, LinearMipmapLinearFilter, RepeatWrapping, SRGBColorSpace, type Texture } from 'three';
import { Rng } from '@/core/MathUtils';

/**
 * Procedurally painted textures (no external art yet). Everything is generated once at
 * load and cached; replacing them with authored textures only means swapping the
 * functions' return values.
 */
const cache = new Map<string, Texture>();
let anisotropy = 4;

/** Apply anisotropic filtering to every generated texture (and future ones). */
export function setTextureAnisotropy(n: number): void {
  anisotropy = n;
  for (const t of cache.values()) {
    if (t.anisotropy !== n) {
      t.anisotropy = n;
      t.needsUpdate = true;
    }
  }
}

function canvas(size: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  return [c, c.getContext('2d')!];
}

function finish(c: HTMLCanvasElement, repeat = 1): Texture {
  const t = new CanvasTexture(c);
  t.wrapS = t.wrapT = RepeatWrapping;
  t.repeat.set(repeat, repeat);
  t.colorSpace = SRGBColorSpace;
  t.minFilter = LinearMipmapLinearFilter;
  t.anisotropy = anisotropy;
  return t;
}

function speckle(g: CanvasRenderingContext2D, size: number, rng: Rng, count: number, alpha: number, light = false): void {
  for (let i = 0; i < count; i++) {
    const v = light ? 255 : 0;
    g.fillStyle = `rgba(${v},${v},${v},${rng.range(0, alpha)})`;
    const s = rng.range(1, 3);
    g.fillRect(rng.range(0, size), rng.range(0, size), s, s);
  }
}

/** Large flagstones with mortar, cracks and grime. */
export function flagstoneTexture(): Texture {
  const k = 'flagstone';
  if (cache.has(k)) return cache.get(k)!;
  const size = 512;
  const [c, g] = canvas(size);
  const rng = new Rng(1337);
  g.fillStyle = '#6e6a66';
  g.fillRect(0, 0, size, size);
  const rows = 4;
  const rowH = size / rows;
  for (let r = 0; r < rows; r++) {
    let x = r % 2 === 0 ? 0 : -rowH * 0.5;
    while (x < size) {
      const w = rowH * rng.range(0.8, 1.4);
      const shade = rng.range(165, 205);
      const tint = rng.range(-6, 6);
      g.fillStyle = `rgb(${shade + tint + 4},${shade + 1},${shade - 6})`;
      g.fillRect(x + 3, r * rowH + 3, w - 6, rowH - 6);
      // bevel highlight / shadow
      g.fillStyle = 'rgba(255,255,255,0.05)';
      g.fillRect(x + 3, r * rowH + 3, w - 6, 4);
      g.fillStyle = 'rgba(0,0,0,0.25)';
      g.fillRect(x + 3, r * rowH + rowH - 9, w - 6, 6);
      // cracks
      if (rng.chance(0.45)) {
        g.strokeStyle = 'rgba(10,6,14,0.7)';
        g.lineWidth = 1.2;
        g.beginPath();
        let cx = x + rng.range(10, w - 10);
        let cy = r * rowH + rng.range(8, rowH - 8);
        g.moveTo(cx, cy);
        for (let s = 0; s < 5; s++) {
          cx += rng.range(-18, 18);
          cy += rng.range(-14, 14);
          g.lineTo(cx, cy);
        }
        g.stroke();
      }
      x += w;
    }
  }
  speckle(g, size, rng, 5000, 0.12);
  speckle(g, size, rng, 1500, 0.06, true);
  // blood-dark grime blotches
  for (let i = 0; i < 18; i++) {
    const gx = rng.range(0, size);
    const gy = rng.range(0, size);
    const rad = rng.range(20, 70);
    const grad = g.createRadialGradient(gx, gy, 0, gx, gy, rad);
    grad.addColorStop(0, 'rgba(60,52,40,0.22)');
    grad.addColorStop(1, 'rgba(60,52,40,0)');
    g.fillStyle = grad;
    g.fillRect(gx - rad, gy - rad, rad * 2, rad * 2);
  }
  const t = finish(c);
  cache.set(k, t);
  return t;
}

/** Ashlar wall blocks for castle walls, towers and arches. */
export function wallTexture(): Texture {
  const k = 'wall';
  if (cache.has(k)) return cache.get(k)!;
  const size = 512;
  const [c, g] = canvas(size);
  const rng = new Rng(4242);
  g.fillStyle = '#76716b';
  g.fillRect(0, 0, size, size);
  const rows = 8;
  const rowH = size / rows;
  for (let r = 0; r < rows; r++) {
    let x = r % 2 === 0 ? 0 : -rowH;
    while (x < size) {
      const w = rowH * rng.range(1.5, 2.4);
      const shade = rng.range(160, 200);
      g.fillStyle = `rgb(${shade + 3},${shade},${shade - 6})`;
      g.fillRect(x + 2, r * rowH + 2, w - 4, rowH - 4);
      g.fillStyle = 'rgba(255,255,255,0.045)';
      g.fillRect(x + 2, r * rowH + 2, w - 4, 3);
      x += w;
    }
  }
  speckle(g, size, rng, 6000, 0.1);
  // vertical damp streaks
  for (let i = 0; i < 24; i++) {
    const sx = rng.range(0, size);
    const grad = g.createLinearGradient(sx, 0, sx, size);
    grad.addColorStop(0, 'rgba(0,0,0,0.0)');
    grad.addColorStop(rng.range(0.2, 0.8), 'rgba(40,36,30,0.12)');
    grad.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = grad;
    g.fillRect(sx, 0, rng.range(3, 12), size);
  }
  const t = finish(c);
  cache.set(k, t);
  return t;
}

/** Fine engraved metal for armour trim / weapons. */
export function metalTexture(): Texture {
  const k = 'metal';
  if (cache.has(k)) return cache.get(k)!;
  const size = 256;
  const [c, g] = canvas(size);
  const rng = new Rng(77);
  const grad = g.createLinearGradient(0, 0, size, size);
  grad.addColorStop(0, '#cfcfd8');
  grad.addColorStop(0.5, '#9a98a8');
  grad.addColorStop(1, '#d8d6e0');
  g.fillStyle = grad;
  g.fillRect(0, 0, size, size);
  for (let i = 0; i < 400; i++) {
    g.strokeStyle = `rgba(255,255,255,${rng.range(0, 0.12)})`;
    g.beginPath();
    const y = rng.range(0, size);
    g.moveTo(0, y);
    g.lineTo(size, y + rng.range(-4, 4));
    g.stroke();
  }
  speckle(g, size, rng, 800, 0.15);
  const t = finish(c);
  cache.set(k, t);
  return t;
}

/** Soft radial sprite used by particles, glows and light shafts. */
export function radialSprite(): Texture {
  const k = 'radial';
  if (cache.has(k)) return cache.get(k)!;
  const size = 128;
  const [c, g] = canvas(size);
  const grad = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.25, 'rgba(255,255,255,0.65)');
  grad.addColorStop(0.6, 'rgba(255,255,255,0.12)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, size, size);
  const t = new CanvasTexture(c);
  cache.set(k, t);
  return t;
}

/** Tattered cloth for banners and the player's cape (alpha-cut edges). */
export function banneredClothTexture(base: string, trim: string, sigil: string): Texture {
  const k = `cloth:${base}:${trim}:${sigil}`;
  if (cache.has(k)) return cache.get(k)!;
  const w = 256;
  const h = 512;
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const g = c.getContext('2d')!;
  const rng = new Rng(k.length * 97);
  g.fillStyle = base;
  g.fillRect(0, 0, w, h);
  // fabric weave
  for (let y = 0; y < h; y += 3) {
    g.fillStyle = `rgba(0,0,0,${rng.range(0.02, 0.08)})`;
    g.fillRect(0, y, w, 1);
  }
  // gold trim borders
  g.fillStyle = trim;
  g.fillRect(10, 0, 8, h);
  g.fillRect(w - 18, 0, 8, h);
  g.fillRect(10, 30, w - 20, 6);
  // sigil: a crowned eye within a circle
  g.strokeStyle = sigil;
  g.fillStyle = sigil;
  g.lineWidth = 6;
  g.beginPath();
  g.arc(w / 2, h * 0.36, 56, 0, Math.PI * 2);
  g.stroke();
  g.beginPath();
  g.ellipse(w / 2, h * 0.36, 34, 16, 0, 0, Math.PI * 2);
  g.stroke();
  g.beginPath();
  g.arc(w / 2, h * 0.36, 8, 0, Math.PI * 2);
  g.fill();
  g.beginPath();
  g.moveTo(w / 2 - 36, h * 0.36 - 70);
  g.lineTo(w / 2 - 22, h * 0.36 - 96);
  g.lineTo(w / 2, h * 0.36 - 76);
  g.lineTo(w / 2 + 22, h * 0.36 - 96);
  g.lineTo(w / 2 + 36, h * 0.36 - 70);
  g.closePath();
  g.fill();
  // torn bottom edge (transparent notches)
  g.globalCompositeOperation = 'destination-out';
  g.beginPath();
  g.moveTo(0, h);
  for (let x = 0; x <= w; x += 16) g.lineTo(x, h - rng.range(10, 90));
  g.lineTo(w, h);
  g.closePath();
  g.fill();
  for (let i = 0; i < 6; i++) {
    g.beginPath();
    g.arc(rng.range(20, w - 20), rng.range(h * 0.5, h * 0.85), rng.range(3, 9), 0, Math.PI * 2);
    g.fill();
  }
  g.globalCompositeOperation = 'source-over';
  const t = new CanvasTexture(c);
  t.colorSpace = SRGBColorSpace;
  cache.set(k, t);
  return t;
}
