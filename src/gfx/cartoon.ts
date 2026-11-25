import { EAGLE_X, EAGLE_Y, FIELD, FIELD_X, FIELD_Y, UP, type Dir } from '../game/constants'
import { BRICK, FOREST, ICE, STEEL, WATER, type Level } from '../game/level'
import { rankTitle, type RankEntry } from '../game/rules'
import type { Player, World } from '../game/world'

const INK = '#253c36'
const CREAM = '#fff6dd'
const GREEN = '#315b48'
const GOLD = '#f8c451'
const RED = '#d86c49'
type Ctx = CanvasRenderingContext2D

export interface CartoonView {
  scene: string
  t: number
  menu: number
  stage: number
  stageSelectable: boolean
  hiScore: number
  lastScores: number[]
  players: Player[]
  world: World | null
  paused: boolean
  ranking: RankEntry[]
  editor: { level: Level; x: number; y: number }
  tallyKills: number[][]
  tallyCounts: number[][]
  tallyTotal: boolean
  bonusAwarded: number
  nameLetters: string[]
  namePos: number
  namePlayer: number
}

function box(ctx: Ctx, x: number, y: number, w: number, h: number, fill: string, r = 4, line = INK, width = 1): void {
  ctx.beginPath()
  ctx.roundRect(x, y, w, h, r)
  ctx.fillStyle = fill
  ctx.fill()
  if (width) { ctx.strokeStyle = line; ctx.lineWidth = width; ctx.stroke() }
}

function text(ctx: Ctx, value: string, x: number, y: number, size = 8, color = INK, align: CanvasTextAlign = 'left', weight = 800): void {
  ctx.fillStyle = color
  ctx.font = `${weight} ${size}px 'Trebuchet MS', system-ui, sans-serif`
  ctx.textAlign = align
  ctx.textBaseline = 'middle'
  ctx.fillText(value, x, y)
}

function dot(ctx: Ctx, x: number, y: number, r: number, color: string): void {
  ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fillStyle = color; ctx.fill()
}

/** Smooth vector artwork; all positions still use the original collision grid. */
export function cartoonTank(ctx: Ctx, x: number, y: number, dir: Dir = UP, color = GOLD, kind = 0, tick = 0): void {
  ctx.save()
  ctx.translate(x + 8, y + 8)
  ctx.rotate(dir * Math.PI / 2)
  ctx.globalAlpha = .2
  box(ctx, -7, -3, 15, 12, INK, 4, INK, 0)
  ctx.globalAlpha = 1
  box(ctx, -7, -5, 4, 13, '#42544c', 2)
  box(ctx, 3, -5, 4, 13, '#42544c', 2)
  for (let i = -3; i < 7; i += 3) {
    box(ctx, -6.3, i + tick % 2, 2.5, 1, '#809183', .3, INK, 0)
    box(ctx, 3.8, i + tick % 2, 2.5, 1, '#809183', .3, INK, 0)
  }
  box(ctx, -4.7, -4, 9.4, 11, color, 2.5)
  box(ctx, -3.5, -3, 6, 1.3, '#fff5c6', .6, INK, 0)
  box(ctx, -3.9 - kind * .15, -2.3, 7.8 + kind * .3, 7, color, 3, INK, 1.1)
  box(ctx, -1.5, -8, 3, 8, '#f9e1a2', .8)
  box(ctx, -2, -8, 4, 2, color, .6)
  // Two tiny viewport bolts give the tanks a friendly, animated personality.
  dot(ctx, -1.8, 2.5, .65, INK); dot(ctx, 1.8, 2.5, .65, INK)
  ctx.restore()
}

function eagle(ctx: Ctx, x: number, y: number, alive = true): void {
  box(ctx, x + .5, y + 1, 15, 14, alive ? GOLD : '#938f7c', 4)
  ctx.fillStyle = CREAM
  ctx.beginPath()
  ctx.moveTo(x + 8, y + 6); ctx.lineTo(x + 2, y + 4); ctx.lineTo(x + 4, y + 10)
  ctx.lineTo(x + 8, y + 13); ctx.lineTo(x + 12, y + 10); ctx.lineTo(x + 14, y + 4)
  ctx.closePath(); ctx.fill(); ctx.strokeStyle = INK; ctx.lineWidth = .7; ctx.stroke()
  dot(ctx, x + 8, y + 6, 2.3, CREAM); dot(ctx, x + 8.6, y + 5.7, .5, INK)
}

