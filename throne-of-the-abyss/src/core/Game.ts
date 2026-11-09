import { Vector3 } from 'three';
import { GeometryDetail } from '@/render/SmoothGeometry';
import { EventBus } from './EventBus';
import type { GameEvents } from './GameEvents';
import { GameTime } from './Time';
import type { GameContext } from './GameContext';
import { loadSettings, saveSettings, type GameSettings } from './Settings';
import { clamp, damp } from './MathUtils';
import { GameRenderer } from '@/render/Renderer';
import { profileFor, type GraphicsProfile } from '@/render/GraphicsSettings';
import { InputManager } from '@/input/InputManager';
import { CollisionWorld } from '@/physics/CollisionWorld';
import { VFXManager } from '@/vfx/VFXManager';
import { ThirdPersonCamera, type CameraOverride } from '@/camera/ThirdPersonCamera';
import { CombatSystem } from '@/combat/CombatSystem';
import { ProjectileSystem } from '@/magic/ProjectileSystem';
import { Player } from '@/characters/player/Player';
import { Enemy } from '@/characters/enemies/Enemy';
import { EnemyDirector } from '@/characters/enemies/EnemyDirector';
import { ENEMIES } from '@/data/enemies';
import { CONSUMABLES } from '@/data/items';
import { LORE, type LoreEntry } from '@/data/lore';
import { buildAshenCourtyard, type LevelInstance } from '@/world/levels/AshenCourtyard';
import { EnvironmentSystem } from '@/world/environment/EnvironmentSystem';
import type { WeatherKind } from '@/world/environment/Weather';
import type { SigilAltar } from '@/world/SigilAltar';
import { Pickup } from '@/world/Pickup';
import type { ArmorSlot } from '@/items/ItemTypes';
import { applyGrant, type ItemGrant } from '@/items/Grants';
import type { Interactable } from '@/world/Interactable';
import { HUD } from '@/ui/HUD';
import { Menus, type MapData, type MenuHost } from '@/ui/Menus';
import { SaveSystem, SAVE_VERSION, type SaveData } from '@/save/SaveSystem';
import type { AttributeId } from '@/rpg/Attributes';
import { PlayerProgress } from '@/rpg/PlayerProgress';
import { EXPLORE_CELL, EXPLORE_N, LOCATIONS } from '@/data/locations';
import type { MinimapMarker } from '@/ui/Minimap';

type Mode = 'title' | 'playing' | 'dead';

interface Cinematic {
  time: number;
  duration: number;
  skippable: boolean;
  update(t: number, o: CameraOverride): void;
  onEnd(): void;
}

export interface GameOptions {
  /** Automated test mode: no pointer-lock requirement, no auto-pause on blur. */
  testMode: boolean;
  quality?: GraphicsProfile['preset'];
  skipTitle?: boolean;
}

/**
 * Top-level orchestrator: owns services, the level, characters, UI and the frame loop.
 * Game rules that span systems (death & echo recovery, altar rest & respawns, save/load,
 * boss encounters) live here.
 */
export class Game implements MenuHost {
  readonly settings: GameSettings;
  readonly renderer: GameRenderer;
  readonly input: InputManager;
  readonly time = new GameTime();
  readonly events = new EventBus<GameEvents>();
  readonly world = new CollisionWorld();
  readonly vfx: VFXManager;
  readonly camera: ThirdPersonCamera;
  readonly combat: CombatSystem;
  readonly projectiles: ProjectileSystem;
  readonly director = new EnemyDirector();
  readonly ctx: GameContext;
  readonly level: LevelInstance;
  readonly env: EnvironmentSystem;
  readonly player: Player;
  readonly enemies: Enemy[] = [];
  readonly hud: HUD;
  readonly menus: Menus;
  readonly saves = new SaveSystem();
  mode: Mode = 'title';
  private profile: GraphicsProfile;
  private last = performance.now();
  private playtime = 0;
  private lastAltar: SigilAltar | null = null;
  private restingAltar: SigilAltar | null = null;
  private takenPickups = new Set<string>();
  private readLore = new Set<string>();
  private defeatedBosses = new Set<string>();
  private lostEchoes: { amount: number; position: Vector3; remnant: Pickup } | null = null;
  private cinematic: Cinematic | null = null;
  private readonly override: CameraOverride = { position: new Vector3(), lookAt: new Vector3() };
  private bossIntroDone = new Set<string>();
  private activeBoss: Enemy | null = null;
  private damageFlash = 0;
  private deathTimer = 0;
  private slowMoTimer = 0;
  private lastSafePos = new Vector3();
  private gateBannerShown = false;
  private king!: Enemy;
  private discovered = new Set<string>();
  private explored = new Uint8Array(EXPLORE_N * EXPLORE_N);
  private discoverTimer = 0;
  private placeName = 'Ashen Kingdom';
  private worldImageCache: HTMLCanvasElement | null = null;
  private kingKnights: Enemy[] = [];
  private kingSummons = 0;
  private titleTime = 0;
  private mapImage: HTMLCanvasElement | undefined;
  private running = false;
  frameCount = 0;

  constructor(
    canvas: HTMLCanvasElement,
    uiRoot: HTMLElement,
    readonly options: GameOptions,
  ) {
    this.settings = loadSettings();
    if (options.quality) this.settings.quality = options.quality;
    this.profile = profileFor(this.settings.quality);
    GeometryDetail.value = this.profile.geometryDetail;
    this.renderer = new GameRenderer(canvas, this.profile);
    this.input = new InputManager(canvas);
    this.input.allowUnlockedMouse = options.testMode;
    this.vfx = new VFXManager(this.renderer.scene);
    this.vfx.setDensity(this.profile.particleDensity);
    this.camera = new ThirdPersonCamera(this.renderer.camera, this.world);
    this.ctx = {
      scene: this.renderer.scene,
      world: this.world,
      events: this.events,
      time: this.time,
      vfx: this.vfx,
      combat: null as unknown as CombatSystem,
      camera: this.camera,
      projectiles: null as unknown as ProjectileSystem,
      profile: this.profile,
    };
    this.combat = new CombatSystem(this.ctx);
    this.ctx.combat = this.combat;
    this.projectiles = new ProjectileSystem(this.ctx);
    this.ctx.projectiles = this.projectiles;

    this.env = new EnvironmentSystem(this.renderer.scene, this.renderer.renderer, this.profile);
    this.level = buildAshenCourtyard(this.ctx);
    this.player = new Player(this.ctx, this.input);
    this.combat.register(this.player);
    for (const spawn of this.level.enemySpawns) {
      const e = new Enemy(this.ctx, ENEMIES[spawn.type], spawn, this.director);
      this.enemies.push(e);
      this.combat.register(e);
    }
    this.wireThroneHall();
    this.player.interactables = () => this.interactables();
    this.player.onRestBegin = () => window.setTimeout(() => this.player.isResting && this.menus.showAltar(), 650);
    this.wireLevel();
    this.wireEvents();

    this.hud = new HUD(uiRoot);
    this.menus = new Menus(uiRoot, this);
    this.applySettings();
    this.renderer.syncMaterials();
    this.setupPointer(canvas);
    this.resetWorldState();
    this.placePlayerAtStart(true);
    window.addEventListener('resize', () => this.onResize());
    this.onResize();
  }

