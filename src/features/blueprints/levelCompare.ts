/**
 * Was die Stufe ändert: vergleicht die Quests einer Vorlage (gleicher Pfad) zwischen Einsteiger und
 * Fortgeschritten – für die Vorschau im Einrichtungs-Dialog („Fortgeschritten: 4× pro Woche“). Rein, ohne React.
 */
import type { BlueprintContent, BlueprintLevel, BlueprintQuest } from '../../data/blueprints'
import { describeSchedule, questXp, sameSchedule } from '../../domain/schedule'
import { formatNumber } from '../../ui'
import { measureText } from './blueprintText'

/** Unterschied einer Quest zur anderen Stufe. */
export type QuestLevelDelta =
  /** Gibt es nur in dieser Stufe. */
  | { kind: 'only' }
  /** Andere Startwerte: die Werte der anderen Stufe, z. B. "2× pro Woche · 10 Mal · +10 XP" (nur, was abweicht). */
  | { kind: 'changed'; other: string }

export interface LevelComparison {
  /** Die Stufe, mit der verglichen wird. */
  otherLevel: BlueprintLevel
  /** Quest-Key → Unterschied (fehlt: in beiden Stufen gleich). */
  quests: ReadonlyMap<string, QuestLevelDelta>
  /** Quests, die es nur in der anderen Stufe gibt (in deren Reihenfolge). */
  missing: readonly BlueprintQuest[]
}

/** Die jeweils andere Stufe. */
export function otherLevel(level: BlueprintLevel): BlueprintLevel {
  return level === 'beginner' ? 'advanced' : 'beginner'
}

/**
 * Vergleicht die Quests von `current` mit denen der anderen Stufe (`other`, gleiche Vorlage und gleicher Pfad).
 * Zugeordnet wird über den Quest-Key. Verglichen werden Rhythmus, Tagesziel und XP (Schwierigkeit).
 */
export function compareLevels(current: BlueprintContent, other: BlueprintContent, level: BlueprintLevel): LevelComparison {
  const otherByKey = new Map(other.quests.map((quest) => [quest.key, quest]))
  const currentKeys = new Set(current.quests.map((quest) => quest.key))
  const quests = new Map<string, QuestLevelDelta>()
  for (const quest of current.quests) {
    const counterpart = otherByKey.get(quest.key)
    if (counterpart === undefined) {
      quests.set(quest.key, { kind: 'only' })
      continue
    }
    const parts: string[] = []
    if (!sameSchedule(quest.schedule, counterpart.schedule)) parts.push(describeSchedule(counterpart.schedule))
    if (!sameMeasure(quest, counterpart)) parts.push(counterpart.measure ? measureText(counterpart.measure) : 'ohne Zielwert')
    const xp = questXp(counterpart.difficulty)
    if (xp !== questXp(quest.difficulty)) parts.push(`+${formatNumber(xp)} XP`)
    if (parts.length > 0) quests.set(quest.key, { kind: 'changed', other: parts.join(' · ') })
  }
  return {
    otherLevel: otherLevel(level),
    quests,
    missing: other.quests.filter((quest) => !currentKeys.has(quest.key)),
  }
}

function sameMeasure(a: BlueprintQuest, b: BlueprintQuest): boolean {
  if (a.measure === undefined || b.measure === undefined) return a.measure === b.measure
  return a.measure.target === b.measure.target && a.measure.unit === b.measure.unit
}
