import {
  MapQuery,
  defaultMap,
  SimPlayer,
  SimProjectile,
  InputCmd,
  ButtonBits,
  stepPlayerMovement,
  stepProjectileSweep,
  getWeaponDef,
  FIXED_DELTA,
  PLAYER_MAX_HP,
  WeaponId,
} from "@veylcore/shared";

export interface HitEffectCallback {
  (type: "spark" | "hit" | "flash", x: number, y: number, angle?: number): void;
}

export class LocalGameServer {
  private map: MapQuery;
  private localPlayer: SimPlayer;
  private targetDummies: SimPlayer[] = [];
  private projectiles: SimProjectile[] = [];
  private nextPrjId = 1;
  private tick = 0;
  private onEffect?: HitEffectCallback;

  constructor(mapQuery: MapQuery = new MapQuery(defaultMap)) {
    this.map = mapQuery;

    // Spawn local player at first spawn point
    const spawn0 = defaultMap.spawnPoints[0] || { x: 200, y: 200 };
    this.localPlayer = {
      eid: 1,
      x: spawn0.x,
      y: spawn0.y,
      vx: 0,
      vy: 0,
      aimAngle: 0,
      hp: PLAYER_MAX_HP,
      isDead: false,
      activeSlot: 0, // K2 primary
      primaryWeapon: "k2",
      primaryMag: 30,
      primaryReserve: 90,
      secondaryMag: 12,
      reloadTimerSec: 0,
      fireCooldownSec: 0,
      continuousFireShots: 0,
    };

    // Spawn 3 target dummies at tactical arena locations for shooting practice
    const dummySpawns = [
      defaultMap.spawnPoints[4] || { x: 640, y: 320 },
      defaultMap.spawnPoints[10] || { x: 1024, y: 384 },
      defaultMap.spawnPoints[8] || { x: 384, y: 640 },
    ];

    for (let i = 0; i < dummySpawns.length; i++) {
      this.targetDummies.push({
        eid: 100 + i,
        x: dummySpawns[i].x,
        y: dummySpawns[i].y,
        vx: 0,
        vy: 0,
        aimAngle: Math.PI / 2,
        hp: PLAYER_MAX_HP,
        isDead: false,
        activeSlot: 0,
        primaryWeapon: "pistol",
        primaryMag: 12,
        primaryReserve: Infinity,
        secondaryMag: 12,
        reloadTimerSec: 0,
        fireCooldownSec: 0,
        continuousFireShots: 0,
      });
    }
  }

  public setEffectCallback(cb: HitEffectCallback): void {
    this.onEffect = cb;
  }

  public getLocalPlayer(): SimPlayer {
    return this.localPlayer;
  }

  public getTargetDummies(): SimPlayer[] {
    return this.targetDummies;
  }

  public getProjectiles(): SimProjectile[] {
    return this.projectiles;
  }

  /**
   * Runs 1 server fixed tick (30Hz, dt = 1/30s)
   */
  public step(cmd: InputCmd, dt: number = FIXED_DELTA): void {
    this.tick++;
    const player = this.localPlayer;

    // 1. Slot selection
    if (cmd.w === 0 || cmd.w === 1) {
      if (player.activeSlot !== cmd.w) {
        player.activeSlot = cmd.w;
        player.continuousFireShots = 0;
        player.reloadTimerSec = 0; // Cancel reload on weapon switch
        player.fireCooldownSec = 0.15; // Small switch delay
      }
    }

    // 2. Timers decrement
    if (player.fireCooldownSec > 0) {
      player.fireCooldownSec = Math.max(0, player.fireCooldownSec - dt);
    }
    if (player.reloadTimerSec > 0) {
      player.reloadTimerSec = Math.max(0, player.reloadTimerSec - dt);
      if (player.reloadTimerSec === 0) {
        this.finishReload(player);
      }
    }

    // 3. Movement
    player.aimAngle = cmd.a;
    const moveRes = stepPlayerMovement(player, cmd.mx, cmd.my, this.map, dt);
    player.x = moveRes.x;
    player.y = moveRes.y;
    player.vx = moveRes.vx;
    player.vy = moveRes.vy;

    // 4. Weapons & Reloading
    const activeWeaponId: WeaponId =
      player.activeSlot === 0 ? player.primaryWeapon : "pistol";
    const weaponDef = getWeaponDef(activeWeaponId);

    // Manual reload (R key)
    if ((cmd.b & ButtonBits.RELOAD) !== 0 && player.reloadTimerSec <= 0) {
      this.startReload(player, weaponDef);
    }

    // Firing (Left click)
    const isFireHeld = (cmd.b & ButtonBits.FIRE) !== 0;
    if (isFireHeld && player.reloadTimerSec <= 0 && player.fireCooldownSec <= 0) {
      const currentMag =
        player.activeSlot === 0 ? player.primaryMag : player.secondaryMag;

      if (currentMag > 0) {
        this.fireWeapon(player, weaponDef, cmd.a);
      } else {
        // Auto reload on trigger pull with empty mag
        this.startReload(player, weaponDef);
      }
    }

    if (!isFireHeld) {
      player.continuousFireShots = 0;
    }

    // 5. Update Projectiles
    const allLivingPlayers = [player, ...this.targetDummies];
    for (let i = this.projectiles.length - 1; i >= 0; i--) {
      const prj = this.projectiles[i];
      const stepRes = stepProjectileSweep(prj, this.map, allLivingPlayers, dt);

      if (stepRes.ended) {
        if (stepRes.hitWall && this.onEffect && stepRes.endX && stepRes.endY) {
          this.onEffect("spark", stepRes.endX, stepRes.endY);
        }
        if (
          stepRes.hitPlayerEid !== null &&
          this.onEffect &&
          stepRes.endX &&
          stepRes.endY
        ) {
          this.onEffect("hit", stepRes.endX, stepRes.endY);
          this.applyDamage(stepRes.hitPlayerEid, prj.damage);
        }
        this.projectiles.splice(i, 1);
      }
    }

    // 6. Respawns for dummy targets
    for (const dummy of this.targetDummies) {
      if (dummy.isDead) {
        dummy.hp += 20 * dt; // Regenerate dummy
        if (dummy.hp >= PLAYER_MAX_HP) {
          dummy.hp = PLAYER_MAX_HP;
          dummy.isDead = false;
        }
      }
    }
  }

