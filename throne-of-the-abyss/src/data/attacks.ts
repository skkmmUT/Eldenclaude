import { frames } from '@/core/MathUtils';
import type { AttackData } from '@/combat/AttackData';
import type { PoseDef } from '@/animation/Skeleton';
import { POSES, mergePose } from './poses';

/**
 * Movesets. Each weapon class references attacks by id. Enemy attacks live in the same
 * table — they are just data with different timing, tracking and telegraphs.
 */
const P = (joints: PoseDef['joints'], hips?: PoseDef['hips']): PoseDef => ({ joints, hips });
const LEGS_LUNGE: PoseDef['joints'] = {
  thighL: [-0.75, 0, 0.08],
  shinL: [0.65, 0, 0],
  footL: [0.1, 0, 0],
  thighR: [0.45, 0, -0.1],
  shinR: [0.35, 0, 0],
  footR: [-0.75, 0, 0],
};
const LEGS_SET: PoseDef['joints'] = {
  thighL: [-0.35, 0, 0.08],
  shinL: [0.45, 0, 0],
  footL: [-0.1, 0, 0],
  thighR: [0.25, 0, -0.1],
  shinR: [0.3, 0, 0],
  footR: [-0.55, 0, 0],
};

// ---- One-handed sword key poses ---------------------------------------------------
const SLASH_A_WIND = P(
  {
    spine: [0.0, -0.55, 0],
    chest: [-0.05, -0.45, 0.1],
    head: [0, 0.75, 0],
    upperArmR: [-2.5, 0.0, -0.75],
    foreArmR: [-0.9, 0, 0],
    handR: [0.4, 0, 0],
    upperArmL: [-0.5, 0, 0.5],
    foreArmL: [-0.8, 0, 0],
    ...LEGS_SET,
  },
  [0, -0.05, -0.05],
);
const SLASH_A_END = P(
  {
    spine: [0.3, 0.55, 0],
    chest: [0.15, 0.4, -0.1],
    head: [-0.2, -0.7, 0],
    upperArmR: [-0.7, 0.3, 0.45],
    foreArmR: [-0.2, 0, 0],
    handR: [0.6, 0, 0],
    upperArmL: [0.3, 0, 0.6],
    foreArmL: [-0.6, 0, 0],
    ...LEGS_LUNGE,
  },
  [0, -0.12, 0.12],
);
const SLASH_B_WIND = P(
  {
    spine: [0.2, 0.6, 0],
    chest: [0.1, 0.4, 0],
    head: [-0.1, -0.8, 0],
    upperArmR: [-0.5, 0.4, 0.55],
    foreArmR: [-0.5, 0, 0],
    handR: [0.9, -0.4, 0],
    upperArmL: [0.2, 0, 0.6],
    foreArmL: [-0.6, 0, 0],
    ...LEGS_LUNGE,
  },
  [0, -0.1, 0.08],
);
const SLASH_B_END = P(
  {
    spine: [0.05, -0.55, 0],
    chest: [-0.05, -0.45, 0.1],
    head: [0, 0.75, 0],
    upperArmR: [-1.7, -0.3, -1.1],
    foreArmR: [-0.2, 0, 0],
    handR: [0.2, -0.6, 0],
    upperArmL: [-0.3, 0, 0.55],
    foreArmL: [-0.8, 0, 0],
    ...LEGS_SET,
  },
  [0, -0.06, 0.18],
);

