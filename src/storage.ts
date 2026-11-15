import type { RankEntry } from './game/rules'

const KEY_RANKING = 'tankcity.ranking.v1'
const KEY_CUSTOM = 'tankcity.custom.v1'
const KEY_MUTED = 'tankcity.muted'
const KEY_NAME = 'tankcity.name'

function read<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key)
    return raw ? (JSON.parse(raw) as T) : fallback
  } catch {
    return fallback
  }
}

function write(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value))
  } catch {
    // Storage can be unavailable (private mode); the game still works without it.
  }
}

export const storage = {
  ranking: (): RankEntry[] => read<RankEntry[]>(KEY_RANKING, []),
  saveRanking: (t: RankEntry[]) => write(KEY_RANKING, t),
  customMap: (): string[] | null => read<string[] | null>(KEY_CUSTOM, null),
  saveCustomMap: (rows: string[] | null) => write(KEY_CUSTOM, rows),
  muted: (): boolean => read(KEY_MUTED, false),
  saveMuted: (m: boolean) => write(KEY_MUTED, m),
  lastName: (): string => read(KEY_NAME, 'AAA'),
  saveLastName: (n: string) => write(KEY_NAME, n),
}
