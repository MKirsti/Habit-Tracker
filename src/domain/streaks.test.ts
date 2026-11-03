import { describe, expect, it } from 'vitest'
import { addDays, compareDays, dayRange, isoWeekday, startOfWeek } from './dates'
import { isPausedOn, scheduleOn } from './schedule'
import { bestStreakIn, computeStreak, streakReachedDay, streakUnit } from './streaks'
import { daySet, daySetRange, makeHabit, seededRandom } from './testing'
import type { DayKey, Habit, HabitPause, IsoWeekday, Schedule, ScheduleHistoryEntry, Streak } from './types'

// Kalender-Referenz: 2026-11-02 ist ein Montag. ISO-Woche über den Jahreswechsel: 2026-12-28 (Mo) – 2027-01-03 (So).

const daily = makeHabit({ id: 'daily', createdDay: '2026-10-01' })
const monWedFri = makeHabit({
  id: 'mwf',
  createdDay: '2026-10-01',
  schedule: { type: 'weekdays', days: [1, 3, 5] },
})

describe('computeStreak – Tages-Einheit (daily)', () => {
  it('zählt aufeinanderfolgende erledigte Tage bis einschließlich asOf', () => {
    const done = daySetRange('2026-11-01', '2026-11-05')
    expect(computeStreak(daily, done, '2026-11-05')).toEqual({ current: 5, best: 5, unit: 'day' })
  })

  it('ein noch offener heutiger Tag bricht die Serie nicht', () => {
    const done = daySetRange('2026-11-01', '2026-11-04')
    expect(computeStreak(daily, done, '2026-11-05')).toEqual({ current: 4, best: 4, unit: 'day' })
  })

  it('ein verpasster Vortag bricht die Serie', () => {
    const done = daySetRange('2026-11-01', '2026-11-03')
    expect(computeStreak(daily, done, '2026-11-05')).toEqual({ current: 0, best: 3, unit: 'day' })
  })

  it('merkt sich die beste Serie getrennt von der aktuellen', () => {
    const done = new Set([...dayRange('2026-10-01', '2026-10-10'), ...dayRange('2026-10-12', '2026-10-14')])
    expect(computeStreak(daily, done, '2026-10-14')).toEqual({ current: 3, best: 10, unit: 'day' })
  })

  it('ignoriert Tage nach asOf (Streak "zum Stichtag")', () => {
    const done = daySetRange('2026-11-01', '2026-11-10')
    expect(computeStreak(daily, done, '2026-11-03')).toEqual({ current: 3, best: 3, unit: 'day' })
  })

  it('beginnt frühestens am createdDay', () => {
    const habit = makeHabit({ id: 'h', createdDay: '2026-11-03' })
    const done = daySetRange('2026-10-20', '2026-11-04')
    expect(computeStreak(habit, done, '2026-11-04')).toEqual({ current: 2, best: 2, unit: 'day' })
  })

  it('beginnt mit `from` frühestens an diesem Tag (max(createdDay, from))', () => {
    const done = new Set([...dayRange('2026-10-01', '2026-10-20'), ...dayRange('2026-10-25', '2026-10-27')])
    expect(computeStreak(daily, done, '2026-10-27', '2026-10-18')).toEqual({ current: 3, best: 3, unit: 'day' })
    // `from` vor createdDay ändert nichts
    expect(computeStreak(daily, done, '2026-10-27', '2020-01-01').best).toBe(20)
  })

  it('liefert 0, wenn das Fenster leer ist', () => {
    const habit = makeHabit({ id: 'h', createdDay: '2026-11-10' })
    expect(computeStreak(habit, daySet('2026-11-01'), '2026-11-05')).toEqual({ current: 0, best: 0, unit: 'day' })
    expect(computeStreak(daily, daySet('2026-11-01'), '2026-11-05', '2026-11-06')).toEqual({
      current: 0,
      best: 0,
      unit: 'day',
    })
  })

  it('ein offener erster Tag ergibt 0 ohne Fehler', () => {
    const habit = makeHabit({ id: 'h', createdDay: '2026-11-03' })
    expect(computeStreak(habit, new Set(), '2026-11-03')).toEqual({ current: 0, best: 0, unit: 'day' })
  })

  it('ist über Sommer- und Winterzeit-Umstellungen lückenlos', () => {
    const longRunner = makeHabit({ id: 'h', createdDay: '2026-01-01' })
    expect(computeStreak(longRunner, daySetRange('2026-03-27', '2026-03-31'), '2026-03-31').current).toBe(5)
    expect(computeStreak(longRunner, daySetRange('2026-10-23', '2026-10-27'), '2026-10-27').current).toBe(5)
  })

  it('zählt den 29. Februar mit – fehlt er, bricht die Serie', () => {
    const habit = makeHabit({ id: 'h', createdDay: '2028-01-01' })
    expect(computeStreak(habit, daySetRange('2028-02-27', '2028-03-02'), '2028-03-02').current).toBe(5)
    const withoutLeapDay = daySet('2028-02-27', '2028-02-28', '2028-03-01', '2028-03-02')
    expect(computeStreak(habit, withoutLeapDay, '2028-03-02')).toEqual({ current: 2, best: 2, unit: 'day' })
  })

  it('läuft über den Jahreswechsel', () => {
    expect(computeStreak(daily, daySetRange('2026-12-25', '2027-01-05'), '2027-01-05').current).toBe(12)
  })
})

