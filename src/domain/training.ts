/**
 * Was ein Quest-Plan trainiert: geplante XP pro Woche und das Attribut, das am meisten davon bekommt.
 *
 * Grundlage der Hauptfarbe einer Kampagne (`MainQuestState.dominantAttribute`, Engine-Regel 6) – und dieselbe
 * Rechnung prüft, dass jede Vorlage der Bibliothek ihr Haupt-Attribut wirklich am stärksten trainiert
 * (`src/data/blueprints/blueprints.test.ts`). Rein, ohne Zeitbezug: Welcher Rhythmus gilt, entscheidet der Aufrufer.
 */
import { ATTRIBUTES } from './attributes'
import { questXp } from './schedule'
import type { AttributeId, Difficulty, Schedule } from './types'

/** Das, was eine Quest für die Gewichtung ausmacht (passt auf `Habit` und Vorlagen-Quests). */
export interface PlannedQuest {
  attribute: AttributeId
  difficulty: Difficulty
  schedule: Schedule
}

/** Termine pro Woche laut Rhythmus: täglich 7, Wochentage deren Anzahl, Wochenquest `times`. */
export function plannedPerWeek(schedule: Schedule): number {
  switch (schedule.type) {
    case 'daily':
      return 7
    case 'weekdays':
      return new Set(schedule.days).size
    case 'weekly':
      return schedule.times
    default:
      return 0
  }
}

/** Geplante XP pro Woche: `questXp(difficulty)` × Termine pro Woche (0 bei kaputten Daten). */
export function plannedWeeklyXp(quest: Pick<PlannedQuest, 'difficulty' | 'schedule'>): number {
  const xp = questXp(quest.difficulty) * plannedPerWeek(quest.schedule)
  return xp > 0 ? xp : 0
}

/** Geplante XP pro Woche je Attribut – in der Reihenfolge, in der die Attribute zuerst vorkommen. */
export function plannedWeeklyXpByAttribute(quests: Iterable<PlannedQuest>): Map<AttributeId, number> {
  const weights = new Map<AttributeId, number>()
  for (const quest of quests) {
    // Unbekanntes Attribut (kaputte Daten) oder kein Gewicht: zählt nicht.
    if (!Object.hasOwn(ATTRIBUTES, quest.attribute)) continue
    const xp = plannedWeeklyXp(quest)
    if (xp <= 0) continue
    weights.set(quest.attribute, (weights.get(quest.attribute) ?? 0) + xp)
  }
  return weights
}

/**
 * Das Attribut mit den meisten geplanten XP pro Woche. Gleichstand → das Attribut, das in `quests` zuerst
 * vorkommt (Aufrufer sortieren nach `order`). `undefined`, wenn keine Quest zählt.
 */
export function dominantAttribute(quests: Iterable<PlannedQuest>): AttributeId | undefined {
  let dominant: AttributeId | undefined
  let best = 0
  for (const [attribute, xp] of plannedWeeklyXpByAttribute(quests)) {
    if (xp > best) {
      dominant = attribute
      best = xp
    }
  }
  return dominant
}
