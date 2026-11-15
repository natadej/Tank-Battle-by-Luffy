import {
  DX, DY, type Dir, DOWN, EAGLE_X, EAGLE_Y, ENEMY_SPAWNS, FIELD, LEFT, PLAYER_SPAWNS, RIGHT, TILE, UP,
} from './constants'
import { BRICK, Level, STEEL, WATER } from './level'
import { makeRng, type Rng } from './rng'
import {
  crossesExtraLife, ENEMIES_PER_STAGE, ENEMY_BULLET_SPEED, ENEMY_HP, ENEMY_POINTS, ENEMY_SPEED, enemyQueue,
  type EnemyType, FRAMES, isBonusTank, MAX_STARS, maxEnemiesOnField, PLAYER_BULLET_SPEED, PLAYER_MAX_BULLETS,
  PLAYER_SPEED, POWERUP_KINDS, POWERUP_POINTS, type PowerUpKind, spawnInterval, START_LIVES,
} from './rules'

export interface Pad {
  /** Most recently pressed direction that is still held. */
  dir: Dir | null
  fire: boolean
  firePressed: boolean
}

export const IDLE_PAD: Pad = { dir: null, fire: false, firePressed: false }

export interface Tank {
  id: number
  x: number
  y: number
  dir: Dir
  sub: number
  animTick: number
  bullets: number
  /** Frames left of the spawn sparkle; the tank is inert while > 0. */
  spawning: number
}

export interface PlayerTank extends Tank {
  shield: number
  paralyzed: number
  slide: number
  fireCooldown: number
}

export interface Enemy extends Tank {
  type: EnemyType
  hp: number
  bonus: boolean
  blocked: number
}

export interface Player {
  index: number
  lives: number
  score: number
  stars: number
  out: boolean
  extraLifeAwarded: boolean
  tank: PlayerTank | null
  respawnDelay: number
  kills: number[]
}

export interface Bullet {
  x: number
  y: number
  dir: Dir
  speed: number
  power: boolean
  fromPlayer: number
  tank: Tank
  dead: boolean
}

export interface PowerUp {
  kind: PowerUpKind
  x: number
  y: number
  age: number
}

export interface Effect {
  kind: 'small' | 'big' | 'points' | 'banner'
  x: number
  y: number
  t: number
  delay: number
  value?: number
  duration: number
}

export type GameEvent =
  | 'shoot' | 'wall' | 'steel' | 'brick' | 'armor' | 'enemyDie' | 'playerDie' | 'eagle'
  | 'powerupAppear' | 'powerup' | 'life' | 'shieldHit' | 'paralyze'

export type Phase = 'play' | 'clear' | 'over'

export function newPlayer(index: number): Player {
  return {
    index, lives: START_LIVES, score: 0, stars: 0, out: false, extraLifeAwarded: false,
    tank: null, respawnDelay: 0, kills: [0, 0, 0, 0],
  }
}

const SIZE = TILE

function overlaps(ax: number, ay: number, aw: number, ah: number, bx: number, by: number, bw: number, bh: number) {
  return ax < bx + bw && ax + aw > bx && ay < by + bh && ay + ah > by
}

export interface WorldOptions {
  stage: number
  players: Player[]
  map: readonly string[] | Level
  enemies: readonly number[]
  rng?: Rng
}

export class World {
  readonly stage: number
  readonly players: Player[]
  readonly level: Level
  readonly rng: Rng
  enemies: Enemy[] = []
  bullets: Bullet[] = []
  powerup: PowerUp | null = null
  effects: Effect[] = []
  events: GameEvent[] = []
  eagleAlive = true
  queue: EnemyType[]
  spawned = 0
  frame = 0
  freezeTimer = 0
  shovelTimer = 0
  spawnTimer = 0
  spawnSlot = 0
  phase: Phase = 'play'
  phaseTimer = 0
  finished: 'clear' | 'over' | null = null
  private nextId = 1

  constructor(opts: WorldOptions) {
    this.stage = opts.stage
    this.players = opts.players
    this.level = opts.map instanceof Level ? opts.map.clone() : Level.fromRows(opts.map)
    this.queue = enemyQueue(opts.enemies)
    this.rng = opts.rng ?? makeRng()
    for (const p of this.players) {
      p.kills = [0, 0, 0, 0]
      p.tank = null
      if (!p.out) this.spawnPlayer(p)
    }
  }

