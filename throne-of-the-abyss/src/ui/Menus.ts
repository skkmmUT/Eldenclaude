import type { Player } from '@/characters/player/Player';
import { ATTRIBUTE_IDS, ATTRIBUTE_INFO, type AttributeId, type Attributes, maxHpFor, maxManaFor, maxStaminaFor, levelOf } from '@/rpg/Attributes';
import { attackRating } from '@/combat/DamageCalculator';
import { DIRECT_DAMAGE_TYPES, DAMAGE_COLORS, totalDamage } from '@/combat/DamageTypes';
import { WEAPONS } from '@/data/weapons';
import { CONSUMABLES } from '@/data/items';
import { SPELLS } from '@/data/spells';
import { CONTROL_HINTS } from '@/data/inputBindings';
import type { LoreEntry } from '@/data/lore';
import type { GameSettings } from '@/core/Settings';
import type { Collider } from '@/physics/CollisionWorld';
import { el, escapeHtml } from './dom';

export interface MapData {
  colliders: Iterable<Collider>;
  bounds: [number, number, number, number]; // minX, minZ, maxX, maxZ
  player: { x: number; z: number; yaw: number };
  altars: Array<{ x: number; z: number; kindled: boolean; name: string }>;
  lostEchoes: { x: number; z: number } | null;
  bosses: Array<{ x: number; z: number; alive: boolean }>;
}

export interface MenuHost {
  readonly player: Player;
  readonly settings: GameSettings;
  hasSave(): boolean;
  newGame(): void;
  continueGame(): void;
  resume(): void;
  saveGame(): boolean;
  quitToTitle(): void;
  applySettings(): void;
  kindledAltars(): Array<{ id: string; name: string }>;
  currentAltar(): { id: string; name: string } | null;
  travelTo(id: string): void;
  leaveAltar(): void;
  levelUp(alloc: Partial<Record<AttributeId, number>>): boolean;
  mapData(): MapData;
  journal(): { objectives: Array<{ text: string; done: boolean }>; lore: LoreEntry[] };
  equipWeapon(index: number): void;
  dropWeapon(index: number): void;
  useItemFromMenu(index: number): void;
}

type Tab = 'status' | 'equipment' | 'inventory' | 'spells' | 'map' | 'journal' | 'settings' | 'controls';

/** All full-screen UI: title, pause tabs, altar & level-up, lore reader. */
export class Menus {
  private readonly title: HTMLDivElement;
  private readonly pause: HTMLDivElement;
  private readonly altar: HTMLDivElement;
  private readonly levelUpScreen: HTMLDivElement;
  private readonly reader: HTMLDivElement;
  private tab: Tab = 'status';
  private selectedWeapon = 0;
  private selectedItem = 0;
  private selectedSpell = 0;
  private alloc: Partial<Record<AttributeId, number>> = {};
  open: 'none' | 'title' | 'pause' | 'altar' | 'levelup' | 'reader' | 'travel' = 'none';
  private readerReturn: 'none' | 'pause' = 'none';

  constructor(
    parent: HTMLElement,
    private readonly host: MenuHost,
  ) {
    this.title = el('div.screen.title-screen');
    this.pause = el('div.screen.dim');
    this.altar = el('div.screen');
    this.levelUpScreen = el('div.screen.dim');
    this.reader = el('div.screen.dim');
    parent.append(this.title, this.pause, this.altar, this.levelUpScreen, this.reader);
    window.addEventListener('keydown', (e) => this.onKey(e));
  }

  get blocking(): boolean {
    return this.open !== 'none';
  }

  private onKey(e: KeyboardEvent): void {
    if (e.code !== 'Escape' && e.code !== 'KeyP' && e.code !== 'KeyE') return;
    if (this.open === 'reader' && (e.code === 'Escape' || e.code === 'KeyE')) {
      e.preventDefault();
      this.closeReader();
    } else if (this.open === 'pause' && (e.code === 'Escape' || e.code === 'KeyP')) {
      e.preventDefault();
      this.closeAll();
      this.host.resume();
    } else if (this.open === 'levelup' && e.code === 'Escape') {
      e.preventDefault();
      this.showAltar();
    } else if (this.open === 'travel' && e.code === 'Escape') {
      e.preventDefault();
      this.showAltar();
    } else if (this.open === 'altar' && e.code === 'Escape') {
      e.preventDefault();
      this.closeAll();
      this.host.leaveAltar();
    }
  }

