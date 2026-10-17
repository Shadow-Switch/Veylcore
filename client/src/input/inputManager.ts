import { ButtonBits, InputCmd } from "@veylcore/shared";

export class InputManager {
  private seq = 0;
  private keysDown: Set<string> = new Set();
  private mouseButtons: Set<number> = new Set();

  // Edge triggers (consumed once on sample)
  private reloadPressed = false;
  private equipPressed = false;
  private pickupPressed = false;
  private activeSlot: 0 | 1 = 0; // 0 = primary (k2), 1 = secondary (pistol)

  // Screen mouse coordinates
  private screenMouseX = 0;
  private screenMouseY = 0;

  // World mouse coordinates computed via camera
  private worldMouseX = 0;
  private worldMouseY = 0;

  private targetElement: HTMLElement | Window = window;

  constructor() {
    this.bindEvents();
  }

  public setTargetElement(el: HTMLElement): void {
    this.targetElement = el;
  }

  private bindEvents(): void {
    window.addEventListener("keydown", (e) => {
      // Prevent browser defaults for game keys (Tab, Space, etc.)
      if (["Tab", "KeyR", "Digit1", "Digit2"].includes(e.code)) {
        e.preventDefault();
      }
      this.keysDown.add(e.code);

      if (e.code === "KeyR" && !e.repeat) {
        this.reloadPressed = true;
      }
      if (e.code === "KeyG" && !e.repeat) {
        this.equipPressed = true;
      }
      if (e.code === "KeyF" && !e.repeat) {
        this.pickupPressed = true;
      }
      if (e.code === "Digit1") {
        this.activeSlot = 0;
      }
      if (e.code === "Digit2") {
        this.activeSlot = 1;
      }
    });

    window.addEventListener("keyup", (e) => {
      this.keysDown.delete(e.code);
    });

    window.addEventListener("mousemove", (e) => {
      this.screenMouseX = e.clientX;
      this.screenMouseY = e.clientY;
    });

    window.addEventListener("mousedown", (e) => {
      this.mouseButtons.add(e.button);
    });

    window.addEventListener("mouseup", (e) => {
      this.mouseButtons.delete(e.button);
    });

    window.addEventListener("wheel", (e) => {
      // Mouse wheel weapon switch
      if (e.deltaY !== 0) {
        this.activeSlot = this.activeSlot === 0 ? 1 : 0;
      }
    });

    // Prevent context menu on right click (used for AWP zoom)
    window.addEventListener("contextmenu", (e) => {
      e.preventDefault();
    });
  }

  public updateWorldMouse(worldX: number, worldY: number): void {
    this.worldMouseX = worldX;
    this.worldMouseY = worldY;
  }

  public getScreenMouse(): { x: number; y: number } {
    return { x: this.screenMouseX, y: this.screenMouseY };
  }

  public isKeyDown(code: string): boolean {
    return this.keysDown.has(code);
  }

  public getActiveSlot(): 0 | 1 {
    return this.activeSlot;
  }

  public setActiveSlot(slot: 0 | 1): void {
    this.activeSlot = slot;
  }

  /**
   * Samples current inputs and generates an InputCmd.
   * Player position (playerX, playerY) is needed to compute aim angle and distance.
   */
  public sampleCommand(playerX: number, playerY: number): InputCmd {
    this.seq++;

    // Calculate movement vector from WASD / Arrows
    let mx = 0;
    let my = 0;

    if (this.keysDown.has("KeyW") || this.keysDown.has("ArrowUp")) my -= 1;
    if (this.keysDown.has("KeyS") || this.keysDown.has("ArrowDown")) my += 1;
    if (this.keysDown.has("KeyA") || this.keysDown.has("ArrowLeft")) mx -= 1;
    if (this.keysDown.has("KeyD") || this.keysDown.has("ArrowRight")) mx += 1;

    // Aim calculation: 0 = +x, clockwise angle in radians
    const dx = this.worldMouseX - playerX;
    const dy = this.worldMouseY - playerY;
    const aimAngle = Math.atan2(dy, dx);
    const aimDist = Math.min(2000, Math.sqrt(dx * dx + dy * dy));

    // Button bitmask
    let buttons = 0;
    if (this.mouseButtons.has(0)) {
      buttons |= ButtonBits.FIRE; // Left click
    }
    if (this.mouseButtons.has(2)) {
      buttons |= ButtonBits.ZOOM; // Right click
    }
    if (this.reloadPressed) {
      buttons |= ButtonBits.RELOAD;
      this.reloadPressed = false;
    }
    if (this.equipPressed) {
      buttons |= ButtonBits.EQUIP;
      this.equipPressed = false;
    }
    if (this.pickupPressed) {
      buttons |= ButtonBits.PICKUP;
      this.pickupPressed = false;
    }

    return {
      s: this.seq,
      mx,
      my,
      a: Number(aimAngle.toFixed(2)),
      d: Math.round(aimDist),
      b: buttons,
      w: this.activeSlot,
    };
  }
}
