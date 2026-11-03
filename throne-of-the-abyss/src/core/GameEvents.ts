import type { Vector3 } from 'three';
import type { Character } from '@/characters/Character';
import type { DamageResult } from '@/combat/DamageCalculator';
import type { DirectDamageType } from '@/combat/DamageTypes';
import type { HitReaction } from '@/combat/AttackData';

export type NotifyKind = 'banner' | 'info' | 'item' | 'death' | 'victory' | 'area';

export interface GameEvents {
  hit: {
    attacker: Character | null;
    target: Character;
    result: DamageResult;
    point: Vector3;
    dir: Vector3;
    type: DirectDamageType;
    reaction: HitReaction | 'none';
    heavy: boolean;
  };
  blocked: { attacker: Character | null; target: Character; point: Vector3; dir: Vector3; chip: number };
  parried: { parrier: Character; attacker: Character; point: Vector3 };
  guardBreak: { target: Character };
  died: { character: Character; killer: Character | null };
  statusProc: { target: Character; status: 'poison' | 'bleed'; damage: number };
  noise: { x: number; y: number; z: number; radius: number; source: Character };
  notify: { text: string; sub?: string; kind: NotifyKind };
  echoes: { amount: number; total: number };
  bossEngaged: { boss: Character };
  bossDefeated: { boss: Character };
  bossPhase: { boss: Character; phase: number };
  playerDied: Record<string, never>;
  rested: { altarId: string };
}
