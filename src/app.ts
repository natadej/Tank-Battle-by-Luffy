import type { Sound, Sfx } from './audio'
import { EAGLE_X, EAGLE_Y, FIELD, FIELD_X, FIELD_Y, RIGHT, SCREEN_H, SCREEN_W, TILE, TILES, UP } from './game/constants'
import { CONSTRUCTION_PATTERNS, Level, RESERVED_TILES } from './game/level'
import {
  DEFAULT_HI_SCORE, ENEMY_POINTS, insertRank, rankPosition, type RankEntry, rankTitle, stageBonusWinner,
  TWO_PLAYER_BONUS,
} from './game/rules'
import { STAGES, stageDef } from './game/stages'
import { type GameEvent, newPlayer, type Player, World } from './game/world'
import { drawText, drawTextCentered, glyphPixels } from './gfx/font'
import { COLORS, drawBrickText, drawCanopy, drawGround, drawWorld } from './gfx/render'
import { eagleSprite, tankSprite, type TankKind } from './gfx/sprites'
import type { Input } from './input'
import { storage } from './storage'

type SceneName = 'title' | 'curtain' | 'play' | 'tally' | 'gameover' | 'name' | 'ranking' | 'construction'

const MENU = ['1 PLAYER', '2 PLAYERS', 'CONSTRUCTION', 'RANKING'] as const
const NAME_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789.-! '
const ENEMY_KINDS: readonly TankKind[] = ['basic', 'fast', 'power', 'armor']

const EVENT_SOUND: Partial<Record<GameEvent, Sfx>> = {
  shoot: 'shoot', wall: 'wall', steel: 'steel', brick: 'brick', armor: 'armor', enemyDie: 'enemyDie',
  playerDie: 'playerDie', eagle: 'eagle', powerupAppear: 'powerupAppear', powerup: 'powerup', life: 'life',
  shieldHit: 'shieldHit', paralyze: 'paralyze',
}

export class App {
  scene: SceneName = 'title'
  t = 0
  playerCount = 1
  players: Player[] = []
  stage = 1
  world: World | null = null
  paused = false
  hiScore: number
  ranking: RankEntry[]
  lastScores: number[] = [0, 0]
  customMap: string[] | null
  useCustom = false

  private titleY = SCREEN_H
  private menuIndex = 0
  private stageSelectable = false
  private openTimer = 0
  private tallyResult: 'clear' | 'over' = 'clear'
  private tallyKills: number[][] = []
  private tallyTicks = -1
  private bonusAwarded = -1
  private nameQueue: number[] = []
  private nameLetters: string[] = []
  private namePos = 0
  private highlight = new Set<number>()
  private editor = { level: new Level(), x: 4, y: 6, pattern: 4, last: '', repeat: 0 }

  private input: Input
  private sound: Sound

  constructor(input: Input, sound: Sound) {
    this.input = input
    this.sound = sound
    this.ranking = storage.ranking()
    this.hiScore = Math.max(DEFAULT_HI_SCORE, this.ranking[0]?.score ?? 0)
    this.customMap = storage.customMap()
  }

  private go(scene: SceneName): void {
    this.scene = scene
    this.t = 0
  }

  // ------------------------------------------------------------------ update

  step(): void {
    this.t++
    switch (this.scene) {
      case 'title': return this.stepTitle()
      case 'curtain': return this.stepCurtain()
      case 'play': return this.stepPlay()
      case 'tally': return this.stepTally()
      case 'gameover': return this.stepGameOver()
      case 'name': return this.stepName()
      case 'ranking': return this.stepRanking()
      case 'construction': return this.stepConstruction()
    }
  }

  private confirm(): boolean {
    return this.input.any('start') || this.input.any('fire')
  }

  private stepTitle(): void {
    if (this.titleY > 0) {
      this.titleY = Math.max(0, this.titleY - 2)
      if (this.confirm()) this.titleY = 0
      return
    }
    if (this.input.any('down') || this.input.any('select')) {
      this.menuIndex = (this.menuIndex + 1) % MENU.length
      this.sound.play('menu')
    } else if (this.input.any('up')) {
      this.menuIndex = (this.menuIndex + MENU.length - 1) % MENU.length
      this.sound.play('menu')
    } else if (this.confirm()) {
      this.sound.play('place')
      if (this.menuIndex <= 1) this.newGame(this.menuIndex + 1)
      else if (this.menuIndex === 2) this.openEditor()
      else {
        this.highlight.clear()
        this.go('ranking')
      }
    }
  }

