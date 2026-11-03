import {
  BoxGeometry,
  BufferGeometry,
  CapsuleGeometry,
  Color,
  ConeGeometry,
  CylinderGeometry,
  Euler,
  Group,
  Matrix4,
  Mesh,
  Object3D,
  Quaternion,
  SphereGeometry,
  TorusGeometry,
  Vector3,
  type Material,
} from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { JOINTS, JOINT_INDEX, type JointName } from '@/animation/Skeleton';
import type { Pose } from '@/animation/Pose';
import { glowMaterial, outlineMaterial, toonMaterial } from '@/render/Materials';
import { metalTexture } from '@/render/TextureFactory';

export type HelmetStyle = 'crowned' | 'sallet' | 'horned' | 'hood';
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
  hairStrands: number; // anime hair strands flowing from under the helm
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
}

/**
 * Procedural primitive humanoid: hierarchy of joints (Object3D) with rigid armour parts
 * merged per joint+material to keep draw calls low. Implements the same joint contract a
 * skinned glTF character would, so it can be swapped for authored art later.
 */
export class HumanoidRig {
  readonly root = new Group();
  readonly joints: Object3D[] = [];
  readonly weaponSocketR = new Object3D();
  readonly weaponSocketL = new Object3D();
  readonly capeAnchor = new Object3D();
  /** Height of the eyes (lock-on point, look-at). */
  readonly eyeHeight: number;
  readonly scale: number;
  private readonly restPos: Vector3[] = [];
  private readonly restQuat: Quaternion[] = [];
  private readonly parts = new Map<number, PartEntry[]>();
  private readonly outlineMeshes: Mesh[] = [];
  readonly meshes: Mesh[] = [];

  constructor(readonly look: HumanoidAppearance) {
    this.scale = look.height / 1.85;
    this.buildSkeleton();
    this.buildBody();
    this.flushParts();
    this.root.scale.setScalar(this.scale);
    this.eyeHeight = 1.7 * this.scale;
  }