  closeAll(): void {
    for (const s of [this.title, this.pause, this.altar, this.levelUpScreen, this.reader]) s.classList.remove('open');
    this.open = 'none';
  }

  private button(label: string, onClick: () => void, cls = 'menu-btn', disabled = false): HTMLButtonElement {
    const b = el('button', { class: cls, text: label });
    b.disabled = disabled;
    b.addEventListener('click', (ev) => {
      ev.stopPropagation();
      if (b.disabled) return;
      onClick();
    });
    return b;
  }

  // ===================================================================================
  // Title
  // ===================================================================================
  showTitle(): void {
    this.closeAll();
    this.open = 'title';
    this.title.innerHTML = '';
    const logo = el('div.logo', {}, [
      el('div.t1', { text: 'THRONE OF THE ABYSS' }),
      el('div.rule'),
      el('div.t2', { text: 'Eldrakar' }),
    ]);
    const list = el('div.menu-list');
    if (this.host.hasSave()) list.append(this.button('Continue', () => this.host.continueGame()));
    list.append(
      this.button('New Game', () => {
        if (this.host.hasSave() && !confirm('Begin anew? Your current journey will be lost.')) return;
        this.host.newGame();
      }),
      this.button('Settings', () => this.showPause('settings', true)),
      this.button('Controls', () => this.showPause('controls', true)),
    );
    this.title.append(logo, list, el('div.title-foot', { text: 'An original dark-fantasy action RPG · Three.js prototype build' }));
    this.title.classList.add('open');
  }

  // ===================================================================================
  // Pause menu
  // ===================================================================================
  private fromTitle = false;

  showPause(tab: Tab = this.tab, fromTitle = false): void {
    this.closeAll();
    this.fromTitle = fromTitle;
    this.open = 'pause';
    this.tab = tab;
    this.renderPause();
    this.pause.classList.add('open');
  }

  private renderPause(): void {
    this.pause.innerHTML = '';
    const tabs: Array<[Tab, string]> = this.fromTitle
      ? [
          ['settings', 'Settings'],
          ['controls', 'Controls'],
        ]
      : [
          ['status', 'Status'],
          ['equipment', 'Equipment'],
          ['inventory', 'Inventory'],
          ['spells', 'Spells'],
          ['map', 'Map'],
          ['journal', 'Journal'],
          ['settings', 'Settings'],
          ['controls', 'Controls'],
        ];
    const tabRow = el('div.tabs');
    for (const [id, label] of tabs) {
      const t = el('button', { class: `tab${this.tab === id ? ' active' : ''}`, text: label });
      t.addEventListener('click', () => {
        this.tab = id;
        this.renderPause();
      });
      tabRow.append(t);
    }
    const body = el('div.panel-body');
    const foot = el('div.panel-foot');
    if (this.fromTitle) {
      foot.append(this.button('Back', () => this.showTitle(), 'btn'));
    } else {
      foot.append(
        this.button('Save Game', () => {
          const ok = this.host.saveGame();
          (foot.querySelector('.save-state') as HTMLElement).textContent = ok ? 'Journey recorded.' : 'Could not save (storage unavailable).';
        }, 'btn'),
        this.button('Quit to Title', () => this.host.quitToTitle(), 'btn'),
        this.button('Resume', () => {
          this.closeAll();
          this.host.resume();
        }, 'btn primary'),
      );
      foot.prepend(el('span.save-state', { style: 'margin-right:auto;align-self:center' }));
    }
    const panel = el('div.panel.interactive', {}, [
      el('div.panel-head', {}, [el('h2', { text: this.fromTitle ? 'Options' : 'Paused' }), tabRow]),
      body,
      foot,
    ]);
    this.pause.append(panel);
    switch (this.tab) {
      case 'status':
        this.renderStatus(body);
        break;
      case 'equipment':
        this.renderEquipment(body);
        break;
      case 'inventory':
        this.renderInventory(body);
        break;
      case 'spells':
        this.renderSpells(body);
        break;
      case 'map':
        this.renderMap(body);
        break;
      case 'journal':
        this.renderJournal(body);
        break;
      case 'settings':
        this.renderSettings(body);
        break;
      case 'controls':
        this.renderControls(body);
        break;
    }
  }

