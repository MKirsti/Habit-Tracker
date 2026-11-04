/**
 * Review Phase 2b: Statistik, Ruhmeshalle und Abrechnung an Kalender-Rändern (Schaltjahr, Zeitumstellung,
 * Jahreswechsel mit ISO-Woche 53, leerer Verlauf) und mit drei Jahren Verlauf (Laufzeit).
 */
import { describe, expect, it } from 'vitest'
import { DEFAULT_SETTINGS } from './balancing'
import { addDays, dayRange, isoWeekday, startOfWeek } from './dates'
import { deriveGameState, getDayState } from './engine'
import { hallOfFame } from './hallOfFame'
import { settleDays } from './hp'
import { completionRates, dayHistory, habitHeatmap, heatmap, scoreCounts, statOn, weeklyXp, xpTimeline } from './statistics'
import {
  makeCompletion,
  makeGameData,
  makeHabit,
  makeItemPurchase,
  makeMainQuest,
  makeRestPeriod,
  seededRandom,
} from './testing'
import type { Completion, DayKey, GameData, Habit, HpLedgerEntry } from './types'

function hero(start: DayKey, overrides: Partial<GameData> = {}): GameData {
  return makeGameData({
    profile: { name: 'Mira', avatar: '🧙', createdDay: start },
    settings: { ...DEFAULT_SETTINGS, penalties: { enabled: true, since: start } },
    ...overrides,
  })
}

/** XP-Summe der Historie = Gesamt-XP der Engine, und jeder Tag wie getDayState. */
function expectConsistent(data: GameData, today: DayKey): void {
  const history = dayHistory(data, today)
  expect(history.days.length).toBe(dayRange(history.from, today).length)
  expect(history.days.map((stat) => stat.day)).toStrictEqual(dayRange(history.from, today))
  expect(history.days.at(-1)?.totalXp).toBe(deriveGameState(data, today).level.totalXp)
  for (const stat of history.days) {
    const state = getDayState(data, stat.day)
    expect([stat.required, stat.requiredDone, stat.perfect, stat.questXp], stat.day).toStrictEqual([
      state.requiredCount,
      state.requiredDone,
      state.perfect,
      state.questXp,
    ])
  }
}

describe('Review 2b – Statistik an Kalender-Rändern', () => {
  it('leerer Verlauf: ein Held von heute ohne Quests', () => {
    const today = '2026-11-04'
    const data = hero(today)
    const history = dayHistory(data, today)
    expect(history.days).toHaveLength(1)
    expect(history.days[0]).toMatchObject({ day: today, score: 'none', xp: 0, totalXp: 0, level: 1, open: true, settled: false })
    expect(weeklyXp(history, 12)).toHaveLength(12)
    expect(weeklyXp(history, 12).every((week) => week.xp === 0)).toBe(true)
    expect(xpTimeline(history)).toStrictEqual({ points: [{ day: today, totalXp: 0, level: 1 }], levelUps: [] })
    const grid = heatmap(history, 26)
    expect(grid).toHaveLength(26)
    expect(grid.flat().filter((cell) => cell.kind === 'tracked')).toHaveLength(1)
    expect(completionRates(data, today)).toStrictEqual([])
    expect(habitHeatmap(data, 'gibt-es-nicht', today, 4)).toStrictEqual([])
    expect(scoreCounts(history)).toMatchObject({ none: 1 })
    expect(hallOfFame(data, today)).toStrictEqual([])
    // Kein Wochentag fehlt, kein Tag doppelt: 26 Wochen ab Montag.
    expect(grid[0][0].day).toBe(addDays(startOfWeek(today), -25 * 7))
  })

  it('Schaltjahr: der 29. Februar ist ein ganz normaler Tag (Historie, Heatmap, Abrechnung)', () => {
    const start = '2028-02-24'
    const today = '2028-03-03'
    const habit = makeHabit({ id: 'h', createdDay: start, difficulty: 'easy' })
    const completions = dayRange(start, today).filter((day) => day !== '2028-02-28').map((day) => makeCompletion(habit, day))
    let data = hero(start, { habits: [habit], completions })
    let ledger: HpLedgerEntry[] = []
    for (const day of dayRange(start, today)) {
      ledger = [...ledger, ...settleDays({ ...data, hpLedger: ledger }, day)]
    }
    data = { ...data, hpLedger: ledger }
    expect(ledger.map((entry) => entry.day)).toStrictEqual(dayRange(start, '2028-03-01'))
    expect(ledger.find((entry) => entry.day === '2028-02-29')?.score).toBe('perfect')
    expect(ledger.find((entry) => entry.day === '2028-02-28')?.score).toBe('missed')
    expectConsistent(data, today)
    const history = dayHistory(data, today)
    expect(statOn(history, '2028-02-29')).toMatchObject({ day: '2028-02-29', perfect: true, settled: true })
    expect(isoWeekday('2028-02-29')).toBe(2)
    const week = heatmap(history, 2).find((column) => column.some((cell) => cell.day === '2028-02-29'))
    expect(week?.map((cell) => cell.day)).toStrictEqual(dayRange('2028-02-28', '2028-03-05'))
    // Streak: 28. Februar verpasst → Serie ab dem 29. Februar (4 Tage bis 3. März).
    expect(deriveGameState(data, today).todayState.habits[0].streak).toMatchObject({ current: 4 })
  })

  it('Zeitumstellung (Ende Oktober, Ende März) und Jahreswechsel mit ISO-Woche 53: lückenlos, jede Woche ab Montag', () => {
    const start = '2026-03-23'
    const today = '2027-01-06'
    const rnd = seededRandom(2026)
    const habits: Habit[] = [
      makeHabit({ id: 'a', createdDay: start, difficulty: 'easy' }),
      makeHabit({ id: 'b', createdDay: start, difficulty: 'medium', order: 1, schedule: { type: 'weekdays', days: [1, 2, 3, 4, 5] } }),
      makeHabit({ id: 'w', createdDay: start, order: 2, schedule: { type: 'weekly', times: 2 } }),
    ]
    const completions: Completion[] = []
    for (const day of dayRange(start, today)) for (const habit of habits) if (rnd() < 0.7) completions.push(makeCompletion(habit, day))
    const data = hero(start, {
      habits,
      completions,
      restPeriods: [makeRestPeriod('dst-ende', '2026-10-24', '2026-10-26'), makeRestPeriod('jahr', '2026-12-31', '2027-01-01')],
    })
    expectConsistent(data, today)
    const history = dayHistory(data, today)
    for (const day of ['2026-03-29', '2026-10-25', '2026-12-28', '2027-01-03']) expect(statOn(history, day)?.day).toBe(day)
    expect(statOn(history, '2026-10-25')).toMatchObject({ rest: true, score: 'rest', required: 0 })
    const weeks = weeklyXp(history, 4)
    // 2026-12-28 ist der Montag der ISO-Woche 53.
    expect(weeks.map((week) => week.weekStart)).toStrictEqual(['2026-12-14', '2026-12-21', '2026-12-28', '2027-01-04'])
    const sum = weeks.reduce((total, week) => total + week.xp, 0)
    const last28 = history.days.filter((stat) => stat.day >= '2026-12-14').reduce((total, stat) => total + stat.xp, 0)
    expect(sum).toBe(last28)
    for (const column of heatmap(history, 53)) expect(isoWeekday(column[0].day)).toBe(1)
  })
})