  newGame(players: number): void {
    this.playerCount = players
    this.input.players = players
    this.players = Array.from({ length: players }, (_, i) => newPlayer(i))
    this.stage = 1
    this.stageSelectable = true
    this.go('curtain')
  }

  private stepCurtain(): void {
    if (this.t < 30) return
    if (this.stageSelectable) {
      if (this.input.any('right') || this.input.any('up')) this.stage = (this.stage % STAGES.length) + 1
      if (this.input.any('left') || this.input.any('down')) this.stage = ((this.stage + STAGES.length - 2) % STAGES.length) + 1
      if (this.confirm()) this.beginStage()
    } else if (this.t >= 100) {
      this.beginStage()
    }
  }

  private beginStage(): void {
    const def = stageDef(this.stage)
    const map = this.stage === 1 && this.useCustom && this.customMap ? this.customMap : def.map
    this.world = new World({ stage: this.stage, players: this.players, map, enemies: def.enemies })
    this.stageSelectable = false
    this.paused = false
    this.openTimer = 30
    this.sound.play('stageStart')
    this.go('play')
  }

  private stepPlay(): void {
    const w = this.world!
    if (this.openTimer > 0) {
      this.openTimer--
      return
    }
    if (this.input.any('start') && w.phase !== 'over') {
      this.paused = !this.paused
      this.sound.play('pause')
      this.sound.engine(this.paused ? 'off' : 'idle')
    }
    if (this.paused) return
    w.update(this.players.map((_, i) => this.input.pad(i)))
    for (const ev of new Set(w.events)) {
      const sfx = EVENT_SOUND[ev]
      if (sfx) this.sound.play(sfx)
    }
    for (const p of this.players) this.hiScore = Math.max(this.hiScore, p.score)
    const moving = this.players.some((p, i) => p.tank && p.tank.spawning === 0 && this.input.pad(i).dir !== null)
    this.sound.engine(w.phase === 'over' ? 'off' : moving ? 'moving' : 'idle')
    if (w.finished) {
      this.sound.engine('off')
      this.tallyResult = w.finished
      this.tallyKills = this.players.map(p => [...p.kills])
      this.tallyTicks = -1
      this.bonusAwarded = -1
      this.go('tally')
    }
  }

  private tallyTimeline() {
    const rowStart: number[] = []
    let at = 40
    for (let r = 0; r < 4; r++) {
      rowStart.push(at)
      at += (Math.max(...this.tallyKills.map(k => k[r])) + 1) * 10 + 12
    }
    return { rowStart, totalAt: at, bonusAt: at + 30, endAt: at + 160 }
  }

  private tallyCount(r: number, p: number): number {
    const { rowStart } = this.tallyTimeline()
    if (this.t < rowStart[r]) return -1
    return Math.min(this.tallyKills[p][r], Math.floor((this.t - rowStart[r]) / 10))
  }

  private stepTally(): void {
    const tl = this.tallyTimeline()
    let ticks = 0
    for (let r = 0; r < 4; r++) for (let p = 0; p < this.players.length; p++) ticks += Math.max(0, this.tallyCount(r, p))
    if (ticks > this.tallyTicks && this.tallyTicks >= 0) this.sound.play('tick')
    this.tallyTicks = ticks
    if (this.t === tl.bonusAt && this.tallyResult === 'clear') {
      const winner = stageBonusWinner(this.tallyKills)
      if (winner >= 0 && !this.players[winner].out) {
        this.bonusAwarded = winner
        const p = this.players[winner]
        this.world!.addScore(p, TWO_PLAYER_BONUS)
        this.hiScore = Math.max(this.hiScore, p.score)
        this.sound.play('bonus')
      }
    }
    if (this.t >= tl.endAt || (this.t > tl.totalAt && this.confirm())) {
      if (this.tallyResult === 'clear') {
        this.stage++
        this.go('curtain')
      } else {
        this.sound.play('gameOver')
        this.go('gameover')
      }
    }
  }

  private stepGameOver(): void {
    if (this.t < 200 && !(this.t > 40 && this.confirm())) return
    this.lastScores = this.players.map(p => p.score)
    this.nameQueue = this.players.map((_, i) => i).filter(i => rankPosition(this.ranking, this.players[i].score) >= 0)
    this.highlight.clear()
    this.nextName()
  }

  private nextName(): void {
    if (this.nameQueue.length === 0) {
      this.go('ranking')
      return
    }
    this.nameLetters = storage.lastName().padEnd(3, 'A').slice(0, 3).split('')
    this.namePos = 0
    this.go('name')
  }

