import {
  InputCmd,
  SnapshotMsg,
  GameEvent,
  JsonCodec,
  PROTOCOL_VERSION,
} from "@veylcore/shared";
import { NetworkClient, SnapshotListener, EventListener } from "./networkClient";

export class WsConnection implements NetworkClient {
  private ws: WebSocket | null = null;
  private connected = false;
  private snapshotListeners: Set<SnapshotListener> = new Set();
  private eventListeners: Set<EventListener> = new Set();
  private ping = 0;
  private myEid: number | null = null;
  private myPid: string | null = null;

  public async connect(roomCode: string, playerName: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const isSecure = window.location.protocol === "https:";
      const wsProtocol = isSecure ? "wss:" : "ws:";
      const host = window.location.host;
      const wsUrl = `${wsProtocol}//${host}/ws/${roomCode || "room1"}`;

      const socket = new WebSocket(wsUrl);
      this.ws = socket;

      const timeoutId = setTimeout(() => {
        if (!this.connected) {
          socket.close();
          reject(new Error("Connection timeout to " + wsUrl));
        }
      }, 7000);

      socket.addEventListener("open", () => {
        // Send hello immediately upon open
        socket.send(
          JsonCodec.encode("hello", {
            proto: PROTOCOL_VERSION,
            name: playerName,
          })
        );
      });

      socket.addEventListener("message", (event) => {
        const raw = typeof event.data === "string" ? event.data : "";
        const decoded = JsonCodec.decode(raw);
        if (!decoded.ok || !decoded.data) return;

        const { t, d } = decoded.data;

        if (t === "welcome") {
          const w = d as { you: string; lastSeq: number };
          this.myPid = w.you;
          this.connected = true;
          clearTimeout(timeoutId);
          resolve();
          return;
        }

        if (t === "start") {
          const s = d as { you: number };
          this.myEid = s.you;
          return;
        }

        if (t === "snap") {
          const snap = d as SnapshotMsg;
          for (const listener of this.snapshotListeners) {
            listener(snap);
          }
          if (Array.isArray(snap.ev)) {
            for (const ev of snap.ev) {
              for (const evListener of this.eventListeners) {
                evListener(ev);
              }
            }
          }
          return;
        }

        if (t === "err") {
          console.warn("[WS Server Error]", d);
        }
      });

      socket.addEventListener("close", (e) => {
        this.connected = false;
        console.log(`[WS Closed] code=${e.code}, reason=${e.reason}`);
      });

      socket.addEventListener("error", (err) => {
        this.connected = false;
        clearTimeout(timeoutId);
        reject(err);
      });
    });
  }

  public disconnect(): void {
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    this.connected = false;
  }

  public sendInput(cmd: InputCmd): void {
    if (!this.connected || !this.ws || this.ws.readyState !== WebSocket.OPEN) {
      return;
    }
    this.ws.send(JsonCodec.encode("in", { c: [cmd] }));
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
    return this.connected;
  }

  public getPing(): number {
    return this.ping;
  }

  public getMyEid(): number | null {
    return this.myEid;
  }
}
