import { FIXED_DELTA, PLAYER_BASE_SPEED, PLAYER_RADIUS } from "../constants";
import { MapQuery } from "../map/mapLoader";
import { normalizeMoveInput } from "./math";
import { moveCircleWithSliding } from "./collision";
import { SimPlayer } from "./types";
import { getWeaponDef } from "../weapons/weaponData";

export interface MovementResult {
  x: number;
  y: number;
  vx: number;
  vy: number;
  speed: number;
}

export function stepPlayerMovement(
  player: SimPlayer,
  mx: number,
  my: number,
  map: MapQuery,
  dt: number = FIXED_DELTA
): MovementResult {
  if (player.isDead) {
    return { x: player.x, y: player.y, vx: 0, vy: 0, speed: 0 };
  }

  // 1. Normalize input vector (max length 1.0)
  const norm = normalizeMoveInput(mx, my);

  // 2. Weapon speed multiplier
  const weaponId = player.activeSlot === 0 ? player.primaryWeapon : "pistol";
  const weaponDef = getWeaponDef(weaponId);
  const weaponMultiplier = weaponDef.moveMultiplier;

  // 3. Calculate target velocity
  const speed = PLAYER_BASE_SPEED * weaponMultiplier;
  const targetVx = norm.x * speed;
  const targetVy = norm.y * speed;

  const deltaX = targetVx * dt;
  const deltaY = targetVy * dt;

  // 4. Collision with sliding against map tiles
  const res = moveCircleWithSliding(
    map,
    player.x,
    player.y,
    PLAYER_RADIUS,
    deltaX,
    deltaY
  );

  const actualVx = dt > 0 ? (res.x - player.x) / dt : 0;
  const actualVy = dt > 0 ? (res.y - player.y) / dt : 0;

  return {
    x: res.x,
    y: res.y,
    vx: actualVx,
    vy: actualVy,
    speed,
  };
}
