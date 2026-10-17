import { MapQuery } from "../map/mapLoader";
import { clamp } from "./math";
import { SweepHit, AABB } from "./types";

/**
 * Resolves collision between a circle at (cx, cy) with radius r and an AABB box.
 * Returns the resolved position (newCx, newCy) and whether collision occurred.
 */
export function resolveCircleVsAABB(
  cx: number,
  cy: number,
  radius: number,
  box: AABB
): { x: number; y: number; collided: boolean } {
  // Find closest point on AABB to circle center
  const closestX = clamp(cx, box.minX, box.maxX);
  const closestY = clamp(cy, box.minY, box.maxY);

  const dx = cx - closestX;
  const dy = cy - closestY;
  const distSq = dx * dx + dy * dy;

  if (distSq < radius * radius && distSq > 1e-9) {
    const dist = Math.sqrt(distSq);
    const penetration = radius - dist;
    const nx = dx / dist;
    const ny = dy / dist;
    return {
      x: cx + nx * penetration,
      y: cy + ny * penetration,
      collided: true,
    };
  } else if (distSq <= 1e-9) {
    // Circle center is inside or on the boundary of the box - push out along closest edge
    const distLeft = cx - box.minX;
    const distRight = box.maxX - cx;
    const distTop = cy - box.minY;
    const distBottom = box.maxY - cy;

    const minDist = Math.min(distLeft, distRight, distTop, distBottom);
    if (minDist === distLeft) {
      return { x: box.minX - radius, y: cy, collided: true };
    } else if (minDist === distRight) {
      return { x: box.maxX + radius, y: cy, collided: true };
    } else if (minDist === distTop) {
      return { x: cx, y: box.minY - radius, collided: true };
    } else {
      return { x: cx, y: box.maxY + radius, collided: true };
    }
  }

  return { x: cx, y: cy, collided: false };
}

/**
 * Moves a circle entity with axis-separated sliding collision against map tiles.
 * Tests X movement first, resolves collisions, then tests Y movement and resolves.
 * Ensures smooth sliding along walls and around corners.
 */
export function moveCircleWithSliding(
  map: MapQuery,
  startX: number,
  startY: number,
  radius: number,
  deltaX: number,
  deltaY: number
): { x: number; y: number; collidedX: boolean; collidedY: boolean } {
  const worldW = map.worldWidth();
  const worldH = map.worldHeight();

  let curX = startX;
  let curY = startY;
  let collidedX = false;
  let collidedY = false;

  // 1. Move X first
  curX += deltaX;
  // Clamp to map boundary
  if (curX - radius < 0) {
    curX = radius;
    collidedX = true;
  } else if (curX + radius > worldW) {
    curX = worldW - radius;
    collidedX = true;
  }

  // Check tile collisions for X
  let boxes = map.getOverlappingWallBoxes(
    curX - radius,
    curY - radius,
    curX + radius,
    curY + radius
  );

  for (const box of boxes) {
    const res = resolveCircleVsAABB(curX, curY, radius, box);
    if (res.collided) {
      curX = res.x;
      collidedX = true;
    }
  }

  // 2. Move Y second
  curY += deltaY;
  // Clamp to map boundary
  if (curY - radius < 0) {
    curY = radius;
    collidedY = true;
  } else if (curY + radius > worldH) {
    curY = worldH - radius;
    collidedY = true;
  }

  // Check tile collisions for Y
  boxes = map.getOverlappingWallBoxes(
    curX - radius,
    curY - radius,
    curX + radius,
    curY + radius
  );

  for (const box of boxes) {
    const res = resolveCircleVsAABB(curX, curY, radius, box);
    if (res.collided) {
      curY = res.y;
      collidedY = true;
    }
  }

  return { x: curX, y: curY, collidedX, collidedY };
}

/**
 * DDA (Digital Differential Analyzer) raycast through tile map.
 * Traces a line segment from (x1, y1) to (x2, y2).
 * Returns hit result with exact intersection point and surface normal.
 * Guaranteed no tunneling through any wall tiles.
 */
export function raycastMapDDA(
  map: MapQuery,
  x1: number,
  y1: number,
  x2: number,
  y2: number
): SweepHit {
  const tileSize = map.getMapData().tileSize;
  const dx = x2 - x1;
  const dy = y2 - y1;
  const totalDist = Math.sqrt(dx * dx + dy * dy);

  if (totalDist < 1e-8) {
    const tx = Math.floor(x1 / tileSize);
    const ty = Math.floor(y1 / tileSize);
    if (map.isWall(tx, ty)) {
      return { hit: true, t: 0, hitX: x1, hitY: y1, normalX: 0, normalY: 0 };
    }
    return { hit: false, t: 1, hitX: x2, hitY: y2, normalX: 0, normalY: 0 };
  }

  let tx = Math.floor(x1 / tileSize);
  let ty = Math.floor(y1 / tileSize);

  const endTx = Math.floor(x2 / tileSize);
  const endTy = Math.floor(y2 / tileSize);

  // If already starting inside a solid tile
  if (map.isWall(tx, ty)) {
    return { hit: true, t: 0, hitX: x1, hitY: y1, normalX: 0, normalY: 0 };
  }

  const stepX = dx > 0 ? 1 : dx < 0 ? -1 : 0;
  const stepY = dy > 0 ? 1 : dy < 0 ? -1 : 0;

  // Distance along ray to cross one tile along X or Y
  const deltaDistX = Math.abs(dx) > 1e-8 ? Math.abs(tileSize / dx) : Infinity;
  const deltaDistY = Math.abs(dy) > 1e-8 ? Math.abs(tileSize / dy) : Infinity;

  // Initial distance to first grid boundary (in units of ray fraction t)
  let sideDistX: number;
  let sideDistY: number;

  if (stepX > 0) {
    sideDistX = ((tx + 1) * tileSize - x1) / dx;
  } else if (stepX < 0) {
    sideDistX = (tx * tileSize - x1) / dx;
  } else {
    sideDistX = Infinity;
  }

  if (stepY > 0) {
    sideDistY = ((ty + 1) * tileSize - y1) / dy;
  } else if (stepY < 0) {
    sideDistY = (ty * tileSize - y1) / dy;
  } else {
    sideDistY = Infinity;
  }

  let normalX = 0;
  let normalY = 0;
  let t = 0;

  // Maximum grid steps across the map
  const maxSteps = Math.abs(endTx - tx) + Math.abs(endTy - ty) + 2;

  for (let step = 0; step < maxSteps; step++) {
    if (sideDistX < sideDistY) {
      t = sideDistX;
      sideDistX += deltaDistX;
      tx += stepX;
      normalX = -stepX;
      normalY = 0;
    } else {
      t = sideDistY;
      sideDistY += deltaDistY;
      ty += stepY;
      normalX = 0;
      normalY = -stepY;
    }

    if (t > 1.0) {
      break;
    }

    if (map.isWall(tx, ty)) {
      const hitX = x1 + t * dx;
      const hitY = y1 + t * dy;
      return {
        hit: true,
        t,
        hitX,
        hitY,
        normalX,
        normalY,
      };
    }

    if (tx === endTx && ty === endTy) {
      break;
    }
  }

  return { hit: false, t: 1, hitX: x2, hitY: y2, normalX: 0, normalY: 0 };
}
