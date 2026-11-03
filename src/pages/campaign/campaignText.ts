/**
 * Reine Hilfsfunktionen der Kampagnen-Seite: Texte (Deutsch, Du-Form) für Zeitangaben und
 * Kapitel-Fortschritt. Bewusst ohne React, damit sie einzeln testbar sind.
 */
import { BALANCING } from '../../domain/balancing'
import { compareDays, diffDays, formatDay } from '../../domain/dates'
import type { ChapterCriterion, ChapterState, DayKey, Habit } from '../../domain/types'
import { formatNumber } from '../../ui'

/** "1 Kapitel" / "2 Tage" – Zahl de-DE formatiert, Singular nur bei genau 1. */
export function countLabel(n: number, singular: string, plural: string): string {
  return `${formatNumber(n)} ${n === 1 ? singular : plural}`
}

/** Messwert für die Anzeige: höchstens zwei Nachkommastellen, de-DE ("1.000", "2,5"). */
export function formatValue(value: number): string {
  return formatNumber(value, { maximumFractionDigits: 2 })
}

/**
 * Kurzes Datum: "3. Nov." – mit Jahreszahl, wenn es nicht im Jahr von `today` liegt ("3. Nov. 2027").
 */
export function formatDate(day: DayKey, today: DayKey): string {
  const short = formatDay(day, 'short')
  return day.slice(0, 4) === today.slice(0, 4) ? short : `${short} ${day.slice(0, 4)}`
}

export type DeadlineTone = 'normal' | 'soon' | 'overdue'

/**
 * Restlaufzeit bis zum Zieldatum: "noch 211 Tage", "noch 1 Tag", "heute fällig",
 * "seit 3 Tagen überfällig". `undefined` ohne Zieldatum.
 */
export function deadlineText(daysLeft: number | undefined): { text: string; tone: DeadlineTone } | undefined {
  if (daysLeft === undefined) return undefined
  if (daysLeft > 0) return { text: `noch ${countLabel(daysLeft, 'Tag', 'Tage')}`, tone: daysLeft <= 7 ? 'soon' : 'normal' }
  if (daysLeft === 0) return { text: 'heute fällig', tone: 'soon' }
  return { text: `seit ${countLabel(-daysLeft, 'Tag', 'Tagen')} überfällig`, tone: 'overdue' }
}

/**
 * Wie lange läuft die Kampagne schon? "beginnt heute", "Tag 31", "beginnt morgen", "beginnt in 5 Tagen".
 */
export function campaignDayText(startDay: DayKey, today: DayKey): string {
  const elapsed = diffDays(startDay, today)
  if (elapsed > 0) return `Tag ${formatNumber(elapsed + 1)}`
  if (elapsed === 0) return 'beginnt heute'
  if (elapsed === -1) return 'beginnt morgen'
  return `beginnt in ${countLabel(-elapsed, 'Tag', 'Tagen')}`
}

/** Laufzeit in Worten: volle Jahre ("1 Jahr", "2 Jahre"), sonst Tage ("90 Tage"). */
export function durationLabel(days: number): string {
  if (days >= 365 && days % 365 === 0) return countLabel(days / 365, 'Jahr', 'Jahre')
  return countLabel(days, 'Tag', 'Tage')
}

/** "+100 XP pro Kapitel · +500 XP für die Kampagne" (aus `BALANCING`). */
export function xpHint(): string {
  return `+${formatNumber(BALANCING.chapterXp)} XP pro Kapitel · +${formatNumber(BALANCING.mainQuestXp)} XP für die Kampagne`
}

// ---------------------------------------------------------------------------
// Kapitel
// ---------------------------------------------------------------------------

export type ChapterType = ChapterCriterion['type']
export type HabitMetric = Extract<ChapterCriterion, { type: 'habit' }>['metric']

/** Bezeichnungen der Kapitel-Arten (wie im Formular). */
export const CHAPTER_TYPE_LABELS: Record<ChapterType, string> = {
  manual: 'Abhaken',
  counter: 'Zähler',
  habit: 'Quest-Ziel',
}

/** Bezeichnungen der Messgrößen eines Quest-Ziels (wie im Formular). */
export const METRIC_LABELS: Record<HabitMetric, string> = {
  completions: 'Erledigungen',
  total: 'Gesamtmenge',
  streak: 'Streak',
}

/** Zählt die Quest in Wochen (Wochenquest) statt in Tagen? */
function countsWeeks(habit: Habit | undefined): boolean {
  return habit?.schedule.type === 'weekly'
}