describe('computeStreak – Tages-Einheit (weekdays)', () => {
  it('überspringt Nicht-Plantage, ohne die Serie zu brechen', () => {
    // Mo 02., Mi 04., Fr 06., Mo 09.
    const done = daySet('2026-11-02', '2026-11-04', '2026-11-06', '2026-11-09')
    expect(computeStreak(monWedFri, done, '2026-11-09')).toEqual({ current: 4, best: 4, unit: 'day' })
    // Stichtag ist ein Nicht-Plantag (Di) → unverändert
    expect(computeStreak(monWedFri, done, '2026-11-10').current).toBe(4)
    // Stichtag Mi, noch offen → bricht nicht
    expect(computeStreak(monWedFri, done, '2026-11-11').current).toBe(4)
    // Stichtag Do: der Mittwoch ist verpasst → gebrochen
    expect(computeStreak(monWedFri, done, '2026-11-12')).toEqual({ current: 0, best: 4, unit: 'day' })
  })

  it('zählt Erledigungen an Nicht-Plantagen nicht mit', () => {
    const done = daySet('2026-11-03', '2026-11-05', '2026-11-07') // Di, Do, Sa
    expect(computeStreak(monWedFri, done, '2026-11-08')).toEqual({ current: 0, best: 0, unit: 'day' })
  })

  it('ein verpasster Plantag bricht die Serie auch über Wochenenden hinweg', () => {
    const done = daySet('2026-11-02', '2026-11-04', '2026-11-09') // Fr 06. fehlt
    expect(computeStreak(monWedFri, done, '2026-11-09')).toEqual({ current: 1, best: 2, unit: 'day' })
  })
})

describe('computeStreak – archivierte Quests', () => {
  const archived = makeHabit({ id: 'a', createdDay: '2026-10-01', archivedDay: '2026-11-05' })

  it('friert die Serie am letzten aktiven Tag ein', () => {
    const done = daySetRange('2026-11-01', '2026-11-04')
    expect(computeStreak(archived, done, '2026-11-20')).toEqual({ current: 4, best: 4, unit: 'day' })
  })

  it('zählt Tage ab archivedDay nicht mit', () => {
    const done = daySetRange('2026-11-01', '2026-11-10')
    expect(computeStreak(archived, done, '2026-11-10')).toEqual({ current: 4, best: 4, unit: 'day' })
  })

  it('ein verpasster letzter aktiver Tag bricht die Serie', () => {
    const done = daySetRange('2026-11-01', '2026-11-03')
    expect(computeStreak(archived, done, '2026-11-20')).toEqual({ current: 0, best: 3, unit: 'day' })
  })
})

