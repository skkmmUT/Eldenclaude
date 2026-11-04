import {
  Bone,
  BufferAttribute,
  BufferGeometry,
  CylinderGeometry,
  Euler,
  Group,
  Matrix4,
  Mesh,
  Object3D,
  Quaternion,
  Skeleton,
  SkinnedMesh,
  SphereGeometry,
  TorusGeometry,
  Vector3,
  type Material,
} from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { JOINTS, JOINT_INDEX, type JointName } from '@/animation/Skeleton';
import type { Pose } from '@/animation/Pose';
import { glowMaterial, outlineMaterial, surfaceMaterial } from '@/render/Materials';
import { metalTexture } from '@/render/TextureFactory';
import { GeometryDetail, lathe, roundedBox, seg, taperedTube } from '@/render/SmoothGeometry';

export type HelmetStyle = 'crowned' | 'sallet' | 'horned' | 'hood' | 'none';
export type PauldronStyle = 'ornate' | 'spiked' | 'rags';

/** Data-driven look of a humanoid; every enemy/NPC is a variation of this. */
export interface HumanoidAppearance {
  height: number; // metres (1.85 = player)
  bulk: number; // width multiplier (1 = athletic, 1.3 = brute)
  palette: {
    armor: string;
    armorDark: string;
    trim: string;
    cloth: string;
    clothInner: string;
    skin: string;
    eyes: string;
    hair?: string;
  };
  helmet: HelmetStyle;
  pauldrons: PauldronStyle;
  tassets: boolean;
  cape: boolean;
  hairStrands: number; // long flowing hair strands from under the helm
  hunch: number; // posture offset for undead (radians)
  boneArms?: boolean; // emaciated undead forearms
}

const LIMB = {
  thigh: 0.47,
  shin: 0.46,
  foot: 0.08,
  spine: 0.17,
  chest: 0.3,
  neck: 0.08,
  upperArm: 0.29,
  foreArm: 0.27,
};

interface PartEntry {
  geo: BufferGeometry;
  mat: Material;
  detail: boolean;
  low: boolean;
}

type V3 = [number, number, number];

/**
 * Procedural humanoid with a smooth, streamlined build:
 *  - a single skinned body (torso, neck, arms, legs) whose vertices blend between bones,
 *    so shoulders, elbows, hips and knees bend as one continuous surface;
 *  - rigid armour shaped from lathe profiles, curved plates and rounded boxes;
 *  - hair and horns as tapered spline strands.
 * Joints are `Bone`s implementing the canonical skeleton contract, so authored glTF
 * characters can later replace this without touching animation or combat code.
 * LOD: 0 = full, 1 = small details hidden, 2 = low-poly body as well.
 */
export class HumanoidRig {
  readonly root = new Group();
  readonly joints: Bone[] = [];
  readonly weaponSocketR = new Object3D();
  readonly weaponSocketL = new Object3D();
  readonly capeAnchor = new Object3D();
  readonly eyeHeight: number;
  readonly scale: number;
  readonly skeleton: Skeleton;
  private readonly restPos: Vector3[] = [];
  private readonly restQuat: Quaternion[] = [];
  /** Rest-pose model-space position of each joint (before root scale). */
  private readonly restWorld: Vector3[] = [];
  private readonly parts = new Map<number, PartEntry[]>();
  private readonly outlineMeshes: Mesh[] = [];
  private readonly detailMeshes: Mesh[] = [];
  private readonly highMeshes: Mesh[] = [];
  private readonly lowMeshes: Mesh[] = [];
  /** True while the low-detail armour set is being generated. */
  private buildingLow = false;
  readonly meshes: Mesh[] = [];
  readonly bodyHigh: SkinnedMesh;
  readonly bodyLow: SkinnedMesh;
  lod = 0;

  constructor(readonly look: HumanoidAppearance) {
    this.scale = look.height / 1.85;
    this.buildSkeleton();
    this.skeleton = new Skeleton(this.joints);
    const p = look.palette;
    const suit = surfaceMaterial({ color: p.armorDark, roughness: 0.62, metalness: 0.25, rim: 1 });
    this.bodyHigh = this.buildSkinnedBody(suit, 0.8);
    this.bodyLow = this.buildSkinnedBody(suit, 0.4);
    this.bodyLow.visible = false;
    // Two armour sets: smooth for close range, light-weight for distance (LOD 2).
    const base = GeometryDetail.value;
    GeometryDetail.value = base * 0.7;
    this.buildArmour();
    this.buildingLow = true;
    GeometryDetail.value = base * 0.28;
    this.buildArmour();
    this.buildingLow = false;
    GeometryDetail.value = base;
    this.flushParts();
    this.root.scale.setScalar(this.scale);
    this.eyeHeight = 1.7 * this.scale;
  }