function background(ctx: Ctx): void {
  ctx.fillStyle = '#e8edd7'; ctx.fillRect(0, 0, 256, 240)
  for (let y = 4; y < 240; y += 9) for (let x = 4; x < 256; x += 9) dot(ctx, x, y, .45, '#cad6ba')
  box(ctx, 9, 9, 238, 222, CREAM, 10, INK, 1.3)
}

function heading(ctx: Ctx, kicker: string, title: string, sub: string): void {
  text(ctx, kicker, 128, 27, 6.3, GREEN, 'center')
  text(ctx, title, 128, 48, 23, INK, 'center', 900)
  text(ctx, sub, 128, 65, 6.3, '#657567', 'center', 600)
}

function terrain(ctx: Ctx, level: Level, canopy = false): void {
  const ox = FIELD_X, oy = FIELD_Y
  if (!canopy) {
    box(ctx, ox, oy, FIELD, FIELD, '#bacb8b', 0, INK, 0)
    ctx.strokeStyle = '#afc17f'; ctx.lineWidth = .35
    for (let n = 0; n <= FIELD; n += 16) {
      ctx.beginPath(); ctx.moveTo(ox + n, oy); ctx.lineTo(ox + n, oy + FIELD); ctx.stroke()
      ctx.beginPath(); ctx.moveTo(ox, oy + n); ctx.lineTo(ox + FIELD, oy + n); ctx.stroke()
    }
    for (let n = 0; n < 110; n++) {
      const x = ox + (n * 47 % 205), y = oy + (n * 83 % 205)
      box(ctx, x, y, 1.8, .65, '#91ab70', .2, INK, 0)
    }
  }
  // Four-pixel cells preserve partially destroyed walls, not just intact tiles.
  for (let cy = 0; cy < 52; cy++) for (let cx = 0; cx < 52; cx++) {
    const tile = level.get(cx, cy), x = ox + cx * 4, y = oy + cy * 4
    if ((tile === FOREST) !== canopy) continue
    if (tile === BRICK) {
      box(ctx, x + .15, y + .15, 3.7, 3.7, '#ca7c53', .55, '#8b5039', .45)
      box(ctx, x + .65, y + .6, 2.5, .6, '#f1ae79', .2, INK, 0)
    } else if (tile === STEEL) {
      box(ctx, x + .15, y + .15, 3.7, 3.7, '#b3c5bf', .5, '#657f78', .45)
      dot(ctx, x + 1, y + 1, .35, CREAM)
    } else if (tile === WATER) {
      box(ctx, x, y, 4, 4, '#79b9c1', 0, INK, 0)
      box(ctx, x + .4, y + 1.2, 2.8, .5, '#bde2d9', .2, INK, 0)
    } else if (tile === ICE) {
      box(ctx, x, y, 4, 4, '#d0e6df', 0, INK, 0)
      box(ctx, x + .5, y + .5, .6, 2, '#f2fff5', .1, INK, 0)
    } else if (tile === FOREST) {
      dot(ctx, x + 2, y + 2, 2.4, '#416a48'); dot(ctx, x + 1.6, y + 1.3, 1.6, '#6e9855')
    }
  }
}

