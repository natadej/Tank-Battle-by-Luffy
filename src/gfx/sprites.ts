import type { Dir } from '../game/constants'

/** Three-shade palette: light, mid, dark. */
export type Palette = readonly [string, string, string]

export const PALETTES = {
  yellow: ['#fce4a0', '#e8a800', '#885000'],
  green: ['#b8f8b8', '#00a800', '#005800'],
  silver: ['#ffffff', '#adadad', '#5c5c5c'],
  red: ['#fcb0a0', '#e83800', '#881400'],
  armor4: ['#d8f878', '#58a800', '#305800'],
  armor3: ['#fce4a0', '#c88400', '#704000'],
  armor2: ['#e0f0ff', '#88a8c8', '#405060'],
} as const satisfies Record<string, Palette>
export type PaletteName = keyof typeof PALETTES

export type TankKind = 'p0' | 'p1' | 'p2' | 'p3' | 'basic' | 'fast' | 'power' | 'armor'

type Grid = string[][]

function blank(n = 16): Grid {
  return Array.from({ length: n }, () => Array<string>(n).fill('.'))
}

interface TankShape {
  tread: [number, number, number, number]
  rows: [number, number]
  hull: [number, number, number, number]
  turretR: number
  turretY: number
  barrelTop: number
  barrelW: number
}

const SHAPES: Record<TankKind, TankShape> = {
  p0: { tread: [1, 3, 12, 14], rows: [3, 15], hull: [4, 11, 5, 14], turretR: 3, turretY: 9.5, barrelTop: 1, barrelW: 2 },
  p1: { tread: [1, 3, 12, 14], rows: [2, 15], hull: [4, 11, 4, 14], turretR: 3, turretY: 9, barrelTop: 0, barrelW: 2 },
  p2: { tread: [1, 3, 12, 14], rows: [2, 15], hull: [4, 11, 4, 15], turretR: 3.6, turretY: 9, barrelTop: 0, barrelW: 2 },
  p3: { tread: [0, 2, 13, 15], rows: [1, 15], hull: [3, 12, 3, 15], turretR: 4, turretY: 9, barrelTop: 0, barrelW: 4 },
  basic: { tread: [1, 3, 12, 14], rows: [3, 14], hull: [4, 11, 5, 13], turretR: 3, turretY: 9.5, barrelTop: 3, barrelW: 2 },
  fast: { tread: [2, 3, 12, 13], rows: [1, 15], hull: [5, 10, 3, 14], turretR: 2.4, turretY: 10, barrelTop: 2, barrelW: 2 },
  power: { tread: [1, 3, 12, 14], rows: [2, 15], hull: [4, 11, 4, 14], turretR: 3, turretY: 9.5, barrelTop: 0, barrelW: 4 },
  armor: { tread: [0, 2, 13, 15], rows: [1, 15], hull: [3, 12, 3, 15], turretR: 4.2, turretY: 9, barrelTop: 1, barrelW: 2 },
}

function tankGrid(kind: TankKind, frame: number): Grid {
  const s = SHAPES[kind]
  const g = blank()
  const [l0, l1, r0, r1] = s.tread
  for (let y = s.rows[0]; y <= s.rows[1]; y++) {
    const stripe = (y + frame) % 2 === 0
    for (const [a, b] of [[l0, l1], [r0, r1]]) {
      for (let x = a; x <= b; x++) {
        if (x === a) g[y][x] = '2'
        else if (x === b) g[y][x] = '3'
        else g[y][x] = stripe ? '3' : '1'
      }
    }
  }
  const [hx0, hx1, hy0, hy1] = s.hull
  for (let y = hy0; y <= hy1; y++) {
    for (let x = hx0; x <= hx1; x++) {
      g[y][x] = y === hy0 || x === hx0 ? '1' : y === hy1 || x === hx1 ? '3' : '2'
    }
  }
  if (kind === 'armor' || kind === 'p3') {
    for (let y = hy0 + 2; y <= hy1 - 1; y += 3) {
      g[y][hx0 + 1] = '3'
      g[y][hx1 - 1] = '3'
    }
  }
  if (kind === 'fast') {
    g[hy0][hx0] = '.'
    g[hy0][hx1] = '.'
  }
  const cx = 7.5
  for (let y = 0; y < 16; y++) {
    for (let x = 0; x < 16; x++) {
      const d = Math.hypot(x - cx, y - s.turretY)
      if (d <= s.turretR) g[y][x] = d > s.turretR - 1 && (x > cx || y > s.turretY) ? '3' : '1'
    }
  }
  const bx0 = 8 - s.barrelW / 2
  for (let y = s.barrelTop; y < s.turretY - 1; y++) {
    for (let x = bx0; x < bx0 + s.barrelW; x++) g[y][x] = x < 8 ? '1' : '2'
  }
  if (kind === 'power') for (let x = 6; x <= 9; x++) g[s.barrelTop][x] = '3'
  return g
}

