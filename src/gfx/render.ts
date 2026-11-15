import { CELL, CELLS, EAGLE_X, EAGLE_Y, FIELD, FIELD_X, FIELD_Y, SCREEN_H, SCREEN_W } from '../game/constants'
import { BRICK, FOREST, ICE, type Level, STEEL, WATER } from '../game/level'
import { ARMOR, type EnemyType } from '../game/rules'
import type { Enemy, World } from '../game/world'
import { drawText, drawTextCentered } from './font'
import {
  bigExplosion, brickTexture, eagleSprite, enemyIcon, flagIcon, forestTexture, iceTexture, lifeIcon,
  type PaletteName, powerupSprite, shieldSprite, smallExplosion, sparkleSprite, steelTexture, tankSprite,
  type TankKind, waterTexture,
} from './sprites'

export const COLORS = {
  grey: '#636363',
  black: '#000000',
  white: '#fcfcfc',
  red: '#d82800',
  orange: '#fc9838',
  yellow: '#e8a800',
}

const ENEMY_KINDS: readonly TankKind[] = ['basic', 'fast', 'power', 'armor']

interface LayerCache {
  canvas: HTMLCanvasElement
  level: Level | null
  version: number
  water: number
}

function makeLayer(): LayerCache {
  const canvas = document.createElement('canvas')
  canvas.width = FIELD
  canvas.height = FIELD
  return { canvas, level: null, version: -1, water: -1 }
}

const ground = makeLayer()
const canopy = makeLayer()

function textureFor(t: number, water: number): HTMLCanvasElement | null {
  switch (t) {
    case BRICK: return brickTexture()
    case STEEL: return steelTexture()
    case WATER: return waterTexture(water)
    case ICE: return iceTexture()
    case FOREST: return forestTexture()
    default: return null
  }
}

function paintLayer(layer: LayerCache, level: Level, water: number, forest: boolean): HTMLCanvasElement {
  if (layer.level === level && layer.version === level.version && layer.water === water) return layer.canvas
  const ctx = layer.canvas.getContext('2d')!
  ctx.clearRect(0, 0, FIELD, FIELD)
  for (let cy = 0; cy < CELLS; cy++) {
    for (let cx = 0; cx < CELLS; cx++) {
      const t = level.get(cx, cy)
      if ((t === FOREST) !== forest) continue
      const tex = textureFor(t, water)
      if (!tex) continue
      const sx = (cx % 2) * CELL
      const sy = (cy % 2) * CELL
      ctx.drawImage(tex, sx, sy, CELL, CELL, cx * CELL, cy * CELL, CELL, CELL)
    }
  }
  layer.level = level
  layer.version = level.version
  layer.water = water
  return layer.canvas
}

export function drawGround(ctx: CanvasRenderingContext2D, level: Level, frame: number): void {
  ctx.fillStyle = COLORS.black
  ctx.fillRect(FIELD_X, FIELD_Y, FIELD, FIELD)
  ctx.drawImage(paintLayer(ground, level, (frame >> 5) & 1, false), FIELD_X, FIELD_Y)
}

export function drawCanopy(ctx: CanvasRenderingContext2D, level: Level): void {
  ctx.drawImage(paintLayer(canopy, level, 0, true), FIELD_X, FIELD_Y)
}

function enemyPalette(e: Enemy, frame: number): PaletteName {
  if (e.bonus && (frame >> 3) % 2 === 0) return 'red'
  if (e.type === ARMOR) return e.hp >= 4 ? 'armor4' : e.hp === 3 ? 'armor3' : e.hp === 2 ? 'armor2' : 'silver'
  return 'silver'
}

function sparkleFrame(left: number): number {
  const seq = [0, 1, 2, 3, 2, 1]
  return seq[(left >> 2) % seq.length]
}

export function drawSidebar(ctx: CanvasRenderingContext2D, world: World): void {
  const x = FIELD_X + FIELD + 8
  const icon = enemyIcon()
  for (let i = 0; i < world.enemiesLeft; i++) {
    ctx.drawImage(icon, x + (i % 2) * 8, FIELD_Y + Math.floor(i / 2) * 8)
  }
  world.players.forEach((p, i) => {
    const y = 136 + i * 24
    drawText(ctx, i === 0 ? 'IP' : 'IIP', x - 1, y, COLORS.black)
    ctx.drawImage(lifeIcon(), x, y + 8)
    drawText(ctx, String(Math.min(p.lives, 9)), x + 7, y + 8, COLORS.black)
  })
  ctx.drawImage(flagIcon(), x, 184)
  drawText(ctx, String(world.stage).padStart(2, ' '), x, 196, COLORS.black)
}

export interface DrawOptions {
  paused?: boolean
}

