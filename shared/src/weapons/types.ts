export type WeaponArchetype =
  | "bullet"
  | "rocket"
  | "flame"
  | "thrown"
  | "placed"
  | "zone";

export type WeaponId =
  | "pistol"
  | "k2"
  | "ak47"
  | "awp"
  | "rpg"
  | "flame";

export type EquipId =
  | "grenade"
  | "gas"
  | "c4"
  | "mine"
  | "timebomb";

export interface WeaponDef {
  id: WeaponId;
  name: string;
  archetype: WeaponArchetype;
  damage: number;
  /** Seconds between shots */
  fireIntervalSec: number;
  /** Number of rounds in magazine (or fuel) */
  magSize: number;
  /** Initial reserve ammo (-1 or Infinity for infinite) */
  reserveAmmo: number;
  /** Seconds to reload */
  reloadTimeSec: number;
  /** Projectile speed in u/s (0 for flame/placed) */
  projectileSpeed: number;
  /** Max effective range in u */
  range: number;
  /** Base spread in degrees */
  spreadDeg: number;
  /** Max spread under continuous fire in degrees */
  maxSpreadDeg?: number;
  /** Spread increase per continuous shot in degrees */
  spreadIncrementDeg?: number;
  /** Movement speed multiplier when equipped (e.g. 0.95) */
  moveMultiplier: number;
  /** True if fully automatic (continuous hold triggers shots) */
  isAutomatic: boolean;
  /** For AWP zoom */
  zoomMoveMultiplier?: number;
  zoomFovMultiplier?: number;
}

export interface EquipmentDef {
  id: EquipId;
  name: string;
  archetype: WeaponArchetype;
  damage: number;
  radius: number;
  fuseSec: number;
  maxCount: number;
  throwMaxDist?: number;
}