function rotate(g: Grid, dir: Dir): Grid {
  let out = g
  for (let i = 0; i < dir; i++) {
    const n = out.length
    const r = blank(n)
    for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) r[x][n - 1 - y] = out[y][x]
    out = r
  }
  return out
}

function gridCanvas(g: Grid, colors: Record<string, string>): HTMLCanvasElement {
  const c = document.createElement('canvas')
  c.width = g[0].length
  c.height = g.length
  const ctx = c.getContext('2d')!
  g.forEach((row, y) => row.forEach((ch, x) => {
    const col = colors[ch]
    if (!col) return
    ctx.fillStyle = col
    ctx.fillRect(x, y, 1, 1)
  }))
  return c
}

function parse(rows: readonly string[]): Grid {
  return rows.map(r => r.split(''))
}

const cache = new Map<string, HTMLCanvasElement>()
function cached(key: string, make: () => HTMLCanvasElement): HTMLCanvasElement {
  let c = cache.get(key)
  if (!c) {
    c = make()
    cache.set(key, c)
  }
  return c
}

export function tankSprite(kind: TankKind, palette: PaletteName, frame: number, dir: Dir): HTMLCanvasElement {
  return cached(`t:${kind}:${palette}:${frame}:${dir}`, () => {
    const [l, m, d] = PALETTES[palette]
    return gridCanvas(rotate(tankGrid(kind, frame), dir), { 1: l, 2: m, 3: d })
  })
}

const GREYS = { 1: '#fcfcfc', 2: '#a0a0a0', 3: '#505050', 4: '#d82800' }

const EAGLE = [
  '................',
  '.......33.......',
  '......3113......',
  '.3...312213...3.',
  '.23..311113..32.',
  '.223..3113..322.',
  '.2223.3223.3222.',
  '..222322223222..',
  '...2222222222...',
  '....22222222....',
  '.....222222.....',
  '....22.22.22....',
  '...22..22..22...',
  '.......22.......',
  '.....333333.....',
  '....33333333....',
]
const EAGLE_DEAD = [
  '................',
  '................',
  '................',
  '.....3....3.....',
  '..3...3..3...3..',
  '...3..2332..3...',
  '....3222223.3...',
  '.33.22222222.33.',
  '..322222222223..',
  '.32222232222223.',
  '3222232223222223',
  '.32223222322223.',
  '..322222222223..',
  '....22222222....',
  '.....333333.....',
  '....33333333....',
]

export function eagleSprite(alive: boolean): HTMLCanvasElement {
  return cached(`eagle:${alive}`, () => gridCanvas(parse(alive ? EAGLE : EAGLE_DEAD), GREYS))
}