/**
 * Einheit eines Quest-Ziels, passend zur Zahl `n`:
 * completions → "Tag"/"Tage", total → Einheit der Quest (sonst "gesamt"), streak → "Tag(e)" bzw. "Woche(n)".
 */
export function metricUnit(metric: HabitMetric, habit: Habit | undefined, n: number): string {
  switch (metric) {
    case 'completions':
      return n === 1 ? 'Tag' : 'Tage'
    case 'total':
      return habit?.measure?.unit ?? 'gesamt'
    case 'streak':
      if (countsWeeks(habit)) return n === 1 ? 'Woche' : 'Wochen'
      return n === 1 ? 'Tag' : 'Tage'
  }
}

/** Einheit im Dativ für vorgelesene Texte ("5 von 7 Tagen"). */
function metricUnitDative(metric: HabitMetric, habit: Habit | undefined, n: number): string {
  if (metric === 'total') return metricUnit(metric, habit, n)
  if (metric === 'streak' && countsWeeks(habit)) return n === 1 ? 'Woche' : 'Wochen'
  return n === 1 ? 'Tag' : 'Tagen'
}

export interface ChapterProgressText {
  /** Kleine Beschriftung vor dem Wert, z. B. "Bester Streak" (kann leer sein). */
  prefix: string
  /** "5 / 7" */
  value: string
  /** Einheit/Bezeichnung hinter dem Wert, z. B. "Tage", "Seiten", "Bücher beendet". */
  suffix: string
  /** Vollständiger Text für Screenreader, z. B. "Bester Streak: 12 von 21 Tagen". */
  spoken: string
}

/**
 * Fortschritt eines Zähler- oder Quest-Kapitels als Text: "5 / 7 Tage", "430 / 1.000 Seiten",
 * "Bester Streak 12 / 21 Tage", "3 / 12 Bücher beendet". Für 'manual' gibt es keinen Zahlenwert.
 */
export function chapterProgressText(state: ChapterState, habit: Habit | undefined): ChapterProgressText | undefined {
  const { criterion } = state.chapter
  // Abgeschlossene Quest-Ziele zeigen das erreichte Ziel ("7 / 7 Tage" statt "19 / 7 Tage");
  // Zähler zeigen den echten Stand (13 / 12 Bücher ist eine schöne Info).
  const shown = criterion.type === 'habit' && state.done ? Math.min(state.current, state.target) : state.current
  const current = formatValue(shown)
  const target = formatValue(state.target)
  const value = `${current} / ${target}`
  switch (criterion.type) {
    case 'manual':
      return undefined
    case 'counter':
      return { prefix: '', value, suffix: criterion.label, spoken: `${criterion.label}: ${current} von ${target}` }
    case 'habit': {
      const { metric } = criterion
      const suffix = metricUnit(metric, habit, state.target)
      const dative = metricUnitDative(metric, habit, state.target)
      const prefix = metric === 'streak' ? 'Bester Streak' : ''
      const spokenLabel = metric === 'streak' ? 'Bester Streak' : metric === 'total' ? 'Gesamt' : 'Erledigt'
      return { prefix, value, suffix, spoken: `${spokenLabel}: ${current} von ${target} ${dative}` }
    }
  }
}

/**
 * Kurzbeschreibung eines Kapitelziels für Listen, z. B. "Abhaken", "Zähler · 12 Bücher beendet",
 * "📖 Täglich lesen · 7 Tage", "📖 Täglich lesen · 1.000 Seiten", "📖 Täglich lesen · Streak 21 Tage".
 */
export function criterionSummary(criterion: ChapterCriterion, habitsById: ReadonlyMap<string, Habit>): string {
  switch (criterion.type) {
    case 'manual':
      return 'Von Hand abhaken'
    case 'counter':
      return `Zähler · ${formatValue(criterion.target)} ${criterion.label}`
    case 'habit': {
      const habit = habitsById.get(criterion.habitId)
      const name = habit ? `${habit.icon} ${habit.title}` : 'Gelöschte Quest'
      const unit = metricUnit(criterion.metric, habit, criterion.target)
      const prefix = criterion.metric === 'streak' ? 'Streak ' : ''
      return `${name} · ${prefix}${formatValue(criterion.target)} ${unit}`
    }
  }
}

/** Ist die Quest am Tag `today` archiviert? */
export function isArchived(habit: Habit, today: DayKey): boolean {
  return habit.archivedDay !== undefined && compareDays(habit.archivedDay, today) <= 0
}
