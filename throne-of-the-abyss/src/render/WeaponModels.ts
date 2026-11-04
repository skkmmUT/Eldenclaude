import {
  BufferGeometry,
  ExtrudeGeometry,
  Float32BufferAttribute,
  Group,
  Mesh,
  Shape,
  SphereGeometry,
  TorusGeometry,
  Vector3,
  type Material,
} from 'three';
import { glowMaterial, outlineMaterial, surfaceMaterial } from './Materials';
import { metalTexture } from './TextureFactory';
import { bulge, lathe, roundedBox, seg, taperedTube } from './SmoothGeometry';

export type WeaponShape =
  | 'longsword'
  | 'greatsword'
  | 'katana'
  | 'rustblade'
  | 'gravecleaver'
  | 'dagger'
  | 'spear'
  | 'halberd'
  | 'axe'
  | 'hammer'
  | 'staff'
  | 'grimoire';

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

/**
 * Smooth blade: lens-shaped cross-section (thin bevelled edges, thicker centre), width
 * easing into a rounded point, optional curvature (katana). Many rings → no faceting.
 */
function bladeGeometry(length: number, width: number, thickness: number, tipLen: number, curve = 0): BufferGeometry {
  const rings = seg(22, 8);
  const sides = seg(12, 8);
  const pos: number[] = [];
  const idx: number[] = [];
  for (let i = 0; i <= rings; i++) {
    const f = i / rings;
    const y = f * length;
    const tipF = Math.max(0, (y - (length - tipLen)) / tipLen);
    const taper = (1 - f * 0.12) * Math.sqrt(Math.max(0, 1 - tipF * tipF));
    const w = (width / 2) * taper;
    const t = (thickness / 2) * (0.35 + 0.65 * Math.sqrt(Math.max(0, 1 - tipF)));
    const bend = curve * f * f;
    for (let k = 0; k < sides; k++) {
      const a = (k / sides) * Math.PI * 2;
      const c = Math.cos(a);
      const sn = Math.sin(a);
      // lens profile: |z| shrinks quickly toward the edges
      const x = c * w;
      const z = sn * t * Math.pow(1 - Math.abs(c) * 0.98, 0.6) + bend;
      pos.push(x, y, z);
    }
  }
  const tipIndex = pos.length / 3;
  pos.push(0, length + Math.min(0.01, tipLen * 0.05), curve * 1.02);
  for (let i = 0; i < rings; i++) {
    for (let k = 0; k < sides; k++) {
      const a = i * sides + k;
      const b = i * sides + ((k + 1) % sides);
      const c = (i + 1) * sides + k;
      const d = (i + 1) * sides + ((k + 1) % sides);
      idx.push(a, b, c, b, d, c);
    }
  }
  for (let k = 0; k < sides; k++) idx.push(rings * sides + k, rings * sides + ((k + 1) % sides), tipIndex);
  const g = new BufferGeometry();
  g.setAttribute('position', new Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.setAttribute('uv', new Float32BufferAttribute(new Float32Array((pos.length / 3) * 2), 2));
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

/** Polearms, axes, hammers, staffs and books share a haft-based construction. */
function buildHafted(v: WeaponVisual): WeaponModel {
  const group = new Group();
  const metal = metalTexture();
  const head = surfaceMaterial({ color: v.bladeColor, map: metal, metalness: 0.9, roughness: 0.28, rim: 1 });
  const fitting = surfaceMaterial({ color: v.hiltColor, map: metal, metalness: 0.9, roughness: 0.35 });
  const wood = surfaceMaterial({ color: v.gripColor, roughness: 0.75 });
  const below = v.shape === 'spear' || v.shape === 'halberd' || v.shape === 'staff' ? 0.75 : 0.22;
  const len = v.gripLength; // total haft length above the hand
  if (v.shape === 'grimoire') {
    const cover = surfaceMaterial({ color: v.gripColor, roughness: 0.6 });
    const book = roundedBox(0.2, 0.26, 0.07, 0.02);
    book.translate(0, 0.12, 0);
    addMesh(group, book, cover);
    const pages = roundedBox(0.18, 0.245, 0.055, 0.008);
    pages.translate(0.012, 0.12, 0);
    addMesh(group, pages, surfaceMaterial({ color: '#e8dcc0', roughness: 0.9 }), false);
    for (const z of [-0.036, 0.036]) {
      const clasp = lathe([[0.0, -0.004], [0.04, -0.004], [0.045, 0.0], [0.04, 0.004], [0.0, 0.004]], 20);
      clasp.rotateX(Math.PI / 2);
      clasp.translate(0, 0.12, z);
      addMesh(group, clasp, fitting, false);
    }
    const sigil = new TorusGeometry(0.05, 0.007, 8, 32);
    sigil.translate(0, 0.12, 0.037);
    addMesh(group, sigil, glowMaterial(v.runeColor ?? '#9a5cff', 2.6), false);
    return { group, hitBase: 0.02, hitTip: 0.24, hitRadius: 0.12 };
  }
  // Haft: a gently tapered lathe with a butt cap.
  const haft = lathe([[0.018, -below], [0.022, -below + 0.04], [0.021, len * 0.5], [0.019, len]], 14);
  addMesh(group, haft, wood, false);
  const butt = new SphereGeometry(0.026, seg(14), seg(10));
  butt.translate(0, -below, 0);
  addMesh(group, butt, fitting);
  const collar = lathe([[0.022, len - 0.06], [0.03, len - 0.03], [0.026, len]], 18);
  addMesh(group, collar, fitting);
  let hitBase = len - 0.1;
  let hitTip = len + 0.3;
  let hitRadius = 0.1;
  if (v.shape === 'spear') {
    const blade = bladeGeometry(v.bladeLength, v.bladeWidth, 0.03, v.bladeLength * 0.55);
    blade.translate(0, len, 0);
    addMesh(group, blade, head);
    hitBase = len * 0.55;
    hitTip = len + v.bladeLength;
    hitRadius = 0.08;
  } else if (v.shape === 'halberd') {
    const spike = bladeGeometry(v.bladeLength * 0.6, v.bladeWidth * 0.5, 0.03, 0.12);
    spike.translate(0, len, 0);
    addMesh(group, spike, head);
    // Crescent axe blade: a bevelled extruded curve, bulged for a smooth face.
    const sh = new Shape();
    sh.moveTo(0, -0.16);
    sh.quadraticCurveTo(0.28, -0.22, 0.32, 0.0);
    sh.quadraticCurveTo(0.28, 0.24, 0.0, 0.2);
    sh.quadraticCurveTo(0.12, 0.0, 0.0, -0.16);
    const axe = new ExtrudeGeometry(sh, { depth: 0.012, bevelEnabled: true, bevelSize: 0.008, bevelThickness: 0.01, bevelSegments: 3, curveSegments: seg(20, 8) });
    axe.translate(0.012, len - 0.12, -0.006);
    addMesh(group, axe, head);
    const hook = taperedTube([new Vector3(-0.02, len - 0.12, 0), new Vector3(-0.12, len - 0.08, 0), new Vector3(-0.18, len - 0.16, 0)], (t) => 0.02 * (1 - t) + 0.002, 8, 10, 0.6);
    addMesh(group, hook, head);
    hitBase = len - 0.4;
    hitTip = len + v.bladeLength * 0.6;
    hitRadius = 0.16;
  } else if (v.shape === 'axe') {
    const sh = new Shape();
    sh.moveTo(0, -0.08);
    sh.quadraticCurveTo(0.16, -0.18, 0.2, 0.02);
    sh.quadraticCurveTo(0.17, 0.16, 0.0, 0.1);
    sh.quadraticCurveTo(0.06, 0.0, 0.0, -0.08);
    const axe = new ExtrudeGeometry(sh, { depth: 0.014, bevelEnabled: true, bevelSize: 0.008, bevelThickness: 0.01, bevelSegments: 3, curveSegments: seg(18, 8) });
    axe.translate(0.015, len - 0.09, -0.007);
    addMesh(group, axe, head);
    hitBase = len - 0.25;
    hitTip = len + 0.08;
    hitRadius = 0.15;
  } else if (v.shape === 'hammer') {
    const headGeo = roundedBox(0.3, 0.14, 0.14, 0.04);
    headGeo.translate(0, len, 0);
    addMesh(group, headGeo, head);
    for (const sx of [-1, 1]) {
      const cap = lathe([[0.0, 0], [0.07, 0.0], [0.075, 0.02], [0.05, 0.04], [0.0, 0.045]], 20);
      cap.rotateZ((-Math.PI / 2) * sx);
      cap.translate(0.15 * sx, len, 0);
      addMesh(group, cap, fitting);
    }
    hitBase = len - 0.06;
    hitTip = len + 0.08;
    hitRadius = 0.2;
  } else if (v.shape === 'staff') {
    // Crown of swirling gold around a glowing crystal.
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * Math.PI * 2;
      const prong = taperedTube([new Vector3(0, len - 0.02, 0), new Vector3(Math.cos(a) * 0.07, len + 0.08, Math.sin(a) * 0.07), new Vector3(Math.cos(a + 0.8) * 0.045, len + 0.2, Math.sin(a + 0.8) * 0.045)], (t) => 0.012 * (1 - t) + 0.003, 8, 12);
      addMesh(group, prong, fitting);
    }
    const crystal = new SphereGeometry(0.045, 16, 12).scale(1, 1.6, 1);
    crystal.translate(0, len + 0.11, 0);
    addMesh(group, crystal, glowMaterial(v.runeColor ?? '#9fd8ff', 2.4), false);
    hitBase = len * 0.6;
    hitTip = len + 0.2;
    hitRadius = 0.08;
  }
  return { group, hitBase, hitTip, hitRadius };
}

export function buildWeapon(v: WeaponVisual): WeaponModel {
  if (['spear', 'halberd', 'axe', 'hammer', 'staff', 'grimoire'].includes(v.shape)) return buildHafted(v);
  const group = new Group();
  const metal = metalTexture();
  const bladeMat = surfaceMaterial({ color: v.bladeColor, map: metal, metalness: 0.95, roughness: 0.22, rim: 1 });
  const hiltMat = surfaceMaterial({ color: v.hiltColor, map: metal, metalness: 0.9, roughness: 0.32 });
  const gripMat = surfaceMaterial({ color: v.gripColor, roughness: 0.8 });
  const g = v.gripLength;

  // Grip runs from -g*0.35 (pommel side) to g*0.65 so the hand sits near the guard.
  const gripStart = -g * 0.3;
  // Leather-wrapped grip: a lathe with gentle ridges.
  const wraps = Math.max(4, Math.round(g / 0.03));
  const prof: Array<[number, number]> = [];
  for (let i = 0; i <= wraps; i++) prof.push([0.019 + (i % 2) * 0.0025, gripStart + (i / wraps) * g]);
  const grip = lathe(prof, 14, 1, 0.9, 1);
  addMesh(group, grip, gripMat, false);
  const pommel = new SphereGeometry(0.032, seg(16), seg(12));
  pommel.translate(0, gripStart - 0.02, 0);
  addMesh(group, pommel, hiltMat);

  const guardY = gripStart + g;
  if (v.shape === 'katana') {
    const tsuba = lathe([[0.0, -0.008], [0.05, -0.008], [0.058, 0.0], [0.05, 0.008], [0.0, 0.008]], 28, 1, 0.8);
    tsuba.translate(0, guardY, 0);
    addMesh(group, tsuba, hiltMat);
  } else {
    const guardW = v.shape === 'greatsword' || v.shape === 'gravecleaver' ? 0.34 : v.shape === 'dagger' ? 0.13 : 0.22;
    // Swept crossguard: one tapered spline curving toward the blade at both ends.
    const hw = guardW / 2;
    const guard = taperedTube(
      [
        new Vector3(-hw - 0.03, guardY + 0.035, 0),
        new Vector3(-hw * 0.6, guardY + 0.002, 0),
        new Vector3(0, guardY - 0.008, 0),
        new Vector3(hw * 0.6, guardY + 0.002, 0),
        new Vector3(hw + 0.03, guardY + 0.035, 0),
      ],
      (t) => 0.011 + 0.014 * Math.sin(Math.PI * t) - 0.006 * Math.pow(Math.abs(t - 0.5) * 2, 6),
      10,
      24,
      0.75,
    );
    addMesh(group, guard, hiltMat);
    const block = roundedBox(0.05, 0.045, 0.05, 0.016);
    block.translate(0, guardY, 0);
    addMesh(group, block, hiltMat);
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
      const notch = roundedBox(0.03, 0.04, 0.05, 0.012);
      notch.translate(v.bladeWidth / 2, bladeStart + 0.15 + i * 0.17, 0);
      addMesh(group, notch, surfaceMaterial({ color: '#2a1e18', roughness: 0.9 }), false);
    }
  }

  if (v.runeColor) {
    // Glowing fuller runes along the blade (bloom catches these).
    const fuller = roundedBox(v.bladeWidth * 0.18, v.bladeLength * 0.7, thickness * 1.25, thickness * 0.5);
    fuller.translate(0, bladeStart + v.bladeLength * 0.4, curve * 0.2);
    addMesh(group, fuller, glowMaterial(v.runeColor, 2.4), false);
  }

  if (v.shape === 'gravecleaver') {
    // Heavy spine plates on the greatsword.
    const spine = roundedBox(v.bladeWidth * 0.5, v.bladeLength * 0.5, thickness * 2.2, thickness);
    spine.translate(0, bladeStart + v.bladeLength * 0.3, 0);
    addMesh(group, spine, surfaceMaterial({ color: '#2a2630', map: metal, metalness: 0.8, roughness: 0.45 }));
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
  const sh = new Shape();
  sh.moveTo(0, 0.32);
  sh.quadraticCurveTo(0.24, 0.3, 0.24, 0.1);
  sh.quadraticCurveTo(0.22, -0.2, 0, -0.4);
  sh.quadraticCurveTo(-0.22, -0.2, -0.24, 0.1);
  sh.quadraticCurveTo(-0.24, 0.3, 0, 0.32);
  const geo = new ExtrudeGeometry(sh, { depth: 0.02, bevelEnabled: true, bevelSize: 0.018, bevelThickness: 0.018, bevelSegments: seg(4, 2), curveSegments: seg(24, 8) });
  bulge(geo, 0.9, 0.35);
  const face = addMesh(group, geo, surfaceMaterial({ color, map: metalTexture(), metalness: 0.5, roughness: 0.6 }));
  face.position.z = -0.01;
  // Rounded metal rim following the outline.
  const outlinePts = sh.getPoints(seg(48, 16)).map((p) => new Vector3(p.x, p.y, 0.02 - (p.x * p.x * 0.9 + p.y * p.y * 0.35)));
  const rim = taperedTube(outlinePts, () => 0.014, 8, 64);
  addMesh(group, rim, surfaceMaterial({ color: trim, map: metalTexture(), metalness: 0.9, roughness: 0.35 }), false);
  const boss = new SphereGeometry(0.055, seg(20), seg(12), 0, Math.PI * 2, 0, Math.PI / 2);
  boss.rotateX(Math.PI / 2);
  boss.translate(0, 0.02, 0.03);
  addMesh(group, boss, surfaceMaterial({ color: emblem, metalness: 0.6, roughness: 0.4 }), false);
  group.rotation.set(0, Math.PI / 2, 0);
  group.position.set(0.05, 0.1, 0);
  return group;
}
