import {
  SnapshotMsg,
  SimPlayer,
  PlayerFlags,
  PlayerEntityTuple,
  WeaponId,
  PLAYER_MAX_HP,
} from "@veylcore/shared";

interface SnapshotEntry {
  snap: SnapshotMsg;
  receivedTime: number;
}

export class Interpolator {
  private buffer: SnapshotEntry[] = [];
  private maxBufferSize = 20;

  // Adaptive interpolation delay: defaults to 4 ticks (~133ms)
  private interpDelayTicks = 4;
  private lastSnapIntervals: number[] = [];
  private lastSnapTime = 0;

  // Estimated server tick
  private estimatedServerTick = 0;

  public pushSnapshot(snap: SnapshotMsg): void {
    const now = performance.now();
    if (this.lastSnapTime > 0) {
      const interval = now - this.lastSnapTime;
      this.lastSnapIntervals.push(interval);
      if (this.lastSnapIntervals.length > 10) {
        this.lastSnapIntervals.shift();
      }
      this.adaptInterpDelay();
    }
    this.lastSnapTime = now;

    this.estimatedServerTick = snap.k;
    this.buffer.push({ snap, receivedTime: now });

    if (this.buffer.length > this.maxBufferSize) {
      this.buffer.shift();
    }
  }

  /**
   * Adapts interpolation delay between 3 and 8 ticks based on snapshot jitter
   */
  private adaptInterpDelay(): void {
    if (this.lastSnapIntervals.length < 3) return;

    // Expected interval for 15Hz snapshots is ~66.6ms
    const avg =
      this.lastSnapIntervals.reduce((a, b) => a + b, 0) /
      this.lastSnapIntervals.length;
    const variance =
      this.lastSnapIntervals.reduce((a, b) => a + Math.pow(b - avg, 2), 0) /
      this.lastSnapIntervals.length;
    const stdDev = Math.sqrt(variance);

    // If jitter is high, increase delay up to 8 ticks; if stable, drop to 3-4 ticks
    if (stdDev > 25) {
      this.interpDelayTicks = Math.min(8, this.interpDelayTicks + 0.1);
    } else if (stdDev < 10) {
      this.interpDelayTicks = Math.max(3, this.interpDelayTicks - 0.05);
    }
  }

  public getInterpDelayTicks(): number {
    return Math.round(this.interpDelayTicks);
  }

  public getInterpDelayMs(): number {
    return Math.round(this.interpDelayTicks * (1000 / 30));
  }

  /**
   * Samples other players at render time (estimatedServerTick - interpDelayTicks)
   */
  public getInterpolatedEntities(myEid: number): SimPlayer[] {
    if (this.buffer.length === 0) return [];

    const targetTick = this.estimatedServerTick - this.interpDelayTicks;

    // If we only have 1 snapshot, return its entities directly
    if (this.buffer.length === 1) {
      return this.extractPlayers(this.buffer[0].snap, myEid);
    }

    // Find two snapshots surrounding targetTick
    let s0: SnapshotMsg | null = null;
    let s1: SnapshotMsg | null = null;

    for (let i = 0; i < this.buffer.length - 1; i++) {
      if (
        this.buffer[i].snap.k <= targetTick &&
        this.buffer[i + 1].snap.k >= targetTick
      ) {
        s0 = this.buffer[i].snap;
        s1 = this.buffer[i + 1].snap;
        break;
      }
    }

    // If targetTick is newer than all snapshots, extrapolate from the last two up to 250ms (7.5 ticks)
    if (!s0 || !s1) {
      const lastIdx = this.buffer.length - 1;
      const lastSnap = this.buffer[lastIdx].snap;
      const prevSnap = this.buffer[lastIdx - 1]?.snap;

      if (!prevSnap || targetTick - lastSnap.k > 8) {
        return this.extractPlayers(lastSnap, myEid);
      }
      s0 = prevSnap;
      s1 = lastSnap;
    }

    const tickDelta = s1.k - s0.k;
    const t = tickDelta > 0 ? (targetTick - s0.k) / tickDelta : 0;
    const clampedT = Math.max(0, Math.min(1.2, t)); // Max 20% extrapolation

    return this.interpolateBetween(s0, s1, clampedT, myEid);
  }

  private extractPlayers(snap: SnapshotMsg, myEid: number): SimPlayer[] {
    const list: SimPlayer[] = [];
    for (const ent of snap.e) {
      if (ent[1] === 1 && ent[0] !== myEid) {
        const [eid, , x, y, aim, hp, weaponId, flags] = ent;
        list.push({
          eid,
          x,
          y,
          vx: 0,
          vy: 0,
          aimAngle: aim,
          hp,
          isDead: (flags & PlayerFlags.DEAD) !== 0 || hp <= 0,
          activeSlot: 0,
          primaryWeapon: (weaponId as WeaponId) || "k2",
          primaryMag: 30,
          primaryReserve: 90,
          secondaryMag: 12,
          reloadTimerSec: 0,
          fireCooldownSec: 0,
          continuousFireShots: 0,
        });
      }
    }
    return list;
  }

  private interpolateBetween(
    s0: SnapshotMsg,
    s1: SnapshotMsg,
    t: number,
    myEid: number
  ): SimPlayer[] {
    const e0Map = new Map<number, PlayerEntityTuple>();
    for (const e of s0.e) {
      if (e[1] === 1) e0Map.set(e[0], e as PlayerEntityTuple);
    }

    const results: SimPlayer[] = [];

    for (const rawE1 of s1.e) {
      if (rawE1[1] !== 1 || rawE1[0] === myEid) continue;
      const e1 = rawE1 as PlayerEntityTuple;

      const eid = e1[0];
      const e0 = e0Map.get(eid);

      if (!e0) {
        // Newly appeared player: take e1 directly
        results.push({
          eid,
          x: e1[2],
          y: e1[3],
          vx: 0,
          vy: 0,
          aimAngle: e1[4],
          hp: e1[5],
          isDead: (e1[7] & PlayerFlags.DEAD) !== 0,
          activeSlot: 0,
          primaryWeapon: (e1[6] as WeaponId) || "k2",
          primaryMag: 30,
          primaryReserve: 90,
          secondaryMag: 12,
          reloadTimerSec: 0,
          fireCooldownSec: 0,
          continuousFireShots: 0,
        });
        continue;
      }

      // Linear position interpolation
      const x = e0[2] + (e1[2] - e0[2]) * t;
      const y = e0[3] + (e1[3] - e0[3]) * t;

      // Shortest arc angle interpolation
      let diff = e1[4] - e0[4];
      while (diff < -Math.PI) diff += Math.PI * 2;
      while (diff > Math.PI) diff -= Math.PI * 2;
      const aim = e0[4] + diff * t;

      results.push({
        eid,
        x,
        y,
        vx: 0,
        vy: 0,
        aimAngle: aim,
        hp: e1[5],
        isDead: (e1[7] & PlayerFlags.DEAD) !== 0,
        activeSlot: 0,
        primaryWeapon: (e1[6] as WeaponId) || "k2",
        primaryMag: 30,
        primaryReserve: 90,
        secondaryMag: 12,
        reloadTimerSec: 0,
        fireCooldownSec: 0,
        continuousFireShots: 0,
      });
    }

    return results;
  }
}
