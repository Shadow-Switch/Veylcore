/**
 * Veylcore shared constants
 * Values match GAME_DESIGN.md, ARCHITECTURE.md, and NETWORK_PROTOCOL.md
 */

export const PROTOCOL_VERSION = 1;

// Simulation & Timing
export const TICK_RATE = 30; // 30Hz server & client fixed simulation
export const FIXED_DELTA = 1 / TICK_RATE; // ~0.033333s
export const SNAP_RATE = 15; // 15Hz snapshot (every 2 ticks)

// World & Viewport
export const TILE_SIZE = 32; // 32u x 32u
export const MAP_TILES_X = 64; // 64 tiles wide
export const MAP_TILES_Y = 40; // 40 tiles high
export const MAP_WIDTH = MAP_TILES_X * TILE_SIZE; // 2048u
export const MAP_HEIGHT = MAP_TILES_Y * TILE_SIZE; // 1280u

export const VIEW_WIDTH = 1280; // Fixed world viewport width
export const VIEW_HEIGHT = 720; // Fixed world viewport height

// Player & Combat
export const PLAYER_RADIUS = 14; // Circle radius 14u
export const PLAYER_BASE_SPEED = 220; // 220 u/s
export const PLAYER_MAX_HP = 100;
export const RESPAWN_DELAY_SEC = 3.0; // 3s after death
export const SPAWN_PROTECTION_SEC = 1.5; // 1.5s invulnerability
export const SELF_DAMAGE_RATIO = 0.5; // 50% damage to self from explosions/burns/gas

// Network & Match
export const MAX_PLAYERS = 8;
export const MAX_MESSAGE_SIZE_BYTES = 1024;
export const MAX_MESSAGES_PER_SEC = 60;
export const MAX_LAG_COMPENSATION_MS = 100;
