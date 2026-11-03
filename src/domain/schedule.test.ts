import { describe, expect, it } from 'vitest'
import {
  describeSchedule,
  doneDaysInWeek,
  habitTarget,
  isActiveOn,
  isDone,
  isPausedOn,
  isRequiredOn,
  isScheduledWeekday,
  isVisibleOn,
  mergePauses,
  questXp,
  reachesTarget,
  sameSchedule,
  scheduleOn,
} from './schedule'
import { daySet, makeHabit } from './testing'
import type { Difficulty, HabitPause } from './types'

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

describe('isActiveOn / isPausedOn – Pausen', () => {
  // Pause Mi 04.11. bis (exklusive) Mo 09.11., z. B. eine zurückgeholte Archivierung
  const habit = makeHabit({
    id: 'p',
    createdDay: '2026-11-01',
    pauses: [
      { from: '2026-11-04', until: '2026-11-09' },
      { from: '2026-11-20', until: '2026-11-21' },
    ],
  })

  it('ist von from (inklusive) bis until (exklusive) pausiert und damit nicht aktiv', () => {
    expect(isPausedOn(habit, '2026-11-03')).toBe(false)
    expect(isActiveOn(habit, '2026-11-03')).toBe(true)
    expect(isPausedOn(habit, '2026-11-04')).toBe(true)
    expect(isActiveOn(habit, '2026-11-04')).toBe(false)
    expect(isActiveOn(habit, '2026-11-08')).toBe(false)
    expect(isPausedOn(habit, '2026-11-09')).toBe(false)
    expect(isActiveOn(habit, '2026-11-09')).toBe(true)
  })

  it('berücksichtigt mehrere Pausen', () => {
    expect(isActiveOn(habit, '2026-11-19')).toBe(true)
    expect(isActiveOn(habit, '2026-11-20')).toBe(false)
    expect(isActiveOn(habit, '2026-11-21')).toBe(true)
  })

  it('ohne Pausen ist nichts pausiert', () => {
    expect(isPausedOn(makeHabit({ id: 'x' }), '2026-11-04')).toBe(false)
    expect(isPausedOn(makeHabit({ id: 'x', pauses: [] }), '2026-11-04')).toBe(false)
  })

  it('pausierte Tage sind weder Pflicht noch sichtbar', () => {
    expect(isRequiredOn(habit, '2026-11-05')).toBe(false)
    expect(isVisibleOn(habit, '2026-11-05')).toBe(false)
    const weekly = makeHabit({ ...habit, schedule: { type: 'weekly', times: 2 } })
    expect(isVisibleOn(weekly, '2026-11-05')).toBe(false)
    expect(isVisibleOn(weekly, '2026-11-10')).toBe(true)
  })
})

describe('scheduleOn – Rhythmus-Verlauf', () => {
  // Bis So 08.11. dreimal pro Woche, Mo 09.11. bis So 15.11. Mo/Mi/Fr, ab Mo 16.11. täglich.
  const habit = makeHabit({
    id: 'h',
    createdDay: '2026-11-01',
    schedule: { type: 'daily' },
    scheduleHistory: [
      { until: '2026-11-09', schedule: { type: 'weekly', times: 3 } },
      { until: '2026-11-16', schedule: { type: 'weekdays', days: [1, 3, 5] } },
    ],
  })

  it('liefert ohne Verlauf immer den aktuellen Rhythmus', () => {
    const plain = makeHabit({ id: 'p', schedule: { type: 'weekly', times: 2 } })
    expect(scheduleOn(plain, '2000-01-01')).toEqual({ type: 'weekly', times: 2 })
    expect(scheduleOn(makeHabit({ ...plain, scheduleHistory: [] }), '2026-11-01')).toEqual({ type: 'weekly', times: 2 })
  })

  it('jeder Eintrag gilt für die Tage vor seinem until, danach der aktuelle Rhythmus', () => {
    expect(scheduleOn(habit, '2026-11-01')).toEqual({ type: 'weekly', times: 3 })
    expect(scheduleOn(habit, '2026-11-08')).toEqual({ type: 'weekly', times: 3 })
    expect(scheduleOn(habit, '2026-11-09')).toEqual({ type: 'weekdays', days: [1, 3, 5] })
    expect(scheduleOn(habit, '2026-11-15')).toEqual({ type: 'weekdays', days: [1, 3, 5] })
    expect(scheduleOn(habit, '2026-11-16')).toEqual({ type: 'daily' })
    expect(scheduleOn(habit, '2027-06-01')).toEqual({ type: 'daily' })
    // Vor dem ersten Eintrag gilt der erste Eintrag (z. B. für den Montag der ersten Woche).
    expect(scheduleOn(habit, '2026-10-01')).toEqual({ type: 'weekly', times: 3 })
  })

  it('hängt nicht von der gespeicherten Reihenfolge ab; bei gleichem until gewinnt der erste Eintrag', () => {
    const reversed = makeHabit({ ...habit, scheduleHistory: [...(habit.scheduleHistory ?? [])].reverse() })
    for (const day of ['2026-11-01', '2026-11-08', '2026-11-09', '2026-11-15', '2026-11-16']) {
      expect(scheduleOn(reversed, day), day).toEqual(scheduleOn(habit, day))
    }
    const tie = makeHabit({
      id: 't',
      scheduleHistory: [
        { until: '2026-11-09', schedule: { type: 'weekly', times: 1 } },
        { until: '2026-11-09', schedule: { type: 'weekly', times: 5 } },
      ],
    })
    expect(scheduleOn(tie, '2026-11-08')).toEqual({ type: 'weekly', times: 1 })
  })

  it('isRequiredOn nutzt den Rhythmus des Tages: frühere Wochenquest-Tage bleiben ohne Pflicht', () => {
    expect(isRequiredOn(habit, '2026-11-04')).toBe(false) // damals 3× pro Woche
    expect(isRequiredOn(habit, '2026-11-10')).toBe(false) // damals Mo/Mi/Fr – Dienstag
    expect(isRequiredOn(habit, '2026-11-11')).toBe(true) // damals Mo/Mi/Fr – Mittwoch
    expect(isRequiredOn(habit, '2026-11-17')).toBe(true) // jetzt täglich
  })

  it('isVisibleOn nutzt den Rhythmus des Tages', () => {
    expect(isVisibleOn(habit, '2026-11-04')).toBe(true) // Wochenquest: jeden Tag sichtbar
    expect(isVisibleOn(habit, '2026-11-10')).toBe(false) // Dienstag, kein Plantag
    expect(isVisibleOn(habit, '2026-11-17')).toBe(true)
  })

  it('hinzugefügte Wochentage gelten erst ab der Änderung', () => {
    // Bis Mo 09.11. nur Mo/Mi/Fr, danach Mo–Fr.
    const more = makeHabit({
      id: 'm',
      createdDay: '2026-11-01',
      schedule: { type: 'weekdays', days: [1, 2, 3, 4, 5] },
      scheduleHistory: [{ until: '2026-11-09', schedule: { type: 'weekdays', days: [1, 3, 5] } }],
    })
    expect(isRequiredOn(more, '2026-11-03')).toBe(false) // Di vor der Änderung
    expect(isRequiredOn(more, '2026-11-10')).toBe(true) // Di nach der Änderung
  })
})