  joint(name: JointName): Object3D {
    return this.joints[JOINT_INDEX[name]];
  }

  private w(name: JointName): Vector3 {
    return this.restWorld[JOINT_INDEX[name]];
  }

  private buildSkeleton(): void {
    const L = LIMB;
    const b = this.look.bulk;
    const hipY = L.thigh + L.shin + L.foot;
    const def: Record<JointName, [JointName | null, number, number, number]> = {
      hips: [null, 0, hipY, 0],
      spine: ['hips', 0, 0.1, 0],
      chest: ['spine', 0, L.spine, 0],
      neck: ['chest', 0, L.chest, 0],
      head: ['neck', 0, L.neck, 0],
      shoulderL: ['chest', 0.13 * b, L.chest - 0.05, 0],
      upperArmL: ['shoulderL', 0.06 * b, 0, 0],
      foreArmL: ['upperArmL', 0, -L.upperArm, 0],
      handL: ['foreArmL', 0, -L.foreArm, 0],
      shoulderR: ['chest', -0.13 * b, L.chest - 0.05, 0],
      upperArmR: ['shoulderR', -0.06 * b, 0, 0],
      foreArmR: ['upperArmR', 0, -L.upperArm, 0],
      handR: ['foreArmR', 0, -L.foreArm, 0],
      thighL: ['hips', 0.1 * b, -0.03, 0],
      shinL: ['thighL', 0, -L.thigh, 0],
      footL: ['shinL', 0, -L.shin, 0],
      thighR: ['hips', -0.1 * b, -0.03, 0],
      shinR: ['thighR', 0, -L.thigh, 0],
      footR: ['shinR', 0, -L.shin, 0],
    };
    for (const name of JOINTS) {
      const o = new Bone();
      o.name = name;
      this.joints.push(o);
    }
    JOINTS.forEach((name, i) => {
      const [parent, x, y, z] = def[name];
      const j = this.joints[i];
      j.position.set(x, y, z);
      (parent ? this.joints[JOINT_INDEX[parent]] : this.root).add(j);
      this.restPos.push(j.position.clone());
      this.restQuat.push(j.quaternion.clone());
      const pw = parent ? this.restWorld[JOINT_INDEX[parent]] : new Vector3();
      this.restWorld.push(pw.clone().add(new Vector3(x, y, z)));
    });
    this.weaponSocketR.position.set(0, -0.05, 0.015);
    this.weaponSocketR.rotation.set(Math.PI - 1.1, 0, 0);
    this.joint('handR').add(this.weaponSocketR);
    this.weaponSocketL.position.set(0.04, -0.04, 0.0);
    this.joint('handL').add(this.weaponSocketL);
    this.capeAnchor.position.set(0, L.chest - 0.02, -0.13);
    this.joint('chest').add(this.capeAnchor);
  }

