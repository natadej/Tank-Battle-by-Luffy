import { describe, expect, it } from 'vitest'
import { DOWN, EAGLE_X, EAGLE_Y, TILES, UP } from './constants'
import { BRICK, EMPTY, Level, RESERVED_TILES, STEEL, TILE_CODES } from './level'
import { makeRng } from './rng'
import {
  crossesExtraLife, ENEMIES_PER_STAGE, FRAMES, insertRank, isBonusTank, rankPosition, type RankEntry,
  spawnInterval, stageBonusWinner, tallyPoints,
} from './rules'
import { STAGES } from './stages'
import { IDLE_PAD, newPlayer, type Pad, World } from './world'

const EMPTY_MAP = Array.from({ length: TILES }, () => '.'.repeat(TILES))

function world(map: readonly string[] = EMPTY_MAP, players = 1, enemies = [20, 0, 0, 0]) {
  return new World({
    stage: 1,
    players: Array.from({ length: players }, (_, i) => newPlayer(i)),
    map,
    enemies,
    rng: makeRng(42),
  })
}

function run(w: World, frames: number, pads: Pad[] = []) {
  for (let i = 0; i < frames; i++) w.update(pads)
}

describe('stages', () => {
  it('has 35 well-formed stages with 20 enemies each', () => {
    expect(STAGES).toHaveLength(35)
    for (const s of STAGES) {
      expect(s.map, s.name).toHaveLength(TILES)
      for (const row of s.map) {
        expect(row, s.name).toHaveLength(TILES)
        for (const ch of row) expect(TILE_CODES[ch], `${s.name}: '${ch}'`).toBeDefined()
      }
      expect(s.enemies.reduce((a, b) => a + b, 0), s.name).toBe(ENEMIES_PER_STAGE)
    }
  })

  it('keeps spawn points clear and walls the eagle with brick', () => {
    const level = Level.fromRows(STAGES[0].map.map(r => r.replaceAll('.', '#')))
    for (const [tx, ty] of RESERVED_TILES) {
      if (tx === 6 && ty === 12) continue
      if (ty >= 11 && tx >= 5 && tx <= 7) continue
      expect(level.tileCode(tx, ty)).toBe('.')
    }
    expect(level.tileCode(5, 12)).toBe(']')
    expect(level.tileCode(7, 12)).toBe('[')
    expect(level.tileCode(6, 11)).toBe('_')
  })

  it('round-trips tile codes for the construction editor', () => {
    const rows = STAGES[2].map
    const level = Level.fromRows(rows)
    const back = Level.fromRows(level.toRows())
    expect(back.cells).toEqual(level.cells)
  })
})

describe('walls', () => {
  it('a normal bullet bites 4px off a brick strip; steel stops it', () => {
    const level = Level.fromRows(EMPTY_MAP)
    level.setTile(3, 3, '#')
    expect(level.bulletHit(56, 63, UP, false)).toBe('brick')
    expect(level.get(12, 15)).toBe(EMPTY)
    expect(level.get(12, 14)).toBe(BRICK)
    level.setTile(5, 5, '@')
    expect(level.bulletHit(88, 95, UP, false)).toBe('steel')
    expect(level.get(20, 23)).toBe(STEEL)
  })

  it('a 3-star bullet cuts through steel', () => {
    const level = Level.fromRows(EMPTY_MAP)
    level.setTile(5, 5, '@')
    expect(level.bulletHit(88, 95, UP, true)).not.toBe('none')
    expect(level.get(20, 23)).toBe(EMPTY)
    expect(level.get(20, 22)).toBe(EMPTY)
  })
})

describe('rules', () => {
  it('flashes the 4th, 11th and 18th tanks', () => {
    const bonus = Array.from({ length: 20 }, (_, i) => i + 1).filter(isBonusTank)
    expect(bonus).toEqual([4, 11, 18])
  })

  it('spawns faster on later stages and with two players', () => {
    expect(spawnInterval(1, 1)).toBe(186)
    expect(spawnInterval(1, 2)).toBe(166)
    expect(spawnInterval(35, 1)).toBe(50)
    expect(spawnInterval(80, 2)).toBe(30)
  })

  it('scores the tally and two-player bonus', () => {
    expect(tallyPoints([3, 2, 1, 1])).toBe(300 + 400 + 300 + 400)
    expect(stageBonusWinner([[5, 0, 0, 0], [3, 1, 0, 0]])).toBe(0)
    expect(stageBonusWinner([[2, 0, 0, 0], [1, 1, 0, 0]])).toBe(-1)
    expect(stageBonusWinner([[2, 0, 0, 0]])).toBe(-1)
  })

  it('awards an extra life once when crossing 20,000', () => {
    expect(crossesExtraLife(19900, 100)).toBe(true)
    expect(crossesExtraLife(20000, 100)).toBe(false)
    const w = world()
    const p = w.players[0]
    p.score = 19800
    w.addScore(p, 400)
    expect(p.lives).toBe(3)
    p.score = 19800
    w.addScore(p, 400)
    expect(p.lives).toBe(3)
  })

  it('ranks scores into a top-10 table', () => {
    const entry = (score: number): RankEntry => ({ name: 'AAA', score, stage: 1, players: 1, date: '' })
    let table: RankEntry[] = []
    for (const s of [500, 3000, 1000]) table = insertRank(table, entry(s)).table
    expect(table.map(e => e.score)).toEqual([3000, 1000, 500])
    for (let i = 0; i < 10; i++) table = insertRank(table, entry(2000 + i)).table
    expect(table).toHaveLength(10)
    expect(rankPosition(table, 100)).toBe(-1)
    expect(rankPosition(table, 99999)).toBe(0)
  })
})