function battle(ctx: Ctx, view: CartoonView): void {
  const w = view.world!
  ctx.fillStyle = '#e8edd7'; ctx.fillRect(0, 0, 256, 240)
  text(ctx, 'DEFEND THE EAGLE', 16, 8, 5.6, GREEN)
  text(ctx, `STAGE ${String(w.stage).padStart(2, '0')}`, 240, 8, 5.6, GREEN, 'right')
  terrain(ctx, w.level)
  eagle(ctx, FIELD_X + EAGLE_X, FIELD_Y + EAGLE_Y, w.eagleAlive)
  for (const p of w.players) {
    const t = p.tank
    if (!t || (t.paralyzed > 0 && (w.frame >> 3) % 2 === 0)) continue
    if (t.spawning > 0) { dot(ctx, FIELD_X + t.x + 8, FIELD_Y + t.y + 8, 6, '#fff6ba'); continue }
    cartoonTank(ctx, FIELD_X + t.x, FIELD_Y + t.y, t.dir, p.index === 0 ? GOLD : '#80bcb1', p.stars, t.animTick >> 2)
    if (t.shield > 0) {
      ctx.strokeStyle = '#fffde4'; ctx.lineWidth = .8; ctx.beginPath()
      ctx.arc(FIELD_X + t.x + 8, FIELD_Y + t.y + 8, 10, 0, Math.PI * 2); ctx.stroke()
    }
  }
  for (const e of w.enemies) {
    if (e.spawning > 0) { dot(ctx, FIELD_X + e.x + 8, FIELD_Y + e.y + 8, 5, '#fff6ba'); continue }
    const color = e.bonus ? ((w.frame >> 3) % 2 ? RED : CREAM) : ['#d98a70', '#a6cad0', '#b99bc7', '#84976c'][e.type]
    cartoonTank(ctx, FIELD_X + e.x, FIELD_Y + e.y, e.dir, color, e.type, e.animTick >> 2)
    if (e.type === 3) text(ctx, String(e.hp), FIELD_X + e.x + 8, FIELD_Y + e.y + 10, 3.5, INK, 'center')
  }
  for (const b of w.bullets) {
    dot(ctx, FIELD_X + b.x, FIELD_Y + b.y, 1.6, INK)
    dot(ctx, FIELD_X + b.x, FIELD_Y + b.y, .9, '#fff1a6')
  }
  terrain(ctx, w.level, true)
  if (w.powerup && (w.powerup.age >> 3) % 2 === 0) {
    const p = w.powerup
    box(ctx, FIELD_X + p.x, FIELD_Y + p.y, 16, 16, CREAM, 4)
    text(ctx, { helmet: 'H', timer: 'C', shovel: 'S', star: '★', grenade: 'G', tank: '+' }[p.kind], FIELD_X + p.x + 8, FIELD_Y + p.y + 8, 10, GREEN, 'center')
  }
  for (const fx of w.effects) {
    if (fx.delay > 0) continue
    const x = FIELD_X + fx.x, y = FIELD_Y + fx.y
    if (fx.kind === 'points') text(ctx, String(fx.value), x, y, 7, CREAM, 'center')
    else if (fx.kind === 'banner') text(ctx, 'GAME OVER', x, y, 12, RED, 'center')
    else { dot(ctx, x, y, fx.kind === 'big' ? 12 : 6, RED); dot(ctx, x - 1, y - 1, fx.kind === 'big' ? 8 : 4, GOLD); dot(ctx, x - 2, y - 2, 2, CREAM) }
  }
  box(ctx, 228, 16, 24, 208, CREAM, 4, '#829374', .7)
  text(ctx, 'LEFT', 240, 24, 4.7, GREEN, 'center')
  text(ctx, String(w.enemiesLeft).padStart(2, '0'), 240, 36, 13, INK, 'center')
  for (let i = 0; i < w.enemiesLeft; i++) box(ctx, 233 + i % 2 * 8, 49 + Math.floor(i / 2) * 5, 5, 3, RED, 1, INK, 0)
  w.players.forEach((p, i) => {
    text(ctx, `P${i + 1}`, 240, 119 + i * 30, 5, GREEN, 'center')
    text(ctx, `♥ ${p.lives}`, 240, 130 + i * 30, 8, RED, 'center')
  })
  eagle(ctx, 232, 183, w.eagleAlive)
  text(ctx, 'BASE', 240, 207, 4.7, GREEN, 'center')
  text(ctx, w.players.map((p, i) => `P${i + 1}  ${String(p.score).padStart(6, '0')}`).join('     '), 16, 232, 5.8, INK)
  text(ctx, 'ENTER · PAUSE', 240, 232, 4.6, GREEN, 'right')
  if (view.paused || w.phase === 'over') {
    box(ctx, 54, 99, 134, 43, CREAM, 7, INK, 1.5)
    text(ctx, view.paused ? 'TAKE A BREATHER' : 'GAME OVER', 121, 115, 12, INK, 'center')
    text(ctx, view.paused ? 'ENTER TO JUMP BACK IN' : 'THE EAGLE WILL RISE AGAIN', 121, 130, 5.5, GREEN, 'center')
  }
}