  get enemiesLeft(): number {
    return ENEMIES_PER_STAGE - this.spawned
  }

  get controlsLocked(): boolean {
    return this.phase === 'over'
  }

  private spawnPlayer(p: Player): void {
    const pos = PLAYER_SPAWNS[p.index]
    p.tank = {
      id: this.nextId++, x: pos.x, y: pos.y, dir: UP, sub: 0, animTick: 0, bullets: 0,
      spawning: FRAMES.spawnSparkle, shield: 0, paralyzed: 0, slide: 0, fireCooldown: 0,
    }
  }

  allTanks(): Tank[] {
    const tanks: Tank[] = []
    for (const p of this.players) if (p.tank) tanks.push(p.tank)
    tanks.push(...this.enemies)
    return tanks
  }

  update(pads: readonly Pad[]): void {
    this.frame++
    this.events = []
    if (this.finished) return

    this.players.forEach((p, i) => this.updatePlayer(p, this.controlsLocked ? IDLE_PAD : (pads[i] ?? IDLE_PAD)))
    this.updateSpawner()
    for (const e of this.enemies) this.updateEnemy(e)
    this.updateBullets()
    this.checkPowerUp()
    this.updateTimers()
    this.updateEffects()
    this.updatePhase()
  }

  // ---------------------------------------------------------------- movement

  private solidForTank(x: number, y: number): boolean {
    if (x < 0 || y < 0 || x > FIELD - SIZE || y > FIELD - SIZE) return true
    if (this.level.blocksTank(x, y, SIZE, SIZE)) return true
    return overlaps(x, y, SIZE, SIZE, EAGLE_X, EAGLE_Y, SIZE, SIZE)
  }

  private blockedByTank(t: Tank, x: number, y: number): boolean {
    for (const o of this.allTanks()) {
      if (o === t || o.spawning > 0) continue
      if (overlaps(x, y, SIZE, SIZE, o.x, o.y, SIZE, SIZE) && !overlaps(t.x, t.y, SIZE, SIZE, o.x, o.y, SIZE, SIZE)) {
        return true
      }
    }
    return false
  }

  private turn(t: Tank, dir: Dir): void {
    if (dir === t.dir) return
    const vertical = dir === UP || dir === DOWN
    const wasVertical = t.dir === UP || t.dir === DOWN
    if (vertical !== wasVertical) {
      const coord = vertical ? t.x : t.y
      const near = Math.round(coord / 8) * 8
      const far = near > coord ? near - 8 : near + 8
      for (const c of coord % 8 === 0 ? [coord] : [near, far]) {
        const x = vertical ? c : t.x
        const y = vertical ? t.y : c
        if (!this.solidForTank(x, y)) {
          t.x = x
          t.y = y
          break
        }
      }
    }
    t.dir = dir
    t.sub = 0
  }

  /** Moves a tank forward; returns false if it was stopped by something. */
  private advance(t: Tank, speed: number): boolean {
    t.sub += speed
    const steps = Math.floor(t.sub)
    t.sub -= steps
    t.animTick++
    for (let i = 0; i < steps; i++) {
      const nx = t.x + DX[t.dir]
      const ny = t.y + DY[t.dir]
      if (this.solidForTank(nx, ny) || this.blockedByTank(t, nx, ny)) {
        t.sub = 0
        return false
      }
      t.x = nx
      t.y = ny
    }
    return true
  }

  // ---------------------------------------------------------------- players

  private updatePlayer(p: Player, pad: Pad): void {
    if (p.out) return
    if (!p.tank) {
      if (--p.respawnDelay <= 0) this.spawnPlayer(p)
      return
    }
    const t = p.tank
    if (t.spawning > 0) {
      if (--t.spawning === 0) t.shield = FRAMES.spawnShield
      return
    }
    if (t.shield > 0) t.shield--
    if (t.fireCooldown > 0) t.fireCooldown--
    if (t.paralyzed > 0) {
      t.paralyzed--
      return
    }

    const onIce = this.level.onIce(t.x, t.y, SIZE, SIZE)
    if (pad.dir !== null) {
      this.turn(t, pad.dir)
      this.advance(t, PLAYER_SPEED)
      t.slide = onIce ? FRAMES.iceSlide : 0
    } else if (t.slide > 0 && onIce) {
      t.slide--
      if (!this.advance(t, PLAYER_SPEED)) t.slide = 0
    } else {
      t.slide = 0
    }

    const wantsFire = pad.firePressed || (pad.fire && t.fireCooldown === 0)
    if (wantsFire && t.bullets < PLAYER_MAX_BULLETS[p.stars]) {
      this.fire(t, PLAYER_BULLET_SPEED[p.stars], p.stars >= MAX_STARS, p.index)
      t.fireCooldown = 14
      this.events.push('shoot')
    }
  }