describe('world', () => {
  it('spawns at most 4 enemies at once in 1P and never more than 20 per stage', () => {
    const w = world()
    w.applyPowerUp(w.players[0], 'shovel')
    w.shovelTimer = 1e9
    w.players[0].lives = 99
    let maxOnField = 0
    for (let i = 0; i < 6000; i++) {
      w.update([])
      maxOnField = Math.max(maxOnField, w.enemies.length)
      if (i > 1500 && i % 50 === 0) for (const e of w.enemies) if (e.spawning === 0) e.hp = 0
      w.enemies = w.enemies.filter(e => e.hp > 0)
    }
    expect(maxOnField).toBe(4)
    expect(w.spawned).toBe(20)
  })

  it('awards points by enemy type when a player shoots one', () => {
    const w = world(EMPTY_MAP, 1, [0, 0, 0, 20])
    run(w, 200)
    const e = w.enemies[0]
    const t = w.players[0].tank!
    e.x = t.x
    e.y = t.y - 48
    w.freezeTimer = 10000
    t.dir = UP
    for (let hits = 0; hits < 4; hits++) {
      run(w, 20, [{ ...IDLE_PAD, firePressed: true }])
      run(w, 20)
    }
    expect(w.enemies.includes(e)).toBe(false)
    expect(w.players[0].kills[3]).toBe(1)
    expect(w.players[0].score).toBe(400)
  })

  it('ends the game when the eagle is shot', () => {
    const w = world()
    w.bullets.push({ x: EAGLE_X + 8, y: EAGLE_Y - 20, dir: DOWN, speed: 3, power: false, fromPlayer: -1, tank: w.allTanks()[0], dead: false })
    w.level.setBaseWalls(EMPTY)
    run(w, 20)
    expect(w.eagleAlive).toBe(false)
    expect(w.phase).toBe('over')
    run(w, FRAMES.gameOverDelay)
    expect(w.finished).toBe('over')
  })

  it('loses a life and resets stars when hit, game over after the last life', () => {
    const w = world()
    const p = w.players[0]
    run(w, FRAMES.spawnSparkle + FRAMES.spawnShield + 1)
    p.stars = 2
    const t = p.tank!
    w.bullets.push({ x: t.x + 8, y: t.y - 10, dir: DOWN, speed: 3, power: false, fromPlayer: -1, tank: t, dead: false })
    run(w, 10)
    expect(p.tank).toBeNull()
    expect(p.lives).toBe(1)
    expect(p.stars).toBe(0)
    p.lives = 0
    run(w, FRAMES.respawnDelay + FRAMES.spawnSparkle + FRAMES.spawnShield + 2)
    const t2 = p.tank!
    w.bullets.push({ x: t2.x + 8, y: t2.y - 10, dir: DOWN, speed: 3, power: false, fromPlayer: -1, tank: t2, dead: false })
    run(w, 10)
    expect(p.out).toBe(true)
    expect(w.phase).toBe('over')
  })

  it('clears the stage once all 20 enemies are destroyed', () => {
    const w = world()
    for (let i = 0; i < 8000 && w.phase === 'play'; i++) {
      w.update([])
      for (const e of w.enemies) if (e.spawning === 0) w.applyPowerUp(w.players[0], 'grenade')
    }
    expect(w.phase).toBe('clear')
    run(w, FRAMES.stageClearDelay)
    expect(w.finished).toBe('clear')
  })

  it('shovel turns the base wall to steel and then back to brick', () => {
    const w = world()
    w.applyPowerUp(w.players[0], 'shovel')
    expect(w.level.get(22, 46)).toBe(STEEL)
    run(w, FRAMES.shovel)
    expect(w.level.get(22, 46)).toBe(BRICK)
  })

  it('star power-ups upgrade the player up to 3 and add 500 points', () => {
    const w = world()
    run(w, FRAMES.spawnSparkle + 1)
    const p = w.players[0]
    for (let i = 0; i < 4; i++) {
      w.powerup = { kind: 'star', x: p.tank!.x, y: p.tank!.y, age: 0 }
      w.update([])
    }
    expect(p.stars).toBe(3)
    expect(p.score).toBe(2000)
  })
})