  // ===================================================================================
  // Setup
  // ===================================================================================
  private onResize(): void {
    const h = window.innerHeight * this.renderer.renderer.getPixelRatio();
    this.vfx.setViewportHeight(h);
    this.level.atmosphere.setViewportHeight(h);
  }

  private setupPointer(canvas: HTMLCanvasElement): void {
    canvas.addEventListener('click', () => {
      if (this.mode === 'playing' && !this.menus.blocking) this.input.requestPointerLock();
    });
    document.addEventListener('pointerlockchange', () => {
      const locked = this.input.pointerLocked;
      this.hud.setPointerHint(!locked && this.mode === 'playing' && !this.options.testMode);
      if (!locked && this.mode === 'playing' && !this.menus.blocking && !this.options.testMode && !this.cinematic) {
        this.menus.showPause();
      }
    });
  }

  private interactables(): Interactable[] {
    const throne = this.level.hall.altar;
    const list: Interactable[] = [...this.level.altars.filter((a) => a !== throne || this.throneUnlocked), ...this.level.chests, ...this.level.pickups];
    if (this.lostEchoes) list.push(this.lostEchoes.remnant);
    return list;
  }

  private get throneUnlocked(): boolean {
    return this.defeatedBosses.has(this.level.hall.kingSpawn.id);
  }

  /** Throne Hall rules: the king raises fallen knights; the altar wakes after his fall. */
  private wireThroneHall(): void {
    const hall = this.level.hall;
    this.king = this.enemies.find((e) => e.spawn.id === hall.kingSpawn.id)!;
    this.kingKnights = this.enemies.filter((e) => hall.knightSpawns.some((k) => k.id === e.spawn.id));
    this.king.summonHook = {
      available: (boss) => this.kingSummons < boss.phase && this.kingKnights.every((k) => k.dead),
      raise: (boss) => {
        this.kingSummons = boss.phase;
        const pts = hall.summonPoints(boss.position, boss.facing);
        this.kingKnights.forEach((k, i) => {
          k.setPlayer(this.player);
          k.awaken(pts[i % pts.length], boss.facing);
        });
        this.hud.toast('The Fallen King calls his knights', 'Oath-bound dead rise from the floor');
      },
    };
  }

  private refreshThroneAltar(): void {
    this.level.hall.altar.group.visible = this.throneUnlocked;
  }

  /** Start the fight when the player steps into the hall; seal the way out behind them. */
  private updateThroneHall(): void {
    const hall = this.level.hall;
    const k = this.king;
    if (k.dead || this.mode !== 'playing') return;
    const inside = hall.contains(this.player.position);
    if (inside && !k.aggro && !this.player.dead) {
      k.setPlayer(this.player);
      k.becomeAggro();
    }
    if (k.aggro && inside && !hall.barrier.sealed) hall.barrier.setSealed(true);
  }

  private wireLevel(): void {
    for (const a of this.level.altars) {
      a.onKindle = (altar) => {
        this.lastAltar = altar;
        this.player.respawnPoint.copy(altar.standPoint());
        this.player.respawnYaw = altar.respawnYaw;
        this.hud.showBanner('SIGIL ALTAR KINDLED', altar.name, 'banner', 3);
        this.vfx.soulRelease(altar.position.clone().setY(altar.position.y + 2.2), '#b46bff', 90);
        this.autosave();
      };
      a.onRest = (altar) => this.restAt(altar);
    }
    for (const c of this.level.chests) {
      c.onOpen = (chest) => {
        this.grantAll(chest.contents);
        this.vfx.soulRelease(chest.position.clone().setY(chest.position.y + 0.7), '#ffd27a', 40);
        this.autosave();
      };
    }
    for (const p of this.level.pickups) p.onTake = (pk) => this.takePickup(pk);
  }

  private takePickup(pk: Pickup): void {
    this.takenPickups.add(pk.id);
    const c = pk.content;
    if (c.kind === 'lore') {
      const entry = LORE[c.loreId];
      this.readLore.add(entry.id);
      this.hud.toast(entry.title, 'Added to journal');
      this.openReader(entry);
    } else if (c.kind === 'consumable') {
      const slot = this.player.inventory.belt.find((b) => b.id === c.id);
      if (slot) slot.count = Math.min(slot.max, slot.count + c.amount);
      this.hud.toast(CONSUMABLES[c.id].name, `+${c.amount}`);
    } else if (c.kind === 'flaskUpgrade') {
      const slot = this.player.inventory.belt.find((b) => b.id === c.id);
      if (slot) {
        slot.max += 1;
        slot.count += 1;
      }
      this.hud.toast('Ichor Shard', `${CONSUMABLES[c.id].name} charges increased`);
    } else if (c.kind === 'echoes') {
      this.player.progress.echoes += c.amount;
      this.hud.toast('Echoes of the fallen', `+${c.amount}`);
    } else if (c.kind === 'item') {
      this.grantAll([c.grant]);
    }
    this.autosave();
  }

  /** Hand items to the player, one toast each (staggered so they stay readable). */
  private grantAll(list: ItemGrant[], delay = 0): void {
    for (const g of list) {
      const t = applyGrant(this.player.inventory, g);
      if (!t) continue;
      window.setTimeout(() => this.hud.toast(t.title, t.sub), delay);
      delay += 900;
    }
  }

  private openReader(entry: LoreEntry): void {
    this.player.inputLocked = true;
    this.input.exitPointerLock();
    this.menus.showReader(entry);
  }

