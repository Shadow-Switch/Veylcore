import {
  FIXED_DELTA,
  MapQuery,
  stepPlayerMovement,
  SimPlayer,
  InputCmd,
  YouState,
  getWeaponDef,
  WeaponId,
} from "@veylcore/shared";

export class Predictor {
  private player: SimPlayer;
  private pendingInputs: InputCmd[] = [];

  // Visual error smoothing (decaying offset)
  private errorX = 0;
  private errorY = 0;
  private reconcileCount = 0;
  private lastReconcileErrorDist = 0;

  constructor(initialPlayer: SimPlayer) {
    this.player = { ...initialPlayer };
  }

  public getPlayer(): SimPlayer {
    return this.player;
  }

  public getPendingCount(): number {
    return this.pendingInputs.length;
  }

  public getReconcileCount(): number {
    return this.reconcileCount;
  }

  public getLastReconcileError(): number {
    return this.lastReconcileErrorDist;
  }

  /**
   * Called on 30Hz client fixed step:
   * Predicts player movement immediately for local client and saves input to pending list.
   */
  public predictStep(cmd: InputCmd, map: MapQuery): void {
    this.pendingInputs.push(cmd);

    // Apply movement immediately
    this.player.aimAngle = cmd.a;
    this.player.activeSlot = cmd.w;

    const moveRes = stepPlayerMovement(
      this.player,
      cmd.mx,
      cmd.my,
      map,
      FIXED_DELTA
    );
    this.player.x = moveRes.x;
    this.player.y = moveRes.y;
    this.player.vx = moveRes.vx;
    this.player.vy = moveRes.vy;
  }

  /**
   * Called when server snapshot arrives:
   * 1. Discards inputs up to ack
   * 2. Resets baseline position to youState from server
   * 3. Re-simulates all remaining pending inputs
   * 4. Updates visual error smoothing offset (snap if > 64u, smooth decay if < 64u)
   */
  public reconcile(you: YouState, ack: number, map: MapQuery): void {
    // 1. Discard acknowledged inputs
    this.pendingInputs = this.pendingInputs.filter((cmd) => cmd.s > ack);

    // Record previous predicted position before re-simulation
    const prevPredictedX = this.player.x;
    const prevPredictedY = this.player.y;

    // 2. Reset state to server authoritative snapshot
    this.player.x = you.x;
    this.player.y = you.y;
    this.player.hp = you.hp;
    this.player.isDead = you.st === "dead";
    this.player.activeSlot = you.w;

    if (you.pri) {
      this.player.primaryWeapon = you.pri.id;
      this.player.primaryMag = you.pri.mag;
      this.player.primaryReserve = you.pri.res;
    }
    if (you.sec) {
      this.player.secondaryMag = you.sec.mag;
    }

    // 3. Re-simulate remaining unacknowledged pending inputs
    for (const cmd of this.pendingInputs) {
      this.player.aimAngle = cmd.a;
      this.player.activeSlot = cmd.w;
      const res = stepPlayerMovement(
        this.player,
        cmd.mx,
        cmd.my,
        map,
        FIXED_DELTA
      );
      this.player.x = res.x;
      this.player.y = res.y;
      this.player.vx = res.vx;
      this.player.vy = res.vy;
    }

    // 4. Calculate error difference between old predicted position and new re-simulated position
    const diffX = prevPredictedX - this.player.x;
    const diffY = prevPredictedY - this.player.y;
    const errorDist = Math.sqrt(diffX * diffX + diffY * diffY);
    this.lastReconcileErrorDist = errorDist;

    // Snap if error is large (> 64u), otherwise accumulate into smooth decay offset
    if (errorDist > 64.0) {
      this.errorX = 0;
      this.errorY = 0;
      this.reconcileCount++;
    } else if (errorDist > 0.05) {
      this.errorX = diffX;
      this.errorY = diffY;
      this.reconcileCount++;
    } else {
      this.errorX = 0;
      this.errorY = 0;
    }
  }

  /**
   * Called every render frame to smoothly decay visual error over ~100ms
   */
  public updateVisualSmoothing(dt: number): void {
    // Exponential decay towards 0 (half-life approx 30ms, decays within 100ms)
    const decayFactor = Math.exp(-dt * 20);
    this.errorX *= decayFactor;
    this.errorY *= decayFactor;

    if (Math.abs(this.errorX) < 0.01) this.errorX = 0;
    if (Math.abs(this.errorY) < 0.01) this.errorY = 0;
  }

  /**
   * Returns visual smoothed render coordinates (simulation position + decaying error offset)
   */
  public getVisualPosition(): { x: number; y: number } {
    return {
      x: this.player.x + this.errorX,
      y: this.player.y + this.errorY,
    };
  }
}
