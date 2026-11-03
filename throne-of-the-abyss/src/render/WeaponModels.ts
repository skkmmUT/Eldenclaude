import {
  BoxGeometry,
  BufferGeometry,
  ConeGeometry,
  CylinderGeometry,
  ExtrudeGeometry,
  Float32BufferAttribute,
  Group,
  Mesh,
  Shape,
  SphereGeometry,
  TorusGeometry,
  type Material,
} from 'three';
import { glowMaterial, outlineMaterial, toonMaterial } from './Materials';
import { metalTexture } from './TextureFactory';

export type WeaponShape = 'longsword' | 'greatsword' | 'katana' | 'rustblade' | 'gravecleaver';

export interface WeaponVisual {
  shape: WeaponShape;
  bladeLength: number;
  bladeWidth: number;
  gripLength: number;
  bladeColor: string;
  hiltColor: string;
  gripColor: string;
  runeColor?: string;
}

export interface WeaponModel {
  group: Group;
  /** Hit segment along local +Y (metres from the socket). */
  hitBase: number;
  hitTip: number;
  /** Blade radius for the swept capsule hit test. */
  hitRadius: number;
}

/** Double-edged blade with a diamond cross-section, tapering to a point. */
function bladeGeometry(length: number, width: number, thickness: number, tipLen: number, curve = 0): BufferGeometry {
  const segs = 8;
  const pos: number[] = [];
  const ring = (y: number, w: number, bend: number): number[][] => [
    [w / 2, y, bend],
    [0, y, thickness / 2 + bend],
    [-w / 2, y, bend],
    [0, y, -thickness / 2 + bend],
  ];
  const rings: number[][][] = [];
  for (let i = 0; i <= segs; i++) {
    const f = i / segs;
    const y = f * (length - tipLen);
    rings.push(ring(y, width * (1 - f * 0.12), curve * f * f));
  }
  const tip = [0, length, curve * 1.25];
  const quad = (a: number[], b: number[], c: number[], d: number[]) => {
    pos.push(...a, ...b, ...c, ...a, ...c, ...d);
  };
  for (let i = 0; i < segs; i++) {
    const r0 = rings[i];
    const r1 = rings[i + 1];
    for (let k = 0; k < 4; k++) {
      const k2 = (k + 1) % 4;
      quad(r0[k], r0[k2], r1[k2], r1[k]);
    }
  }
  const last = rings[segs];
  for (let k = 0; k < 4; k++) pos.push(...last[k], ...last[(k + 1) % 4], ...tip);
  const g = new BufferGeometry();
  g.setAttribute('position', new Float32BufferAttribute(pos, 3));
  const uv = new Float32Array((pos.length / 3) * 2);
  g.setAttribute('uv', new Float32BufferAttribute(uv, 2));
  g.computeVertexNormals();
  return g;
}

function addMesh(group: Group, geo: BufferGeometry, mat: Material, outline = true): Mesh {
  const m = new Mesh(geo, mat);
  m.castShadow = true;
  group.add(m);
  if (outline) {
    const o = new Mesh(geo, outlineMaterial());
    o.name = 'outline';
    group.add(o);
  }
  return m;
}

