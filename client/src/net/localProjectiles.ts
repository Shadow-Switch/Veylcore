import { SimProjectile, ShotEvent, WeaponId, getWeaponDef } from "@veylcore/shared";

interface LocalPredictedProjectile extends SimProjectile {
  isPredicted: boolean;
  spawnTimeMs: number;
}

export class LocalProjectiles {
  private projectiles: LocalPredictedProjectile[] = [];
  private nextLocalId = 100000;

  /**
   * Spawns an immediate predicted projectile for the local player on click.
   */
  public spawnLocalPredicted(
    ownerEid: number,
    inputSeq: number,
    weaponId: WeaponId,
    startX: number,
    startY: number,
    aimAngle: number
  ): SimProjectile {
    const def = getWeaponDef(weaponId);
    const id = this.nextLocalId++;

    const vx = Math.cos(aimAngle) * def.projectileSpeed;
    const vy = Math.sin(aimAngle) * def.projectileSpeed;

    const prj: LocalPredictedProjectile = {
      id,
      ownerEid,
      inputSeq,
      weaponId,
      x: startX,
      y: startY,
      prevX: startX,
      prevY: startY,
      vx,
      vy,
      speed: def.projectileSpeed,
      remainingRange: def.range,
      damage: def.damage,
      alive: true,
      spawnTick: 0,
      isPredicted: true,
      spawnTimeMs: performance.now(),
    };

    this.projectiles.push(prj);
    return prj;
  }

  /**
   * Handles server 'shot' event:
   * - If (o, s) matches a local predicted projectile, confirms and replaces it with server ID.
   * - Otherwise, spawns a new visual projectile for another player.
   */
  public handleServerShot(ev: ShotEvent, myEid: number): void {
    if (ev.o === myEid) {
      // Find matching predicted projectile by owner and input sequence
      const matched = this.projectiles.find(
        (p) => p.isPredicted && p.inputSeq === ev.s
      );
      if (matched) {
        matched.isPredicted = false;
        matched.id = ev.prj; // Replace with server projectile ID
        matched.remainingRange = ev.r;
        return;
      }
    }

    // Remote projectile from another player
    const prj: LocalPredictedProjectile = {
      id: ev.prj,
      ownerEid: ev.o,
      inputSeq: ev.s,
      weaponId: ev.w,
      x: ev.x,
      y: ev.y,
      prevX: ev.x,
      prevY: ev.y,
      vx: Math.cos(ev.a) * ev.v,
      vy: Math.sin(ev.a) * ev.v,
      speed: ev.v,
      remainingRange: ev.r,
      damage: 20,
      alive: true,
      spawnTick: ev.tk,
      isPredicted: false,
      spawnTimeMs: performance.now(),
    };

    this.projectiles.push(prj);
  }

  /**
   * Handles server 'pend' event (projectile destroyed on wall, hit, or range)
   */
  public handleServerPend(prjId: number): void {
    const idx = this.projectiles.findIndex((p) => p.id === prjId);
    if (idx !== -1) {
      this.projectiles.splice(idx, 1);
    }
  }

  /**
   * Handles server 'deny' event: removes predicted projectile immediately
   */
  public handleServerDeny(inputSeq: number): void {
    const idx = this.projectiles.findIndex(
      (p) => p.isPredicted && p.inputSeq === inputSeq
    );
    if (idx !== -1) {
      this.projectiles.splice(idx, 1);
    }
  }

  /**
   * Updates flight position of all active projectiles and cleans up expired ones (300ms unconfirmed predicted).
   */
  public step(dt: number): void {
    const now = performance.now();

    for (let i = this.projectiles.length - 1; i >= 0; i--) {
      const prj = this.projectiles[i];

      // Remove unconfirmed predicted bullets older than 300ms (rejected by server)
      if (prj.isPredicted && now - prj.spawnTimeMs > 300) {
        this.projectiles.splice(i, 1);
        continue;
      }

      const travel = prj.speed * dt;
      prj.prevX = prj.x;
      prj.prevY = prj.y;
      prj.x += (prj.vx / prj.speed) * travel;
      prj.y += (prj.vy / prj.speed) * travel;
      prj.remainingRange -= travel;

      if (prj.remainingRange <= 0) {
        this.projectiles.splice(i, 1);
      }
    }
  }

  public getActiveProjectiles(): SimProjectile[] {
    return this.projectiles;
  }

  public clear(): void {
    this.projectiles = [];
  }
}
