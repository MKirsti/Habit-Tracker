/**
 * Reine Text-Helfer der Kampagnen-Bibliothek (Deutsch, Du-Form). Bewusst ohne React, damit sie einzeln
 * testbar sind.
 */
import type { BlueprintCriterion, BlueprintOptions, BlueprintQuest, CampaignBlueprint } from '../../data/blueprints'
import { BLUEPRINT_LEVEL_LABELS } from '../../data/blueprints'
import { toEpochDay } from '../../domain/dates'
import { streakUnit } from '../../domain/streaks'
import type { DayKey, Measure } from '../../domain/types'
import { formatNumber } from '../../ui'

const MS_PER_DAY = 86_400_000

/** "1 Kapitel" / "2 Tage" – Zahl de-DE formatiert, Singular nur bei genau 1. */
export function countLabel(n: number, singular: string, plural: string): string {
  return `${formatNumber(n)} ${n === 1 ? singular : plural}`
}

/** Messwert für die Anzeige: höchstens zwei Nachkommastellen, de-DE ("1.000", "1,5"). */
export function formatValue(value: number): string {
  return formatNumber(value, { maximumFractionDigits: 2 })
}

/**
 * Laufzeit in Worten: volle Jahre ("1 Jahr"), sonst ab 8 Wochen gerundete Monate ("6 Monate", "7 Monate"),
 * ab 2 Wochen Wochen ("3 Wochen"), sonst Tage.
 */
export function durationLabel(days: number): string {
  if (days >= 365 && (days % 365 === 0 || days % 366 === 0)) {
    const years = days % 365 === 0 ? days / 365 : days / 366
    return countLabel(years, 'Jahr', 'Jahre')
  }
  if (days >= 56) return countLabel(Math.round(days / 30), 'Monat', 'Monate')
  if (days >= 14 && days % 7 === 0) return countLabel(days / 7, 'Woche', 'Wochen')
  return countLabel(days, 'Tag', 'Tage')
}

let deadlineFormatter: Intl.DateTimeFormat | undefined

/** Datum mit Jahr, kurz: "3. Nov. 2027", "31. Mai 2027". */
export function formatDeadline(day: DayKey): string {
  deadlineFormatter ??= new Intl.DateTimeFormat('de-DE', {
    timeZone: 'UTC',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })
  return deadlineFormatter.format(new Date(toEpochDay(day) * MS_PER_DAY))
}

/** Tagesziel einer messbaren Quest: "10 Seiten", "1,5 L", "6.000 Schritte". */
export function measureText(measure: Measure): string {
  return `${formatValue(measure.target)} ${measure.unit}`
}

/**
 * Kurzbeschreibung eines Kapitelziels der Vorlage:
 * - manual → "Meilenstein"
 * - counter → "Zähler: 12 Bücher beendet"
 * - completions → "7× Täglich lesen"
 * - total → "1.000 Seiten gesamt"
 * - streak → "21 Tage Streak" (Wochenquest: "8 Wochen Streak")
 */
export function criterionSummary(
  criterion: BlueprintCriterion,
  questsByKey: ReadonlyMap<string, Pick<BlueprintQuest, 'title' | 'schedule' | 'measure'>>,
): string {
  switch (criterion.type) {
    case 'manual':
      return 'Meilenstein'
    case 'counter':
      return `Zähler: ${formatValue(criterion.target)} ${criterion.label}`
    case 'habit': {
      const quest = questsByKey.get(criterion.questKey)
      const target = formatValue(criterion.target)
      switch (criterion.metric) {
        case 'completions':
          return `${target}× ${quest?.title ?? 'Quest erledigt'}`
        case 'total':
          return quest?.measure ? `${target} ${quest.measure.unit} gesamt` : `${target} gesamt`
        case 'streak': {
          const weekly = quest !== undefined && streakUnit(quest.schedule) === 'week'
          const unit = weekly
            ? criterion.target === 1
              ? 'Woche'
              : 'Wochen'
            : criterion.target === 1
              ? 'Tag'
              : 'Tage'
          return `${target} ${unit} Streak`
        }
      }
    }
  }
}

/** "2 von 3 Kampagnen aktiv". */
export function activeSlotsText(active: number, max: number): string {
  return `${formatNumber(active)} von ${formatNumber(max)} ${max === 1 ? 'Kampagne' : 'Kampagnen'} aktiv`
}

/** "1 Platz frei", "2 Plätze frei", "Kein Platz frei". */
export function freeSlotsText(left: number): string {
  if (left <= 0) return 'Kein Platz frei'
  return `${countLabel(left, 'Platz', 'Plätze')} frei`
}

/** Kurzfassung einer Auswahl: "Einsteiger", "Fortgeschritten · 🗡️ Krieger". */
export function choiceSummary(blueprint: CampaignBlueprint, options: BlueprintOptions): string {
  const level = BLUEPRINT_LEVEL_LABELS[options.level] ?? options.level
  const path = blueprint.paths?.find((candidate) => candidate.id === options.pathId)
  return path ? `${level} · ${path.icon} ${path.className}` : level
}
