/**
 * Automated play-test: launches the production build in headless Chromium (WebGL via
 * SwiftShader), drives the real game through its input layer and asserts on game state.
 *
 *   npm run build && npm run smoke
 *
 * Requires the `playwright` package with a Chromium build available
 * (npm i -D playwright && npx playwright install chromium).
 * Screenshots are written to ./artifacts/.
 */
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const out = path.join(root, 'artifacts');
mkdirSync(out, { recursive: true });
const PORT = 4179;

const server = spawn(process.execPath, [path.join(root, 'node_modules/vite/bin/vite.js'), 'preview', '--port', String(PORT), '--strictPort'], {
  cwd: root,
  stdio: 'pipe',
});
await new Promise((res, rej) => {
  const t = setTimeout(() => rej(new Error('preview server did not start')), 20000);
  server.stdout.on('data', (d) => {
    if (String(d).includes(String(PORT))) {
      clearTimeout(t);
      res();
    }
  });
});

const results = [];
let failures = 0;
const check = (name, ok, detail = '') => {
  results.push(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  — ' + detail : ''}`);
  if (!ok) failures++;
};

const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errors = [];
page.on('console', (m) => {
  if (m.type() === 'error') errors.push(m.text());
});
page.on('pageerror', (e) => errors.push(`${e.message}\n${e.stack}`));

async function boot(query) {
  await page.goto(`http://localhost:${PORT}/?test=1&quality=low${query}`, { waitUntil: 'load' });
  await page.waitForFunction(() => window.__TOA?.game?.frameCount > 2, null, { timeout: 90000 });
  await page.evaluate(() => {
    const g = window.__TOA.game;
    g.externalClock = true;
    window.g = g;
    window.V = g.player.position.constructor;
    window.T = {
      press(code, holdFrames = 2) {
        g.input.simulate(code, true);
        g.simulate(holdFrames / 60);
        g.input.simulate(code, false);
        g.simulate(1 / 60);
      },
      hold(code, secs) {
        g.input.simulate(code, true);
        g.simulate(secs);
      },
      release(code) {
        g.input.simulate(code, false);
        g.simulate(1 / 60);
      },
      face(target) {
        const p = g.player.position;
        g.player.facing = Math.atan2(target.x - p.x, target.z - p.z);
        g.camera.snapBehind(g.player.facing);
      },
      place(x, y, z, yaw = 0) {
        g.player.motor.teleport(x, y, z);
        g.player.facing = yaw;
        g.camera.snapBehind(yaw);
        g.simulate(0.05);
      },
      heal() {
        g.player.restoreAll();
      },
      render() {
        g.step(1 / 60, true);
      },
      idle(maxSecs = 4) {
        for (let i = 0; i < maxSecs * 60 && (g.player.state !== 'locomotion' || g.player.attack); i++) g.step(1 / 60, false);
      },
    };
    window.counts = { hit: 0, blocked: 0, parried: 0, died: 0, playerHit: 0 };
    g.events.on('hit', (h) => {
      counts.hit++;
      if (h.target === g.player) counts.playerHit++;
    });
    g.events.on('blocked', () => counts.blocked++);
    g.events.on('parried', () => counts.parried++);
    g.events.on('died', () => counts.died++);
  });
}
const ev = (fn, arg) => page.evaluate(fn, arg);
const shot = async (name) => {
  await ev(() => T.render());
  await page.screenshot({ path: path.join(out, `${name}.png`) });
};

try {
  await boot('&skipTitle=1');
  await ev(() => g.simulate(1.6));
  check('boots into gameplay', await ev(() => g.mode === 'playing' && g.player.state === 'locomotion'), await ev(() => `${g.mode}/${g.player.state}`));
  await shot('01_start');

  // --- Movement ------------------------------------------------------------------------
  const moved = await ev(() => {
    const z0 = g.player.position.z;
    T.hold('KeyW', 1.0);
    T.release('KeyW');
    return g.player.position.z - z0;
  });
  check('run forward (W)', moved > 2.5, `moved ${moved.toFixed(2)} m in 1 s`);

  const sprint = await ev(() => {
    const st0 = g.player.stamina;
    g.input.simulate('KeyW', true);
    T.hold('ShiftLeft', 1.2);
    const r = { sprinting: g.player.sprinting, speed: g.player.speedNow, stamina: st0 - g.player.stamina };
    g.input.simulate('ShiftLeft', false);
    g.input.simulate('KeyW', false);
    g.simulate(0.3);
    return r;
  });
  check('sprint (hold Shift)', sprint.sprinting && sprint.speed > 5 && sprint.stamina > 5, JSON.stringify(sprint));

  const jump = await ev(() => {
    const y0 = g.player.position.y;
    g.input.simulate('Space', true);
    let maxY = y0;
    let sawAir = false;
    for (let i = 0; i < 70; i++) {
      g.step(1 / 60, false);
      if (i === 2) g.input.simulate('Space', false);
      maxY = Math.max(maxY, g.player.position.y);
      if (g.player.state === 'air') sawAir = true;
    }
    return { rise: maxY - y0, sawAir, landed: g.player.motor.grounded, state: g.player.state };
  });
  check('jump', jump.sawAir && jump.rise > 0.8 && jump.landed, JSON.stringify(jump));

  const roll = await ev(() => {
    T.heal();
    g.simulate(0.3);
    const p0 = g.player.position.clone();
    g.input.simulate('KeyD', true);
    g.simulate(0.05);
    T.press('ShiftLeft', 4);
    let iframes = false;
    let sawDodge = false;
    for (let i = 0; i < 40; i++) {
      g.step(1 / 60, false);
      if (g.player.state === 'dodge') sawDodge = true;
      if (g.player.invulnerable) iframes = true;
    }
    g.input.simulate('KeyD', false);
    g.simulate(0.3);
    return { sawDodge, iframes, dist: g.player.position.distanceTo(p0) };
  });
  check('roll with i-frames (tap Shift)', roll.sawDodge && roll.iframes && roll.dist > 2.5, JSON.stringify(roll));

  // --- Melee vs enemy ------------------------------------------------------------------
  const melee = await ev(() => {
    T.heal();
    const e = g.enemies.find((x) => x.spawn.id === 'rev_gate');
    // Start from an unaware foe: earlier movement tests can alert it, and its random
    // guard/dodge reflexes would make this check flaky.
    e.reset();
    e.setPlayer(g.player);
    T.place(e.position.x - 1.9, 0, e.position.z, Math.PI / 2);
    T.face(e.position);
    const hp0 = e.hp;
    const ids = [];
    T.press('KeyJ');
    ids.push(g.player.attack?.data.id);
    g.simulate(0.3);
    T.press('KeyJ');
    g.simulate(0.05);
    ids.push(g.player.attack?.data.id);
    g.simulate(0.9);
    return { dmg: hp0 - e.hp, ids, aggro: e.aggro, stamina: g.player.stamina };
  });
  check('light attack damages enemy', melee.dmg > 0, `damage ${Math.round(melee.dmg)}`);
  check('light combo chains (ss_light1 → ss_light2)', melee.ids[0] === 'ss_light1' && melee.ids[1] === 'ss_light2', melee.ids.join(' → '));
  check('enemy becomes hostile when struck', melee.aggro);
  await shot('02_melee');

  // --- Enemy AI fights back --------------------------------------------------------------
  const ai = await ev(() => {
    T.heal();
    const e = g.enemies.find((x) => x.spawn.id === 'rev_gate');
    const states = new Set();
    const hp0 = g.player.hp;
    for (let i = 0; i < 60 * 10; i++) {
      g.step(1 / 60, false);
      states.add(e.state);
      if (g.player.hp < g.player.maxHp * 0.4) T.heal();
    }
    return { states: [...states], playerHit: counts.playerHit, hpLost: hp0 - g.player.hp };
  });
  check('enemy AI attacks the player', ai.playerHit > 0 && ai.states.includes('attack'), `states: ${ai.states.join(',')} · hits on player: ${ai.playerHit}`);
  check('enemy AI uses tactical states (defend/strafe)', ai.states.includes('defend'), ai.states.join(','));

  // --- Block ------------------------------------------------------------------------------
  const block = await ev(() => {
    T.heal();
    const e = g.enemies.find((x) => x.spawn.id === 'rev_gate');
    const b0 = counts.blocked;
    g.input.simulate('KeyL', true);
    let staminaMin = g.player.stamina;
    for (let i = 0; i < 60 * 12 && counts.blocked === b0; i++) {
      T.face(e.position);
      g.step(1 / 60, false);
      staminaMin = Math.min(staminaMin, g.player.stamina);
      if (g.player.hp < g.player.maxHp * 0.4) T.heal();
    }
    g.input.simulate('KeyL', false);
    g.simulate(0.1);
    return { blocked: counts.blocked - b0, staminaMin, max: g.player.maxStamina };
  });
  check('guarding blocks enemy attacks (stamina drain)', block.blocked > 0 && block.staminaMin < block.max, JSON.stringify(block));

  // --- Parry → riposte -------------------------------------------------------------------
  const parry = await ev(() => {
    T.heal();
    const e = g.enemies.find((x) => x.spawn.id === 'rev_gate');
    const p0 = counts.parried;
    let pressed = false;
    for (let i = 0; i < 60 * 20 && counts.parried === p0; i++) {
      T.face(e.position);
      const a = e.attack;
      if (!pressed && a && a.data.parryable && a.time >= a.data.startup - 0.12 && a.time < a.data.startup && e.distanceTo(g.player) < 3.2) {
        g.input.simulate('KeyQ', true);
        pressed = true;
      } else if (pressed) {
        g.input.simulate('KeyQ', false);
        if (!e.attack) pressed = false;
      }
      g.step(1 / 60, false);
      if (g.player.hp < g.player.maxHp * 0.4) T.heal();
    }
    g.input.simulate('KeyQ', false);
    const parried = counts.parried - p0;
    const ripostable = e.ripostableTimer > 0;
    const hp0 = e.hp;
    g.simulate(0.1);
    T.press('KeyJ');
    let crit = g.player.state;
    for (let i = 0; i < 30 && crit !== 'critical'; i++) {
      g.step(1 / 60, false);
      crit = g.player.state;
    }
    g.simulate(1.2);
    return { parried, ripostable, crit, dmg: hp0 - e.hp, enemyState: e.state, dead: e.dead };
  });
  check('parry staggers an attacker', parry.parried > 0 && parry.ripostable, JSON.stringify(parry));
  check('riposte after parry (critical hit)', parry.crit === 'critical' && parry.dmg > 150, JSON.stringify(parry));
  await shot('03_after_riposte');

  // --- Charged heavy ------------------------------------------------------------------------
  const charged = await ev(() => {
    T.heal();
    T.idle();
    T.place(0, 0, -30, 0);
    g.input.simulate('KeyK', true);
    g.simulate(0.75);
    const charging = g.player.attack?.data.id;
    g.input.simulate('KeyK', false);
    g.simulate(0.05);
    const id = g.player.attack?.data.id;
    g.simulate(1.5);
    return { charging, id };
  });
  check('heavy attack charges into charged attack', charged.charging === 'ss_heavy' && charged.id === 'ss_charged', JSON.stringify(charged));

  // --- Lock-on + spell ----------------------------------------------------------------------
  const spell = await ev(() => {
    T.heal();
    const e = g.enemies.find((x) => x.spawn.id === 'rev_graves');
    T.place(e.position.x, 0, e.position.z - 9, 0);
    T.face(e.position);
    g.simulate(0.2);
    T.press('Tab');
    const locked = g.player.lockTarget === e;
    const mana0 = g.player.mana;
    const hp0 = e.hp;
    T.press('KeyC');
    g.simulate(0.5);
    const manaSpent = mana0 - g.player.mana;
    g.simulate(1.2);
    return { locked, manaSpent, dmg: hp0 - e.hp };
  });
  check('lock-on acquires target (Tab)', spell.locked);
  check('Abyssal Bolt spends mana and hits locked target', spell.manaSpent > 0 && spell.dmg > 0, JSON.stringify(spell));
  await shot('04_spell_lock');

  // --- Item use ----------------------------------------------------------------------------
  const item = await ev(() => {
    g.player.lockTarget = null;
    T.place(-10, 0, -36, 0);
    g.player.hp = g.player.maxHp * 0.4;
    const hp0 = g.player.hp;
    const c0 = g.player.inventory.belt[0].count;
    g.player.inventory.beltIndex = 0;
    T.press('KeyR');
    g.simulate(1.4);
    return { gained: g.player.hp - hp0, used: c0 - g.player.inventory.belt[0].count };
  });
  check('Crimson Ichor heals and consumes a charge', item.gained > 100 && item.used === 1, JSON.stringify(item));

  // --- Kill an enemy, echoes ------------------------------------------------------------------
  const kill = await ev(() => {
    const e = g.enemies.find((x) => x.spawn.id === 'rev_cloister');
    const ech0 = g.player.progress.echoes;
    T.place(e.position.x - 2, 0, e.position.z, Math.PI / 2);
    for (let i = 0; i < 40 && !e.dead; i++) {
      T.heal();
      T.face(e.position);
      T.press('KeyJ');
      g.simulate(0.45);
    }
    g.simulate(0.2);
    return { dead: e.dead, gained: g.player.progress.echoes - ech0 };
  });
  check('enemy dies and grants echoes', kill.dead && kill.gained >= 185, JSON.stringify(kill));

  // --- Altar: kindle + rest + respawn enemies ------------------------------------------------
  const altar = await ev(() => {
    T.heal();
    T.place(-5, 0, -33.2, 0);
    g.simulate(0.2);
    const prompt1 = g.player.focusPrompt;
    T.press('KeyE');
    const kindled = g.level.altars[0].kindled;
    g.simulate(0.3);
    const prompt2 = g.player.focusPrompt;
    T.press('KeyE');
    g.simulate(1.0);
    const resting = g.player.isResting;
    const revived = g.enemies.find((x) => x.spawn.id === 'rev_cloister');
    return { prompt1, kindled, prompt2, resting, revived: !revived.dead && revived.hp === revived.maxHp };
  });
  await page.waitForTimeout(900);
  const altarMenu = await ev(() => g.menus.open);
  check('altar can be kindled', altar.kindled && altar.prompt1 === 'Kindle Sigil Altar', JSON.stringify(altar));
  check('resting at altar opens altar menu', altar.resting && altarMenu === 'altar', `menu: ${altarMenu}`);
  check('resting revives ordinary enemies', altar.revived);
  await shot('05_altar_menu');
  const lvl = await ev(() => {
    g.player.progress.echoes += 5000;
    const l0 = g.player.progress.level;
    const hp0 = g.player.maxHp;
    const ok = g.levelUp({ vitality: 2 });
    return { ok, l0, l1: g.player.progress.level, hp0, hp1: g.player.maxHp };
  });
  check('level up spends echoes and raises stats', lvl.ok && lvl.l1 === lvl.l0 + 2 && lvl.hp1 > lvl.hp0, JSON.stringify(lvl));
  await ev(() => {
    g.menus.closeAll();
    g.leaveAltar();
    g.simulate(1.5);
  });
  await page.waitForTimeout(1000);
  await ev(() => g.simulate(0.2));

  // --- Plunge attack from the terrace ---------------------------------------------------------
  const plunge = await ev(() => {
    T.heal();
    T.place(24.0, 3.2, 20, -Math.PI / 2);
    g.simulate(0.2);
    const onTerrace = g.player.position.y > 3;
    g.input.simulate('KeyW', true);
    let id = null;
    for (let i = 0; i < 180; i++) {
      g.step(1 / 60, false);
      if (g.player.state === 'air' && g.player.motor.velocity.y < -1) {
        g.input.simulate('KeyW', false);
        T.press('KeyJ');
        id = g.player.attack?.data.id;
        break;
      }
    }
    g.input.simulate('KeyW', false);
    g.simulate(1.2);
    return { onTerrace, id, y: g.player.position.y, state: g.player.state };
  });
  check('plunge attack when attacking while falling from a ledge', plunge.onTerrace && plunge.id === 'ss_plunge' && plunge.y < 0.1, JSON.stringify(plunge));

  // --- Death, echo drop, respawn and recovery ---------------------------------------------------
  const death = await ev(() => {
    g.player.progress.echoes = 777;
    T.place(0, 0, -20, 0);
    const deathPos = g.player.position.clone();
    g.player.applyDamage(g.player.hp + 10, null);
    const mode = g.mode;
    g.simulate(5.4);
    const back = g.mode;
    const atAltar = g.player.position.distanceTo(g.level.altars[0].standPoint()) < 0.5;
    const echoesAfter = g.player.progress.echoes;
    T.place(deathPos.x, 0, deathPos.z, 0);
    g.simulate(0.2);
    const prompt = g.player.focusPrompt;
    T.press('KeyE');
    return { mode, back, atAltar, echoesAfter, prompt, recovered: g.player.progress.echoes };
  });
  check('death drops echoes and respawns at last altar', death.mode === 'dead' && death.back === 'playing' && death.atAltar && death.echoesAfter === 0, JSON.stringify(death));
  check('lost echoes can be reclaimed', death.recovered === 777, JSON.stringify(death));

  // --- Elite: intro, phases, defeat, gate ---------------------------------------------------------
  const elite = await ev(() => {
    T.heal();
    const k = g.enemies.find((x) => x.spawn.id === 'elite_vaelor');
    T.place(0, 2, 36.5, 0);
    let intro = false;
    for (let i = 0; i < 60 * 4 && !k.aggro; i++) g.step(1 / 60, false);
    intro = !!g.hud.boss;
    const states = new Set();
    for (let i = 0; i < 60 * 8; i++) {
      g.step(1 / 60, false);
      states.add(k.state);
      if (g.player.hp < g.player.maxHp * 0.5) T.heal();
    }
    k.hp = k.maxHp * 0.45;
    let phase = 1;
    for (let i = 0; i < 60 * 6 && phase === 1; i++) {
      g.step(1 / 60, false);
      phase = k.phase;
      if (g.player.hp < g.player.maxHp * 0.5) T.heal();
    }
    g.simulate(2);
    k.hp = 1;
    k.invulnerable = false;
    const dir = new V(0, 0, 1);
    g.combat.resolve(g.player, k, { source: g.player.weapon, motionValue: 1, poiseDamage: 0, reaction: 'flinch', parryable: false, guardDamage: 0, knockback: 0, hitStop: 0, shake: 0 }, k.centerPoint(new V()), dir);
    g.simulate(1);
    return { aggro: k.aggro, intro, states: [...states], phase, dead: k.dead, gate: g.level.gate.open };
  });
  check('elite engages with boss bar', elite.aggro && elite.intro, JSON.stringify(elite));
  check('elite attacks', elite.states.includes('attack'), elite.states.join(','));
  check('elite enters phase 2 below 50% HP', elite.phase === 2);
  check('elite defeat opens the Gate of Eternity', elite.dead && elite.gate);
  await shot('06_after_elite');

  // --- Open world & environment -------------------------------------------------------------------
  const world = await ev(() => {
    T.heal();
    g.player.lockTarget = null;
    T.place(0, 0, -40, Math.PI);
    g.input.simulate('KeyW', true);
    g.simulate(6);
    g.input.simulate('KeyW', false);
    g.simulate(0.3);
    const p = g.player.position;
    const ground = g.level.overworld.terrain.height(p.x, p.z);
    return { z: p.z, y: p.y, ground };
  });
  check('walk out of the open south gate onto the terrain', world.z < -60 && Math.abs(world.y - world.ground) < 0.25, JSON.stringify(world));
  const env = await ev(() => {
    const h0 = g.env.time.hours;
    g.env.weather.locked = true;
    g.env.weather.set('rain');
    g.simulate(40);
    const r = { advanced: g.env.time.hours - h0, rain: g.env.weather.current.rain, envMap: !!g.renderer.scene.environment, label: g.worldTime() };
    g.env.weather.set('clear', true);
    return r;
  });
  check('time of day advances', env.advanced > 0.4, JSON.stringify(env));
  check('weather transitions to rain', env.rain > 0.6, JSON.stringify(env));
  check('sky image-based lighting is generated', env.envMap);
  const worldEnemies = await ev(() => g.enemies.filter((e) => ['rev_bridge', 'rev_keep_a', 'rev_bough'].includes(e.spawn.id)).map((e) => Math.abs(e.position.y - g.level.overworld.terrain.height(e.position.x, e.position.z))));
  check('overworld enemies stand on the terrain', worldEnemies.length === 3 && worldEnemies.every((d) => d < 0.6), JSON.stringify(worldEnemies));
  const pass = await ev(() => {
    g.env.time.set(10);
    const a = g.passTime();
    const b = g.passTime();
    return [a, b];
  });
  check('altar "Pass Time" advances the day', pass[0] === 'Noon' && pass[1] === 'Dusk', pass.join(' → '));
  await ev(() => g.env.time.set(10));
  await shot('09_overworld');

  // --- RPG depth: loot, armour, rings, weapon arts, spells --------------------------------------
  const drops = await ev(() => ({ plate: g.player.inventory.armor.includes('gravebound_plate'), signet: g.player.inventory.accessories.includes('gravebound_signet') }));
  check('elite drops the Gravebound set', drops.plate && drops.signet, JSON.stringify(drops));

  const loot = await ev(() => {
    for (const e of g.enemies) e.setPlayer(null);
    const report = { chests: 0, chestTotal: 0, items: 0, itemTotal: 0, failed: [] };
    const tryInteract = (target, isDone) => {
      const offsets = [[1.35, 0], [-1.35, 0], [0, 1.35], [0, -1.35], [0.95, 0.95], [-0.95, -0.95], [0.95, -0.95], [-0.95, 0.95], [0, 0]];
      for (const [dx, dz] of offsets) {
        T.heal();
        T.place(target.position.x + dx, target.position.y + 0.6, target.position.z + dz, Math.atan2(-dx, -dz));
        g.simulate(0.25);
        if (g.player.focus !== target) continue;
        T.press('KeyE');
        g.simulate(0.2);
        if (isDone()) return true;
      }
      return false;
    };
    for (const c of g.level.chests) {
      if (c.opened) continue;
      report.chestTotal++;
      if (tryInteract(c, () => c.opened)) report.chests++;
      else report.failed.push(c.id);
    }
    for (const p of g.level.pickups) {
      if (p.taken || p.content.kind !== 'item') continue;
      report.itemTotal++;
      if (tryInteract(p, () => p.taken)) report.items++;
      else report.failed.push(p.id);
    }
    if (g.menus.open === 'reader') g.menus.closeAll?.();
    g.player.inputLocked = false;
    for (const e of g.enemies) if (!e.dead) e.setPlayer(g.player);
    const inv = g.player.inventory;
    return { ...report, weapons: inv.weapons.length, armor: inv.armor.length, accessories: inv.accessories.length, spells: inv.spells.length };
  });
  check('every chest and item in the world can be reached and taken', loot.failed.length === 0 && loot.chests === loot.chestTotal && loot.items === loot.itemTotal, JSON.stringify(loot));
  check('loot fills the inventory (10 weapons, 9 armour, 7 talismans, 18 spells)', loot.weapons === 10 && loot.armor === 9 && loot.accessories === 7 && loot.spells === 18, JSON.stringify(loot));

  const armour = await ev(() => {
    const p = g.player;
    const rig0 = p.rig;
    const before = { phys: p.absorption.physical, poise: p.maxPoise, load: p.equipLoad };
    g.equipArmor('chest', 'gravebound_plate');
    g.equipArmor('head', 'gravebound_helm');
    const after = { phys: p.absorption.physical, poise: p.maxPoise, load: p.equipLoad, rebuilt: p.rig !== rig0, helmet: p.appearance().helmet, pauldrons: p.appearance().pauldrons };
    g.equipAccessory(0, 'gravebound_signet');
    const ringPoise = p.maxPoise - after.poise;
    g.equipAccessory(0, null);
    return { before, after, ringPoise };
  });
  check('heavy armour raises absorption, poise and weight', armour.after.phys > armour.before.phys + 0.05 && armour.after.poise > armour.before.poise + 10 && armour.after.load > armour.before.load, JSON.stringify(armour));
  check('changing armour rebuilds the character model', armour.after.rebuilt && armour.after.helmet === 'horned' && armour.after.pauldrons === 'spiked', JSON.stringify(armour.after));
  check('ring adds its passive effect (+15 poise)', Math.abs(armour.ringPoise - 15) < 0.01, String(armour.ringPoise));

  const rollLoad = await ev(() => {
    const p = g.player;
    const measure = () => {
      T.heal();
      T.place(-20, 0, -36, 0);
      g.simulate(0.3);
      const p0 = p.position.clone();
      g.input.simulate('KeyD', true);
      g.simulate(0.05);
      T.press('ShiftLeft', 4);
      for (let i = 0; i < 40; i++) g.step(1 / 60, false);
      g.input.simulate('KeyD', false);
      g.simulate(0.4);
      return p.position.distanceTo(p0);
    };
    for (const s of ['head', 'chest', 'hands', 'legs']) g.equipArmor(s, null);
    const lightClass = p.loadClass;
    const light = measure();
    g.equipArmor('chest', 'gravebound_plate');
    g.equipArmor('head', 'gravebound_helm');
    g.equipArmor('hands', 'heir_gauntlets');
    g.equipArmor('legs', 'heir_greaves');
    const wi = p.inventory.weapons.indexOf('gravel_maul');
    g.equipWeapon(wi);
    const heavyClass = p.loadClass;
    const heavy = measure();
    g.equipArmor('chest', 'heir_cuirass');
    g.equipArmor('head', 'heir_crown');
    g.equipWeapon(0);
    return { lightClass, light, heavyClass, heavy, restored: p.loadClass };
  });
  check('equip load changes the roll (light rolls farther than heavy)', rollLoad.lightClass === 'light' && (rollLoad.heavyClass === 'heavy' || rollLoad.heavyClass === 'overloaded') && rollLoad.light > rollLoad.heavy + 0.8, JSON.stringify(rollLoad));

  const arts = await ev(() => {
    const p = g.player;
    T.heal();
    T.place(-20, 0, -36, 0);
    g.simulate(0.3);
    const inv = p.inventory;
    g.equipWeapon(inv.weapons.indexOf('bearded_axe'));
    const m0 = p.mana;
    const dmg0 = p.mods.damageMul;
    T.press('KeyG');
    g.simulate(1.0);
    const buff = { has: p.buffs.some((b) => b.id === 'war_cry'), mana: m0 - p.mana, dmgMul: p.mods.damageMul / dmg0 };
    T.idle();
    g.equipWeapon(inv.weapons.indexOf('keepwarden_halberd'));
    T.heal();
    T.press('KeyG');
    g.simulate(0.05);
    const attackArt = p.attack?.data.id ?? null;
    T.idle();
    g.equipWeapon(0);
    return { buff, attackArt };
  });
  check('buff weapon art (War Cry) spends mana and raises damage', arts.buff.has && arts.buff.mana === 12 && Math.abs(arts.buff.dmgMul - 1.2) < 0.01, JSON.stringify(arts.buff));
  check('attack weapon art (Reaping Arc) performs its attack', arts.attackArt === 'hb_art', String(arts.attackArt));

  const magic = await ev(() => {
    const p = g.player;
    const inv = p.inventory;
    const e = g.enemies.find((x) => x.spawn.id === 'rev_graves');
    const prep = (spellId, dist = 7) => {
      e.reset();
      e.setPlayer(null);
      T.heal();
      T.place(e.position.x, 0, e.position.z - dist, 0);
      T.face(e.position);
      inv.spellIndex = inv.spells.indexOf(spellId);
      p.spellCooldowns.clear();
      g.simulate(0.2);
    };
    const cast = (secs) => {
      T.press('KeyC');
      g.simulate(secs);
    };
    const out = {};
    prep('abyssal_meteor', 6);
    p.lockTarget = e;
    let hp0 = e.hp;
    cast(3.2);
    out.meteor = hp0 - e.hp;
    prep('frozen_tomb', 3);
    hp0 = e.hp;
    cast(0.9);
    out.frozen = e.frozen > 0;
    out.tomb = hp0 - e.hp;
    prep('radiant_mend');
    p.hp = p.maxHp * 0.4;
    const h0 = p.hp;
    cast(3);
    out.heal = p.hp - h0;
    prep('blood_spear', 7);
    p.lockTarget = e;
    const hpBefore = p.hp;
    hp0 = e.hp;
    cast(1.6);
    out.bloodCost = hpBefore - p.hp;
    out.blood = hp0 - e.hp;
    prep('eternal_guardian');
    cast(1.2);
    out.summon = g.projectiles.activeEffects;
    prep('sanctified_blade');
    cast(1.5);
    out.weaponExtra = p.mods.weaponExtra.holy ?? 0;
    p.lockTarget = null;
    e.setPlayer(p);
    p.buffs.length = 0;
    p.applyProgress(true);
    return out;
  });
  check('Abyssal Meteor falls on the target', magic.meteor > 0, JSON.stringify(magic));
  check('Frozen Tomb damages and freezes', magic.frozen && magic.tomb > 0, JSON.stringify(magic));
  check('Radiant Mend restores health over time', magic.heal > 50, JSON.stringify(magic));
  check('Blood Spear costs health and hits', magic.bloodCost > 0 && magic.blood > 0, JSON.stringify(magic));
  check('Eternal Guardian summons an ally', magic.summon >= 1, JSON.stringify(magic));
  check('Sanctified Blade adds holy damage to the weapon', magic.weaponExtra > 0, JSON.stringify(magic));
  await ev(() => g.menus.showPause('equipment'));
  await shot('10_equipment');
  await ev(() => g.menus.closeAll());

  // --- Region boss: The Fallen King ---------------------------------------------------------------
  const hallEntry = await ev(() => {
    T.heal();
    g.player.lockTarget = null;
    const king = g.king;
    T.place(0, 2.1, 62, 0);
    g.input.simulate('KeyW', true);
    let sawIntro = false;
    for (let i = 0; i < 60 * 4; i++) {
      g.step(1 / 60, false);
      if (g.cinematic) sawIntro = true;
      if (g.player.position.z > 70) break;
    }
    g.input.simulate('KeyW', false);
    g.simulate(5);
    const sealed = g.level.hall.barrier.sealed;
    // Try to leave: the mist barrier holds.
    king.setPlayer(null);
    T.place(0, 2.1, 68, Math.PI);
    g.input.simulate('KeyW', true);
    g.simulate(2);
    g.input.simulate('KeyW', false);
    const zAfter = g.player.position.z;
    king.setPlayer(g.player);
    return { aggro: king.aggro, sawIntro, sealed, zAfter, boss: g.hud.boss === king, altarHidden: !g.level.hall.altar.group.visible };
  });
  check('entering the Throne Hall wakes the Fallen King (intro scene, boss bar)', hallEntry.aggro && hallEntry.sawIntro && hallEntry.boss, JSON.stringify(hallEntry));
  check('mist barrier seals the hall during the fight', hallEntry.sealed && hallEntry.zAfter > 66.5, JSON.stringify(hallEntry));
  check('throne altar stays dormant while the king lives', hallEntry.altarHidden);

  const dodgeRun = async (ids, phase) => ev(({ ids, phase }) => {
    const king = g.king;
    const out = {};
    for (const id of ids) {
      for (const k of g.kingKnights) if (!k.dead) k.reset();
      king.stamina = king.maxStamina;
      T.heal();
      king.motor.teleport(0, 2, 86);
      king.facing = Math.PI;
      T.place(0, 2.1, 86 - 2.8, 0);
      g.simulate(0.05);
      king.faceTowards(g.player.position);
      king.forceAttack(id);
      const d = king.attack.data;
      const dodge = phase.dodge;
      let rolled = false;
      let hp0 = g.player.hp;
      let warned = 0;
      for (let i = 0; i < 60 * 4 && king.attack && king.attack.data.id === id; i++) {
        if (dodge && !rolled && king.attack.time >= d.startup - 0.12 * phase.tempo) {
          rolled = true;
          hp0 = g.player.hp;
          g.input.simulate('KeyD', true);
          T.press('ShiftLeft', 3);
        }
        warned = Math.max(warned, g.vfx.activeWarnings);
        g.step(1 / 60, false);
        if (king.attack && king.attack.time > d.startup + d.active + 0.05) break;
      }
      g.input.simulate('KeyD', false);
      out[id] = { dmg: Math.round(hp0 - g.player.hp), warned, rolled };
      g.simulate(0.6);
    }
    return out;
  }, { ids, phase });

  const p1Ids = ['fk_sweep', 'fk_backhand', 'fk_overhead', 'fk_slam', 'fk_thrust', 'fk_counter'];
  const p1Hit = await dodgeRun(['fk_sweep', 'fk_slam'], { dodge: false, tempo: 1 });
  check('control: standing still, the king\'s attacks connect', p1Hit.fk_sweep.dmg > 0 && p1Hit.fk_slam.dmg > 0, JSON.stringify(p1Hit));
  const p1 = await dodgeRun(p1Ids, { dodge: true, tempo: 1 });
  check('every phase-one attack can be dodged with a timed roll', Object.values(p1).every((r) => r.rolled && r.dmg === 0), JSON.stringify(p1));
  check('area attacks mark their zone on the ground during the wind-up', p1.fk_slam.warned >= 1 && p1.fk_overhead.warned >= 1, JSON.stringify({ slam: p1.fk_slam, overhead: p1.fk_overhead }));

  const reach = await ev(() => {
    const king = g.king;
    const opts = king.data.combat.attacks.filter((o) => !o.special);
    const misses = [];
    for (const o of opts) {
      T.heal();
      g.player.invulnerable = false;
      king.motor.teleport(0, 2, 86);
      king.attack = null;
      king.state = 'defend';
      king.facing = Math.PI;
      T.place(0, 2.1, 86 - o.maxRange, 0);
      g.simulate(0.05);
      king.faceTowards(g.player.position);
      const hp0 = g.player.hp;
      king.forceAttack(o.id);
      const d = king.attack.data;
      while (king.attack && king.attack.data.id === o.id && king.attack.time < d.startup + d.active + 0.1) g.step(1 / 60, false);
      if (!(hp0 - g.player.hp > 0)) misses.push(o.id);
      king.attack = null;
      king.state = 'defend';
      king.setPlayer(null);
      g.simulate(0.2);
      T.idle(5);
      g.simulate(0.3);
      king.setPlayer(g.player);
    }
    return { tested: opts.length, misses };
  });
  check('each of the king\'s attacks reaches the range the AI uses it from', reach.misses.length === 0, JSON.stringify(reach));

  const counter = await ev(() => {
    const king = g.king;
    const c = king.data.counter;
    const saved = c.chance;
    c.chance = 1;
    T.heal();
    king.motor.teleport(0, 2, 86);
    T.place(0, 2.1, 84.2, 0);
    king.attack = null;
    king.state = 'defend';
    king.stateTime = 0;
    king.counterCooldown = 0;
    king.faceTowards(g.player.position);
    T.face(king.position);
    T.press('KeyJ');
    let id = null;
    for (let i = 0; i < 60 && !id; i++) {
      g.step(1 / 60, false);
      if (king.attack) id = king.attack.data.id;
    }
    c.chance = saved;
    T.idle();
    g.simulate(1.5);
    return id;
  });
  check('the king counter-attacks when struck with his guard up', counter === 'fk_counter', String(counter));

  const summon = await ev(() => {
    const king = g.king;
    for (const k of g.kingKnights) if (!k.dead) k.reset();
    g.kingSummons = 0;
    king.hp = king.maxHp * 0.7;
    king.motor.teleport(0, 2, 86);
    let raised = false;
    for (let t = 0; t < 40 && !raised; t += 0.5) {
      T.heal();
      g.player.invulnerable = true;
      if (g.player.position.distanceTo(king.position) > 8) T.place(0, 2.1, 80, 0);
      g.simulate(0.5);
      raised = g.kingKnights.every((k) => !k.dead && !k.asleep);
    }
    g.player.invulnerable = false;
    const knights = g.kingKnights.map((k) => ({ aggro: k.aggro, y: +k.position.y.toFixed(2) }));
    for (const k of g.kingKnights) k.reset();
    return { raised, knights };
  });
  check('the king raises two fallen knights in battle', summon.raised && summon.knights.every((k) => k.aggro && Math.abs(k.y - 2) < 0.3), JSON.stringify(summon));

  const phase2 = await ev(() => {
    const king = g.king;
    const rig0 = king.rig;
    T.heal();
    T.place(0, 2.1, 78, 0);
    king.hp = king.maxHp * 0.45;
    king.attack = null;
    king.state = 'defend';
    let t = 0;
    while (king.phase !== 2 && t < 6) {
      g.simulate(0.1);
      t += 0.1;
    }
    g.simulate(2.2);
    return { phase: king.phase, rebuilt: king.rig !== rig0, tempo: king.tempo, helmetGone: king.rigLook.helmet === 'none' };
  });
  check('phase two: the armour shatters (model rebuilt) and tempo rises', phase2.phase === 2 && phase2.rebuilt && phase2.helmetGone && phase2.tempo > 1.1, JSON.stringify(phase2));

  const p2Ids = ['fk2_sweep', 'fk2_backhand', 'fk2_finisher', 'fk2_leap', 'fk2_delay', 'fk2_slam', 'fk_thrust', 'fk_counter'];
  const p2 = await dodgeRun(p2Ids, { dodge: true, tempo: 1.22 });
  check('every phase-two attack can be dodged with a timed roll', Object.values(p2).every((r) => r.rolled && r.dmg === 0), JSON.stringify(p2));

  const victory = await ev(() => {
    const king = g.king;
    T.heal();
    T.place(0, 2.1, 82, 0);
    king.motor.teleport(0, 2, 86);
    king.attack = null;
    king.state = 'defend';
    king.invulnerable = false;
    king.hp = 5;
    T.face(king.position);
    king.faceTowards(g.player.position);
    const dir = new V(0, 0, 1);
    g.combat.resolve(g.player, king, { source: g.player.weapon, motionValue: 1, poiseDamage: 0, reaction: 'flinch', parryable: false, guardDamage: 0, knockback: 0, hitStop: 0, shake: 0 }, king.centerPoint(new V()), dir);
    const cine = !!g.cinematic;
    g.simulate(6);
    const inv = g.player.inventory;
    T.place(0, 3.1, 97.2, 0);
    g.simulate(0.3);
    return {
      dead: king.dead,
      cine,
      unsealed: !g.level.hall.barrier.sealed,
      altarVisible: g.level.hall.altar.group.visible,
      altarPrompt: g.player.focusPrompt,
      blade: inv.weapons.includes('kings_greatblade'),
      seal: inv.accessories.includes('kings_seal'),
      objective: g.journal().objectives.at(-1).done,
    };
  });
  check('defeating the Fallen King plays the victory scene and lifts the barrier', victory.dead && victory.cine && victory.unsealed, JSON.stringify(victory));
  check('victory reward: the king\'s greatblade and seal', victory.blade && victory.seal, JSON.stringify(victory));
  check('the Ashen Throne altar wakes after the king falls', victory.altarVisible && /Kindle/.test(victory.altarPrompt ?? '') && victory.objective, JSON.stringify(victory));
  await shot('11_throne_hall');

  // --- Save, reload, continue ---------------------------------------------------------------------
  const saved = await ev(() => {
    g.player.progress.echoes = 4321;
    return g.saveGame();
  });
  check('save game', saved);
  await boot('');
  const loaded = await ev(() => {
    const title = g.mode;
    g.continueGame();
    g.simulate(0.5);
    const k = g.enemies.find((x) => x.spawn.id === 'elite_vaelor');
    return { title, echoes: g.player.progress.echoes, kindled: g.level.altars[0].kindled, eliteDead: k.dead, gate: g.level.gate.open, level: g.player.progress.level, kingDead: g.king.dead, throneAltar: g.level.hall.altar.group.visible };
  });
  check('title screen on fresh load', loaded.title === 'title');
  check('continue restores progress', loaded.echoes === 4321 && loaded.kindled && loaded.eliteDead && loaded.gate && loaded.kingDead && loaded.throneAltar, JSON.stringify(loaded));

  // --- Pause menu & graphics presets ----------------------------------------------------------------
  await ev(() => {
    g.menus.showPause('status');
  });
  await shot('07_pause_status');
  await ev(() => g.menus.showPause('map'));
  await shot('08_pause_map');
  for (const q of ['low', 'medium', 'high', 'ultra']) {
    const ok = await ev((q) => {
      g.settings.quality = q;
      g.applySettings();
      g.step(1 / 60, true);
      return g.renderer.profile.preset === q;
    }, q);
    check(`graphics preset ${q}`, ok);
  }
  await ev(() => {
    g.menus.closeAll();
    g.resume();
  });

  // --- Simulation cost (no rendering) -----------------------------------------------------------------
  const perf = await ev(() => {
    const t0 = performance.now();
    g.simulate(5);
    return (performance.now() - t0) / 300;
  });
  check('simulation step cost', perf < 8, `${perf.toFixed(2)} ms per 60 Hz step (SwiftShader CPU)`);
} catch (e) {
  check('test run completed without exceptions', false, String(e && e.stack ? e.stack : e));
}

check('no page errors', errors.length === 0, errors.slice(0, 5).join(' | '));
console.log(results.join('\n'));
console.log(`\n${results.length - failures}/${results.length} checks passed`);
await browser.close();
server.kill();
process.exit(failures ? 1 : 0);
