import {
  FIXED_DELTA,
  MapQuery,
  defaultMap,
  computeMapHash,
  SimPlayer,
  SimProjectile,
  JsonCodec,
  validateHelloPayload,
  validateInputCmd,
  validateRawMessage,
  stepPlayerMovement,
  stepProjectileSweep,
  getWeaponDef,
  SnapshotMsg,
  EntityTuple,
  GameEvent,
  ButtonBits,
  PlayerFlags,
  PLAYER_MAX_HP,
  WeaponId,
} from "@veylcore/shared";
import { InputBuffer } from "./inputBuffer";

interface ConnectedPlayer {
  pid: string;
  eid: number;
  name: string;
  token: string;
  ws: WebSocket;
  buffer: InputBuffer;
  sim: SimPlayer;
  lastAckSeq: number;
}

export class RoomDO {
  private state: any;
  private env: any;
  private map: MapQuery;
  private players: Map<string, ConnectedPlayer> = new Map();
  private projectiles: SimProjectile[] = [];
  private nextEid = 1;
  private nextPrjId = 1;
  private serverTick = 0;
  private isLoopRunning = false;
  private pendingEvents: GameEvent[] = [];

  constructor(state: any, env: any) {
    this.state = state;
    this.env = env;
    this.map = new MapQuery(defaultMap);
  }

