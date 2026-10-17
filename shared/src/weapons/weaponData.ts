import { WeaponDef, EquipmentDef, WeaponId, EquipId } from "./types";

export const WEAPONS: Record<WeaponId, WeaponDef> = {
  pistol: {
    id: "pistol",
    name: "Pistol",
    archetype: "bullet",
    damage: 20,
    fireIntervalSec: 0.25, // 250ms
    magSize: 12,
    reserveAmmo: Infinity, // Infinite reserve
    reloadTimeSec: 1.2,
    projectileSpeed: 1400,
    range: 700,
    spreadDeg: 2.0,
    moveMultiplier: 1.0,
    isAutomatic: false, // Semi-auto
  },
  k2: {
    id: "k2",
    name: "K2 Rifle",
    archetype: "bullet",
    damage: 17,
    fireIntervalSec: 0.1, // 100ms (10 rps)
    magSize: 30,
    reserveAmmo: 90,
    reloadTimeSec: 2.0,
    projectileSpeed: 1600,
    range: 900,
    spreadDeg: 3.0,
    maxSpreadDeg: 6.0,
    spreadIncrementDeg: 0.3,
    moveMultiplier: 0.95,
    isAutomatic: true,
  },
  ak47: {
    id: "ak47",
    name: "AK-47",
    archetype: "bullet",
    damage: 24,
    fireIntervalSec: 0.12, // 120ms
    magSize: 30,
    reserveAmmo: 90,
    reloadTimeSec: 2.3,
    projectileSpeed: 1600,
    range: 900,
    spreadDeg: 4.0,
    maxSpreadDeg: 9.0,
    spreadIncrementDeg: 0.5,
    moveMultiplier: 0.93,
    isAutomatic: true,
  },
  awp: {
    id: "awp",
    name: "AWP Sniper",
    archetype: "bullet",
    damage: 115,
    fireIntervalSec: 1.4, // 1400ms
    magSize: 5,
    reserveAmmo: 15,
    reloadTimeSec: 3.0,
    projectileSpeed: 4000,
    range: 1800,
    spreadDeg: 0.0, // When zoomed/still
    maxSpreadDeg: 8.0, // When moving/unzoomed
    moveMultiplier: 0.85,
    isAutomatic: false,
    zoomMoveMultiplier: 0.5,
    zoomFovMultiplier: 1.4,
  },
  rpg: {
    id: "rpg",
    name: "RPG-7",
    archetype: "rocket",
    damage: 40, // Direct hit damage + max 90 splash
    fireIntervalSec: 1.0,
    magSize: 1,
    reserveAmmo: 2,
    reloadTimeSec: 2.5,
    projectileSpeed: 800,
    range: 1200,
    spreadDeg: 0.0,
    moveMultiplier: 0.85,
    isAutomatic: false,
  },
  flame: {
    id: "flame",
    name: "Flamethrower",
    archetype: "flame",
    damage: 7, // 7 per 10Hz tick
    fireIntervalSec: 0.1,
    magSize: 150, // 150 fuel
    reserveAmmo: 0,
    reloadTimeSec: 0,
    projectileSpeed: 0,
    range: 220,
    spreadDeg: 15.0, // +-15 deg cone
    moveMultiplier: 0.9,
    isAutomatic: true,
  },
};

export const EQUIPMENTS: Record<EquipId, EquipmentDef> = {
  grenade: {
    id: "grenade",
    name: "Frag Grenade",
    archetype: "thrown",
    damage: 100,
    radius: 140,
    fuseSec: 2.5,
    maxCount: 2,
    throwMaxDist: 520,
  },
  gas: {
    id: "gas",
    name: "Gas Grenade",
    archetype: "thrown",
    damage: 60, // 10/s over 6s
    radius: 130,
    fuseSec: 1.5,
    maxCount: 1,
    throwMaxDist: 520,
  },
  c4: {
    id: "c4",
    name: "C4 Explosive",
    archetype: "placed",
    damage: 120,
    radius: 160,
    fuseSec: 0,
    maxCount: 1,
  },
  mine: {
    id: "mine",
    name: "Landmine",
    archetype: "placed",
    damage: 90,
    radius: 110,
    fuseSec: 0.3,
    maxCount: 2,
  },
  timebomb: {
    id: "timebomb",
    name: "Time Bomb",
    archetype: "placed",
    damage: 150,
    radius: 220,
    fuseSec: 5.0,
    maxCount: 1,
  },
};

export function getWeaponDef(id: WeaponId): WeaponDef {
  const def = WEAPONS[id];
  if (!def) {
    throw new Error(`Unknown weapon id: ${id}`);
  }
  return def;
}

export function getEquipmentDef(id: EquipId): EquipmentDef {
  const def = EQUIPMENTS[id];
  if (!def) {
    throw new Error(`Unknown equipment id: ${id}`);
  }
  return def;
}
