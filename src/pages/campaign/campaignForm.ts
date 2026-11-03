/**
 * Formular-Logik für Kampagnen und Kapitel – rein (ohne React), damit sie sich einfach testen lässt:
 * Startwerte, Validierung (deutsche Meldungen) und Umwandlung in Daten für das Repository.
 */
import type { MainQuestDraft } from '../../data/repository'
import { newId } from '../../data/ids'
import { compareDays, isValidDayKey } from '../../domain/dates'
import { reachesTarget } from '../../domain/schedule'
import type { Chapter, ChapterCriterion, DayKey, Habit, MainQuest } from '../../domain/types'
import type { ChapterType, HabitMetric } from './campaignText'

export const TITLE_MAX = 60
export const DESCRIPTION_MAX = 280
export const WHY_MAX = 280
export const REWARD_MAX = 120
export const CHAPTER_TITLE_MAX = 60
export const CHAPTER_DESCRIPTION_MAX = 200
export const COUNTER_LABEL_MAX = 30

export const DEFAULT_CAMPAIGN_ICON = '🏔️'

// ---------------------------------------------------------------------------
// Kampagne
// ---------------------------------------------------------------------------

/** Bearbeitbarer Zustand des Kampagnen-Formulars. Datumsfelder als 'YYYY-MM-DD' ('' = leer). */
export interface CampaignFormValues {
  icon: string
  title: string
  description: string
  why: string
  reward: string
  startDay: string
  deadline: string
  /** Entwurf der Kapitel (wird erst beim Speichern übernommen). */
  chapters: Chapter[]
}

export type CampaignFormField = 'title' | 'description' | 'why' | 'reward' | 'startDay' | 'deadline'
export type CampaignFormErrors = Partial<Record<CampaignFormField, string>>

/** Reihenfolge der Felder im Formular – bestimmt, welches fehlerhafte Feld den Fokus bekommt. */
export const CAMPAIGN_FIELD_ORDER: readonly CampaignFormField[] = [
  'title',
  'description',
  'why',
  'reward',
  'startDay',
  'deadline',
]

/** Startwerte: aus einer bestehenden Kampagne oder leer mit Start = heute. */
export function initialCampaignFormValues(quest: MainQuest | undefined, today: DayKey): CampaignFormValues {
  if (!quest) {
    return {
      icon: DEFAULT_CAMPAIGN_ICON,
      title: '',
      description: '',
      why: '',
      reward: '',
      startDay: today,
      deadline: '',
      chapters: [],
    }
  }
  return {
    icon: quest.icon,
    title: quest.title,
    description: quest.description ?? '',
    why: quest.why,
    reward: quest.reward,
    startDay: quest.startDay,
    deadline: quest.deadline ?? '',
    chapters: quest.chapters.map((chapter) => ({ ...chapter })),
  }
}

export function validateCampaignForm(values: CampaignFormValues): CampaignFormErrors {
  const errors: CampaignFormErrors = {}
  const title = values.title.trim()
  if (title === '') errors.title = 'Gib deiner Kampagne einen Namen.'
  else if (title.length > TITLE_MAX) errors.title = `Höchstens ${TITLE_MAX} Zeichen.`

  if (values.description.trim().length > DESCRIPTION_MAX) errors.description = `Höchstens ${DESCRIPTION_MAX} Zeichen.`

  const why = values.why.trim()
  if (why === '') errors.why = 'Warum willst du das erreichen? Dein Warum trägt dich durch schwere Tage.'
  else if (why.length > WHY_MAX) errors.why = `Höchstens ${WHY_MAX} Zeichen.`

  if (values.reward.trim().length > REWARD_MAX) errors.reward = `Höchstens ${REWARD_MAX} Zeichen.`

  const startValid = isValidDayKey(values.startDay)
  if (values.startDay === '') errors.startDay = 'Wähle ein Startdatum.'
  else if (!startValid) errors.startDay = 'Ungültiges Datum.'

  if (values.deadline !== '') {
    if (!isValidDayKey(values.deadline)) errors.deadline = 'Ungültiges Datum.'
    else if (startValid && compareDays(values.deadline, values.startDay) < 0) {
      errors.deadline = 'Das Zieldatum darf nicht vor dem Start liegen.'
    }
  }
  return errors
}

