import { describe, expect, it } from 'vitest'
import {
  addDays,
  compareDays,
  dayRange,
  diffDays,
  formatDay,
  fromEpochDay,
  isoWeekday,
  isValidDayKey,
  startOfWeek,
  toDayKey,
  toEpochDay,
} from './dates'

// Hinweis: Diese Tests sollen in jeder Zeitzone grün sein (z. B. TZ=Europe/Berlin und TZ=UTC).
// `new Date(y, m, d, h, min)` erzeugt bewusst lokale Zeitpunkte, weil `toDayKey` lokal rechnet.

describe('isValidDayKey', () => {
  it('akzeptiert echte Kalendertage im Format YYYY-MM-DD', () => {
    expect(isValidDayKey('2026-11-03')).toBe(true)
    expect(isValidDayKey('2026-01-01')).toBe(true)
    expect(isValidDayKey('2026-12-31')).toBe(true)
    expect(isValidDayKey('2026-04-30')).toBe(true)
  })

  it('kennt Schaltjahre (inkl. 100/400-Regel)', () => {
    expect(isValidDayKey('2028-02-29')).toBe(true)
    expect(isValidDayKey('2000-02-29')).toBe(true)
    expect(isValidDayKey('2026-02-29')).toBe(false)
    expect(isValidDayKey('2100-02-29')).toBe(false)
  })

  it('lehnt falsche Formate und unmögliche Daten ab', () => {
    for (const value of [
      '',
      '2026-1-01',
      '2026-01-1',
      '26-01-01',
      ' 2026-01-01',
      '2026-01-01 ',
      '2026-01-01T00:00',
      '2026/01/01',
      '2026-00-10',
      '2026-13-01',
      '2026-01-00',
      '2026-01-32',
      '2026-04-31',
      'heute',
    ]) {
      expect(isValidDayKey(value), value).toBe(false)
    }
  })
})

describe('toEpochDay / fromEpochDay', () => {
  it('zählt Tage seit 1970-01-01', () => {
    expect(toEpochDay('1970-01-01')).toBe(0)
    expect(toEpochDay('1970-01-02')).toBe(1)
    expect(toEpochDay('1969-12-31')).toBe(-1)
    expect(toEpochDay('2026-11-03')).toBe(20760)
  })

  it('ist umkehrbar – auch über Schaltjahre, Jahreswechsel und Umstellungstage hinweg', () => {
    const start = toEpochDay('2025-12-01')
    for (let n = start; n < start + 3 * 366; n++) {
      expect(toEpochDay(fromEpochDay(n))).toBe(n)
    }
    expect(fromEpochDay(toEpochDay('2028-02-29'))).toBe('2028-02-29')
  })

  it('wirft bei ungültigen DayKeys statt still falsch zu rechnen', () => {
    expect(() => toEpochDay('2026-02-30')).toThrow(RangeError)
    expect(() => addDays('kaputt', 1)).toThrow(/Ungültiger Spieltag/)
  })
})