describe('Review 2b – Laufzeit mit drei Jahren Verlauf', () => {
  it('Abrechnung (alles auf einmal), Spielstand, Statistik und Ruhmeshalle bleiben schnell', () => {
    const start = '2023-11-01'
    const today = '2026-11-04'
    const rnd = seededRandom(7)
    const habits: Habit[] = Array.from({ length: 12 }, (_, i) =>
      makeHabit({
        id: `q${i}`,
        order: i,
        createdDay: start,
        difficulty: i % 3 === 0 ? 'hard' : 'easy',
        schedule: i % 4 === 3 ? { type: 'weekly', times: 3 } : { type: 'daily' },
      }),
    )
    const completions: Completion[] = []
    for (const [i, day] of dayRange(start, today).entries()) {
      // Phasen à 40 Tage: gute Zeiten, durchwachsene Zeiten, Durststrecken (Niederlagen).
      const phase = Math.floor(i / 40) % 3
      if (phase === 2) {
        // Durststrecke: an jedem 4. Tag ein guter Tag (5 von 9 Tagesquests ≥ 50 % → +2, beendet die Pause),
        // dazwischen nichts (3 schadende Tage, je −6) – je 4 Tage −16 HP: So kommt es auch mit der Durchhänger-Pause
        // (höchstens 3 schadende Tage je Durchhänger) zu Niederlagen.
        if (i % 4 === 0) for (const habit of habits.slice(0, 6)) completions.push(makeCompletion(habit, day))
        continue
      }
      const chance = phase === 0 ? 0.9 : 0.3
      for (const habit of habits) if (rnd() < chance || (habit.schedule.type === 'weekly' && rnd() < 0.3)) completions.push(makeCompletion(habit, day))
    }
    const purchases = dayRange(start, today)
      .filter((_, i) => i % 30 === 0)
      .flatMap((day, i) => [makeItemPurchase(`f${i}`, 'streakFreeze', day), makeItemPurchase(`p${i}`, 'healingPotion', day)])
    const restPeriods = Array.from({ length: 12 }, (_, i) => makeRestPeriod(`r${i}`, addDays(start, 90 * i + 50), addDays(start, 90 * i + 56)))
    const campaign = makeMainQuest({
      id: 'mq',
      startDay: start,
      chapters: [
        { id: 'c1', title: 'Hundert', criterion: { type: 'habit', habitId: 'q0', metric: 'completions', target: 100 } },
        { id: 'c2', title: 'Serie', criterion: { type: 'habit', habitId: 'q1', metric: 'streak', target: 10 } },
      ],
    })
    const data = hero(start, { habits, completions, purchases, restPeriods, mainQuests: [campaign] })

    let t = performance.now()
    const ledger = settleDays(data, today)
    const settleMs = performance.now() - t
    expect(ledger).toHaveLength(dayRange(start, addDays(today, -2)).length)
    expect(ledger.some((entry) => entry.defeat !== undefined)).toBe(true)
    expect(ledger.some((entry) => entry.frozen)).toBe(true)
    const settled = { ...data, hpLedger: ledger }

    t = performance.now()
    const state = deriveGameState(settled, today)
    const deriveMs = performance.now() - t
    t = performance.now()
    const history = dayHistory(settled, today)
    completionRates(settled, today)
    heatmap(history, 52)
    xpTimeline(history)
    hallOfFame(settled, today, [...state.mainQuests, ...state.archivedMainQuests])
    const statsMs = performance.now() - t

    expect(history.days.at(-1)?.totalXp).toBe(state.level.totalXp)
    expect(history.days.filter((stat) => stat.settled).map((stat) => stat.score)).toStrictEqual(ledger.map((entry) => entry.score))
    // Großzügige Grenzen (gemessen: wenige hundert ms), damit langsame CI-Rechner nicht scheitern.
    expect(settleMs).toBeLessThan(4000)
    expect(deriveMs).toBeLessThan(1500)
    expect(statsMs).toBeLessThan(1500)
  })
})