// Impact poses: arm extended forward with the blade aligned to the forearm — this is
// where the swing meets the target (end of the active window). The *_END poses are the
// follow-through reached during recovery.
const SLASH_A_STRIKE = P(
  {
    spine: [0.22, 0.3, 0],
    chest: [0.12, 0.22, -0.05],
    head: [-0.15, -0.45, 0],
    upperArmR: [-1.45, 0.25, 0.12],
    foreArmR: [-0.08, 0, 0],
    handR: [1.15, 0, -0.35],
    upperArmL: [0.25, 0, 0.55],
    foreArmL: [-0.6, 0, 0],
    ...LEGS_LUNGE,
  },
  [0, -0.1, 0.12],
);
const SLASH_A_FOLLOW = SLASH_A_END;
const SLASH_B_STRIKE = P(
  {
    spine: [0.15, -0.08, 0],
    chest: [0.06, -0.05, 0.05],
    head: [-0.05, 0.15, 0],
    upperArmR: [-1.45, 0.1, 0.0],
    foreArmR: [-0.08, 0, 0],
    handR: [1.1, -0.3, 0.2],
    upperArmL: [-0.2, 0, 0.55],
    foreArmL: [-0.8, 0, 0],
    ...LEGS_SET,
  },
  [0, -0.08, 0.16],
);
const SLASH_B_FOLLOW = SLASH_B_END;
const THRUST_WIND = P(
  {
    spine: [0.05, -0.6, 0],
    chest: [0.0, -0.4, 0],
    head: [0, 0.8, 0],
    upperArmR: [0.4, 0.2, -0.35],
    foreArmR: [-1.9, 0, 0],
    handR: [1.25, 0, 0],
    upperArmL: [-0.9, 0, 0.3],
    foreArmL: [-0.8, 0, 0],
    ...LEGS_SET,
  },
  [0, -0.1, -0.08],
);
const THRUST_STRIKE = P(
  {
    spine: [0.3, 0.35, 0],
    chest: [0.15, 0.25, 0],
    head: [-0.3, -0.5, 0],
    upperArmR: [-1.45, 0.15, -0.05],
    foreArmR: [-0.05, 0, 0],
    handR: [1.1, 0, 0],
    upperArmL: [0.4, 0, 0.5],
    foreArmL: [-0.5, 0, 0],
    ...LEGS_LUNGE,
  },
  [0, -0.16, 0.2],
);
const OVERHEAD_WIND = P(
  {
    spine: [-0.25, -0.15, 0],
    chest: [-0.2, -0.1, 0],
    head: [0.25, 0.2, 0],
    upperArmR: [-2.85, 0.0, -0.2],
    foreArmR: [-1.1, 0, 0],
    handR: [0.2, 0, 0],
    upperArmL: [-2.6, 0, 0.35],
    foreArmL: [-1.3, 0, 0],
    ...LEGS_SET,
  },
  [0, 0.02, -0.1],
);
const OVERHEAD_STRIKE = P(
  {
    spine: [0.55, 0.05, 0],
    chest: [0.25, 0.0, 0],
    head: [-0.5, 0, 0],
    upperArmR: [-1.1, 0.0, 0.05],
    foreArmR: [-0.1, 0, 0],
    handR: [0.95, 0, 0],
    upperArmL: [-1.0, 0, -0.25],
    foreArmL: [-0.4, 0, 0],
    ...LEGS_LUNGE,
  },
  [0, -0.28, 0.22],
);
const OVERHEAD_FOLLOW = P(
  {
    spine: [0.6, 0.05, 0],
    chest: [0.25, 0.0, 0],
    head: [-0.5, 0, 0],
    upperArmR: [-0.85, 0.0, 0.05],
    foreArmR: [-0.2, 0, 0],
    handR: [0.75, 0, 0],
    upperArmL: [-0.8, 0, -0.25],
    foreArmL: [-0.4, 0, 0],
    ...LEGS_LUNGE,
  },
  [0, -0.28, 0.22],
);
const PLUNGE_WIND = P(
  {
    spine: [-0.1, 0, 0],
    upperArmR: [-2.9, 0, -0.1],
    foreArmR: [-0.5, 0, 0],
    handR: [-1.6, 0, 0],
    upperArmL: [-2.7, 0, 0.3],
    foreArmL: [-0.8, 0, 0],
    thighL: [-1.2, 0, 0.1],
    shinL: [1.6, 0, 0],
    thighR: [-0.4, 0, -0.1],
    shinR: [1.2, 0, 0],
  },
  [0, 0.05, 0],
);
const PLUNGE_STRIKE = P(
  {
    spine: [0.7, 0, 0],
    chest: [0.3, 0, 0],
    head: [-0.6, 0, 0],
    upperArmR: [-0.9, 0, 0.1],
    foreArmR: [-0.3, 0, 0],
    handR: [-1.0, 0, 0],
    upperArmL: [-0.8, 0, -0.3],
    foreArmL: [-0.4, 0, 0],
    thighL: [-1.4, 0, 0.12],
    shinL: [1.9, 0, 0],
    footL: [-0.5, 0, 0],
    thighR: [-0.3, 0, -0.1],
    shinR: [1.9, 0, 0],
    footR: [-1.0, 0, 0],
  },
  [0, -0.45, 0.15],
);
const SWEEP_WIND = P(
  {
    spine: [0.1, -0.8, 0],
    chest: [0.0, -0.6, 0],
    head: [0, 1.0, 0],
    upperArmR: [-0.4, 0.0, -1.35],
    foreArmR: [-0.6, 0, 0],
    handR: [0.4, 1.4, 0],
    upperArmL: [-1.0, 0.6, -0.4],
    foreArmL: [-1.0, 0, 0],
    ...LEGS_SET,
  },
  [0, -0.12, -0.05],
);
const SWEEP_STRIKE = P(
  {
    spine: [0.2, 0.75, 0],
    chest: [0.1, 0.55, 0],
    head: [-0.1, -0.9, 0],
    upperArmR: [-1.35, 0.5, 0.4],
    foreArmR: [-0.1, 0, 0],
    handR: [0.6, 1.4, 0],
    upperArmL: [-0.6, 0, 0.8],
    foreArmL: [-0.6, 0, 0],
    ...LEGS_LUNGE,
  },
  [0, -0.18, 0.1],
);
const SWEEP_FOLLOW = mergePose(SWEEP_STRIKE, P({ spine: [0.2, 0.9, 0], upperArmR: [-1.1, 0.6, 0.6] }, [0, -0.16, 0.1]));
const RIPOSTE_STAB = P(
  {
    spine: [0.35, 0.2, 0],
    chest: [0.15, 0.1, 0],
    head: [-0.3, -0.2, 0],
    upperArmR: [-1.2, 0.1, -0.05],
    foreArmR: [-0.4, 0, 0],
    handR: [1.3, 0, 0],
    upperArmL: [-1.0, 0, -0.2],
    foreArmL: [-0.9, 0, 0],
    ...LEGS_LUNGE,
  },
  [0, -0.18, 0.15],
);
const RIPOSTE_RIP = P(
  {
    spine: [0.1, -0.6, 0],
    chest: [0.0, -0.5, 0],
    head: [0, 0.6, 0],
    upperArmR: [-0.6, 0.2, -1.1],
    foreArmR: [-0.4, 0, 0],
    handR: [0.4, 0, 0],
    upperArmL: [-0.2, 0, 0.6],
    foreArmL: [-0.6, 0, 0],
    ...LEGS_SET,
  },
  [0, -0.08, 0.1],
);
const SHIELD_BASH_WIND = P(
  {
    spine: [0.1, 0.5, 0],
    chest: [0.05, 0.4, 0],
    upperArmL: [0.2, 0, 0.5],
    foreArmL: [-1.6, 0, 0],
    upperArmR: [-0.2, 0, -0.4],
    foreArmR: [-0.8, 0, 0],
    ...LEGS_SET,
  },
  [0, -0.08, -0.05],
);
const SHIELD_BASH_STRIKE = P(
  {
    spine: [0.35, -0.4, 0],
    chest: [0.1, -0.3, 0],
    upperArmL: [-1.4, -0.3, 0.1],
    foreArmL: [-0.9, 0, 0],
    upperArmR: [0.2, 0, -0.5],
    foreArmR: [-0.6, 0, 0],
    ...LEGS_LUNGE,
  },
  [0, -0.15, 0.25],
);