  private stepName(): void {
    const cycle = (d: number) => {
      const i = NAME_CHARS.indexOf(this.nameLetters[this.namePos])
      this.nameLetters[this.namePos] = NAME_CHARS[(Math.max(0, i) + d + NAME_CHARS.length) % NAME_CHARS.length]
      this.sound.play('menu')
    }
    if (this.input.any('up')) cycle(1)
    if (this.input.any('down')) cycle(-1)
    if (this.input.any('left') && this.namePos > 0) this.namePos--
    if (this.input.any('right') && this.namePos < 2) this.namePos++
    for (const ch of this.input.typed) {
      if (ch === '\b') {
        this.namePos = Math.max(0, this.namePos - 1)
        continue
      }
      const up = ch.toUpperCase()
      if (up === ' ' || !NAME_CHARS.includes(up)) continue
      this.nameLetters[this.namePos] = up
      this.namePos = Math.min(2, this.namePos + 1)
      this.sound.play('place')
    }
    const fire = this.input.any('fire') && !this.input.typed.includes(' ')
    if (fire && this.namePos < 2) {
      this.namePos++
      this.sound.play('place')
    } else if (this.input.any('start') || (fire && this.namePos === 2)) {
      const idx = this.nameQueue.shift()!
      const name = this.nameLetters.join('').trim() || 'AAA'
      storage.saveLastName(name)
      const res = insertRank(this.ranking, {
        name, score: this.players[idx].score, stage: this.stage, players: this.playerCount,
        date: new Date().toISOString().slice(0, 10),
      })
      this.ranking = res.table
      storage.saveRanking(this.ranking)
      this.highlight = new Set([...this.highlight].map(h => (h >= res.position ? h + 1 : h)))
      if (res.position >= 0) this.highlight.add(res.position)
      this.sound.play('bonus')
      this.nextName()
    }
  }

  private stepRanking(): void {
    if ((this.t > 30 && this.confirm()) || this.t > 60 * 30) {
      this.titleY = 0
      this.go('title')
    }
  }

  private openEditor(): void {
    this.editor.level = this.customMap ? Level.fromRows(this.customMap) : Level.fromRows([])
    this.editor.x = 4
    this.editor.y = 6
    this.editor.last = ''
    this.go('construction')
  }

  private stepConstruction(): void {
    const ed = this.editor
    if (this.input.any('start')) {
      this.customMap = ed.level.toRows()
      storage.saveCustomMap(this.customMap)
      this.useCustom = true
      this.sound.play('pause')
      this.go('title')
      return
    }
    const dirs: [Parameters<Input['anyHeld']>[0], number, number][] = [['up', 0, -1], ['down', 0, 1], ['left', -1, 0], ['right', 1, 0]]
    for (const [b, dx, dy] of dirs) {
      const pressed = this.input.any(b)
      const held = this.input.anyHeld(b)
      if (pressed) ed.repeat = 0
      if (pressed || (held && ++ed.repeat > 16 && ed.repeat % 6 === 0)) {
        ed.x = Math.min(TILES - 1, Math.max(0, ed.x + dx))
        ed.y = Math.min(TILES - 1, Math.max(0, ed.y + dy))
        ed.last = ''
      }
    }
    const fire = this.input.any('fire')
    const back = this.input.any('select')
    if (!fire && !back) return
    const key = `${ed.x},${ed.y}`
    if (RESERVED_TILES.some(([tx, ty]) => tx === ed.x && ty === ed.y)) {
      this.sound.play('wall')
      return
    }
    if (ed.last === key) {
      const n = CONSTRUCTION_PATTERNS.length
      ed.pattern = (ed.pattern + (back ? n - 1 : 1)) % n
    }
    ed.level.setTile(ed.x, ed.y, CONSTRUCTION_PATTERNS[ed.pattern])
    ed.last = key
    this.sound.play('place')
  }

  // ------------------------------------------------------------------ draw

  draw(ctx: CanvasRenderingContext2D): void {
    ctx.imageSmoothingEnabled = false
    switch (this.scene) {
      case 'title': return this.drawTitle(ctx)
      case 'curtain': return this.drawCurtainScene(ctx)
      case 'play': {
        drawWorld(ctx, this.world!, { paused: this.paused })
        if (this.openTimer > 0) this.drawCurtain(ctx, this.openTimer / 30)
        return
      }
      case 'tally': return this.drawTally(ctx)
      case 'gameover': return this.drawGameOver(ctx)
      case 'name': return this.drawName(ctx)
      case 'ranking': return this.drawRanking(ctx)
      case 'construction': return this.drawConstruction(ctx)
    }
  }