describe('computeStreak – Wochen-Einheit (weekly)', () => {
  const twiceAWeek = makeHabit({ id: 'w', createdDay: '2026-12-14', schedule: { type: 'weekly', times: 2 } })
  // Woche 1 (14.–20.12.), Woche 2 (21.–27.12.), Woche 3 (28.12.–03.01., über den Jahreswechsel)
  const threeGoodWeeks = ['2026-12-15', '2026-12-17', '2026-12-22', '2026-12-26', '2026-12-31', '2027-01-02']

  it('zählt erfüllte ISO-Wochen – auch über den Jahreswechsel', () => {
    expect(computeStreak(twiceAWeek, daySet(...threeGoodWeeks), '2027-01-03')).toEqual({
      current: 3,
      best: 3,
      unit: 'week',
    })
  })

  it('die laufende Woche zählt erst, wenn sie erfüllt ist, und bricht nichts', () => {
    const done = daySet(...threeGoodWeeks, '2027-01-05')
    expect(computeStreak(twiceAWeek, done, '2027-01-05')).toEqual({ current: 3, best: 3, unit: 'week' })
    expect(computeStreak(twiceAWeek, daySet(...threeGoodWeeks, '2027-01-05', '2027-01-06'), '2027-01-06')).toEqual({
      current: 4,
      best: 4,
      unit: 'week',
    })
    // Leere laufende Woche am Montag
    expect(computeStreak(twiceAWeek, daySet(...threeGoodWeeks), '2027-01-04').current).toBe(3)
  })

  it('eine abgelaufene, nicht erfüllte Woche bricht die Serie', () => {
    const done = daySet(...threeGoodWeeks, '2027-01-05') // Woche 4 nur 1 von 2
    expect(computeStreak(twiceAWeek, done, '2027-01-12')).toEqual({ current: 0, best: 3, unit: 'week' })
  })

  it('zählt Tage der Woche nach asOf nicht mit', () => {
    const done = daySet('2026-12-15', '2026-12-19')
    expect(computeStreak(twiceAWeek, done, '2026-12-16').current).toBe(0)
    expect(computeStreak(twiceAWeek, done, '2026-12-19').current).toBe(1)
  })

  it('zählt in der ersten Woche nur Tage ab createdDay', () => {
    // Erstellt Mi 04.11.; Mo/Di davor zählen nicht → 1 von 3, Woche nicht erfüllt
    const habit = makeHabit({ id: 'w3', createdDay: '2026-11-04', schedule: { type: 'weekly', times: 3 } })
    const done = daySet('2026-11-02', '2026-11-03', '2026-11-04')
    expect(computeStreak(habit, done, '2026-11-08')).toEqual({ current: 0, best: 0, unit: 'week' })
    // Drei erledigte Tage ab Mittwoch erfüllen die erste (Teil-)Woche
    const enough = daySet('2026-11-04', '2026-11-06', '2026-11-08')
    expect(computeStreak(habit, enough, '2026-11-08')).toEqual({ current: 1, best: 1, unit: 'week' })
  })

  it('beginnt mit `from` in der Woche von `from` und zählt nur Tage ab `from`', () => {
    const habit = makeHabit({ id: 'w1', createdDay: '2026-10-01', schedule: { type: 'weekly', times: 1 } })
    const done = daySet('2026-10-05', '2026-10-12', '2026-10-19', '2026-11-02')
    // from = Mi 2026-10-21: Erledigung am Mo 19.10. liegt davor → Woche 19.–25.10. nicht erfüllt
    expect(computeStreak(habit, done, '2026-11-02', '2026-10-21')).toEqual({ current: 1, best: 1, unit: 'week' })
    expect(computeStreak(habit, done, '2026-11-02')).toEqual({ current: 1, best: 3, unit: 'week' })
  })

  it('mehrere Erledigungen an einem Tag zählen nur einmal (ein Tag = ein Eintrag)', () => {
    const habit = makeHabit({ id: 'w7', createdDay: '2026-11-02', schedule: { type: 'weekly', times: 7 } })
    expect(computeStreak(habit, daySetRange('2026-11-02', '2026-11-08'), '2026-11-08').current).toBe(1)
    expect(computeStreak(habit, daySetRange('2026-11-02', '2026-11-07'), '2026-11-08').current).toBe(0)
  })

  it('eine durch Archivierung abgeschnittene letzte Woche bricht die eingefrorene Serie nicht', () => {
    const habit = makeHabit({
      id: 'wa',
      createdDay: '2026-11-02',
      archivedDay: '2026-11-18', // Mi
      schedule: { type: 'weekly', times: 2 },
    })
    const done = daySet('2026-11-02', '2026-11-03', '2026-11-09', '2026-11-10', '2026-11-16')
    expect(computeStreak(habit, done, '2026-12-01')).toEqual({ current: 2, best: 2, unit: 'week' })
  })

  it('eine durch Archivierung nicht verkürzte, aber unerfüllte Woche bricht die Serie', () => {
    const habit = makeHabit({
      id: 'wb',
      createdDay: '2026-11-02',
      archivedDay: '2026-11-23', // Mo → letzte Woche 16.–22.11. ist vollständig
      schedule: { type: 'weekly', times: 2 },
    })
    const done = daySet('2026-11-02', '2026-11-03', '2026-11-09', '2026-11-10', '2026-11-16')
    expect(computeStreak(habit, done, '2026-12-01')).toEqual({ current: 0, best: 2, unit: 'week' })
  })
})

