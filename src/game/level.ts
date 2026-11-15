import { BLOCK, CELL, CELLS, type Dir, DOWN, LEFT, TILES, UP } from './constants'

export const EMPTY = 0
export const BRICK = 1
export const STEEL = 2
export const WATER = 3
export const FOREST = 4
export const ICE = 5
export type Terrain = 0 | 1 | 2 | 3 | 4 | 5

const B = BRICK
const S = STEEL
const _ = EMPTY

/** Tile code -> [top-left, top-right, bottom-left, bottom-right] 8px blocks. */
export const TILE_CODES: Record<string, readonly Terrain[]> = {
  '.': [_, _, _, _],
  '#': [B, B, B, B],
  '[': [B, _, B, _],
  ']': [_, B, _, B],
  '^': [B, B, _, _],
  '_': [_, _, B, B],
  '@': [S, S, S, S],
  '(': [S, _, S, _],
  ')': [_, S, _, S],
  n: [S, S, _, _],
  u: [_, _, S, S],
  w: [WATER, WATER, WATER, WATER],
  f: [FOREST, FOREST, FOREST, FOREST],
  i: [ICE, ICE, ICE, ICE],
}

/** The 14 construction-mode patterns, in the order the cursor cycles through them. */
export const CONSTRUCTION_PATTERNS = [']', '_', '[', '^', '#', ')', 'u', '(', 'n', '@', 'w', 'f', 'i', '.'] as const

/** 8px blocks that make up the wall around the eagle. */
export const BASE_WALL_BLOCKS: readonly (readonly [number, number])[] = [
  [11, 23], [11, 24], [11, 25], [12, 23], [13, 23], [14, 23], [14, 24], [14, 25],
]

/** Tiles that must stay clear: enemy spawns, player spawns, and the base surroundings. */
export const RESERVED_TILES: readonly (readonly [number, number])[] = [
  [0, 0], [6, 0], [12, 0], [4, 12], [8, 12], [5, 11], [6, 11], [7, 11], [5, 12], [6, 12], [7, 12],
]

export type HitResult = 'none' | 'brick' | 'steel'

export class Level {
  readonly cells: Uint8Array
  /** Bumped on every change so renderers can cache the terrain. */
  version = 0

  constructor(cells?: Uint8Array) {
    this.cells = cells ? new Uint8Array(cells) : new Uint8Array(CELLS * CELLS)
  }

  static fromRows(rows: readonly string[]): Level {
    const level = new Level()
    for (let ty = 0; ty < TILES; ty++) {
      for (let tx = 0; tx < TILES; tx++) level.setTile(tx, ty, rows[ty]?.[tx] ?? '.')
    }
    for (const [tx, ty] of RESERVED_TILES) level.setTile(tx, ty, '.')
    level.setBaseWalls(BRICK)
    return level
  }

  clone(): Level {
    return new Level(this.cells)
  }

  get(cx: number, cy: number): Terrain {
    if (cx < 0 || cy < 0 || cx >= CELLS || cy >= CELLS) return STEEL
    return this.cells[cy * CELLS + cx] as Terrain
  }

  set(cx: number, cy: number, t: Terrain): void {
    if (cx < 0 || cy < 0 || cx >= CELLS || cy >= CELLS) return
    const i = cy * CELLS + cx
    if (this.cells[i] === t) return
    this.cells[i] = t
    this.version++
  }

  setBlock(bx: number, by: number, t: Terrain): void {
    for (let dy = 0; dy < 2; dy++) for (let dx = 0; dx < 2; dx++) this.set(bx * 2 + dx, by * 2 + dy, t)
  }

  setTile(tx: number, ty: number, code: string): void {
    const blocks = TILE_CODES[code] ?? TILE_CODES['.']
    blocks.forEach((t, i) => this.setBlock(tx * 2 + (i % 2), ty * 2 + (i >> 1), t))
  }

  /** Best-effort reverse of setTile, used by the construction editor. */
  tileCode(tx: number, ty: number): string {
    const blockAt = (i: number) => this.get((tx * 2 + (i % 2)) * 2, (ty * 2 + (i >> 1)) * 2)
    const blocks = [0, 1, 2, 3].map(blockAt)
    for (const [code, pattern] of Object.entries(TILE_CODES)) {
      if (pattern.every((t, i) => t === blocks[i])) return code
    }
    return '#'
  }

  toRows(): string[] {
    const rows: string[] = []
    for (let ty = 0; ty < TILES; ty++) {
      let row = ''
      for (let tx = 0; tx < TILES; tx++) row += this.tileCode(tx, ty)
      rows.push(row)
    }
    return rows
  }

  setBaseWalls(t: Terrain): void {
    for (const [bx, by] of BASE_WALL_BLOCKS) this.setBlock(bx, by, t)
  }

  private cellRange(x: number, y: number, w: number, h: number) {
    return {
      c0: Math.floor(x / CELL),
      c1: Math.floor((x + w - 1) / CELL),
      r0: Math.floor(y / CELL),
      r1: Math.floor((y + h - 1) / CELL),
    }
  }

  /** True if a tank-sized rect overlaps brick, steel, water or the field edge. */
  blocksTank(x: number, y: number, w: number, h: number): boolean {
    const { c0, c1, r0, r1 } = this.cellRange(x, y, w, h)
    for (let r = r0; r <= r1; r++) {
      for (let c = c0; c <= c1; c++) {
        const t = this.get(c, r)
        if (t === BRICK || t === STEEL || t === WATER) return true
      }
    }
    return false
  }

  /** True if the centre of the rect sits on ice. */
  onIce(x: number, y: number, w: number, h: number): boolean {
    return this.get(Math.floor((x + w / 2) / CELL), Math.floor((y + h / 2) / CELL)) === ICE
  }

  /**
   * Tests a bullet (4x4, centred on cx/cy) against walls and knocks out a 16px-wide strip
   * in front of it: 4px deep normally, 8px deep (and through steel) for a power bullet.
   */
  bulletHit(cx: number, cy: number, dir: Dir, power: boolean): HitResult {
    const { c0, c1, r0, r1 } = this.cellRange(cx - 2, cy - 2, 4, 4)
    let hitSomething = false
    for (let r = r0; r <= r1; r++) {
      for (let c = c0; c <= c1; c++) {
        const t = this.get(c, r)
        if (t === BRICK || t === STEEL) hitSomething = true
      }
    }
    if (!hitSomething) return 'none'

    const depth = power ? 2 : 1
    const strip: [number, number][] = []
    if (dir === UP || dir === DOWN) {
      const front = dir === UP ? r0 : r1
      const step = dir === UP ? -1 : 1
      const first = Math.floor((cx - BLOCK) / CELL)
      for (let d = 0; d < depth; d++) for (let c = first; c < first + 4; c++) strip.push([c, front + d * step])
    } else {
      const front = dir === LEFT ? c0 : c1
      const step = dir === LEFT ? -1 : 1
      const first = Math.floor((cy - BLOCK) / CELL)
      for (let d = 0; d < depth; d++) for (let r = first; r < first + 4; r++) strip.push([front + d * step, r])
    }

    let brokeBrick = false
    let touchedSteel = false
    for (const [c, r] of strip) {
      if (c < 0 || r < 0 || c >= CELLS || r >= CELLS) continue
      const t = this.get(c, r)
      if (t === BRICK) {
        this.set(c, r, EMPTY)
        brokeBrick = true
      } else if (t === STEEL) {
        touchedSteel = true
        if (power) this.set(c, r, EMPTY)
      }
    }
    return touchedSteel && !brokeBrick ? 'steel' : 'brick'
  }
}

