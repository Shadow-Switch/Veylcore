import { MAP_TILES_X, MAP_TILES_Y, TILE_SIZE } from "../constants";
import { MapData, TileType, SpawnPoint, ItemSpawnPoint } from "./types";

function generateDefaultMapTiles(): number[] {
  const width = MAP_TILES_X; // 64
  const height = MAP_TILES_Y; // 40
  const tiles: number[] = new Array(width * height).fill(TileType.EMPTY);

  const setTile = (tx: number, ty: number, val: number) => {
    if (tx >= 0 && tx < width && ty >= 0 && ty < height) {
      tiles[ty * width + tx] = val;
    }
  };

  const drawRect = (x: number, y: number, w: number, h: number, fill = true) => {
    for (let dy = 0; dy < h; dy++) {
      for (let dx = 0; dx < w; dx++) {
        if (fill || dx === 0 || dx === w - 1 || dy === 0 || dy === h - 1) {
          setTile(x + dx, y + dy, TileType.WALL);
        }
      }
    }
  };

  // 1. Boundary walls
  for (let x = 0; x < width; x++) {
    setTile(x, 0, TileType.WALL);
    setTile(x, height - 1, TileType.WALL);
  }
  for (let y = 0; y < height; y++) {
    setTile(0, y, TileType.WALL);
    setTile(width - 1, y, TileType.WALL);
  }

  // 2. Central arena structures & obstacles
  // Center courtyard pillar cluster
  drawRect(30, 18, 4, 4, true);

  // Center flanking walls
  drawRect(24, 14, 2, 12, true);
  drawRect(38, 14, 2, 12, true);

  // Top and bottom corridors / rooms
  drawRect(12, 6, 10, 2, true);
  drawRect(42, 6, 10, 2, true);
  drawRect(12, 32, 10, 2, true);
  drawRect(42, 32, 10, 2, true);

  // Left wing rooms
  drawRect(8, 12, 2, 8, true);
  drawRect(8, 20, 8, 2, true);

  // Right wing rooms
  drawRect(54, 12, 2, 8, true);
  drawRect(48, 20, 8, 2, true);

  // Additional tactical cover blocks (2x2 pillars)
  const pillars: [number, number][] = [
    [16, 12],
    [16, 26],
    [46, 12],
    [46, 26],
    [28, 8],
    [34, 8],
    [28, 30],
    [34, 30],
  ];

  for (const [px, py] of pillars) {
    drawRect(px, py, 2, 2, true);
  }

  return tiles;
}

// 14 distinct spawn points across the map (GAME_DESIGN.md requires >= 12)
const defaultSpawnPoints: SpawnPoint[] = [
  { x: 4 * TILE_SIZE + 16, y: 4 * TILE_SIZE + 16 },
  { x: 60 * TILE_SIZE - 16, y: 4 * TILE_SIZE + 16 },
  { x: 4 * TILE_SIZE + 16, y: 36 * TILE_SIZE - 16 },
  { x: 60 * TILE_SIZE - 16, y: 36 * TILE_SIZE - 16 },
  { x: 20 * TILE_SIZE, y: 10 * TILE_SIZE },
  { x: 44 * TILE_SIZE, y: 10 * TILE_SIZE },
  { x: 20 * TILE_SIZE, y: 30 * TILE_SIZE },
  { x: 44 * TILE_SIZE, y: 30 * TILE_SIZE },
  { x: 12 * TILE_SIZE, y: 20 * TILE_SIZE },
  { x: 52 * TILE_SIZE, y: 20 * TILE_SIZE },
  { x: 32 * TILE_SIZE, y: 12 * TILE_SIZE },
  { x: 32 * TILE_SIZE, y: 28 * TILE_SIZE },
  { x: 22 * TILE_SIZE, y: 20 * TILE_SIZE },
  { x: 42 * TILE_SIZE, y: 20 * TILE_SIZE },
];

const defaultItemSpawns: ItemSpawnPoint[] = [
  {
    id: "sp-k2-1",
    x: 32 * TILE_SIZE,
    y: 8 * TILE_SIZE,
    itemType: "weapon",
    itemId: "k2",
    respawnTimeSec: 20,
  },
  {
    id: "sp-k2-2",
    x: 32 * TILE_SIZE,
    y: 32 * TILE_SIZE,
    itemType: "weapon",
    itemId: "k2",
    respawnTimeSec: 20,
  },
  {
    id: "sp-hp-1",
    x: 12 * TILE_SIZE,
    y: 10 * TILE_SIZE,
    itemType: "health",
    itemId: "health_pack",
    respawnTimeSec: 25,
  },
  {
    id: "sp-hp-2",
    x: 52 * TILE_SIZE,
    y: 10 * TILE_SIZE,
    itemType: "health",
    itemId: "health_pack",
    respawnTimeSec: 25,
  },
];

export const defaultMap: MapData = {
  id: "arena_default",
  name: "Facility Arena",
  widthTiles: MAP_TILES_X,
  heightTiles: MAP_TILES_Y,
  tileSize: TILE_SIZE,
  tiles: generateDefaultMapTiles(),
  spawnPoints: defaultSpawnPoints,
  itemSpawns: defaultItemSpawns,
};