  // ---------------------------------------------------------------------------------
  // Skinned body
  // ---------------------------------------------------------------------------------
  private buildSkinnedBody(material: Material, detail: number): SkinnedMesh {
    const b = this.look.bulk;
    const thin = this.look.boneArms ? 0.72 : 1;
    const q = (n: number) => Math.max(5, Math.round(n * detail));
    const savedDetail = GeometryDetail.value;
    GeometryDetail.value = 1; // body tessellation is controlled by `detail` directly
    const parts: Array<{ geo: BufferGeometry; bones: JointName[] }> = [];
    // Torso + neck: one surface of revolution with a V-shaped silhouette.
    const torso = lathe(
      [
        [0.0, 0.86],
        [0.105, 0.885],
        [0.15, 0.96],
        [0.152, 1.04],
        [0.128, 1.13],
        [0.123, 1.2],
        [0.148, 1.3],
        [0.168, 1.4],
        [0.163, 1.48],
        [0.118, 1.545],
        [0.058, 1.585],
        [0.05, 1.66],
        [0.0, 1.69],
      ],
      q(28),
      b,
      0.72,
    );
    parts.push({ geo: torso, bones: ['hips', 'spine', 'chest', 'neck', 'head', 'thighL', 'thighR', 'shoulderL', 'shoulderR'] });
    for (const side of ['L', 'R'] as const) {
      const s = side === 'L' ? 1 : -1;
      const sh = this.w(`upperArm${side}`);
      const el = this.w(`foreArm${side}`);
      const wr = this.w(`hand${side}`);
      const arm = taperedTube(
        [
          new Vector3(sh.x - 0.03 * s, sh.y + 0.035, 0),
          new Vector3(sh.x, sh.y - 0.08, 0),
          new Vector3(el.x, el.y, 0.006),
          new Vector3(wr.x, (el.y + wr.y) / 2, 0.01),
          new Vector3(wr.x, wr.y + 0.01, 0.008),
        ],
        (t) => {
          const k = [0.058, 0.055, 0.044, 0.047, 0.031][Math.min(4, Math.floor(t * 4))];
          const k2 = [0.055, 0.044, 0.047, 0.031, 0.026][Math.min(4, Math.floor(t * 4))];
          const f = t * 4 - Math.floor(t * 4);
          const r = k + (k2 - k) * (f * f * (3 - 2 * f));
          const cap = Math.min(1, t / 0.04, (1 - t) / 0.03);
          return r * (t < 0.5 ? 1 : thin) * Math.sqrt(Math.max(0, cap));
        },
        q(14),
        q(22),
      );
      parts.push({ geo: arm, bones: [`shoulder${side}`, `upperArm${side}`, `foreArm${side}`, `hand${side}`, 'chest'] as JointName[] });
      const hp = this.w(`thigh${side}`);
      const kn = this.w(`shin${side}`);
      const an = this.w(`foot${side}`);
      const leg = taperedTube(
        [
          new Vector3(hp.x * 0.9, hp.y + 0.07, -0.005),
          new Vector3(hp.x, hp.y - 0.12, 0.012),
          new Vector3(kn.x, kn.y, 0.02),
          new Vector3(kn.x, (kn.y + an.y) / 2 + 0.06, -0.012),
          new Vector3(an.x, an.y + 0.02, 0),
        ],
        (t) => {
          const prof = [0.098, 0.088, 0.058, 0.064, 0.043];
          const prof2 = [0.088, 0.058, 0.064, 0.043, 0.038];
          const i = Math.min(4, Math.floor(t * 4));
          const f = t * 4 - i;
          const r = prof[i] + (prof2[i] - prof[i]) * (f * f * (3 - 2 * f));
          const cap = Math.min(1, t / 0.03, (1 - t) / 0.03);
          return r * b * Math.sqrt(Math.max(0, cap));
        },
        q(14),
        q(24),
      );
      parts.push({ geo: leg, bones: ['hips', `thigh${side}`, `shin${side}`, `foot${side}`] as JointName[] });
    }
    const geos = parts.map((p) => {
      const g = p.geo.index ? p.geo.toNonIndexed() : p.geo;
      for (const n of Object.keys(g.attributes)) if (n !== 'position' && n !== 'normal' && n !== 'uv') g.deleteAttribute(n);
      this.assignWeights(g, p.bones);
      return g;
    });
    GeometryDetail.value = savedDetail;
    const geo = mergeGeometries(geos, false)!;
    const mesh = new SkinnedMesh(geo, material);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.frustumCulled = false;
    this.root.add(mesh);
    this.root.updateMatrixWorld(true);
    mesh.bind(this.skeleton);
    return mesh;
  }

  /** Bone segments (rest pose) used for envelope weighting. */
  private segment(name: JointName): [Vector3, Vector3, number] {
    const a = this.w(name);
    const child: Partial<Record<JointName, JointName>> = {
      hips: 'spine',
      spine: 'chest',
      chest: 'neck',
      neck: 'head',
      shoulderL: 'upperArmL',
      upperArmL: 'foreArmL',
      foreArmL: 'handL',
      shoulderR: 'upperArmR',
      upperArmR: 'foreArmR',
      foreArmR: 'handR',
      thighL: 'shinL',
      shinL: 'footL',
      thighR: 'shinR',
      shinR: 'footR',
    };
    const c = child[name];
    let e: Vector3;
    if (c) e = this.w(c);
    else if (name === 'head') e = a.clone().add(new Vector3(0, 0.2, 0));
    else if (name.startsWith('hand')) e = a.clone().add(new Vector3(0, -0.09, 0));
    else e = a.clone().add(new Vector3(0, -0.04, 0.16)); // feet
    if (name === 'hips') return [a.clone().add(new Vector3(0, -0.12, 0)), e, 0.16];
    const radius = name === 'chest' || name === 'spine' ? 0.17 : name.startsWith('shoulder') ? 0.07 : 0.07;
    return [a, e, radius];
  }

