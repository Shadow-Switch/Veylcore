import { describe, it, expect } from "vitest";
import {
  normalizeMoveInput,
  moveCircleWithSliding,
  raycastMapDDA,
  sweepSegmentVsCircle,
  MapQuery,
  defaultMap,
  stepPlayerMovement,
  stepProjectileSweep,
  SimPlayer,
  SimProjectile,
  PLAYER_RADIUS,
  MAP_WIDTH,
  MAP_HEIGHT,
  TILE_SIZE,
} from "../src";

describe("Simulation & Collision Physics (P1 Requirements)", () => {
  const mapQuery = new MapQuery(defaultMap);

  it("diagonal input normalization limits vector length to <= 1.0", () => {
    // WASD diagonal (W+D: mx=1, my=-1)
    const normalized = normalizeMoveInput(1, -1);
    const length = Math.sqrt(normalized.x ** 2 + normalized.y ** 2);
    expect(length).toBeCloseTo(1.0, 5);
    expect(normalized.x).toBeCloseTo(Math.SQRT1_2, 5);
    expect(normalized.y).toBeCloseTo(-Math.SQRT1_2, 5);

    // Sub-maximal inputs (analog/partial) are preserved
    const halfInput = normalizeMoveInput(0.4, 0.3);
    const halfLength = Math.sqrt(halfInput.x ** 2 + halfInput.y ** 2);
    expect(halfLength).toBeCloseTo(0.5, 5);
    expect(halfInput.x).toBe(0.4);
    expect(halfInput.y).toBe(0.3);
  });

  it("circle movement stays strictly within map boundaries", () => {
    // Attempt to move past left/top boundary
    const resLeft = moveCircleWithSliding(
      mapQuery,
      PLAYER_RADIUS + 5,
      PLAYER_RADIUS + 5,
      PLAYER_RADIUS,
      -50,
      -50
    );
    expect(resLeft.x).toBeGreaterThanOrEqual(PLAYER_RADIUS);
    expect(resLeft.y).toBeGreaterThanOrEqual(PLAYER_RADIUS);

    // Attempt to move past right/bottom boundary
    const resRight = moveCircleWithSliding(
      mapQuery,
      MAP_WIDTH - PLAYER_RADIUS - 5,
      MAP_HEIGHT - PLAYER_RADIUS - 5,
      PLAYER_RADIUS,
      50,
      50
    );
    expect(resRight.x).toBeLessThanOrEqual(MAP_WIDTH - PLAYER_RADIUS);
    expect(resRight.y).toBeLessThanOrEqual(MAP_HEIGHT - PLAYER_RADIUS);
  });

  it("slides along walls when moving diagonally into a wall", () => {
    // Outer boundary top wall is at y < 32 (tile 0)
    // Place player at (100, 32 + 14) so they touch the top wall
    const startX = 100;
    const startY = TILE_SIZE + PLAYER_RADIUS;

    // Move diagonally up and right (dx = 10, dy = -10 into top wall)
    const res = moveCircleWithSliding(
      mapQuery,
      startX,
      startY,
      PLAYER_RADIUS,
      10,
      -10
    );

    // X axis should slide forward (+10), Y axis should be blocked by wall
    expect(res.x).toBeCloseTo(startX + 10, 1);
    expect(res.y).toBeGreaterThanOrEqual(TILE_SIZE + PLAYER_RADIUS);
    expect(res.collidedY).toBe(true);
  });

  it("high speed projectile (AWP 4000u/s) does not tunnel through a 1-tile wall", () => {
    // Center pillar has wall at tx=30..33, ty=18..21 (x: 960..1088, y: 576..672)
    // Shoot from left of center pillar directly into it from open space (tx=27, x=880)
    const startX = 880;
    const startY = 600;
    const targetX = 1100; // Aim into center pillar (tx=30..33, x=960..)
    const targetY = 600;

    // Raycast check via DDA
    const ddaHit = raycastMapDDA(mapQuery, startX, startY, targetX, targetY);
    expect(ddaHit.hit).toBe(true);
    // Wall starts at x = 30 * 32 = 960
    expect(ddaHit.hitX).toBeCloseTo(960, 1);
    expect(ddaHit.hitY).toBeCloseTo(600, 1);
    expect(ddaHit.normalX).toBe(-1); // Hit from the left

    // Test with stepProjectileSweep at AWP speed (4000 u/s) over dt = 1/30s (travel 133.33u per tick)
    const prj: SimProjectile = {
      id: 1,
      ownerEid: 10,
      inputSeq: 1,
      weaponId: "awp",
      x: 900,
      y: 600,
      prevX: 900,
      prevY: 600,
      vx: 4000,
      vy: 0,
      speed: 4000,
      remainingRange: 1800,
      damage: 115,
      alive: true,
      spawnTick: 0,
    };

    // In 1 tick, bullet attempts to move from 900 to 1033.33 (which would be inside or past 960)
    const stepResult = stepProjectileSweep(prj, mapQuery, [], 1 / 30);
    expect(stepResult.hitWall).toBe(true);
    expect(stepResult.ended).toBe(true);
    expect(stepResult.endReason).toBe("wall");
    expect(stepResult.projectile.x).toBeCloseTo(960, 1);
    expect(stepResult.projectile.alive).toBe(false);
  });

  it("high speed projectile does not tunnel through a player", () => {
    // Shooter at (100, 100), Target at (300, 100) (empty area)
    const targetPlayer: SimPlayer = {
      eid: 2,
      x: 300,
      y: 100,
      vx: 0,
      vy: 0,
      aimAngle: 0,
      hp: 100,
      isDead: false,
      activeSlot: 0,
      primaryWeapon: "k2",
      primaryMag: 30,
      primaryReserve: 90,
      secondaryMag: 12,
      reloadTimerSec: 0,
      fireCooldownSec: 0,
      continuousFireShots: 0,
    };

    // Bullet moving at 4000 u/s directly through target (travels 133u per tick)
    // Starting at 250, next pos would be 383, which would jump completely over target radius 14 (286..314)
    const prj: SimProjectile = {
      id: 2,
      ownerEid: 1,
      inputSeq: 1,
      weaponId: "awp",
      x: 250,
      y: 100,
      prevX: 250,
      prevY: 100,
      vx: 4000,
      vy: 0,
      speed: 4000,
      remainingRange: 1800,
      damage: 115,
      alive: true,
      spawnTick: 0,
    };

    const stepResult = stepProjectileSweep(
      prj,
      mapQuery,
      [targetPlayer],
      1 / 30
    );
    expect(stepResult.hitPlayerEid).toBe(2);
    expect(stepResult.ended).toBe(true);
    expect(stepResult.endReason).toBe("hit");
    // Hit position should be front edge of player (300 - 14 = 286)
    expect(stepResult.projectile.x).toBeCloseTo(300 - PLAYER_RADIUS, 1);
    expect(stepResult.projectile.alive).toBe(false);
  });
});