  private startReload(
    player: SimPlayer,
    weaponDef: ReturnType<typeof getWeaponDef>
  ): void {
    const isPrimary = player.activeSlot === 0;
    const currentMag = isPrimary ? player.primaryMag : player.secondaryMag;
    const reserve = isPrimary ? player.primaryReserve : Infinity;

    if (currentMag < weaponDef.magSize && reserve > 0) {
      player.reloadTimerSec = weaponDef.reloadTimeSec;
      player.continuousFireShots = 0;
    }
  }

  private finishReload(player: SimPlayer): void {
    const isPrimary = player.activeSlot === 0;
    const weaponDef = getWeaponDef(
      isPrimary ? player.primaryWeapon : "pistol"
    );

    if (isPrimary) {
      const needed = weaponDef.magSize - player.primaryMag;
      const toLoad = Math.min(needed, player.primaryReserve);
      player.primaryMag += toLoad;
      player.primaryReserve -= toLoad;
    } else {
      player.secondaryMag = weaponDef.magSize;
    }
  }

  private fireWeapon(
    player: SimPlayer,
    weaponDef: ReturnType<typeof getWeaponDef>,
    aimAngle: number
  ): void {
    // Decrement ammo
    if (player.activeSlot === 0) {
      player.primaryMag--;
    } else {
      player.secondaryMag--;
    }

    player.fireCooldownSec = weaponDef.fireIntervalSec;
    player.continuousFireShots++;

    // Calculate bullet spread
    let spread = weaponDef.spreadDeg;
    if (weaponDef.maxSpreadDeg && weaponDef.spreadIncrementDeg) {
      spread = Math.min(
        weaponDef.maxSpreadDeg,
        weaponDef.spreadDeg +
          (player.continuousFireShots - 1) * weaponDef.spreadIncrementDeg
      );
    }

    const spreadRad = (spread * Math.PI) / 180;
    const spreadAngle = (Math.random() - 0.5) * spreadRad;
    const finalAngle = aimAngle + spreadAngle;

    // Spawn projectile from gun muzzle
    const muzzleDist = 20;
    const spawnX = player.x + Math.cos(aimAngle) * muzzleDist;
    const spawnY = player.y + Math.sin(aimAngle) * muzzleDist;

    const vx = Math.cos(finalAngle) * weaponDef.projectileSpeed;
    const vy = Math.sin(finalAngle) * weaponDef.projectileSpeed;

    const prj: SimProjectile = {
      id: this.nextPrjId++,
      ownerEid: player.eid,
      inputSeq: 0,
      weaponId: weaponDef.id,
      x: spawnX,
      y: spawnY,
      prevX: spawnX,
      prevY: spawnY,
      vx,
      vy,
      speed: weaponDef.projectileSpeed,
      remainingRange: weaponDef.range,
      damage: weaponDef.damage,
      alive: true,
      spawnTick: this.tick,
    };

    this.projectiles.push(prj);

    // Muzzle flash effect
    if (this.onEffect) {
      this.onEffect("flash", spawnX, spawnY, aimAngle);
    }
  }

  private applyDamage(targetEid: number, damage: number): void {
    const target = this.targetDummies.find((d) => d.eid === targetEid);
    if (!target || target.isDead) return;

    target.hp = Math.max(0, target.hp - damage);
    if (target.hp === 0) {
      target.isDead = true;
    }
  }
}
