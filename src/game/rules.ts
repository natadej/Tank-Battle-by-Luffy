export type EnemyType = 0 | 1 | 2 | 3
export const BASIC: EnemyType = 0
export const FAST: EnemyType = 1
export const POWER: EnemyType = 2
export const ARMOR: EnemyType = 3
export const ENEMY_TYPES: readonly EnemyType[] = [BASIC, FAST, POWER, ARMOR]

/** Points awarded per enemy type. */
export const ENEMY_POINTS = [100, 200, 300, 400] as const
export const ENEMY_HP = [1, 1, 1, 4] as const
/** Movement in px per frame (60 fps). */
export const ENEMY_SPEED = [0.5, 1.25, 0.75, 0.5] as const
export const ENEMY_BULLET_SPEED = [2, 3, 4, 3] as const

export const ENEMIES_PER_STAGE = 20
/** 1-based spawn indices of the flashing tanks that drop a power-up. */
export const BONUS_TANK_INDICES = [4, 11, 18] as const
export const POWERUP_POINTS = 500
export const TWO_PLAYER_BONUS = 1000
export const EXTRA_LIFE_SCORE = 20000
export const DEFAULT_HI_SCORE = 20000
export const START_LIVES = 2
export const MAX_STARS = 3

export const PLAYER_SPEED = 0.75
export const PLAYER_BULLET_SPEED = [3, 4.5, 4.5, 4.5] as const
export const PLAYER_MAX_BULLETS = [1, 1, 2, 2] as const

export const FRAMES = {
  spawnSparkle: 64,
  spawnShield: 180,
  helmetShield: 600,
  freeze: 600,
  shovel: 1200,
  shovelBlink: 240,
  paralyzed: 240,
  respawnDelay: 60,
  stageClearDelay: 240,
  gameOverDelay: 300,
  iceSlide: 24,
} as const

export type PowerUpKind = 'helmet' | 'timer' | 'shovel' | 'star' | 'grenade' | 'tank'
export const POWERUP_KINDS: readonly PowerUpKind[] = ['helmet', 'timer', 'shovel', 'star', 'grenade', 'tank']

export function maxEnemiesOnField(players: number): number {
  return players > 1 ? 6 : 4
}

/** Frames between enemy spawns: shorter on later stages and with two players. */
export function spawnInterval(stage: number, players: number): number {
  return Math.max(30, 190 - stage * 4 - (players - 1) * 20)
}

export function isBonusTank(spawnIndex: number): boolean {
  return (BONUS_TANK_INDICES as readonly number[]).includes(spawnIndex)
}

export function enemyQueue(counts: readonly number[]): EnemyType[] {
  const queue: EnemyType[] = []
  counts.forEach((n, type) => {
    for (let i = 0; i < n; i++) queue.push(type as EnemyType)
  })
  return queue
}

export function tallyPoints(kills: readonly number[]): number {
  return kills.reduce((sum, n, type) => sum + n * ENEMY_POINTS[type], 0)
}

/**
 * In a two-player game the player who destroyed more tanks in the stage earns a bonus.
 * Returns the index of that player, or -1 on a tie / single player.
 */
export function stageBonusWinner(kills: readonly (readonly number[])[]): number {
  if (kills.length < 2) return -1
  const totals = kills.map(k => k.reduce((a, b) => a + b, 0))
  if (totals[0] === totals[1]) return -1
  return totals[0] > totals[1] ? 0 : 1
}

/** True when adding `gained` points crosses the extra-life threshold. */
export function crossesExtraLife(before: number, gained: number): boolean {
  return before < EXTRA_LIFE_SCORE && before + gained >= EXTRA_LIFE_SCORE
}

export interface RankEntry {
  name: string
  score: number
  stage: number
  players: number
  date: string
}

export const RANKING_SIZE = 10

/** Rank (0-based) a score would take, or -1 if it does not make the table. */
export function rankPosition(table: readonly RankEntry[], score: number): number {
  if (score <= 0) return -1
  const pos = table.findIndex(e => score > e.score)
  if (pos >= 0) return pos
  return table.length < RANKING_SIZE ? table.length : -1
}

export function insertRank(table: readonly RankEntry[], entry: RankEntry): { table: RankEntry[]; position: number } {
  const position = rankPosition(table, entry.score)
  if (position < 0) return { table: [...table], position }
  const next = [...table]
  next.splice(position, 0, entry)
  return { table: next.slice(0, RANKING_SIZE), position }
}

/** Military-style rank title for the final score, shown on the ranking screen. */
export function rankTitle(score: number): string {
  const titles: [number, string][] = [
    [200000, 'GENERAL'],
    [120000, 'COLONEL'],
    [80000, 'MAJOR'],
    [50000, 'CAPTAIN'],
    [30000, 'LIEUTENANT'],
    [15000, 'SERGEANT'],
    [5000, 'CORPORAL'],
    [0, 'PRIVATE'],
  ]
  return titles.find(([min]) => score >= min)![1]
}