  private fire(t: Tank, speed: number, power: boolean, fromPlayer: number): void {
    t.bullets++
    this.bullets.push({
      x: t.x + 8 + DX[t.dir] * 6,
      y: t.y + 8 + DY[t.dir] * 6,
      dir: t.dir, speed, power, fromPlayer, tank: t, dead: false,
    })
  }

  private killPlayer(p: Player): void {
    const t = p.tank!
    this.effects.push({ kind: 'big', x: t.x + 8, y: t.y + 8, t: 0, delay: 0, duration: 28 })
    this.events.push('playerDie')
    p.tank = null
    p.stars = 0
    if (p.lives > 0) {
      p.lives--
      p.respawnDelay = FRAMES.respawnDelay
    } else {
      p.out = true
      const pos = PLAYER_SPAWNS[p.index]
      this.effects.push({ kind: 'banner', x: pos.x + 8, y: pos.y, t: 0, delay: 0, duration: 150 })
    }
  }

  addScore(p: Player, points: number): void {
    if (crossesExtraLife(p.score, points) && !p.extraLifeAwarded) {
      p.extraLifeAwarded = true
      p.lives++
      this.events.push('life')
    }
    p.score += points
  }

  // ---------------------------------------------------------------- enemies

  private updateSpawner(): void {
    if (this.spawned >= ENEMIES_PER_STAGE) return
    if (this.spawnTimer > 0) this.spawnTimer--
    if (this.spawnTimer > 0 || this.enemies.length >= maxEnemiesOnField(this.players.length)) return
    const pos = ENEMY_SPAWNS[this.spawnSlot]
    if (this.allTanks().some(o => overlaps(pos.x, pos.y, SIZE, SIZE, o.x, o.y, SIZE, SIZE))) return

    const type = this.queue[this.spawned]
    this.spawned++
    const bonus = isBonusTank(this.spawned)
    if (bonus) this.powerup = null
    this.enemies.push({
      id: this.nextId++, x: pos.x, y: pos.y, dir: DOWN, sub: 0, animTick: 0, bullets: 0,
      spawning: FRAMES.spawnSparkle, type, hp: ENEMY_HP[type], bonus, blocked: 0,
    })
    this.spawnSlot = (this.spawnSlot + 1) % ENEMY_SPAWNS.length
    this.spawnTimer = spawnInterval(this.stage, this.players.length)
  }

  private chooseDirection(e: Enemy): Dir {
    const r = this.rng()
    // Early in a stage enemies wander with a pull towards the bottom; later they hunt.
    if (this.frame > 640 && r < 0.55) {
      const alive = this.players.filter(p => p.tank && p.tank.spawning === 0)
      const huntPlayer = e.id % 3 === 0 && alive.length > 0
      const target = huntPlayer ? alive[e.id % alive.length].tank! : { x: EAGLE_X, y: EAGLE_Y }
      const dx = target.x - e.x
      const dy = target.y - e.y
      const horizontalFirst = Math.abs(dx) > Math.abs(dy) ? this.rng() < 0.7 : this.rng() < 0.3
      if (horizontalFirst && dx !== 0) return dx > 0 ? RIGHT : LEFT
      if (dy !== 0) return dy > 0 ? DOWN : UP
      return dx > 0 ? RIGHT : LEFT
    }
    const q = this.rng()
    if (q < 0.4) return DOWN
    if (q < 0.6) return LEFT
    if (q < 0.8) return RIGHT
    return UP
  }

  private updateEnemy(e: Enemy): void {
    if (e.spawning > 0) {
      e.spawning--
      return
    }
    if (this.freezeTimer > 0) return
    const moved = this.advance(e, ENEMY_SPEED[e.type])
    if (!moved) {
      e.blocked++
      if (e.blocked > 12 && this.rng() < 0.2) {
        this.turn(e, this.chooseDirection(e))
        e.blocked = 0
      }
    } else {
      e.blocked = 0
      if (e.x % TILE === 0 && e.y % TILE === 0 && this.rng() < 1 / 16) this.turn(e, this.chooseDirection(e))
    }
    const fireChance = e.blocked > 0 ? 1 / 10 : 1 / 32
    if (e.bullets === 0 && this.rng() < fireChance) {
      this.fire(e, ENEMY_BULLET_SPEED[e.type], false, -1)
    }
  }