  private kv(k: string, v: string, extra = ''): string {
    return `<div class="kv"><span>${k}</span><b>${v}${extra}</b></div>`;
  }

  private weaponAR(id: string, attrs: Attributes): number {
    return Math.round(totalDamage(attackRating(WEAPONS[id], attrs)));
  }

  private renderStatus(body: HTMLElement): void {
    const p = this.host.player;
    const a = p.attributes;
    const left = [`<div class="section-title">Attributes</div>`];
    for (const id of ATTRIBUTE_IDS) left.push(this.kv(`${ATTRIBUTE_INFO[id].short} · ${ATTRIBUTE_INFO[id].name}`, String(a[id])));
    left.push(`<div style="height:16px"></div><div class="section-title">Progress</div>`);
    left.push(this.kv('Level', String(p.progress.level)));
    left.push(this.kv('Echoes', p.progress.echoes.toLocaleString('en-US')));
    left.push(this.kv('Echoes to next level', p.progress.nextLevelCost.toLocaleString('en-US')));
    const right = [`<div class="section-title">Vitals</div>`];
    right.push(this.kv('Health', `${Math.ceil(p.hp)} / ${p.maxHp}`));
    right.push(this.kv('Mana', `${Math.ceil(p.mana)} / ${p.maxMana}`));
    right.push(this.kv('Stamina', `${p.maxStamina}`));
    right.push(this.kv('Attack rating', `${this.weaponAR(p.weapon.id, a)}`, ` <span style="color:var(--text-dim);font:13px var(--serif)">(${escapeHtml(p.weapon.name)})</span>`));
    right.push(`<div style="height:16px"></div><div class="section-title">Defense / Absorption</div>`);
    for (const t of DIRECT_DAMAGE_TYPES) {
      right.push(this.kv(`<span style="color:${DAMAGE_COLORS[t]}">${t[0].toUpperCase() + t.slice(1)}</span>`, `${Math.round(p.defense[t] ?? 0)} / ${Math.round((p.absorption[t] ?? 0) * 100)}%`));
    }
    right.push(this.kv('Poison resistance', `${Math.round(p.statusResist.poison)}`));
    right.push(this.kv('Bleed resistance', `${Math.round(p.statusResist.bleed)}`));
    body.innerHTML = `<div class="cols"><div>${left.join('')}</div><div>${right.join('')}</div></div>`;
  }

