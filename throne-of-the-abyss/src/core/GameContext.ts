import type { Scene } from 'three';
import type { EventBus } from './EventBus';
import type { GameEvents } from './GameEvents';
import type { GameTime } from './Time';
import type { CollisionWorld } from '@/physics/CollisionWorld';
import type { VFXManager } from '@/vfx/VFXManager';
import type { CombatSystem } from '@/combat/CombatSystem';
import type { ThirdPersonCamera } from '@/camera/ThirdPersonCamera';
import type { GraphicsProfile } from '@/render/GraphicsSettings';
import type { ProjectileSystem } from '@/magic/ProjectileSystem';

/** Services shared by gameplay objects (a tiny service locator, passed explicitly). */
export interface GameContext {
  scene: Scene;
  world: CollisionWorld;
  events: EventBus<GameEvents>;
  time: GameTime;
  vfx: VFXManager;
  combat: CombatSystem;
  camera: ThirdPersonCamera;
  projectiles: ProjectileSystem;
  profile: GraphicsProfile;
}