export function drawWorld(ctx: CanvasRenderingContext2D, world: World, opts: DrawOptions = {}): void {
  const frame = world.frame
  ctx.fillStyle = COLORS.grey
  ctx.fillRect(0, 0, SCREEN_W, SCREEN_H)
  drawGround(ctx, world.level, frame)

  const ox = FIELD_X
  const oy = FIELD_Y
  ctx.drawImage(eagleSprite(world.eagleAlive), ox + EAGLE_X, oy + EAGLE_Y)

  for (const p of world.players) {
    const t = p.tank
    if (!t) continue
    if (t.spawning > 0) {
      ctx.drawImage(sparkleSprite(sparkleFrame(t.spawning)), ox + t.x, oy + t.y)
      continue
    }
    if (t.paralyzed > 0 && (frame >> 3) % 2 === 0) continue
    const kind = `p${p.stars}` as TankKind
    ctx.drawImage(tankSprite(kind, p.index === 0 ? 'yellow' : 'green', (t.animTick >> 2) & 1, t.dir), ox + t.x, oy + t.y)
    if (t.shield > 0) ctx.drawImage(shieldSprite((frame >> 1) & 1), ox + t.x, oy + t.y)
  }
  for (const e of world.enemies) {
    if (e.spawning > 0) {
      ctx.drawImage(sparkleSprite(sparkleFrame(e.spawning)), ox + e.x, oy + e.y)
      continue
    }
    const anim = world.freezeTimer > 0 ? 0 : (e.animTick >> 2) & 1
    ctx.drawImage(tankSprite(ENEMY_KINDS[e.type as EnemyType], enemyPalette(e, frame), anim, e.dir), ox + e.x, oy + e.y)
  }

  ctx.fillStyle = '#bcbcbc'
  for (const b of world.bullets) {
    const vertical = b.dir % 2 === 0
    ctx.fillRect(Math.round(ox + b.x - (vertical ? 1 : 2)), Math.round(oy + b.y - (vertical ? 2 : 1)), vertical ? 3 : 4, vertical ? 4 : 3)
  }

  drawCanopy(ctx, world.level)

  const pu = world.powerup
  if (pu && (pu.age >> 3) % 2 === 0) ctx.drawImage(powerupSprite(pu.kind), ox + pu.x, oy + pu.y)

  for (const fx of world.effects) {
    if (fx.delay > 0) continue
    const x = ox + fx.x
    const y = oy + fx.y
    if (fx.kind === 'small') {
      ctx.drawImage(smallExplosion(Math.min(2, fx.t >> 2)), x - 8, y - 8)
    } else if (fx.kind === 'big') {
      if (fx.t < 12) ctx.drawImage(smallExplosion(fx.t >> 2), x - 8, y - 8)
      else ctx.drawImage(bigExplosion(fx.t < 20 ? 0 : 1), x - 16, y - 16)
    } else if (fx.kind === 'points') {
      drawTextCentered(ctx, String(fx.value), x, y - 4, COLORS.white)
    } else if (fx.kind === 'banner') {
      const rise = Math.min(fx.t, 60)
      drawTextCentered(ctx, 'GAME', x, y - rise * 0.5, COLORS.red)
      drawTextCentered(ctx, 'OVER', x, y + 8 - rise * 0.5, COLORS.red)
    }
  }

  if (world.phase === 'over') {
    const t = Math.min(world.phaseTimer, 120) / 120
    const y = Math.round(oy + FIELD - t * (FIELD / 2 + 8))
    drawTextCentered(ctx, 'GAME', ox + FIELD / 2, y, COLORS.red)
    drawTextCentered(ctx, 'OVER', ox + FIELD / 2, y + 9, COLORS.red)
  }

  if (opts.paused && (Math.floor(performance.now() / 400) % 2 === 0)) {
    drawTextCentered(ctx, 'PAUSE', ox + FIELD / 2, oy + FIELD / 2 - 4, COLORS.red)
  }

  drawSidebar(ctx, world)
}

/** Big title letters built from brick texture, one 4x4 brick cell per font pixel. */
export function drawBrickText(ctx: CanvasRenderingContext2D, text: string, cx: number, y: number, pixels: (ch: string) => boolean[][]): void {
  const tex = brickTexture()
  const px = 4
  const width = text.length * 6 * px - px
  let x = Math.round(cx - width / 2)
  for (const ch of text) {
    const g = pixels(ch)
    g.forEach((row, r) => row.forEach((on, c) => {
      if (on) ctx.drawImage(tex, ((c + r) % 2) * 4, (r % 2) * 4, 4, 4, x + c * px, y + r * px, px, px)
    }))
    x += 6 * px
  }
}
