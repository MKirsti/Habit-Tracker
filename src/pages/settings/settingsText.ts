import { DEFAULT_SETTINGS } from '../../domain/balancing'

/** Beschriftung einer Uhrzeit für den Tageswechsel, z. B. "4:00 Uhr (Standard)". */
export function dayStartLabel(hour: number): string {
  const base = `${hour}:00 Uhr`
  if (hour === 0) return `${base} (Mitternacht)`
  if (hour === DEFAULT_SETTINGS.dayStartHour) return `${base} (Standard)`
  if (hour === 12) return `${base} (Mittag)`
  return base
}

/** Wort, das zur Bestätigung des Zurücksetzens eingetippt werden muss. */
export const RESET_CONFIRM_WORD = 'LÖSCHEN'

/** Groß-/Kleinschreibung egal (Handy-Tastaturen schreiben gern „Löschen“), Leerzeichen am Rand auch. */
export function matchesConfirmWord(input: string): boolean {
  return input.normalize('NFC').trim().toLocaleUpperCase('de-DE') === RESET_CONFIRM_WORD
}
