/**
 * Canonical humanoid joint list shared by all humanoid rigs (player, soldiers, knights,
 * bosses). Poses and clips address joints by name, so a procedural primitive rig and a
 * future skinned glTF skeleton can be driven by the same animation data (a glTF rig only
 * needs a name map onto these joints).
 *
 * Rotation conventions (model faces +Z, its left side is +X):
 *  - limbs hang along -Y at rest; rotation.x < 0 swings a limb forward, > 0 backward;
 *  - left arm abducts (raises sideways) with +z, right arm with -z;
 *  - spine/chest/neck: +x bends forward, +y twists toward the character's left.
 */
export const JOINTS = [
  'hips',
  'spine',
  'chest',
  'neck',
  'head',
  'shoulderL',
  'upperArmL',
  'foreArmL',
  'handL',
  'shoulderR',
  'upperArmR',
  'foreArmR',
  'handR',
  'thighL',
  'shinL',
  'footL',
  'thighR',
  'shinR',
  'footR',
] as const;

export type JointName = (typeof JOINTS)[number];
export const JOINT_COUNT = JOINTS.length;
export const JOINT_INDEX: Record<JointName, number> = Object.fromEntries(JOINTS.map((j, i) => [j, i])) as Record<
  JointName,
  number
>;

export type Euler3 = readonly [number, number, number];

/** A pose: per-joint Euler rotations (radians) plus a hips translation offset. */
export interface PoseDef {
  joints: Partial<Record<JointName, Euler3>>;
  hips?: Euler3; // position offset of the hips (metres, model space)
}

export const UPPER_BODY_MASK: JointName[] = [
  'spine',
  'chest',
  'neck',
  'head',
  'shoulderL',
  'upperArmL',
  'foreArmL',
  'handL',
  'shoulderR',
  'upperArmR',
  'foreArmR',
  'handR',
];
export const LEFT_ARM_MASK: JointName[] = ['shoulderL', 'upperArmL', 'foreArmL', 'handL'];
