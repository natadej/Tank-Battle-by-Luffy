export const TILE = 16
export const BLOCK = 8
export const CELL = 4
export const TILES = 13
export const FIELD = TILES * TILE
export const CELLS = FIELD / CELL

export const SCREEN_W = 256
export const SCREEN_H = 240
export const FIELD_X = 16
export const FIELD_Y = 16

export type Dir = 0 | 1 | 2 | 3
export const UP: Dir = 0
export const RIGHT: Dir = 1
export const DOWN: Dir = 2
export const LEFT: Dir = 3
export const DX = [0, 1, 0, -1] as const
export const DY = [-1, 0, 1, 0] as const

export const EAGLE_X = 6 * TILE
export const EAGLE_Y = 12 * TILE
export const PLAYER_SPAWNS = [
  { x: 4 * TILE, y: 12 * TILE },
  { x: 8 * TILE, y: 12 * TILE },
] as const
/** Enemy spawn order cycles centre, right, left. */
export const ENEMY_SPAWNS = [
  { x: 6 * TILE, y: 0 },
  { x: 12 * TILE, y: 0 },
  { x: 0, y: 0 },
] as const