  /** Envelope skinning: weights from normalised distance to the allowed bones' segments. */
  private assignWeights(g: BufferGeometry, allowed: JointName[]): void {
    const pos = g.attributes.position;
    const n = pos.count;
    const skinIndex = new Uint16Array(n * 4);
    const skinWeight = new Float32Array(n * 4);
    const segs = allowed.map((name) => ({ idx: JOINT_INDEX[name], seg: this.segment(name) }));
    const v = new Vector3();
    const ab = new Vector3();
    const av = new Vector3();
    for (let i = 0; i < n; i++) {
      v.fromBufferAttribute(pos, i);
      const scored = segs.map(({ idx, seg: [a, e, r] }) => {
        ab.subVectors(e, a);
        av.subVectors(v, a);
        const t = Math.max(0, Math.min(1, av.dot(ab) / Math.max(1e-6, ab.lengthSq())));
        const d = av.sub(ab.multiplyScalar(t)).length();
        return { idx, w: 1 / Math.pow(d / r + 0.08, 5) };
      });
      scored.sort((x, y) => y.w - x.w);
      const top = scored.slice(0, 4);
      const sum = top.reduce((s, x) => s + x.w, 0);
      top.forEach((x, k) => {
        skinIndex[i * 4 + k] = x.idx;
        skinWeight[i * 4 + k] = x.w / sum;
      });
    }
    g.setAttribute('skinIndex', new BufferAttribute(skinIndex, 4));
    g.setAttribute('skinWeight', new BufferAttribute(skinWeight, 4));
  }