describe('toDayKey', () => {
  it('verwendet den lokalen Kalendertag', () => {
    expect(toDayKey(new Date(2026, 10, 3, 12, 0), 4)).toBe('2026-11-03')
    expect(toDayKey(new Date(2026, 10, 3, 23, 59, 59), 4)).toBe('2026-11-03')
  })

  it('ordnet Momente vor dem Tageswechsel dem Vortag zu (03:59 vs. 04:00)', () => {
    expect(toDayKey(new Date(2026, 10, 3, 3, 59, 59, 999), 4)).toBe('2026-11-02')
    expect(toDayKey(new Date(2026, 10, 3, 4, 0, 0, 0), 4)).toBe('2026-11-03')
    expect(toDayKey(new Date(2026, 10, 3, 0, 0), 4)).toBe('2026-11-02')
  })

  it('mit dayStartHour 0 gilt Mitternacht als Tageswechsel', () => {
    expect(toDayKey(new Date(2026, 10, 3, 0, 0), 0)).toBe('2026-11-03')
    expect(toDayKey(new Date(2026, 10, 2, 23, 59), 0)).toBe('2026-11-02')
  })

  it('unterstützt späte Tageswechsel (z. B. 12 Uhr)', () => {
    expect(toDayKey(new Date(2026, 10, 3, 11, 59), 12)).toBe('2026-11-02')
    expect(toDayKey(new Date(2026, 10, 3, 12, 0), 12)).toBe('2026-11-03')
  })

  it('geht vor dem Tageswechsel korrekt über Monats-, Jahres- und Schaltjahresgrenzen zurück', () => {
    expect(toDayKey(new Date(2027, 0, 1, 1, 30), 4)).toBe('2026-12-31')
    expect(toDayKey(new Date(2026, 11, 1, 3, 0), 4)).toBe('2026-11-30')
    expect(toDayKey(new Date(2028, 2, 1, 2, 0), 4)).toBe('2028-02-29')
    expect(toDayKey(new Date(2026, 2, 1, 2, 0), 4)).toBe('2026-02-28')
  })

  it('ist an Sommerzeit-Umstellungstagen stabil (Europa: 2026-03-29)', () => {
    // In Europe/Berlin springt die Uhr um 02:00 auf 03:00 – der Tag hat nur 23 Stunden.
    expect(toDayKey(new Date(2026, 2, 29, 1, 30), 4)).toBe('2026-03-28')
    expect(toDayKey(new Date(2026, 2, 29, 3, 59), 4)).toBe('2026-03-28')
    expect(toDayKey(new Date(2026, 2, 29, 4, 0), 4)).toBe('2026-03-29')
    expect(toDayKey(new Date(2026, 2, 29, 23, 59), 4)).toBe('2026-03-29')
    expect(toDayKey(new Date(2026, 2, 30, 3, 59), 4)).toBe('2026-03-29')
    expect(toDayKey(new Date(2026, 2, 30, 4, 0), 4)).toBe('2026-03-30')
  })

  it('ist an Winterzeit-Umstellungstagen stabil (Europa: 2026-10-25)', () => {
    // In Europe/Berlin gibt es 02:00–03:00 doppelt – der Tag hat 25 Stunden.
    expect(toDayKey(new Date(2026, 9, 25, 2, 30), 4)).toBe('2026-10-24')
    expect(toDayKey(new Date(2026, 9, 25, 3, 59), 4)).toBe('2026-10-24')
    expect(toDayKey(new Date(2026, 9, 25, 4, 0), 4)).toBe('2026-10-25')
    expect(toDayKey(new Date(2026, 9, 26, 3, 59), 4)).toBe('2026-10-25')
    expect(toDayKey(new Date(2026, 9, 26, 4, 0), 4)).toBe('2026-10-26')
  })

  it('zählt Stunde für Stunde über eine Umstellungswoche genau einen Tageswechsel pro Tag', () => {
    // Von Mo 2026-03-23 04:00 bis Mo 2026-03-30 04:00 lokal, in 30-Minuten-Schritten.
    const seen = new Set<string>()
    const start = new Date(2026, 2, 23, 4, 0).getTime()
    const end = new Date(2026, 2, 30, 4, 0).getTime()
    for (let t = start; t < end; t += 30 * 60 * 1000) seen.add(toDayKey(new Date(t), 4))
    expect([...seen]).toEqual(dayRange('2026-03-23', '2026-03-29'))
  })
})

describe('addDays', () => {
  it('rechnet über Monats- und Jahresgrenzen', () => {
    expect(addDays('2026-11-03', 1)).toBe('2026-11-04')
    expect(addDays('2026-11-30', 1)).toBe('2026-12-01')
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01')
    expect(addDays('2027-01-01', -1)).toBe('2026-12-31')
    expect(addDays('2026-11-03', 0)).toBe('2026-11-03')
    expect(addDays('2026-11-03', 365)).toBe('2027-11-03')
    expect(addDays('2026-11-03', -365)).toBe('2025-11-03')
  })

  it('kennt den 29. Februar', () => {
    expect(addDays('2028-02-28', 1)).toBe('2028-02-29')
    expect(addDays('2028-02-29', 1)).toBe('2028-03-01')
    expect(addDays('2028-03-01', -1)).toBe('2028-02-29')
    expect(addDays('2026-02-28', 1)).toBe('2026-03-01')
  })

  it('wird von Sommer-/Winterzeit nicht beeinflusst', () => {
    expect(addDays('2026-03-28', 1)).toBe('2026-03-29')
    expect(addDays('2026-03-29', 1)).toBe('2026-03-30')
    expect(addDays('2026-03-30', -2)).toBe('2026-03-28')
    expect(addDays('2026-10-24', 1)).toBe('2026-10-25')
    expect(addDays('2026-10-25', 1)).toBe('2026-10-26')
    expect(addDays('2026-10-26', -2)).toBe('2026-10-24')
  })
})

describe('diffDays', () => {
  it('liefert to - from in ganzen Tagen', () => {
    expect(diffDays('2026-11-03', '2026-11-03')).toBe(0)
    expect(diffDays('2026-11-03', '2026-11-10')).toBe(7)
    expect(diffDays('2026-11-10', '2026-11-03')).toBe(-7)
  })

  it('zählt Monate mit Zeitumstellung korrekt (keine 23-/25-Stunden-Fehler)', () => {
    expect(diffDays('2026-03-01', '2026-04-01')).toBe(31)
    expect(diffDays('2026-03-28', '2026-03-30')).toBe(2)
    expect(diffDays('2026-10-01', '2026-11-01')).toBe(31)
    expect(diffDays('2026-10-24', '2026-10-26')).toBe(2)
  })

  it('zählt Schaltjahre', () => {
    expect(diffDays('2028-01-01', '2029-01-01')).toBe(366)
    expect(diffDays('2026-01-01', '2027-01-01')).toBe(365)
    expect(diffDays('2028-02-28', '2028-03-01')).toBe(2)
  })
})