  public async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);

    if (request.headers.get("Upgrade") !== "websocket") {
      return new Response("Expected WebSocket", { status: 426 });
    }

    const pair = new (globalThis as any).WebSocketPair();
    const clientWs = pair[0];
    const serverWs = pair[1];

    serverWs.accept();
    this.handleWebSocketConnection(serverWs);

    return new Response(null, {
      status: 101,
      webSocket: clientWs,
    } as any);
  }

  private handleWebSocketConnection(ws: WebSocket): void {
    let assignedPid: string | null = null;

    ws.addEventListener("message", (event) => {
      const rawText = typeof event.data === "string" ? event.data : "";
      const rawRes = validateRawMessage(rawText);
      if (!rawRes.ok || !rawRes.data) {
        ws.send(JsonCodec.encode("err", { code: "BAD_MESSAGE", msg: rawRes.error }));
        return;
      }

      const { t, d } = rawRes.data;

      // Heartbeat
      if (t === "hb") {
        ws.send("hb");
        return;
      }

      // Hello
      if (t === "hello") {
        if (assignedPid) return; // Already welcomed

        const helloRes = validateHelloPayload(d);
        if (!helloRes.ok || !helloRes.data) {
          ws.send(JsonCodec.encode("err", { code: "BAD_HELLO", msg: helloRes.error }));
          ws.close(4003, "Protocol error");
          return;
        }

        const pid = `p${this.nextEid++}`;
        const eid = this.nextEid++;
        const token = crypto.randomUUID();
        assignedPid = pid;

        // Choose spawn point based on player count
        const spawnIdx = this.players.size % defaultMap.spawnPoints.length;
        const spawnPos = defaultMap.spawnPoints[spawnIdx] || { x: 300, y: 300 };

        const simPlayer: SimPlayer = {
          eid,
          x: spawnPos.x,
          y: spawnPos.y,
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

        const player: ConnectedPlayer = {
          pid,
          eid,
          name: helloRes.data.name,
          token,
          ws,
          buffer: new InputBuffer(),
          sim: simPlayer,
          lastAckSeq: 0,
        };

        this.players.set(pid, player);

        // Send welcome
        ws.send(
          JsonCodec.encode("welcome", {
            proto: 1,
            you: pid,
            token,
            lastSeq: 0,
            tickRate: 30,
            snapRate: 15,
          })
        );

        // Send start
        const roster = Array.from(this.players.values()).map((p) => ({
          pid: p.pid,
          eid: p.eid,
          name: p.name,
          bot: false,
          away: false,
        }));

        ws.send(
          JsonCodec.encode("start", {
            matchId: "match_p2",
            map: defaultMap.id,
            mapHash: computeMapHash(defaultMap),
            tick: this.serverTick,
            endTick: this.serverTick + 30 * 300, // 5 min match
            rules: { weaponMode: "pickup", killTarget: 20 },
            roster,
            you: eid,
          })
        );

        this.ensureTickLoop();
        return;
      }

      // Input commands ('in')
      if (t === "in" && assignedPid) {
        const player = this.players.get(assignedPid);
        if (!player) return;

        const payload = d as { c?: unknown[] };
        if (Array.isArray(payload?.c)) {
          const validatedList = [];
          for (const item of payload.c) {
            const v = validateInputCmd(item);
            if (v.ok && v.data) {
              validatedList.push(v.data);
            }
          }
          if (validatedList.length > 0) {
            player.buffer.push(validatedList);
          }
        }
      }
    });

    const cleanup = () => {
      if (assignedPid) {
        this.players.delete(assignedPid);
        assignedPid = null;
      }
      if (this.players.size === 0) {
        this.isLoopRunning = false;
      }
    };

    ws.addEventListener("close", cleanup);
    ws.addEventListener("error", cleanup);
  }

  private ensureTickLoop(): void {
    if (this.isLoopRunning) return;
    this.isLoopRunning = true;

    const tickIntervalMs = 1000 / 30; // ~33.33ms
    let nextTickTime = performance.now();

    const loop = () => {
      if (!this.isLoopRunning || this.players.size === 0) {
        this.isLoopRunning = false;
        return;
      }

      const now = performance.now();
      while (now >= nextTickTime) {
        this.stepTick();
        nextTickTime += tickIntervalMs;
      }

      const delay = Math.max(0, nextTickTime - performance.now());
      setTimeout(loop, delay);
    };

    setTimeout(loop, 0);
  }

  private stepTick(): void {
    this.serverTick++;
    const allLivingPlayers = Array.from(this.players.values()).map((p) => p.sim);

    // 1. Process inputs for each connected player
    for (const player of this.players.values()) {
      const cmd = player.buffer.consume();
      if (!cmd) continue;

      player.lastAckSeq = cmd.s;
      const sim = player.sim;

      // Slot switch
      if (sim.activeSlot !== cmd.w) {
        sim.activeSlot = cmd.w;
        sim.reloadTimerSec = 0;
        sim.fireCooldownSec = 0.15;
      }

      // Timers
      if (sim.fireCooldownSec > 0) {
        sim.fireCooldownSec = Math.max(0, sim.fireCooldownSec - FIXED_DELTA);
      }
      if (sim.reloadTimerSec > 0) {
        sim.reloadTimerSec = Math.max(0, sim.reloadTimerSec - FIXED_DELTA);
        if (sim.reloadTimerSec === 0) {
          this.finishReload(sim);
        }
      }

      // Movement
      sim.aimAngle = cmd.a;
      const moveRes = stepPlayerMovement(sim, cmd.mx, cmd.my, this.map, FIXED_DELTA);
      sim.x = moveRes.x;
      sim.y = moveRes.y;
      sim.vx = moveRes.vx;
      sim.vy = moveRes.vy;

      // Weapon firing & reload
      const weaponDef = getWeaponDef(sim.activeSlot === 0 ? sim.primaryWeapon : "pistol");

      if ((cmd.b & ButtonBits.RELOAD) !== 0 && sim.reloadTimerSec <= 0) {
        this.startReload(sim, weaponDef);
      }

      const isFireHeld = (cmd.b & ButtonBits.FIRE) !== 0;
      if (isFireHeld && sim.reloadTimerSec <= 0 && sim.fireCooldownSec <= 0) {
        const mag = sim.activeSlot === 0 ? sim.primaryMag : sim.secondaryMag;
        if (mag > 0) {
          this.fireWeapon(sim, weaponDef, cmd.a, cmd.s);
        } else {
          this.startReload(sim, weaponDef);
        }
      }

      if (!isFireHeld) {
        sim.continuousFireShots = 0;
      }
    }

    // 2. Step Projectiles
    for (let i = this.projectiles.length - 1; i >= 0; i--) {
      const prj = this.projectiles[i];
      const stepRes = stepProjectileSweep(prj, this.map, allLivingPlayers, FIXED_DELTA);

      if (stepRes.ended) {
        if (stepRes.hitWall) {
          this.pendingEvents.push({
            k: "pend",
            prj: prj.id,
            x: prj.x,
            y: prj.y,
            why: "wall",
          });
        }
        if (stepRes.hitPlayerEid !== null) {
          this.pendingEvents.push({
            k: "hit",
            v: stepRes.hitPlayerEid,
            a: prj.ownerEid,
            dmg: prj.damage,
            w: prj.weaponId,
          });
          this.applyDamage(stepRes.hitPlayerEid, prj.damage, prj.ownerEid);
        }
        this.projectiles.splice(i, 1);
      }
    }

    // 3. 15Hz Snapshot broadcast (every even tick)
    if (this.serverTick % 2 === 0) {
      this.broadcastSnapshots();
      this.pendingEvents = [];
    }
  }

  private broadcastSnapshots(): void {
    const playersList = Array.from(this.players.values());

    for (const player of playersList) {
      const mySim = player.sim;
      const otherEntities: EntityTuple[] = [];

      for (const other of playersList) {
        if (other.pid === player.pid) continue;
        const os = other.sim;

        let flags = 0;
        if (os.isDead) flags |= PlayerFlags.DEAD;
        if (os.reloadTimerSec > 0) flags |= PlayerFlags.RELOADING;

        otherEntities.push([
          os.eid,
          1,
          Math.round(os.x),
          Math.round(os.y),
          Number(os.aimAngle.toFixed(2)),
          Math.round(os.hp),
          os.activeSlot === 0 ? os.primaryWeapon : "pistol",
          flags,
        ]);
      }

      const snapMsg: SnapshotMsg = {
        k: this.serverTick,
        ack: player.lastAckSeq,
        you: {
          eid: mySim.eid,
          x: Math.round(mySim.x),
          y: Math.round(mySim.y),
          hp: Math.round(mySim.hp),
          st: mySim.isDead ? "dead" : "alive",
          w: mySim.activeSlot,
          pri: { id: mySim.primaryWeapon, mag: mySim.primaryMag, res: mySim.primaryReserve },
          sec: { id: "pistol", mag: mySim.secondaryMag },
          eq: null,
          speedMul: getWeaponDef(mySim.activeSlot === 0 ? mySim.primaryWeapon : "pistol").moveMultiplier,
          zoom: false,
          rtt: 0,
        },
        e: otherEntities,
        ev: this.pendingEvents,
      };

      try {
        player.ws.send(JsonCodec.encode("snap", snapMsg));
      } catch {
        // Socket closed
      }
    }
  }

  private startReload(player: SimPlayer, def: ReturnType<typeof getWeaponDef>): void {
    const isPrimary = player.activeSlot === 0;
    const mag = isPrimary ? player.primaryMag : player.secondaryMag;
    const res = isPrimary ? player.primaryReserve : Infinity;
    if (mag < def.magSize && res > 0) {
      player.reloadTimerSec = def.reloadTimeSec;
      player.continuousFireShots = 0;
    }
  }

  private finishReload(player: SimPlayer): void {
    const isPrimary = player.activeSlot === 0;
    const def = getWeaponDef(isPrimary ? player.primaryWeapon : "pistol");
    if (isPrimary) {
      const needed = def.magSize - player.primaryMag;
      const toLoad = Math.min(needed, player.primaryReserve);
      player.primaryMag += toLoad;
      player.primaryReserve -= toLoad;
    } else {
      player.secondaryMag = def.magSize;
    }
  }

  private fireWeapon(
    player: SimPlayer,
    def: ReturnType<typeof getWeaponDef>,
    aimAngle: number,
    inputSeq: number
  ): void {
    if (player.activeSlot === 0) {
      player.primaryMag--;
    } else {
      player.secondaryMag--;
    }

    player.fireCooldownSec = def.fireIntervalSec;
    player.continuousFireShots++;

    const muzzleDist = 20;
    const spawnX = player.x + Math.cos(aimAngle) * muzzleDist;
    const spawnY = player.y + Math.sin(aimAngle) * muzzleDist;

    const prjId = this.nextPrjId++;
    const vx = Math.cos(aimAngle) * def.projectileSpeed;
    const vy = Math.sin(aimAngle) * def.projectileSpeed;

    const prj: SimProjectile = {
      id: prjId,
      ownerEid: player.eid,
      inputSeq,
      weaponId: def.id,
      x: spawnX,
      y: spawnY,
      prevX: spawnX,
      prevY: spawnY,
      vx,
      vy,
      speed: def.projectileSpeed,
      remainingRange: def.range,
      damage: def.damage,
      alive: true,
      spawnTick: this.serverTick,
    };

    this.projectiles.push(prj);

    // Broadcast shot event
    this.pendingEvents.push({
      k: "shot",
      prj: prjId,
      o: player.eid,
      s: inputSeq,
      w: def.id,
      x: Math.round(spawnX),
      y: Math.round(spawnY),
      a: Number(aimAngle.toFixed(2)),
      v: def.projectileSpeed,
      r: def.range,
      tk: this.serverTick,
    });
  }

  private applyDamage(targetEid: number, damage: number, attackerEid: number): void {
    for (const player of this.players.values()) {
      if (player.eid === targetEid && !player.sim.isDead) {
        player.sim.hp = Math.max(0, player.sim.hp - damage);
        if (player.sim.hp === 0) {
          player.sim.isDead = true;
          this.pendingEvents.push({
            k: "kill",
            killer: `p${attackerEid}`,
            victim: player.pid,
            w: "bullet",
          });
        }
      }
    }
  }
}
