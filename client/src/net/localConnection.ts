import {
  InputCmd,
  SnapshotMsg,
  GameEvent,
  MapQuery,
  defaultMap,
} from "@veylcore/shared";
import { NetworkClient, SnapshotListener, EventListener } from "./networkClient";
import { LocalGameServer } from "../game/localGameServer";

export class LocalConnection implements NetworkClient {
  private server: LocalGameServer;
  private connected = false;
  private snapshotListeners: Set<SnapshotListener> = new Set();
  private eventListeners: Set<EventListener> = new Set();

  constructor(server?: LocalGameServer) {
    this.server = server || new LocalGameServer(new MapQuery(defaultMap));
  }

  public getServer(): LocalGameServer {
    return this.server;
  }

  public async connect(_roomCode: string, _playerName: string): Promise<void> {
    this.connected = true;
  }

  public disconnect(): void {
    this.connected = false;
  }

  public sendInput(cmd: InputCmd): void {
    if (!this.connected) return;
    this.server.step(cmd);
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
    return 0; // Local offline ping is 0ms
  }
}
