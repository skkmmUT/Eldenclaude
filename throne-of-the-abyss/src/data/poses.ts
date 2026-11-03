import type { Euler3, JointName, PoseDef } from '@/animation/Skeleton';

/**
 * Hand-authored key poses (radians). Conventions are documented in animation/Skeleton.ts:
 * limbs: -x swings forward; shins: +x bends the knee; forearms: -x bends the elbow;
 * spine/chest: +x bends forward, +y twists to the character's left; arms abduct with
 * +z (left) / -z (right).
 */
type J = Partial<Record<JointName, Euler3>>;
const P = (joints: J, hips?: Euler3): PoseDef => ({ joints, hips });

/** Mirror a pose left↔right (swap sides, negate y/z rotations, negate hips x offset). */
export function mirrorPose(p: PoseDef): PoseDef {
  const out: J = {};
  for (const [k, v] of Object.entries(p.joints) as Array<[JointName, Euler3]>) {
    let name = k as string;
    if (name.endsWith('L')) name = name.slice(0, -1) + 'R';
    else if (name.endsWith('R')) name = name.slice(0, -1) + 'L';
    out[name as JointName] = [v[0], -v[1], -v[2]];
  }
  return { joints: out, hips: p.hips ? [-p.hips[0], p.hips[1], p.hips[2]] : undefined };
}

/** Merge poses: later ones override joints of earlier ones. */
export function mergePose(...poses: PoseDef[]): PoseDef {
  const joints: J = {};
  let hips: Euler3 | undefined;
  for (const p of poses) {
    Object.assign(joints, p.joints);
    if (p.hips) hips = p.hips;
  }
  return { joints, hips };
}

// ---------------------------------------------------------------------------------
// Stances
// ---------------------------------------------------------------------------------
const LEGS_READY: J = {
  thighL: [-0.28, 0, 0.07],
  shinL: [0.38, 0, 0],
  footL: [-0.1, 0, 0],
  thighR: [0.18, 0, -0.09],
  shinR: [0.32, 0, 0],
  footR: [-0.5, 0, 0],
};