  private clear(ctx: CanvasRenderingContext2D, color = COLORS.black): void {
    ctx.fillStyle = color
    ctx.fillRect(0, 0, SCREEN_W, SCREEN_H)
  }

  private scoreLine(ctx: CanvasRenderingContext2D, y: number): void {
    drawText(ctx, `I- ${String(this.lastScores[0]).padStart(6)}`, 8, y, COLORS.white)
    drawText(ctx, `HI- ${String(this.hiScore).padStart(6)}`, 136, y, COLORS.white)
  }

  private drawTitle(ctx: CanvasRenderingContext2D): void {
    this.clear(ctx)
    const oy = this.titleY
    this.scoreLine(ctx, 16 + oy)
    drawBrickText(ctx, 'TANK', SCREEN_W / 2, 40 + oy, glyphPixels)
    drawBrickText(ctx, 'CITY', SCREEN_W / 2, 76 + oy, glyphPixels)
    MENU.forEach((item, i) => drawText(ctx, item, 88, 128 + i * 16 + oy, COLORS.white))
    if (oy === 0) {
      const frame = (this.t >> 2) & 1
      ctx.drawImage(tankSprite('p0', 'yellow', frame, RIGHT), 64, 124 + this.menuIndex * 16)
    }
    drawTextCentered(ctx, 'DEFEND THE EAGLE!', SCREEN_W / 2, 200 + oy, COLORS.red)
    drawTextCentered(ctx, 'ARROWS/WASD MOVE  SPACE FIRE', SCREEN_W / 2, 216 + oy, COLORS.grey)
  }

  private drawCurtain(ctx: CanvasRenderingContext2D, f: number): void {
    const h = Math.round((SCREEN_H / 2) * f)
    ctx.fillStyle = COLORS.grey
    ctx.fillRect(0, 0, SCREEN_W, h)
    ctx.fillRect(0, SCREEN_H - h, SCREEN_W, h)
  }

  private drawCurtainScene(ctx: CanvasRenderingContext2D): void {
    this.clear(ctx)
    this.drawCurtain(ctx, Math.min(1, this.t / 30))
    if (this.t < 30) return
    drawTextCentered(ctx, `STAGE ${String(this.stage).padStart(2)}`, SCREEN_W / 2, 112, COLORS.black)
    if (this.stageSelectable) {
      drawTextCentered(ctx, '< >  CHOOSE STAGE', SCREEN_W / 2, 136, COLORS.black)
      if ((this.t >> 4) % 2 === 0) drawTextCentered(ctx, 'PRESS FIRE', SCREEN_W / 2, 152, COLORS.black)
    }
  }

  private drawTally(ctx: CanvasRenderingContext2D): void {
    this.clear(ctx)
    const two = this.players.length > 1
    drawText(ctx, 'HI-SCORE', 64, 16, COLORS.red)
    drawText(ctx, String(this.hiScore).padStart(7), 136, 16, COLORS.orange)
    drawTextCentered(ctx, `STAGE ${String(this.stage).padStart(2)}`, SCREEN_W / 2, 32, COLORS.white)
    drawText(ctx, 'I-PLAYER', 16, 52, COLORS.red)
    drawText(ctx, String(this.players[0].score).padStart(8), 8, 64, COLORS.orange)
    if (two) {
      drawText(ctx, 'II-PLAYER', 168, 52, COLORS.red)
      drawText(ctx, String(this.players[1].score).padStart(8), 168, 64, COLORS.orange)
    }
    for (let r = 0; r < 4; r++) {
      const y = 88 + r * 24
      ctx.drawImage(tankSprite(ENEMY_KINDS[r], 'silver', 0, UP), 120, y - 4)
      this.players.forEach((_, p) => {
        const n = this.tallyCount(r, p)
        if (n < 0) return
        const pts = String(n * ENEMY_POINTS[r]).padStart(4)
        if (p === 0) {
          drawText(ctx, `${pts} PTS ${String(n).padStart(2)}`, 0, y, COLORS.white)
          drawText(ctx, '<', 104, y, COLORS.white)
        } else {
          drawText(ctx, '>', 140, y, COLORS.white)
          drawText(ctx, `${String(n).padStart(2)} ${pts} PTS`, 152, y, COLORS.white)
        }
      })
    }
    const tl = this.tallyTimeline()
    ctx.fillStyle = COLORS.white
    ctx.fillRect(88, 182, 80, 2)
    if (this.t >= tl.totalAt) {
      drawText(ctx, 'TOTAL', 40, 190, COLORS.white)
      this.players.forEach((_, p) => {
        const total = this.tallyKills[p].reduce((a, b) => a + b, 0)
        drawText(ctx, String(total).padStart(2), p === 0 ? 96 : 152, 190, COLORS.white)
      })
    }
    if (this.bonusAwarded >= 0 && (this.t >> 3) % 4 !== 0) {
      const x = this.bonusAwarded === 0 ? 16 : 152
      drawText(ctx, 'BONUS!', x, 208, COLORS.red)
      drawText(ctx, `${TWO_PLAYER_BONUS} PTS`, x, 220, COLORS.white)
    }
  }

