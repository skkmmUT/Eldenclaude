import { Vector3, type PerspectiveCamera } from 'three';
import type { Player } from '@/characters/player/Player';
import type { Enemy } from '@/characters/enemies/Enemy';
import { el } from './dom';

interface EnemyWidget {
  root: HTMLDivElement;
  fill: HTMLElement;
  chip: HTMLElement;
  dmg: HTMLDivElement;
  alert: HTMLDivElement;
  accum: number;
  accumTimer: number;
}

/**
 * In-game HUD (DOM overlay): vitals with delayed "chip" bars, status build-up, quick
 * slots, echoes, lock-on reticle, enemy bars with damage totals, boss bar, prompts,
 * banners and toasts. Pure presentation: reads game state, never mutates it.
 */
export class HUD {
  readonly root: HTMLDivElement;
  private hp = this.bar('hp');
  private mp = this.bar('mp');
  private st = this.bar('st');
  private statuses = el('div.statuses');
  private slotSpell = el('div.slot.top');
  private slotLeft = el('div.slot.left');
  private slotWeapon = el('div.slot.right');
  private slotItem = el('div.slot.bottom');
  private echoesText = el('span', { text: '0' });
  private echoesDelta = el('div.delta');
  private reticle = el('div.lock-reticle');
  private bossRoot = el('div.boss');
  private bossName = el('div.name');
  private bossFill = el('div.fill');
  private bossChip = el('div.chip');
  private bossDmg = el('div.dmg');
  private prompt = el('div.prompt');
  private banner = el('div.banner');
  private toasts = el('div.toasts');
  private fps = el('div.fps');
  private pointerHint = el('div.hint-pointer', { text: 'Click to focus · Esc for menu' });
  private enemyWidgets = new Map<Enemy, EnemyWidget>();
  private bannerTimer: number | null = null;
  private lastEchoes = 0;
  private echoDeltaTimer: number | null = null;
  boss: Enemy | null = null;
  private bossAccum = 0;
  private bossAccumTimer = 0;
  showDamageNumbers = true;
  private readonly v = new Vector3();
  private fpsAcc = 0;
  private fpsFrames = 0;

  constructor(parent: HTMLElement) {
    const bars = el('div.bars', {}, [this.hp.root, this.mp.root, this.st.root, this.statuses]);
    const slots = el('div.slots', {}, [this.slotSpell, this.slotLeft, this.slotWeapon, this.slotItem]);
    const echoes = el('div.echoes', {}, [el('div.orb'), this.echoesText, this.echoesDelta]);
    this.bossRoot.append(this.bossName, el('div.bb', {}, [this.bossChip, this.bossFill]), this.bossDmg);
    this.banner.append(el('div.band', {}, [el('div.main'), el('div.sub')]));
    this.root = el('div.hud', {}, [bars, slots, echoes, this.reticle, this.bossRoot, this.prompt, this.banner, this.toasts, this.fps, this.pointerHint]);
    parent.append(this.root);
  }

  private bar(kind: 'hp' | 'mp' | 'st') {
    const fill = el('div.fill');
    const chip = el('div.chip');
    const num = el('div.num');
    const root = el(`div.bar.${kind}` as 'div', {}, [chip, fill, num]);
    return { root, fill, chip, num, lastFrac: 1 };
  }

  setVisible(v: boolean): void {
    this.root.classList.toggle('hidden', !v);
  }

  setFpsVisible(v: boolean): void {
    this.fps.style.display = v ? 'block' : 'none';
  }

  setPointerHint(v: boolean): void {
    this.pointerHint.style.display = v ? 'block' : 'none';
  }

  private updateBar(b: ReturnType<HUD['bar']>, cur: number, max: number, widthPerUnit: number, showNum = true): void {
    const w = Math.max(80, Math.min(560, max * widthPerUnit));
    b.root.style.width = `${w}px`;
    const frac = Math.max(0, Math.min(1, cur / Math.max(1, max)));
    b.fill.style.width = `${frac * 100}%`;
    // chip bar trails behind on loss, snaps on gain
    if (frac >= b.lastFrac) b.chip.style.transition = 'none';
    else b.chip.style.transition = '';
    b.chip.style.width = `${Math.max(frac, Math.min(b.lastFrac, 1)) * 100}%`;
    if (frac < b.lastFrac) {
      requestAnimationFrame(() => {
        b.chip.style.width = `${frac * 100}%`;
      });
    }
    b.lastFrac = frac;
    b.num.textContent = showNum ? `${Math.max(0, Math.ceil(cur))}` : '';
  }

