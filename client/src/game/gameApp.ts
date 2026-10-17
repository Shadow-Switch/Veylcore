import {
  FIXED_DELTA,
  MapQuery,
  defaultMap,
  SimPlayer,
  SimProjectile,
  SnapshotMsg,
  GameEvent,
  PLAYER_MAX_HP,
  WeaponId,
} from "@veylcore/shared";
import { Camera } from "../render/camera";
import { CanvasRenderer } from "../render/canvasRenderer";
import { InputManager } from "../input/inputManager";
import { NetworkClient } from "../net/networkClient";
import { LocalConnection } from "../net/localConnection";
import { WsConnection } from "../net/wsConnection";
import { GameHud } from "../ui/hud";
import { MainMenu } from "../ui/menu";

export class GameApp {
  private canvas: HTMLCanvasElement;
  private camera: Camera;
  private renderer: CanvasRenderer;
  private inputManager: InputManager;
  private localConnection: LocalConnection;
  private wsConnection: WsConnection;
  private activeConnection: NetworkClient;
  private hud: GameHud;
  private menu: MainMenu;
  private mapQuery: MapQuery;

  private isRunning = false;
  private isPaused = false;
  private isOnline = false;
  private nickname = "Player";

  // Online state directly driven by server authoritative snapshots (P2: No prediction)
  private onlineLocalPlayer: SimPlayer;
  private onlineOtherPlayers: Map<number, SimPlayer> = new Map();
  private onlineProjectiles: SimProjectile[] = [];

  // Timing & fixed timestep accumulator
  private lastTime = 0;
  private accumulator = 0;
  private fpsCounter = 0;
  private currentFps = 60;
  private fpsTimer = 0;