  private renderEquipment(body: HTMLElement): void {
    const p = this.host.player;
    const inv = p.inventory;
    this.selectedWeapon = Math.min(this.selectedWeapon, inv.weapons.length - 1);
    const list = el('div.item-list');
    inv.weapons.forEach((id, i) => {
      const w = WEAPONS[id];
      const row = el('div', {
        class: `item${i === this.selectedWeapon ? ' sel' : ''}${i === inv.rightHand ? ' equipped' : ''}`,
        html: `<span class="n">${escapeHtml(w.name)}</span><span class="m">AR ${this.weaponAR(id, p.attributes)}</span>`,
      });
      row.addEventListener('click', () => {
        this.selectedWeapon = i;
        this.renderPause();
      });
      list.append(row);
    });
    const w = WEAPONS[inv.weapons[this.selectedWeapon]];
    const cur = this.weaponAR(inv.weapon.id, p.attributes);
    const sel = this.weaponAR(w.id, p.attributes);
    const diff = sel - cur;
    const scaling = Object.entries(w.scaling ?? {}).map(([k, g]) => `${ATTRIBUTE_INFO[k as AttributeId].short} ${g}`).join(' · ') || '—';
    const req = Object.entries(w.requirements).map(([k, v]) => {
      const ok = p.attributes[k as AttributeId] >= (v as number);
      return `<span style="color:${ok ? 'inherit' : '#ff7a7a'}">${ATTRIBUTE_INFO[k as AttributeId].short} ${v}</span>`;
    }).join(' · ') || '—';
    const detail = el('div', {
      html:
        `<div class="section-title">${escapeHtml(w.name)}</div>` +
        `<div class="desc" style="margin-bottom:12px">${escapeHtml(w.description)}</div>` +
        this.kv('Category', w.category.replace(/([A-Z])/g, ' $1').toLowerCase()) +
        this.kv('Attack rating', String(sel), diff !== 0 ? ` <span class="${diff > 0 ? 'compare-up' : 'compare-down'}">${diff > 0 ? '▲' : '▼'} ${Math.abs(diff)}</span>` : '') +
        this.kv('Scaling', scaling) +
        this.kv('Requires', req) +
        this.kv('Guard (physical)', `${Math.round((w.guard.physical ?? 0) * 100)}%`) +
        this.kv('Weight', String(w.weight)) +
        (w.buildup?.bleed ? this.kv('Bleed build-up', String(w.buildup.bleed)) : '') +
        `<div style="height:14px"></div><div class="lore">${escapeHtml(w.lore)}</div>`,
    });
    const actions = el('div', { style: 'display:flex;gap:10px;margin-top:16px' });
    if (this.selectedWeapon !== inv.rightHand) {
      actions.append(this.button('Equip', () => {
        this.host.equipWeapon(this.selectedWeapon);
        this.renderPause();
      }, 'btn primary'));
      actions.append(this.button('Discard', () => {
        if (!confirm(`Discard ${w.name}? It will be lost.`)) return;
        this.host.dropWeapon(this.selectedWeapon);
        this.selectedWeapon = 0;
        this.renderPause();
      }, 'btn'));
    }
    detail.append(actions);
    const left = el('div', {}, [el('div.section-title', { text: 'Right hand' }), list]);
    body.append(el('div.cols', {}, [left, detail]));
  }

  private renderInventory(body: HTMLElement): void {
    const inv = this.host.player.inventory;
    this.selectedItem = Math.min(this.selectedItem, Math.max(0, inv.belt.length - 1));
    const list = el('div.item-list');
    inv.belt.forEach((slot, i) => {
      const d = CONSUMABLES[slot.id];
      const row = el('div', {
        class: `item${i === this.selectedItem ? ' sel' : ''}`,
        html: `<span class="n"><span style="color:${d.icon}">◆</span> ${escapeHtml(d.name)}</span><span class="m">${slot.count} / ${slot.max}</span>`,
      });
      row.addEventListener('click', () => {
        this.selectedItem = i;
        this.renderPause();
      });
      list.append(row);
    });
    const slot = inv.belt[this.selectedItem];
    const detail = el('div');
    if (slot) {
      const d = CONSUMABLES[slot.id];
      detail.innerHTML =
        `<div class="section-title">${escapeHtml(d.name)}</div><div class="desc">${escapeHtml(d.description)}</div>` +
        `<div style="height:12px"></div><div class="lore">${escapeHtml(d.lore)}</div>`;
      const actions = el('div', { style: 'display:flex;gap:10px;margin-top:16px' });
      actions.append(this.button('Use', () => {
        this.host.useItemFromMenu(this.selectedItem);
        this.renderPause();
      }, 'btn primary', slot.count <= 0));
      actions.append(this.button('Set as quick item', () => {
        inv.beltIndex = this.selectedItem;
        this.renderPause();
      }, 'btn'));
      detail.append(actions);
    }
    const keyList = el('div.item-list', { style: 'margin-top:20px' });
    const lore = this.host.journal().lore;
    for (const l of lore) {
      const row = el('div.item', { html: `<span class="n">${escapeHtml(l.title)}</span><span class="m">Read</span>` });
      row.addEventListener('click', () => this.showReader(l, 'pause'));
      keyList.append(row);
    }
    const left = el('div', {}, [el('div.section-title', { text: 'Consumables' }), list, el('div.section-title', { text: 'Key items & writings', style: 'margin-top:22px' }), lore.length ? keyList : el('div.desc', { text: 'Nothing yet.' })]);
    body.append(el('div.cols', {}, [left, detail]));
  }

