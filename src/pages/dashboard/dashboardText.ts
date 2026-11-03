/**
 * Reine Hilfsfunktionen der Tagesübersicht: Texte (Deutsch, Du-Form) und kleine Berechnungen.
 * Bewusst ohne React, damit sie einzeln testbar sind.
 */
import { BALANCING } from '../../domain/balancing'
import { addDays, compareDays, startOfWeek } from '../../domain/dates'
import { isActiveOn } from '../../domain/schedule'
import type { DayKey, DayState, GameData, Streak } from '../../domain/types'
import { countDecimals, formatNumber } from '../../ui'

/** "1 Quest" / "2 Quests" – Zahl de-DE formatiert, Singular nur bei genau 1. */
export function countLabel(n: number, singular: string, plural: string): string {
  return `${formatNumber(n)} ${n === 1 ? singular : plural}`
}

/** Messwert für die Anzeige: höchstens zwei Nachkommastellen, de-DE ("1,5"). */
export function formatValue(value: number): string {
  return formatNumber(value, { maximumFractionDigits: 2 })
}

/** Prozentangabe des Perfekter-Tag-Bonus, z. B. "25 %". */
export function perfectBonusPercent(): string {
  return `${formatNumber(Math.round(BALANCING.perfectDayBonus * 100))} %`
}

/**
 * Erklärung unter dem Perfekter-Tag-Bonus: Er ist ein Anteil aller Quest-XP des Tages und wächst daher mit
 * jeder weiteren erledigten Quest – auch mit Wochenquests (Regel 2 in engine.ts).
 */
export function perfectBonusExplanation(offset: number): string {
  const whose = offset === 0 ? 'deiner heutigen' : offset === 1 ? 'deiner gestrigen' : 'deiner'
  return `${perfectBonusPercent()} ${whose} Quest-XP – wächst mit jeder weiteren Quest (auch Wochenquests)`
}

/**
 * Tagesstand für einen früheren Tag `day` mit den Wochen-Streaks von heute, wenn `day` in derselben ISO-Woche
 * liegt: Der Wochenfortschritt zählt die ganze laufende Woche (auch heute), der Streak zum Stichtag `day`
 * aber nur bis dahin – sonst stünde „Wochenziel erreicht“ neben einem Streak ohne diese Woche.
 * Tagesquests behalten ihren Streak zum gewählten Tag.
 */
export function withCurrentWeekStreaks(dayState: DayState, todayState: DayState, today: DayKey): DayState {
  if (dayState.day === today || startOfWeek(dayState.day) !== startOfWeek(today)) return dayState
  const todayStreaks = new Map(todayState.habits.map((status) => [status.habit.id, status.streak]))
  let changed = false
  const habits = dayState.habits.map((status) => {
    if (status.week === undefined || status.streak.unit !== 'week') return status
    const streak = todayStreaks.get(status.habit.id)
    if (streak === undefined || streak.unit !== 'week') return status
    changed = true
    return { ...status, streak }
  })
  return changed ? { ...dayState, habits } : dayState
}

/**
 * Kapitelzeile der Kampagnen-Karte. „X / Y“ zählt wie auf der Kampagnen-Seite die abgeschlossenen Kapitel:
 * "Aktuelles Kapitel: Das erste Buch · 1 / 6 abgeschlossen".
 */
export function campaignChapterLine(campaign: {
  chapters: readonly { chapter: { title: string }; done: boolean }[]
  currentChapterIndex: number
  complete: boolean
}): string {
  const { chapters, currentChapterIndex, complete } = campaign
  const current = currentChapterIndex >= 0 ? chapters[currentChapterIndex] : undefined
  if (chapters.length === 0) return 'Noch keine Kapitel'
  if (complete || !current) return 'Alle Kapitel gemeistert'
  const done = chapters.filter((chapter) => chapter.done).length
  return `Aktuelles Kapitel: ${current.chapter.title} · ${formatNumber(done)} / ${formatNumber(chapters.length)} abgeschlossen`
}

let compactDayFormatter: Intl.DateTimeFormat | undefined