describe('computeStreak – Rhythmus-Verlauf (scheduleHistory)', () => {
  it('eine Rhythmus-Änderung schreibt die Vergangenheit nicht um und bricht die Serie nicht', () => {
    // Bis So 08.11. Mo/Mi/Fr, ab Mo 09.11. täglich.
    const habit = makeHabit({
      id: 'h',
      createdDay: '2026-11-02',
      schedule: { type: 'daily' },
      scheduleHistory: [{ until: '2026-11-09', schedule: { type: 'weekdays', days: [1, 3, 5] } }],
    })
    const done = daySet('2026-11-02', '2026-11-04', '2026-11-06', '2026-11-09', '2026-11-10', '2026-11-11')
    expect(computeStreak(habit, done, '2026-11-11')).toEqual({ current: 6, best: 6, unit: 'day' })
    // Zum Stichtag vor der Änderung wie die ursprüngliche Mo/Mi/Fr-Quest
    const original = makeHabit({ ...habit, schedule: { type: 'weekdays', days: [1, 3, 5] }, scheduleHistory: undefined })
    expect(computeStreak(habit, done, '2026-11-08')).toEqual(computeStreak(original, done, '2026-11-08'))
    expect(computeStreak(habit, done, '2026-11-08').current).toBe(3)
    // Ohne Verlauf wären Di/Do/Sa/So rückwirkend verpasste Plantage
    const naive = makeHabit({ ...habit, scheduleHistory: undefined })
    expect(computeStreak(naive, done, '2026-11-11')).toEqual({ current: 3, best: 3, unit: 'day' })
  })

  it('ein damals verpasster Plantag bleibt verpasst', () => {
    const habit = makeHabit({
      id: 'h',
      createdDay: '2026-11-02',
      scheduleHistory: [{ until: '2026-11-09', schedule: { type: 'weekdays', days: [1, 3, 5] } }],
    })
    const done = daySet('2026-11-02', '2026-11-06', '2026-11-09', '2026-11-10', '2026-11-11') // Mi 04. fehlt
    expect(computeStreak(habit, done, '2026-11-11')).toEqual({ current: 4, best: 4, unit: 'day' })
  })

  it('Tages-Einheit: Tage, an denen die Quest eine Wochenquest war, zählen nicht und brechen nichts', () => {
    // Täglich bis So 25.10., dann 2× pro Woche bis So 08.11., ab Mo 09.11. wieder täglich.
    const habit = makeHabit({
      id: 'h',
      createdDay: '2026-10-01',
      schedule: { type: 'daily' },
      scheduleHistory: [
        { until: '2026-10-26', schedule: { type: 'daily' } },
        { until: '2026-11-09', schedule: { type: 'weekly', times: 2 } },
      ],
    })
    const done = new Set([...dayRange('2026-10-20', '2026-10-25'), '2026-10-28', ...dayRange('2026-11-09', '2026-11-11')])
    expect(computeStreak(habit, done, '2026-11-11')).toEqual({ current: 9, best: 9, unit: 'day' })
    // Stichtag in der Wochenquest-Zeit: die Serie steht still
    expect(computeStreak(habit, done, '2026-11-01')).toEqual({ current: 6, best: 6, unit: 'day' })
  })

  it('Wochen-Einheit: Wochen, deren Montag noch zum Tagesrhythmus gehörte, werden übersprungen', () => {
    // Bis So 15.11. täglich, ab Mo 16.11. 2× pro Woche.
    const habit = makeHabit({
      id: 'w',
      createdDay: '2026-10-01',
      schedule: { type: 'weekly', times: 2 },
      scheduleHistory: [{ until: '2026-11-16', schedule: { type: 'daily' } }],
    })
    const done = new Set([...dayRange('2026-10-01', '2026-11-15'), '2026-11-16', '2026-11-18', '2026-11-23', '2026-11-25'])
    expect(computeStreak(habit, done, '2026-11-29')).toEqual({ current: 2, best: 2, unit: 'week' })
    expect(computeStreak(habit, done, '2026-11-15')).toEqual({ current: 0, best: 0, unit: 'week' })
  })

  it('Wochen-Einheit: es gilt das Wochenziel, das am Montag der Woche galt', () => {
    // Bis So 15.11. 3× pro Woche, ab Mo 16.11. 1× pro Woche.
    const habit = makeHabit({
      id: 'w',
      createdDay: '2026-11-02',
      schedule: { type: 'weekly', times: 1 },
      scheduleHistory: [{ until: '2026-11-16', schedule: { type: 'weekly', times: 3 } }],
    })
    const good = daySet('2026-11-02', '2026-11-03', '2026-11-04', '2026-11-09', '2026-11-10', '2026-11-11', '2026-11-17')
    expect(computeStreak(habit, good, '2026-11-18')).toEqual({ current: 3, best: 3, unit: 'week' })
    // Woche 09.–15.11. nur 2 von damals 3 → gebrochen, auch wenn das neue Ziel niedriger ist
    const weak = daySet('2026-11-02', '2026-11-03', '2026-11-04', '2026-11-09', '2026-11-10', '2026-11-17')
    expect(computeStreak(habit, weak, '2026-11-18')).toEqual({ current: 1, best: 1, unit: 'week' })
  })

  it('Wochen-Einheit: eine Umstellung mitten in der Woche zählt ab der nächsten Woche', () => {
    // Bis Di 17.11. täglich, ab Mi 18.11. 2× pro Woche → die Woche 16.–22.11. wird übersprungen.
    const habit = makeHabit({
      id: 'w',
      createdDay: '2026-11-02',
      schedule: { type: 'weekly', times: 2 },
      scheduleHistory: [{ until: '2026-11-18', schedule: { type: 'daily' } }],
    })
    const done = new Set([...dayRange('2026-11-02', '2026-11-19')])
    expect(computeStreak(habit, done, '2026-11-22')).toEqual({ current: 0, best: 0, unit: 'week' })
    const later = new Set([...done, '2026-11-24', '2026-11-25'])
    expect(computeStreak(habit, later, '2026-11-25')).toEqual({ current: 1, best: 1, unit: 'week' })
  })

  it('streakReachedDay berücksichtigt den Verlauf genauso', () => {
    const habit = makeHabit({
      id: 'h',
      createdDay: '2026-11-02',
      scheduleHistory: [{ until: '2026-11-09', schedule: { type: 'weekdays', days: [1, 3, 5] } }],
    })
    const done = daySet('2026-11-02', '2026-11-04', '2026-11-06', '2026-11-09', '2026-11-10')
    expect(streakReachedDay(habit, done, 4, '2026-11-30')).toBe('2026-11-09')
    expect(streakReachedDay(habit, done, 5, '2026-11-30')).toBe('2026-11-10')
  })
})