  private wireEvents(): void {
    const ev = this.events;
    ev.on('hit', (h) => {
      if (h.target === this.player) {
        this.damageFlash = Math.min(1, this.damageFlash + 0.35 + (h.heavy ? 0.3 : 0));
      } else if (h.target instanceof Enemy) {
        this.hud.onDamage(h.target, h.result.total);
        if (h.result.critical) this.camera.fovKick = 5;
      }
    });
    ev.on('statusProc', (s) => {
      if (s.target === this.player) this.hud.toast(s.status === 'bleed' ? 'Hemorrhage' : 'Poisoned', s.status === 'bleed' ? `-${s.damage}` : 'Health drains');
      else if (s.target instanceof Enemy) this.hud.onDamage(s.target, s.damage);
    });
    ev.on('parried', (p) => {
      if (p.parrier === this.player) this.hud.toast('Parried', 'Strike now for a riposte');
    });
    ev.on('guardBreak', (g) => {
      if (g.target === this.player) this.hud.toast('Guard broken');
    });
    ev.on('notify', (n) => {
      if (n.kind === 'item' || n.kind === 'info') this.hud.toast(n.text, n.sub);
      else this.hud.showBanner(n.text, n.sub ?? '', n.kind === 'death' ? 'death' : n.kind === 'victory' ? 'victory' : n.kind === 'area' ? 'area' : 'banner');
    });
    ev.on('died', ({ character }) => {
      if (character === this.player) this.onPlayerDeath();
      else if (character instanceof Enemy) this.onEnemyDeath(character);
    });
    ev.on('bossEngaged', ({ boss }) => {
      if (!(boss instanceof Enemy)) return;
      this.activeBoss = boss;
      this.hud.setBoss(boss);
      if (!this.bossIntroDone.has(boss.spawn.id)) {
        this.bossIntroDone.add(boss.spawn.id);
        if (boss === this.king) this.playKingIntro(boss);
        else this.playBossIntro(boss);
      }
    });
    ev.on('bossPhase', ({ boss }) => {
      if (!(boss instanceof Enemy)) return;
      const p2 = boss.data.phase2;
      if (p2) this.hud.showBanner(p2.message.toUpperCase(), p2.sub, 'banner', 2.6);
      else this.hud.toast(`${boss.data.name.split(',')[0]} awakens the abyss within`, 'The oath-blade burns violet');
    });
  }

  // ===================================================================================
  // World state
  // ===================================================================================
  private resetWorldState(): void {
    this.takenPickups.clear();
    this.readLore.clear();
    this.defeatedBosses.clear();
    this.bossIntroDone.clear();
    this.lastAltar = null;
    this.gateBannerShown = false;
    this.playtime = 0;
    this.env.time.set(9.5);
    this.env.weather.set('clear', true);
    for (const a of this.level.altars) a.setKindled(false);
    for (const c of this.level.chests) c.setOpened(false);
    for (const p of this.level.pickups) p.setTaken(false);
    this.level.gate.setOpen(false);
    this.level.hall.barrier.setSealed(false);
    this.kingSummons = 0;
    this.discovered.clear();
    this.explored.fill(0);
    this.clearLostEchoes();
    this.player.progress.attributes = { ...new PlayerProgress().attributes };
    this.player.progress.echoes = 0;
    const fresh = new (this.player.inventory.constructor as new () => Player['inventory'])();
    this.player.inventory.restore(fresh.serialize());
    this.player.equipWeapon(this.player.inventory.weapon);
    this.player.applyProgress(true);
    this.respawnEnemies(true);
    this.refreshThroneAltar();
  }

  private placePlayerAtStart(kneel: boolean): void {
    const p = this.player;
    p.respawnPoint.copy(this.level.playerStart);
    p.respawnYaw = this.level.playerYaw;
    p.respawn();
    if (kneel) {
      p.beginRestSilently();
    }
    this.lastSafePos.copy(p.position);
  }

  private respawnEnemies(all: boolean): void {
    this.director.clear();
    this.level.hall.barrier.setSealed(false);
    this.kingSummons = 0;
    this.projectiles.clear();
    for (const e of this.enemies) {
      if (!all && this.defeatedBosses.has(e.spawn.id)) continue;
      if (this.defeatedBosses.has(e.spawn.id)) continue;
      e.reset();
      e.setPlayer(this.mode === 'title' ? null : this.player);
    }
    for (const e of this.enemies) {
      if (this.defeatedBosses.has(e.spawn.id)) {
        e.dead = true;
        e.setVisible(false);
      }
    }
    if (this.activeBoss) {
      this.activeBoss = null;
      this.hud.setBoss(null);
    }
  }

  private clearLostEchoes(): void {
    if (this.lostEchoes) this.ctx.scene.remove(this.lostEchoes.remnant.group);
    this.lostEchoes = null;
  }

  private spawnRemnant(amount: number, pos: Vector3): void {
    this.clearLostEchoes();
    const remnant = new Pickup('echo_remnant', pos.clone(), { kind: 'echoes', amount }, this.vfx, '#ffd27a');
    remnant.prompt = () => (remnant.taken ? null : 'Reclaim lost echoes');
    remnant.onTake = () => {
      this.player.progress.echoes += amount;
      this.vfx.soulRelease(remnant.position.clone().setY(remnant.position.y + 0.8), '#ffd27a', 70);
      this.hud.toast('Echoes reclaimed', `+${amount}`);
      this.clearLostEchoes();
      this.autosave();
    };
    this.ctx.scene.add(remnant.group);
    this.lostEchoes = { amount, position: pos.clone(), remnant };
  }