  update(realDt: number, player: Player, enemies: Enemy[], camera: PerspectiveCamera): void {
    // FPS
    this.fpsAcc += realDt;
    this.fpsFrames++;
    if (this.fpsAcc >= 0.5) {
      this.fps.textContent = `${Math.round(this.fpsFrames / this.fpsAcc)} fps`;
      this.fpsAcc = 0;
      this.fpsFrames = 0;
    }

    this.updateBar(this.hp, player.hp, player.maxHp, 0.42);
    this.updateBar(this.mp, player.mana, player.maxMana, 1.25);
    this.updateBar(this.st, Math.max(0, player.stamina), player.maxStamina, 2.3, false);
    this.st.root.classList.toggle('exhausted', player.stamina <= 0);

    // Status build-up / effects
    const parts: string[] = [];
    const b = player.buildup;
    if (b.bleed > 1) parts.push(this.statusHtml('Hemorrhage', '#ff2a4a', b.bleed / player.statusResist.bleed));
    if (b.poison > 1) parts.push(this.statusHtml('Venom', '#7ccf3a', b.poison / player.statusResist.poison));
    if (player.poisonTimer > 0) parts.push(this.statusHtml('Poisoned', '#9aef4a', player.poisonTimer / 18));
    if (player.walkToggle) parts.push(`<div class="status" style="color:#bfb2d0"><span class="ico"></span>Walking</div>`);
    const html = parts.join('');
    if (this.statuses.innerHTML !== html) this.statuses.innerHTML = html;

    // Quick slots
    const inv = player.inventory;
    const spell = inv.spell;
    this.setSlot(this.slotSpell, spell ? `<div class="glyph" style="color:${spell.glyph}"></div><div class="label">${spell.name}</div>` : '');
    this.setSlot(this.slotLeft, `<div class="glyph" style="color:#d8b25a;transform:rotate(45deg) scale(.7)"></div>`);
    this.setSlot(this.slotWeapon, `<div class="blade"></div>`);
    const item = inv.currentItem;
    const data = inv.currentItemData;
    this.setSlot(
      this.slotItem,
      item && data
        ? `<div class="vial" style="background:linear-gradient(transparent ${100 - (item.count / Math.max(1, item.max)) * 85}%, ${data.icon} 0);box-shadow:0 0 14px ${data.icon}"></div><div class="count">${item.count}</div><div class="label">${data.name}</div>`
        : '',
    );

    // Echoes
    const e = player.progress.echoes;
    if (e !== this.lastEchoes) {
      const d = e - this.lastEchoes;
      if (d > 0) {
        this.echoesDelta.textContent = `+${d}`;
        this.echoesDelta.classList.add('show');
        if (this.echoDeltaTimer) clearTimeout(this.echoDeltaTimer);
        this.echoDeltaTimer = window.setTimeout(() => this.echoesDelta.classList.remove('show'), 1800);
      }
      this.lastEchoes = e;
      this.echoesText.textContent = e.toLocaleString('en-US');
    }

    // Lock-on reticle
    const lt = player.lockTarget;
    if (lt && this.project(lt.lockPoint(this.v), camera)) {
      this.reticle.style.display = 'block';
      this.reticle.style.left = `${this.v.x}px`;
      this.reticle.style.top = `${this.v.y}px`;
    } else this.reticle.style.display = 'none';

    // Enemy bars & alert marks
    for (const en of enemies) this.updateEnemyWidget(en, realDt, camera, player);

    // Boss bar
    if (this.boss) {
      const bo = this.boss;
      this.bossRoot.style.display = bo.dead && bo.stateTime > 3 ? 'none' : 'block';
      this.bossRoot.classList.toggle('phase2', bo.phase === 2);
      const frac = Math.max(0, bo.hp / bo.maxHp);
      this.bossFill.style.width = `${frac * 100}%`;
      this.bossChip.style.width = `${frac * 100}%`;
      this.bossAccumTimer -= realDt;
      if (this.bossAccumTimer <= 0) this.bossAccum = 0;
      this.bossDmg.textContent = this.bossAccum > 0 && this.showDamageNumbers ? `${Math.round(this.bossAccum)}` : '';
    } else this.bossRoot.style.display = 'none';

    // Interaction prompt
    if (player.focusPrompt) {
      this.prompt.style.display = 'block';
      this.prompt.innerHTML = `<kbd>E</kbd>${player.focusPrompt}`;
    } else this.prompt.style.display = 'none';
  }

  private statusHtml(name: string, color: string, frac: number): string {
    return `<div class="status" style="color:${color}"><span class="ico"></span><span style="color:#e9e2d6">${name}</span><span class="meter"><i style="width:${Math.min(100, frac * 100)}%"></i></span></div>`;
  }

