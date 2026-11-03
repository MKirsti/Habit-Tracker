import { describe, expect, it } from 'vitest'
import {
  describeSchedule,
  doneDaysInWeek,
  habitTarget,
  isActiveOn,
  isDone,
  isRequiredOn,
  isScheduledWeekday,
  isVisibleOn,
  questXp,
  reachesTarget,
} from './schedule'
import { daySet, makeHabit } from './testing'
import type { Difficulty } from './types'

// Kalender-Referenz: 2026-11-02 ist ein Montag, 2026-11-08 ein Sonntag.

describe('isActiveOn', () => {
  const habit = makeHabit({ id: 'h', createdDay: '2026-11-03', archivedDay: '2026-11-10' })

  it('ist ab createdDay (inklusive) aktiv', () => {
    expect(isActiveOn(habit, '2026-11-02')).toBe(false)
    expect(isActiveOn(habit, '2026-11-03')).toBe(true)
  })

  it('ist ab archivedDay (inklusive) nicht mehr aktiv', () => {
    expect(isActiveOn(habit, '2026-11-09')).toBe(true)
    expect(isActiveOn(habit, '2026-11-10')).toBe(false)
    expect(isActiveOn(habit, '2026-12-01')).toBe(false)
  })

  it('ist ohne archivedDay unbegrenzt aktiv', () => {
    expect(isActiveOn(makeHabit({ id: 'x', createdDay: '2026-11-03' }), '2030-01-01')).toBe(true)
  })
})

describe('isScheduledWeekday', () => {
  it('kennt die festen Plantage je Rhythmus', () => {
    expect(isScheduledWeekday({ type: 'daily' }, 3)).toBe(true)
    expect(isScheduledWeekday({ type: 'weekdays', days: [1, 3, 5] }, 3)).toBe(true)
    expect(isScheduledWeekday({ type: 'weekdays', days: [1, 3, 5] }, 2)).toBe(false)
    expect(isScheduledWeekday({ type: 'weekly', times: 3 }, 3)).toBe(false)
  })
})

describe('isRequiredOn', () => {
  it('daily ist jeden aktiven Tag Pflicht', () => {
    const habit = makeHabit({ id: 'h', createdDay: '2026-11-03', archivedDay: '2026-11-05' })
    expect(isRequiredOn(habit, '2026-11-02')).toBe(false)
    expect(isRequiredOn(habit, '2026-11-03')).toBe(true)
    expect(isRequiredOn(habit, '2026-11-04')).toBe(true)
    expect(isRequiredOn(habit, '2026-11-05')).toBe(false)
  })

  it('weekdays ist nur an passenden Wochentagen Pflicht', () => {
    const habit = makeHabit({ id: 'h', schedule: { type: 'weekdays', days: [1, 3, 5] } })
    expect(isRequiredOn(habit, '2026-11-02')).toBe(true) // Mo
    expect(isRequiredOn(habit, '2026-11-03')).toBe(false) // Di
    expect(isRequiredOn(habit, '2026-11-04')).toBe(true) // Mi
    expect(isRequiredOn(habit, '2026-11-06')).toBe(true) // Fr
    expect(isRequiredOn(habit, '2026-11-08')).toBe(false) // So
  })

  it('Wochenquests sind nie Pflicht', () => {
    const habit = makeHabit({ id: 'h', schedule: { type: 'weekly', times: 7 } })
    expect(isRequiredOn(habit, '2026-11-03')).toBe(false)
  })
})

describe('isVisibleOn', () => {
  it('zeigt Wochenquests an jedem aktiven Tag', () => {
    const habit = makeHabit({
      id: 'h',
      schedule: { type: 'weekly', times: 2 },
      createdDay: '2026-11-03',
      archivedDay: '2026-11-20',
    })
    expect(isVisibleOn(habit, '2026-11-02')).toBe(false)
    expect(isVisibleOn(habit, '2026-11-03')).toBe(true)
    expect(isVisibleOn(habit, '2026-11-08')).toBe(true)
    expect(isVisibleOn(habit, '2026-11-20')).toBe(false)
  })

  it('zeigt Tagesquests nur an Plantagen', () => {
    const habit = makeHabit({ id: 'h', schedule: { type: 'weekdays', days: [6, 7] } })
    expect(isVisibleOn(habit, '2026-11-06')).toBe(false)
    expect(isVisibleOn(habit, '2026-11-07')).toBe(true)
    expect(isVisibleOn(habit, '2026-11-08')).toBe(true)
  })
})

