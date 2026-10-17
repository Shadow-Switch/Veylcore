import {
  MapQuery,
  TILE_SIZE,
  SimPlayer,
  SimProjectile,
  MAP_WIDTH,
  MAP_HEIGHT,
  VIEW_WIDTH,
  VIEW_HEIGHT,
} from "@veylcore/shared";
import { Camera } from "./camera";
import { SpriteRenderer, VisualEffect } from "./spriteRenderer";

export class CanvasRenderer {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private camera: Camera;
  private spriteRenderer: SpriteRenderer;

  // Offscreen canvas for pre-rendered floor
  private floorCanvas: HTMLCanvasElement | null = null;
  private effects: VisualEffect[] = [];

  constructor(canvas: HTMLCanvasElement, camera: Camera) {
    this.canvas = canvas;
    const context = canvas.getContext("2d");
    if (!context) {
      throw new Error("Unable to obtain 2D canvas context");
    }
    this.ctx = context;
    this.camera = camera;
    this.spriteRenderer = new SpriteRenderer();

    this.resizeCanvas();
  }

  public getSpriteRenderer(): SpriteRenderer {
    return this.spriteRenderer;
  }

  public resizeCanvas(): void {
    const dpr = window.devicePixelRatio || 1;
    const width = window.innerWidth;
    const height = window.innerHeight;

    this.canvas.width = Math.floor(width * dpr);
    this.canvas.height = Math.floor(height * dpr);
    this.canvas.style.width = `${width}px`;
    this.canvas.style.height = `${height}px`;

    this.camera.updateViewport(width, height);
  }

  /**
   * Pre-renders the static floor tiles to an offscreen canvas for optimal performance
   */
  public preRenderFloor(map: MapQuery): void {
    const worldW = map.worldWidth();
    const worldH = map.worldHeight();

    this.floorCanvas = document.createElement("canvas");
    this.floorCanvas.width = worldW;
    this.floorCanvas.height = worldH;

    const fCtx = this.floorCanvas.getContext("2d");
    if (!fCtx) return;

    const mapData = map.getMapData();
    for (let ty = 0; ty < mapData.heightTiles; ty++) {
      for (let tx = 0; tx < mapData.widthTiles; tx++) {
        const x = tx * TILE_SIZE;
        const y = ty * TILE_SIZE;
        this.spriteRenderer.drawFloorTile(fCtx, x, y, tx, ty);
      }
    }
  }

  public addEffect(fx: VisualEffect): void {
    this.effects.push(fx);
  }

  /**
   * Main render frame
   */
  public render(
    map: MapQuery,
    localPlayer: SimPlayer,
    otherPlayers: SimPlayer[],
    projectiles: SimProjectile[],
    worldMouse: { x: number; y: number },
    localNick: string = "Player",
    dt: number = 0.016
  ): void {
    const dpr = window.devicePixelRatio || 1;
    const ctx = this.ctx;

    // Reset transform & clear screen with dark letterbox color
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = "#090d16";
    ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

    // Apply DPR scaling
    ctx.scale(dpr, dpr);

    // Follow camera on local player
    this.camera.follow(localPlayer.x, localPlayer.y);

    // Apply Camera World Matrix
    ctx.save();
    this.camera.applyTransform(ctx);

    // 1. Layer: Pre-rendered floor
    if (this.floorCanvas) {
      ctx.drawImage(this.floorCanvas, 0, 0);
    }

    // 2. Layer: Wall tiles (only visible tiles around camera view)
    this.renderVisibleWalls(ctx, map);

    // 3. Layer: Other players / Target dummies
    for (const player of otherPlayers) {
      this.spriteRenderer.drawPlayer(
        ctx,
        player,
        false,
        `Target #${player.eid}`
      );
    }

    // 4. Layer: Local player
    this.spriteRenderer.drawPlayer(ctx, localPlayer, true, localNick);

    // 5. Layer: Projectiles
    for (const prj of projectiles) {
      this.spriteRenderer.drawProjectile(ctx, prj);
    }

    // 6. Layer: Particle effects
    this.renderEffects(ctx, dt);

    // 7. Layer: Tactical Crosshair
    this.spriteRenderer.drawCrosshair(
      ctx,
      worldMouse.x,
      worldMouse.y,
      localPlayer.continuousFireShots > 0 ? 8 : 4
    );

    ctx.restore();

    // 8. Screen-space Minimap Overlay (bottom-right corner)
    this.renderMinimap(map, localPlayer, otherPlayers);
  }

