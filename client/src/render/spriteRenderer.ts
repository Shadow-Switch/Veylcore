import {
  PLAYER_RADIUS,
  TILE_SIZE,
  SimPlayer,
  SimProjectile,
  WeaponId,
  getWeaponDef,
} from "@veylcore/shared";

export interface VisualEffect {
  type: "flash" | "spark" | "hit";
  x: number;
  y: number;
  angle?: number;
  life: number;
  maxLife: number;
  color?: string;
}

export class SpriteRenderer {
  // Can be extended with HTMLImageElement asset cache later
  private imageAssets: Map<string, HTMLImageElement> = new Map();

  /**
   * Register an image asset for future asset replacement
   */
  public registerImage(key: string, img: HTMLImageElement): void {
    this.imageAssets.set(key, img);
  }

  /**
   * Draws a floor tile
   */
  public drawFloorTile(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    tx: number,
    ty: number
  ): void {
    // Checkerboard subtle variation for tactical arena floor
    const isEven = (tx + ty) % 2 === 0;
    ctx.fillStyle = isEven ? "#1a1e24" : "#1e2229";
    ctx.fillRect(x, y, TILE_SIZE, TILE_SIZE);

    // Subtle grid border
    ctx.strokeStyle = "rgba(255, 255, 255, 0.03)";
    ctx.lineWidth = 1;
    ctx.strokeRect(x + 0.5, y + 0.5, TILE_SIZE - 1, TILE_SIZE - 1);
  }

  /**
   * Draws a wall tile with top-down bevel and depth
   */
  public drawWallTile(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number
  ): void {
    // Main wall body
    ctx.fillStyle = "#2c3440";
    ctx.fillRect(x, y, TILE_SIZE, TILE_SIZE);

    // Top surface (lighter)
    ctx.fillStyle = "#3a4454";
    ctx.fillRect(x + 2, y + 2, TILE_SIZE - 4, TILE_SIZE - 4);

    // Bevel highlights
    ctx.strokeStyle = "rgba(255, 255, 255, 0.15)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(x + 1, y + TILE_SIZE - 1);
    ctx.lineTo(x + 1, y + 1);
    ctx.lineTo(x + TILE_SIZE - 1, y + 1);
    ctx.stroke();

    // Bevel shadows
    ctx.strokeStyle = "rgba(0, 0, 0, 0.4)";
    ctx.beginPath();
    ctx.moveTo(x + TILE_SIZE - 1, y + 1);
    ctx.lineTo(x + TILE_SIZE - 1, y + TILE_SIZE - 1);
    ctx.lineTo(x + 1, y + TILE_SIZE - 1);
    ctx.stroke();
  }

  /**
   * Draws a player character
   */
  public drawPlayer(
    ctx: CanvasRenderingContext2D,
    player: SimPlayer,
    isLocalPlayer: boolean,
    nickname: string
  ): void {
    if (player.isDead) return;

    ctx.save();
    ctx.translate(player.x, player.y);

    // 1. Shadow
    ctx.beginPath();
    ctx.arc(0, 4, PLAYER_RADIUS + 1, 0, Math.PI * 2);
    ctx.fillStyle = "rgba(0, 0, 0, 0.35)";
    ctx.fill();

    // 2. Body rotation to aim angle
    ctx.rotate(player.aimAngle);

    const weaponId: WeaponId =
      player.activeSlot === 0 ? player.primaryWeapon : "pistol";

    // Weapon barrel
    ctx.fillStyle = "#475569";
    if (weaponId === "k2" || weaponId === "ak47") {
      // Long rifle barrel
      ctx.fillRect(PLAYER_RADIUS - 4, -3, 20, 6);
      ctx.fillStyle = "#1e293b";
      ctx.fillRect(PLAYER_RADIUS + 4, -2, 10, 4);
    } else if (weaponId === "awp") {
      // Long sniper barrel
      ctx.fillRect(PLAYER_RADIUS - 4, -2.5, 28, 5);
      ctx.fillStyle = "#0f172a";
      ctx.fillRect(PLAYER_RADIUS + 8, -2, 14, 4);
    } else {
      // Pistol barrel
      ctx.fillRect(PLAYER_RADIUS - 4, -2.5, 12, 5);
    }

    // Hands
    ctx.fillStyle = isLocalPlayer ? "#38bdf8" : "#f87171";
    ctx.beginPath();
    ctx.arc(PLAYER_RADIUS - 2, -PLAYER_RADIUS + 4, 4, 0, Math.PI * 2);
    ctx.arc(PLAYER_RADIUS + 4, PLAYER_RADIUS - 8, 4, 0, Math.PI * 2);
    ctx.fill();

    // Main torso / helmet (Circle)
    ctx.beginPath();
    ctx.arc(0, 0, PLAYER_RADIUS, 0, Math.PI * 2);
    ctx.fillStyle = isLocalPlayer ? "#0284c7" : "#dc2626";
    ctx.fill();

    // Outer ring / armor border
    ctx.strokeStyle = isLocalPlayer ? "#7dd3fc" : "#fca5a5";
    ctx.lineWidth = 2;
    ctx.stroke();

    // Visor / helmet line
    ctx.fillStyle = "#0f172a";
    ctx.beginPath();
    ctx.arc(4, 0, 6, -Math.PI / 2, Math.PI / 2);
    ctx.fill();

    ctx.restore();

    // 3. World space overlays: Health Bar & Nickname
    this.drawPlayerOverlays(ctx, player, isLocalPlayer, nickname);
  }