/** Kurzes Datum für die Heldenleiste auf dem Handy: "Di., 3. Nov." (de-DE). */
export function compactDayLabel(day: DayKey): string {
  compactDayFormatter ??= new Intl.DateTimeFormat('de-DE', {
    timeZone: 'UTC',
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  })
  return compactDayFormatter.format(new Date(`${day}T00:00:00Z`))
}

/** Vorgelesener Streak: "12 Tage in Folge", "1 Woche in Folge". */
export function streakText(streak: Streak): string {
  return streak.unit === 'day'
    ? `${countLabel(streak.current, 'Tag', 'Tage')} in Folge`
    : `${countLabel(streak.current, 'Woche', 'Wochen')} in Folge`
}

/** Sichtbarer Streak neben der Flamme: "12" bzw. bei Wochenquests "3 Wo.". */
export function streakShort(streak: Streak): string {
  return streak.unit === 'day' ? formatNumber(streak.current) : `${formatNumber(streak.current)} Wo.`
}

export type DeadlineTone = 'normal' | 'soon' | 'overdue'

/**
 * Restlaufzeit einer Kampagne: "noch 211 Tage", "noch 1 Tag", "heute fällig",
 * "seit 3 Tagen überfällig". `undefined` ohne Zieldatum.
 */
export function deadlineText(daysLeft: number | undefined): { text: string; tone: DeadlineTone } | undefined {
  if (daysLeft === undefined) return undefined
  if (daysLeft > 0) return { text: `noch ${countLabel(daysLeft, 'Tag', 'Tage')}`, tone: daysLeft <= 7 ? 'soon' : 'normal' }
  if (daysLeft === 0) return { text: 'heute fällig', tone: 'soon' }
  return { text: `seit ${countLabel(-daysLeft, 'Tag', 'Tagen')} überfällig`, tone: 'overdue' }
}

/** Beschriftung des Tagesumschalters: 0 → "Heute", 1 → "Gestern", 2 → "Vorgestern". */
export function dayOffsetLabel(offset: number): string {
  if (offset === 0) return 'Heute'
  if (offset === 1) return 'Gestern'
  if (offset === 2) return 'Vorgestern'
  return `Vor ${formatNumber(offset)} Tagen`
}

/** Kleingeschriebene Variante für Fließtext: "heute", "gestern", "vorgestern". */
export function dayOffsetWord(offset: number): string {
  const label = dayOffsetLabel(offset)
  return offset <= 2 ? label.toLowerCase() : label.replace(/^Vor/, 'vor')
}

/**
 * Welche Tage dürfen bearbeitet werden? Heute immer; rückwirkend bis `BALANCING.backfillDays`,
 * aber nur Tage, an denen das Abenteuer schon lief oder eine Quest aktiv war.
 * Liefert die Abstände zu heute (0 = heute, 1 = gestern …).
 */
export function selectableDayOffsets(data: GameData, today: DayKey): number[] {
  const offsets = [0]
  for (let offset = 1; offset <= BALANCING.backfillDays; offset++) {
    const day = addDays(today, -offset)
    const profileExisted = data.profile !== undefined && compareDays(data.profile.createdDay, day) <= 0
    if (profileExisted || data.habits.some((habit) => isActiveOn(habit, day))) offsets.push(offset)
  }
  return offsets
}

/** Gibt es überhaupt eine Quest, die an einem der wählbaren Tage aktiv ist? */
export function hasActiveHabits(data: GameData, today: DayKey): boolean {
  const days = selectableDayOffsets(data, today).map((offset) => addDays(today, -offset))
  return data.habits.some((habit) => days.some((day) => isActiveOn(habit, day)))
}

/** "diese Woche" bzw. "letzte Woche", je nachdem, ob `day` in der Woche von `today` liegt. */
export function weekWord(day: DayKey, today: DayKey): string {
  return startOfWeek(day) === startOfWeek(today) ? 'diese Woche' : 'letzte Woche'
}

/**
 * `value + delta`, ohne Gleitkomma-Rauschen (0,1 + 0,2 = 0,3) und nie unter 0.
 */
export function stepValue(value: number, delta: number): number {
  const decimals = Math.min(10, Math.max(countDecimals(value), countDecimals(delta)))
  return Math.max(0, Number((value + delta).toFixed(decimals)))
}
