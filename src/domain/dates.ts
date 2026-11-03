/**
 * Spieltage (DayKey) & Kalender-Arithmetik.
 *
 * Ein DayKey ist ein reiner Kalendertag im Format 'YYYY-MM-DD' ohne Uhrzeit und ohne Zeitzone.
 * Nur `toDayKey` schaut auf die lokale Uhrzeit (inkl. einstellbarem Tageswechsel). Alle anderen
 * Berechnungen laufen über UTC-Zeitstempel ganzer Tage (`Date.UTC`), damit Sommer-/Winterzeit-
 * Umstellungen niemals einen Tag verschieben oder einen Tag "23 bzw. 25 Stunden lang" machen.
 *
 * Intern wird ein Tag dafür als "Epoch-Tag" dargestellt: Anzahl Tage seit 1970-01-01 (UTC).
 * `toEpochDay`/`fromEpochDay` sind exportiert, damit Schleifen über viele Tage (z. B. Streaks)
 * mit Ganzzahlen statt mit Strings rechnen können.
 */
import type { DayKey, IsoWeekday } from './types'

const MS_PER_DAY = 86_400_000

const DAY_KEY_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/

function isLeapYear(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0
}

function daysInMonth(year: number, month: number): number {
  switch (month) {
    case 2:
      return isLeapYear(year) ? 29 : 28
    case 4:
    case 6:
    case 9:
    case 11:
      return 30
    default:
      return 31
  }
}

function pad(value: number, length: number): string {
  return String(value).padStart(length, '0')
}

/** Zerlegt einen DayKey in Jahr/Monat/Tag oder liefert `undefined`, wenn er kein gültiges Datum ist. */
function parseParts(value: string): { year: number; month: number; day: number } | undefined {
  const match = DAY_KEY_PATTERN.exec(value)
  if (!match) return undefined
  const year = Number(match[1])
  const month = Number(match[2])
  const day = Number(match[3])
  if (month < 1 || month > 12) return undefined
  if (day < 1 || day > daysInMonth(year, month)) return undefined
  return { year, month, day }
}

/** UTC-Mitternacht (epoch ms) eines Kalendertags. Robust auch für Jahre < 100 (anders als `Date.UTC`). */
function utcMidnight(year: number, monthIndex: number, day: number): number {
  const date = new Date(Date.UTC(2000, 0, 1))
  date.setUTCFullYear(year, monthIndex, day)
  return date.getTime()
}

/** Formatiert Jahr/Monat(1–12)/Tag als DayKey. */
function formatParts(year: number, month: number, day: number): DayKey {
  return `${pad(year, 4)}-${pad(month, 2)}-${pad(day, 2)}`
}

/** Ist `value` ein gültiger DayKey ('YYYY-MM-DD' mit existierendem Kalenderdatum)? */
export function isValidDayKey(value: string): boolean {
  return typeof value === 'string' && parseParts(value) !== undefined
}

/**
 * Tage seit 1970-01-01 (kann negativ sein).
 * @throws RangeError bei ungültigem DayKey – kaputte Daten sollen laut auffallen statt still falsch zu rechnen.
 */
export function toEpochDay(day: DayKey): number {
  const parts = parseParts(day)
  if (!parts) throw new RangeError(`Ungültiger Spieltag: "${day}" (erwartet: YYYY-MM-DD)`)
  return Math.round(utcMidnight(parts.year, parts.month - 1, parts.day) / MS_PER_DAY)
}

/** Umkehrung von `toEpochDay`. */
export function fromEpochDay(epochDay: number): DayKey {
  const date = new Date(epochDay * MS_PER_DAY)
  return formatParts(date.getUTCFullYear(), date.getUTCMonth() + 1, date.getUTCDate())
}

/**
 * Spieltag eines Zeitpunkts in **lokaler** Zeit.
 * Liegt die lokale Stunde vor `dayStartHour`, gehört der Moment noch zum Vortag
 * (Standard 4 → 03:59 Uhr zählt zum Vortag, 04:00 Uhr ist der neue Tag).
 */
export function toDayKey(now: Date, dayStartHour: number): DayKey {
  const calendarDay = formatParts(now.getFullYear(), now.getMonth() + 1, now.getDate())
  // Der Rückschritt um einen Tag läuft über die UTC-Arithmetik, nicht über "now - 24 h":
  // an Umstellungstagen wäre ein lokaler Tag sonst 23 bzw. 25 Stunden lang.
  return now.getHours() < dayStartHour ? addDays(calendarDay, -1) : calendarDay
}

/** Verschiebt einen Tag um `n` Kalendertage (n darf negativ sein). */
export function addDays(day: DayKey, n: number): DayKey {
  return fromEpochDay(toEpochDay(day) + n)
}

/** Abstand in Tagen: `to - from` (positiv, wenn `to` später liegt). */
export function diffDays(from: DayKey, to: DayKey): number {
  return toEpochDay(to) - toEpochDay(from)
}

/** ISO-Wochentag eines Epoch-Tags. 1970-01-01 war ein Donnerstag (4). */
function isoWeekdayOfEpochDay(epochDay: number): IsoWeekday {
  return ((((epochDay + 3) % 7) + 7) % 7 + 1) as IsoWeekday
}

/** ISO-Wochentag: 1 = Montag … 7 = Sonntag. */
export function isoWeekday(day: DayKey): IsoWeekday {
  return isoWeekdayOfEpochDay(toEpochDay(day))
}

/** Montag der ISO-Woche (Mo–So), in der `day` liegt. */
export function startOfWeek(day: DayKey): DayKey {
  const epochDay = toEpochDay(day)
  return fromEpochDay(epochDay - (isoWeekdayOfEpochDay(epochDay) - 1))
}

/** Alle Tage von `from` bis `to`, beide inklusive. Leer, wenn `from` nach `to` liegt. */
export function dayRange(from: DayKey, to: DayKey): DayKey[] {
  const start = toEpochDay(from)
  const end = toEpochDay(to)
  const days: DayKey[] = []
  for (let epochDay = start; epochDay <= end; epochDay++) days.push(fromEpochDay(epochDay))
  return days
}

/**
 * Vergleich zweier DayKeys: < 0, wenn `a` früher liegt, 0 bei Gleichheit, > 0, wenn `a` später liegt.
 * Gültige DayKeys sind lexikografisch sortierbar, daher reicht ein String-Vergleich.
 */
export function compareDays(a: DayKey, b: DayKey): number {
  return a < b ? -1 : a > b ? 1 : 0
}

// Intl-Formatter sind teuer in der Erstellung – einmal anlegen und wiederverwenden.
// Formatiert wird als UTC-Datum in Zeitzone UTC, damit die lokale Zeitzone den Tag nicht verschiebt.
let longFormatter: Intl.DateTimeFormat | undefined
let shortFormatter: Intl.DateTimeFormat | undefined

/**
 * Lesbares Datum auf Deutsch.
 * - `long` (Standard): "Dienstag, 3. November 2026"
 * - `short`: "3. Nov."
 */
export function formatDay(day: DayKey, style: 'long' | 'short' = 'long'): string {
  const date = new Date(toEpochDay(day) * MS_PER_DAY)
  if (style === 'short') {
    shortFormatter ??= new Intl.DateTimeFormat('de-DE', { timeZone: 'UTC', day: 'numeric', month: 'short' })
    return shortFormatter.format(date)
  }
  longFormatter ??= new Intl.DateTimeFormat('de-DE', {
    timeZone: 'UTC',
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  })
  return longFormatter.format(date)
}