export function drawCartoon(ctx: Ctx, v: CartoonView): void {
  ctx.imageSmoothingEnabled = true
  if (v.scene === 'play' && v.world) return battle(ctx, v)
  background(ctx)
  switch (v.scene) {
    case 'title': {
      text(ctx, `BEST  ${String(v.hiScore).padStart(6, '0')}`, 128, 23, 6, GREEN, 'center')
      text(ctx, 'TANK', 128, 49, 34, INK, 'center', 900)
      text(ctx, 'CITY', 128, 77, 34, GREEN, 'center', 900)
      // Original game name, now lettered like an illustrated field manual.
      ctx.save(); ctx.translate(34, 71); ctx.rotate(-.22); ctx.scale(2.1, 2.1); cartoonTank(ctx, 0, 0, 0, GOLD); ctx.restore()
      ctx.save(); ctx.translate(189, 66); ctx.rotate(.22); ctx.scale(1.9, 1.9); cartoonTank(ctx, 0, 0, 0, '#d98a70'); ctx.restore()
      text(ctx, 'SMALL TANKS. BIG COURAGE.', 128, 100, 6.4, GREEN, 'center')
      const items = ['1 PLAYER', '2 PLAYERS', 'CONSTRUCTION', 'RANKING']
      items.forEach((label, i) => {
        const y = 116 + i * 23, active = i === v.menu
        box(ctx, 53, y + 2, 150, 19, '#d1d6b9', 5, INK, 0)
        box(ctx, 53, y, 150, 19, active ? GOLD : '#f3eedc', 5, active ? INK : '#ccd0b8', active ? 1.1 : .6)
        text(ctx, label, 128, y + 9.5, 7.3, INK, 'center')
        if (active) text(ctx, '➜', 65, y + 9.5, 9)
      })
      text(ctx, 'DEFEND THE EAGLE!', 128, 216, 6.5, RED, 'center')
      break
    }
    case 'curtain':
      heading(ctx, 'MISSION BRIEFING', `STAGE ${String(v.stage).padStart(2, '0')}`, 'A LITTLE COURAGE GOES A LONG WAY.')
      ctx.save(); ctx.translate(104, 87); ctx.scale(3, 3); eagle(ctx, 0, 0); ctx.restore()
      text(ctx, 'PROTECT YOUR BASE.', 128, 157, 10, GREEN, 'center')
      text(ctx, v.stageSelectable ? '←  →   CHOOSE STAGE' : 'YOUR NEXT ADVENTURE AWAITS', 128, 179, 7, GREEN, 'center')
      box(ctx, 69, 194, 118, 23, GOLD, 6)
      text(ctx, v.stageSelectable ? 'PRESS FIRE TO ROLL OUT' : 'ROLLING OUT…', 128, 205, 6.6, INK, 'center')
      break
    case 'construction':
      ctx.fillStyle = '#e8edd7'; ctx.fillRect(0, 0, 256, 240)
      text(ctx, 'CONSTRUCTION', 16, 8, 6, GREEN)
      terrain(ctx, v.editor.level); eagle(ctx, FIELD_X + EAGLE_X, FIELD_Y + EAGLE_Y); terrain(ctx, v.editor.level, true)
      box(ctx, FIELD_X + v.editor.x * 16, FIELD_Y + v.editor.y * 16, 16, 16, '#f8c45188', 2, INK, 1)
      text(ctx, 'BUILD', 240, 38, 5, GREEN, 'center')
      cartoonTank(ctx, 232, 53)
      text(ctx, 'YOUR', 240, 91, 5, GREEN, 'center')
      text(ctx, 'WAY', 240, 100, 5, GREEN, 'center')
      text(ctx, 'FIRE · BLOCK     START · SAVE & RETURN', 128, 232, 5.8, GREEN, 'center')
      break
    case 'ranking':
      heading(ctx, 'THE HALL OF BRAVE TANKS', 'RANKING', 'EVERY GREAT RUN STARTS WITH ONE LITTLE TANK.')
      text(ctx, 'NO.   NAME', 25, 83, 5.5, GREEN)
      text(ctx, 'SCORE / STAGE', 229, 83, 5.5, GREEN, 'right')
      if (!v.ranking.length) {
        cartoonTank(ctx, 119, 108, UP, GOLD)
        text(ctx, 'YOUR STORY STARTS HERE', 128, 151, 9, INK, 'center')
        text(ctx, 'No records yet. Go make one.', 128, 168, 6.5, GREEN, 'center', 600)
      }
      v.ranking.forEach((r, i) => {
        const y = 91 + i * 11
        box(ctx, 20, y, 216, 10, i === 0 ? '#f8d879' : i % 2 ? '#e9ecd7' : '#f4f0de', 2, INK, 0)
        text(ctx, `${String(i + 1).padStart(2, '0')}    ${r.name}`, 25, y + 5, 5.5)
        text(ctx, `${String(r.score).padStart(6, '0')} / ${String(r.stage).padStart(2, '0')}  ${rankTitle(r.score)}`, 230, y + 5, 5.3, INK, 'right')
      })
      text(ctx, 'PRESS FIRE TO RETURN', 128, 216, 6, GREEN, 'center')
      break
    case 'tally':
      heading(ctx, 'THE FIELD REPORT', `STAGE ${String(v.stage).padStart(2, '0')}`, `BEST ${v.hiScore}  ·  EVERY LITTLE VICTORY COUNTS`)
      v.players.forEach((p, i) => text(ctx, `P${i + 1}  ${p.score} PTS`, 65 + i * 126, 83, 8, GREEN, 'center'))
      for (let r = 0; r < 4; r++) {
        const y = 101 + r * 22
        box(ctx, 24, y - 8, 208, 21, '#e9ecd7', 4, INK, 0)
        cartoonTank(ctx, 119, y - 6, UP, ['#d98a70', '#a6cad0', '#b99bc7', '#84976c'][r], r)
        v.players.forEach((_, p) => {
          const n = v.tallyCounts[p]?.[r] ?? -1
          if (n >= 0) text(ctx, `${n} × ${(r + 1) * 100}`, p === 0 ? 65 : 190, y + 2, 7, INK, 'center')
        })
      }
      if (v.tallyTotal) text(ctx, `TOTAL  ${v.tallyKills.map(k => k.reduce((a, b) => a + b, 0)).join(' / ')}`, 128, 198, 9, GREEN, 'center')
      text(ctx, v.bonusAwarded >= 0 ? `P${v.bonusAwarded + 1} BONUS! +1000` : 'ONWARD, LITTLE TANK.', 128, 217, 6, RED, 'center')
      break
    case 'name': {
      const p = v.players[v.namePlayer]
      heading(ctx, 'A RUN WORTH REMEMBERING', 'NEW RECORD!', `P${v.namePlayer + 1}  ·  ${p?.score ?? 0} POINTS`)
      text(ctx, 'LEAVE YOUR CALL SIGN', 128, 99, 8, GREEN, 'center')
      v.nameLetters.forEach((ch, i) => {
        box(ctx, 72 + i * 40, 117, 32, 38, i === v.namePos ? GOLD : '#e9ecd7', 6)
        text(ctx, ch, 88 + i * 40, 136, 22, INK, 'center')
      })
      text(ctx, 'TYPE OR ↑ / ↓ TO PICK', 128, 181, 6, GREEN, 'center')
      text(ctx, 'FIRE · NEXT     START · DONE', 128, 204, 6, GREEN, 'center')
      break
    }
    case 'gameover':
      heading(ctx, 'BRAVE UNTIL THE LAST BRICK', 'GAME OVER', 'THE EAGLE WILL RISE AGAIN.')
      ctx.save(); ctx.translate(102, 91); ctx.rotate(-.18); ctx.scale(3, 3); cartoonTank(ctx, 0, 0); ctx.restore()
      text(ctx, 'DUST OFF. TANK UP.', 128, 166, 12, GREEN, 'center')
      text(ctx, 'ANOTHER ADVENTURE IS JUST AHEAD.', 128, 186, 6, GREEN, 'center')
      text(ctx, 'PRESS FIRE TO CONTINUE', 128, 215, 6, RED, 'center')
      break
  }
}