describe('computeStreak – Pausen', () => {
  // Pause Do 05.11. bis (exklusive) Di 10.11.
  const paused = makeHabit({ id: 'p', createdDay: '2026-10-01', pauses: [{ from: '2026-11-05', until: '2026-11-10' }] })

  it('Tages-Einheit: pausierte Tage zählen nicht und brechen nichts', () => {
    const done = new Set([...dayRange('2026-11-01', '2026-11-04'), '2026-11-06', ...dayRange('2026-11-10', '2026-11-12')])
    expect(computeStreak(paused, done, '2026-11-12')).toEqual({ current: 7, best: 7, unit: 'day' })
  })

  it('Stichtag in einer Pause: die Serie steht still', () => {
    const done = daySetRange('2026-11-01', '2026-11-04')
    expect(computeStreak(paused, done, '2026-11-07')).toEqual({ current: 4, best: 4, unit: 'day' })
  })

  it('ein verpasster Tag nach der Pause bricht die Serie', () => {
    const done = new Set([...dayRange('2026-11-01', '2026-11-04'), '2026-11-11', '2026-11-12'])
    expect(computeStreak(paused, done, '2026-11-12')).toEqual({ current: 2, best: 4, unit: 'day' })
  })

  it('zurückgeholte Quest: die Serie von vor der Archivierung läuft weiter', () => {
    const done = new Set([...dayRange('2026-10-25', '2026-11-04'), '2026-11-10', '2026-11-11'])
    const archived = makeHabit({ id: 'a', createdDay: '2026-10-01', archivedDay: '2026-11-05' })
    expect(computeStreak(archived, done, '2026-11-10')).toEqual({ current: 11, best: 11, unit: 'day' })
    // Am 10.11. zurückgeholt → Pause [05.11., 10.11.)
    const restored = makeHabit({ id: 'a', createdDay: '2026-10-01', pauses: [{ from: '2026-11-05', until: '2026-11-10' }] })
    expect(computeStreak(restored, done, '2026-11-10')).toEqual({ current: 12, best: 12, unit: 'day' })
    expect(computeStreak(restored, done, '2026-11-11')).toEqual({ current: 13, best: 13, unit: 'day' })
    // Ohne Pause wäre die archivierte Zeit rückwirkend verpasst
    const naive = makeHabit({ id: 'a', createdDay: '2026-10-01' })
    expect(computeStreak(naive, done, '2026-11-11')).toEqual({ current: 2, best: 11, unit: 'day' })
  })

  it('Wochen-Einheit: angebrochene Wochen brechen nichts, ganz pausierte werden übersprungen', () => {
    // 2× pro Woche, Pause Mi 11.11. bis (exklusive) Mi 25.11.
    const habit = makeHabit({
      id: 'w',
      createdDay: '2026-11-02',
      schedule: { type: 'weekly', times: 2 },
      pauses: [{ from: '2026-11-11', until: '2026-11-25' }],
    })
    // W1 ✓ · W2 (nur Mo/Di aktiv) 1 von 2 · W3 ganz pausiert (Erledigung zählt nicht) · W4 (ab Mi aktiv) ✓
    const done = daySet('2026-11-02', '2026-11-05', '2026-11-09', '2026-11-17', '2026-11-26', '2026-11-27')
    expect(computeStreak(habit, done, '2026-12-01')).toEqual({ current: 2, best: 2, unit: 'week' })
    // Eine angebrochene Woche zählt, wenn sie trotzdem erfüllt ist
    const fulfilled = daySet('2026-11-02', '2026-11-05', '2026-11-09', '2026-11-10', '2026-11-26', '2026-11-27')
    expect(computeStreak(habit, fulfilled, '2026-12-01')).toEqual({ current: 3, best: 3, unit: 'week' })
    // Erledigungen an pausierten Tagen zählen nicht fürs Wochenziel
    const onPausedDays = daySet('2026-11-02', '2026-11-05', '2026-11-12', '2026-11-13', '2026-11-26', '2026-11-27')
    expect(computeStreak(habit, onPausedDays, '2026-12-01')).toEqual({ current: 2, best: 2, unit: 'week' })
  })

  it('überlappende oder unsortierte Pausen werden korrekt zusammengefasst', () => {
    const messy = makeHabit({
      id: 'm',
      createdDay: '2026-10-01',
      pauses: [
        { from: '2026-11-07', until: '2026-11-10' },
        { from: '2026-11-05', until: '2026-11-08' },
      ],
    })
    const done = new Set([...dayRange('2026-11-01', '2026-11-04'), ...dayRange('2026-11-10', '2026-11-12')])
    expect(computeStreak(messy, done, '2026-11-12')).toEqual({ current: 7, best: 7, unit: 'day' })
  })
})