  private drawGameOver(ctx: CanvasRenderingContext2D): void {
    this.clear(ctx)
    const y = Math.max(60, SCREEN_H - this.t * 3)
    drawBrickText(ctx, 'GAME', SCREEN_W / 2, y, glyphPixels)
    drawBrickText(ctx, 'OVER', SCREEN_W / 2, y + 40, glyphPixels)
  }

  private drawName(ctx: CanvasRenderingContext2D): void {
    this.clear(ctx)
    const idx = this.nameQueue[0]
    const p = this.players[idx]
    const pos = rankPosition(this.ranking, p.score)
    drawTextCentered(ctx, pos === 0 ? 'NEW HI-SCORE!' : 'NEW RECORD!', SCREEN_W / 2, 32, (this.t >> 3) % 2 ? COLORS.red : COLORS.orange)
    drawTextCentered(ctx, `${idx === 0 ? 'I' : 'II'}-PLAYER  ${p.score}`, SCREEN_W / 2, 64, COLORS.white)
    drawTextCentered(ctx, `RANK NO.${pos + 1}  ${rankTitle(p.score)}`, SCREEN_W / 2, 80, COLORS.yellow)
    drawTextCentered(ctx, 'ENTER YOUR NAME', SCREEN_W / 2, 112, COLORS.white)
    this.nameLetters.forEach((ch, i) => {
      const x = 96 + i * 24
      drawText(ctx, ch, x, 136, COLORS.white, 2)
      if (i === this.namePos && (this.t >> 3) % 2 === 0) {
        ctx.fillStyle = COLORS.red
        ctx.fillRect(x + 2, 154, 12, 2)
      }
    })
    drawTextCentered(ctx, 'TYPE OR UP/DOWN TO PICK', SCREEN_W / 2, 184, COLORS.grey)
    drawTextCentered(ctx, 'FIRE NEXT  START DONE', SCREEN_W / 2, 200, COLORS.grey)
  }

  private drawRanking(ctx: CanvasRenderingContext2D): void {
    this.clear(ctx)
    drawTextCentered(ctx, 'RANKING', SCREEN_W / 2, 12, COLORS.red)
    drawText(ctx, 'NO NAME   SCORE ST RANK', 16, 32, COLORS.orange)
    if (this.ranking.length === 0) drawTextCentered(ctx, 'NO RECORDS YET', SCREEN_W / 2, 100, COLORS.white)
    this.ranking.forEach((e, i) => {
      const hl = this.highlight.has(i)
      const line = `${String(i + 1).padStart(2)} ${e.name.padEnd(3)} ${String(e.score).padStart(7)} ${String(e.stage).padStart(2)} ${rankTitle(e.score)}`
      drawText(ctx, line, 16, 48 + i * 16, hl ? ((this.t >> 3) % 2 ? COLORS.yellow : COLORS.red) : COLORS.white)
    })
    if (this.t > 30) drawTextCentered(ctx, 'PRESS FIRE', SCREEN_W / 2, 220, COLORS.grey)
  }

  private drawConstruction(ctx: CanvasRenderingContext2D): void {
    this.clear(ctx, COLORS.grey)
    const ed = this.editor
    drawGround(ctx, ed.level, this.t)
    ctx.drawImage(eagleSprite(true), FIELD_X + EAGLE_X, FIELD_Y + EAGLE_Y)
    drawCanopy(ctx, ed.level)
    if ((this.t >> 3) % 2 === 0) {
      ctx.drawImage(tankSprite('p0', 'yellow', 0, UP), FIELD_X + ed.x * TILE, FIELD_Y + ed.y * TILE)
    }
    drawText(ctx, 'FIRE:BLOCK  START:DONE', 16, 4, COLORS.black)
    drawText(ctx, 'CONSTRUCTION', FIELD_X, FIELD_Y + FIELD + 4, COLORS.black)
  }
}
