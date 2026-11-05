import { describe, expect, it } from 'vitest'
import { ATTRIBUTE_IDS } from '../attributes'
import { dayRange } from '../dates'
import { dayFactsOf, deriveGameState } from '../engine'
import { hpCalendar, restDaySet } from '../hpRules'
import { dayHistory } from '../statistics'
import {
  completeRange,
  makeChapter,
  makeCompletion,
  makeGameData,
  makeHabit,
  makeLedgerEntry,
  makeMainQuest,
  makeRestPeriod,
  makeSideQuest,
} from '../testing'
import type { GameData } from '../types'
import { chronicleDays, chronicleIndex, firstXpDay } from './chronicleDays'

const TODAY = '2026-11-04'

/** Ein bunter Verlauf: Wochentags- und Wochenquest, Pause, Grabstein, Rast, Teilfortschritt, Doppelte, Nebenquest. */
function mixedData(): GameData {
  const daily = makeHabit({ id: 'daily', difficulty: 'easy', attribute: 'strength', createdDay: '2026-10-01' })
  const weekdays = makeHabit({
    id: 'weekdays',
    difficulty: 'hard',
    attribute: 'wisdom',
    schedule: { type: 'weekdays', days: [1, 3, 5] },
    createdDay: '2026-10-01',
    pauses: [{ from: '2026-10-12', until: '2026-10-15' }],
    order: 1,
  })
  const weekly = makeHabit({
    id: 'weekly',
    difficulty: 'medium',
    attribute: 'charisma',
    schedule: { type: 'weekly', times: 2 },
    createdDay: '2026-10-01',
    order: 2,
  })
  return makeGameData({
    profile: { name: 'Aria', avatar: '🧙', createdDay: '2026-10-01' },
    settings: { dayStartHour: 4, effects: true, penalties: { enabled: true, since: '2026-10-20' } },
    habits: [daily, weekdays, weekly],
    deletedHabits: [{ id: 'gone', createdDay: '2026-10-01', archivedDay: '2026-10-18', schedule: { type: 'daily' } }],
    completions: [
      ...completeRange(daily, '2026-10-01', '2026-10-24'),
      ...completeRange(daily, '2026-10-27', '2026-11-04'),
      ...dayRange('2026-10-01', '2026-11-03')
        .filter((day) => new Date(`${day}T00:00:00Z`).getUTCDay() % 2 === 1)
        .map((day) => makeCompletion(weekdays, day)),
      makeCompletion(weekly, '2026-10-06'),
      makeCompletion(weekly, '2026-10-08'),
      makeCompletion(weekly, '2026-10-21', { value: 0 }),
      makeCompletion(weekly, '2026-10-22'),
      makeCompletion(weekly, '2026-10-22', { updatedAt: 5, value: 0 }), // doppelt: der spätere gilt
      makeCompletion(makeHabit({ id: 'gone' }), '2026-10-10'),
    ],
    restPeriods: [makeRestPeriod('rast', '2026-10-25', '2026-10-26')],
    hpLedger: [
      makeLedgerEntry('2026-10-20', { score: 'good' }),
      makeLedgerEntry('2026-10-21', { score: 'weak', frozen: true }),
    ],
    sideQuests: [makeSideQuest({ id: 's', attribute: 'vitality', difficulty: 'hard', doneDay: '2026-10-14' })],
    mainQuests: [
      makeMainQuest({
        id: 'm',
        startDay: '2026-10-01',
        chapters: [makeChapter({ id: 'c', criterion: { type: 'habit', habitId: 'daily', metric: 'streak', target: 10 } })],
      }),
    ],
  })
}

describe('chronicleIndex', () => {
  it('rechnet die Tagesfakten genau wie dayFactsOf der Engine', () => {
    const data = mixedData()
    const index = chronicleIndex(data, TODAY)
    const engineFacts = dayFactsOf(data, TODAY, restDaySet(data.restPeriods))
    for (const day of dayRange('2026-09-28', '2026-11-08')) expect(index.factsOf(day)).toEqual(engineFacts(day))
  })

  it('hat dieselben Schontage wie der Kalender der Engine', () => {
    const data = mixedData()
    const restDays = restDaySet(data.restPeriods)
    const engine = hpCalendar(data, TODAY, restDays, dayFactsOf(data, TODAY, restDays))
    expect([...chronicleIndex(data, TODAY).freeDays].sort()).toEqual([...engine.freeDays].sort())
    expect(chronicleIndex(data, TODAY).freeDays.has('2026-10-21')).toBe(true)
  })

  it('kennt die aktiven Tage und den ersten Tag mit Attribut-XP', () => {
    const data = mixedData()
    const index = chronicleIndex(data, TODAY)
    expect(index.activeDays.length).toBe(deriveGameState(data, TODAY).totals.activeDays)
    expect(firstXpDay(index, data)).toBe('2026-10-01')
  })
})

describe('chronicleDays', () => {
  it('zählt je Tag dieselben XP wie die Statistik', () => {
    const data = mixedData()
    const history = dayHistory(data, TODAY)
    const { days } = chronicleDays(chronicleIndex(data, TODAY), data, deriveGameState(data, TODAY), {
      from: history.from,
      to: TODAY,
    })
    for (const stat of history.days) {
      const entry = days.get(stat.day)
      expect(entry, stat.day).toBeDefined()
      expect([entry?.xp, entry?.done, entry?.perfect, entry?.rest], stat.day).toEqual([stat.xp, stat.done, stat.perfect, stat.rest])
    }
  })

  it('sammelt die Attribut-XP der Geschichte wie die Engine', () => {
    const data = { ...mixedData(), hpLedger: [], settings: { dayStartHour: 4, effects: true } }
    const through = '2026-10-25'
    const { entries } = chronicleDays(chronicleIndex(data, TODAY), data, deriveGameState(data, TODAY), {
      from: through,
      to: through,
      entriesThrough: through,
    })
    const state = deriveGameState(data, through)
    for (const attribute of ATTRIBUTE_IDS) {
      const sum = entries.filter((entry) => entry.attribute === attribute).reduce((total, entry) => total + entry.xp, 0)
      expect(sum, attribute).toBe(state.attributes[attribute].totalXp)
    }
  })

  it('kennt den besten Tages-Streak am Ende jedes Tages', () => {
    const data = mixedData()
    const { days } = chronicleDays(chronicleIndex(data, TODAY), data, deriveGameState(data, TODAY), {
      from: '2026-10-01',
      to: '2026-10-05',
      streaks: true,
    })
    // Die tägliche Quest wächst jeden Tag; die Wochentags-Quest (Mo/Mi/Fr) bleibt darunter.
    expect([...days.values()].map((entry) => entry.bestStreak)).toEqual([1, 2, 3, 4, 5])
  })

  it('liefert für einen leeren Zeitraum nichts', () => {
    const data = mixedData()
    const result = chronicleDays(chronicleIndex(data, TODAY), data, deriveGameState(data, TODAY), {
      from: '2026-10-05',
      to: '2026-10-01',
    })
    expect(result.days.size).toBe(0)
    expect(result.entries).toEqual([])
  })
})
