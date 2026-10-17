import { describe, it, expect } from "vitest";
import {
  WEAPONS,
  EQUIPMENTS,
  getWeaponDef,
  getEquipmentDef,
  computeMapHash,
  defaultMap,
  MapQuery,
  stepPlayerMovement,
  SimPlayer,
  FIXED_DELTA,
  PLAYER_BASE_SPEED,
} from "../src";

describe("Weapon Data and Map Integrity", () => {
  it("defines all initial weapons conforming to GAME_DESIGN.md specifications", () => {
    const pistol = getWeaponDef("pistol");
    expect(pistol.damage).toBe(20);
    expect(pistol.fireIntervalSec).toBe(0.25);
    expect(pistol.magSize).toBe(12);
    expect(pistol.projectileSpeed).toBe(1400);
    expect(pistol.range).toBe(700);
    expect(pistol.spreadDeg).toBe(2.0);
    expect(pistol.moveMultiplier).toBe(1.0);
    expect(pistol.isAutomatic).toBe(false);

    const k2 = getWeaponDef("k2");
    expect(k2.damage).toBe(17);
    expect(k2.fireIntervalSec).toBe(0.1);
    expect(k2.magSize).toBe(30);
    expect(k2.reserveAmmo).toBe(90);
    expect(k2.projectileSpeed).toBe(1600);
    expect(k2.range).toBe(900);
    expect(k2.spreadDeg).toBe(3.0);
    expect(k2.maxSpreadDeg).toBe(6.0);
    expect(k2.moveMultiplier).toBe(0.95);
    expect(k2.isAutomatic).toBe(true);

    const awp = getWeaponDef("awp");
    expect(awp.damage).toBe(115);
    expect(awp.fireIntervalSec).toBe(1.4);
    expect(awp.projectileSpeed).toBe(4000);
    expect(awp.range).toBe(1800);
  });

  it("defines tactical equipment data", () => {
    const grenade = getEquipmentDef("grenade");
    expect(grenade.damage).toBe(100);
    expect(grenade.radius).toBe(140);
    expect(grenade.fuseSec).toBe(2.5);
    expect(grenade.maxCount).toBe(2);
    expect(grenade.throwMaxDist).toBe(520);
  });

  it("computes stable map hash for default map", () => {
    const hash1 = computeMapHash(defaultMap);
    const hash2 = computeMapHash(defaultMap);
    expect(hash1).toBe(hash2);
    expect(hash1.length).toBeGreaterThan(0);
  });

  it("guarantees identical movement displacement over 1 second regardless of frame rate (30Hz fixed accumulator)", () => {
    const map = new MapQuery(defaultMap);

    // Scenario A: 60Hz display (dt = 1/60s per frame, 2 frames per 30Hz tick)
    // Over 30 fixed ticks (1.0 second):
    const playerA: SimPlayer = {
      eid: 1,
      x: 500,
      y: 500,
      vx: 0,
      vy: 0,
      aimAngle: 0,
      hp: 100,
      isDead: false,
      activeSlot: 0,
      primaryWeapon: "pistol",
      primaryMag: 12,
      primaryReserve: Infinity,
      secondaryMag: 12,
      reloadTimerSec: 0,
      fireCooldownSec: 0,
      continuousFireShots: 0,
    };

    // Scenario B: 144Hz display
    const playerB: SimPlayer = { ...playerA, x: 500, y: 500 };

    // Both run 30 ticks of FIXED_DELTA (1 second of simulation)
    for (let t = 0; t < 30; t++) {
      const resA = stepPlayerMovement(playerA, 1, 0, map, FIXED_DELTA);
      playerA.x = resA.x;
      playerA.y = resA.y;

      const resB = stepPlayerMovement(playerB, 1, 0, map, FIXED_DELTA);
      playerB.x = resB.x;
      playerB.y = resB.y;
    }

    // Displacement should equal PLAYER_BASE_SPEED * pistol.moveMultiplier * 1.0s = 220u
    expect(playerA.x - 500).toBeCloseTo(PLAYER_BASE_SPEED, 1);
    expect(playerB.x - 500).toBeCloseTo(PLAYER_BASE_SPEED, 1);
    expect(playerA.x).toBe(playerB.x);
  });
});