  private drawPlayerOverlays(
    ctx: CanvasRenderingContext2D,
    player: SimPlayer,
    isLocalPlayer: boolean,
    nickname: string
  ): void {
    const barWidth = 36;
    const barHeight = 4;
    const barX = player.x - barWidth / 2;
    const barY = player.y - PLAYER_RADIUS - 16;

    // HP background
    ctx.fillStyle = "rgba(0, 0, 0, 0.6)";
    ctx.fillRect(barX - 1, barY - 1, barWidth + 2, barHeight + 2);

    // HP fill
    const hpRatio = Math.max(0, Math.min(1, player.hp / 100));
    ctx.fillStyle =
      hpRatio > 0.5 ? "#22c55e" : hpRatio > 0.25 ? "#eab308" : "#ef4444";
    ctx.fillRect(barX, barY, barWidth * hpRatio, barHeight);

    // Reloading indicator
    if (player.reloadTimerSec > 0) {
      const weaponDef = getWeaponDef(
        player.activeSlot === 0 ? player.primaryWeapon : "pistol"
      );
      const reloadRatio =
        1 - player.reloadTimerSec / weaponDef.reloadTimeSec;

      ctx.fillStyle = "#38bdf8";
      ctx.fillRect(barX, barY + barHeight + 2, barWidth * reloadRatio, 2);
    }

    // Nickname
    ctx.font = "10px sans-serif";
    ctx.textAlign = "center";
    ctx.fillStyle = isLocalPlayer ? "#e0f2fe" : "#fecaca";
    ctx.fillText(nickname, player.x, barY - 3);
  }

  /**
   * Draws a projectile (bullet tracer and glow)
   */
  public drawProjectile(
    ctx: CanvasRenderingContext2D,
    prj: SimProjectile
  ): void {
    if (!prj.alive) return;

    const angle = Math.atan2(prj.vy, prj.vx);
    const length = Math.min(24, prj.speed * 0.015);

    ctx.save();
    ctx.translate(prj.x, prj.y);
    ctx.rotate(angle);

    // Bullet trail / glow
    const grad = ctx.createLinearGradient(-length, 0, 0, 0);
    grad.addColorStop(0, "rgba(255, 215, 0, 0)");
    grad.addColorStop(1, "rgba(255, 240, 150, 1)");

    ctx.strokeStyle = grad;
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.moveTo(-length, 0);
    ctx.lineTo(0, 0);
    ctx.stroke();

    // Bullet head
    ctx.fillStyle = "#ffffff";
    ctx.beginPath();
    ctx.arc(0, 0, 1.8, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();
  }

  /**
   * Draws particle effects (muzzle flashes, hit sparks)
   */
  public drawEffect(ctx: CanvasRenderingContext2D, fx: VisualEffect): void {
    const alpha = fx.life / fx.maxLife;

    if (fx.type === "flash") {
      ctx.save();
      ctx.translate(fx.x, fx.y);
      if (fx.angle !== undefined) ctx.rotate(fx.angle);

      ctx.fillStyle = `rgba(255, 200, 50, ${alpha * 0.8})`;
      ctx.beginPath();
      ctx.arc(0, 0, 10 * (1 - alpha * 0.3), 0, Math.PI * 2);
      ctx.fill();

      ctx.restore();
    } else if (fx.type === "spark") {
      ctx.fillStyle = fx.color || `rgba(255, 180, 50, ${alpha})`;
      ctx.beginPath();
      ctx.arc(fx.x, fx.y, 2 * alpha, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  /**
   * Draws tactical crosshair at mouse coordinates
   */
  public drawCrosshair(
    ctx: CanvasRenderingContext2D,
    worldX: number,
    worldY: number,
    spreadRadius: number = 6
  ): void {
    ctx.save();
    ctx.translate(worldX, worldY);

    ctx.strokeStyle = "rgba(56, 189, 248, 0.85)"; // Neon cyan
    ctx.lineWidth = 1.5;

    const r = Math.max(4, spreadRadius);
    const len = 6;

    // 4 crosshair ticks
    ctx.beginPath();
    // Top
    ctx.moveTo(0, -r);
    ctx.lineTo(0, -r - len);
    // Bottom
    ctx.moveTo(0, r);
    ctx.lineTo(0, r + len);
    // Left
    ctx.moveTo(-r, 0);
    ctx.lineTo(-r - len, 0);
    // Right
    ctx.moveTo(r, 0);
    ctx.lineTo(r + len, 0);
    ctx.stroke();

    // Center dot
    ctx.fillStyle = "rgba(56, 189, 248, 0.9)";
    ctx.beginPath();
    ctx.arc(0, 0, 1.5, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();
  }
}