  private renderSpells(body: HTMLElement): void {
    const p = this.host.player;
    const inv = p.inventory;
    const list = el('div.item-list');
    this.selectedSpell = Math.min(this.selectedSpell, inv.spells.length - 1);
    inv.spells.forEach((id, i) => {
      const s = SPELLS[id];
      const row = el('div', {
        class: `item${i === this.selectedSpell ? ' sel' : ''}${i === inv.spellIndex ? ' equipped' : ''}`,
        html: `<span class="n"><span style="color:${s.glyph}">◆</span> ${escapeHtml(s.name)}</span><span class="m">${s.manaCost} MP</span>`,
      });
      row.addEventListener('click', () => {
        this.selectedSpell = i;
        this.renderPause();
      });
      list.append(row);
    });
    const s = SPELLS[inv.spells[this.selectedSpell]];
    const dmg = s.damage ? Math.round(totalDamage(attackRating(s.damage, p.attributes))) : 0;
    const scaling = s.damage?.scaling ? Object.entries(s.damage.scaling).map(([k, g]) => `${ATTRIBUTE_INFO[k as AttributeId].short} ${g}`).join(' · ') : '—';
    const detail = el('div', {
      html:
        `<div class="section-title">${escapeHtml(s.name)}</div><div class="desc" style="margin-bottom:12px">${escapeHtml(s.description)}</div>` +
        this.kv('School', s.school) +
        this.kv('Mana cost', String(s.manaCost)) +
        this.kv('Cast time', `${s.castTime.toFixed(2)} s`) +
        this.kv('Cooldown', s.cooldown ? `${s.cooldown.toFixed(1)} s` : '—') +
        this.kv('Range', `${s.range} m`) +
        (s.damage ? this.kv('Potency', String(dmg)) + this.kv('Scaling', scaling) : '') +
        this.kv('Interruptible', s.interruptible ? 'Yes' : 'No') +
        `<div style="height:14px"></div><div class="lore">${escapeHtml(s.lore)}</div>`,
    });
    if (this.selectedSpell !== inv.spellIndex) {
      detail.append(this.button('Attune as active spell', () => {
        inv.spellIndex = this.selectedSpell;
        this.renderPause();
      }, 'btn primary'));
    }
    body.append(el('div.cols', {}, [el('div', {}, [el('div.section-title', { text: 'Attuned spells' }), list]), detail]));
  }

