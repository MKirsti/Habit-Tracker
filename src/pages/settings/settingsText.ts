import { DEFAULT_SETTINGS } from '../../domain/balancing'
import type { DayKey } from '../../domain/types'

/** Beschriftung einer Uhrzeit für den Tageswechsel, z. B. "4:00 Uhr (Standard)". */
export function dayStartLabel(hour: number): string {
  const base = `${hour}:00 Uhr`
  if (hour === 0) return `${base} (Mitternacht)`
  if (hour === DEFAULT_SETTINGS.dayStartHour) return `${base} (Standard)`
  if (hour === 12) return `${base} (Mittag)`
  return base
}

let weekdayDayFormatter: Intl.DateTimeFormat | undefined

/** Spieltag kurz mit Wochentag, z. B. "Di., 3. Nov." (als UTC-Datum – die Zeitzone verschiebt nichts). */
export function formatWeekdayDay(day: DayKey): string {
  weekdayDayFormatter ??= new Intl.DateTimeFormat('de-DE', {
    timeZone: 'UTC',
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  })
  return weekdayDayFormatter.format(new Date(`${day}T00:00:00Z`))
}

/**
 * Rückfrage, wenn ein späterer Tageswechsel den Spieltag zurückspringen lässt: Was für den bisherigen
 * Spieltag schon erfasst ist, liegt dann in der Zukunft und zählt erst ab der neuen Uhrzeit wieder.
 */
export function dayStartBackText(hour: number, newToday: DayKey, laterDay: DayKey): { title: string; message: string } {
  // Datum und Uhrzeit nicht mitten im Wort umbrechen („Di., | 3. Nov.“).
  const together = (text: string) => text.replaceAll(' ', '\u00a0')
  const time = `${hour}:00 Uhr`
  return {
    title: `Tageswechsel auf ${together(time)} legen?`,
    message: `Der Spieltag springt zurück auf ${together(formatWeekdayDay(newToday))} – was du für ${together(formatWeekdayDay(laterDay))} schon abgehakt hast, zählt erst ab ${together(time)} wieder.`,
  }
}

/** Wort, das zur Bestätigung des Zurücksetzens eingetippt werden muss. */
export const RESET_CONFIRM_WORD = 'LÖSCHEN'

/** Groß-/Kleinschreibung egal (Handy-Tastaturen schreiben gern „Löschen“), Leerzeichen am Rand auch. */
export function matchesConfirmWord(input: string): boolean {
  return input.normalize('NFC').trim().toLocaleUpperCase('de-DE') === RESET_CONFIRM_WORD
}

/** Abschnitt der Einstellungen, den `?bereich=` ansteuert (z. B. aus „Urlaub planen“ auf der Tagesübersicht). */
export const SETTINGS_SECTION_PARAM = 'bereich'

/** „Rast & Urlaub“ in den Einstellungen – die Seite scrollt beim Öffnen dorthin. */
export const REST_SETTINGS_PATH = `/einstellungen?${SETTINGS_SECTION_PARAM}=rast`