const base = {
  comboWindow: undefined,
  hyperArmor: false,
  parryable: true,
  knockback: 0.4,
  hitStop: 0.07,
  shake: 0.22,
  tracking: 6,
  reaction: 'flinch' as const,
  trail: '#d9c9ff',
  sound: 'swing' as const,
};

function atk(a: Partial<AttackData> & Pick<AttackData, 'id' | 'kind' | 'windup' | 'strike' | 'follow' | 'startup' | 'active' | 'recovery'>): AttackData {
  return {
    ...base,
    staminaCost: 18,
    motionValue: 1,
    poiseDamage: 12,
    guardDamage: 20,
    lunge: 0.4,
    dodgeCancel: a.startup + a.active + frames(8),
    ...a,
  };
}

export const ATTACKS: Record<string, AttackData> = {};
const reg = (...list: AttackData[]) => list.forEach((a) => (ATTACKS[a.id] = a));

// ===== Straight sword (Heir's Longsword) =============================================
reg(
  atk({
    id: 'ss_light1', kind: 'light', windup: SLASH_A_WIND, strike: SLASH_A_STRIKE, follow: SLASH_A_FOLLOW,
    startup: frames(11), active: frames(6), recovery: frames(20), staminaCost: 17, motionValue: 1.0,
    lunge: 0.55, next: 'ss_light2', comboWindow: [frames(13), frames(37)],
  }),
  atk({
    id: 'ss_light2', kind: 'light', windup: SLASH_B_WIND, strike: SLASH_B_STRIKE, follow: SLASH_B_FOLLOW,
    startup: frames(9), active: frames(6), recovery: frames(20), staminaCost: 17, motionValue: 1.05,
    lunge: 0.5, next: 'ss_light3', comboWindow: [frames(11), frames(35)],
  }),
  atk({
    id: 'ss_light3', kind: 'light', windup: THRUST_WIND, strike: THRUST_STRIKE, follow: THRUST_STRIKE,
    startup: frames(13), active: frames(6), recovery: frames(24), staminaCost: 20, motionValue: 1.25,
    poiseDamage: 16, lunge: 1.1, next: 'ss_light1', comboWindow: [frames(16), frames(43)], sound: 'thrust',
  }),
  atk({
    id: 'ss_heavy', kind: 'heavy', windup: OVERHEAD_WIND, strike: OVERHEAD_STRIKE, follow: OVERHEAD_FOLLOW,
    startup: frames(24), active: frames(7), recovery: frames(28), staminaCost: 30, motionValue: 1.6,
    poiseDamage: 32, guardDamage: 45, lunge: 0.7, hyperArmor: true, reaction: 'stagger', hitStop: 0.11, shake: 0.4,
    sound: 'heavy', trail: '#ffd27a',
  }),
  atk({
    id: 'ss_charged', kind: 'charged', windup: OVERHEAD_WIND, strike: OVERHEAD_STRIKE, follow: OVERHEAD_FOLLOW,
    startup: frames(14), active: frames(7), recovery: frames(30), staminaCost: 38, motionValue: 2.35,
    poiseDamage: 48, guardDamage: 70, lunge: 0.9, hyperArmor: true, reaction: 'knockdown', hitStop: 0.16, shake: 0.65,
    sound: 'heavy', trail: '#ffb347', shockwave: { radius: 1.6, forward: 1.5, damageScale: 0.35 },
  }),
  atk({
    id: 'ss_running', kind: 'running', windup: SWEEP_WIND, strike: SWEEP_STRIKE, follow: SWEEP_FOLLOW,
    startup: frames(12), active: frames(8), recovery: frames(24), staminaCost: 22, motionValue: 1.2,
    poiseDamage: 20, lunge: 2.0, tracking: 3,
  }),
  atk({
    id: 'ss_roll', kind: 'roll', windup: THRUST_WIND, strike: THRUST_STRIKE, follow: THRUST_STRIKE,
    startup: frames(9), active: frames(6), recovery: frames(20), staminaCost: 17, motionValue: 0.95,
    lunge: 0.9, sound: 'thrust',
  }),
  atk({
    id: 'ss_jump', kind: 'jump', windup: OVERHEAD_WIND, strike: OVERHEAD_STRIKE, follow: OVERHEAD_FOLLOW,
    startup: frames(10), active: frames(40), recovery: frames(22), staminaCost: 24, motionValue: 1.35,
    poiseDamage: 28, lunge: 0, reaction: 'stagger', hitStop: 0.1, shake: 0.35, sound: 'heavy',
  }),
  atk({
    id: 'ss_plunge', kind: 'plunge', windup: PLUNGE_WIND, strike: PLUNGE_STRIKE, follow: PLUNGE_STRIKE,
    startup: frames(6), active: frames(120), recovery: frames(30), staminaCost: 0, motionValue: 2.6,
    poiseDamage: 70, lunge: 0, reaction: 'knockdown', hitStop: 0.18, shake: 0.85, parryable: false,
    shockwave: { radius: 2.4, forward: 0.4, damageScale: 0.6 }, sound: 'heavy', trail: '#c58bff',
  }),
  atk({
    id: 'critical_stab', kind: 'critical', windup: THRUST_WIND, strike: RIPOSTE_STAB, follow: RIPOSTE_RIP,
    startup: frames(16), active: frames(4), recovery: frames(46), staminaCost: 0, motionValue: 3.0,
    poiseDamage: 0, lunge: 0.3, hitStop: 0.2, shake: 0.6, parryable: false, tracking: 0,
  }),
);