  private hitEnemy(e: Enemy, p: Player): void {
    if (e.bonus) {
      e.bonus = false
      this.spawnPowerUp()
    }
    e.hp--
    if (e.hp > 0) {
      this.events.push('armor')
      return
    }
    this.enemies = this.enemies.filter(o => o !== e)
    p.kills[e.type]++
    const points = ENEMY_POINTS[e.type]
    this.addScore(p, points)
    this.effects.push({ kind: 'big', x: e.x + 8, y: e.y + 8, t: 0, delay: 0, duration: 28 })
    this.effects.push({ kind: 'points', x: e.x + 8, y: e.y + 8, t: 0, delay: 28, duration: 40, value: points })
    this.events.push('enemyDie')
  }

  // ---------------------------------------------------------------- bullets

  private updateBullets(): void {
    for (const b of this.bullets) {
      const steps = Math.ceil(b.speed)
      for (let i = 0; i < steps && !b.dead; i++) this.stepBullet(b, b.speed / steps)
    }
    // Player and enemy bullets cancel each other out.
    for (const a of this.bullets) {
      if (a.dead || a.fromPlayer < 0) continue
      for (const b of this.bullets) {
        if (b.dead || b.fromPlayer >= 0) continue
        if (overlaps(a.x - 2, a.y - 2, 4, 4, b.x - 2, b.y - 2, 4, 4)) {
          a.dead = true
          b.dead = true
        }
      }
    }
    for (const b of this.bullets) if (b.dead) b.tank.bullets = Math.max(0, b.tank.bullets - 1)
    this.bullets = this.bullets.filter(b => !b.dead)
  }

  private explodeBullet(b: Bullet): void {
    b.dead = true
    this.effects.push({ kind: 'small', x: b.x, y: b.y, t: 0, delay: 0, duration: 12 })
  }

  private stepBullet(b: Bullet, dist: number): void {
    b.x += DX[b.dir] * dist
    b.y += DY[b.dir] * dist
    const cx = Math.round(b.x)
    const cy = Math.round(b.y)
    const isPlayer = b.fromPlayer >= 0

    if (cx < 2 || cy < 2 || cx > FIELD - 2 || cy > FIELD - 2) {
      b.x = Math.min(Math.max(b.x, 0), FIELD)
      b.y = Math.min(Math.max(b.y, 0), FIELD)
      this.explodeBullet(b)
      if (isPlayer) this.events.push('wall')
      return
    }

    const hit = this.level.bulletHit(cx, cy, b.dir, b.power)
    if (hit !== 'none') {
      this.explodeBullet(b)
      if (isPlayer) this.events.push(hit === 'steel' ? 'steel' : 'brick')
      return
    }

    if (this.eagleAlive && overlaps(cx - 2, cy - 2, 4, 4, EAGLE_X, EAGLE_Y, SIZE, SIZE)) {
      this.explodeBullet(b)
      this.destroyEagle()
      return
    }
    if (!this.eagleAlive && overlaps(cx - 2, cy - 2, 4, 4, EAGLE_X, EAGLE_Y, SIZE, SIZE)) {
      this.explodeBullet(b)
      return
    }

    if (isPlayer) {
      const shooter = this.players[b.fromPlayer]
      for (const e of this.enemies) {
        if (e.spawning > 0 || !overlaps(cx - 2, cy - 2, 4, 4, e.x, e.y, SIZE, SIZE)) continue
        this.explodeBullet(b)
        this.hitEnemy(e, shooter)
        return
      }
      for (const p of this.players) {
        const t = p.tank
        if (p === shooter || !t || t.spawning > 0 || !overlaps(cx - 2, cy - 2, 4, 4, t.x, t.y, SIZE, SIZE)) continue
        b.dead = true
        if (t.shield === 0) {
          t.paralyzed = FRAMES.paralyzed
          this.events.push('paralyze')
        }
        return
      }
    } else {
      for (const p of this.players) {
        const t = p.tank
        if (!t || t.spawning > 0 || !overlaps(cx - 2, cy - 2, 4, 4, t.x, t.y, SIZE, SIZE)) continue
        if (t.shield > 0) {
          b.dead = true
          this.events.push('shieldHit')
        } else {
          this.explodeBullet(b)
          this.killPlayer(p)
        }
        return
      }
    }
  }