describe('isoWeekday', () => {
  it('liefert 1 = Montag … 7 = Sonntag', () => {
    expect(isoWeekday('2026-11-02')).toBe(1)
    expect(isoWeekday('2026-11-03')).toBe(2)
    expect(isoWeekday('2026-11-05')).toBe(4)
    expect(isoWeekday('2026-11-08')).toBe(7)
    expect(isoWeekday('2026-11-09')).toBe(1)
  })

  it('funktioniert vor 1970, an Schalt- und Umstellungstagen', () => {
    expect(isoWeekday('1970-01-01')).toBe(4)
    expect(isoWeekday('1969-12-29')).toBe(1)
    expect(isoWeekday('2028-02-29')).toBe(2)
    expect(isoWeekday('2026-03-29')).toBe(7)
    expect(isoWeekday('2026-10-25')).toBe(7)
  })
})

describe('startOfWeek', () => {
  it('liefert den Montag derselben ISO-Woche', () => {
    expect(startOfWeek('2026-11-02')).toBe('2026-11-02')
    expect(startOfWeek('2026-11-03')).toBe('2026-11-02')
    expect(startOfWeek('2026-11-08')).toBe('2026-11-02')
    expect(startOfWeek('2026-11-09')).toBe('2026-11-09')
  })

  it('springt über Monats- und Jahresgrenzen zurück', () => {
    expect(startOfWeek('2027-01-01')).toBe('2026-12-28')
    expect(startOfWeek('2027-01-03')).toBe('2026-12-28')
    expect(startOfWeek('2026-01-01')).toBe('2025-12-29')
    expect(startOfWeek('2028-03-01')).toBe('2028-02-28')
    expect(startOfWeek('2026-03-29')).toBe('2026-03-23')
  })
})

describe('dayRange', () => {
  it('ist an beiden Enden inklusive', () => {
    expect(dayRange('2026-11-01', '2026-11-03')).toEqual(['2026-11-01', '2026-11-02', '2026-11-03'])
    expect(dayRange('2026-11-03', '2026-11-03')).toEqual(['2026-11-03'])
  })

  it('ist leer, wenn from nach to liegt', () => {
    expect(dayRange('2026-11-04', '2026-11-03')).toEqual([])
  })

  it('läuft über Jahreswechsel, Schalttage und Zeitumstellungen ohne Lücken oder Doppelte', () => {
    expect(dayRange('2026-12-30', '2027-01-02')).toEqual(['2026-12-30', '2026-12-31', '2027-01-01', '2027-01-02'])
    expect(dayRange('2028-02-28', '2028-03-01')).toEqual(['2028-02-28', '2028-02-29', '2028-03-01'])
    expect(dayRange('2026-03-28', '2026-03-30')).toEqual(['2026-03-28', '2026-03-29', '2026-03-30'])
    expect(dayRange('2026-10-24', '2026-10-26')).toEqual(['2026-10-24', '2026-10-25', '2026-10-26'])
    expect(dayRange('2026-01-01', '2026-12-31')).toHaveLength(365)
    expect(dayRange('2028-01-01', '2028-12-31')).toHaveLength(366)
  })
})

describe('compareDays', () => {
  it('ordnet Tage chronologisch', () => {
    expect(compareDays('2026-11-03', '2026-11-04')).toBeLessThan(0)
    expect(compareDays('2026-11-04', '2026-11-03')).toBeGreaterThan(0)
    expect(compareDays('2026-11-03', '2026-11-03')).toBe(0)
    expect(compareDays('2026-12-31', '2027-01-01')).toBeLessThan(0)
    expect(['2027-01-01', '2026-02-10', '2026-11-03'].sort(compareDays)).toEqual([
      '2026-02-10',
      '2026-11-03',
      '2027-01-01',
    ])
  })
})

describe('formatDay', () => {
  it('formatiert lang auf Deutsch (Standard)', () => {
    expect(formatDay('2026-11-03')).toBe('Dienstag, 3. November 2026')
    expect(formatDay('2026-11-03', 'long')).toBe('Dienstag, 3. November 2026')
    expect(formatDay('2026-01-01')).toBe('Donnerstag, 1. Januar 2026')
    expect(formatDay('2028-02-29')).toBe('Dienstag, 29. Februar 2028')
  })

  it('formatiert kurz auf Deutsch', () => {
    expect(formatDay('2026-11-03', 'short')).toBe('3. Nov.')
    expect(formatDay('2026-12-31', 'short')).toBe('31. Dez.')
    expect(formatDay('2026-03-01', 'short')).toBe('1. März')
  })

  it('verschiebt den Tag nicht durch die lokale Zeitzone (auch an Umstellungstagen)', () => {
    expect(formatDay('2026-03-29')).toBe('Sonntag, 29. März 2026')
    expect(formatDay('2026-10-25')).toBe('Sonntag, 25. Oktober 2026')
  })
})