  // ===================================================================================
  // Game flow
  // ===================================================================================
  start(): void {
    if (this.running) return;
    this.running = true;
    if (this.options.skipTitle) this.newGame(false);
    else this.toTitle();
    const loop = (now: number) => {
      this.frame(now);
      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
  }

  private toTitle(): void {
    this.mode = 'title';
    this.titleTime = 0;
    this.player.inputLocked = true;
    this.input.exitPointerLock();
    this.hud.setVisible(false);
    for (const e of this.enemies) e.setPlayer(null);
    this.menus.showTitle();
  }

  hasSave(): boolean {
    return this.saves.has();
  }

  newGame(withIntro = true): void {
    this.saves.clear();
    this.menus.closeAll();
    this.camera.setOverride(null);
    this.resetWorldState();
    this.mode = 'playing';
    this.placePlayerAtStart(true);
    for (const e of this.enemies) e.setPlayer(this.player);
    this.hud.setVisible(true);
    if (withIntro) this.playOpening();
    else {
      this.player.endRest();
      this.player.inputLocked = false;
    }
    this.input.requestPointerLock();
  }

  continueGame(): void {
    const data = this.saves.load();
    if (!data) {
      this.newGame();
      return;
    }
    this.menus.closeAll();
    this.camera.setOverride(null);
    this.resetWorldState();
    this.mode = 'playing';
    this.applySave(data);
    for (const e of this.enemies) if (!this.defeatedBosses.has(e.spawn.id)) e.setPlayer(this.player);
    this.hud.setVisible(true);
    this.player.inputLocked = false;
    this.hud.showBanner(this.level.name.toUpperCase(), this.level.region, 'area', 3.5);
    this.input.requestPointerLock();
  }

  resume(): void {
    this.menus.closeAll();
    if (this.mode === 'title') {
      this.menus.showTitle();
      return;
    }
    this.player.inputLocked = !!this.cinematic;
    if (this.player.isResting) {
      this.menus.showAltar();
      return;
    }
    this.input.requestPointerLock();
  }

  quitToTitle(): void {
    if (this.mode === 'playing' && !this.player.dead) this.autosave();
    this.cinematic = null;
    this.camera.setOverride(null);
    this.resetWorldState();
    this.placePlayerAtStart(true);
    this.toTitle();
  }

  private restAt(altar: SigilAltar): void {
    this.restingAltar = altar;
    this.lastAltar = altar;
    this.player.respawnPoint.copy(altar.standPoint());
    this.player.respawnYaw = altar.respawnYaw;
    this.player.lockTarget = null;
    this.player.faceTowards(altar.position);
    this.player.beginRest();
    this.player.inputLocked = true;
    this.player.restoreAll();
    this.player.inventory.refill();
    this.respawnEnemies(false);
    this.input.exitPointerLock();
    this.autosave();
  }

  leaveAltar(): void {
    this.restingAltar = null;
    this.player.endRest();
    window.setTimeout(() => {
      if (!this.menus.blocking && !this.cinematic) this.player.inputLocked = false;
    }, 900);
    this.input.requestPointerLock();
  }

  currentAltar(): { id: string; name: string } | null {
    return this.restingAltar ? { id: this.restingAltar.id, name: this.restingAltar.name } : null;
  }

  kindledAltars(): Array<{ id: string; name: string }> {
    return this.level.altars.filter((a) => a.kindled).map((a) => ({ id: a.id, name: a.name }));
  }

  travelTo(id: string): void {
    const a = this.level.altars.find((x) => x.id === id && x.kindled);
    if (!a) return;
    const sp = a.standPoint();
    this.player.motor.teleport(sp.x, sp.y, sp.z);
    this.player.facing = a.respawnYaw;
    this.camera.snapBehind(a.respawnYaw + Math.PI);
    this.vfx.soulRelease(this.player.centerPoint(new Vector3()), '#b46bff', 60);
    this.restAt(a);
    window.setTimeout(() => this.menus.showAltar(), 50);
  }

  /** Altar option: let time pass to the next part of the day. */
  passTime(): string {
    const h = this.env.time.hours;
    const stops = [8, 13, 19, 23];
    const next = stops.find((s) => s > h + 0.25) ?? stops[0];
    this.env.time.set(next);
    return this.env.time.label;
  }

  worldTime(): string {
    return this.env.describe();
  }

  levelUp(alloc: Partial<Record<AttributeId, number>>): boolean {
    const ok = this.player.progress.levelUp(alloc);
    if (ok) {
      this.player.applyProgress(true);
      this.vfx.soulRelease(this.player.centerPoint(new Vector3()), '#ffd27a', 80);
      this.autosave();
    }
    return ok;
  }

  equipWeapon(index: number): void {
    const inv = this.player.inventory;
    if (index < 0 || index >= inv.weapons.length) return;
    inv.rightHand = index;
    this.player.equipWeapon(inv.weapon);
  }

  equipArmor(slot: ArmorSlot, id: string | null): void {
    if (this.player.inventory.equipArmor(slot, id)) this.player.applyProgress(false);
  }

  equipAccessory(target: 0 | 1 | 'amulet', id: string | null): void {
    if (this.player.inventory.equipAccessory(target, id)) this.player.applyProgress(false);
  }

  dropWeapon(index: number): void {
    const inv = this.player.inventory;
    if (index === inv.rightHand || inv.weapons.length <= 1) return;
    inv.weapons.splice(index, 1);
    if (inv.rightHand > index) inv.rightHand--;
  }

  useItemFromMenu(index: number): void {
    const slot = this.player.inventory.belt[index];
    if (!slot || slot.count <= 0) return;
    this.player.inventory.beltIndex = index;
    slot.count--;
    const d = CONSUMABLES[slot.id];
    if (d.effect.kind === 'heal') this.player.heal(this.player.maxHp * d.effect.fraction);
    else if (d.effect.kind === 'mana') this.player.mana = Math.min(this.player.maxMana, this.player.mana + this.player.maxMana * d.effect.fraction);
    else this.player.buildup[d.effect.status] = 0;
  }

  // ===================================================================================
  // Death & enemies
  // ===================================================================================
  private onPlayerDeath(): void {
    this.mode = 'dead';
    this.deathTimer = 0;
    this.player.lockTarget = null;
    const amount = this.player.progress.echoes;
    this.player.progress.echoes = 0;
    if (amount > 0) {
      const pos = this.player.position.y < this.world.killY + 1 ? this.lastSafePos : this.player.position;
      this.spawnRemnant(amount, pos);
    } else this.clearLostEchoes();
    this.time.timeScale = 0.6;
    window.setTimeout(() => this.hud.showBanner('THY FLAME FADES', '', 'death', 3.6), 700);
    this.autosave();
  }

  private respawnPlayer(): void {
    this.time.timeScale = 1;
    this.mode = 'playing';
    this.player.respawn();
    this.respawnEnemies(false);
    this.lastSafePos.copy(this.player.position);
    this.player.inputLocked = false;
    this.camera.snapBehind(this.player.respawnYaw);
    this.hud.hideBanner();
    this.autosave();
  }

  private onEnemyDeath(e: Enemy): void {
    const m = this.player.mods;
    const amount = Math.round(e.data.echoes * m.echoGainMul);
    if (m.healOnKill > 0 && !this.player.dead) this.player.heal(this.player.maxHp * m.healOnKill);
    this.player.progress.echoes += amount;
    this.events.emit('echoes', { amount, total: this.player.progress.echoes });
    this.vfx.soulRelease(e.centerPoint(new Vector3()), e.isBoss ? '#ff4a6a' : '#ffb070', e.isBoss ? 160 : 50);
    // Keep fighting: the lock hops to the next nearest foe close by.
    if (this.player.lockTarget === e) this.player.retarget(e);
    if (!e.data.respawns) {
      this.defeatedBosses.add(e.spawn.id);
      this.slowMoTimer = 1.6;
      this.time.timeScale = 0.35;
      this.hud.showBanner(e.data.victoryBanner ?? 'FOE FELLED', e.data.name, 'victory', 4.5);
      if (e === this.activeBoss) window.setTimeout(() => this.hud.setBoss(null), 3000);
      this.activeBoss = null;
      if (e.data.id === 'gravebound_knight') {
        this.level.gate.setOpen(true);
        window.setTimeout(() => this.hud.toast('The seal upon the Gate of Eternity shatters'), 4200);
      }
      if (e === this.king) this.onKingDefeated();
      if (e.data.drops?.length) this.grantAll(e.data.drops, 5600);
      this.autosave();
    }
  }

  private onKingDefeated(): void {
    const hall = this.level.hall;
    hall.barrier.setSealed(false);
    for (const k of this.kingKnights) {
      if (k.dead) continue;
      this.vfx.soulRelease(k.centerPoint(new Vector3()), '#ffb02a', 50);
      k.reset();
    }
    this.refreshThroneAltar();
    this.vfx.soulRelease(hall.altar.position.clone().setY(hall.altar.position.y + 1.5), '#b46bff', 120);
    this.playVictory(this.king);
    window.setTimeout(() => this.hud.toast('The Ashen Throne stands empty', 'A Sigil Altar wakes before it'), 4600);
  }

  // ===================================================================================
  // Cinematics
  // ===================================================================================
  private playOpening(): void {
    const start = new Vector3(6, 16, -6);
    const mid = new Vector3(4, 4.5, -28);
    const look0 = new Vector3(0, 14, 40);
    const p = this.player.position;
    this.player.inputLocked = true;
    this.cinematic = {
      time: 0,
      duration: 6.2,
      skippable: true,
      update: (t, o) => {
        const k = Math.min(1, t / 5.2);
        const e = k * k * (3 - 2 * k);
        o.position.lerpVectors(start, mid, e);
        o.lookAt.lerpVectors(look0, new Vector3(p.x, p.y + 1.2, p.z), Math.min(1, e * 1.3));
        if (t > 1.2 && t - 1 / 60 <= 1.2) this.hud.showBanner(this.level.name.toUpperCase(), this.level.region, 'area', 3.8);
        if (t > 4.6 && this.player.isResting) this.player.endRest();
      },
      onEnd: () => {
        if (this.player.isResting) this.player.endRest();
        this.player.inputLocked = false;
        this.camera.snapBehind(this.player.facing);
        this.hud.toast('Esc — menu, controls & settings');
      },
    };
  }

  /** The king, kneeling before his throne, rises as the camera sweeps down the nave. */
  private playKingIntro(boss: Enemy): void {
    const p0 = this.player.position.clone();
    const target = boss.position.clone().setY(boss.position.y + boss.hurtHeight * 0.6);
    boss.faceTowards(this.player.position);
    boss.roar();
    this.player.inputLocked = true;
    this.player.lockTarget = boss;
    const from = new Vector3(p0.x - 2.5, p0.y + 3.4, p0.z - 5);
    const to = new Vector3();
    this.cinematic = {
      time: 0,
      duration: 4.2,
      skippable: true,
      update: (t, o) => {
        const k = Math.min(1, t / 3.4);
        const e = k * k * (3 - 2 * k);
        const ang = boss.facing + 0.65 - e * 0.5;
        to.set(boss.position.x + Math.sin(ang) * 6.5, boss.position.y + 1.8, boss.position.z + Math.cos(ang) * 6.5);
        o.position.copy(from).lerp(to, e);
        o.lookAt.copy(target);
        if (t > 1.8 && t - 1 / 60 <= 1.8) this.hud.showBanner(boss.data.name.toUpperCase(), boss.data.bossTitle ?? '', 'banner', 2.4);
      },
      onEnd: () => {
        this.player.inputLocked = false;
      },
    };
  }

  /** Slow orbit around the fallen boss while the victory banner plays. */
  private playVictory(boss: Enemy): void {
    const c = boss.position.clone();
    const a0 = boss.facing + 1.2;
    this.player.inputLocked = true;
    this.cinematic = {
      time: 0,
      duration: 4.6,
      skippable: true,
      update: (t, o) => {
        const a = a0 + t * 0.32;
        o.position.set(c.x + Math.sin(a) * 7.5, c.y + 2.6 + t * 0.25, c.z + Math.cos(a) * 7.5);
        o.lookAt.set(c.x, c.y + 1.1, c.z);
      },
      onEnd: () => {
        this.player.inputLocked = false;
      },
    };
  }

  private playBossIntro(boss: Enemy): void {
    const fwd = new Vector3(Math.sin(boss.facing), 0, Math.cos(boss.facing));
    const target = boss.position.clone().setY(boss.position.y + boss.hurtHeight * 0.65);
    boss.faceTowards(this.player.position);
    boss.roar();
    this.player.inputLocked = true;
    this.player.lockTarget = boss;
    this.cinematic = {
      time: 0,
      duration: 2.6,
      skippable: true,
      update: (t, o) => {
        const ang = boss.facing + 0.5 - t * 0.12;
        const dist = 5.6 - t * 0.5;
        o.position.set(boss.position.x + Math.sin(ang) * dist, boss.position.y + 1.4 + t * 0.15, boss.position.z + Math.cos(ang) * dist);
        o.lookAt.copy(target);
        if (t > 0.5 && t - 1 / 60 <= 0.5) this.hud.showBanner(boss.data.name.toUpperCase(), boss.data.bossTitle ?? '', 'banner', 2.2);
        void fwd;
      },
      onEnd: () => {
        this.player.inputLocked = false;
      },
    };
  }

  private updateCinematic(realDt: number): void {
    const c = this.cinematic;
    if (!c) return;
    c.time += realDt;
    const skip = c.skippable && c.time > 0.4 && (this.input.pressed('Pause') || this.input.pressed('Jump') || this.input.pressed('LightAttack'));
    if (skip) {
      this.input.consume('Pause');
      this.input.consume('Jump');
      this.input.consume('LightAttack');
    }
    if (c.time >= c.duration || skip) {
      this.cinematic = null;
      this.camera.setOverride(null);
      c.onEnd();
      return;
    }
    c.update(c.time, this.override);
    this.camera.setOverride(this.override);
  }

  // ===================================================================================
  // Save / load
  // ===================================================================================
  private collectSave(): SaveData {
    const p = this.player;
    return {
      version: SAVE_VERSION,
      savedAt: Date.now(),
      playtime: this.playtime,
      player: {
        attributes: { ...p.progress.attributes },
        echoes: p.progress.echoes,
        lastAltar: this.lastAltar?.id ?? null,
        position: p.dead ? null : [p.position.x, p.position.y, p.position.z],
        yaw: p.facing,
      },
      inventory: p.inventory.serialize(),
      world: {
        level: this.level.id,
        kindledAltars: this.level.altars.filter((a) => a.kindled).map((a) => a.id),
        openedChests: this.level.chests.filter((c) => c.opened).map((c) => c.id),
        takenPickups: [...this.takenPickups],
        defeatedBosses: [...this.defeatedBosses],
        gateOpen: this.level.gate.open,
        discoveredRegions: [...this.discovered],
        explored: this.encodeExplored(),
        timeOfDay: this.env.time.hours,
        weather: this.env.weather.kind,
        readLore: [...this.readLore],
      },
      lostEchoes: this.lostEchoes
        ? { amount: this.lostEchoes.amount, position: [this.lostEchoes.position.x, this.lostEchoes.position.y, this.lostEchoes.position.z] }
        : null,
      npcs: {},
      quests: {
        q_ashen_gate: { stage: this.defeatedBosses.has('elite_vaelor') ? 2 : this.lastAltar ? 1 : 0, done: this.defeatedBosses.has('elite_vaelor') },
      },
    };
  }

  private applySave(d: SaveData): void {
    const p = this.player;
    p.progress.attributes = { ...d.player.attributes };
    p.progress.echoes = d.player.echoes;
    p.inventory.restore(d.inventory);
    p.equipWeapon(p.inventory.weapon);
    for (const a of this.level.altars) a.setKindled(d.world.kindledAltars.includes(a.id));
    for (const c of this.level.chests) c.setOpened(d.world.openedChests.includes(c.id));
    for (const pk of this.level.pickups) pk.setTaken(d.world.takenPickups.includes(pk.id));
    d.world.takenPickups.forEach((id) => this.takenPickups.add(id));
    (d.world.readLore ?? []).forEach((id) => this.readLore.add(id));
    d.world.defeatedBosses.forEach((id) => {
      this.defeatedBosses.add(id);
      this.bossIntroDone.add(id);
    });
    this.level.gate.setOpen(d.world.gateOpen);
    (d.world.discoveredRegions ?? []).forEach((id) => LOCATIONS.some((l) => l.id === id) && this.discovered.add(id));
    if (d.world.explored) this.decodeExplored(d.world.explored);
    this.refreshThroneAltar();
    if (typeof d.world.timeOfDay === 'number') this.env.time.set(d.world.timeOfDay);
    if (d.world.weather) this.env.weather.set(d.world.weather as WeatherKind, true);
    this.lastAltar = this.level.altars.find((a) => a.id === d.player.lastAltar) ?? null;
    if (this.lastAltar) {
      p.respawnPoint.copy(this.lastAltar.standPoint());
      p.respawnYaw = this.lastAltar.respawnYaw;
    } else {
      p.respawnPoint.copy(this.level.playerStart);
      p.respawnYaw = this.level.playerYaw;
    }
    this.playtime = d.playtime ?? 0;
    p.respawn();
    if (d.player.position) {
      p.motor.teleport(d.player.position[0], d.player.position[1], d.player.position[2]);
      p.facing = d.player.yaw;
    }
    this.camera.snapBehind(p.facing);
    this.respawnEnemies(false);
    if (d.lostEchoes) this.spawnRemnant(d.lostEchoes.amount, new Vector3(...d.lostEchoes.position));
    this.lastSafePos.copy(p.position);
  }

  saveGame(): boolean {
    if (this.mode === 'title') return false;
    return this.saves.save(this.collectSave());
  }

  private autosave(): void {
    if (this.mode === 'title') return;
    this.saves.save(this.collectSave());
  }

  // ===================================================================================
  // Settings
  // ===================================================================================
  applySettings(): void {
    const s = this.settings;
    saveSettings(s);
    if (s.quality !== this.profile.preset) {
      this.profile = profileFor(s.quality);
      this.ctx.profile = this.profile;
      this.renderer.applyProfile(this.profile);
      this.vfx.setDensity(this.profile.particleDensity);
      this.level.applyLightBudget(this.profile.maxPointLights);
      this.env.applyProfile(this.profile);
      this.level.overworld.water.setReflections(this.profile.waterReflections);
      this.level.overworld.foliage.treeDistance = this.profile.treeDistance;
      for (const c of [this.player, ...this.enemies]) c.setOutlines(this.profile.outlines);
      this.onResize();
    }
    this.input.mouseSensitivity = s.mouseSensitivity;
    this.input.invertY = s.invertY;
    this.camera.shake.intensity = s.cameraShake;
    this.hud.showDamageNumbers = s.damageNumbers;
    this.hud.setFpsVisible(s.showFps);
  }

  // ===================================================================================
  // Map & journal
  // ===================================================================================
  mapData(): MapData {
    return {
      colliders: [...this.world.all()].filter((c) => c.tag !== 'tree'),
      bounds: [-560, -560, 560, 560],
      terrainImage: this.mapImage ??= this.level.overworld.terrain.mapImage(560),
      player: { x: this.player.position.x, z: this.player.position.z, yaw: this.player.facing },
      altars: this.level.altars.filter((a) => a !== this.level.hall.altar || this.throneUnlocked).map((a) => ({ x: a.position.x, z: a.position.z, kindled: a.kindled, name: a.name })),
      lostEchoes: this.lostEchoes ? { x: this.lostEchoes.position.x, z: this.lostEchoes.position.z } : null,
      bosses: this.enemies.filter((e) => e.isBoss).map((e) => ({ x: e.spawn.position.x, z: e.spawn.position.z, alive: !this.defeatedBosses.has(e.spawn.id) })),
      explored: { cells: this.explored, n: EXPLORE_N, cell: EXPLORE_CELL },
      locations: LOCATIONS.filter((l) => this.discovered.has(l.id)).map((l) => ({ x: l.x, z: l.z, name: l.name })),
    };
  }

  journal(): { objectives: Array<{ text: string; done: boolean }>; lore: LoreEntry[] } {
    const kindled = this.level.altars[0].kindled;
    const chest = this.level.chests[0].opened;
    const boss = this.defeatedBosses.has('elite_vaelor');
    return {
      objectives: [
        { text: 'Kindle the Sigil Altar beneath the Ashen Gate', done: kindled },
        { text: 'Search the collapsed cloister to the west', done: chest },
        { text: 'Defeat Vaelor, the Gravebound, upon the cathedral steps', done: boss },
        { text: 'Pass through the Gate of Eternity', done: this.gateBannerShown },
        { text: 'Face the Fallen King in the Throne Hall', done: this.throneUnlocked },
      ],
      lore: [...this.readLore].map((id) => LORE[id]),
    };
  }

  // ===================================================================================
  // Frame
  // ===================================================================================
  /** When true the rAF loop stops stepping (automated tests drive `step` manually). */
  externalClock = false;

  private frame(now: number): void {
    const realDt = Math.min(0.05, Math.max(0, (now - this.last) / 1000));
    this.last = now;
    if (!this.externalClock) this.step(realDt);
  }

  /** Advance the simulation by `seconds` in fixed steps without rendering (tests). */
  simulate(seconds: number, dt = 1 / 60): void {
    const n = Math.round(seconds / dt);
    for (let i = 0; i < n; i++) this.step(dt, false);
  }

  /** One frame of simulation + rendering (public for deterministic test stepping). */
  step(realDt: number, render = true): void {
    this.frameCount++;
    this.input.enabled = !this.menus.blocking;
    this.input.update(realDt);

    if (this.mode === 'playing' && !this.menus.blocking && !this.cinematic && this.input.pressed('Pause')) {
      this.input.exitPointerLock();
      this.menus.showPause();
    }
    this.player.inputLocked = this.player.inputLocked || this.menus.blocking;
    if (!this.menus.blocking && this.mode === 'playing' && !this.cinematic && !this.player.isResting && this.player.inputLocked && this.menus.open === 'none' && this.player.state !== 'rest') {
      this.player.inputLocked = false;
    }

    const paused = this.menus.open === 'pause' || this.menus.open === 'reader';
    const dt = paused ? 0 : this.time.advance(realDt);
    if (!paused) this.playtime += realDt;

    if (this.slowMoTimer > 0) {
      this.slowMoTimer -= realDt;
      if (this.slowMoTimer <= 0 && this.mode !== 'dead') this.time.timeScale = 1;
    }

    if (dt > 0) {
      this.player.update(dt);
      for (const e of this.enemies) if (!e.asleep && (!e.isDefeatedPermanently || e.stateTime < 6)) e.update(dt);
      this.combat.update();
      this.projectiles.update(dt);
      this.checkBreakables();
      if (this.player.motor.grounded && !this.player.dead) this.lastSafePos.copy(this.player.position);
      this.checkGateThreshold();
      this.updateThroneHall();
      this.updateExploration(dt);
    }

    if (this.mode === 'dead') {
      this.deathTimer += realDt;
      if (this.deathTimer > 5.0) this.respawnPlayer();
    }

    // Camera
    if (this.mode === 'title') {
      this.titleTime += realDt;
      const a = this.titleTime * 0.05 + 2.4;
      this.override.position.set(Math.sin(a) * 24, 8 + Math.sin(this.titleTime * 0.1) * 1.5, Math.cos(a) * 24);
      this.override.lookAt.set(0, 4.5, 8);
      this.camera.setOverride(this.override);
    } else {
      this.updateCinematic(realDt);
    }
    if (!paused || this.mode === 'title') {
      const look = this.player.inputLocked || this.mode !== 'playing' ? { x: 0, y: 0 } : this.input.look;
      if (!this.player.lockTarget && this.mode === 'playing' && this.input.wheel !== 0 && !this.menus.blocking) this.camera.zoom(this.input.wheel);
      this.camera.update(realDt, this.player.position, look, this.player.lockPointTarget);
    }
    this.renderer.fovOffset = this.camera.fovKick + (this.player.sprinting ? 3 : 0);

    // World / effects / UI
    const envDt = paused ? 0 : realDt;
    this.env.update(envDt, this.player.position, this.renderer.camera.position);
    this.renderer.renderer.toneMappingExposure = this.env.exposure;
    const L = this.env.time.lighting();
    this.level.overworld.water.update(envDt, L.night > 0.5 ? L.moonDir : L.sunDir, this.env.sun.color, this.env.night, this.renderer.camera.position);
    this.level.update(envDt, this.renderer.camera.position, { night: this.env.night, wind: this.env.weather.current.wind });
    this.lostEchoes?.remnant.update(dt);
    this.vfx.update(dt);
    this.damageFlash = damp(this.damageFlash, 0, 3.5, realDt);
    const lowHp = this.mode === 'playing' && this.player.hp / this.player.maxHp < 0.25 ? 0.18 + Math.sin(performance.now() * 0.006) * 0.06 : 0;
    this.renderer.post.grade.uniforms.uDamage.value = clamp(Math.max(this.damageFlash, lowHp), 0, 1);
    this.renderer.post.grade.uniforms.uDesaturate.value = this.mode === 'dead' ? Math.min(0.8, this.deathTimer * 0.4) : 0;
    this.renderer.post.grade.uniforms.uAberration.value = this.time.inHitStop ? 0.006 : 0;
    if (render) {
      this.hud.update(realDt, this.player, this.enemies, this.renderer.camera);
      this.updateMinimap(realDt);
      this.renderer.render(realDt);
    }
  }

  private checkBreakables(): void {
    const atk = this.player.attack;
    if (!atk) return;
    const d = atk.data;
    const active = (atk.time >= d.startup && atk.time < d.startup + d.active) || atk.holdActive;
    if (!active) return;
    for (const b of this.level.breakables) {
      if (b.hitBy(this.player.weaponBase, this.player.weaponTip, this.player.weaponModel.hitRadius)) {
        b.shatter(this.vfx);
        if (b.echoes > 0) {
          this.player.progress.echoes += b.echoes;
          this.vfx.soulRelease(b.position.clone().setY(b.position.y + 0.5), '#ffd27a', 25);
        }
      }
    }
  }

  // ===================================================================================
  // Open world: discovery, exploration, minimap
  // ===================================================================================
  private updateExploration(dt: number): void {
    if (this.mode !== 'playing') return;
    const p = this.player.position;
    // Reveal map cells around the player (fog of war on the big map).
    const half = this.level.overworld.terrain.size / 2;
    const ci = Math.floor((p.x + half) / EXPLORE_CELL);
    const cj = Math.floor((p.z + half) / EXPLORE_CELL);
    for (let dj = -2; dj <= 2; dj++) {
      for (let di = -2; di <= 2; di++) {
        if (di * di + dj * dj > 5) continue;
        const i = ci + di;
        const j = cj + dj;
        if (i >= 0 && j >= 0 && i < EXPLORE_N && j < EXPLORE_N) this.explored[j * EXPLORE_N + i] = 1;
      }
    }
    this.discoverTimer -= dt;
    if (this.discoverTimer > 0) return;
    this.discoverTimer = 0.4;
    let here: (typeof LOCATIONS)[number] | null = null;
    let bestD = Infinity;
    for (const l of LOCATIONS) {
      const d = Math.hypot(p.x - l.x, p.z - l.z);
      if (d > l.r) continue;
      // Smaller places win over the large areas that contain them.
      if (l.r < bestD) {
        bestD = l.r;
        here = l;
      }
    }
    this.placeName = here ? here.name : 'Ashen Kingdom';
    if (here && !this.discovered.has(here.id)) {
      this.discovered.add(here.id);
      if (!this.cinematic) this.hud.showBanner(here.name.toUpperCase(), 'Place discovered', 'area', 3.2);
      this.autosave();
    }
  }

  private encodeExplored(): string {
    const bytes = new Uint8Array(Math.ceil(this.explored.length / 8));
    this.explored.forEach((v, i) => {
      if (v) bytes[i >> 3] |= 1 << (i & 7);
    });
    let s = '';
    bytes.forEach((b) => (s += String.fromCharCode(b)));
    return btoa(s);
  }

  private decodeExplored(b64: string): void {
    try {
      const s = atob(b64);
      for (let i = 0; i < this.explored.length; i++) this.explored[i] = (s.charCodeAt(i >> 3) >> (i & 7)) & 1;
    } catch {
      this.explored.fill(0);
    }
  }

  /** Top-down world picture (terrain + buildings), 1 px per metre, mirrored like the map. */
  private worldImage(): HTMLCanvasElement {
    if (this.worldImageCache) return this.worldImageCache;
    const terrain = this.level.overworld.terrain;
    const px = terrain.size;
    const cv = terrain.mapImage(px);
    const g = cv.getContext('2d')!;
    const half = terrain.size / 2;
    const X = (x: number) => half - x;
    const Z = (z: number) => half - z;
    for (const c of this.world.all()) {
      if (c.tag === 'tree') continue;
      if (c.kind === 'box') {
        if (c.maxY <= 0.01 || c.maxX - c.minX > 70) continue;
        const rel = c.maxY - Math.max(0, terrain.height((c.minX + c.maxX) / 2, (c.minZ + c.maxZ) / 2));
        const h = Math.min(1, Math.max(0, rel) / 8);
        g.fillStyle = `rgba(${150 + h * 70},${138 + h * 60},${128 + h * 50},${0.55 + h * 0.4})`;
        g.fillRect(X(c.maxX), Z(c.maxZ), c.maxX - c.minX, c.maxZ - c.minZ);
      } else {
        g.fillStyle = 'rgba(200,186,170,0.85)';
        g.beginPath();
        g.arc(X(c.x), Z(c.z), Math.max(0.8, c.radius), 0, Math.PI * 2);
        g.fill();
      }
    }
    this.worldImageCache = cv;
    return cv;
  }

  private updateMinimap(dt: number): void {
    const mm = this.hud.minimap;
    const show = this.mode !== 'title' && this.settings.minimap;
    mm.setVisible(show);
    if (!show) return;
    if (!mm.hasBase) mm.setBase(this.worldImage(), this.level.overworld.terrain.size);
    const p = this.player.position;
    const markers: MinimapMarker[] = [];
    for (const a of this.level.altars) {
      if (a === this.level.hall.altar && !this.throneUnlocked) continue;
      markers.push({ x: a.position.x, z: a.position.z, kind: a.kindled ? 'altarLit' : 'altar' });
    }
    for (const e of this.enemies) {
      if (e.dead || e.asleep) continue;
      const d = Math.hypot(e.position.x - p.x, e.position.z - p.z);
      if (e.isBoss) {
        if (d < 160) markers.push({ x: e.position.x, z: e.position.z, kind: 'boss' });
      } else if (d < 80) markers.push({ x: e.position.x, z: e.position.z, kind: e.aggro ? 'enemyAlert' : 'enemy' });
    }
    if (this.lostEchoes) markers.push({ x: this.lostEchoes.position.x, z: this.lostEchoes.position.z, kind: 'echoes' });
    for (const l of LOCATIONS) {
      // The place you are in is named under the minimap, not on top of your arrow.
      if (!this.discovered.has(l.id) || l.kind === 'castle' || l.name === this.placeName) continue;
      markers.push({ x: l.x, z: l.z, kind: 'location', label: l.name });
    }
    mm.update(dt, { x: p.x, z: p.z, facing: this.player.facing, cameraYaw: this.camera.yaw, markers, place: this.placeName });
  }

  private checkGateThreshold(): void {
    if (!this.level.gate.open || this.gateBannerShown) return;
    if (this.player.position.z > 50.5 && Math.abs(this.player.position.x) < 6) {
      this.gateBannerShown = true;
      this.hud.showBanner('THE GATE OF ETERNITY', 'The Throne Hall of the Ashen King lies ahead', 'area', 4);
      this.autosave();
    }
  }
}