  private renderMap(body: HTMLElement): void {
    const d = this.host.mapData();
    const canvas = el('canvas');
    const W = 560;
    const H = 560;
    canvas.width = W;
    canvas.height = H;
    const g = canvas.getContext('2d')!;
    const [x0, z0, x1, z1] = d.bounds;
    const s = Math.min(W / (x1 - x0), H / (z1 - z0)) * 0.95;
    // The world is right-handed with +Z as north, so facing north +X lies to the WEST
    // (screen left). Mirror X so the map matches what the player sees.
    const ox = W / 2 + ((x0 + x1) / 2) * s;
    const oz = H / 2 + ((z0 + z1) / 2) * s;
    const X = (x: number) => ox - x * s;
    const Z = (z: number) => oz - z * s; // north (+z) is up
    g.fillStyle = '#0a0610';
    g.fillRect(0, 0, W, H);
    for (const c of d.colliders) {
      if (c.kind === 'box') {
        if (c.maxY <= 0.01 || c.maxX - c.minX > 70) continue;
        const h = Math.min(1, c.maxY / 10);
        g.fillStyle = `rgba(${120 + h * 80},${100 + h * 60},${120 + h * 60},${0.25 + h * 0.5})`;
        g.fillRect(X(c.maxX), Z(c.maxZ), (c.maxX - c.minX) * s, (c.maxZ - c.minZ) * s);
      } else {
        g.fillStyle = 'rgba(180,160,190,0.55)';
        g.beginPath();
        g.arc(X(c.x), Z(c.z), Math.max(1.5, c.radius * s), 0, Math.PI * 2);
        g.fill();
      }
    }
    for (const a of d.altars) {
      g.save();
      g.translate(X(a.x), Z(a.z));
      g.rotate(Math.PI / 4);
      g.fillStyle = a.kindled ? '#b46bff' : '#4a3a5a';
      g.fillRect(-6, -6, 12, 12);
      g.restore();
    }
    for (const b of d.bosses) {
      if (!b.alive) continue;
      g.fillStyle = '#ff2a4a';
      g.beginPath();
      g.arc(X(b.x), Z(b.z), 6, 0, Math.PI * 2);
      g.fill();
    }
    if (d.lostEchoes) {
      g.strokeStyle = '#ffd27a';
      g.lineWidth = 2;
      g.beginPath();
      g.arc(X(d.lostEchoes.x), Z(d.lostEchoes.z), 7, 0, Math.PI * 2);
      g.stroke();
    }
    // player arrow
    g.save();
    g.translate(X(d.player.x), Z(d.player.z));
    g.rotate(-d.player.yaw);
    g.fillStyle = '#ffffff';
    g.beginPath();
    g.moveTo(0, -10);
    g.lineTo(6, 7);
    g.lineTo(0, 3);
    g.lineTo(-6, 7);
    g.closePath();
    g.fill();
    g.restore();
    g.fillStyle = '#d8b25a';
    g.font = '600 13px Cinzel, serif';
    g.fillText('N', W / 2 - 4, 16);
    const legend = el('div.legend', {
      html:
        `<div class="section-title">Ashen Kingdom</div>` +
        `<div class="desc" style="margin-bottom:16px">Ashen Gate Courtyard — the forecourt of the Cathedral of Eternity.</div>` +
        `<div><i style="background:#b46bff"></i>Kindled Sigil Altar</div>` +
        `<div><i style="background:#4a3a5a"></i>Unlit Sigil Altar</div>` +
        `<div><i style="background:#ff2a4a;border-radius:50%;transform:none"></i>Formidable foe</div>` +
        `<div><i style="border:2px solid #ffd27a;border-radius:50%;transform:none"></i>Lost echoes</div>` +
        `<div><i style="background:#fff"></i>You</div>`,
    });
    body.append(el('div.map-wrap', {}, [canvas, legend]));
  }

  private renderJournal(body: HTMLElement): void {
    const j = this.host.journal();
    const obj = j.objectives
      .map((o) => `<div class="kv"><span style="color:${o.done ? 'var(--text-dim)' : 'var(--text)'}">${o.done ? '✓ ' : '◆ '}${escapeHtml(o.text)}</span></div>`)
      .join('');
    const lore = el('div.item-list');
    for (const l of j.lore) {
      const row = el('div.item', { html: `<span class="n">${escapeHtml(l.title)}</span><span class="m">Read</span>` });
      row.addEventListener('click', () => this.showReader(l, 'pause'));
      lore.append(row);
    }
    const left = el('div', { html: `<div class="section-title">Path</div>${obj}` });
    const right = el('div', {}, [el('div.section-title', { text: 'Writings found' }), j.lore.length ? lore : el('div.desc', { text: 'The world keeps its secrets for now.' })]);
    body.append(el('div.cols', {}, [left, right]));
  }