  constructor(
    canvas: HTMLCanvasElement,
    hudContainer: HTMLElement,
    menuContainer: HTMLElement
  ) {
    this.canvas = canvas;
    this.camera = new Camera();
    this.renderer = new CanvasRenderer(this.canvas, this.camera);
    this.inputManager = new InputManager();
    this.mapQuery = new MapQuery(defaultMap);

    this.localConnection = new LocalConnection();
    this.wsConnection = new WsConnection();
    this.activeConnection = this.localConnection;

    // Default player placeholder
    const spawn0 = defaultMap.spawnPoints[0] || { x: 200, y: 200 };
    this.onlineLocalPlayer = {
      eid: 1,
      x: spawn0.x,
      y: spawn0.y,
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

    // Pre-render floor tiles for high rendering performance
    this.renderer.preRenderFloor(this.mapQuery);

    this.hud = new GameHud(hudContainer);
    this.hud.setVisible(false);

    this.menu = new MainMenu(menuContainer, {
      onStartPractice: (nick) => this.startPracticeGame(nick),
      onStartOnline: (nick, room) => this.startOnlineGame(nick, room),
      onResumeGame: () => this.resumeGame(),
      onExitToMenu: () => this.exitToMenu(),
    });

    // Connect hit & flash effects from local server to renderer
    this.localConnection.getServer().setEffectCallback((type, x, y, angle) => {
      this.renderer.addEffect({
        type,
        x,
        y,
        angle,
        life: type === "flash" ? 0.06 : 0.2,
        maxLife: type === "flash" ? 0.06 : 0.2,
      });
    });

    // Wire up online WebSocket snapshots and events
    this.setupOnlineListeners();

    this.bindEvents();
  }

  private setupOnlineListeners(): void {
    this.wsConnection.onSnapshot((snap: SnapshotMsg) => {
      if (!this.isOnline) return;

      // 1. Update local player directly from server authoritative snapshot (P2)
      if (snap.you) {
        this.onlineLocalPlayer.eid = snap.you.eid;
        this.onlineLocalPlayer.x = snap.you.x;
        this.onlineLocalPlayer.y = snap.you.y;
        this.onlineLocalPlayer.hp = snap.you.hp;
        this.onlineLocalPlayer.isDead = snap.you.st === "dead";
        this.onlineLocalPlayer.activeSlot = snap.you.w;

        if (snap.you.pri) {
          this.onlineLocalPlayer.primaryWeapon = snap.you.pri.id;
          this.onlineLocalPlayer.primaryMag = snap.you.pri.mag;
          this.onlineLocalPlayer.primaryReserve = snap.you.pri.res;
        }
        if (snap.you.sec) {
          this.onlineLocalPlayer.secondaryMag = snap.you.sec.mag;
        }
      }

      // 2. Update other players
      const currentEids = new Set<number>();
      for (const ent of snap.e) {
        if (ent[1] === 1) {
          // Player kind
          const [eid, , x, y, aim, hp, weaponId] = ent;
          currentEids.add(eid);

          let p = this.onlineOtherPlayers.get(eid);
          if (!p) {
            p = {
              eid,
              x,
              y,
              vx: 0,
              vy: 0,
              aimAngle: aim,
              hp,
              isDead: hp <= 0,
              activeSlot: 0,
              primaryWeapon: (weaponId as WeaponId) || "k2",
              primaryMag: 30,
              primaryReserve: 90,
              secondaryMag: 12,
              reloadTimerSec: 0,
              fireCooldownSec: 0,
              continuousFireShots: 0,
            };
            this.onlineOtherPlayers.set(eid, p);
          } else {
            p.x = x;
            p.y = y;
            p.aimAngle = aim;
            p.hp = hp;
            p.isDead = hp <= 0;
            p.primaryWeapon = (weaponId as WeaponId) || "k2";
          }
        }
      }

      // Remove disconnected players
      for (const eid of this.onlineOtherPlayers.keys()) {
        if (!currentEids.has(eid)) {
          this.onlineOtherPlayers.delete(eid);
        }
      }
    });

    this.wsConnection.onEvent((ev: GameEvent) => {
      if (!this.isOnline) return;

      if (ev.k === "shot") {
        this.renderer.addEffect({
          type: "flash",
          x: ev.x,
          y: ev.y,
          angle: ev.a,
          life: 0.06,
          maxLife: 0.06,
        });

        // Add visual projectile
        this.onlineProjectiles.push({
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
        });
      } else if (ev.k === "pend") {
        if (ev.why === "wall") {
          this.renderer.addEffect({
            type: "spark",
            x: ev.x,
            y: ev.y,
            life: 0.2,
            maxLife: 0.2,
          });
        }
        // Remove projectile
        const idx = this.onlineProjectiles.findIndex((p) => p.id === ev.prj);
        if (idx !== -1) {
          this.onlineProjectiles.splice(idx, 1);
        }
      } else if (ev.k === "hit") {
        const victim =
          ev.v === this.onlineLocalPlayer.eid
            ? this.onlineLocalPlayer
            : this.onlineOtherPlayers.get(ev.v);
        if (victim) {
          this.renderer.addEffect({
            type: "hit",
            x: victim.x,
            y: victim.y,
            life: 0.2,
            maxLife: 0.2,
          });
        }
      }
    });
  }

  private bindEvents(): void {
    window.addEventListener("resize", () => {
      this.renderer.resizeCanvas();
    });

    window.addEventListener("keydown", (e) => {
      if (e.code === "Escape" && this.isRunning) {
        this.togglePause();
      }
    });
  }

  public startPracticeGame(nickname: string): void {
    this.nickname = nickname;
    this.isOnline = false;
    this.activeConnection = this.localConnection;
    this.startGameCommon();
    this.localConnection.connect("local_offline", nickname);
  }

  public async startOnlineGame(nickname: string, roomCode: string): Promise<void> {
    this.nickname = nickname;
    this.isOnline = true;
    this.activeConnection = this.wsConnection;
    this.onlineOtherPlayers.clear();
    this.onlineProjectiles = [];

    try {
      await this.wsConnection.connect(roomCode, nickname);
      this.startGameCommon();
    } catch (err) {
      alert(`온라인 연결 실패: ${err instanceof Error ? err.message : String(err)}\n서버 상태를 확인해 주세요.`);
      this.menu.showMainMenu();
    }
  }

  private startGameCommon(): void {
    this.isRunning = true;
    this.isPaused = false;

    this.menu.hideMainMenu();
    this.menu.hidePauseModal();
    this.hud.setVisible(true);

    this.lastTime = performance.now();
    this.accumulator = 0;
    this.fpsTimer = performance.now();
    this.fpsCounter = 0;

    requestAnimationFrame((t) => this.loop(t));
  }

  public togglePause(): void {
    if (this.isPaused) {
      this.resumeGame();
    } else {
      this.isPaused = true;
      this.menu.showPauseModal();
    }
  }

  public resumeGame(): void {
    this.isPaused = false;
    this.menu.hidePauseModal();
    this.lastTime = performance.now();
  }

  public exitToMenu(): void {
    this.isRunning = false;
    this.isPaused = false;
    this.hud.setVisible(false);
    this.activeConnection.disconnect();
  }

  private loop(now: number): void {
    if (!this.isRunning) return;

    const frameDelta = Math.min(0.2, (now - this.lastTime) / 1000);
    this.lastTime = now;

    // FPS calculation
    this.fpsCounter++;
    if (now - this.fpsTimer >= 1000) {
      this.currentFps = this.fpsCounter;
      this.fpsCounter = 0;
      this.fpsTimer = now;
    }

    if (!this.isPaused) {
      this.accumulator += frameDelta;

      // Get current player for input sampling
      const activePlayer = this.isOnline
        ? this.onlineLocalPlayer
        : this.localConnection.getServer().getLocalPlayer();

      // Convert screen mouse position to in-game world position using camera
      const screenMouse = this.inputManager.getScreenMouse();
      const worldMouse = this.camera.screenToWorld(
        screenMouse.x,
        screenMouse.y
      );
      this.inputManager.updateWorldMouse(worldMouse.x, worldMouse.y);

      // Fixed timestep: 30Hz steps
      let steps = 0;
      while (this.accumulator >= FIXED_DELTA && steps < 5) {
        const cmd = this.inputManager.sampleCommand(
          activePlayer.x,
          activePlayer.y
        );
        this.activeConnection.sendInput(cmd);
        this.accumulator -= FIXED_DELTA;
        steps++;
      }

      // Update online visual projectiles
      if (this.isOnline) {
        for (let i = this.onlineProjectiles.length - 1; i >= 0; i--) {
          const prj = this.onlineProjectiles[i];
          const dist = prj.speed * frameDelta;
          prj.x += (prj.vx / prj.speed) * dist;
          prj.y += (prj.vy / prj.speed) * dist;
          prj.remainingRange -= dist;
          if (prj.remainingRange <= 0) {
            this.onlineProjectiles.splice(i, 1);
          }
        }
      }

      // Update DOM HUD
      this.hud.update(activePlayer, this.currentFps);

      // Render frame
      if (this.isOnline) {
        // P2: Draw snapshot positions directly
        this.renderer.render(
          this.mapQuery,
          this.onlineLocalPlayer,
          Array.from(this.onlineOtherPlayers.values()),
          this.onlineProjectiles,
          worldMouse,
          this.nickname,
          frameDelta
        );
      } else {
        const localServer = this.localConnection.getServer();
        this.renderer.render(
          this.mapQuery,
          localServer.getLocalPlayer(),
          localServer.getTargetDummies(),
          localServer.getProjectiles(),
          worldMouse,
          this.nickname,
          frameDelta
        );
      }
    }

    requestAnimationFrame((t) => this.loop(t));
  }
}
