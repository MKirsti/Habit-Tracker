import { describe, expect, it } from 'vitest'
import { BALANCING, RANKS } from './balancing'
import {
  attributeLevelFromXp,
  levelFromXp,
  rankForLevel,
  xpToNextAttributeLevel,
  xpToNextLevel,
} from './leveling'

/** Summe der XP, die nötig sind, um von Level 1 auf `level` zu kommen. */
function totalXpForLevel(level: number, costOf: (level: number) => number): number {
  let sum = 0
  for (let n = 1; n < level; n++) sum += costOf(n)
  return sum
}

describe('xpToNextLevel', () => {
  it('folgt round(100 × n^1.5) (Werte aus dem Plan)', () => {
    expect(xpToNextLevel(1)).toBe(100)
    expect(xpToNextLevel(2)).toBe(283)
    expect(xpToNextLevel(3)).toBe(520)
    expect(xpToNextLevel(5)).toBe(1118)
    expect(xpToNextLevel(10)).toBe(3162)
  })

  it('wächst streng monoton', () => {
    for (let n = 1; n < 100; n++) expect(xpToNextLevel(n + 1)).toBeGreaterThan(xpToNextLevel(n))
  })
})

describe('xpToNextAttributeLevel', () => {
  it('folgt round(40 × n^1.25) und ist flacher als die Charakter-Kurve', () => {
    expect(xpToNextAttributeLevel(1)).toBe(40)
    expect(xpToNextAttributeLevel(2)).toBe(95)
    expect(xpToNextAttributeLevel(3)).toBe(158)
    for (let n = 1; n < 50; n++) expect(xpToNextAttributeLevel(n)).toBeLessThan(xpToNextLevel(n))
  })
})

describe('levelFromXp', () => {
  it('beginnt bei Level 1 mit 0 XP', () => {
    expect(levelFromXp(0)).toEqual({ level: 1, totalXp: 0, xpIntoLevel: 0, xpForNextLevel: 100, progress: 0 })
  })

  it('steigt genau an der Schwelle auf: 100 XP → Level 2 mit 0 XP ins Level', () => {
    expect(levelFromXp(99)).toEqual({ level: 1, totalXp: 99, xpIntoLevel: 99, xpForNextLevel: 100, progress: 0.99 })
    expect(levelFromXp(100)).toEqual({ level: 2, totalXp: 100, xpIntoLevel: 0, xpForNextLevel: 283, progress: 0 })
    expect(levelFromXp(101).xpIntoLevel).toBe(1)
  })

  it('rechnet mehrere Level zusammen (100 + 283 = 383 → Level 3)', () => {
    expect(levelFromXp(382)).toMatchObject({ level: 2, xpIntoLevel: 282, xpForNextLevel: 283 })
    expect(levelFromXp(383)).toMatchObject({ level: 3, xpIntoLevel: 0, xpForNextLevel: 520 })
  })

  it('liegt für jede Schwelle exakt auf dem Levelanfang', () => {
    for (let level = 1; level <= 60; level++) {
      const threshold = totalXpForLevel(level, xpToNextLevel)
      expect(levelFromXp(threshold)).toMatchObject({ level, xpIntoLevel: 0, progress: 0 })
      if (threshold > 0) expect(levelFromXp(threshold - 1).level).toBe(level - 1)
    }
  })

  it('hält progress im Bereich 0..1 und konsistent zu xpIntoLevel / xpForNextLevel', () => {
    for (const xp of [0, 1, 50, 99, 100, 250, 383, 1000, 12_345, 99_999]) {
      const info = levelFromXp(xp)
      expect(info.progress).toBeGreaterThanOrEqual(0)
      expect(info.progress).toBeLessThan(1)
      expect(info.progress).toBeCloseTo(info.xpIntoLevel / info.xpForNextLevel, 10)
      expect(info.totalXp).toBe(xp)
    }
  })

  it('behandelt negative und ungültige Werte als 0 XP', () => {
    expect(levelFromXp(-50)).toMatchObject({ level: 1, totalXp: 0, xpIntoLevel: 0 })
    expect(levelFromXp(Number.NaN)).toMatchObject({ level: 1, totalXp: 0 })
    expect(levelFromXp(Number.POSITIVE_INFINITY)).toMatchObject({ level: 1, totalXp: 0 })
  })

  it('ist durch BALANCING.maxLevel begrenzt', () => {
    const info = levelFromXp(1e15)
    expect(info.level).toBe(BALANCING.maxLevel)
    expect(info.progress).toBe(1)
  })
})

describe('attributeLevelFromXp', () => {
  it('nutzt die Attribut-Kurve', () => {
    expect(attributeLevelFromXp(0)).toMatchObject({ level: 1, xpForNextLevel: 40 })
    expect(attributeLevelFromXp(39)).toMatchObject({ level: 1, xpIntoLevel: 39 })
    expect(attributeLevelFromXp(40)).toMatchObject({ level: 2, xpIntoLevel: 0, xpForNextLevel: 95 })
    expect(attributeLevelFromXp(135)).toMatchObject({ level: 3, xpIntoLevel: 0, xpForNextLevel: 158 })
  })
})

describe('rankForLevel', () => {
  it('wählt den Rang mit dem höchsten minLevel ≤ level', () => {
    expect(rankForLevel(1)).toBe('Novize')
    expect(rankForLevel(2)).toBe('Novize')
    expect(rankForLevel(3)).toBe('Lehrling')
    expect(rankForLevel(4)).toBe('Lehrling')
    expect(rankForLevel(5)).toBe('Wanderer')
    expect(rankForLevel(7)).toBe('Wanderer')
    expect(rankForLevel(8)).toBe('Abenteurer')
    expect(rankForLevel(39)).toBe('Legende')
    expect(rankForLevel(40)).toBe('Mythos')
    expect(rankForLevel(BALANCING.maxLevel)).toBe('Mythos')
  })

  it('trifft jede Rang-Schwelle exakt', () => {
    for (const rank of RANKS) expect(rankForLevel(rank.minLevel)).toBe(rank.title)
  })

  it('fällt unterhalb des ersten Rangs auf den ersten Rang zurück', () => {
    expect(rankForLevel(0)).toBe(RANKS[0].title)
  })
})
