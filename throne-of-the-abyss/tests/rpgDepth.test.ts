import { describe, expect, it } from 'vitest';
import { addModifiers, combineAbsorptions, emptyModifiers, equipLoadClass, maxEquipLoad } from '@/rpg/Modifiers';
import { Inventory } from '@/items/Inventory';
import { applyGrant, grantExists } from '@/items/Grants';
import { ACCESSORIES, ARMOR } from '@/data/armor';
import { WEAPONS } from '@/data/weapons';
import { SPELLS } from '@/data/spells';
import { ATTACKS } from '@/data/attacks';
import { ENEMIES } from '@/data/enemies';
import { SCHOOL_NAMES } from '@/magic/SpellTypes';
import { DIRECT_DAMAGE_TYPES } from '@/combat/DamageTypes';

describe('modifiers', () => {
  it('multipliers multiply, additive fields add, absorptions stack on what gets through', () => {
    const m = emptyModifiers();
    addModifiers(m, { damageMul: 1.2, poise: 10, typeBuffs: { fire: 0.15 }, absorption: { physical: 0.5 } });
    addModifiers(m, { damageMul: 1.1, poise: 5, typeBuffs: { fire: 0.1 }, absorption: { physical: 0.5 } });
    expect(m.damageMul).toBeCloseTo(1.32);
    expect(m.poise).toBe(15);
    expect(m.typeBuffs.fire).toBeCloseTo(0.25);
    expect(m.absorption.physical).toBeCloseTo(0.75);
    expect(m.spellMul).toBe(1);
  });

  it('armour absorptions combine as 1 − Π(1 − a) and never reach 100%', () => {
    const a = combineAbsorptions([{ physical: 0.1 }, { physical: 0.2 }, {}]);
    expect(a.physical).toBeCloseTo(1 - 0.9 * 0.8);
    expect(a.fire).toBe(0);
    const heavy = combineAbsorptions(Object.values(ARMOR).map((x) => x.absorption));
    for (const t of DIRECT_DAMAGE_TYPES) expect(heavy[t]!).toBeLessThan(0.6);
  });

  it('equip load grows with endurance and classes follow 30/70/100%', () => {
    expect(maxEquipLoad(20)).toBeGreaterThan(maxEquipLoad(10));
    expect(maxEquipLoad(40) - maxEquipLoad(30)).toBeGreaterThan(maxEquipLoad(20) - maxEquipLoad(10));
    expect(equipLoadClass(30, 100)).toBe('light');
    expect(equipLoadClass(30.1, 100)).toBe('medium');
    expect(equipLoadClass(70, 100)).toBe('medium');
    expect(equipLoadClass(90, 100)).toBe('heavy');
    expect(equipLoadClass(100.5, 100)).toBe('overloaded');
  });

  it('starting kit is a medium roll for a level-1 heir', () => {
    const inv = new Inventory();
    expect(equipLoadClass(inv.equipWeight(), maxEquipLoad(10))).toBe('medium');
  });
});