  joint(name: JointName): Object3D {
    return this.joints[JOINT_INDEX[name]];
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
      const o = new Object3D();
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
    });
    // Weapon sockets: weapon local +Y continues the forearm line, cocked ~63° forward.
    this.weaponSocketR.position.set(0, -0.05, 0.015);
    this.weaponSocketR.rotation.set(Math.PI - 1.1, 0, 0);
    this.joint('handR').add(this.weaponSocketR);
    this.weaponSocketL.position.set(0.04, -0.04, 0.0);
    this.joint('handL').add(this.weaponSocketL);
    this.capeAnchor.position.set(0, L.chest - 0.02, -0.13);
    this.joint('chest').add(this.capeAnchor);
  }

  /** Queue a primitive for merging into a joint. */
  private add(
    joint: JointName,
    geo: BufferGeometry,
    mat: Material,
    pos: [number, number, number] = [0, 0, 0],
    rot: [number, number, number] = [0, 0, 0],
    scl: [number, number, number] = [1, 1, 1],
  ): void {
    const m = new Matrix4().compose(
      new Vector3(...pos),
      new Quaternion().setFromEuler(new Euler(...rot)),
      new Vector3(...scl),
    );
    const g = (geo.index ? geo.toNonIndexed() : geo.clone()).applyMatrix4(m);
    for (const name of Object.keys(g.attributes)) {
      if (name !== 'position' && name !== 'normal' && name !== 'uv') g.deleteAttribute(name);
    }
    const idx = JOINT_INDEX[joint];
    let list = this.parts.get(idx);
    if (!list) {
      list = [];
      this.parts.set(idx, list);
    }
    list.push({ geo: g, mat });
  }

  private flushParts(): void {
    for (const [idx, list] of this.parts) {
      const byMat = new Map<Material, BufferGeometry[]>();
      for (const p of list) {
        const arr = byMat.get(p.mat) ?? [];
        arr.push(p.geo);
        byMat.set(p.mat, arr);
      }
      for (const [mat, geos] of byMat) {
        const merged = mergeGeometries(geos, false);
        if (!merged) continue;
        merged.computeBoundingSphere();
        const mesh = new Mesh(merged, mat);
        const glows = (mat as { isMeshBasicMaterial?: boolean }).isMeshBasicMaterial;
        mesh.castShadow = !glows;
        mesh.receiveShadow = !glows;
        this.joints[idx].add(mesh);
        this.meshes.push(mesh);
        if (!glows) {
          const outline = new Mesh(merged, outlineMaterial());
          outline.castShadow = false;
          outline.receiveShadow = false;
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

  /** Write an animated pose onto the joint hierarchy. */
  applyPose(pose: Pose): void {
    for (let i = 0; i < this.joints.length; i++) {
      this.joints[i].quaternion.copy(this.restQuat[i]).multiply(pose.rot[i]);
    }
    const hips = this.joints[0];
    hips.position.copy(this.restPos[0]).add(pose.hips);
  }

  // ---------------------------------------------------------------------------------
  // Body construction
  // ---------------------------------------------------------------------------------
  private buildBody(): void {
    const p = this.look.palette;
    const b = this.look.bulk;
    const metal = metalTexture();
    const armor = toonMaterial({ color: p.armor, map: metal });
    const armorDark = toonMaterial({ color: p.armorDark });
    const trim = toonMaterial({ color: p.trim, map: metal, emissive: p.trim, emissiveIntensity: 0.08, rim: 1.3 });
    const cloth = toonMaterial({ color: p.cloth, doubleSide: true });
    const clothInner = toonMaterial({ color: p.clothInner, doubleSide: true });
    const skin = toonMaterial({ color: p.skin });
    const eye = glowMaterial(p.eyes, 3.2);
    const L = LIMB;

    // Pelvis + belt
    this.add('hips', new CapsuleGeometry(0.13, 0.08, 4, 10), armorDark, [0, 0.02, 0], [0, 0, Math.PI / 2], [1.05 * b, 1, 0.85]);
    this.add('hips', new TorusGeometry(0.155, 0.025, 6, 18), trim, [0, 0.07, 0], [Math.PI / 2, 0, 0], [b, 0.82, 1]);
    this.add('hips', new BoxGeometry(0.07, 0.06, 0.03), trim, [0, 0.07, 0.135]);

    // Abdomen + chest plate (tapered, anime V-torso)
    this.add('spine', new CylinderGeometry(0.115, 0.13, L.spine + 0.04, 12), armorDark, [0, L.spine / 2, 0], [0, 0, 0], [b, 1, 0.78]);
    this.add('chest', new CylinderGeometry(0.19, 0.125, L.chest, 12), armor, [0, L.chest / 2, 0.005], [0, 0, 0], [b, 1, 0.72]);
    // breastplate ridge + gold collar (gorget)
    this.add('chest', new BoxGeometry(0.03, L.chest * 0.8, 0.03), trim, [0, L.chest * 0.48, 0.135], [0.12, 0, Math.PI / 4]);
    this.add('chest', new TorusGeometry(0.105, 0.03, 6, 16), trim, [0, L.chest - 0.01, 0], [Math.PI / 2, 0, 0], [b, 0.85, 1]);
    this.add('chest', new CylinderGeometry(0.2, 0.19, 0.045, 12), trim, [0, L.chest * 0.18, 0], [0, 0, 0], [b * 0.66, 1, 0.5]);

    // Neck + head
    this.add('neck', new CylinderGeometry(0.05, 0.06, 0.12, 8), skin, [0, 0.03, 0]);
    this.buildHead(armor, armorDark, trim, cloth, eye, skin);

    // Arms
    for (const side of ['L', 'R'] as const) {
      const s = side === 'L' ? 1 : -1;
      const up = `upperArm${side}` as JointName;
      const fo = `foreArm${side}` as JointName;
      const ha = `hand${side}` as JointName;
      const sh = `shoulder${side}` as JointName;
      this.add(up, new CapsuleGeometry(0.052 * b, L.upperArm - 0.06, 4, 8), this.look.boneArms ? skin : armorDark, [0, -L.upperArm / 2, 0]);
      this.add(fo, new SphereGeometry(0.06, 10, 8), armor, [0, 0, 0]); // elbow cop
      if (this.look.boneArms) {
        this.add(fo, new CapsuleGeometry(0.032, L.foreArm - 0.05, 4, 8), skin, [0, -L.foreArm / 2, 0]);
        this.add(fo, new CylinderGeometry(0.05, 0.045, 0.08, 8), cloth, [0, -0.05, 0]);
      } else {
        this.add(fo, new CylinderGeometry(0.058 * b, 0.046 * b, L.foreArm - 0.02, 10), armor, [0, -L.foreArm / 2, 0]);
        this.add(fo, new TorusGeometry(0.058 * b, 0.012, 5, 12), trim, [0, -L.foreArm + 0.04, 0], [Math.PI / 2, 0, 0]);
        this.add(fo, new BoxGeometry(0.11 * b, 0.08, 0.1), armor, [0, -L.foreArm + 0.02, 0]); // flared cuff
      }
      this.add(ha, new BoxGeometry(0.075, 0.085, 0.09), this.look.boneArms ? skin : armorDark, [0, -0.04, 0.005]);
      this.add(ha, new BoxGeometry(0.03, 0.05, 0.05), armorDark, [0.03 * s, -0.03, 0.04]);
      this.buildPauldron(sh, s, armor, trim, cloth);
    }

    // Legs
    for (const side of ['L', 'R'] as const) {
      const th = `thigh${side}` as JointName;
      const sn = `shin${side}` as JointName;
      const ft = `foot${side}` as JointName;
      this.add(th, new CapsuleGeometry(0.075 * b, L.thigh - 0.1, 4, 10), armorDark, [0, -L.thigh / 2, 0]);
      this.add(sn, new SphereGeometry(0.066, 10, 8), armor, [0, 0, 0.025]); // knee cop
      this.add(sn, new ConeGeometry(0.05, 0.1, 6), trim, [0, 0.02, 0.07], [Math.PI / 2, 0, 0]);
      this.add(sn, new CylinderGeometry(0.066 * b, 0.05 * b, L.shin - 0.04, 10), armor, [0, -L.shin / 2, 0.005]);
      this.add(ft, new BoxGeometry(0.09, 0.07, 0.22), armorDark, [0, -0.04, 0.05]);
      this.add(ft, new ConeGeometry(0.045, 0.08, 4), armor, [0, -0.04, 0.18], [Math.PI / 2, Math.PI / 4, 0], [1, 1, 0.6]);
    }

    // Tassets / coat tails: panels attached to the thighs so they swing with stride.
    if (this.look.tassets) {
      for (const side of ['L', 'R'] as const) {
        const s = side === 'L' ? 1 : -1;
        const th = `thigh${side}` as JointName;
        this.add(th, new BoxGeometry(0.16, 0.34, 0.012), cloth, [0.02 * s, -0.16, 0.1], [-0.12, 0, 0.05 * s]);
        this.add(th, new BoxGeometry(0.17, 0.4, 0.012), clothInner, [0.03 * s, -0.19, -0.1], [0.14, 0, 0.05 * s]);
        this.add(th, new BoxGeometry(0.14, 0.14, 0.03), armor, [0.07 * s, 0.0, 0.0], [0, 0, 0.25 * s]);
        this.add(th, new BoxGeometry(0.15, 0.015, 0.015), trim, [0.02 * s, -0.33, 0.103], [-0.12, 0, 0.05 * s]);
      }
    }
  }

  private buildPauldron(joint: JointName, s: number, armor: Material, trim: Material, cloth: Material): void {
    const style = this.look.pauldrons;
    if (style === 'rags') {
      this.add(joint, new SphereGeometry(0.1, 10, 8, 0, Math.PI * 2, 0, Math.PI / 2), cloth, [0.05 * s, 0.0, 0], [0, 0, -0.3 * s], [1.1, 0.9, 1.1]);
      return;
    }
    // Layered plates with gold rims.
    for (let i = 0; i < 3; i++) {
      const r = 0.125 - i * 0.012;
      this.add(
        joint,
        new SphereGeometry(r, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2),
        armor,
        [0.065 * s, 0.04 - i * 0.05, 0],
        [0, 0, -0.45 * s - i * 0.12 * s],
        [1.05, 0.75, 1.1],
      );
      this.add(
        joint,
        new TorusGeometry(r, 0.01, 4, 16),
        trim,
        [0.065 * s + 0.0 * s, 0.04 - i * 0.05, 0],
        [Math.PI / 2, -0.45 * s - i * 0.12 * s, 0],
        [1.05, 1.1, 1],
      );
    }
    if (style === 'spiked') {
      this.add(joint, new ConeGeometry(0.03, 0.22, 6), trim, [0.1 * s, 0.14, -0.02], [0, 0, -0.5 * s]);
    } else {
      // Ornate swept fin.
      this.add(joint, new BoxGeometry(0.02, 0.16, 0.18), trim, [0.12 * s, 0.1, -0.01], [0.2, 0, -0.6 * s]);
    }
  }

  private buildHead(armor: Material, armorDark: Material, trim: Material, cloth: Material, eye: Material, skin: Material): void {
    const style = this.look.helmet;
    const hy = 0.12; // head centre above head joint
    this.add('head', new SphereGeometry(0.115, 16, 12), skin, [0, hy, 0.01], [0, 0, 0], [0.9, 1.08, 1]);
    // Eyes (always visible — glowing through visor/hood is the signature of the setting)
    const eyeGeo = new BoxGeometry(0.038, 0.013, 0.01);
    if (style === 'hood') {
      this.add('head', new SphereGeometry(0.15, 14, 10, 0, Math.PI * 2, 0, Math.PI * 0.62), cloth, [0, hy + 0.01, -0.01], [-0.25, 0, 0], [1, 1.15, 1.15]);
      this.add('head', new ConeGeometry(0.15, 0.32, 12, 1, true), cloth, [0, hy - 0.06, -0.06], [-0.35, 0, 0], [1, 1, 1]);
      this.add('head', new SphereGeometry(0.105, 12, 10), toonMaterial({ color: '#08060c', rim: 0 }), [0, hy - 0.005, 0.045], [0, 0, 0], [0.85, 0.95, 0.6]);
    } else {
      // Helm shell + face plate
      this.add('head', new SphereGeometry(0.135, 18, 14), armor, [0, hy + 0.012, -0.005], [0, 0, 0], [0.95, 1.1, 1.08]);
      this.add('head', new BoxGeometry(0.17, 0.1, 0.08), armorDark, [0, hy - 0.035, 0.085], [-0.1, 0, 0]);
      this.add('head', new BoxGeometry(0.2, 0.024, 0.05), toonMaterial({ color: '#050308', rim: 0 }), [0, hy + 0.012, 0.11]);
      this.add('head', new BoxGeometry(0.016, 0.16, 0.03), trim, [0, hy + 0.05, 0.128], [0.15, 0, 0]);
      if (style === 'crowned') {
        for (let i = 0; i < 7; i++) {
          const a = (i / 7) * Math.PI - Math.PI / 2;
          const len = i === 3 ? 0.13 : 0.08 - Math.abs(i - 3) * 0.008;
          this.add('head', new ConeGeometry(0.016, len, 4), trim, [Math.sin(a) * 0.12, hy + 0.12 + len / 2 - 0.02, Math.cos(a) * 0.06 + 0.02], [Math.cos(a) * 0.25 - 0.15, 0, -Math.sin(a) * 0.35]);
        }
        this.add('head', new TorusGeometry(0.125, 0.012, 5, 20), trim, [0, hy + 0.1, 0], [Math.PI / 2 + 0.15, 0, 0]);
      } else if (style === 'horned') {
        for (const s of [1, -1]) {
          this.add('head', new ConeGeometry(0.035, 0.32, 8), armorDark, [0.13 * s, hy + 0.12, -0.02], [-0.5, 0, -0.9 * s]);
          this.add('head', new ConeGeometry(0.022, 0.16, 8), trim, [0.26 * s, hy + 0.25, -0.1], [-0.9, 0, -0.2 * s]);
        }
      } else if (style === 'sallet') {
        this.add('head', new CylinderGeometry(0.16, 0.2, 0.05, 14, 1, true), armor, [0, hy - 0.04, -0.06], [-0.35, 0, 0]);
        this.add('head', new ConeGeometry(0.02, 0.12, 4), armorDark, [0, hy + 0.17, -0.03], [-0.4, 0, 0]);
      }
    }
    this.add('head', eyeGeo, eye, [0.042, hy + 0.012, 0.135], [0, 0, -0.12]);
    this.add('head', eyeGeo, eye, [-0.042, hy + 0.012, 0.135], [0, 0, 0.12]);

    // Long anime hair flowing from under the helm (stylised strands).
    const hairMat = this.look.palette.hair ? toonMaterial({ color: this.look.palette.hair, rim: 1.6 }) : null;
    if (hairMat) {
      const n = this.look.hairStrands;
      for (let i = 0; i < n; i++) {
        const f = n > 1 ? i / (n - 1) : 0.5;
        const a = (f - 0.5) * 2.2;
        const len = 0.42 + Math.sin(i * 1.7) * 0.06 + (1 - Math.abs(f - 0.5)) * 0.18;
        this.add(
          'head',
          new ConeGeometry(0.045, len, 5),
          hairMat,
          [Math.sin(a) * 0.1, hy - 0.04 - len / 2 + 0.06, -0.09 - Math.cos(a) * 0.03],
          [Math.PI + 0.25, 0, Math.sin(a) * 0.22],
          [1, 1, 0.45],
        );
      }
      // Front locks framing the face.
      for (const s of [1, -1]) {
        this.add('head', new ConeGeometry(0.03, 0.22, 4), hairMat, [0.1 * s, hy - 0.06, 0.07], [Math.PI - 0.1, 0, -0.12 * s], [1, 1, 0.5]);
      }
    }
  }

  /** Brightness of the eye glow (dims on death). */
  setEyeColor(color: string): void {
    for (const m of this.meshes) {
      const mat = m.material as { isMeshBasicMaterial?: boolean; color?: Color };
      if (mat.isMeshBasicMaterial && mat.color) {
        m.material = glowMaterial(color, 3.2);
      }
    }
  }
}