// ===== Greatsword (Gravecleaver) =======================================================
reg(
  atk({
    id: 'gs_light1', kind: 'light', windup: SWEEP_WIND, strike: SWEEP_STRIKE, follow: SWEEP_FOLLOW,
    startup: frames(19), active: frames(8), recovery: frames(28), staminaCost: 26, motionValue: 1.0,
    poiseDamage: 26, guardDamage: 40, lunge: 0.6, next: 'gs_light2', comboWindow: [frames(22), frames(52)],
    hyperArmor: true, reaction: 'stagger', hitStop: 0.1, shake: 0.38, sound: 'heavy',
  }),
  atk({
    id: 'gs_light2', kind: 'light', windup: OVERHEAD_WIND, strike: OVERHEAD_STRIKE, follow: OVERHEAD_FOLLOW,
    startup: frames(20), active: frames(8), recovery: frames(30), staminaCost: 28, motionValue: 1.08,
    poiseDamage: 28, guardDamage: 44, lunge: 0.7, next: 'gs_light1', comboWindow: [frames(23), frames(55)],
    hyperArmor: true, reaction: 'stagger', hitStop: 0.11, shake: 0.42, sound: 'heavy',
  }),
  atk({
    id: 'gs_heavy', kind: 'heavy', windup: OVERHEAD_WIND, strike: OVERHEAD_STRIKE, follow: OVERHEAD_FOLLOW,
    startup: frames(34), active: frames(8), recovery: frames(34), staminaCost: 40, motionValue: 1.65,
    poiseDamage: 50, guardDamage: 75, lunge: 0.8, hyperArmor: true, reaction: 'knockdown', hitStop: 0.15, shake: 0.6,
    sound: 'heavy', trail: '#ffd27a', shockwave: { radius: 1.8, forward: 1.8, damageScale: 0.4 },
  }),
  atk({
    id: 'gs_charged', kind: 'charged', windup: OVERHEAD_WIND, strike: OVERHEAD_STRIKE, follow: OVERHEAD_FOLLOW,
    startup: frames(18), active: frames(8), recovery: frames(36), staminaCost: 48, motionValue: 2.5,
    poiseDamage: 75, guardDamage: 100, lunge: 0.9, hyperArmor: true, reaction: 'knockdown', hitStop: 0.2, shake: 0.85,
    sound: 'heavy', trail: '#ff9a3a', shockwave: { radius: 2.4, forward: 1.9, damageScale: 0.5 },
  }),
  atk({
    id: 'gs_running', kind: 'running', windup: SWEEP_WIND, strike: SWEEP_STRIKE, follow: SWEEP_FOLLOW,
    startup: frames(16), active: frames(9), recovery: frames(30), staminaCost: 30, motionValue: 1.25,
    poiseDamage: 34, lunge: 2.2, hyperArmor: true, reaction: 'stagger', sound: 'heavy',
  }),
  atk({
    id: 'gs_roll', kind: 'roll', windup: SWEEP_WIND, strike: SWEEP_STRIKE, follow: SWEEP_FOLLOW,
    startup: frames(14), active: frames(8), recovery: frames(28), staminaCost: 26, motionValue: 0.95,
    poiseDamage: 24, lunge: 0.8, sound: 'heavy',
  }),
);

