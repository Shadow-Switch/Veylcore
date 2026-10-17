import { Vec2, AABB, SweepHit } from "./types";

export function clamp(val: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, val));
}

/**
 * Normalizes a 2D vector. If clampLength is true, preserves length <= 1 and only caps > 1.
 */
export function normalizeMoveInput(mx: number, my: number): { x: number; y: number } {
  const lenSq = mx * mx + my * my;
  if (lenSq === 0) {
    return { x: 0, y: 0 };
  }
  const len = Math.sqrt(lenSq);
  if (len > 1.0) {
    return { x: mx / len, y: my / len };
  }
  return { x: mx, y: my };
}

export function distance(x1: number, y1: number, x2: number, y2: number): number {
  const dx = x2 - x1;
  const dy = y2 - y1;
  return Math.sqrt(dx * dx + dy * dy);
}

/**
 * Swept ray / line segment vs Circle intersection.
 * Checks if segment from (x1, y1) to (x2, y2) intersects circle at (cx, cy) with radius r.
 * Returns the earliest intersection (0 <= t <= 1) if any.
 */
export function sweepSegmentVsCircle(
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  cx: number,
  cy: number,
  radius: number
): SweepHit {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const fx = x1 - cx;
  const fy = y1 - cy;

  const a = dx * dx + dy * dy;
  const b = 2 * (fx * dx + fy * dy);
  const c = fx * fx + fy * fy - radius * radius;

  // Starting inside the circle
  if (c <= 0) {
    return {
      hit: true,
      t: 0,
      hitX: x1,
      hitY: y1,
      normalX: fx === 0 && fy === 0 ? 0 : -fx / Math.sqrt(fx * fx + fy * fy),
      normalY: fx === 0 && fy === 0 ? 0 : -fy / Math.sqrt(fx * fx + fy * fy),
    };
  }

  // Segment is a point and not inside
  if (a < 1e-8) {
    return { hit: false, t: 1, hitX: x2, hitY: y2, normalX: 0, normalY: 0 };
  }

  const discriminant = b * b - 4 * a * c;
  if (discriminant < 0) {
    return { hit: false, t: 1, hitX: x2, hitY: y2, normalX: 0, normalY: 0 };
  }

  const sqrtDisc = Math.sqrt(discriminant);
  const t0 = (-b - sqrtDisc) / (2 * a);

  if (t0 >= 0 && t0 <= 1) {
    const hitX = x1 + t0 * dx;
    const hitY = y1 + t0 * dy;
    const nx = (hitX - cx) / radius;
    const ny = (hitY - cy) / radius;
    return {
      hit: true,
      t: t0,
      hitX,
      hitY,
      normalX: nx,
      normalY: ny,
    };
  }

  return { hit: false, t: 1, hitX: x2, hitY: y2, normalX: 0, normalY: 0 };
}

/**
 * Swept ray / line segment vs AABB intersection.
 * Liang-Barsky / Slab algorithm.
 */
export function sweepSegmentVsAABB(
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  box: AABB
): SweepHit {
  const dx = x2 - x1;
  const dy = y2 - y1;

  let tMin = 0.0;
  let tMax = 1.0;
  let normalX = 0;
  let normalY = 0;

  // X slab
  if (Math.abs(dx) < 1e-8) {
    if (x1 < box.minX || x1 > box.maxX) {
      return { hit: false, t: 1, hitX: x2, hitY: y2, normalX: 0, normalY: 0 };
    }
  } else {
    const invD = 1.0 / dx;
    let t1 = (box.minX - x1) * invD;
    let t2 = (box.maxX - x1) * invD;
    let nSign = -1;

    if (t1 > t2) {
      const tmp = t1;
      t1 = t2;
      t2 = tmp;
      nSign = 1;
    }

    if (t1 > tMin) {
      tMin = t1;
      normalX = nSign;
      normalY = 0;
    }
    tMax = Math.min(tMax, t2);

    if (tMin > tMax) {
      return { hit: false, t: 1, hitX: x2, hitY: y2, normalX: 0, normalY: 0 };
    }
  }

  // Y slab
  if (Math.abs(dy) < 1e-8) {
    if (y1 < box.minY || y1 > box.maxY) {
      return { hit: false, t: 1, hitX: x2, hitY: y2, normalX: 0, normalY: 0 };
    }
  } else {
    const invD = 1.0 / dy;
    let t1 = (box.minY - y1) * invD;
    let t2 = (box.maxY - y1) * invD;
    let nSign = -1;

    if (t1 > t2) {
      const tmp = t1;
      t1 = t2;
      t2 = tmp;
      nSign = 1;
    }

    if (t1 > tMin) {
      tMin = t1;
      normalX = 0;
      normalY = nSign;
    }
    tMax = Math.min(tMax, t2);

    if (tMin > tMax) {
      return { hit: false, t: 1, hitX: x2, hitY: y2, normalX: 0, normalY: 0 };
    }
  }

  if (tMin >= 0 && tMin <= 1) {
    return {
      hit: true,
      t: tMin,
      hitX: x1 + tMin * dx,
      hitY: y1 + tMin * dy,
      normalX,
      normalY,
    };
  }

  return { hit: false, t: 1, hitX: x2, hitY: y2, normalX: 0, normalY: 0 };
}
