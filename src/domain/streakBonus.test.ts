import { describe, expect, it } from 'vitest'
import { BALANCING, DIFFICULTIES } from './balancing'
import { dayRange } from './dates'
import { questXp } from './schedule'
import { streakBonusesOn, streakBonusForRun, xpWithStreakBonus } from './streakBonus'
import { daySetRange, makeHabit } from './testing'

describe('streakBonusForRun', () => {
  it('+5 % pro Schritt vor dem Tag: Tag 1 +0 %, Tag 2 +5 %, …, ab Tag 11 +50 %', () => {
    expect(BALANCING.streakBonusPerStep).toBe(0.05)
    expect(BALANCING.streakBonusMax).toBe(0.5)
    // Index = Serie vor dem Tag (Tag 1 einer Serie: 0)
    expect([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 50, 365].map(streakBonusForRun)).toEqual([
      0, 0.05, 0.1, 0.15, 0.2, 0.25, 0.3, 0.35, 0.4, 0.45, 0.5, 0.5, 0.5, 0.5,
    ])
  })

  it('ungültige Serien geben keinen Bonus, eine unendliche den Höchstwert', () => {
    expect(streakBonusForRun(-3)).toBe(0)
    expect(streakBonusForRun(Number.NaN)).toBe(0)
    expect(streakBonusForRun(Number.POSITIVE_INFINITY)).toBe(0.5)
  })
})

describe('xpWithStreakBonus', () => {
  it('rundet kaufmännisch: 10 XP × 1,05 = 10,5 → 11; × 1,15 = 11,5 → 12 (kein Gleitkomma-Ausreißer)', () => {
    expect(xpWithStreakBonus(10, 0)).toBe(10)
    expect(xpWithStreakBonus(10, 0.05)).toBe(11)
    expect(xpWithStreakBonus(10, 0.15)).toBe(12)
    expect(xpWithStreakBonus(10, 0.35)).toBe(14)
    expect(xpWithStreakBonus(10, 0.45)).toBe(15)
    expect(xpWithStreakBonus(10, 0.5)).toBe(15)
    expect(xpWithStreakBonus(20, 0.05)).toBe(21)
    expect(xpWithStreakBonus(40, 0.25)).toBe(50)
    expect(xpWithStreakBonus(80, 0.5)).toBe(120)
    expect(xpWithStreakBonus(0, 0.5)).toBe(0)
  })

  it('stimmt für jede Schwierigkeit und Serie mit der Rechnung in ganzen Prozent überein', () => {
    for (const difficulty of DIFFICULTIES) {
      const base = questXp(difficulty)
      for (let run = 0; run <= 12; run++) {
        const percent = Math.min(5 * run, 50)
        expect(xpWithStreakBonus(base, streakBonusForRun(run)), `${difficulty}, Serie ${run}`).toBe(
          Math.round((base * (100 + percent)) / 100),
        )
      }
    }
  })
})

describe('streakBonusesOn', () => {
  it('liefert den Bonus je Tag: tägliche Quest, jeden Tag erledigt', () => {
    const habit = makeHabit({ id: 'h', createdDay: '2026-11-01' })
    const days = dayRange('2026-11-01', '2026-11-13')
    const bonuses = streakBonusesOn(habit, daySetRange('2026-11-01', '2026-11-13'), days)
    expect(bonuses.slice(0, 3)).toEqual([0, 0.05, 0.1])
    expect(bonuses[10]).toBe(0.5) // Tag 11
    expect(bonuses.at(-1)).toBe(0.5)
    // Gutgeschrieben (mittel, 20 XP): 20, 21, 22, … 30 ab Tag 11
    expect(bonuses.map((bonus) => xpWithStreakBonus(20, bonus))).toEqual([20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 30, 30])
  })
})
