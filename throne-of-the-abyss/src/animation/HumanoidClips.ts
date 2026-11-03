import { AnimClip, type KeyDef } from './AnimationClip';
import type { PoseDef } from './Skeleton';
import { POSES, mergePose, mirrorPose } from '@/data/poses';
import type { AttackData } from '@/combat/AttackData';

function cycle(name: string, contact: PoseDef, pass: PoseDef, duration: number): AnimClip {
  const h = duration / 4;
  return new AnimClip({
    name,
    loop: true,
    keys: [
      { t: 0, pose: contact, ease: 'inOut' },
      { t: h, pose: pass, ease: 'inOut' },
      { t: 2 * h, pose: mirrorPose(contact), ease: 'inOut' },
      { t: 3 * h, pose: mirrorPose(pass), ease: 'inOut' },
      { t: 4 * h, pose: contact, ease: 'inOut' },
    ],
  });
}

function oneShot(name: string, keys: KeyDef[]): AnimClip {
  return new AnimClip({ name, loop: false, keys });
}

/** Roll: the hips spin a full turn in <180° steps so quaternion slerp follows the flip. */
function rollClip(duration: number): AnimClip {
  const tuck = POSES.rollTuck;
  const spin = (angle: number, drop: number): PoseDef =>
    mergePose(tuck, { joints: { hips: [angle, 0, 0] }, hips: [0, drop, 0] });
  const d = duration;
  return oneShot('roll', [
    { t: 0, pose: mergePose(POSES.landCrouch), ease: 'out' },
    { t: d * 0.12, pose: spin(Math.PI * 0.5, -0.55), ease: 'linear' },
    { t: d * 0.27, pose: spin(Math.PI, -0.62), ease: 'linear' },
    { t: d * 0.42, pose: spin(Math.PI * 1.5, -0.55), ease: 'linear' },
    { t: d * 0.56, pose: spin(Math.PI * 2, -0.4), ease: 'out' },
    { t: d * 0.75, pose: POSES.landCrouch, ease: 'inOut' },
    { t: d, pose: POSES.combatIdle },
  ]);
}

export interface ClipSet {
  idle: AnimClip;
  walk: AnimClip;
  run: AnimClip;
  sprint: AnimClip;
  jump: AnimClip;
  fall: AnimClip;
  land: AnimClip;
  roll: AnimClip;
  backstep: AnimClip;
  hitLight: AnimClip;
  hitHeavy: AnimClip;
  stagger: AnimClip;
  guardBreak: AnimClip;
  parried: AnimClip;
  knockdown: AnimClip;
  death: AnimClip;
  kneel: AnimClip;
  rise: AnimClip;
  drink: AnimClip;
  castThrust: AnimClip;
  castSkyward: AnimClip;
  parry: AnimClip;
  guardSword: AnimClip;
  guardShield: AnimClip;
  criticalVictim: AnimClip;
  chargeHold: AnimClip;
}

/**
 * Builds the clip set for a stance (player vs. hunched undead) — all humanoids share the
 * same authored poses, stance only changes idle/locomotion attitude.
 */
