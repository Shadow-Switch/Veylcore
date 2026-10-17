/**
 * Map types and interfaces
 */

export const TileType = {
  EMPTY: 0,
  WALL: 1,
} as const;

export type TileTypeValue = (typeof TileType)[keyof typeof TileType];

export interface SpawnPoint {
  x: number;
  y: number;
}

export interface ItemSpawnPoint {
  id: string;
  x: number;
  y: number;
  itemType: "weapon" | "health";
  itemId: string;
  respawnTimeSec: number;
}

export interface MapData {
  id: string;
  name: string;
  widthTiles: number;
  heightTiles: number;
  tileSize: number;
  /** Row-major 1D array of size widthTiles * heightTiles */
  tiles: number[];
  spawnPoints: SpawnPoint[];
  itemSpawns?: ItemSpawnPoint[];
}
