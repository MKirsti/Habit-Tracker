/**
 * Nebenquests (einmalige Aufgaben) – reine Logik für Formular, Texte und die Rückfrage vor dem Löschen.
 * Ohne React, damit sie sich einzeln testen lässt. Geteilt von der Quests-Seite (Reiter „Nebenquests“) und
 * dem Dashboard (Bereich „Nebenquests“ mit Schnell-Anlegen).
 */
import type { SideQuestDraft } from '../../data/repository'
import { DEFAULT_SIDE_QUEST_ICON } from '../../data/repository'
import { addDays, compareDays, diffDays, formatDay, isValidDayKey } from '../../domain/dates'
import { deriveGameState } from '../../domain/engine'
import { questXp } from '../../domain/schedule'
import type { AttributeId, DayKey, Difficulty, GameData, SideQuest } from '../../domain/types'
import { formatNumber } from '../../ui'
import { DESCRIPTION_MAX, TITLE_MAX } from './habitForm'

export { DESCRIPTION_MAX, TITLE_MAX }

/** Bearbeitbarer Zustand des Formulars. `dueDay` '' = ohne Termin. */
export interface SideQuestFormValues {
  icon: string
  title: string
  description: string
  attribute: AttributeId
  difficulty: Difficulty
  dueDay: string
}

export type SideQuestFormField = 'title' | 'description' | 'dueDay'
export type SideQuestFormErrors = Partial<Record<SideQuestFormField, string>>

/** Reihenfolge der Felder im Formular – bestimmt, welches fehlerhafte Feld den Fokus bekommt. */
export const SIDE_QUEST_FIELD_ORDER: readonly SideQuestFormField[] = ['title', 'dueDay', 'description']

/** Startwerte: aus einer bestehenden Nebenquest oder Standardwerte für eine neue. */
export function initialSideQuestFormValues(quest?: SideQuest): SideQuestFormValues {
  if (!quest) {
    return {
      icon: DEFAULT_SIDE_QUEST_ICON,
      title: '',
      description: '',
      attribute: 'discipline',
      difficulty: 'medium',
      dueDay: '',
    }
  }
  return {
    icon: quest.icon,
    title: quest.title,
    description: quest.description ?? '',
    attribute: quest.attribute,
    difficulty: quest.difficulty,
    dueDay: quest.dueDay !== undefined && isValidDayKey(quest.dueDay) ? quest.dueDay : '',
  }
}

/** Prüft die Eingaben. Leeres Ergebnis = gültig. */
export function validateSideQuestForm(values: SideQuestFormValues): SideQuestFormErrors {
  const errors: SideQuestFormErrors = {}
  const title = values.title.trim()
  if (title === '') errors.title = 'Gib deiner Nebenquest einen Namen.'
  else if (title.length > TITLE_MAX) errors.title = `Höchstens ${TITLE_MAX} Zeichen.`
  if (values.description.trim().length > DESCRIPTION_MAX) errors.description = `Höchstens ${DESCRIPTION_MAX} Zeichen.`
  if (values.dueDay !== '' && !isValidDayKey(values.dueDay)) errors.dueDay = 'Ungültiges Datum.'
  return errors
}

export function hasSideQuestErrors(errors: SideQuestFormErrors): boolean {
  return Object.keys(errors).length > 0
}

/** Inhaltlich gleiche Formularwerte (z. B. „noch nichts geändert“)? */
export function sameSideQuestFormValues(a: SideQuestFormValues, b: SideQuestFormValues): boolean {
  return (Object.keys(a) as (keyof SideQuestFormValues)[]).every((key) => a[key] === b[key])
}

/**
 * Wandelt gültige Formularwerte in einen Draft um. `description` und `dueDay` stehen **immer** im Objekt – leer
 * als `undefined`. So entfernt `updateSideQuest` sie beim Bearbeiten, und `createSideQuest` lässt sie weg.
 */
export function sideQuestDraftFromValues(values: SideQuestFormValues): SideQuestDraft {
  const description = values.description.trim()
  return {
    title: values.title.trim(),
    icon: values.icon.trim() || DEFAULT_SIDE_QUEST_ICON,
    attribute: values.attribute,
    difficulty: values.difficulty,
    description: description === '' ? undefined : description,
    dueDay: values.dueDay === '' ? undefined : values.dueDay,
  }
}

/** Schnellwahl für den Termin. */
export function dueDayPresets(today: DayKey): { label: string; day: DayKey }[] {
  return [
    { label: 'Heute', day: today },
    { label: 'Morgen', day: addDays(today, 1) },
    { label: 'In einer Woche', day: addDays(today, 7) },
  ]
}

// ---------------------------------------------------------------------------
// Texte
// ---------------------------------------------------------------------------

/** Ist die Nebenquest zum Stichtag erledigt? (Gleiche Regel wie die Engine: gültiger doneDay ≤ today.) */
export function isSideQuestDoneOn(quest: Pick<SideQuest, 'doneDay'>, today: DayKey): boolean {
  return quest.doneDay !== undefined && isValidDayKey(quest.doneDay) && compareDays(quest.doneDay, today) <= 0
}