export function buildClipSet(stance: 'heir' | 'revenant' | 'knight'): ClipSet {
  const idleA = stance === 'revenant' ? POSES.soldierIdle : POSES.combatIdle;
  const idleB = stance === 'revenant' ? mergePose(POSES.soldierIdle, { joints: { spine: [0.26, 0.1, 0] }, hips: [0, -0.07, 0] }) : POSES.idleBreath;
  const hunch = (p: PoseDef): PoseDef =>
    stance === 'revenant' ? mergePose(p, { joints: { spine: [(p.joints.spine?.[0] ?? 0) + 0.18, p.joints.spine?.[1] ?? 0, 0] } }) : p;
  const shieldArm = (p: PoseDef): PoseDef =>
    stance === 'revenant'
      ? mergePose(p, { joints: { upperArmL: [-0.5, 0, 0.18], foreArmL: [-1.25, 0, 0] } })
      : p;
  const loco = (p: PoseDef) => shieldArm(hunch(p));
  const walkSpeed = stance === 'knight' ? 1.25 : 1.05;

  return {
    idle: new AnimClip({
      name: 'idle',
      loop: true,
      keys: [
        { t: 0, pose: idleA },
        { t: 1.6, pose: idleB },
        { t: 3.2, pose: idleA },
      ],
    }),
    walk: cycle('walk', loco(POSES.walkContact), loco(POSES.walkPass), walkSpeed),
    run: cycle('run', loco(POSES.runContact), loco(POSES.runPass), 0.72),
    sprint: cycle('sprint', POSES.sprintContact, POSES.sprintPass, 0.56),
    jump: oneShot('jump', [
      { t: 0, pose: POSES.landCrouch, ease: 'out' },
      { t: 0.12, pose: POSES.jumpRise, ease: 'inOut' },
      { t: 0.5, pose: POSES.fall },
    ]),
    fall: new AnimClip({ name: 'fall', loop: true, keys: [{ t: 0, pose: POSES.fall }, { t: 0.4, pose: mergePose(POSES.fall, { joints: { thighL: [-0.4, 0, 0.1] } }) }, { t: 0.8, pose: POSES.fall }] }),
    land: oneShot('land', [
      { t: 0, pose: POSES.landCrouch, ease: 'out' },
      { t: 0.32, pose: idleA },
    ]),
    roll: rollClip(0.62),
    backstep: oneShot('backstep', [
      { t: 0, pose: POSES.backstep, ease: 'out' },
      { t: 0.22, pose: POSES.backstep, ease: 'inOut' },
      { t: 0.45, pose: idleA },
    ]),
    hitLight: oneShot('hitLight', [
      { t: 0, pose: POSES.hitLight, ease: 'out' },
      { t: 0.1, pose: POSES.hitLight, ease: 'inOut' },
      { t: 0.38, pose: idleA },
    ]),
    hitHeavy: oneShot('hitHeavy', [
      { t: 0, pose: POSES.hitHeavy, ease: 'out' },
      { t: 0.2, pose: POSES.hitHeavy, ease: 'inOut' },
      { t: 0.75, pose: idleA },
    ]),
    stagger: oneShot('stagger', [
      { t: 0, pose: POSES.hitHeavy, ease: 'out' },
      { t: 0.25, pose: POSES.staggered, ease: 'inOut' },
      { t: 1.1, pose: POSES.staggered, ease: 'inOut' },
      { t: 1.45, pose: idleA },
    ]),
    guardBreak: oneShot('guardBreak', [
      { t: 0, pose: POSES.guardBroken, ease: 'out' },
      { t: 0.5, pose: POSES.guardBroken, ease: 'inOut' },
      { t: 0.9, pose: POSES.staggered, ease: 'inOut' },
      { t: 1.3, pose: idleA },
    ]),
    parried: oneShot('parried', [
      { t: 0, pose: POSES.guardBroken, ease: 'out' },
      { t: 0.3, pose: POSES.guardBroken, ease: 'inOut' },
      { t: 0.8, pose: POSES.staggered, ease: 'inOut' },
      { t: 2.0, pose: POSES.staggered, ease: 'inOut' },
      { t: 2.4, pose: idleA },
    ]),
    knockdown: oneShot('knockdown', [
      { t: 0, pose: POSES.knockdownAir, ease: 'out' },
      { t: 0.35, pose: POSES.knockdownLie, ease: 'out' },
      { t: 1.25, pose: POSES.knockdownLie, ease: 'inOut' },
      { t: 1.75, pose: POSES.getUpKneel, ease: 'inOut' },
      { t: 2.2, pose: idleA },
    ]),
    death: oneShot('death', [
      { t: 0, pose: POSES.hitHeavy, ease: 'out' },
      { t: 0.45, pose: POSES.deathKneel, ease: 'inOut' },
      { t: 1.0, pose: POSES.deathKneel, ease: 'in' },
      { t: 1.45, pose: POSES.deathProne },
    ]),
    kneel: oneShot('kneel', [
      { t: 0, pose: POSES.landCrouch, ease: 'inOut' },
      { t: 0.7, pose: POSES.kneelRest },
    ]),
    rise: oneShot('rise', [
      { t: 0, pose: POSES.kneelRest, ease: 'inOut' },
      { t: 0.6, pose: POSES.getUpKneel, ease: 'inOut' },
      { t: 1.1, pose: idleA },
    ]),
    drink: oneShot('drink', [
      { t: 0, pose: idleA, ease: 'inOut' },
      { t: 0.32, pose: POSES.drinkLift, ease: 'inOut' },
      { t: 0.55, pose: POSES.drinkTip, ease: 'inOut' },
      { t: 0.85, pose: POSES.drinkTip, ease: 'inOut' },
      { t: 1.25, pose: idleA },
    ]),
    castThrust: oneShot('castThrust', [
      { t: 0, pose: POSES.castGather, ease: 'inOut' },
      { t: 0.42, pose: POSES.castGather, ease: 'snap' },
      { t: 0.52, pose: POSES.castRelease, ease: 'inOut' },
      { t: 0.95, pose: idleA },
    ]),
    castSkyward: oneShot('castSkyward', [
      { t: 0, pose: POSES.castGather, ease: 'inOut' },
      { t: 0.45, pose: POSES.castSkyward, ease: 'snap' },
      { t: 0.6, pose: POSES.castRelease, ease: 'inOut' },
      { t: 1.05, pose: idleA },
    ]),
    parry: oneShot('parry', [
      { t: 0, pose: POSES.parryWind, ease: 'snap' },
      { t: 0.1, pose: POSES.parryStrike, ease: 'inOut' },
      { t: 0.3, pose: POSES.parryStrike, ease: 'inOut' },
      { t: 0.7, pose: idleA },
    ]),
    guardSword: new AnimClip({ name: 'guardSword', loop: true, keys: [{ t: 0, pose: POSES.guardSword }] }),
    guardShield: new AnimClip({ name: 'guardShield', loop: true, keys: [{ t: 0, pose: POSES.guardShield }] }),
    criticalVictim: oneShot('criticalVictim', [
      { t: 0, pose: POSES.staggered, ease: 'out' },
      { t: 0.3, pose: POSES.hitHeavy, ease: 'out' },
      { t: 0.9, pose: POSES.deathKneel, ease: 'inOut' },
      { t: 1.8, pose: POSES.deathKneel, ease: 'inOut' },
      { t: 2.6, pose: POSES.getUpKneel, ease: 'inOut' },
      { t: 3.0, pose: idleA },
    ]),
    chargeHold: new AnimClip({ name: 'chargeHold', loop: true, keys: [{ t: 0, pose: POSES.rest }] }),
  };
}