describe('questXp', () => {
  it('liest die XP je Schwierigkeit aus dem Balancing', () => {
    expect(questXp('easy')).toBe(10)
    expect(questXp('medium')).toBe(20)
    expect(questXp('hard')).toBe(40)
    expect(questXp('epic')).toBe(80)
  })

  it('gibt für unbekannte Schwierigkeiten (kaputte/neuere Daten) 0 XP statt undefined', () => {
    expect(questXp('legendary' as Difficulty)).toBe(0)
    // Auch geerbte Objekt-Eigenschaften dürfen nicht als Schwierigkeit durchgehen
    expect(questXp('constructor' as Difficulty)).toBe(0)
  })
})

describe('isDone', () => {
  it('ist erledigt, sobald value ≥ target', () => {
    expect(isDone({ value: 1, target: 1 })).toBe(true)
    expect(isDone({ value: 12, target: 10 })).toBe(true)
    expect(isDone({ value: 9, target: 10 })).toBe(false)
    expect(isDone({ value: 1.5, target: 2 })).toBe(false)
  })

  it('übersieht Gleitkomma-Rauschen aufaddierter Schritte (10 × 0,2 L = 2 L)', () => {
    let water = 0
    for (let i = 0; i < 10; i++) water += 0.2
    expect(water).toBeLessThan(2) // 1.9999999999999998 – genau das Problem
    expect(isDone({ value: water, target: 2 })).toBe(true)
    expect(isDone({ value: 0.7 + 0.1, target: 0.8 })).toBe(true)
    // Echte Unterschreitungen bleiben unerledigt – auch knapp und bei großen Zielen
    expect(isDone({ value: 1.999, target: 2 })).toBe(false)
    expect(isDone({ value: 9_999, target: 10_000 })).toBe(false)
    expect(isDone({ value: 0.0999, target: 0.1 })).toBe(false)
  })
})

describe('reachesTarget', () => {
  it('vergleicht current ≥ target mit derselben Toleranz wie isDone', () => {
    expect(reachesTarget(3, 3)).toBe(true)
    expect(reachesTarget(4, 3)).toBe(true)
    expect(reachesTarget(2, 3)).toBe(false)
    expect(reachesTarget(0.1 + 0.2 + 0.3 + 0.4 - 1e-15, 1)).toBe(true)
    expect(reachesTarget(0, 0)).toBe(true)
  })
})

describe('habitTarget', () => {
  it('nimmt das Messziel oder 1 für Abhak-Quests', () => {
    expect(habitTarget(makeHabit({ id: 'h' }))).toBe(1)
    expect(habitTarget(makeHabit({ id: 'h', measure: { target: 10, unit: 'Seiten' } }))).toBe(10)
  })
})

describe('doneDaysInWeek', () => {
  it('zählt nur erledigte Tage derselben ISO-Woche (Mo–So)', () => {
    const done = daySet('2026-11-01', '2026-11-02', '2026-11-05', '2026-11-08', '2026-11-09')
    expect(doneDaysInWeek(done, '2026-11-02')).toBe(3)
    expect(doneDaysInWeek(done, '2026-11-08')).toBe(3)
    expect(doneDaysInWeek(done, '2026-11-09')).toBe(1)
    expect(doneDaysInWeek(new Set(), '2026-11-04')).toBe(0)
  })

  it('funktioniert über den Jahreswechsel', () => {
    // ISO-Woche 2026-12-28 (Mo) bis 2027-01-03 (So)
    const done = daySet('2026-12-27', '2026-12-28', '2026-12-31', '2027-01-01', '2027-01-03', '2027-01-04')
    expect(doneDaysInWeek(done, '2027-01-02')).toBe(4)
  })
})

describe('describeSchedule', () => {
  it('beschreibt tägliche Quests', () => {
    expect(describeSchedule({ type: 'daily' })).toBe('Täglich')
  })

  it('listet Wochentage sortiert und ohne Doppelte', () => {
    expect(describeSchedule({ type: 'weekdays', days: [1, 3, 5] })).toBe('Mo, Mi, Fr')
    expect(describeSchedule({ type: 'weekdays', days: [5, 1, 3, 1] })).toBe('Mo, Mi, Fr')
    expect(describeSchedule({ type: 'weekdays', days: [7, 6] })).toBe('Sa, So')
    expect(describeSchedule({ type: 'weekdays', days: [2] })).toBe('Di')
  })

  it('nennt alle sieben Wochentage "Täglich"', () => {
    expect(describeSchedule({ type: 'weekdays', days: [1, 2, 3, 4, 5, 6, 7] })).toBe('Täglich')
  })

  it('beschreibt Wochenquests', () => {
    expect(describeSchedule({ type: 'weekly', times: 1 })).toBe('1× pro Woche')
    expect(describeSchedule({ type: 'weekly', times: 3 })).toBe('3× pro Woche')
  })
})
