import { WeaponId } from "../weapons/types";

export interface Vec2 {
  x: number;
  y: number;
}

export interface Circle {
  x: number;
  y: number;
  radius: number;
}

export interface AABB {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

export interface SweepHit {
  hit: boolean;
  t: number; // 0.0 to 1.0 along the segment
  hitX: number;
  hitY: number;
  normalX: number;
  normalY: number;
}

export interface SimPlayer {
  eid: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  aimAngle: number;
  hp: number;
  isDead: boolean;
  activeSlot: 0 | 1;
  primaryWeapon: WeaponId;
  primaryMag: number;
  primaryReserve: number;
  secondaryMag: number;
  reloadTimerSec: number;
  fireCooldownSec: number;
  continuousFireShots: number;
}

export interface SimProjectile {
  id: number;
  ownerEid: number;
  inputSeq: number;
  weaponId: WeaponId;
  x: number;
  y: number;
  prevX: number;
  prevY: number;
  vx: number;
  vy: number;
  speed: number;
  remainingRange: number;
  damage: number;
  alive: boolean;
  spawnTick: number;
}