const attackClipCache = new Map<string, AnimClip>();

/**
 * Generate an attack clip from its frame data: anticipation peaks exactly at the end of
 * startup, the strike pose lands at the end of the active window, then follow-through
 * and recovery back to the ready stance.
 */
export function attackClip(a: AttackData, stance: 'heir' | 'revenant' | 'knight'): AnimClip {
  const key = `${a.id}:${stance}`;
  const cached = attackClipCache.get(key);
  if (cached) return cached;
  const idle = stance === 'revenant' ? POSES.soldierIdle : POSES.combatIdle;
  const s = a.startup;
  const act = a.active;
  const total = s + act + a.recovery;
  const keys: KeyDef[] = [
    { t: 0, pose: a.windup, ease: 'out' },
    { t: s * 0.92, pose: a.windup, ease: 'snap' },
    { t: s + Math.min(act, 0.12), pose: a.strike, ease: 'out' },
    { t: s + act + a.recovery * 0.35, pose: a.follow, ease: 'inOut' },
    { t: total, pose: idle },
  ];
  // Jump/plunge attacks hold the strike until landing (state machine drives timing).
  if (a.kind === 'plunge') keys.splice(3, 2, { t: total, pose: a.follow });
  const clip = new AnimClip({ name: `atk:${a.id}`, loop: false, keys });
  attackClipCache.set(key, clip);
  return clip;
}