/**
 * Referenzmodell: bewusst naive, wörtliche Umsetzung der Streak-Regeln aus docs/ARCHITECTURE.md über
 * DayKey-Listen – unabhängig vom optimierten Scanner, als Gegenprobe für Zufallstests. Rhythmus-Verlauf und
 * Pausen werden Tag für Tag über `scheduleOn` / `isPausedOn` nachgeschlagen.
 * Jede Einheit (Plantag bzw. ISO-Woche) ist erfüllt (true), verpasst (false) oder offen (null, bricht nichts).
 * Übersprungene Einheiten (Wochen mit anderem Rhythmus am Montag) tauchen gar nicht auf.
 */
function referenceStreak(
  habit: Habit,
  done: ReadonlySet<DayKey>,
  asOf: DayKey,
  from?: DayKey,
  unit: Streak['unit'] = habit.schedule.type === 'weekly' ? 'week' : 'day',
): Streak {
  const start = from !== undefined && compareDays(from, habit.createdDay) > 0 ? from : habit.createdDay
  let end = asOf
  if (habit.archivedDay !== undefined && compareDays(addDays(habit.archivedDay, -1), end) < 0) {
    end = addDays(habit.archivedDay, -1)
  }
  const window = dayRange(start, end)

  const units: (boolean | null)[] = []
  if (unit === 'week') {
    const daysByMonday = new Map<DayKey, DayKey[]>()
    for (const day of window) {
      const monday = startOfWeek(day)
      daysByMonday.set(monday, [...(daysByMonday.get(monday) ?? []), day])
    }
    const mondays = [...daysByMonday.keys()]
    mondays.forEach((monday, i) => {
      const weekSchedule = scheduleOn(habit, monday)
      if (weekSchedule.type !== 'weekly') return // übersprungen
      const days = daysByMonday.get(monday) ?? []
      const doneCount = days.filter((day) => !isPausedOn(habit, day) && done.has(day)).length
      if (doneCount >= weekSchedule.times) {
        units.push(true)
        return
      }
      // Offen: die Woche von asOf, eine durch Archivierung abgeschnittene letzte Woche oder eine Woche mit Pause
      const open =
        (i === mondays.length - 1 && (monday === startOfWeek(asOf) || isoWeekday(end) !== 7)) ||
        days.some((day) => isPausedOn(habit, day))
      units.push(open ? null : false)
    })
  } else {
    for (const day of window) {
      if (isPausedOn(habit, day)) continue
      const daySchedule = scheduleOn(habit, day)
      const planned =
        daySchedule.type === 'daily' || (daySchedule.type === 'weekdays' && daySchedule.days.includes(isoWeekday(day)))
      if (planned) units.push(done.has(day) ? true : day === asOf ? null : false)
    }
  }

  let best = 0
  let run = 0
  for (const fulfilled of units) {
    if (fulfilled === true) best = Math.max(best, ++run)
    else if (fulfilled === false) run = 0
  }
  // Aktuell: erfüllte Einheiten seit der letzten verpassten; offene Einheiten werden übersprungen
  let current = 0
  for (let i = units.length - 1; i >= 0 && units[i] !== false; i--) if (units[i] === true) current++
  return { current, best, unit }
}

/**
 * Zufällige Quest samt Stichtag/`from` rund um einen Jahreswechsel (Woche 53!) und die Zeitumstellung.
 * Mit `timeline` bekommt die Quest zusätzlich oft einen Rhythmus-Verlauf (manchmal unsortiert) und Pausen
 * (manchmal überlappend).
 */
function randomCase(random: () => number, timeline = false) {
  const int = (max: number) => Math.floor(random() * (max + 1))
  const base = random() < 0.5 ? '2026-12-01' : '2026-03-01'
  const randomSchedule = (): Schedule => {
    const kind = random()
    return kind < 0.33
      ? { type: 'daily' }
      : kind < 0.66
        ? {
            type: 'weekdays',
            days: ([1, 2, 3, 4, 5, 6, 7] as IsoWeekday[]).filter(() => random() < 0.5).concat([(1 + int(6)) as IsoWeekday]),
          }
        : { type: 'weekly', times: 1 + int(random() < 0.7 ? 3 : 6) }
  }
  const schedule = randomSchedule()
  const createdDay = addDays(base, int(20))
  const habit = makeHabit({
    id: 'r',
    schedule,
    createdDay,
    archivedDay: random() < 0.35 ? addDays(createdDay, int(70)) : undefined,
  })
  if (timeline && random() < 0.8) {
    const history: ScheduleHistoryEntry[] = []
    let until = createdDay
    for (let k = 0, n = 1 + int(2); k < n; k++) {
      until = addDays(until, 1 + int(30))
      history.push({ until, schedule: randomSchedule() })
    }
    habit.scheduleHistory = random() < 0.2 ? history.reverse() : history
  }
  if (timeline && random() < 0.6) {
    const pauses: HabitPause[] = []
    for (let k = 0, n = 1 + int(2); k < n; k++) {
      const from = addDays(createdDay, int(70))
      pauses.push({ from, until: addDays(from, 1 + int(20)) })
    }
    habit.pauses = pauses
  }
  const density = [0.5, 0.8, 0.95][int(2)]
  const done = new Set(dayRange(addDays(base, -10), addDays(base, 110)).filter(() => random() < density))
  const from = random() < 0.4 ? addDays(base, int(50)) : undefined
  const asOf = addDays(base, int(100))
  return { habit, done, from, asOf }
}

