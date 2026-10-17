import { InputCmd, SnapshotMsg, GameEvent } from "@veylcore/shared";
import { NetworkClient, SnapshotListener, EventListener } from "./networkClient";

export class LatencySimulator implements NetworkClient {
  private inner: NetworkClient;
  private addedLatencyMs = 0; // Simulated one-way latency (half of added RTT)
  private jitterMs = 0;
  private isFrozen = false;

  private snapshotListeners: Set<SnapshotListener> = new Set();
  private eventListeners: Set<EventListener> = new Set();

  constructor(inner: NetworkClient) {
    this.inner = inner;

    // Intercept snapshots from inner connection and delay delivery
    this.inner.onSnapshot((snap) => {
      this.scheduleDelivery(() => {
        for (const l of this.snapshotListeners) l(snap);
      });
    });

    this.inner.onEvent((ev) => {
      this.scheduleDelivery(() => {
        for (const l of this.eventListeners) l(ev);
      });
    });
  }

  public setLatency(rttMs: number, jitterMs: number = 0): void {
    this.addedLatencyMs = Math.max(0, rttMs / 2);
    this.jitterMs = Math.max(0, jitterMs);
  }

  public getAddedRtt(): number {
    return this.addedLatencyMs * 2;
  }

  public getJitter(): number {
    return this.jitterMs;
  }

  /**
   * Freezes packet transmission for specified milliseconds (simulates TCP head-of-line blocking / freeze)
   */
  public triggerFreeze(durationMs: number = 1000): void {
    this.isFrozen = true;
    setTimeout(() => {
      this.isFrozen = false;
    }, durationMs);
  }

  private scheduleDelivery(callback: () => void): void {
    if (this.addedLatencyMs === 0 && this.jitterMs === 0 && !this.isFrozen) {
      callback();
      return;
    }

    const jitter = (Math.random() * 2 - 1) * this.jitterMs;
    const delay = Math.max(0, this.addedLatencyMs + jitter);

    setTimeout(() => {
      if (this.isFrozen) {
        // Delay delivery until unfreezes
        const checkInterval = setInterval(() => {
          if (!this.isFrozen) {
            clearInterval(checkInterval);
            callback();
          }
        }, 50);
      } else {
        callback();
      }
    }, delay);
  }

  // NetworkClient pass-throughs
  public async connect(roomCode: string, playerName: string): Promise<void> {
    return this.inner.connect(roomCode, playerName);
  }

  public disconnect(): void {
    this.inner.disconnect();
  }

  public sendInput(cmd: InputCmd): void {
    this.scheduleDelivery(() => {
      this.inner.sendInput(cmd);
    });
  }

  public onSnapshot(listener: SnapshotListener): () => void {
    this.snapshotListeners.add(listener);
    return () => this.snapshotListeners.delete(listener);
  }

  public onEvent(listener: EventListener): () => void {
    this.eventListeners.add(listener);
    return () => this.eventListeners.delete(listener);
  }

  public isConnected(): boolean {
    return this.inner.isConnected();
  }

  public getPing(): number {
    return this.inner.getPing() + Math.round(this.addedLatencyMs * 2);
  }
}
