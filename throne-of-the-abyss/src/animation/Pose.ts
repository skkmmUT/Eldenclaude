import { Euler, Quaternion, Vector3 } from 'three';
import { JOINTS, JOINT_COUNT, type PoseDef } from './Skeleton';

const tmpEuler = new Euler();
const tmpQuat = new Quaternion();

/** Runtime pose buffer: one quaternion per joint + hips offset. */
export class Pose {
  readonly rot: Quaternion[] = [];
  readonly hips = new Vector3();

  constructor() {
    for (let i = 0; i < JOINT_COUNT; i++) this.rot.push(new Quaternion());
  }

  static fromDef(def: PoseDef): Pose {
    const p = new Pose();
    JOINTS.forEach((j, i) => {
      const e = def.joints[j];
      if (e) p.rot[i].setFromEuler(tmpEuler.set(e[0], e[1], e[2], 'XYZ'));
    });
    if (def.hips) p.hips.set(def.hips[0], def.hips[1], def.hips[2]);
    return p;
  }

  copy(o: Pose): this {
    for (let i = 0; i < JOINT_COUNT; i++) this.rot[i].copy(o.rot[i]);
    this.hips.copy(o.hips);
    return this;
  }

  identity(): this {
    for (const q of this.rot) q.identity();
    this.hips.set(0, 0, 0);
    return this;
  }

  /** this = lerp(a, b, t) */
  blend(a: Pose, b: Pose, t: number): this {
    for (let i = 0; i < JOINT_COUNT; i++) this.rot[i].slerpQuaternions(a.rot[i], b.rot[i], t);
    this.hips.lerpVectors(a.hips, b.hips, t);
    return this;
  }

  /** Blend `other` into this pose with weight t, only for joint indices in `mask`. */
  blendMasked(other: Pose, t: number, mask: number[] | null): this {
    if (!mask) {
      for (let i = 0; i < JOINT_COUNT; i++) this.rot[i].slerp(other.rot[i], t);
      this.hips.lerp(other.hips, t);
      return this;
    }
    for (const i of mask) this.rot[i].slerp(other.rot[i], t);
    return this;
  }

  /** Apply an additive rotation offset (e.g. flinch, lean) on one joint. */
  addEuler(index: number, x: number, y: number, z: number, weight = 1): void {
    if (weight <= 0) return;
    tmpQuat.setFromEuler(tmpEuler.set(x * weight, y * weight, z * weight, 'XYZ'));
    this.rot[index].multiply(tmpQuat);
  }
}