describe('sameSchedule', () => {
  it('vergleicht Rhythmen inhaltlich', () => {
    expect(sameSchedule({ type: 'daily' }, { type: 'daily' })).toBe(true)
    expect(sameSchedule({ type: 'weekdays', days: [5, 1, 3, 1] }, { type: 'weekdays', days: [1, 3, 5] })).toBe(true)
    expect(sameSchedule({ type: 'weekdays', days: [1, 3] }, { type: 'weekdays', days: [1, 3, 5] })).toBe(false)
    expect(sameSchedule({ type: 'weekdays', days: [1, 3, 4] }, { type: 'weekdays', days: [1, 3, 5] })).toBe(false)
    expect(sameSchedule({ type: 'weekly', times: 3 }, { type: 'weekly', times: 3 })).toBe(true)
    expect(sameSchedule({ type: 'weekly', times: 3 }, { type: 'weekly', times: 2 })).toBe(false)
  })

  it('unterscheidet verschiedene Arten – auch "alle 7 Tage" ist nicht "täglich"', () => {
    expect(sameSchedule({ type: 'daily' }, { type: 'weekly', times: 7 })).toBe(false)
    expect(sameSchedule({ type: 'weekdays', days: [1, 2, 3, 4, 5, 6, 7] }, { type: 'daily' })).toBe(false)
    expect(sameSchedule({ type: 'weekly', times: 1 }, { type: 'daily' })).toBe(false)
  })
})

describe('mergePauses', () => {
  it('sortiert, fasst überlappende und angrenzende Pausen zusammen und verwirft leere', () => {
    const input: HabitPause[] = [
      { from: '2026-11-20', until: '2026-11-25' },
      { from: '2026-11-01', until: '2026-11-05' },
      { from: '2026-11-05', until: '2026-11-08' }, // grenzt an
      { from: '2026-11-02', until: '2026-11-03' }, // liegt innerhalb
      { from: '2026-11-10', until: '2026-11-10' }, // leer
      { from: '2026-11-15', until: '2026-11-12' }, // verkehrt herum
      { from: '2026-11-24', until: '2026-11-30' }, // überlappt
    ]
    const copy = structuredClone(input)
    expect(mergePauses(input)).toEqual([
      { from: '2026-11-01', until: '2026-11-08' },
      { from: '2026-11-20', until: '2026-11-30' },
    ])
    expect(input).toEqual(copy) // Eingabe unverändert
  })

  it('lässt getrennte Pausen getrennt', () => {
    expect(
      mergePauses([
        { from: '2026-11-01', until: '2026-11-02' },
        { from: '2026-11-03', until: '2026-11-04' },
      ]),
    ).toEqual([
      { from: '2026-11-01', until: '2026-11-02' },
      { from: '2026-11-03', until: '2026-11-04' },
    ])
    expect(mergePauses([])).toEqual([])
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