describe('computeStreak – Referenzmodell (Zufallstests)', () => {
  it('stimmt in 2.000 zufälligen Fällen mit der wörtlichen Umsetzung der Regeln überein', () => {
    const random = seededRandom(20261103)
    for (let i = 0; i < 2000; i++) {
      const { habit, done, from, asOf } = randomCase(random)
      const label = `#${i} ${JSON.stringify({ schedule: habit.schedule, created: habit.createdDay, archived: habit.archivedDay, from, asOf })}`
      expect(computeStreak(habit, done, asOf, from), label).toEqual(referenceStreak(habit, done, asOf, from))
    }
  })

  it('stimmt auch mit Rhythmus-Verlauf und Pausen in 2.000 zufälligen Fällen überein', () => {
    const random = seededRandom(20261117)
    for (let i = 0; i < 2000; i++) {
      const { habit, done, from, asOf } = randomCase(random, true)
      const label = `#${i} ${JSON.stringify({ schedule: habit.schedule, created: habit.createdDay, archived: habit.archivedDay, history: habit.scheduleHistory, pauses: habit.pauses, from, asOf })}`
      expect(computeStreak(habit, done, asOf, from), label).toEqual(referenceStreak(habit, done, asOf, from))
    }
  })

  it.each([false, true])('streakReachedDay = frühester Stichtag mit best ≥ Ziel (Verlauf & Pausen: %s)', (timeline) => {
    const random = seededRandom(42)
    for (let i = 0; i < 60; i++) {
      const { habit, done, from, asOf } = randomCase(random, timeline)
      const target = 1 + Math.floor(random() * 6)
      let expected: DayKey | undefined
      for (const day of dayRange(habit.createdDay, asOf)) {
        if (computeStreak(habit, done, day, from).best >= target) {
          expected = day
          break
        }
      }
      expect(streakReachedDay(habit, done, target, asOf, from), `#${i} Ziel ${target}`).toBe(expected)
    }
  })
})

describe('bestStreakIn / streakReachedDay – Umstellung zwischen Tages- und Wochenquest', () => {
  // Bis So 15.11. täglich (02.–12.11. erledigt = 11 Tage), ab Mo 16.11. 2× pro Woche (zwei Wochen erfüllt).
  const switched = makeHabit({
    id: 's',
    createdDay: '2026-11-02',
    schedule: { type: 'weekly', times: 2 },
    scheduleHistory: [{ until: '2026-11-16', schedule: { type: 'daily' } }],
  })
  const done = new Set([...dayRange('2026-11-02', '2026-11-12'), '2026-11-17', '2026-11-19', '2026-11-24', '2026-11-26'])

  it('streakUnit: Wochenquests zählen Wochen, alle anderen Tage', () => {
    expect(streakUnit({ type: 'weekly', times: 3 })).toBe('week')
    expect(streakUnit({ type: 'daily' })).toBe('day')
    expect(streakUnit({ type: 'weekdays', days: [1] })).toBe('day')
  })

  it('liefert die Bestwerte beider Einheiten; die aktuelle Einheit entspricht computeStreak', () => {
    expect(computeStreak(switched, done, '2026-11-30')).toEqual({ current: 2, best: 2, unit: 'week' })
    expect(bestStreakIn(switched, done, 'week', '2026-11-30')).toBe(2)
    // Die tägliche Zeit davor: 11 Tage in Folge, auch wenn die Quest heute eine Wochenquest ist.
    expect(bestStreakIn(switched, done, 'day', '2026-11-30')).toBe(11)
    expect(bestStreakIn(switched, done, 'day', '2026-11-30', '2026-11-05')).toBe(8)
    expect(streakReachedDay(switched, done, 11, '2026-11-30', undefined, 'day')).toBe('2026-11-12')
    expect(streakReachedDay(switched, done, 12, '2026-11-30', undefined, 'day')).toBeUndefined()
    // Ohne Einheit: die des aktuellen Rhythmus (Wochen)
    expect(streakReachedDay(switched, done, 2, '2026-11-30')).toBe('2026-11-26')
  })

  it('ist 0 bzw. undefined für eine Einheit, die die Quest nie hatte', () => {
    expect(bestStreakIn(daily, daySetRange('2026-10-01', '2026-10-31'), 'week', '2026-10-31')).toBe(0)
    const weekly = makeHabit({ id: 'w', createdDay: '2026-10-01', schedule: { type: 'weekly', times: 1 } })
    expect(bestStreakIn(weekly, daySetRange('2026-10-01', '2026-10-31'), 'day', '2026-10-31')).toBe(0)
    expect(streakReachedDay(weekly, daySetRange('2026-10-01', '2026-10-31'), 1, '2026-10-31', undefined, 'day')).toBeUndefined()
  })

  it('stimmt für beide Einheiten in 1.000 zufälligen Fällen mit dem Referenzmodell überein', () => {
    const random = seededRandom(20261123)
    for (let i = 0; i < 1000; i++) {
      const { habit, done: doneDays, from, asOf } = randomCase(random, true)
      for (const unit of ['day', 'week'] as const) {
        const label = `#${i} ${unit} ${JSON.stringify({ schedule: habit.schedule, history: habit.scheduleHistory, pauses: habit.pauses, from, asOf })}`
        expect(bestStreakIn(habit, doneDays, unit, asOf, from), label).toBe(referenceStreak(habit, doneDays, asOf, from, unit).best)
      }
    }
  })

  it('streakReachedDay(…, unit) = frühester Stichtag mit bestStreakIn ≥ Ziel', () => {
    const random = seededRandom(1123)
    for (let i = 0; i < 60; i++) {
      const { habit, done: doneDays, from, asOf } = randomCase(random, true)
      const unit = streakUnit(habit.schedule) === 'day' ? 'week' : 'day' // die jeweils andere Einheit
      const target = 1 + Math.floor(random() * 6)
      let expected: DayKey | undefined
      for (const day of dayRange(habit.createdDay, asOf)) {
        if (referenceStreak(habit, doneDays, day, from, unit).best >= target) {
          expected = day
          break
        }
      }
      expect(streakReachedDay(habit, doneDays, target, asOf, from, unit), `#${i} ${unit} Ziel ${target}`).toBe(expected)
    }
  })
})

