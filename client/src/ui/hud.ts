import { SimPlayer, getWeaponDef } from "@veylcore/shared";

export class GameHud {
  private container: HTMLElement;
  private hpValueEl!: HTMLElement;
  private hpFillEl!: HTMLElement;
  private primarySlotEl!: HTMLElement;
  private secondarySlotEl!: HTMLElement;
  private primaryAmmoEl!: HTMLElement;
  private secondaryAmmoEl!: HTMLElement;
  private reloadProgressEl!: HTMLElement;
  private reloadBarEl!: HTMLElement;
  private debugStatsEl!: HTMLElement;

  constructor(container: HTMLElement) {
    this.container = container;
    this.createElements();
  }

  private createElements(): void {
    this.container.innerHTML = `
      <div class="hud-top-left">
        <div class="hud-badge">OFFLINE PRACTICE</div>
        <div id="debug-stats" class="hud-debug-text">FPS: 60 | Sim: 30Hz | Ping: 0ms</div>
      </div>

      <div class="hud-top-right">
        <div class="hud-controls-hint">
          <span><kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd> 이동</span>
          <span><kbd>L-Click</kbd> 사격</span>
          <span><kbd>R</kbd> 재장전</span>
          <span><kbd>1</kbd>/<kbd>2</kbd> 무기 전환</span>
          <span><kbd>Esc</kbd> 메뉴</span>
        </div>
      </div>

      <div id="reload-indicator" class="hud-reload-container" style="display: none;">
        <div class="hud-reload-text">RELOADING...</div>
        <div class="hud-reload-bar-bg">
          <div id="reload-bar-fill" class="hud-reload-bar-fill"></div>
        </div>
      </div>

      <div class="hud-bottom-left">
        <div class="hud-hp-box">
          <div class="hud-hp-label">HEALTH</div>
          <div class="hud-hp-bar-bg">
            <div id="hp-bar-fill" class="hud-hp-bar-fill"></div>
          </div>
          <div id="hp-value" class="hud-hp-number">100</div>
        </div>
      </div>

      <div class="hud-bottom-right">
        <div class="hud-weapons-container">
          <div id="slot-primary" class="hud-weapon-slot active">
            <div class="slot-number">1</div>
            <div class="slot-name">K2 RIFLE</div>
            <div id="primary-ammo" class="slot-ammo">30 / 90</div>
          </div>
          <div id="slot-secondary" class="hud-weapon-slot">
            <div class="slot-number">2</div>
            <div class="slot-name">PISTOL</div>
            <div id="secondary-ammo" class="slot-ammo">12 / &infin;</div>
          </div>
        </div>
      </div>
    `;

    this.hpValueEl = document.getElementById("hp-value")!;
    this.hpFillEl = document.getElementById("hp-bar-fill")!;
    this.primarySlotEl = document.getElementById("slot-primary")!;
    this.secondarySlotEl = document.getElementById("slot-secondary")!;
    this.primaryAmmoEl = document.getElementById("primary-ammo")!;
    this.secondaryAmmoEl = document.getElementById("secondary-ammo")!;
    this.reloadProgressEl = document.getElementById("reload-indicator")!;
    this.reloadBarEl = document.getElementById("reload-bar-fill")!;
    this.debugStatsEl = document.getElementById("debug-stats")!;
  }

  public update(player: SimPlayer, fps: number): void {
    // 1. Health
    const hpClamped = Math.max(0, Math.min(100, Math.round(player.hp)));
    this.hpValueEl.textContent = `${hpClamped}`;
    this.hpFillEl.style.width = `${hpClamped}%`;

    if (hpClamped > 50) {
      this.hpFillEl.style.backgroundColor = "#22c55e";
    } else if (hpClamped > 25) {
      this.hpFillEl.style.backgroundColor = "#eab308";
    } else {
      this.hpFillEl.style.backgroundColor = "#ef4444";
    }

    // 2. Active Weapon Slot
    if (player.activeSlot === 0) {
      this.primarySlotEl.classList.add("active");
      this.secondarySlotEl.classList.remove("active");
    } else {
      this.primarySlotEl.classList.remove("active");
      this.secondarySlotEl.classList.add("active");
    }

    // 3. Ammo
    this.primaryAmmoEl.textContent = `${player.primaryMag} / ${player.primaryReserve}`;
    this.secondaryAmmoEl.innerHTML = `${player.secondaryMag} / &infin;`;

    // 4. Reload progress
    if (player.reloadTimerSec > 0) {
      const weaponDef = getWeaponDef(
        player.activeSlot === 0 ? player.primaryWeapon : "pistol"
      );
      const ratio = 1 - player.reloadTimerSec / weaponDef.reloadTimeSec;
      this.reloadProgressEl.style.display = "block";
      this.reloadBarEl.style.width = `${Math.round(ratio * 100)}%`;
    } else {
      this.reloadProgressEl.style.display = "none";
    }

    // 5. Debug stats
    this.debugStatsEl.textContent = `FPS: ${fps} | Sim: 30Hz Fixed | Ping: 0ms`;
  }

  public setVisible(visible: boolean): void {
    this.container.style.display = visible ? "block" : "none";
  }
}
