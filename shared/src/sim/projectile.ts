import { FIXED_DELTA, PLAYER_RADIUS } from "../constants";
import { MapQuery } from "../map/mapLoader";
import { raycastMapDDA } from "./collision";
import { sweepSegmentVsCircle } from "./math";
import { SimPlayer, SimProjectile } from "./types";

export interface ProjectileStepResult {
  projectile: SimProjectile;
  hitPlayerEid: number | null;
  hitWall: boolean;
  ended: boolean;
  endReason?: "wall" | "hit" | "range";
  endX?: number;
  endY?: number;
}

export function stepProjectileSweep(
  prj: SimProjectile,
  map: MapQuery,
  players: SimPlayer[],
  dt: number = FIXED_DELTA
): ProjectileStepResult {
  if (!prj.alive) {
    return { projectile: prj, hitPlayerEid: null, hitWall: false, ended: true };
  }

  const travelDist = prj.speed * dt;
  const stepDist = Math.min(travelDist, prj.remainingRange);

  if (stepDist <= 1e-6) {
    prj.alive = false;
    return {
      projectile: prj,
      hitPlayerEid: null,
      hitWall: false,
      ended: true,
      endReason: "range",
      endX: prj.x,
      endY: prj.y,
    };
  }

  const startX = prj.x;
  const startY = prj.y;
  const targetX = startX + (prj.vx / prj.speed) * stepDist;
  const targetY = startY + (prj.vy / prj.speed) * stepDist;

  // 1. Raycast against tile map using DDA
  const wallHit = raycastMapDDA(map, startX, startY, targetX, targetY);

  // Maximum allowed fraction t along this step (capped by wall if hit)
  let earliestT = wallHit.hit ? wallHit.t : 1.0;
  let hitWall = wallHit.hit;
  let hitPlayerEid: number | null = null;
  let hitX = wallHit.hit ? wallHit.hitX : targetX;
  let hitY = wallHit.hit ? wallHit.hitY : targetY;

  // 2. Check swept segment vs living players (excluding shooter on early ticks if needed)
  for (const player of players) {
    if (player.isDead) continue;
    // Don't hit owner with their own bullets
    if (player.eid === prj.ownerEid) continue;

    const playerHit = sweepSegmentVsCircle(
      startX,
      startY,
      targetX,
      targetY,
      player.x,
      player.y,
      PLAYER_RADIUS
    );

    if (playerHit.hit && playerHit.t <= earliestT) {
      earliestT = playerHit.t;
      hitPlayerEid = player.eid;
      hitWall = false; // Player was hit before wall
      hitX = playerHit.hitX;
      hitY = playerHit.hitY;
    }
  }

  // Update projectile state
  prj.prevX = startX;
  prj.prevY = startY;
  prj.x = hitX;
  prj.y = hitY;
  prj.remainingRange -= stepDist * earliestT;

  if (hitWall) {
    prj.alive = false;
    return {
      projectile: prj,
      hitPlayerEid: null,
      hitWall: true,
      ended: true,
      endReason: "wall",
      endX: hitX,
      endY: hitY,
    };
  }

  if (hitPlayerEid !== null) {
    prj.alive = false;
    return {
      projectile: prj,
      hitPlayerEid,
      hitWall: false,
      ended: true,
      endReason: "hit",
      endX: hitX,
      endY: hitY,
    };
  }

  if (prj.remainingRange <= 1e-4) {
    prj.alive = false;
    return {
      projectile: prj,
      hitPlayerEid: null,
      hitWall: false,
      ended: true,
      endReason: "range",
      endX: hitX,
      endY: hitY,
    };
  }

  return {
    projectile: prj,
    hitPlayerEid: null,
    hitWall: false,
    ended: false,
  };
}