export function hasErrors(errors: object): boolean {
  return Object.values(errors).some((message) => message !== undefined)
}

/** Kampagnen-Entwurf für `createMainQuest`/`updateMainQuest`. Leere optionale Felder werden entfernt. */
export function campaignDraftFromValues(values: CampaignFormValues): MainQuestDraft {
  const description = values.description.trim()
  return {
    icon: values.icon.trim() || DEFAULT_CAMPAIGN_ICON,
    title: values.title.trim(),
    description: description === '' ? undefined : description,
    why: values.why.trim(),
    reward: values.reward.trim(),
    startDay: values.startDay,
    deadline: values.deadline === '' ? undefined : values.deadline,
    chapters: values.chapters,
  }
}

/** Verschiebt das Element an `index` um eine Position nach oben (-1) oder unten (+1). */
export function moveItem<T>(items: readonly T[], index: number, direction: -1 | 1): T[] {
  const target = index + direction
  if (index < 0 || index >= items.length || target < 0 || target >= items.length) return [...items]
  const result = [...items]
  ;[result[index], result[target]] = [result[target], result[index]]
  return result
}

// ---------------------------------------------------------------------------
// Kapitel
// ---------------------------------------------------------------------------

export interface ChapterFormValues {
  title: string
  description: string
  type: ChapterType
  /** Zähler: Ziel. */
  counterTarget: number | null
  /** Zähler: Bezeichnung, z. B. "Bücher beendet". */
  counterLabel: string
  /** Quest-Ziel: ID der Quest ('' = keine gewählt). */
  habitId: string
  metric: HabitMetric
  /** Quest-Ziel: Zielwert. */
  habitTarget: number | null
}

export type ChapterFormField = 'title' | 'description' | 'counterTarget' | 'counterLabel' | 'habitId' | 'habitTarget'
export type ChapterFormErrors = Partial<Record<ChapterFormField, string>>

export const CHAPTER_FIELD_ORDER: readonly ChapterFormField[] = [
  'title',
  'description',
  'counterTarget',
  'counterLabel',
  'habitId',
  'habitTarget',
]

/**
 * Startwerte: aus einem bestehenden Kapitel oder für ein neues ("Abhaken").
 * `defaultHabitId` wird für die Quest-Auswahl vorbelegt, falls das Kapitel noch keine Quest hat.
 */
export function initialChapterFormValues(chapter: Chapter | undefined, defaultHabitId = ''): ChapterFormValues {
  const values: ChapterFormValues = {
    title: chapter?.title ?? '',
    description: chapter?.description ?? '',
    type: chapter?.criterion.type ?? 'manual',
    counterTarget: null,
    counterLabel: '',
    habitId: defaultHabitId,
    metric: 'completions',
    habitTarget: null,
  }
  const criterion = chapter?.criterion
  if (criterion?.type === 'counter') {
    values.counterTarget = criterion.target
    values.counterLabel = criterion.label
  } else if (criterion?.type === 'habit') {
    values.habitId = criterion.habitId
    values.metric = criterion.metric
    values.habitTarget = criterion.target
  }
  return values
}

function wholeNumberError(value: number | null, emptyMessage: string): string | undefined {
  if (value === null) return emptyMessage
  if (!Number.isFinite(value) || value <= 0) return 'Das Ziel muss größer als 0 sein.'
  if (!Number.isInteger(value)) return 'Bitte eine ganze Zahl.'
  return undefined
}