// ===== Ashen Revenant (undead soldier: rusted sword + shield) =========================
const enemyBase = { kind: 'enemy' as const, staminaCost: 0, trail: '#ff8a4a', tracking: 4.5 };
reg(
  atk({
    ...enemyBase, id: 'rev_slash', windup: SLASH_A_WIND, strike: SLASH_A_STRIKE, follow: SLASH_A_FOLLOW,
    startup: frames(20), active: frames(7), recovery: frames(26), motionValue: 1, poiseDamage: 14, lunge: 0.7,
    next: 'rev_backhand',
  }),
  atk({
    ...enemyBase, id: 'rev_backhand', windup: SLASH_B_WIND, strike: SLASH_B_STRIKE, follow: SLASH_B_FOLLOW,
    startup: frames(15), active: frames(7), recovery: frames(30), motionValue: 1.05, poiseDamage: 14, lunge: 0.6,
  }),
  atk({
    ...enemyBase, id: 'rev_thrust', windup: THRUST_WIND, strike: THRUST_STRIKE, follow: THRUST_STRIKE,
    startup: frames(24), active: frames(8), recovery: frames(32), motionValue: 1.2, poiseDamage: 18, lunge: 2.6,
    tracking: 3.5, sound: 'thrust', telegraph: '#ffb070',
  }),
  atk({
    ...enemyBase, id: 'rev_overhead', windup: OVERHEAD_WIND, strike: OVERHEAD_STRIKE, follow: OVERHEAD_FOLLOW,
    startup: frames(38), active: frames(7), recovery: frames(36), motionValue: 1.55, poiseDamage: 30, lunge: 0.8,
    reaction: 'stagger', hitStop: 0.1, shake: 0.4, sound: 'heavy', telegraph: '#ff6a3a', tracking: 3.5,
  }),
  atk({
    ...enemyBase, id: 'rev_bash', windup: SHIELD_BASH_WIND, strike: SHIELD_BASH_STRIKE, follow: SHIELD_BASH_STRIKE,
    startup: frames(16), active: frames(6), recovery: frames(26), motionValue: 0.45, poiseDamage: 30, guardDamage: 60,
    lunge: 0.6, reaction: 'stagger', parryable: false, trail: undefined,
  }),
);

// ===== Gravebound Knight (elite, two-handed greatsword) ================================
const gkBase = { kind: 'enemy' as const, staminaCost: 0, trail: '#ff3b5c', tracking: 3.2, hyperArmor: true };
reg(
  atk({
    ...gkBase, id: 'gk_sweep', windup: SWEEP_WIND, strike: SWEEP_STRIKE, follow: SWEEP_FOLLOW,
    startup: frames(30), active: frames(10), recovery: frames(34), motionValue: 1.2, poiseDamage: 40, guardDamage: 60,
    lunge: 1.0, reaction: 'stagger', hitStop: 0.12, shake: 0.5, sound: 'heavy', next: 'gk_overhead',
  }),
  atk({
    ...gkBase, id: 'gk_overhead', windup: OVERHEAD_WIND, strike: OVERHEAD_STRIKE, follow: OVERHEAD_FOLLOW,
    startup: frames(32), active: frames(8), recovery: frames(42), motionValue: 1.6, poiseDamage: 60, guardDamage: 80,
    lunge: 0.9, reaction: 'knockdown', hitStop: 0.15, shake: 0.7, sound: 'heavy', telegraph: '#ff3b5c',
    shockwave: { radius: 2.2, forward: 2.0, damageScale: 0.45 },
  }),
  atk({
    ...gkBase, id: 'gk_thrust', windup: THRUST_WIND, strike: THRUST_STRIKE, follow: THRUST_STRIKE,
    startup: frames(34), active: frames(10), recovery: frames(38), motionValue: 1.3, poiseDamage: 40, lunge: 4.2,
    reaction: 'stagger', sound: 'thrust', telegraph: '#ffd27a', tracking: 2.5,
  }),
  atk({
    ...gkBase, id: 'gk_leap', windup: PLUNGE_WIND, strike: OVERHEAD_STRIKE, follow: OVERHEAD_FOLLOW,
    startup: frames(44), active: frames(8), recovery: frames(46), motionValue: 1.8, poiseDamage: 70, guardDamage: 90,
    lunge: 6.0, reaction: 'knockdown', hitStop: 0.18, shake: 0.9, sound: 'heavy', telegraph: '#ff3b5c', tracking: 2.2,
    shockwave: { radius: 2.8, forward: 1.6, damageScale: 0.55 }, parryable: false,
  }),
  // Phase-two delayed combo (the blade is wreathed in abyssal flame).
  atk({
    ...gkBase, id: 'gk_p2_delay', windup: OVERHEAD_WIND, strike: OVERHEAD_STRIKE, follow: OVERHEAD_FOLLOW,
    startup: frames(52), active: frames(8), recovery: frames(20), motionValue: 1.5, poiseDamage: 60,
    lunge: 1.2, reaction: 'knockdown', hitStop: 0.15, shake: 0.7, sound: 'heavy', telegraph: '#b05cff',
    extraDamage: { dark: 60 }, next: 'gk_p2_sweep', shockwave: { radius: 2.4, forward: 2.0, damageScale: 0.5 },
  }),
  atk({
    ...gkBase, id: 'gk_p2_sweep', windup: SWEEP_WIND, strike: SWEEP_STRIKE, follow: SWEEP_FOLLOW,
    startup: frames(18), active: frames(10), recovery: frames(40), motionValue: 1.3, poiseDamage: 45,
    lunge: 1.4, reaction: 'stagger', hitStop: 0.12, shake: 0.5, sound: 'heavy', extraDamage: { dark: 45 },
    trail: '#b05cff',
  }),
);


