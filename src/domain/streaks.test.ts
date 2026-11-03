import { describe, expect, it } from 'vitest'
import { addDays, compareDays, dayRange, isoWeekday, startOfWeek } from './dates'
import { computeStreak, streakReachedDay } from './streaks'
import { daySet, daySetRange, makeHabit, seededRandom } from './testing'
import type { DayKey, Habit, IsoWeekday, Schedule, Streak } from './types'

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

/**
 * Referenzmodell: bewusst naive, wörtliche Umsetzung der Streak-Regeln aus docs/ARCHITECTURE.md über
 * DayKey-Listen – unabhängig vom optimierten Scanner, als Gegenprobe für Zufallstests.
 * Jede Einheit (Plantag bzw. ISO-Woche) ist erfüllt (true), verpasst (false) oder noch offen (null).
 */
function referenceStreak(habit: Habit, done: ReadonlySet<DayKey>, asOf: DayKey, from?: DayKey): Streak {
  const start = from !== undefined && compareDays(from, habit.createdDay) > 0 ? from : habit.createdDay
  let end = asOf
  if (habit.archivedDay !== undefined && compareDays(addDays(habit.archivedDay, -1), end) < 0) {
    end = addDays(habit.archivedDay, -1)
  }
  const window = dayRange(start, end)

  let units: (boolean | null)[]
  const schedule = habit.schedule
  if (schedule.type === 'weekly') {
    const doneByMonday = new Map<DayKey, number>()
    for (const day of window) {
      const monday = startOfWeek(day)
      doneByMonday.set(monday, (doneByMonday.get(monday) ?? 0) + (done.has(day) ? 1 : 0))
    }
    const mondays = [...doneByMonday.keys()]
    units = mondays.map((monday, i) => {
      if ((doneByMonday.get(monday) ?? 0) >= schedule.times) return true
      // Offen: die Woche von asOf bzw. eine durch Archivierung abgeschnittene letzte Woche
      const open = i === mondays.length - 1 && (monday === startOfWeek(asOf) || isoWeekday(end) !== 7)
      return open ? null : false
    })
  } else {
    const planned = window.filter((day) => schedule.type === 'daily' || schedule.days.includes(isoWeekday(day)))
    units = planned.map((day) => (done.has(day) ? true : day === asOf ? null : false))
  }

  let best = 0
  let run = 0
  for (const unit of units) {
    if (unit === true) best = Math.max(best, ++run)
    else if (unit === false) run = 0
  }
  // Aktuell: erfüllte Einheiten am Ende; eine offene letzte Einheit wird übersprungen
  const closed = units.at(-1) === null ? units.slice(0, -1) : units
  let current = 0
  for (let i = closed.length - 1; i >= 0 && closed[i] === true; i--) current++
  return { current, best, unit: schedule.type === 'weekly' ? 'week' : 'day' }
}

/** Zufällige Quest samt Stichtag/`from` rund um einen Jahreswechsel (Woche 53!) und die Zeitumstellung. */
function randomCase(random: () => number) {
  const int = (max: number) => Math.floor(random() * (max + 1))
  const base = random() < 0.5 ? '2026-12-01' : '2026-03-01'
  const kind = random()
  const schedule: Schedule =
    kind < 0.33
      ? { type: 'daily' }
      : kind < 0.66
        ? {
            type: 'weekdays',
            days: ([1, 2, 3, 4, 5, 6, 7] as IsoWeekday[]).filter(() => random() < 0.5).concat([(1 + int(6)) as IsoWeekday]),
          }
        : { type: 'weekly', times: 1 + int(random() < 0.7 ? 3 : 6) }
  const createdDay = addDays(base, int(20))
  const habit = makeHabit({
    id: 'r',
    schedule,
    createdDay,
    archivedDay: random() < 0.35 ? addDays(createdDay, int(70)) : undefined,
  })
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

  it('streakReachedDay = frühester Stichtag mit best ≥ Ziel – auch für archivierte Quests', () => {
    const random = seededRandom(42)
    for (let i = 0; i < 60; i++) {
      const { habit, done, from, asOf } = randomCase(random)
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