  // ---------------------------------------------------------------------------------
  // Rigid armour parts
  // ---------------------------------------------------------------------------------
  /** Queue a part (joint-local transform) for merging into that joint. */
  private add(joint: JointName, geo: BufferGeometry, mat: Material, pos: V3 = [0, 0, 0], rot: V3 = [0, 0, 0], scl: V3 = [1, 1, 1], detail = false): void {
    if (this.buildingLow && detail) return;
    const m = new Matrix4().compose(new Vector3(...pos), new Quaternion().setFromEuler(new Euler(...rot)), new Vector3(...scl));
    const g = (geo.index ? geo.toNonIndexed() : geo.clone()).applyMatrix4(m);
    for (const name of Object.keys(g.attributes)) {
      if (name !== 'position' && name !== 'normal' && name !== 'uv') g.deleteAttribute(name);
    }
    if (!g.attributes.uv) g.setAttribute('uv', new BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
    const idx = JOINT_INDEX[joint];
    let list = this.parts.get(idx);
    if (!list) {
      list = [];
      this.parts.set(idx, list);
    }
    list.push({ geo: g, mat, detail, low: this.buildingLow });
  }

  /** Add a part given in rest model space (converted to the joint's local space). */
  private addWorld(joint: JointName, geo: BufferGeometry, mat: Material, detail = false): void {
    const o = this.w(joint);
    this.add(joint, geo, mat, [-o.x, -o.y, -o.z], [0, 0, 0], [1, 1, 1], detail);
  }

  private flushParts(): void {
    for (const [idx, list] of this.parts) {
      const groups = new Map<string, { mat: Material; detail: boolean; low: boolean; geos: BufferGeometry[] }>();
      for (const p of list) {
        const key = `${p.mat.uuid}|${p.detail}|${p.low}`;
        const gr = groups.get(key) ?? { mat: p.mat, detail: p.detail, low: p.low, geos: [] };
        gr.geos.push(p.geo);
        groups.set(key, gr);
      }
      for (const { mat, detail, low, geos } of groups.values()) {
        const merged = mergeGeometries(geos, false);
        if (!merged) continue;
        merged.computeBoundingSphere();
        const mesh = new Mesh(merged, mat);
        const glows = (mat as { isMeshBasicMaterial?: boolean }).isMeshBasicMaterial;
        mesh.castShadow = !glows && !detail;
        mesh.receiveShadow = !glows;
        this.joints[idx].add(mesh);
        this.meshes.push(mesh);
        if (detail) this.detailMeshes.push(mesh);
        (low ? this.lowMeshes : this.highMeshes).push(mesh);
        if (low) mesh.visible = false;
        if (!glows && !low) {
          const outline = new Mesh(merged, outlineMaterial());
          outline.visible = false;
          this.joints[idx].add(outline);
          this.outlineMeshes.push(outline);
        }
      }
    }
    this.parts.clear();
  }

  setOutlines(visible: boolean): void {
    for (const m of this.outlineMeshes) m.visible = visible;
  }

  /** 0 = full detail, 1 = hide small details, 2 = also use the low-poly body. */
  setLod(level: number): void {
    if (level === this.lod) return;
    this.lod = level;
    for (const m of this.highMeshes) m.visible = level < 2;
    for (const m of this.detailMeshes) m.visible = level === 0;
    for (const m of this.lowMeshes) m.visible = level === 2;
    this.bodyHigh.visible = level === 0;
    this.bodyLow.visible = level > 0;
  }

  applyPose(pose: Pose): void {
    for (let i = 0; i < this.joints.length; i++) {
      this.joints[i].quaternion.copy(this.restQuat[i]).multiply(pose.rot[i]);
    }
    this.joints[0].position.copy(this.restPos[0]).add(pose.hips);
  }

  /** CPU-skinned copy of the high-detail body in its current pose (for static statues). */
  bakeBody(): BufferGeometry {
    this.root.updateMatrixWorld(true);
    const src = this.bodyHigh;
    const g = src.geometry.clone();
    const pos = g.attributes.position;
    const v = new Vector3();
    for (let i = 0; i < pos.count; i++) {
      v.fromBufferAttribute(pos, i);
      src.applyBoneTransform(i, v);
      pos.setXYZ(i, v.x, v.y, v.z);
    }
    g.deleteAttribute('skinIndex');
    g.deleteAttribute('skinWeight');
    g.computeVertexNormals();
    return g;
  }

  private buildArmour(): void {
    const p = this.look.palette;
    const b = this.look.bulk;
    const metal = metalTexture();
    const armor = surfaceMaterial({ color: p.armor, map: metal, metalness: 0.7, roughness: 0.38, rim: 1 });
    const armorDark = surfaceMaterial({ color: p.armorDark, metalness: 0.45, roughness: 0.55, rim: 1 });
    const trim = surfaceMaterial({ color: p.trim, map: metal, metalness: 0.95, roughness: 0.28, rim: 1 });
    const cloth = surfaceMaterial({ color: p.cloth, roughness: 0.95, doubleSide: true, rim: 1 });
    const clothInner = surfaceMaterial({ color: p.clothInner, roughness: 0.95, doubleSide: true });
    const skin = surfaceMaterial({ color: p.skin, roughness: 0.6, rim: 1 });
    const eye = glowMaterial(p.eyes, 3.2);
    const L = LIMB;
    const ring = (r: number, tube: number, sx = 1, sz = 1) => new TorusGeometry(r, tube, seg(8, 5), seg(32, 12)).rotateX(Math.PI / 2).scale(sx, 1, sz);

    // Breastplate: a smooth shell following the torso, rigid on the chest.
    const breast = lathe(
      [
        [0.13, 1.27],
        [0.152, 1.32],
        [0.176, 1.4],
        [0.172, 1.47],
        [0.13, 1.535],
        [0.075, 1.565],
      ],
      28,
      b * 1.04,
      0.78,
    );
    this.addWorld('chest', breast, armor);
    // Abdomen plates (faulds) layered over the spine.
    for (let i = 0; i < 3; i++) {
      const y0 = 1.11 + i * 0.055;
      this.addWorld('spine', lathe([[0.138 - i * 0.004, y0], [0.142 - i * 0.004, y0 + 0.03], [0.136 - i * 0.004, y0 + 0.06]], 24, b * 1.03, 0.78), i % 2 ? armorDark : armor);
    }
    // Gorget, sternum ridge, gold rims.
    this.addWorld('chest', ring(0.098, 0.026, b, 0.85).translate(0, 1.565, 0), trim);
    this.addWorld('chest', ring(0.172, 0.012, b * 1.04, 0.78).translate(0, 1.34, 0), trim, true);
    this.addWorld('chest', taperedTube([new Vector3(0, 1.3, 0.13), new Vector3(0, 1.42, 0.138), new Vector3(0, 1.53, 0.11)], (t) => 0.014 * (1 - Math.abs(t - 0.5)), 6, 10), trim, true);
    // Belt and buckle.
    this.addWorld('hips', ring(0.152, 0.022, b, 0.8).translate(0, 1.075, 0), trim);
    this.add('hips', roundedBox(0.075, 0.06, 0.03, 0.012), trim, [0, 0.065, 0.122]);

    // Neck & head
    this.buildHead(armor, armorDark, trim, cloth, eye, skin);

    // Arms: rounded pauldrons, smooth vambraces, gauntlets.
    for (const side of ['L', 'R'] as const) {
      const s = side === 'L' ? 1 : -1;
      const fo = `foreArm${side}` as JointName;
      const ha = `hand${side}` as JointName;
      const sh = `shoulder${side}` as JointName;
      this.add(fo, new SphereGeometry(0.058, seg(16), seg(12)), armor, [0, 0, -0.004], [0, 0, 0], [1, 0.9, 1.05]);
      if (!this.look.boneArms) {
        this.add(fo, lathe([[0.04, -L.foreArm + 0.02], [0.052, -L.foreArm + 0.05], [0.056, -0.15], [0.054, -0.05], [0.05, -0.02]], 20, b, b), armor);
        this.add(fo, ring(0.052, 0.009, b, b), trim, [0, -L.foreArm + 0.05, 0], [0, 0, 0], [1, 1, 1], true);
      } else {
        this.add(fo, lathe([[0.048, -0.1], [0.052, -0.06], [0.05, -0.02]], 16), cloth);
      }
      this.add(ha, roundedBox(0.072, 0.085, 0.088, 0.026), this.look.boneArms ? skin : armorDark, [0, -0.042, 0.005]);
      this.add(ha, roundedBox(0.03, 0.05, 0.05, 0.012), armorDark, [0.028 * s, -0.03, 0.04]);
      this.buildPauldron(sh, s, armor, trim, cloth);
    }

    // Legs: knee cops, smooth greaves, boots.
    for (const side of ['L', 'R'] as const) {
      const s = side === 'L' ? 1 : -1;
      const th = `thigh${side}` as JointName;
      const sn = `shin${side}` as JointName;
      const ft = `foot${side}` as JointName;
      this.add(th, lathe([[0.086, -0.42], [0.094, -0.3], [0.098, -0.16], [0.092, -0.05]], 22, b, 0.92 * b), armorDark, [0, 0, 0.004]);
      this.add(sn, new SphereGeometry(0.064, seg(16), seg(12)), armor, [0, 0.005, 0.03], [0, 0, 0], [1, 1.05, 0.95]);
      this.add(sn, taperedTube([new Vector3(0, 0.05, 0.08), new Vector3(0, 0.0, 0.098), new Vector3(0, -0.06, 0.085)], (t) => 0.02 * Math.sin(Math.PI * t) + 0.004, 8, 10), trim, [0, 0, 0], [0, 0, 0], [1, 1, 1], true);
      this.add(sn, lathe([[0.046, -L.shin + 0.04], [0.06, -L.shin + 0.14], [0.07, -0.2], [0.068, -0.08], [0.062, -0.03]], 22, b, b * 1.02), armor, [0, 0, 0.006]);
      // Boot: rounded sole + tapered toe cap.
      this.add(ft, roundedBox(0.092, 0.07, 0.2, 0.03), armorDark, [0, -0.04, 0.045]);
      this.add(ft, taperedTube([new Vector3(0, -0.045, 0.1), new Vector3(0, -0.05, 0.16), new Vector3(0, -0.058, 0.205)], (t) => 0.044 * (1 - t * 0.75), 12, 8, 0.7), armor);
      // Tassets: curved plates on the thighs (swing with the stride).
      if (this.look.tassets) {
        const plate = (h: number, r: number, start: number, len: number) => new CylinderGeometry(r, r * 1.12, h, seg(14), 1, true, start, len);
        this.add(th, plate(0.36, 0.115 * b, -0.75, 1.5), cloth, [0.012 * s, -0.16, 0], [0, 0, 0.06 * s]);
        this.add(th, plate(0.42, 0.122 * b, Math.PI - 0.8, 1.6), clothInner, [0.012 * s, -0.19, 0], [0, 0, 0.06 * s]);
        this.add(th, plate(0.14, 0.108 * b, s > 0 ? 0.6 : -2.1, 1.5), armor, [0, -0.02, 0], [0, 0, 0.05 * s]);
        this.add(th, new TorusGeometry(0.117 * b, 0.007, 5, seg(18), 1.5).rotateX(Math.PI / 2).rotateY(0.75), trim, [0.012 * s, -0.335, 0], [0, 0, 0], [1, 1, 1], true);
      }
    }
  }

  private buildPauldron(joint: JointName, s: number, armor: Material, trim: Material, cloth: Material): void {
    const style = this.look.pauldrons;
    if (style === 'rags') {
      this.add(joint, new SphereGeometry(0.1, seg(18), seg(10), 0, Math.PI * 2, 0, Math.PI / 2), cloth, [0.05 * s, 0.0, 0], [0, 0, -0.3 * s], [1.15, 0.9, 1.15]);
      return;
    }
    for (let i = 0; i < 3; i++) {
      const r = 0.125 - i * 0.012;
      const rot: V3 = [0, 0, -0.45 * s - i * 0.12 * s];
      const pos: V3 = [0.065 * s, 0.04 - i * 0.05, 0];
      this.add(joint, new SphereGeometry(r, seg(28), seg(12), 0, Math.PI * 2, 0, Math.PI / 2), armor, pos, rot, [1.05, 0.72, 1.1]);
      this.add(joint, new TorusGeometry(r, 0.011, seg(6, 4), seg(32)).rotateX(Math.PI / 2), trim, pos, rot, [1.05, 1, 1.1], i > 0);
    }
    if (style === 'spiked') {
      this.add(joint, taperedTube([new Vector3(0.08 * s, 0.07, -0.02), new Vector3(0.13 * s, 0.17, -0.03), new Vector3(0.2 * s, 0.24, -0.06)], (t) => 0.032 * (1 - t), 10, 10), trim);
    } else {
      // Ornate swept fin: a curved, tapered blade of gold.
      this.add(joint, taperedTube([new Vector3(0.1 * s, 0.05, 0.06), new Vector3(0.14 * s, 0.13, -0.01), new Vector3(0.16 * s, 0.2, -0.1)], (t) => 0.04 * Math.sin(Math.PI * (0.15 + t * 0.85)), 10, 12, 0.22), trim);
    }
  }

  private buildHead(armor: Material, armorDark: Material, trim: Material, cloth: Material, eye: Material, skin: Material): void {
    const style = this.look.helmet;
    const hy = 0.12;
    this.add('head', new SphereGeometry(0.115, seg(28), seg(20)), skin, [0, hy, 0.01], [0, 0, 0], [0.9, 1.08, 1]);
    const eyeGeo = new SphereGeometry(1, 16, 8).scale(0.021, 0.0085, 0.006);
    if (style === 'none') {
      // Bare head: the hair carries the silhouette.
    } else if (style === 'hood') {
      this.add('head', new SphereGeometry(0.15, seg(28), seg(16), 0, Math.PI * 2, 0, Math.PI * 0.62), cloth, [0, hy + 0.01, -0.01], [-0.25, 0, 0], [1, 1.15, 1.15]);
      this.add('head', lathe([[0.17, -0.18], [0.155, -0.06], [0.13, 0.04]], 24), cloth, [0, hy - 0.02, -0.06], [-0.35, 0, 0]);
      this.add('head', new SphereGeometry(0.105, seg(20), seg(14)), surfaceMaterial({ color: '#08060c', roughness: 1 }), [0, hy - 0.005, 0.045], [0, 0, 0], [0.85, 0.95, 0.6]);
    } else {
      // Helm: smooth shell, rounded face plate, visor slit and crest.
      this.add('head', new SphereGeometry(0.135, seg(32), seg(24)), armor, [0, hy + 0.012, -0.005], [0, 0, 0], [0.95, 1.1, 1.08]);
      this.add('head', new SphereGeometry(0.11, seg(28), seg(16), -Math.PI * 0.42, Math.PI * 0.84, Math.PI * 0.42, Math.PI * 0.42), armorDark, [0, hy - 0.002, 0.012], [0, 0, 0], [0.95, 1.1, 1.18]);
      this.add('head', roundedBox(0.19, 0.026, 0.05, 0.011), surfaceMaterial({ color: '#050308', roughness: 1 }), [0, hy + 0.012, 0.128]);
      this.add('head', taperedTube([new Vector3(0, hy - 0.06, 0.13), new Vector3(0, hy + 0.05, 0.148), new Vector3(0, hy + 0.15, 0.08), new Vector3(0, hy + 0.17, -0.04)], (t) => 0.011 * (1 - t * 0.5), 8, 16), trim, [0, 0, 0], [0, 0, 0], [1, 1, 1], true);
      if (style === 'crowned') {
        for (let i = 0; i < 7; i++) {
          const a = (i / 7) * Math.PI - Math.PI / 2;
          const len = i === 3 ? 0.13 : 0.08 - Math.abs(i - 3) * 0.008;
          const base = new Vector3(Math.sin(a) * 0.12, hy + 0.1, Math.cos(a) * 0.06 + 0.015);
          const out = new Vector3(Math.sin(a) * 0.03, len, Math.cos(a) * 0.015 - 0.02);
          this.add('head', taperedTube([base, base.clone().addScaledVector(out, 0.5), base.clone().add(out)], (t) => 0.016 * (1 - t), 8, 8), trim);
        }
        this.add('head', new TorusGeometry(0.125, 0.012, seg(8, 5), seg(36)), trim, [0, hy + 0.1, 0], [Math.PI / 2 + 0.15, 0, 0]);
      } else if (style === 'horned') {
        for (const s of [1, -1]) {
          this.add('head', taperedTube([new Vector3(0.11 * s, hy + 0.08, -0.01), new Vector3(0.2 * s, hy + 0.15, -0.04), new Vector3(0.26 * s, hy + 0.27, -0.1), new Vector3(0.24 * s, hy + 0.38, -0.2)], (t) => 0.036 * (1 - t * 0.92), 12, 18), armorDark);
        }
      } else if (style === 'sallet') {
        this.add('head', lathe([[0.2, -0.03], [0.17, 0.0], [0.15, 0.03]], 32, 1, 1.05), armor, [0, hy - 0.04, -0.05], [-0.35, 0, 0]);
        this.add('head', taperedTube([new Vector3(0, hy + 0.12, 0.05), new Vector3(0, hy + 0.17, -0.03), new Vector3(0, hy + 0.15, -0.12)], (t) => 0.012 * (1 - t * 0.6), 8, 10), armorDark, [0, 0, 0], [0, 0, 0], [1, 1, 1], true);
      }
    }
    const ez = style === 'hood' || style === 'none' ? 0.122 : 0.156;
    this.add('head', eyeGeo, eye, [0.042, hy + 0.012, ez], [0, 0, -0.12]);
    this.add('head', eyeGeo, eye, [-0.042, hy + 0.012, ez], [0, 0, 0.12]);

    // Flowing hair: tapered, slightly flattened strands that curve down the back.
    const hairCol = this.look.palette.hair;
    if (hairCol) {
      const hairMat = surfaceMaterial({ color: hairCol, roughness: 0.45, rim: 1.5 });
      const n = this.look.hairStrands;
      for (let i = 0; i < n; i++) {
        const f = n > 1 ? i / (n - 1) : 0.5;
        const a = (f - 0.5) * 2.2;
        const len = 0.44 + Math.sin(i * 1.7) * 0.06 + (1 - Math.abs(f - 0.5)) * 0.2;
        const x = Math.sin(a) * 0.1;
        const z = -0.08 - Math.cos(a) * 0.03;
        const pts = [
          new Vector3(x * 0.8, hy + 0.06, z + 0.02),
          new Vector3(x * 1.1, hy - 0.06, z - 0.05),
          new Vector3(x * 1.25, hy - 0.06 - len * 0.5, z - 0.08),
          new Vector3(x * 1.35 + Math.sin(i * 2.3) * 0.02, hy - 0.06 - len, z - 0.05),
        ];
        this.add('head', taperedTube(pts, (t) => 0.036 * Math.pow(1 - t, 0.8) + 0.002, 8, 14, 0.45), hairMat, [0, 0, 0], [0, 0, 0], [1, 1, 1], i % 2 === 1);
      }
      for (const s of [1, -1]) {
        this.add('head', taperedTube([new Vector3(0.085 * s, hy + 0.04, 0.07), new Vector3(0.105 * s, hy - 0.06, 0.08), new Vector3(0.1 * s, hy - 0.17, 0.06)], (t) => 0.022 * (1 - t) + 0.002, 8, 10, 0.5), hairMat);
      }
    }
  }

  /** Swap the eye glow colour. */
  setEyeColor(color: string): void {
    for (const m of this.meshes) {
      const mat = m.material as { isMeshBasicMaterial?: boolean };
      if (mat.isMeshBasicMaterial) m.material = glowMaterial(color, 3.2);
    }
  }
}