const POWERUPS: Record<string, readonly string[]> = {
  helmet: [
    '................',
    '................',
    '.....111111.....',
    '...1111111111...',
    '..111222222111..',
    '..112222222211..',
    '.11122222222111.',
    '.11122222222111.',
    '.11111111111111.',
    '.11.........211.',
    '.11.........211.',
    '.111.......2111.',
    '..1111111111111.',
    '................',
    '................',
    '................',
  ],
  timer: [
    '......1111......',
    '.......11.......',
    '.....111111.....',
    '...1122222211...',
    '..112222222211..',
    '..122222122221..',
    '.11222221222211.',
    '.12222221222221.',
    '.12222221111221.',
    '.12222222222221.',
    '.11222222222211.',
    '..122222222221..',
    '..112222222211..',
    '...1122222211...',
    '.....111111.....',
    '................',
  ],
  shovel: [
    '................',
    '..........111...',
    '.........1..1...',
    '..........111...',
    '..........1.....',
    '.........1......',
    '........1.......',
    '...111.1........',
    '..122211........',
    '.1222221........',
    '.1222221........',
    '.12222221.......',
    '.1222221........',
    '..12221.........',
    '...111..........',
    '................',
  ],
  star: [
    '.......11.......',
    '.......11.......',
    '......1221......',
    '......1221......',
    '.111111221111111',
    '..112222222211..',
    '...1122222211...',
    '....12222221....',
    '....12222221....',
    '...1222112221...',
    '...122111.1221..',
    '..1221.....1221.',
    '..11.........11.',
    '................',
    '................',
    '................',
  ],
  grenade: [
    '.........11.....',
    '.......11..1....',
    '......111...1...',
    '.....11111......',
    '....1222221.....',
    '...122121221....',
    '..12221212221...',
    '..12121212121...',
    '..12221212221...',
    '..12121212121...',
    '..12221212221...',
    '...122121221....',
    '....1222221.....',
    '.....11111......',
    '................',
    '................',
  ],
  tank: [
    '................',
    '.......11.......',
    '.......11.......',
    '.111..1111..111.',
    '.121.122221.121.',
    '.111.122221.111.',
    '.121112222111121',
    '.111122112211111',
    '.121122112211121',
    '.111122222211111',
    '.121.122221.121.',
    '.111.111111.111.',
    '.121........121.',
    '.111........111.',
    '................',
    '................',
  ],
}

export function powerupSprite(kind: string): HTMLCanvasElement {
  return cached(`pu:${kind}`, () => {
    const c = gridCanvas(parse(POWERUPS[kind]), { 1: '#fcfcfc', 2: '#3c50ff' })
    return c
  })
}

/** 8x8 textures; each 4x4 terrain cell draws the matching quadrant. */
const BRICK_TEX = ['11111131', '22222232', '22222232', '33333333', '11311111', '22322222', '22322222', '33333333']
const STEEL_TEX = ['11111112', '12222223', '12111223', '12122223', '12122223', '12222223', '13333333', '23333333']
const WATER_TEX = [
  ['22222222', '21122222', '12211222', '22222222', '22222211', '22221122', '22222222', '22222222'],
  ['22222222', '22222112', '22221221', '22222222', '11222222', '22112222', '22222222', '22222222'],
]
const FOREST_TEX = ['.1221.2.', '12232212', '22332321', '.2223.22', '2.122332', '23222132', '2233.122', '.22.122.']
const ICE_TEX = ['11222222', '12222223', '22222232', '22222322', '22223222', '22232222', '22322222', '23222222']

export function brickTexture(): HTMLCanvasElement {
  return cached('tex:brick', () => gridCanvas(parse(BRICK_TEX), { 1: '#e07030', 2: '#a84a10', 3: '#7c7c7c' }))
}
export function steelTexture(): HTMLCanvasElement {
  return cached('tex:steel', () => gridCanvas(parse(STEEL_TEX), { 1: '#fcfcfc', 2: '#bcbcbc', 3: '#7c7c7c' }))
}
export function waterTexture(frame: number): HTMLCanvasElement {
  return cached(`tex:water:${frame}`, () => gridCanvas(parse(WATER_TEX[frame]), { 1: '#a4e4fc', 2: '#2038ec' }))
}
export function forestTexture(): HTMLCanvasElement {
  return cached('tex:forest', () => gridCanvas(parse(FOREST_TEX), { 1: '#b8f818', 2: '#00a800', 3: '#005800' }))
}
export function iceTexture(): HTMLCanvasElement {
  return cached('tex:ice', () => gridCanvas(parse(ICE_TEX), { 1: '#fcfcfc', 2: '#bcbcbc', 3: '#e4e4e4' }))
}

