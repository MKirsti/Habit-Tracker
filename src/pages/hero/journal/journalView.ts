/**
 * Tagebuch der Heldenseite (Phase 3b): Ereignisse (`journalEvents`) und Notizen (`JournalNote`) zu Tagen gruppiert –
 * rein (ohne React), einzeln testbar.
 *
 * - Neueste Tage zuerst; an einem Tag bleibt die Reihenfolge der Ereignisse, wie die Domain sie liefert.
 * - „Alles“: jeder Tag mit Ereignis oder Notiz – **heute steht immer oben** (dort lässt sich gleich etwas aufschreiben).
 * - „Nur Notizen“: nur Tage mit Notiz.
 * - Lange Geschichten werden seitenweise gezeigt (`JOURNAL_PAGE_DAYS` Tage, dann „Ältere laden“).
 */
import { addDays, compareDays, formatDay, isValidDayKey, startOfWeek } from '../../../domain/dates'
import type { DayKey, JournalEvent, JournalEventKind, JournalNote } from '../../../domain/types'
import { formatNumber } from '../../../ui'

export type JournalFilter = 'all' | 'notes'

/** So viele Tage zeigt das Tagebuch auf einmal (danach „Ältere laden“). */
export const JOURNAL_PAGE_DAYS = 30

/** Ein Tag mit vielen Ereignissen (z. B. eine Handvoll Erfolge auf einmal) zeigt erst so viele, dann „… weitere“. */
export const JOURNAL_DAY_PREVIEW = 5

/**
 * Ereignisse eines Tages, die zugeklappt sichtbar sind: alle, wenn es höchstens eines mehr als die Vorschau sind (ein
 * Knopf für einen einzigen Eintrag lohnt nicht), sonst die ersten `JOURNAL_DAY_PREVIEW`.
 */
export function previewEvents<T>(events: readonly T[], expanded: boolean): { shown: readonly T[]; hidden: number } {
  if (expanded || events.length <= JOURNAL_DAY_PREVIEW + 1) return { shown: events, hidden: 0 }
  return { shown: events.slice(0, JOURNAL_DAY_PREVIEW), hidden: events.length - JOURNAL_DAY_PREVIEW }
}

/** „1 weiterer Eintrag“ / „8 weitere Einträge“. */
export function moreEventsText(count: number): string {
  return count === 1 ? '1 weiterer Eintrag' : `${formatNumber(count)} weitere Einträge`
}

export interface JournalDay {
  day: DayKey
  events: JournalEvent[]
  note?: JournalNote
}

/** Ereignisse und Notizen zu Tagen gruppiert (neueste zuerst), passend zum Filter. Notizen nach heute zählen nicht. */
export function journalDays(
  events: readonly JournalEvent[],
  notes: readonly JournalNote[] | undefined,
  today: DayKey,
  filter: JournalFilter,
): JournalDay[] {
  const days = new Map<DayKey, JournalDay>()
  const entry = (day: DayKey): JournalDay => {
    let found = days.get(day)
    if (found === undefined) {
      found = { day, events: [] }
      days.set(day, found)
    }
    return found
  }
  if (filter === 'all') {
    entry(today)
    for (const event of events) {
      if (isValidDayKey(event.day) && compareDays(event.day, today) <= 0) entry(event.day).events.push(event)
    }
  }
  for (const note of notes ?? []) {
    if (!isValidDayKey(note.day) || compareDays(note.day, today) > 0) continue
    entry(note.day).note = note
  }
  return [...days.values()].sort((a, b) => compareDays(b.day, a.day))
}

/** Wie viele Notizen bis heute geschrieben sind. */
export function noteCount(notes: readonly JournalNote[] | undefined, today: DayKey): number {
  return (notes ?? []).filter((note) => isValidDayKey(note.day) && compareDays(note.day, today) <= 0).length
}

/** „1 Notiz“ / „12 Notizen“. */
export function noteCountText(count: number): string {
  return count === 1 ? '1 Notiz' : `${formatNumber(count)} Notizen`
}