  private setSlot(slot: HTMLElement, html: string): void {
    if (slot.dataset.html !== html) {
      slot.dataset.html = html;
      slot.innerHTML = html;
    }
  }

  private project(p: Vector3, camera: PerspectiveCamera): boolean {
    this.v.copy(p).project(camera);
    if (this.v.z > 1 || this.v.z < -1) return false;
    this.v.x = (this.v.x * 0.5 + 0.5) * window.innerWidth;
    this.v.y = (-this.v.y * 0.5 + 0.5) * window.innerHeight;
    return this.v.x > -50 && this.v.x < window.innerWidth + 50 && this.v.y > -50 && this.v.y < window.innerHeight + 50;
  }

  private widget(en: Enemy): EnemyWidget {
    let w = this.enemyWidgets.get(en);
    if (!w) {
      const fill = el('i');
      const chip = el('b');
      const dmg = el('div.dmg');
      const root = el('div.enemy-bar', {}, [el('div.eb', {}, [chip, fill]), dmg]);
      const alert = el('div.alert-mark');
      this.root.append(root, alert);
      w = { root, fill, chip, dmg, alert, accum: 0, accumTimer: 0 };
      this.enemyWidgets.set(en, w);
    }
    return w;
  }

  private updateEnemyWidget(en: Enemy, dt: number, camera: PerspectiveCamera, player: Player): void {
    const w = this.widget(en);
    w.accumTimer -= dt;
    if (w.accumTimer <= 0) w.accum = 0;
    const dist = en.position.distanceTo(player.position);
    const visible = !en.dead && en !== this.boss && dist < 32 && (en.sinceHit < 6 || player.lockTarget === en);
    const top = en.worldTop;
    const onScreen = this.project(top, camera);
    if (visible && onScreen) {
      w.root.style.display = 'block';
      w.root.style.left = `${this.v.x}px`;
      w.root.style.top = `${this.v.y}px`;
      const frac = Math.max(0, en.hp / en.maxHp);
      w.fill.style.width = `${frac * 100}%`;
      w.chip.style.width = `${frac * 100}%`;
      w.dmg.textContent = w.accum > 0 && this.showDamageNumbers ? `${Math.round(w.accum)}` : '';
    } else w.root.style.display = 'none';
    // Awareness marks: "?" while suspicious, "!" flash when alerted
    const showAlert = !en.dead && dist < 40 && onScreen && (en.state === 'investigate' || (en.aggro && en.stateTime < 1.2 && en.state === 'chase'));
    if (showAlert) {
      w.alert.style.display = 'block';
      w.alert.textContent = en.aggro ? '!' : '?';
      w.alert.style.left = `${this.v.x}px`;
      w.alert.style.top = `${this.v.y - 26}px`;
    } else w.alert.style.display = 'none';
  }

  onDamage(target: Enemy, amount: number): void {
    if (target === this.boss) {
      this.bossAccum += amount;
      this.bossAccumTimer = 2.5;
      return;
    }
    const w = this.widget(target);
    w.accum += amount;
    w.accumTimer = 2.5;
  }

  removeEnemy(en: Enemy): void {
    const w = this.enemyWidgets.get(en);
    if (!w) return;
    w.root.remove();
    w.alert.remove();
    this.enemyWidgets.delete(en);
  }

  showBanner(text: string, sub = '', kind: 'banner' | 'death' | 'victory' | 'area' = 'banner', duration = 3.2): void {
    this.banner.className = `banner ${kind}`;
    (this.banner.querySelector('.main') as HTMLElement).textContent = text;
    (this.banner.querySelector('.sub') as HTMLElement).textContent = sub;
    requestAnimationFrame(() => this.banner.classList.add('show'));
    if (this.bannerTimer) clearTimeout(this.bannerTimer);
    this.bannerTimer = window.setTimeout(() => this.banner.classList.remove('show'), duration * 1000);
  }

  hideBanner(): void {
    this.banner.classList.remove('show');
  }

  toast(text: string, sub?: string): void {
    const t = el('div.toast', { html: sub ? `${text}<small>${sub}</small>` : text });
    this.toasts.append(t);
    window.setTimeout(() => t.remove(), 3500);
  }

  setBoss(e: Enemy | null): void {
    this.boss = e;
    if (e) {
      this.bossName.innerHTML = `${e.data.name}<span class="title">${e.data.bossTitle ?? ''}</span>`;
      this.bossAccum = 0;
    }
  }
}