/** Prüft das Kapitel-Formular. `habitsById` sind die wählbaren Quests. */
export function validateChapterForm(
  values: ChapterFormValues,
  habitsById: ReadonlyMap<string, Habit>,
): ChapterFormErrors {
  const errors: ChapterFormErrors = {}
  const title = values.title.trim()
  if (title === '') errors.title = 'Gib dem Kapitel einen Namen.'
  else if (title.length > CHAPTER_TITLE_MAX) errors.title = `Höchstens ${CHAPTER_TITLE_MAX} Zeichen.`
  if (values.description.trim().length > CHAPTER_DESCRIPTION_MAX) {
    errors.description = `Höchstens ${CHAPTER_DESCRIPTION_MAX} Zeichen.`
  }

  if (values.type === 'counter') {
    const targetError = wholeNumberError(values.counterTarget, 'Wie viele sollen es werden?')
    if (targetError) errors.counterTarget = targetError
    if (values.counterLabel.trim().length > COUNTER_LABEL_MAX) errors.counterLabel = `Höchstens ${COUNTER_LABEL_MAX} Zeichen.`
  } else if (values.type === 'habit') {
    const habit = habitsById.get(values.habitId)
    if (!habit) errors.habitId = 'Wähle eine Quest für dieses Kapitel.'
    if (values.metric === 'total') {
      if (habit && !habit.measure) errors.habitId = 'Diese Quest ist nicht messbar – wähle „Erledigungen“ oder „Streak“.'
      if (values.habitTarget === null) errors.habitTarget = 'Gib ein Ziel an.'
      else if (!Number.isFinite(values.habitTarget) || values.habitTarget <= 0) {
        errors.habitTarget = 'Das Ziel muss größer als 0 sein.'
      }
    } else {
      const targetError = wholeNumberError(values.habitTarget, 'Gib ein Ziel an.')
      if (targetError) errors.habitTarget = targetError
    }
  }
  return errors
}

function criterionFromValues(values: ChapterFormValues): ChapterCriterion {
  switch (values.type) {
    case 'manual':
      return { type: 'manual' }
    case 'counter':
      return { type: 'counter', target: values.counterTarget ?? 0, label: values.counterLabel.trim() }
    case 'habit':
      return { type: 'habit', habitId: values.habitId, metric: values.metric, target: values.habitTarget ?? 0 }
  }
}

/**
 * Baut aus dem (gültigen) Formular ein Kapitel. Beim Bearbeiten bleiben ID und Zustand
 * (abgehakt, Zählerstand, Abschlusstag) erhalten, solange die Art gleich bleibt. Erreicht ein
 * Zähler durch ein kleineres Ziel jetzt sein Ziel, gilt `today` als Abschlusstag.
 */
export function chapterFromValues(values: ChapterFormValues, base: Chapter | undefined, today: DayKey): Chapter {
  const criterion = criterionFromValues(values)
  const chapter: Chapter = { id: base?.id ?? newId(), title: values.title.trim(), criterion }
  const description = values.description.trim()
  if (description !== '') chapter.description = description

  const sameType = base?.criterion.type === criterion.type
  if (sameType && criterion.type === 'manual' && base?.manualDone !== undefined) {
    chapter.manualDone = base.manualDone
    if (base.manualDone && base.completedDay !== undefined) chapter.completedDay = base.completedDay
  } else if (sameType && criterion.type === 'counter' && base?.counter !== undefined) {
    chapter.counter = base.counter
    if (reachesTarget(base.counter, criterion.target)) chapter.completedDay = base.completedDay ?? today
  }
  return chapter
}

/**
 * Wählbare Quests für ein Quest-Ziel: aktive vor archivierten, darin jeweils zuerst die mit der
 * Kampagne verknüpften – sonst in der Reihenfolge der Quest-Liste.
 */
export function sortHabitsForChapter(habits: readonly Habit[], campaignId: string | undefined, today: DayKey): Habit[] {
  const rank = (habit: Habit): number => {
    const archived = habit.archivedDay !== undefined && compareDays(habit.archivedDay, today) <= 0
    const linked = campaignId !== undefined && habit.mainQuestId === campaignId
    return (archived ? 2 : 0) + (linked ? 0 : 1)
  }
  return [...habits].sort((a, b) => rank(a) - rank(b) || a.order - b.order || a.title.localeCompare(b.title, 'de'))
}