export const POSES = {
  rest: P({}),

  combatIdle: P(
    {
      spine: [0.08, 0.12, 0],
      chest: [0.06, 0.08, 0],
      neck: [-0.05, -0.1, 0],
      head: [-0.06, -0.08, 0],
      upperArmR: [-0.3, 0.1, -0.22],
      foreArmR: [-0.85, 0, 0],
      handR: [0.25, 0.0, 0.1],
      upperArmL: [-0.15, 0, 0.28],
      foreArmL: [-0.55, 0, 0],
      handL: [0, 0, 0.1],
      ...LEGS_READY,
    },
    [0, -0.04, 0],
  ),

  idleBreath: P(
    {
      spine: [0.1, 0.12, 0],
      chest: [0.03, 0.08, 0],
      neck: [-0.05, -0.1, 0],
      head: [-0.04, -0.08, 0],
      upperArmR: [-0.28, 0.1, -0.25],
      foreArmR: [-0.9, 0, 0],
      handR: [0.25, 0.0, 0.1],
      upperArmL: [-0.12, 0, 0.3],
      foreArmL: [-0.6, 0, 0],
      handL: [0, 0, 0.1],
      ...LEGS_READY,
    },
    [0, -0.055, 0],
  ),

  /** Undead soldier hunch with shield raised loosely. */
  soldierIdle: P(
    {
      spine: [0.22, 0.1, 0],
      chest: [0.12, 0.1, 0],
      neck: [-0.15, -0.1, 0],
      head: [-0.1, -0.1, 0.1],
      upperArmR: [-0.2, 0.1, -0.2],
      foreArmR: [-0.7, 0, 0],
      handR: [0.3, 0, 0.1],
      upperArmL: [-0.55, 0, 0.18],
      foreArmL: [-1.25, 0, 0],
      handL: [0, 0, 0],
      ...LEGS_READY,
    },
    [0, -0.06, 0],
  ),

  // ---------------------------------------------------------------------------------
  // Locomotion cycle keys (contact / passing); mirrored for the second half.
  // ---------------------------------------------------------------------------------
  walkContact: P(
    {
      spine: [0.05, 0.08, 0],
      chest: [0.02, -0.12, 0],
      upperArmR: [-0.32, 0, -0.12],
      foreArmR: [-0.6, 0, 0],
      handR: [0.25, 0, 0],
      upperArmL: [0.28, 0, 0.12],
      foreArmL: [-0.35, 0, 0],
      thighL: [-0.42, 0, 0.03],
      shinL: [0.08, 0, 0],
      footL: [-0.12, 0, 0],
      thighR: [0.32, 0, -0.03],
      shinR: [0.25, 0, 0],
      footR: [0.25, 0, 0],
    },
    [0, -0.03, 0],
  ),
  walkPass: P(
    {
      spine: [0.05, 0, 0],
      chest: [0.02, 0, 0],
      upperArmR: [-0.05, 0, -0.12],
      foreArmR: [-0.55, 0, 0],
      handR: [0.25, 0, 0],
      upperArmL: [0.02, 0, 0.12],
      foreArmL: [-0.3, 0, 0],
      thighL: [0.05, 0, 0.03],
      shinL: [0.05, 0, 0],
      footL: [-0.1, 0, 0],
      thighR: [-0.35, 0, -0.03],
      shinR: [0.75, 0, 0],
      footR: [-0.2, 0, 0],
    },
    [0, 0.0, 0],
  ),
  runContact: P(
    {
      spine: [0.22, 0.12, 0],
      chest: [0.06, -0.22, 0],
      head: [-0.18, 0.1, 0],
      upperArmR: [-0.65, 0, -0.18],
      foreArmR: [-1.25, 0, 0],
      handR: [0.3, 0, 0],
      upperArmL: [0.55, 0, 0.18],
      foreArmL: [-1.2, 0, 0],
      thighL: [-0.75, 0, 0.03],
      shinL: [0.3, 0, 0],
      footL: [-0.1, 0, 0],
      thighR: [0.5, 0, -0.03],
      shinR: [0.9, 0, 0],
      footR: [0.3, 0, 0],
    },
    [0, -0.07, 0],
  ),
  runPass: P(
    {
      spine: [0.22, 0, 0],
      chest: [0.06, 0, 0],
      head: [-0.18, 0, 0],
      upperArmR: [-0.1, 0, -0.18],
      foreArmR: [-1.3, 0, 0],
      handR: [0.3, 0, 0],
      upperArmL: [0.05, 0, 0.18],
      foreArmL: [-1.25, 0, 0],
      thighL: [-0.05, 0, 0.03],
      shinL: [0.25, 0, 0],
      footL: [-0.1, 0, 0],
      thighR: [-0.55, 0, -0.03],
      shinR: [1.6, 0, 0],
      footR: [-0.1, 0, 0],
    },
    [0, 0.04, 0],
  ),
  sprintContact: P(
    {
      spine: [0.42, 0.12, 0],
      chest: [0.1, -0.25, 0],
      head: [-0.38, 0.1, 0],
      upperArmR: [-0.2, 0, -0.35],
      foreArmR: [-0.6, 0, 0],
      handR: [1.3, 0, 0],
      upperArmL: [0.85, 0, 0.25],
      foreArmL: [-1.3, 0, 0],
      thighL: [-0.95, 0, 0.03],
      shinL: [0.35, 0, 0],
      footL: [-0.1, 0, 0],
      thighR: [0.65, 0, -0.03],
      shinR: [1.1, 0, 0],
      footR: [0.4, 0, 0],
    },
    [0, -0.09, 0],
  ),
  sprintPass: P(
    {
      spine: [0.42, 0, 0],
      chest: [0.1, 0, 0],
      head: [-0.38, 0, 0],
      upperArmR: [0.25, 0, -0.35],
      foreArmR: [-0.6, 0, 0],
      handR: [1.3, 0, 0],
      upperArmL: [-0.4, 0, 0.25],
      foreArmL: [-1.3, 0, 0],
      thighL: [-0.1, 0, 0.03],
      shinL: [0.3, 0, 0],
      footL: [-0.1, 0, 0],
      thighR: [-0.75, 0, -0.03],
      shinR: [1.9, 0, 0],
      footR: [-0.1, 0, 0],
    },
    [0, 0.05, 0],
  ),

  // ---------------------------------------------------------------------------------
  // Air
  // ---------------------------------------------------------------------------------
  jumpRise: P(
    {
      spine: [0.12, 0, 0],
      upperArmR: [-0.6, 0, -0.5],
      foreArmR: [-0.9, 0, 0],
      upperArmL: [-0.4, 0, 0.6],
      foreArmL: [-0.6, 0, 0],
      thighL: [-1.1, 0, 0.05],
      shinL: [1.5, 0, 0],
      footL: [0.3, 0, 0],
      thighR: [-0.3, 0, -0.05],
      shinR: [0.9, 0, 0],
      footR: [0.4, 0, 0],
    },
    [0, 0.05, 0],
  ),
  fall: P(
    {
      spine: [0.05, 0, 0],
      upperArmR: [-0.3, 0, -0.9],
      foreArmR: [-0.6, 0, 0],
      upperArmL: [-0.2, 0, 0.9],
      foreArmL: [-0.4, 0, 0],
      thighL: [-0.5, 0, 0.08],
      shinL: [0.6, 0, 0],
      thighR: [0.1, 0, -0.08],
      shinR: [0.4, 0, 0],
    },
    [0, 0, 0],
  ),
  landCrouch: P(
    {
      spine: [0.45, 0, 0],
      chest: [0.15, 0, 0],
      head: [-0.4, 0, 0],
      upperArmR: [-0.4, 0, -0.5],
      foreArmR: [-0.7, 0, 0],
      upperArmL: [-0.3, 0, 0.6],
      foreArmL: [-0.5, 0, 0],
      thighL: [-1.0, 0, 0.1],
      shinL: [1.5, 0, 0],
      footL: [-0.5, 0, 0],
      thighR: [-0.5, 0, -0.1],
      shinR: [1.5, 0, 0],
      footR: [-1.0, 0, 0],
    },
    [0, -0.32, 0],
  ),

  // ---------------------------------------------------------------------------------
  // Evasion
  // ---------------------------------------------------------------------------------
  rollTuck: P(
    {
      spine: [0.8, 0, 0],
      chest: [0.4, 0, 0],
      head: [0.5, 0, 0],
      upperArmR: [-1.2, 0, -0.2],
      foreArmR: [-1.4, 0, 0],
      upperArmL: [-1.1, 0, 0.2],
      foreArmL: [-1.5, 0, 0],
      thighL: [-1.9, 0, 0.05],
      shinL: [2.2, 0, 0],
      footL: [0.4, 0, 0],
      thighR: [-1.7, 0, -0.05],
      shinR: [2.2, 0, 0],
      footR: [0.4, 0, 0],
    },
    [0, -0.4, 0],
  ),
  backstep: P(
    {
      spine: [0.35, 0, 0],
      chest: [0.1, 0, 0],
      head: [-0.25, 0, 0],
      upperArmR: [0.25, 0, -0.5],
      foreArmR: [-0.6, 0, 0],
      upperArmL: [0.2, 0, 0.6],
      foreArmL: [-0.5, 0, 0],
      thighL: [-0.6, 0, 0.05],
      shinL: [0.9, 0, 0],
      footL: [0.2, 0, 0],
      thighR: [-0.1, 0, -0.05],
      shinR: [0.7, 0, 0],
      footR: [0.4, 0, 0],
    },
    [0, -0.05, 0.1],
  ),

  // ---------------------------------------------------------------------------------
  // Defense
  // ---------------------------------------------------------------------------------
  guardSword: P({
    spine: [0.12, 0.25, 0],
    chest: [0.08, 0.2, 0],
    head: [-0.05, -0.35, 0],
    upperArmR: [-1.05, 0.2, -0.35],
    foreArmR: [-1.25, 0, 0],
    handR: [0.2, 1.3, 0.55],
    upperArmL: [-0.95, -0.2, 0.15],
    foreArmL: [-1.5, 0, 0],
    handL: [0, 0, 0],
  }),
  guardShield: P({
    spine: [0.15, 0.1, 0],
    chest: [0.08, 0.1, 0],
    head: [0.0, -0.1, 0],
    upperArmL: [-0.95, 0.1, 0.25],
    foreArmL: [-1.45, 0, 0],
    handL: [0, 0.3, 0],
    upperArmR: [-0.35, 0.1, -0.3],
    foreArmR: [-1.0, 0, 0],
    handR: [0.4, 0, 0.1],
  }),
  parryWind: P({
    spine: [0.1, 0.4, 0],
    chest: [0.05, 0.3, 0],
    upperArmL: [-1.2, 0.3, -0.35],
    foreArmL: [-1.5, 0, 0],
    handL: [0.2, 0, 0],
    upperArmR: [-0.2, 0, -0.35],
    foreArmR: [-0.9, 0, 0],
  }),
  parryStrike: P({
    spine: [0.12, -0.35, 0],
    chest: [0.06, -0.3, 0],
    upperArmL: [-1.15, -0.6, 0.9],
    foreArmL: [-0.4, 0, 0],
    handL: [-0.3, 0, 0.3],
    upperArmR: [-0.2, 0, -0.4],
    foreArmR: [-0.9, 0, 0],
  }),

  // ---------------------------------------------------------------------------------
  // Reactions
  // ---------------------------------------------------------------------------------
  hitLight: P(
    {
      spine: [-0.25, -0.15, 0.05],
      chest: [-0.15, -0.1, 0],
      head: [-0.25, 0.15, 0],
      upperArmR: [-0.1, 0, -0.55],
      foreArmR: [-0.6, 0, 0],
      upperArmL: [0.1, 0, 0.55],
      foreArmL: [-0.5, 0, 0],
      thighL: [-0.3, 0, 0.07],
      shinL: [0.5, 0, 0],
      thighR: [0.3, 0, -0.09],
      shinR: [0.35, 0, 0],
    },
    [0, -0.06, -0.06],
  ),
  hitHeavy: P(
    {
      spine: [-0.45, 0.2, 0.1],
      chest: [-0.25, 0.1, 0],
      head: [-0.45, 0, 0],
      upperArmR: [-0.6, 0, -1.1],
      foreArmR: [-0.4, 0, 0],
      upperArmL: [-0.5, 0, 1.0],
      foreArmL: [-0.4, 0, 0],
      thighL: [-0.6, 0, 0.1],
      shinL: [0.9, 0, 0],
      thighR: [0.4, 0, -0.1],
      shinR: [0.6, 0, 0],
    },
    [0, -0.14, -0.1],
  ),
  staggered: P(
    {
      spine: [0.5, 0.2, 0.1],
      chest: [0.2, 0.1, 0],
      head: [0.4, 0.1, 0.2],
      upperArmR: [0.3, 0, -0.3],
      foreArmR: [-0.3, 0, 0],
      upperArmL: [0.2, 0, 0.35],
      foreArmL: [-0.3, 0, 0],
      thighL: [-0.6, 0, 0.12],
      shinL: [1.1, 0, 0],
      thighR: [-0.1, 0, -0.12],
      shinR: [0.9, 0, 0],
    },
    [0, -0.22, 0],
  ),
  guardBroken: P(
    {
      spine: [-0.4, 0.0, 0],
      chest: [-0.2, 0, 0],
      head: [-0.35, 0, 0],
      upperArmR: [-2.2, 0, -0.8],
      foreArmR: [-0.4, 0, 0],
      upperArmL: [-2.1, 0, 0.8],
      foreArmL: [-0.4, 0, 0],
      thighL: [-0.4, 0, 0.1],
      shinL: [0.6, 0, 0],
      thighR: [0.35, 0, -0.1],
      shinR: [0.4, 0, 0],
    },
    [0, -0.08, -0.12],
  ),
  knockdownAir: P(
    {
      hips: [-0.9, 0, 0],
      spine: [-0.2, 0, 0],
      head: [0.3, 0, 0],
      upperArmR: [-1.4, 0, -0.9],
      upperArmL: [-1.4, 0, 0.9],
      thighL: [-1.0, 0, 0.1],
      shinL: [0.8, 0, 0],
      thighR: [-0.7, 0, -0.1],
      shinR: [0.6, 0, 0],
    },
    [0, -0.35, -0.4],
  ),
  knockdownLie: P(
    {
      hips: [-1.52, 0, 0],
      spine: [-0.05, 0, 0],
      head: [0.25, 0.3, 0],
      upperArmR: [-0.3, 0, -0.9],
      foreArmR: [-0.3, 0, 0],
      upperArmL: [-0.2, 0, 0.8],
      foreArmL: [-0.3, 0, 0],
      thighL: [-0.3, 0, 0.12],
      shinL: [0.6, 0, 0],
      thighR: [0.0, 0, -0.1],
      shinR: [0.2, 0, 0],
    },
    [0, -0.86, -0.75],
  ),
  getUpKneel: P(
    {
      spine: [0.6, 0, 0],
      head: [-0.2, 0, 0],
      upperArmR: [-0.6, 0, -0.3],
      foreArmR: [-0.5, 0, 0],
      upperArmL: [-0.8, 0, 0.3],
      foreArmL: [-0.4, 0, 0],
      thighL: [-1.5, 0, 0.1],
      shinL: [1.5, 0, 0],
      footL: [0.0, 0, 0],
      thighR: [-0.05, 0, -0.1],
      shinR: [1.6, 0, 0],
      footR: [0.3, 0, 0],
    },
    [0, -0.45, 0],
  ),
  kneelRest: P(
    {
      spine: [0.3, 0, 0],
      chest: [0.1, 0, 0],
      head: [0.45, 0, 0],
      upperArmR: [-0.9, 0.3, -0.05],
      foreArmR: [-0.5, 0, 0],
      handR: [1.2, 0, 0],
      upperArmL: [-0.5, 0, 0.1],
      foreArmL: [-0.9, 0, 0],
      thighL: [-1.45, 0, 0.12],
      shinL: [1.45, 0, 0],
      footL: [0.0, 0, 0],
      thighR: [0.0, 0, -0.08],
      shinR: [1.55, 0, 0],
      footR: [0.6, 0, 0],
    },
    [0, -0.46, 0],
  ),
  deathKneel: P(
    {
      spine: [0.5, 0.1, 0.1],
      chest: [0.3, 0, 0],
      head: [0.6, 0, 0.2],
      upperArmR: [0.1, 0, -0.1],
      foreArmR: [-0.2, 0, 0],
      upperArmL: [0.1, 0, 0.15],
      foreArmL: [-0.2, 0, 0],
      thighL: [-0.1, 0, 0.12],
      shinL: [1.55, 0, 0],
      footL: [0.6, 0, 0],
      thighR: [-0.05, 0, -0.12],
      shinR: [1.6, 0, 0],
      footR: [0.6, 0, 0],
    },
    [0, -0.46, 0],
  ),
  deathProne: P(
    {
      hips: [1.48, 0, 0.1],
      spine: [0.05, 0.2, 0],
      head: [-0.2, 0.9, 0],
      upperArmR: [-2.6, 0, -0.4],
      foreArmR: [-0.3, 0, 0],
      upperArmL: [-0.4, 0, 0.6],
      foreArmL: [-0.4, 0, 0],
      thighL: [0.05, 0, 0.12],
      shinL: [0.2, 0, 0],
      footL: [1.2, 0, 0],
      thighR: [0.0, 0, -0.1],
      shinR: [0.3, 0, 0],
      footR: [1.2, 0, 0],
    },
    [0, -0.86, 0.6],
  ),

  // ---------------------------------------------------------------------------------
  // Items & magic
  // ---------------------------------------------------------------------------------
  drinkLift: P({
    spine: [0.0, 0.1, 0],
    head: [-0.1, 0, 0],
    upperArmL: [-1.2, -0.3, -0.1],
    foreArmL: [-2.0, 0, 0],
    handL: [0.4, 0, 0],
    upperArmR: [-0.2, 0.1, -0.3],
    foreArmR: [-0.8, 0, 0],
    ...LEGS_READY,
  }),
  drinkTip: P({
    spine: [-0.12, 0.1, 0],
    chest: [-0.1, 0, 0],
    head: [-0.45, 0, 0],
    upperArmL: [-1.65, -0.3, -0.15],
    foreArmL: [-2.3, 0, 0],
    handL: [0.2, 0, 0],
    upperArmR: [-0.2, 0.1, -0.3],
    foreArmR: [-0.8, 0, 0],
    ...LEGS_READY,
  }),
  castGather: P(
    {
      spine: [0.05, 0.45, 0],
      chest: [0.0, 0.3, 0],
      head: [0.0, -0.6, 0],
      upperArmL: [0.2, 0.0, 0.25],
      foreArmL: [-1.6, 0, 0],
      handL: [-0.4, 0, 0],
      upperArmR: [-0.2, 0.1, -0.35],
      foreArmR: [-0.9, 0, 0],
      ...LEGS_READY,
    },
    [0, -0.08, -0.05],
  ),
  castRelease: P(
    {
      spine: [0.12, -0.35, 0],
      chest: [0.06, -0.25, 0],
      head: [-0.05, 0.45, 0],
      upperArmL: [-1.5, -0.25, 0.0],
      foreArmL: [-0.1, 0, 0],
      handL: [-0.9, 0, 0],
      upperArmR: [0.15, 0.1, -0.45],
      foreArmR: [-0.7, 0, 0],
      thighL: [-0.55, 0, 0.07],
      shinL: [0.55, 0, 0],
      footL: [0.0, 0, 0],
      thighR: [0.35, 0, -0.09],
      shinR: [0.25, 0, 0],
      footR: [-0.6, 0, 0],
    },
    [0, -0.1, 0.1],
  ),
  castSkyward: P(
    {
      spine: [-0.15, 0, 0],
      chest: [-0.15, 0, 0],
      head: [-0.5, 0, 0],
      upperArmL: [-2.8, 0, 0.35],
      foreArmL: [-0.2, 0, 0],
      handL: [-0.4, 0, 0],
      upperArmR: [-2.6, 0, -0.35],
      foreArmR: [-0.3, 0, 0],
      ...LEGS_READY,
    },
    [0, -0.04, 0],
  ),
} satisfies Record<string, PoseDef>;

export type PoseName = keyof typeof POSES;