/** „Noch 1 älterer Tag“ / „Noch 42 ältere Tage“. */
export function olderDaysText(count: number): string {
  return count === 1 ? 'Noch 1 älterer Tag' : `Noch ${formatNumber(count)} ältere Tage`
}

/** Überschrift eines Tages: „Heute“, „Gestern“, sonst „Dienstag, 3. November 2026“. */
export function journalDayLabel(day: DayKey, today: DayKey): string {
  if (day === today) return 'Heute'
  if (day === addDays(today, -1)) return 'Gestern'
  return formatDay(day, 'long')
}

/** Zusatz zur Überschrift von „Heute“/„Gestern“: das Datum kurz („3. Nov.“). */
export function journalDaySubLabel(day: DayKey, today: DayKey): string | undefined {
  return day === today || day === addDays(today, -1) ? formatDay(day, 'short') : undefined
}

let monthFormatter: Intl.DateTimeFormat | undefined

/** „November 2026“ – Monats-Trenner in langen Geschichten (als UTC-Datum: die Zeitzone verschiebt nichts). */
export function journalMonthLabel(day: DayKey): string {
  monthFormatter ??= new Intl.DateTimeFormat('de-DE', { timeZone: 'UTC', month: 'long', year: 'numeric' })
  return monthFormatter.format(new Date(`${day.slice(0, 7)}-01T00:00:00Z`))
}

/** Beginnt mit diesem Tag ein neuer Monat (gegenüber dem darüber stehenden Tag)? */
export function startsNewMonth(day: DayKey, previous: DayKey | undefined): boolean {
  return previous === undefined || previous.slice(0, 7) !== day.slice(0, 7)
}

/** Wie ein Ereignis aussieht: Gold (Belohnung & Aufstieg), Boss (Siege), Gefährte, sonst ruhig. */
export type JournalTone = 'gold' | 'boss' | 'companion' | 'review' | 'calm'

const KIND_TONES: Record<JournalEventKind, JournalTone> = {
  adventureStart: 'gold',
  levelUp: 'gold',
  classChange: 'gold',
  chapter: 'calm',
  campaignStart: 'calm',
  campaignComplete: 'gold',
  bossVictory: 'boss',
  endBossVictory: 'boss',
  achievement: 'gold',
  defeat: 'calm',
  reward: 'gold',
  chestOpened: 'gold',
  companionChosen: 'companion',
  companionStage: 'companion',
  weeklyReview: 'review',
}

export function journalTone(kind: JournalEventKind): JournalTone {
  return KIND_TONES[kind] ?? 'calm'
}

/** Montag der Woche eines Wochenrückblick-Eintrags (er steht am Sonntag der Woche). */
export function reviewWeekStartOf(event: Pick<JournalEvent, 'day'>): DayKey {
  return startOfWeek(event.day)
}

export interface NoteDayCheck {
  day: DayKey
  today: DayKey
  /** Abenteuerbeginn (`profile.createdDay`) – davor gibt es kein Tagebuch. */
  createdDay?: DayKey
}

/** Fehlertext für den Tag einer Notiz – `undefined`, wenn er passt (heute oder früher, ab dem Abenteuerbeginn). */
export function noteDayError({ day, today, createdDay }: NoteDayCheck): string | undefined {
  if (!isValidDayKey(day)) return 'Wähle einen Tag.'
  if (compareDays(day, today) > 0) return 'Die Zukunft ist noch ungeschrieben – wähle heute oder einen früheren Tag.'
  if (createdDay !== undefined && isValidDayKey(createdDay) && compareDays(day, createdDay) < 0) {
    return `Dein Abenteuer begann am ${formatDay(createdDay, 'short')} – davor gibt es noch kein Tagebuch.`
  }
  return undefined
}

/** Titel des Notiz-Dialogs: „Notiz zu heute“, „Notiz zu gestern“, „Notiz zum 3. Nov.“. */
export function noteDialogTitle(day: DayKey, today: DayKey): string {
  if (day === today) return 'Notiz zu heute'
  if (day === addDays(today, -1)) return 'Notiz zu gestern'
  return isValidDayKey(day) ? `Notiz zum ${formatDay(day, 'short')}` : 'Notiz'
}