  private renderSettings(body: HTMLElement): void {
    const s = this.host.settings;
    const apply = () => this.host.applySettings();
    const range = (label: string, key: keyof GameSettings, min: number, max: number, step: number, fmt: (v: number) => string) => {
      const input = el('input', { type: 'range', min: String(min), max: String(max), step: String(step), value: String(s[key]) });
      const out = el('span', { text: fmt(s[key] as number) });
      input.addEventListener('input', () => {
        (s as unknown as Record<string, number>)[key] = parseFloat(input.value);
        out.textContent = fmt(parseFloat(input.value));
        apply();
      });
      return el('div.setting', {}, [el('span', { text: label }), input, out]);
    };
    const check = (label: string, key: keyof GameSettings) => {
      const input = el('input', { type: 'checkbox' });
      input.checked = s[key] as boolean;
      input.addEventListener('change', () => {
        (s as unknown as Record<string, boolean>)[key] = input.checked;
        apply();
      });
      return el('div.setting', {}, [el('span', { text: label }), input, el('span')]);
    };
    const quality = el('select');
    for (const q of ['low', 'medium', 'high', 'ultra']) {
      const o = el('option', { value: q, text: q[0].toUpperCase() + q.slice(1) });
      if (s.quality === q) o.selected = true;
      quality.append(o);
    }
    quality.addEventListener('change', () => {
      s.quality = quality.value as GameSettings['quality'];
      apply();
    });
    const pct = (v: number) => `${Math.round(v * 100)}%`;
    body.append(
      el('div.section-title', { text: 'Graphics' }),
      el('div.setting', {}, [el('span', { text: 'Quality preset' }), quality, el('span')]),
      check('Show FPS', 'showFps'),
      el('div.section-title', { text: 'Controls & camera', style: 'margin-top:18px' }),
      range('Mouse sensitivity', 'mouseSensitivity', 0.2, 3, 0.05, (v) => v.toFixed(2)),
      check('Invert camera Y', 'invertY'),
      range('Camera shake', 'cameraShake', 0, 1.5, 0.05, pct),
      check('Damage numbers', 'damageNumbers'),
    );
  }

  private renderControls(body: HTMLElement): void {
    const grid = el('div.controls-grid');
    for (const [k, v] of CONTROL_HINTS) grid.append(el('kbd', { text: k }), el('span', { text: v }));
    body.append(
      el('div.section-title', { text: 'Keyboard & mouse' }),
      grid,
      el('div.section-title', { text: 'Gamepad', style: 'margin-top:22px' }),
      el('div.desc', {
        text: 'Left stick move · Right stick camera · A jump/interact · B tap roll, hold sprint · RB light · RT heavy (hold to charge) · LB block · LT parry · R3 lock-on · X item · Y cast · D-pad: up spell, down item, right weapon · L3 walk · Start menu',
      }),
      el('div.section-title', { text: 'Combat notes', style: 'margin-top:22px' }),
      el('div.desc', {
        html:
          'Rolls grant brief invulnerability. Every swing costs stamina — empty stamina leaves you unable to act or guard. ' +
          'Parry an attack just before it lands, then strike the staggered foe for a riposte. Strike unaware enemies from behind to backstab. ' +
          'Fall upon foes from a ledge (attack while falling) for a plunging blow. Resting at a Sigil Altar restores you, refills ichor, and wakes the slain.',
      }),
    );
  }

  // ===================================================================================
  // Altar
  // ===================================================================================
  showAltar(): void {
    this.closeAll();
    this.open = 'altar';
    const a = this.host.currentAltar();
    this.altar.innerHTML = '';
    const box = el('div.altar-menu.interactive', {}, [
      el('h2', { text: 'Sigil Altar' }),
      el('div.sub', { text: a ? a.name : '' }),
    ]);
    const list = el('div.menu-list');
    list.append(
      this.button('Level Up', () => this.showLevelUp()),
      this.button('Travel', () => this.showTravel(), 'menu-btn', this.host.kindledAltars().length < 2),
      this.button('Leave', () => {
        this.closeAll();
        this.host.leaveAltar();
      }),
    );
    box.append(list);
    this.altar.append(box);
    this.altar.classList.add('open');
  }

  private showTravel(): void {
    this.closeAll();
    this.open = 'travel';
    this.altar.innerHTML = '';
    const cur = this.host.currentAltar();
    const box = el('div.altar-menu.interactive', {}, [el('h2', { text: 'Travel' }), el('div.sub', { text: 'Step between kindled altars' })]);
    const list = el('div.menu-list');
    for (const a of this.host.kindledAltars()) {
      list.append(this.button(a.name, () => {
        this.closeAll();
        this.host.travelTo(a.id);
      }, 'menu-btn', cur?.id === a.id));
    }
    list.append(this.button('Back', () => this.showAltar()));
    box.append(list);
    this.altar.append(box);
    this.altar.classList.add('open');
  }

  private showLevelUp(): void {
    this.closeAll();
    this.open = 'levelup';
    this.alloc = {};
    this.renderLevelUp();
    this.levelUpScreen.classList.add('open');
  }