  destroyEagle(): void {
    if (!this.eagleAlive) return
    this.eagleAlive = false
    this.effects.push({ kind: 'big', x: EAGLE_X + 8, y: EAGLE_Y + 8, t: 0, delay: 0, duration: 28 })
    this.events.push('eagle')
  }

  // ---------------------------------------------------------------- power-ups

  spawnPowerUp(kind?: PowerUpKind): void {
    const k = kind ?? POWERUP_KINDS[Math.floor(this.rng() * POWERUP_KINDS.length)]
    let x = 0
    let y = 0
    for (let tries = 0; tries < 40; tries++) {
      x = Math.floor(this.rng() * 24) * 8
      y = Math.floor(this.rng() * 24) * 8
      const nearBase = overlaps(x, y, SIZE, SIZE, EAGLE_X - 16, EAGLE_Y - 16, 48, 32)
      const cell = this.level.get((x + 8) >> 2, (y + 8) >> 2)
      if (!nearBase && cell !== WATER && cell !== STEEL) break
    }
    this.powerup = { kind: k, x, y, age: 0 }
    this.events.push('powerupAppear')
  }

  private checkPowerUp(): void {
    const pu = this.powerup
    if (!pu) return
    pu.age++
    for (const p of this.players) {
      const t = p.tank
      if (!t || t.spawning > 0 || !overlaps(t.x, t.y, SIZE, SIZE, pu.x, pu.y, SIZE, SIZE)) continue
      this.powerup = null
      this.applyPowerUp(p, pu.kind)
      this.addScore(p, POWERUP_POINTS)
      this.effects.push({ kind: 'points', x: pu.x + 8, y: pu.y + 8, t: 0, delay: 0, duration: 40, value: POWERUP_POINTS })
      return
    }
  }

  applyPowerUp(p: Player, kind: PowerUpKind): void {
    this.events.push(kind === 'tank' ? 'life' : 'powerup')
    switch (kind) {
      case 'helmet':
        if (p.tank) p.tank.shield = FRAMES.helmetShield
        break
      case 'timer':
        this.freezeTimer = FRAMES.freeze
        break
      case 'shovel':
        this.shovelTimer = FRAMES.shovel
        this.level.setBaseWalls(STEEL)
        break
      case 'star':
        p.stars = Math.min(MAX_STARS, p.stars + 1)
        break
      case 'grenade':
        for (const e of this.enemies) {
          if (e.spawning > 0) continue
          this.effects.push({ kind: 'big', x: e.x + 8, y: e.y + 8, t: 0, delay: 0, duration: 28 })
        }
        this.enemies = this.enemies.filter(e => e.spawning > 0)
        this.events.push('enemyDie')
        break
      case 'tank':
        p.lives++
        break
    }
  }

  // ---------------------------------------------------------------- timers / phase

  private updateTimers(): void {
    if (this.freezeTimer > 0) this.freezeTimer--
    if (this.shovelTimer > 0) {
      this.shovelTimer--
      if (this.shovelTimer === 0) this.level.setBaseWalls(BRICK)
      else if (this.shovelTimer < FRAMES.shovelBlink) {
        this.level.setBaseWalls((this.shovelTimer >> 4) % 2 === 0 ? BRICK : STEEL)
      }
    }
  }

  private updateEffects(): void {
    for (const fx of this.effects) {
      if (fx.delay > 0) fx.delay--
      else fx.t++
    }
    this.effects = this.effects.filter(fx => fx.t < fx.duration)
  }

  private updatePhase(): void {
    if (this.phase !== 'over' && (!this.eagleAlive || this.players.every(p => p.out))) {
      this.phase = 'over'
      this.phaseTimer = 0
      return
    }
    if (this.phase === 'play' && this.spawned >= ENEMIES_PER_STAGE && this.enemies.length === 0) {
      this.phase = 'clear'
      this.phaseTimer = 0
      return
    }
    if (this.phase === 'clear') {
      if (++this.phaseTimer >= FRAMES.stageClearDelay) this.finished = 'clear'
    } else if (this.phase === 'over') {
      if (++this.phaseTimer >= FRAMES.gameOverDelay) this.finished = 'over'
    }
  }
}
