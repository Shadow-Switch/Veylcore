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
  ButtonBits,
} from "@veylcore/shared";
import { Camera } from "../render/camera";
import { CanvasRenderer } from "../render/canvasRenderer";
import { InputManager } from "../input/inputManager";
import { NetworkClient } from "../net/networkClient";
import { LocalConnection } from "../net/localConnection";
import { WsConnection } from "../net/wsConnection";
import { Predictor } from "../net/predictor";
import { Interpolator } from "../net/interpolator";
import { LocalProjectiles } from "../net/localProjectiles";
import { LatencySimulator } from "../net/latencySimulator";
import { GameHud } from "../ui/hud";
import { MainMenu } from "../ui/menu";

export class GameApp {
  private canvas: HTMLCanvasElement;
  private camera: Camera;
  private renderer: CanvasRenderer;
  private inputManager: InputManager;
  private localConnection: LocalConnection;
  private wsConnection: WsConnection;
  private latencySim: LatencySimulator;
  private activeConnection: NetworkClient;
  private hud: GameHud;
  private menu: MainMenu;
  private mapQuery: MapQuery;

  private isRunning = false;
  private isPaused = false;
  private isOnline = false;
  private nickname = "Player";

  // P3 Netcode components
  private predictor: Predictor;
  private interpolator: Interpolator;
  private localProjectiles: LocalProjectiles;

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
    this.latencySim = new LatencySimulator(this.wsConnection);
    this.activeConnection = this.localConnection;

    // Initialize P3 netcode components
    const spawn0 = defaultMap.spawnPoints[0] || { x: 200, y: 200 };
    const initialPlayer: SimPlayer = {
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

    this.predictor = new Predictor(initialPlayer);
    this.interpolator = new Interpolator();
    this.localProjectiles = new LocalProjectiles();

    // Pre-render floor tiles for high rendering performance
    this.renderer.preRenderFloor(this.mapQuery);

    this.hud = new GameHud(hudContainer, {
      onSetSimulatedLatency: (rtt, jitter) => {
        this.latencySim.setLatency(rtt, jitter);
      },
      onTriggerFreeze: () => {
        this.latencySim.triggerFreeze(1000);
      },
    });
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

    // Wire up online WebSocket snapshots and events via LatencySimulator
    this.setupOnlineListeners();

    this.bindEvents();
  }

