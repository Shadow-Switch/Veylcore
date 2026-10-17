import { InputCmd, SnapshotMsg, GameEvent } from "@veylcore/shared";

export type SnapshotListener = (snap: SnapshotMsg) => void;
export type EventListener = (event: GameEvent) => void;

export interface NetworkClient {
  connect(roomCode: string, playerName: string): Promise<void>;
  disconnect(): void;
  sendInput(cmd: InputCmd): void;
  onSnapshot(listener: SnapshotListener): () => void;
  onEvent(listener: EventListener): () => void;
  isConnected(): boolean;
  getPing(): number;
}