export type SideQuestDueTone = 'overdue' | 'today' | 'soon' | 'normal' | 'done'

/** Kurzes Datum, im anderen Jahr mit Jahreszahl: "12. Nov." bzw. "3. Jan. 2027". */
export function shortDate(day: DayKey, today: DayKey): string {
  const text = formatDay(day, 'short')
  return day.slice(0, 4) === today.slice(0, 4) ? text : `${text} ${day.slice(0, 4)}`
}

/**
 * Termin bzw. Erledigung einer Nebenquest: "heute fällig", "morgen fällig", "überfällig seit 2 Tagen",
 * "bis 12. Nov.", "heute erledigt", "erledigt am 3. Nov.". `undefined` für eine offene Nebenquest ohne Termin.
 */
export function sideQuestDueLabel(
  quest: Pick<SideQuest, 'dueDay' | 'doneDay'>,
  today: DayKey,
): { text: string; tone: SideQuestDueTone } | undefined {
  if (isSideQuestDoneOn(quest, today)) {
    const doneDay = quest.doneDay as DayKey
    return { text: doneDay === today ? 'heute erledigt' : `erledigt am ${shortDate(doneDay, today)}`, tone: 'done' }
  }
  const { dueDay } = quest
  if (dueDay === undefined || !isValidDayKey(dueDay)) return undefined
  const days = diffDays(today, dueDay)
  if (days < 0) {
    const late = -days
    return { text: `überfällig seit ${formatNumber(late)} ${late === 1 ? 'Tag' : 'Tagen'}`, tone: 'overdue' }
  }
  if (days === 0) return { text: 'heute fällig', tone: 'today' }
  if (days === 1) return { text: 'morgen fällig', tone: 'soon' }
  return { text: `bis ${shortDate(dueDay, today)}`, tone: 'normal' }
}

/** "+40 XP" der Nebenquest (ohne Streak-Bonus). */
export function sideQuestXpLabel(difficulty: Difficulty): string {
  return `+${formatNumber(questXp(difficulty))} XP`
}

/** Was das Löschen kostet – genau `deriveGameState` vorher − nachher (nur bei erledigten Nebenquests > 0). */
export interface SideQuestDeletionImpact {
  done: boolean
  xpLost: number
  goldLost: number
  levelBefore: number
  levelAfter: number
}

export function sideQuestDeletionImpact(data: GameData, questId: string, today: DayKey): SideQuestDeletionImpact {
  const quest = (data.sideQuests ?? []).find((candidate) => candidate.id === questId)
  const before = deriveGameState(data, today)
  if (!quest || !isSideQuestDoneOn(quest, today)) {
    return { done: false, xpLost: 0, goldLost: 0, levelBefore: before.level.level, levelAfter: before.level.level }
  }
  const after = deriveGameState(
    { ...data, sideQuests: (data.sideQuests ?? []).filter((candidate) => candidate.id !== questId) },
    today,
  )
  return {
    done: true,
    xpLost: Math.max(0, before.level.totalXp - after.level.totalXp),
    // Nur das Gold aus XP: Erfolge bleiben freigeschaltet, ihr Gold geht nicht verloren.
    goldLost: Math.max(0, before.gold.fromXp - after.gold.fromXp),
    levelBefore: before.level.level,
    levelAfter: after.level.level,
  }
}

/** Rückfrage vor dem Löschen: was verloren geht. */
export function sideQuestDeletionText(title: string, impact: SideQuestDeletionImpact): string {
  if (!impact.done || impact.xpLost === 0) {
    return `„${title}“ wird endgültig entfernt. Deine XP und dein Gold bleiben unverändert.`
  }
  const level =
    impact.levelBefore === impact.levelAfter
      ? ''
      : ` (Level ${formatNumber(impact.levelBefore)} → ${formatNumber(impact.levelAfter)})`
  return (
    `„${title}“ ist bereits erledigt. Mit dem Löschen verlierst du ihre ${formatNumber(impact.xpLost)} XP` +
    ` und ${formatNumber(impact.goldLost)} Gold${level}. Das lässt sich nicht rückgängig machen.`
  )
}

/**
 * Hinweis beim Bearbeiten einer erledigten Nebenquest, deren Schwierigkeit sich ändert: Ihre XP ändern sich
 * mit (z. B. "Schon erledigt – ihre XP ändern sich von 40 auf 20."). Sonst `undefined`.
 */
export function doneDifficultyNote(quest: SideQuest | undefined, values: SideQuestFormValues, today: DayKey) {
  if (!quest || !isSideQuestDoneOn(quest, today) || quest.difficulty === values.difficulty) return undefined
  return `Schon erledigt – ihre XP ändern sich von ${formatNumber(questXp(quest.difficulty))} auf ${formatNumber(
    questXp(values.difficulty),
  )}.`
}