  private renderLevelUp(): void {
    const p = this.host.player;
    const prog = p.progress;
    const points = ATTRIBUTE_IDS.reduce((s, id) => s + (this.alloc[id] ?? 0), 0);
    const cost = prog.costFor(points);
    const nextCost = prog.costFor(points + 1);
    const preview: Attributes = { ...p.attributes };
    for (const id of ATTRIBUTE_IDS) preview[id] += this.alloc[id] ?? 0;
    this.levelUpScreen.innerHTML = '';
    const rows = el('div');
    for (const id of ATTRIBUTE_IDS) {
      const add = this.alloc[id] ?? 0;
      const minus = this.button('−', () => {
        this.alloc[id] = Math.max(0, add - 1);
        this.renderLevelUp();
      }, 'btn', add <= 0);
      const plus = this.button('+', () => {
        this.alloc[id] = add + 1;
        this.renderLevelUp();
      }, 'btn', nextCost > prog.echoes || preview[id] >= 99);
      rows.append(
        el('div.attr-row', {}, [
          el('span.short', { text: ATTRIBUTE_INFO[id].short }),
          el('span.name', { text: ATTRIBUTE_INFO[id].name, title: ATTRIBUTE_INFO[id].desc }),
          el('span.val', { text: String(p.attributes[id]) }),
          minus,
          el(`span.val${add ? '.changed' : ''}` as 'span', { text: String(preview[id]) }),
          plus,
        ]),
      );
    }
    const delta = (label: string, before: number, after: number) => this.kv(label, String(before), after !== before ? `<span class="up">→ ${after}</span>` : '');
    const right = el('div', {
      html:
        `<div class="section-title">Echoes</div>` +
        this.kv('Held', prog.echoes.toLocaleString('en-US')) +
        this.kv('Required', cost.toLocaleString('en-US')) +
        this.kv('Next point', nextCost - cost > 0 ? (nextCost - cost).toLocaleString('en-US') : '—') +
        `<div style="height:16px"></div><div class="section-title">Result</div>` +
        delta('Level', levelOf(p.attributes), levelOf(preview)) +
        delta('Health', maxHpFor(p.attributes), maxHpFor(preview)) +
        delta('Stamina', maxStaminaFor(p.attributes), maxStaminaFor(preview)) +
        delta('Mana', maxManaFor(p.attributes), maxManaFor(preview)) +
        delta('Attack rating', this.weaponAR(p.weapon.id, p.attributes), this.weaponAR(p.weapon.id, preview)) +
        `<div style="height:16px"></div><div class="desc">Soft caps: Vitality grows slower past 25, 40 and 60; weapon scaling saturates past 18, 60 and 80.</div>`,
    });
    const foot = el('div.panel-foot', {}, [
      this.button('Back', () => this.showAltar(), 'btn'),
      this.button('Confirm', () => {
        if (this.host.levelUp(this.alloc)) {
          this.alloc = {};
          this.renderLevelUp();
        }
      }, 'btn primary', points === 0 || cost > prog.echoes),
    ]);
    const panel = el('div.panel.interactive', {}, [
      el('div.panel-head', {}, [el('h2', { text: 'Level Up' })]),
      el('div.panel-body', {}, [el('div.cols', {}, [el('div', {}, [el('div.section-title', { text: 'Attributes' }), rows]), right])]),
      foot,
    ]);
    this.levelUpScreen.append(panel);
  }

  // ===================================================================================
  // Lore reader
  // ===================================================================================
  showReader(entry: LoreEntry, returnTo: 'none' | 'pause' = 'none'): void {
    this.closeAll();
    this.open = 'reader';
    this.readerReturn = returnTo;
    this.reader.innerHTML = '';
    const body = el('div.panel-body', {}, [el('h3', { text: entry.title }), ...entry.text.map((t) => el('p', { text: t }))]);
    const foot = el('div.panel-foot', {}, [this.button('Close', () => this.closeReader(), 'btn primary')]);
    this.reader.append(el('div.panel.reader.interactive', {}, [body, foot]));
    this.reader.classList.add('open');
  }

  private closeReader(): void {
    this.closeAll();
    if (this.readerReturn === 'pause') this.showPause(this.tab);
    else this.host.resume();
  }
}
