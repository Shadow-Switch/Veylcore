import { VIEW_WIDTH, VIEW_HEIGHT, MAP_WIDTH, MAP_HEIGHT } from "@veylcore/shared";

export class Camera {
  public x = VIEW_WIDTH / 2;
  public y = VIEW_HEIGHT / 2;

  public screenWidth = window.innerWidth;
  public screenHeight = window.innerHeight;
  public scale = 1.0;
  public offsetX = 0;
  public offsetY = 0;

  constructor() {
    this.updateViewport(window.innerWidth, window.innerHeight);
  }

  public updateViewport(screenWidth: number, screenHeight: number): void {
    this.screenWidth = screenWidth;
    this.screenHeight = screenHeight;

    // Scale to fit fixed 1280x720 world view inside actual window maintaining aspect ratio
    const scaleX = screenWidth / VIEW_WIDTH;
    const scaleY = screenHeight / VIEW_HEIGHT;
    this.scale = Math.min(scaleX, scaleY);

    // Center the 1280x720 frame inside the screen (letterbox / pillarbox)
    this.offsetX = (screenWidth - VIEW_WIDTH * this.scale) / 2;
    this.offsetY = (screenHeight - VIEW_HEIGHT * this.scale) / 2;
  }

  /**
   * Focuses camera on target (e.g. player position) with clamping to map boundaries
   */
  public follow(targetX: number, targetY: number): void {
    const halfViewW = VIEW_WIDTH / 2;
    const halfViewH = VIEW_HEIGHT / 2;

    let cx = targetX;
    let cy = targetY;

    // If map is larger than view, clamp camera to prevent showing outside the map
    if (MAP_WIDTH >= VIEW_WIDTH) {
      cx = Math.max(halfViewW, Math.min(MAP_WIDTH - halfViewW, cx));
    } else {
      cx = MAP_WIDTH / 2;
    }

    if (MAP_HEIGHT >= VIEW_HEIGHT) {
      cy = Math.max(halfViewH, Math.min(MAP_HEIGHT - halfViewH, cy));
    } else {
      cy = MAP_HEIGHT / 2;
    }

    this.x = cx;
    this.y = cy;
  }

  /**
   * Transforms screen (mouse event) coordinates to in-game world coordinates
   */
  public screenToWorld(screenX: number, screenY: number): { x: number; y: number } {
    const viewX = (screenX - this.offsetX) / this.scale;
    const viewY = (screenY - this.offsetY) / this.scale;

    const worldX = viewX + (this.x - VIEW_WIDTH / 2);
    const worldY = viewY + (this.y - VIEW_HEIGHT / 2);

    return { x: worldX, y: worldY };
  }

  /**
   * Transforms in-game world coordinates to screen pixel coordinates
   */
  public worldToScreen(worldX: number, worldY: number): { x: number; y: number } {
    const viewX = worldX - (this.x - VIEW_WIDTH / 2);
    const viewY = worldY - (this.y - VIEW_HEIGHT / 2);

    const screenX = viewX * this.scale + this.offsetX;
    const screenY = viewY * this.scale + this.offsetY;

    return { x: screenX, y: screenY };
  }

  /**
   * Applies the camera matrix to the 2D canvas context
   */
  public applyTransform(ctx: CanvasRenderingContext2D): void {
    ctx.setTransform(1, 0, 0, 1, 0, 0); // Reset
    ctx.translate(this.offsetX, this.offsetY);
    ctx.scale(this.scale, this.scale);
    ctx.translate(-(this.x - VIEW_WIDTH / 2), -(this.y - VIEW_HEIGHT / 2));
  }
}
