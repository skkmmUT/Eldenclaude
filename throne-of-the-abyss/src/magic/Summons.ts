import { MeshStandardMaterial, Vector3, type Mesh } from 'three';
import type { GameContext } from '@/core/GameContext';
import type { Character } from '@/characters/Character';
import type { ExternalHit } from '@/combat/CombatSystem';
import { HumanoidRig } from '@/characters/HumanoidRig';
import { Animator } from '@/animation/Animator';
import { buildClipSet, attackClip, type ClipSet } from '@/animation/HumanoidClips';
import { APPEARANCES } from '@/data/appearances';
import { getAttack } from '@/data/attacks';
import { buildWeapon } from '@/render/WeaponModels';
import { WEAPONS } from '@/data/weapons';
import { yawFromDir, rotateTowardsAngle } from '@/core/MathUtils';

/**
 * Spectral knight summoned by Eternal Guardian: follows its summoner, dashes at the
 * nearest foe and strikes with a ghostly greatsword. It cannot be hit and fades out when
 * its time runs out.
 */
export class SpectralGuardian {
  private readonly rig: HumanoidRig;
  private readonly animator = new Animator();
  private readonly clips: ClipSet;
  private readonly pos = new Vector3();
  private facing = 0;
  private time = 0;
  private cooldown = 0.6;
  private strikeT = -1;
  private target: Character | null = null;
  private readonly mat: MeshStandardMaterial;

  constructor(
    private readonly ctx: GameContext,
    private readonly owner: Character,
    private readonly duration: number,
    color: string,
    private readonly hit: ExternalHit,
  ) {
    this.rig = new HumanoidRig({ ...APPEARANCES.gravebound, height: 2.05, cape: false, hairStrands: 0 });
    this.mat = new MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 0.9, transparent: true, opacity: 0, depthWrite: false, roughness: 0.4 });
    const weapon = buildWeapon(WEAPONS.gravebound_greatsword.visual);
    this.rig.weaponSocketR.add(weapon.group);
    this.rig.root.traverse((o) => {
      const m = o as Mesh;
      if (m.isMesh) {
        m.material = this.mat;
        m.castShadow = false;
      }
    });
    this.clips = buildClipSet('knight');
    this.animator.play(this.clips.idle, 0);
    this.pos.copy(owner.position).add(new Vector3(1.2, 0, -1));
    ctx.scene.add(this.rig.root);
    ctx.vfx.soulRelease(this.pos.clone().setY(this.pos.y + 1), color, 80);
  }

  private nearestFoe(): Character | null {
    let best: Character | null = null;
    let bd = 11;
    for (const c of this.ctx.combat.characters) {
      if (c.faction === this.owner.faction || c.dead) continue;
      const d = c.position.distanceTo(this.owner.position);
      if (d < bd) {
        bd = d;
        best = c;
      }
    }
    return best;
  }

  dispose(): void {
    this.ctx.scene.remove(this.rig.root);
  }

  update(dt: number): boolean {
    this.time += dt;
    const fadeIn = Math.min(1, this.time / 0.5);
    const fadeOut = Math.min(1, (this.duration - this.time) / 0.8);
    this.mat.opacity = 0.55 * Math.max(0, Math.min(fadeIn, fadeOut));
    if (this.time >= this.duration || this.owner.dead) {
      this.ctx.scene.remove(this.rig.root);
      return false;
    }
    this.cooldown -= dt;
    if (this.strikeT >= 0) {
      // Dash and strike.
      this.strikeT += dt;
      const t = this.target;
      if (t && !t.dead) {
        const to = new Vector3(t.position.x - this.pos.x, 0, t.position.z - this.pos.z);
        const d = to.length();
        if (d > 1.6) this.pos.addScaledVector(to.normalize(), Math.min(d - 1.6, 14 * dt));
        this.facing = yawFromDir(t.position.x - this.pos.x, t.position.z - this.pos.z);
        if (this.strikeT >= 0.42 && this.strikeT - dt < 0.42 && this.pos.distanceTo(t.position) < 3.2) {
          const dir = new Vector3(t.position.x - this.pos.x, 0, t.position.z - this.pos.z).normalize();
          this.ctx.combat.resolve(this.owner, t, this.hit, t.centerPoint(new Vector3()), dir);
        }
      }
      if (this.strikeT > 1.0) {
        this.strikeT = -1;
        this.cooldown = 1.3;
        this.animator.play(this.clips.idle, 0.2);
      }
    } else {
      const foe = this.cooldown <= 0 ? this.nearestFoe() : null;
      if (foe) {
        this.target = foe;
        this.strikeT = 0;
        this.animator.play(attackClip(getAttack('gk_sweep'), 'knight'), 0.08, 1.7);
      } else {
        // Follow at the owner's shoulder.
        const side = new Vector3(Math.cos(this.owner.facing), 0, -Math.sin(this.owner.facing));
        const goal = this.owner.position.clone().addScaledVector(side, -1.6).add(new Vector3(-Math.sin(this.owner.facing) * 0.8, 0, -Math.cos(this.owner.facing) * 0.8));
        const to = goal.sub(this.pos).setY(0);
        const d = to.length();
        if (d > 0.3) {
          this.pos.addScaledVector(to.normalize(), Math.min(d, Math.max(2, d * 2.5) * dt));
          this.facing = rotateTowardsAngle(this.facing, yawFromDir(to.x, to.z), 8 * dt);
        } else this.facing = rotateTowardsAngle(this.facing, this.owner.facing, 4 * dt);
      }
    }
    this.pos.y = this.owner.position.y + 0.15 + Math.sin(this.time * 2) * 0.06; // hovers slightly
    this.rig.root.position.copy(this.pos);
    this.rig.root.rotation.y = this.facing;
    this.rig.applyPose(this.animator.update(dt));
    if (Math.random() < dt * 12) {
      const p = this.pos.clone().add(new Vector3((Math.random() - 0.5) * 0.8, Math.random() * 2, (Math.random() - 0.5) * 0.8));
      this.ctx.vfx.sparks.emit(p, new Vector3(0, 0.6, 0), '#bcd4ff', 0.9, 0.08, -0.4, 1);
    }
    return true;
  }
}
