import { WeaponId, EquipId } from "../weapons/types";

export const ButtonBits = {
  FIRE: 1,
  ZOOM: 2,
  RELOAD: 4,
  EQUIP: 8,
  PICKUP: 16,
} as const;

export type ButtonBitFlags = number;

export const PlayerFlags = {
  DEAD: 1,
  SPAWN_PROTECTED: 2,
  FIRING_FLAME: 4,
  ZOOMING: 8,
  RELOADING: 16,
  BURNING: 32,
  POISONED: 64,
  TAKEOVER: 128,
} as const;

export const EntityKind = {
  PLAYER: 1,
  ITEM: 2,
  THROWN: 3,
  PLACED: 4,
  ZONE: 5,
} as const;

export interface InputCmd {
  s: number; // Sequence number, increments from 1
  mx: number; // Move x (-1 to 1)
  my: number; // Move y (-1 to 1)
  a: number; // Aim angle in radians (0 = +x, clockwise)
  d: number; // Aim distance (0 to 2000u)
  b: number; // Button bitmask (ButtonBits)
  w: 0 | 1; // Equipped slot: 0 = primary, 1 = secondary (pistol)
}

export interface WeaponSlotState {
  id: WeaponId;
  mag: number;
  res: number;
}

export interface YouState {
  eid: number;
  x: number;
  y: number;
  hp: number;
  st: "alive" | "dead";
  respawnAt?: number;
  protUntil?: number;
  w: 0 | 1;
  pri: WeaponSlotState | null;
  sec: { id: "pistol"; mag: number };
  eq: { id: EquipId; n: number } | null;
  reloadUntil?: number;
  nextFireAt?: number;
  speedMul: number;
  zoom: boolean;
  burn?: number;
  poison?: boolean;
  rtt: number;
  gg?: number;
}

export type PlayerEntityTuple = [
  eid: number,
  kind: 1,
  x: number,
  y: number,
  aim: number,
  hp: number,
  weaponId: string,
  flags: number
];

export type ItemEntityTuple = [
  eid: number,
  kind: 2,
  x: number,
  y: number,
  itemId: string
];

export type ThrownEntityTuple = [
  eid: number,
  kind: 3,
  x: number,
  y: number,
  itemId: string
];

export type PlacedEntityTuple = [
  eid: number,
  kind: 4,
  x: number,
  y: number,
  itemId: string,
  ownerEid: number,
  fuseEndTick?: number
];

export type ZoneEntityTuple = [
  eid: number,
  kind: 5,
  x: number,
  y: number,
  radius: number,
  zoneId: string
];

export type EntityTuple =
  | PlayerEntityTuple
  | ItemEntityTuple
  | ThrownEntityTuple
  | PlacedEntityTuple
  | ZoneEntityTuple;

export interface ShotEvent {
  k: "shot";
  prj: number; // Projectile ID
  o: number; // Shooter eid
  s: number; // Input seq of shooter
  w: WeaponId;
  x: number;
  y: number;
  a: number;
  v: number; // Speed
  r: number; // Remaining range
  tk: number; // Origin tick
}

export interface ProjectileEndEvent {
  k: "pend";
  prj: number;
  x: number;
  y: number;
  why: "wall" | "hit" | "range";
}

export interface HitEvent {
  k: "hit";
  v: number; // Victim eid
  a: number; // Attacker eid
  dmg: number;
  w: string;
}

export interface BoomEvent {
  k: "boom";
  x: number;
  y: number;
  r: number;
  w: string;
}

export interface KillEvent {
  k: "kill";
  killer: string;
  victim: string;
  w: string;
}

export interface SpawnEvent {
  k: "spawn";
  e: number;
  x: number;
  y: number;
}

export interface PickEvent {
  k: "pick";
  e: number;
  item: string;
}

export interface SoundEvent {
  k: "snd";
  x: number;
  y: number;
  s: "gun" | "boom";
}

export interface DenyEvent {
  k: "deny";
  s: number;
  why: string;
}

export type GameEvent =
  | ShotEvent
  | ProjectileEndEvent
  | HitEvent
  | BoomEvent
  | KillEvent
  | SpawnEvent
  | PickEvent
  | SoundEvent
  | DenyEvent;

export interface SnapshotMsg {
  k: number; // Server tick
  ack: number; // Last processed input sequence for recipient
  you?: YouState;
  view?: number;
  e: EntityTuple[];
  ev: GameEvent[];
}