describe('computeStreak – Laufzeit', () => {
  it('bewältigt zehn Jahre täglicher Daten', () => {
    const habit = makeHabit({ id: 'long', createdDay: '2020-01-01' })
    const done = daySetRange('2020-01-01', '2029-12-31')
    expect(computeStreak(habit, done, '2029-12-31')).toEqual({ current: 3653, best: 3653, unit: 'day' })
  })
})

describe('streakReachedDay', () => {
  it('liefert den Tag, an dem die Tages-Serie die Ziellänge erreicht hat', () => {
    const done = new Set([...dayRange('2026-10-01', '2026-10-02'), ...dayRange('2026-10-05', '2026-10-09')])
    expect(streakReachedDay(daily, done, 3, '2026-10-31')).toBe('2026-10-07')
    expect(streakReachedDay(daily, done, 2, '2026-10-31')).toBe('2026-10-02')
    expect(streakReachedDay(daily, done, 6, '2026-10-31')).toBeUndefined()
    expect(streakReachedDay(daily, done, 3, '2026-10-06')).toBeUndefined()
  })

  it('liefert bei Wochen-Serien den Tag, an dem die entscheidende Woche erfüllt wurde', () => {
    const habit = makeHabit({ id: 'w', createdDay: '2026-11-02', schedule: { type: 'weekly', times: 2 } })
    const done = daySet('2026-11-02', '2026-11-05', '2026-11-10', '2026-11-12', '2026-11-13')
    expect(streakReachedDay(habit, done, 1, '2026-11-30')).toBe('2026-11-05')
    expect(streakReachedDay(habit, done, 2, '2026-11-30')).toBe('2026-11-12')
  })

  it('stimmt mit computeStreak(…, d).best überein (frühester Tag d mit best ≥ Ziel)', () => {
    const habits: Habit[] = [
      daily,
      monWedFri,
      makeHabit({ id: 'w', createdDay: '2026-10-01', schedule: { type: 'weekly', times: 3 } }),
    ]
    // Pseudozufälliges, aber deterministisches Muster erledigter Tage
    const done = new Set<DayKey>()
    let seed = 7
    for (const day of dayRange('2026-10-01', '2026-12-31')) {
      seed = (seed * 1103515245 + 12345) % 2147483648
      if (seed % 10 < 7) done.add(day)
    }
    for (const habit of habits) {
      for (const target of [1, 2, 3, 4, 5]) {
        const reached = streakReachedDay(habit, done, target, '2026-12-31', '2026-10-10')
        let expected: DayKey | undefined
        for (let day: DayKey = '2026-10-10'; day <= '2026-12-31'; day = addDays(day, 1)) {
          if (computeStreak(habit, done, day, '2026-10-10').best >= target) {
            expected = day
            break
          }
        }
        expect(reached, `${habit.id} / ${target}`).toBe(expected)
      }
    }
  })
})
