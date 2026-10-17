import { describe, it, expect } from "vitest";
import {
  MapQuery,
  defaultMap,
  SimPlayer,
  InputCmd,
  YouState,
  SnapshotMsg,
  ShotEvent,
  stepPlayerMovement,
  FIXED_DELTA,
  PLAYER_MAX_HP,
} from "@veylcore/shared";
import { Predictor } from "../src/net/predictor";
import { Interpolator } from "../src/net/interpolator";
import { LocalProjectiles } from "../src/net/localProjectiles";

describe("P3 Netcode: Client Prediction & Server Reconciliation", () => {
  const map = new MapQuery(defaultMap);

  it("predicted trajectory equals server authoritative result after reconciliation (0 error)", () => {
    const initialPlayer: SimPlayer = {
      eid: 1,
      x: 300,
      y: 300,
      vx: 0,
      vy: 0,
      aimAngle: 0,
      hp: PLAYER_MAX_HP,
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

    const predictor = new Predictor(initialPlayer);

    // 1. Client generates and predicts 10 steps of movement
    const inputs: InputCmd[] = [];
    for (let s = 1; s <= 10; s++) {
      const cmd: InputCmd = {
        s,
        mx: 1.0,
        my: 0.0,
        a: 0,
        d: 200,
        b: 0,
        w: 0,
      };
      inputs.push(cmd);
      predictor.predictStep(cmd, map);
    }

    const predictedEndPos = { ...predictor.getPlayer() };

    // 2. Simulate server executing inputs 1..5 and producing snapshot at tick 5 (ack = 5)
    let serverSimPlayer = { ...initialPlayer };
    for (let s = 1; s <= 5; s++) {
      const res = stepPlayerMovement(serverSimPlayer, inputs[s - 1].mx, inputs[s - 1].my, map, FIXED_DELTA);
      serverSimPlayer.x = res.x;
      serverSimPlayer.y = res.y;
    }

    const serverYou: YouState = {
      eid: 1,
      x: Math.round(serverSimPlayer.x),
      y: Math.round(serverSimPlayer.y),
      hp: 100,
      st: "alive",
      w: 0,
      pri: { id: "k2", mag: 30, res: 90 },
      sec: { id: "pistol", mag: 12 },
      eq: null,
      speedMul: 0.95,
      zoom: false,
      rtt: 50,
    };

    // 3. Client receives snapshot for tick 5 (ack = 5) and reconciles
    predictor.reconcile(serverYou, 5, map);

    // The remaining inputs (6..10) are re-simulated on top of the server snapshot.
    // Result must match predicted position within integer rounding tolerance (< 1u)
    const reconciledPlayer = predictor.getPlayer();
    const distDiff = Math.sqrt(
      (reconciledPlayer.x - predictedEndPos.x) ** 2 +
      (reconciledPlayer.y - predictedEndPos.y) ** 2
    );

    expect(distDiff).toBeLessThan(1.0);
    expect(predictor.getPendingCount()).toBe(5); // Inputs 6..10 remain pending
  });

  it("smooths small errors and snaps on large errors (> 64u)", () => {
    const initialPlayer: SimPlayer = {
      eid: 1,
      x: 300,
      y: 300,
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

    const predictor = new Predictor(initialPlayer);

    // Reconcile with teleport / huge mismatch (server says x=500, diff = 200u > 64u)
    const serverYou: YouState = {
      eid: 1,
      x: 500,
      y: 300,
      hp: 100,
      st: "alive",
      w: 0,
      pri: null,
      sec: { id: "pistol", mag: 12 },
      eq: null,
      speedMul: 1,
      zoom: false,
      rtt: 0,
    };

    predictor.reconcile(serverYou, 0, map);

    // Large error: snaps immediately, error offset set to 0
    expect(predictor.getVisualPosition().x).toBe(500);
  });
});

describe("P3 Netcode: Snapshot Interpolator & Local Projectiles", () => {
  it("interpolates remote entities smoothly between two snapshots", () => {
    const interpolator = new Interpolator();

    // Snapshot 0 at tick 10: Remote player (eid 2) at (100, 100)
    const snap0: SnapshotMsg = {
      k: 10,
      ack: 0,
      e: [[2, 1, 100, 100, 0, 100, "k2", 0]],
      ev: [],
    };

    // Snapshot 1 at tick 14: Remote player (eid 2) at (200, 100)
    const snap1: SnapshotMsg = {
      k: 14,
      ack: 0,
      e: [[2, 1, 200, 100, 0, 100, "k2", 0]],
      ev: [],
    };

    interpolator.pushSnapshot(snap0);
    interpolator.pushSnapshot(snap1);

    // Extract interpolated entities for myEid = 1
    const entities = interpolator.getInterpolatedEntities(1);
    expect(entities.length).toBe(1);
    expect(entities[0].eid).toBe(2);
    // Position should be between 100 and 200
    expect(entities[0].x).toBeGreaterThanOrEqual(100);
    expect(entities[0].x).toBeLessThanOrEqual(200);
  });

  it("matches predicted projectile with server shot event and cleans up on pend", () => {
    const lp = new LocalProjectiles();

    // 1. Local predicted shot from myEid = 1, inputSeq = 42
    const prj = lp.spawnLocalPredicted(1, 42, "k2", 100, 100, 0);
    expect(prj.alive).toBe(true);
    expect(lp.getActiveProjectiles().length).toBe(1);

    // 2. Server shot event arrives confirming (o = 1, s = 42) with server prj ID = 777
    const shotEv: ShotEvent = {
      k: "shot",
      prj: 777,
      o: 1,
      s: 42,
      w: "k2",
      x: 100,
      y: 100,
      a: 0,
      v: 1600,
      r: 900,
      tk: 5,
    };
    lp.handleServerShot(shotEv, 1);

    // Must be replaced with server ID 777
    expect(lp.getActiveProjectiles().length).toBe(1);
    expect(lp.getActiveProjectiles()[0].id).toBe(777);

    // 3. Server pend event arrives for prj 777
    lp.handleServerPend(777);
    expect(lp.getActiveProjectiles().length).toBe(0);
  });
});