  private renderVisibleWalls(
    ctx: CanvasRenderingContext2D,
    map: MapQuery
  ): void {
    const halfW = VIEW_WIDTH / 2 + 100;
    const halfH = VIEW_HEIGHT / 2 + 100;

    const minX = Math.max(0, this.camera.x - halfW);
    const maxX = Math.min(MAP_WIDTH, this.camera.x + halfW);
    const minY = Math.max(0, this.camera.y - halfH);
    const maxY = Math.min(MAP_HEIGHT, this.camera.y + halfH);

    const minTx = Math.floor(minX / TILE_SIZE);
    const maxTx = Math.ceil(maxX / TILE_SIZE);
    const minTy = Math.floor(minY / TILE_SIZE);
    const maxTy = Math.ceil(maxY / TILE_SIZE);

    for (let ty = minTy; ty < maxTy; ty++) {
      for (let tx = minTx; tx < maxTx; tx++) {
        if (map.isWall(tx, ty)) {
          this.spriteRenderer.drawWallTile(ctx, tx * TILE_SIZE, ty * TILE_SIZE);
        }
      }
    }
  }

  private renderEffects(ctx: CanvasRenderingContext2D, dt: number): void {
    for (let i = this.effects.length - 1; i >= 0; i--) {
      const fx = this.effects[i];
      this.spriteRenderer.drawEffect(ctx, fx);
      fx.life -= dt;
      if (fx.life <= 0) {
        this.effects.splice(i, 1);
      }
    }
  }

  private renderMinimap(
    map: MapQuery,
    localPlayer: SimPlayer,
    otherPlayers: SimPlayer[]
  ): void {
    const ctx = this.ctx;
    const mapW = 160;
    const mapH = 100;
    const padding = 16;
    const x = window.innerWidth - mapW - padding;
    const y = window.innerHeight - mapH - padding;

    // Minimap frame & background
    ctx.save();
    ctx.fillStyle = "rgba(15, 23, 42, 0.75)";
    ctx.fillRect(x, y, mapW, mapH);
    ctx.strokeStyle = "rgba(56, 189, 248, 0.3)";
    ctx.lineWidth = 1;
    ctx.strokeRect(x, y, mapW, mapH);

    const scaleX = mapW / MAP_WIDTH;
    const scaleY = mapH / MAP_HEIGHT;

    // Draw other players
    for (const p of otherPlayers) {
      if (p.isDead) continue;
      ctx.fillStyle = "#ef4444";
      ctx.beginPath();
      ctx.arc(x + p.x * scaleX, y + p.y * scaleY, 2.5, 0, Math.PI * 2);
      ctx.fill();
    }

    // Draw local player
    ctx.fillStyle = "#38bdf8";
    ctx.beginPath();
    ctx.arc(
      x + localPlayer.x * scaleX,
      y + localPlayer.y * scaleY,
      3.5,
      0,
      Math.PI * 2
    );
    ctx.fill();

    // Viewport frustum rectangle
    ctx.strokeStyle = "rgba(255, 255, 255, 0.25)";
    ctx.strokeRect(
      x + (this.camera.x - VIEW_WIDTH / 2) * scaleX,
      y + (this.camera.y - VIEW_HEIGHT / 2) * scaleY,
      VIEW_WIDTH * scaleX,
      VIEW_HEIGHT * scaleY
    );

    ctx.restore();
  }
}