describe('inventory equipment', () => {
  it('armour only goes into its own slot and only if owned', () => {
    const inv = new Inventory();
    expect(inv.equipArmor('head', 'gravebound_helm')).toBe(false); // not owned
    inv.addArmor('gravebound_helm');
    expect(inv.equipArmor('chest', 'gravebound_helm')).toBe(false); // wrong slot
    expect(inv.equipArmor('head', 'gravebound_helm')).toBe(true);
    expect(inv.equipped.head).toBe('gravebound_helm');
    expect(inv.equipArmor('head', null)).toBe(true);
    expect(inv.equippedArmor().map((a) => a.slot)).not.toContain('head');
  });

  it('a ring cannot be worn on both hands; amulets go only to the amulet slot', () => {
    const inv = new Inventory();
    inv.addAccessory('gravebound_signet');
    inv.addAccessory('seal_amulet');
    expect(inv.equipAccessory(0, 'gravebound_signet')).toBe(true);
    expect(inv.equipAccessory(1, 'gravebound_signet')).toBe(true);
    expect(inv.rings).toEqual([null, 'gravebound_signet']);
    expect(inv.equipAccessory(0, 'seal_amulet')).toBe(false);
    expect(inv.equipAccessory('amulet', 'gravebound_signet')).toBe(false);
    expect(inv.equipAccessory('amulet', 'seal_amulet')).toBe(true);
    expect(inv.equippedAccessories().length).toBe(2);
  });

  it('weight counts weapon, worn armour and accessories', () => {
    const inv = new Inventory();
    const base = inv.equipWeight();
    inv.addAccessory('gravebound_signet');
    inv.equipAccessory(0, 'gravebound_signet');
    expect(inv.equipWeight()).toBeCloseTo(base + ACCESSORIES.gravebound_signet.weight);
    inv.equipArmor('chest', null);
    expect(inv.equipWeight()).toBeCloseTo(base + ACCESSORIES.gravebound_signet.weight - ARMOR.heir_cuirass.weight);
  });

  it('serialize → restore round-trips and drops unknown or unowned ids', () => {
    const inv = new Inventory();
    applyGrant(inv, { type: 'armor', id: 'ward_mantle' });
    applyGrant(inv, { type: 'accessory', id: 'sorcerer_band' });
    applyGrant(inv, { type: 'spell', id: 'frozen_tomb' });
    inv.equipArmor('chest', 'ward_mantle');
    inv.equipAccessory(1, 'sorcerer_band');
    const copy = new Inventory();
    copy.restore(JSON.parse(JSON.stringify(inv.serialize())));
    expect(copy.serialize()).toEqual(inv.serialize());

    const bad = new Inventory();
    bad.restore({ ...inv.serialize(), armor: ['heir_crown', 'nope'], equipped: { head: 'nope', chest: 'ward_mantle', hands: null, legs: null }, rings: ['ghost', null] });
    expect(bad.equipped.head).toBe(null);
    expect(bad.equipped.chest).toBe(null); // not owned after filtering
    expect(bad.rings).toEqual([null, null]);
  });

  it('older saves without armour fields fall back to the starting regalia', () => {
    const inv = new Inventory();
    inv.restore({ weapons: ['heirs_longsword'], rightHand: 0 });
    expect(inv.equipped.chest).toBe('heir_cuirass');
    expect(inv.rings).toEqual([null, null]);
  });

  it('grants add once and report the item name', () => {
    const inv = new Inventory();
    const t = applyGrant(inv, { type: 'weapon', id: 'wraithfang' });
    expect(t?.title).toBe(WEAPONS.wraithfang.name);
    expect(applyGrant(inv, { type: 'weapon', id: 'wraithfang' })).toBe(null);
    expect(inv.weapons).toContain('wraithfang');
  });
});

describe('RPG content integrity', () => {
  it('weapon arts reference real attacks or carry a buff', () => {
    for (const w of Object.values(WEAPONS)) {
      if (!w.art) continue;
      expect(w.art.mana, w.id).toBeGreaterThan(0);
      if (w.art.kind === 'attack') expect(ATTACKS[w.art.attack], `${w.id} art`).toBeDefined();
      else expect(w.art.buff.duration).toBeGreaterThan(0);
    }
  });

  it('every weapon class of the design is present', () => {
    const cats = new Set(Object.values(WEAPONS).map((w) => w.category));
    for (const c of ['straightSword', 'greatsword', 'spear', 'halberd', 'dagger', 'axe', 'hammer', 'katana', 'staff', 'grimoire']) {
      expect(cats.has(c as never), c).toBe(true);
    }
    for (const w of Object.values(WEAPONS)) if (w.category === 'staff' || w.category === 'grimoire') expect(w.catalyst, w.id).toBeDefined();
  });

  it('15+ spells across all nine schools; damaging spells have damage data', () => {
    const spells = Object.values(SPELLS);
    expect(spells.length).toBeGreaterThanOrEqual(15);
    const schools = new Set(spells.map((s) => s.school));
    for (const sc of Object.keys(SCHOOL_NAMES)) expect(schools.has(sc as never), sc).toBe(true);
    for (const s of spells) {
      const k = s.effect.kind;
      if (k === 'projectile' || k === 'nova' || k === 'meteor' || k === 'strike' || k === 'rift') expect(s.damage, s.id).toBeDefined();
      if (s.hpCost) expect(s.hpCost).toBeLessThan(0.5);
    }
  });

  it('armour and accessories are well-formed', () => {
    for (const a of Object.values(ARMOR)) {
      expect(['head', 'chest', 'hands', 'legs']).toContain(a.slot);
      expect(a.weight).toBeGreaterThan(0);
      for (const t of DIRECT_DAMAGE_TYPES) expect(a.absorption[t] ?? 0).toBeLessThan(0.3);
    }
    for (const a of Object.values(ACCESSORIES)) {
      expect(['ring', 'amulet']).toContain(a.slot);
      expect(Object.keys(a.mods).length).toBeGreaterThan(0);
    }
  });

  it('boss drops exist', () => {
    for (const e of Object.values(ENEMIES)) for (const g of e.drops ?? []) expect(grantExists(g), g.id).toBe(true);
  });
});
