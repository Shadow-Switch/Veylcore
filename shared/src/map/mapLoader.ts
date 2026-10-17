import { MapData, TileType } from "./types";

export class MapQuery {
  private map: MapData;
  private width: number;
  private height: number;
  private tileSize: number;

  constructor(map: MapData) {
    this.map = map;
    this.width = map.widthTiles;
    this.height = map.heightTiles;
    this.tileSize = map.tileSize;
  }

  public getMapData(): MapData {
    return this.map;
  }

  public worldWidth(): number {
    return this.width * this.tileSize;
  }

  public worldHeight(): number {
    return this.height * this.tileSize;
  }

  public worldToTile(wx: number, wy: number): { tx: number; ty: number } {
    return {
      tx: Math.floor(wx / this.tileSize),
      ty: Math.floor(wy / this.tileSize),
    };
  }

  public getTile(tx: number, ty: number): number {
    if (tx < 0 || tx >= this.width || ty < 0 || ty >= this.height) {
      return TileType.WALL; // Out of bounds treated as solid wall
    }
    return this.map.tiles[ty * this.width + tx];
  }

  public isWall(tx: number, ty: number): boolean {
    return this.getTile(tx, ty) === TileType.WALL;
  }

  public isWallAtWorld(wx: number, wy: number): boolean {
    const { tx, ty } = this.worldToTile(wx, wy);
    return this.isWall(tx, ty);
  }

  /**
   * Get all solid tile AABB bounding boxes overlapping a world rectangle
   */
  public getOverlappingWallBoxes(
    minX: number,
    minY: number,
    maxX: number,
    maxY: number
  ): Array<{ minX: number; minY: number; maxX: number; maxY: number }> {
    const minTx = Math.max(0, Math.floor(minX / this.tileSize));
    const maxTx = Math.min(this.width - 1, Math.floor(maxX / this.tileSize));
    const minTy = Math.max(0, Math.floor(minY / this.tileSize));
    const maxTy = Math.min(this.height - 1, Math.floor(maxY / this.tileSize));

    const boxes: Array<{ minX: number; minY: number; maxX: number; maxY: number }> = [];

    for (let ty = minTy; ty <= maxTy; ty++) {
      for (let tx = minTx; tx <= maxTx; tx++) {
        if (this.isWall(tx, ty)) {
          boxes.push({
            minX: tx * this.tileSize,
            minY: ty * this.tileSize,
            maxX: (tx + 1) * this.tileSize,
            maxY: (ty + 1) * this.tileSize,
          });
        }
      }
    }

    return boxes;
  }
}

/**
 * Simple 32-bit FNV-1a hash of map tile array and dimensions
 */
export function computeMapHash(map: MapData): string {
  let h = 0x811c9dc5;
  const str = `${map.id}:${map.widthTiles}x${map.heightTiles}:${map.tiles.length}`;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  for (let i = 0; i < map.tiles.length; i += 16) {
    h ^= map.tiles[i];
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16);
}