function radialSprite(size: number, rings: readonly [number, string][], seed: number): HTMLCanvasElement {
  const c = document.createElement('canvas')
  c.width = size
  c.height = size
  const ctx = c.getContext('2d')!
  const mid = (size - 1) / 2
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const ang = Math.atan2(y - mid, x - mid)
      const wobble = 1 + 0.22 * Math.sin(ang * 5 + seed) + 0.12 * Math.sin(ang * 9 + seed * 2)
      const d = Math.hypot(x - mid, y - mid) / wobble
      const ring = rings.find(([r]) => d <= r)
      if (!ring) continue
      ctx.fillStyle = ring[1]
      ctx.fillRect(x, y, 1, 1)
    }
  }
  return c
}

const FIRE = { white: '#fcfcfc', red: '#d82800', purple: '#6844fc' }

export function smallExplosion(frame: number): HTMLCanvasElement {
  return cached(`sx:${frame}`, () => {
    const r = [3, 5, 7][frame]
    return radialSprite(16, [[r * 0.4, FIRE.white], [r * 0.7, FIRE.red], [r, FIRE.purple]], frame + 1)
  })
}

export function bigExplosion(frame: number): HTMLCanvasElement {
  return cached(`bx:${frame}`, () => {
    const r = [10, 15][frame]
    return radialSprite(32, [[r * 0.35, FIRE.white], [r * 0.7, FIRE.red], [r, FIRE.purple]], frame + 4)
  })
}

export function sparkleSprite(frame: number): HTMLCanvasElement {
  return cached(`sp:${frame}`, () => {
    const c = document.createElement('canvas')
    c.width = 16
    c.height = 16
    const ctx = c.getContext('2d')!
    const r = [2, 4, 6, 7][frame]
    ctx.fillStyle = '#fcfcfc'
    ctx.fillRect(7, 8 - r, 2, r * 2)
    ctx.fillRect(8 - r, 7, r * 2, 2)
    ctx.fillStyle = '#a4e4fc'
    const d = Math.floor(r * 0.6)
    for (let i = 1; i <= d; i++) {
      for (const [sx, sy] of [[1, 1], [-1, 1], [1, -1], [-1, -1]]) ctx.fillRect(7.5 + sx * i, 7.5 + sy * i, 1, 1)
    }
    return c
  })
}

export function shieldSprite(frame: number): HTMLCanvasElement {
  return cached(`sh:${frame}`, () => {
    const c = document.createElement('canvas')
    c.width = 16
    c.height = 16
    const ctx = c.getContext('2d')!
    ctx.fillStyle = '#fcfcfc'
    for (let i = 0; i < 16; i++) {
      if ((i + frame * 2) % 4 < 2) continue
      ctx.fillRect(i, 0, 1, 1)
      ctx.fillRect(15 - i, 15, 1, 1)
      ctx.fillRect(0, 15 - i, 1, 1)
      ctx.fillRect(15, i, 1, 1)
    }
    for (let i = 2; i < 14; i++) {
      if ((i + frame * 3) % 5 !== 0) continue
      ctx.fillRect(i, 1, 1, 1)
      ctx.fillRect(1, i, 1, 1)
      ctx.fillRect(14, 15 - i, 1, 1)
      ctx.fillRect(15 - i, 14, 1, 1)
    }
    return c
  })
}

const ICON_ENEMY = ['..3..3..', '.3.33.3.', '.333333.', '.3.33.3.', '.333333.', '.3.33.3.', '........', '........']
const ICON_LIFE = ['...2....', '.2.22.2.', '.222222.', '.2.22.2.', '.222222.', '.2....2.', '........', '........']
const ICON_FLAG = [
  '.3..............',
  '.4444...........',
  '.4444444........',
  '.44444444444....',
  '.44444444.......',
  '.44444..........',
  '.3..............',
  '.3..............',
  '.3..............',
  '33..............',
]

export function enemyIcon(): HTMLCanvasElement {
  return cached('icon:enemy', () => gridCanvas(parse(ICON_ENEMY), { 3: '#000000' }))
}
export function lifeIcon(): HTMLCanvasElement {
  return cached('icon:life', () => gridCanvas(parse(ICON_LIFE), { 2: '#e8a800' }))
}
export function flagIcon(): HTMLCanvasElement {
  return cached('icon:flag', () => gridCanvas(parse(ICON_FLAG), { 3: '#000000', 4: '#e8a800' }))
}
