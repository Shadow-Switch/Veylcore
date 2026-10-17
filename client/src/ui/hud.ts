import { SimPlayer, getWeaponDef } from "@veylcore/shared";

export interface NetGraphData {
  rtt: number;
  jitter: number;
  interpDelayMs: number;
  interpDelayTicks: number;
  reconcileCount: number;
  lastError: number;
}

export interface HudCallbacks {
  onSetSimulatedLatency?: (rtt: number, jitter: number) => void;
  onTriggerFreeze?: () => void;
}

export class GameHud {
  private container: HTMLElement;
  private callbacks?: HudCallbacks;

  private badgeEl!: HTMLElement;
  private hpValueEl!: HTMLElement;
  private hpFillEl!: HTMLElement;
  private primarySlotEl!: HTMLElement;
  private secondarySlotEl!: HTMLElement;
  private primaryAmmoEl!: HTMLElement;
  private secondaryAmmoEl!: HTMLElement;
  private reloadProgressEl!: HTMLElement;
  private reloadBarEl!: HTMLElement;
  private debugStatsEl!: HTMLElement;
  private netGraphBoxEl!: HTMLElement;
  private netGraphTextEl!: HTMLElement;

  constructor(container: HTMLElement, callbacks?: HudCallbacks) {
    this.container = container;
    this.callbacks = callbacks;
    this.createElements();
  }

  private createElements(): void {
    this.container.innerHTML = `
      <div class="hud-top-left">
        <div id="hud-mode-badge" class="hud-badge">ONLINE MULTIPLAYER (P3 NETCODE)</div>
        <div id="debug-stats" class="hud-debug-text">FPS: 60 | Sim: 30Hz | Ping: 0ms</div>
      </div>

      <div class="hud-top-right">
        <div class="hud-controls-hint">
          <span><kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd> 이동</span>
          <span><kbd>L-Click</kbd> 즉시 사격 (예측)</span>
          <span><kbd>R</kbd> 재장전</span>
          <span><kbd>1</kbd>/<kbd>2</kbd> 무기 전환</span>
          <span><kbd>Esc</kbd> 메뉴</span>
        </div>

        <!-- Net Graph & Latency Simulator Bar (P3 Testing) -->
        <div id="net-graph-container" class="hud-netgraph-box">
          <div class="netgraph-header">
            <span class="netgraph-title">NET GRAPH (P3)</span>
            <span id="netgraph-summary" class="netgraph-summary">RTT: 0ms &bull; Interp: 133ms</span>
          </div>
          <div id="netgraph-details" class="netgraph-details">
            Reconciles: 0 &bull; Error: 0.0u &bull; InterpDelay: 4 ticks
          </div>
          <div class="net-sim-buttons">
            <button class="sim-btn active" data-rtt="0" data-jitter="0">0ms</button>
            <button class="sim-btn" data-rtt="50" data-jitter="5">50ms</button>
            <button class="sim-btn" data-rtt="100" data-jitter="15">100ms</button>
            <button class="sim-btn" data-rtt="150" data-jitter="30">150ms</button>
            <button class="sim-btn" data-rtt="200" data-jitter="30">200ms</button>
            <button id="btn-freeze" class="sim-btn freeze-btn">Freeze 1s</button>
          </div>
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

    this.badgeEl = document.getElementById("hud-mode-badge")!;
    this.hpValueEl = document.getElementById("hp-value")!;
    this.hpFillEl = document.getElementById("hp-bar-fill")!;
    this.primarySlotEl = document.getElementById("slot-primary")!;
    this.secondarySlotEl = document.getElementById("slot-secondary")!;
    this.primaryAmmoEl = document.getElementById("primary-ammo")!;
    this.secondaryAmmoEl = document.getElementById("secondary-ammo")!;
    this.reloadProgressEl = document.getElementById("reload-indicator")!;
    this.reloadBarEl = document.getElementById("reload-bar-fill")!;
    this.debugStatsEl = document.getElementById("debug-stats")!;
    this.netGraphBoxEl = document.getElementById("net-graph-container")!;
    this.netGraphTextEl = document.getElementById("netgraph-details")!;

    // Bind latency simulation buttons
    const simButtons = this.container.querySelectorAll(".sim-btn[data-rtt]");
    simButtons.forEach((btn) => {
      btn.addEventListener("click", () => {
        simButtons.forEach((b) => b.classList.remove("active"));
        btn.classList.add("active");
        const rtt = parseInt(btn.getAttribute("data-rtt") || "0", 10);
        const jitter = parseInt(btn.getAttribute("data-jitter") || "0", 10);
        this.callbacks?.onSetSimulatedLatency?.(rtt, jitter);
      });
    });

    document.getElementById("btn-freeze")?.addEventListener("click", () => {
      this.callbacks?.onTriggerFreeze?.();
    });
  }

  public setMode(isOnline: boolean): void {
    if (isOnline) {
      this.badgeEl.textContent = "ONLINE MULTIPLAYER (P3 NETCODE)";
      this.netGraphBoxEl.style.display = "flex";
    } else {
      this.badgeEl.textContent = "OFFLINE PRACTICE (P1)";
      this.netGraphBoxEl.style.display = "none";
    }
  }

  public update(player: SimPlayer, fps: number, net?: NetGraphData): void {
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
    const ping = net ? net.rtt : 0;
    this.debugStatsEl.textContent = `FPS: ${fps} | Sim: 30Hz Fixed | Ping: ${ping}ms`;

    // 6. Net Graph details (P3)
    if (net) {
      const summaryEl = document.getElementById("netgraph-summary");
      if (summaryEl) {
        summaryEl.textContent = `RTT: ${net.rtt}ms (Jitter: ±${net.jitter}ms)`;
      }
      this.netGraphTextEl.textContent = `Reconciles: ${net.reconcileCount} | Last Error: ${net.lastError.toFixed(2)}u | Interp: ${net.interpDelayMs}ms (${net.interpDelayTicks} ticks)`;
    }
  }

  public setVisible(visible: boolean): void {
    this.container.style.display = visible ? "block" : "none";
  }
}