export function buildWeapon(v: WeaponVisual): WeaponModel {
  const group = new Group();
  const metal = metalTexture();
  const bladeMat = toonMaterial({ color: v.bladeColor, map: metal, rim: 1.4 });
  const hiltMat = toonMaterial({ color: v.hiltColor, map: metal, emissive: v.hiltColor, emissiveIntensity: 0.1 });
  const gripMat = toonMaterial({ color: v.gripColor });
  const g = v.gripLength;

  // Grip runs from -g*0.35 (pommel side) to g*0.65 so the hand sits near the guard.
  const gripStart = -g * 0.3;
  const grip = new CylinderGeometry(0.018, 0.02, g, 8);
  grip.translate(0, gripStart + g / 2, 0);
  addMesh(group, grip, gripMat, false);
  const pommel = new SphereGeometry(0.032, 10, 8);
  pommel.translate(0, gripStart - 0.02, 0);
  addMesh(group, pommel, hiltMat);

  const guardY = gripStart + g;
  if (v.shape === 'katana') {
    const tsuba = new CylinderGeometry(0.055, 0.055, 0.014, 12);
    tsuba.translate(0, guardY, 0);
    addMesh(group, tsuba, hiltMat);
  } else {
    const guardW = v.shape === 'greatsword' || v.shape === 'gravecleaver' ? 0.34 : 0.22;
    const guard = new BoxGeometry(guardW, 0.035, 0.05);
    guard.translate(0, guardY, 0);
    addMesh(group, guard, hiltMat);
    for (const s of [1, -1]) {
      const finial = new ConeGeometry(0.022, 0.07, 6);
      finial.rotateZ((-Math.PI / 2) * s);
      finial.translate((guardW / 2 + 0.03) * s, guardY, 0);
      addMesh(group, finial, hiltMat);
    }
    if (v.runeColor) {
      const gem = new SphereGeometry(0.022, 8, 6);
      gem.translate(0, guardY, 0.03);
      addMesh(group, gem, glowMaterial(v.runeColor, 4), false);
    }
  }

  const bladeStart = guardY + 0.015;
  const thickness = v.shape === 'katana' ? 0.022 : 0.03;
  const tip = v.shape === 'katana' ? 0.12 : v.bladeWidth * 1.6;
  const curve = v.shape === 'katana' ? 0.06 : 0;
  const blade = bladeGeometry(v.bladeLength, v.bladeWidth, thickness, tip, curve);
  blade.translate(0, bladeStart, 0);
  addMesh(group, blade, bladeMat);

  if (v.shape === 'rustblade') {
    // Notched, broken edge for the undead soldiers.
    for (let i = 0; i < 4; i++) {
      const notch = new BoxGeometry(0.03, 0.04, 0.05);
      notch.translate(v.bladeWidth / 2, bladeStart + 0.15 + i * 0.17, 0);
      addMesh(group, notch, toonMaterial({ color: '#2a1e18' }), false);
    }
  }

  if (v.runeColor) {
    // Glowing fuller runes along the blade (bloom catches these).
    const fuller = new BoxGeometry(v.bladeWidth * 0.18, v.bladeLength * 0.7, thickness * 1.25);
    fuller.translate(0, bladeStart + v.bladeLength * 0.4, curve * 0.2);
    addMesh(group, fuller, glowMaterial(v.runeColor, 2.4), false);
  }

  if (v.shape === 'gravecleaver') {
    // Heavy spine plates on the greatsword.
    const spine = new BoxGeometry(v.bladeWidth * 0.5, v.bladeLength * 0.5, thickness * 2.2);
    spine.translate(0, bladeStart + v.bladeLength * 0.3, 0);
    addMesh(group, spine, toonMaterial({ color: '#1a1420', map: metal }));
  }

  return {
    group,
    hitBase: bladeStart + 0.05,
    hitTip: bladeStart + v.bladeLength,
    hitRadius: Math.max(0.07, v.bladeWidth * 0.6),
  };
}

/** Kite shield for soldiers (held in the left hand). */
export function buildShield(color: string, trim: string, emblem: string): Group {
  const group = new Group();
  const s = new Shape();
  s.moveTo(0, 0.32);
  s.quadraticCurveTo(0.24, 0.3, 0.24, 0.1);
  s.quadraticCurveTo(0.22, -0.2, 0, -0.4);
  s.quadraticCurveTo(-0.22, -0.2, -0.24, 0.1);
  s.quadraticCurveTo(-0.24, 0.3, 0, 0.32);
  const geo = new ExtrudeGeometry(s, { depth: 0.03, bevelEnabled: true, bevelSize: 0.015, bevelThickness: 0.015, bevelSegments: 1 });
  const face = addMesh(group, geo, toonMaterial({ color, map: metalTexture() }));
  face.position.z = -0.015;
  const rim = new TorusGeometry(0.1, 0.014, 6, 16);
  rim.translate(0, 0.02, 0.045);
  addMesh(group, rim, toonMaterial({ color: trim, map: metalTexture() }), false);
  const boss = new SphereGeometry(0.05, 10, 8);
  boss.translate(0, 0.02, 0.04);
  addMesh(group, boss, toonMaterial({ color: emblem }), false);
  // Shield faces outward from the forearm.
  group.rotation.set(0, Math.PI / 2, 0);
  group.position.set(0.05, 0.1, 0);
  return group;
}
