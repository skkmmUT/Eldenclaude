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
    return { title, echoes: g.player.progress.echoes, kindled: g.level.altars[0].kindled, eliteDead: k.dead, gate: g.level.gate.open, level: g.player.progress.level };
  });
  check('title screen on fresh load', loaded.title === 'title');
  check('continue restores progress', loaded.echoes === 4321 && loaded.kindled && loaded.eliteDead && loaded.gate, JSON.stringify(loaded));

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