// ===== Additional weapon classes ========================================================
const SA = { windup: SLASH_A_WIND, strike: SLASH_A_STRIKE, follow: SLASH_A_FOLLOW };
const SB = { windup: SLASH_B_WIND, strike: SLASH_B_STRIKE, follow: SLASH_B_FOLLOW };
const TH = { windup: THRUST_WIND, strike: THRUST_STRIKE, follow: THRUST_STRIKE };
const OH = { windup: OVERHEAD_WIND, strike: OVERHEAD_STRIKE, follow: OVERHEAD_FOLLOW };
const SW = { windup: SWEEP_WIND, strike: SWEEP_STRIKE, follow: SWEEP_FOLLOW };
const BASH = { windup: SHIELD_BASH_WIND, strike: SHIELD_BASH_STRIKE, follow: SHIELD_BASH_STRIKE };
const LEAP = { windup: PLUNGE_WIND, strike: OVERHEAD_STRIKE, follow: OVERHEAD_FOLLOW };
const heavyFx = { reaction: 'stagger' as const, hitStop: 0.11, shake: 0.4, sound: 'heavy' as const };

reg(
  // Dagger — very fast, low stamina, short reach; criticals hit hard.
  atk({ id: 'dg_light1', kind: 'light', ...SA, startup: frames(7), active: frames(5), recovery: frames(14), staminaCost: 11, motionValue: 0.8, poiseDamage: 7, lunge: 0.45, next: 'dg_light2', comboWindow: [frames(8), frames(26)] }),
  atk({ id: 'dg_light2', kind: 'light', ...SB, startup: frames(7), active: frames(5), recovery: frames(14), staminaCost: 11, motionValue: 0.82, poiseDamage: 7, lunge: 0.4, next: 'dg_light3', comboWindow: [frames(8), frames(26)] }),
  atk({ id: 'dg_light3', kind: 'light', ...TH, startup: frames(8), active: frames(5), recovery: frames(16), staminaCost: 12, motionValue: 0.9, poiseDamage: 8, lunge: 0.7, next: 'dg_light1', comboWindow: [frames(9), frames(29)], sound: 'thrust' }),
  atk({ id: 'dg_heavy', kind: 'heavy', ...TH, startup: frames(16), active: frames(6), recovery: frames(20), staminaCost: 18, motionValue: 1.3, poiseDamage: 16, lunge: 0.9, sound: 'thrust' }),
  atk({ id: 'dg_charged', kind: 'charged', ...TH, startup: frames(10), active: frames(6), recovery: frames(22), staminaCost: 24, motionValue: 1.8, poiseDamage: 24, lunge: 1.2, sound: 'thrust' }),
  atk({ id: 'dg_art', kind: 'heavy', ...TH, startup: frames(8), active: frames(7), recovery: frames(18), staminaCost: 14, motionValue: 1.35, poiseDamage: 18, lunge: 3.0, hyperArmor: true, trail: '#c58bff', sound: 'thrust' }),
  // Spear — long reach thrusts.
  atk({ id: 'sp_light1', kind: 'light', ...TH, startup: frames(12), active: frames(6), recovery: frames(20), staminaCost: 16, motionValue: 1.0, poiseDamage: 12, lunge: 0.9, next: 'sp_light2', comboWindow: [frames(14), frames(38)], sound: 'thrust' }),
  atk({ id: 'sp_light2', kind: 'light', ...TH, startup: frames(11), active: frames(6), recovery: frames(20), staminaCost: 16, motionValue: 1.05, poiseDamage: 12, lunge: 0.9, next: 'sp_light1', comboWindow: [frames(13), frames(37)], sound: 'thrust' }),
  atk({ id: 'sp_heavy', kind: 'heavy', ...SW, startup: frames(22), active: frames(8), recovery: frames(26), staminaCost: 26, motionValue: 1.4, poiseDamage: 26, lunge: 0.8, ...heavyFx }),
  atk({ id: 'sp_charged', kind: 'charged', ...TH, startup: frames(14), active: frames(7), recovery: frames(28), staminaCost: 32, motionValue: 2.1, poiseDamage: 38, lunge: 1.6, ...heavyFx, sound: 'thrust' }),
  atk({ id: 'sp_running', kind: 'running', ...TH, startup: frames(12), active: frames(7), recovery: frames(22), staminaCost: 20, motionValue: 1.25, poiseDamage: 20, lunge: 2.6, sound: 'thrust' }),
  atk({ id: 'sp_art', kind: 'heavy', ...TH, startup: frames(16), active: frames(9), recovery: frames(26), staminaCost: 20, motionValue: 1.6, poiseDamage: 30, lunge: 4.6, hyperArmor: true, trail: '#9fd8ff', ...heavyFx, sound: 'thrust' }),
  // Halberd — wide sweeps, heavy commitment.
  atk({ id: 'hb_light1', kind: 'light', ...SW, startup: frames(18), active: frames(9), recovery: frames(26), staminaCost: 22, motionValue: 1.0, poiseDamage: 24, guardDamage: 36, lunge: 0.6, next: 'hb_light2', comboWindow: [frames(21), frames(50)], hyperArmor: true, ...heavyFx }),
  atk({ id: 'hb_light2', kind: 'light', ...OH, startup: frames(20), active: frames(8), recovery: frames(28), staminaCost: 24, motionValue: 1.1, poiseDamage: 26, guardDamage: 40, lunge: 0.7, next: 'hb_light1', comboWindow: [frames(23), frames(54)], hyperArmor: true, ...heavyFx }),
  atk({ id: 'hb_heavy', kind: 'heavy', ...OH, startup: frames(30), active: frames(8), recovery: frames(32), staminaCost: 34, motionValue: 1.55, poiseDamage: 44, lunge: 0.8, hyperArmor: true, ...heavyFx, reaction: 'knockdown', shockwave: { radius: 1.6, forward: 2.2, damageScale: 0.35 } }),
  atk({ id: 'hb_charged', kind: 'charged', ...OH, startup: frames(18), active: frames(8), recovery: frames(34), staminaCost: 42, motionValue: 2.3, poiseDamage: 62, lunge: 0.9, hyperArmor: true, ...heavyFx, reaction: 'knockdown', shockwave: { radius: 2.2, forward: 2.2, damageScale: 0.45 } }),
  atk({ id: 'hb_art', kind: 'heavy', ...SW, startup: frames(24), active: frames(10), recovery: frames(30), staminaCost: 28, motionValue: 1.5, poiseDamage: 40, lunge: 0.6, hyperArmor: true, ...heavyFx, trail: '#ffd27a', shockwave: { radius: 3.0, forward: 0.4, damageScale: 0.6 } }),
  // Axe — heavy one-handed chops.
  atk({ id: 'ax_light1', kind: 'light', ...SA, startup: frames(13), active: frames(6), recovery: frames(22), staminaCost: 19, motionValue: 1.05, poiseDamage: 18, lunge: 0.6, next: 'ax_light2', comboWindow: [frames(15), frames(41)] }),
  atk({ id: 'ax_light2', kind: 'light', ...SB, startup: frames(12), active: frames(6), recovery: frames(22), staminaCost: 19, motionValue: 1.1, poiseDamage: 18, lunge: 0.55, next: 'ax_light1', comboWindow: [frames(14), frames(40)] }),
  atk({ id: 'ax_heavy', kind: 'heavy', ...OH, startup: frames(26), active: frames(7), recovery: frames(30), staminaCost: 32, motionValue: 1.6, poiseDamage: 34, lunge: 0.7, hyperArmor: true, ...heavyFx }),
  atk({ id: 'ax_charged', kind: 'charged', ...OH, startup: frames(16), active: frames(7), recovery: frames(32), staminaCost: 40, motionValue: 2.35, poiseDamage: 50, lunge: 0.9, hyperArmor: true, ...heavyFx, reaction: 'knockdown' }),
  // Hammer — slow, crushing, shockwaves.
  atk({ id: 'hm_light1', kind: 'light', ...OH, startup: frames(20), active: frames(7), recovery: frames(28), staminaCost: 24, motionValue: 1.1, poiseDamage: 32, guardDamage: 50, lunge: 0.5, next: 'hm_light2', comboWindow: [frames(23), frames(53)], hyperArmor: true, ...heavyFx }),
  atk({ id: 'hm_light2', kind: 'light', ...SW, startup: frames(19), active: frames(9), recovery: frames(28), staminaCost: 24, motionValue: 1.12, poiseDamage: 32, guardDamage: 50, lunge: 0.6, next: 'hm_light1', comboWindow: [frames(22), frames(54)], hyperArmor: true, ...heavyFx }),
  atk({ id: 'hm_heavy', kind: 'heavy', ...OH, startup: frames(32), active: frames(8), recovery: frames(36), staminaCost: 38, motionValue: 1.7, poiseDamage: 55, guardDamage: 80, lunge: 0.6, hyperArmor: true, ...heavyFx, reaction: 'knockdown', shockwave: { radius: 2.0, forward: 1.6, damageScale: 0.45 } }),
  atk({ id: 'hm_charged', kind: 'charged', ...OH, startup: frames(20), active: frames(8), recovery: frames(38), staminaCost: 46, motionValue: 2.5, poiseDamage: 80, guardDamage: 110, lunge: 0.7, hyperArmor: true, ...heavyFx, reaction: 'knockdown', shockwave: { radius: 2.8, forward: 1.6, damageScale: 0.55 } }),
  atk({ id: 'hm_art', kind: 'heavy', ...LEAP, startup: frames(34), active: frames(8), recovery: frames(40), staminaCost: 34, motionValue: 1.9, poiseDamage: 70, lunge: 4.2, hyperArmor: true, ...heavyFx, reaction: 'knockdown', trail: '#ffb347', shockwave: { radius: 3.2, forward: 1.4, damageScale: 0.6 }, parryable: false }),
  // Katana — fast, flowing, bleed.
  atk({ id: 'kt_light1', kind: 'light', ...SA, startup: frames(10), active: frames(6), recovery: frames(18), staminaCost: 15, motionValue: 1.0, poiseDamage: 11, lunge: 0.6, next: 'kt_light2', comboWindow: [frames(12), frames(33)], trail: '#ff9aa8' }),
  atk({ id: 'kt_light2', kind: 'light', ...SB, startup: frames(9), active: frames(6), recovery: frames(18), staminaCost: 15, motionValue: 1.02, poiseDamage: 11, lunge: 0.55, next: 'kt_light3', comboWindow: [frames(11), frames(32)], trail: '#ff9aa8' }),
  atk({ id: 'kt_light3', kind: 'light', ...SW, startup: frames(12), active: frames(7), recovery: frames(22), staminaCost: 17, motionValue: 1.15, poiseDamage: 14, lunge: 0.8, next: 'kt_light1', comboWindow: [frames(14), frames(40)], trail: '#ff9aa8' }),
  atk({ id: 'kt_heavy', kind: 'heavy', ...TH, startup: frames(20), active: frames(7), recovery: frames(24), staminaCost: 26, motionValue: 1.5, poiseDamage: 26, lunge: 1.0, ...heavyFx, sound: 'thrust' }),
  atk({ id: 'kt_charged', kind: 'charged', ...TH, startup: frames(13), active: frames(7), recovery: frames(26), staminaCost: 32, motionValue: 2.2, poiseDamage: 38, lunge: 1.3, ...heavyFx, sound: 'thrust' }),
  atk({ id: 'kt_art', kind: 'heavy', ...SW, startup: frames(12), active: frames(8), recovery: frames(24), staminaCost: 18, motionValue: 1.6, poiseDamage: 24, lunge: 5.0, hyperArmor: true, trail: '#ff2a4a' }),
  // Staff & grimoire — catalysts; weak melee.
  atk({ id: 'st_light1', kind: 'light', ...SW, startup: frames(15), active: frames(7), recovery: frames(22), staminaCost: 18, motionValue: 0.7, poiseDamage: 10, lunge: 0.4, next: 'st_light2', comboWindow: [frames(17), frames(42)] }),
  atk({ id: 'st_light2', kind: 'light', ...OH, startup: frames(16), active: frames(7), recovery: frames(24), staminaCost: 18, motionValue: 0.75, poiseDamage: 12, lunge: 0.4, next: 'st_light1', comboWindow: [frames(18), frames(45)] }),
  atk({ id: 'st_heavy', kind: 'heavy', ...OH, startup: frames(24), active: frames(7), recovery: frames(28), staminaCost: 26, motionValue: 1.0, poiseDamage: 20, lunge: 0.5, ...heavyFx }),
  atk({ id: 'gr_light1', kind: 'light', ...BASH, startup: frames(12), active: frames(6), recovery: frames(20), staminaCost: 14, motionValue: 0.6, poiseDamage: 12, lunge: 0.5, next: 'gr_light1', comboWindow: [frames(14), frames(36)], trail: undefined }),
  atk({ id: 'gr_heavy', kind: 'heavy', ...BASH, startup: frames(20), active: frames(6), recovery: frames(24), staminaCost: 22, motionValue: 0.95, poiseDamage: 26, lunge: 0.7, ...heavyFx, trail: undefined }),
  // Longsword & greatsword skills.
  atk({ id: 'ss_art', kind: 'heavy', ...TH, startup: frames(14), active: frames(8), recovery: frames(24), staminaCost: 16, motionValue: 1.6, poiseDamage: 28, lunge: 3.2, hyperArmor: true, trail: '#c58bff', ...heavyFx, sound: 'thrust' }),
  atk({ id: 'gs_art', kind: 'heavy', ...OH, startup: frames(30), active: frames(8), recovery: frames(36), staminaCost: 32, motionValue: 1.8, poiseDamage: 60, lunge: 0.5, hyperArmor: true, ...heavyFx, reaction: 'knockdown', trail: '#ffb347', shockwave: { radius: 3.6, forward: 1.8, damageScale: 0.7 }, parryable: false }),
);

export function getAttack(id: string): AttackData {
  const a = ATTACKS[id];
  if (!a) throw new Error(`Unknown attack "${id}"`);
  return a;
}

/** Ready stance poses used for the recovery tail of every attack. */
export const RECOVER_POSE = POSES.combatIdle;