  private setupOnlineListeners(): void {
    this.latencySim.onSnapshot((snap: SnapshotMsg) => {
      if (!this.isOnline) return;

      // 1. Pass to Interpolator for smooth entity buffer playback
      this.interpolator.pushSnapshot(snap);

      // 2. Reconcile local player prediction with server authoritative baseline (P3)
      if (snap.you) {
        this.predictor.reconcile(snap.you, snap.ack, this.mapQuery);
      }
    });

    this.latencySim.onEvent((ev: GameEvent) => {
      if (!this.isOnline) return;
      const myEid = this.wsConnection.getMyEid() || 1;

      if (ev.k === "shot") {
        this.localProjectiles.handleServerShot(ev, myEid);
        if (ev.o !== myEid) {
          this.renderer.addEffect({
            type: "flash",
            x: ev.x,
            y: ev.y,
            angle: ev.a,
            life: 0.06,
            maxLife: 0.06,
          });
        }
      } else if (ev.k === "pend") {
        this.localProjectiles.handleServerPend(ev.prj);
        if (ev.why === "wall") {
          this.renderer.addEffect({
            type: "spark",
            x: ev.x,
            y: ev.y,
            life: 0.2,
            maxLife: 0.2,
          });
        }
      } else if (ev.k === "deny") {
        this.localProjectiles.handleServerDeny(ev.s);
      } else if (ev.k === "hit") {
        const victim =
          ev.v === myEid
            ? this.predictor.getPlayer()
            : this.interpolator
                .getInterpolatedEntities(myEid)
                .find((p) => p.eid === ev.v);
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
    this.hud.setMode(false);
    this.startGameCommon();
    this.localConnection.connect("local_offline", nickname);
  }

  public async startOnlineGame(nickname: string, roomCode: string): Promise<void> {
    this.nickname = nickname;
    this.isOnline = true;
    this.activeConnection = this.latencySim;
    this.hud.setMode(true);
    this.localProjectiles.clear();

    try {
      await this.activeConnection.connect(roomCode, nickname);
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

      // Get current player position for input sampling
      const activePlayer = this.isOnline
        ? this.predictor.getPlayer()
        : this.localConnection.getServer().getLocalPlayer();

      // Convert screen mouse to world coordinates using camera
      const screenMouse = this.inputManager.getScreenMouse();
      const worldMouse = this.camera.screenToWorld(
        screenMouse.x,
        screenMouse.y
      );
      this.inputManager.updateWorldMouse(worldMouse.x, worldMouse.y);

      // Fixed timestep: 30Hz simulation steps
      let steps = 0;
      while (this.accumulator >= FIXED_DELTA && steps < 5) {
        const cmd = this.inputManager.sampleCommand(
          activePlayer.x,
          activePlayer.y
        );

        if (this.isOnline) {
          // P3: Predict movement immediately on client
          this.predictor.predictStep(cmd, this.mapQuery);

          // P3: Immediate predicted shot on left-click trigger
          const isFirePressed = (cmd.b & ButtonBits.FIRE) !== 0;
          const currentMag =
            activePlayer.activeSlot === 0
              ? activePlayer.primaryMag
              : activePlayer.secondaryMag;

          if (isFirePressed && currentMag > 0 && activePlayer.reloadTimerSec <= 0) {
            const activeWeapon =
              activePlayer.activeSlot === 0
                ? activePlayer.primaryWeapon
                : "pistol";

            const muzzleDist = 20;
            const spawnX = activePlayer.x + Math.cos(cmd.a) * muzzleDist;
            const spawnY = activePlayer.y + Math.sin(cmd.a) * muzzleDist;

            this.localProjectiles.spawnLocalPredicted(
              activePlayer.eid,
              cmd.s,
              activeWeapon,
              spawnX,
              spawnY,
              cmd.a
            );

            this.renderer.addEffect({
              type: "flash",
              x: spawnX,
              y: spawnY,
              angle: cmd.a,
              life: 0.06,
              maxLife: 0.06,
            });
          }

          // Send input to server via latency simulator
          this.activeConnection.sendInput(cmd);
        } else {
          // P1: Local fake server
          this.activeConnection.sendInput(cmd);
        }

        this.accumulator -= FIXED_DELTA;
        steps++;
      }

      // Render & HUD updates
      if (this.isOnline) {
        // P3: Smooth visual error decay over ~100ms
        this.predictor.updateVisualSmoothing(frameDelta);
        const visualPos = this.predictor.getVisualPosition();

        // Update local predicted and remote visual projectiles
        this.localProjectiles.step(frameDelta);

        // Get smoothly interpolated positions for other players
        const myEid = this.wsConnection.getMyEid() || activePlayer.eid;
        const otherPlayers = this.interpolator.getInterpolatedEntities(myEid);

        // Update HUD with Net Graph info
        this.hud.update(activePlayer, this.currentFps, {
          rtt: this.activeConnection.getPing(),
          jitter: this.latencySim.getJitter(),
          interpDelayMs: this.interpolator.getInterpDelayMs(),
          interpDelayTicks: this.interpolator.getInterpDelayTicks(),
          reconcileCount: this.predictor.getReconcileCount(),
          lastError: this.predictor.getLastReconcileError(),
        });

        // Render scene using client-side predicted player with visual smoothing
        const renderedLocalPlayer: SimPlayer = {
          ...activePlayer,
          x: visualPos.x,
          y: visualPos.y,
        };

        this.renderer.render(
          this.mapQuery,
          renderedLocalPlayer,
          otherPlayers,
          this.localProjectiles.getActiveProjectiles(),
          worldMouse,
          this.nickname,
          frameDelta
        );
      } else {
        const localServer = this.localConnection.getServer();
        this.hud.update(localServer.getLocalPlayer(), this.currentFps);
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
