/**
 * Formular-Logik für das Anlegen und Bearbeiten von Quests – rein (ohne React), damit sie
 * sich einfach testen lässt: Startwerte, Validierung (deutsche Meldungen) und Umwandlung in
 * einen `HabitDraft` für das Repository.
 */
import type { HabitDraft } from '../../data/repository'
import type { AttributeId, Difficulty, Habit, IsoWeekday, Schedule } from '../../domain/types'

export const TITLE_MAX = 60
export const DESCRIPTION_MAX = 200
export const UNIT_MAX = 20

/** Vorschläge für die Einheit messbarer Quests. */
export const UNIT_SUGGESTIONS = ['Seiten', 'Minuten', 'km', 'L', 'Schritte', 'Mal'] as const

export type ScheduleType = Schedule['type']

/** Wochentage für die Auswahl (ISO: 1 = Montag … 7 = Sonntag). */
export const WEEKDAYS: readonly { day: IsoWeekday; short: string; long: string }[] = [
  { day: 1, short: 'Mo', long: 'Montag' },
  { day: 2, short: 'Di', long: 'Dienstag' },
  { day: 3, short: 'Mi', long: 'Mittwoch' },
  { day: 4, short: 'Do', long: 'Donnerstag' },
  { day: 5, short: 'Fr', long: 'Freitag' },
  { day: 6, short: 'Sa', long: 'Samstag' },
  { day: 7, short: 'So', long: 'Sonntag' },
]

/** Standard für „Wochentage“: Montag bis Freitag. */
const DEFAULT_WEEKDAYS: IsoWeekday[] = [1, 2, 3, 4, 5]
const DEFAULT_TIMES_PER_WEEK = 3

export const DEFAULT_ICON = '✨'

/** Bearbeitbarer Zustand des Formulars (Zahlenfelder dürfen während der Eingabe leer sein). */
export interface HabitFormValues {
  icon: string
  title: string
  description: string
  attribute: AttributeId
  difficulty: Difficulty
  scheduleType: ScheduleType
  /** Auswahl für „Wochentage“ (bleibt beim Wechsel des Rhythmus erhalten). */
  weekdays: IsoWeekday[]
  /** Für „X pro Woche“. */
  timesPerWeek: number | null
  measurable: boolean
  target: number | null
  unit: string
  /** Verknüpfte Kampagne, '' = keine. */
  mainQuestId: string
}

export type HabitFormField = 'title' | 'description' | 'weekdays' | 'timesPerWeek' | 'target' | 'unit'

export type HabitFormErrors = Partial<Record<HabitFormField, string>>

/** Reihenfolge der Felder im Formular – bestimmt, welches fehlerhafte Feld den Fokus bekommt. */
export const FIELD_ORDER: readonly HabitFormField[] = ['title', 'description', 'weekdays', 'timesPerWeek', 'target', 'unit']

/** Startwerte: aus einer bestehenden Quest oder Standardwerte für eine neue. */
export function initialHabitFormValues(habit?: Habit, mainQuestId?: string): HabitFormValues {
  if (!habit) {
    return {
      icon: DEFAULT_ICON,
      title: '',
      description: '',
      attribute: 'discipline',
      difficulty: 'medium',
      scheduleType: 'daily',
      weekdays: [...DEFAULT_WEEKDAYS],
      timesPerWeek: DEFAULT_TIMES_PER_WEEK,
      measurable: false,
      target: null,
      unit: '',
      mainQuestId: mainQuestId ?? '',
    }
  }
  const { schedule, measure } = habit
  return {
    icon: habit.icon,
    title: habit.title,
    description: habit.description ?? '',
    attribute: habit.attribute,
    difficulty: habit.difficulty,
    scheduleType: schedule.type,
    weekdays: schedule.type === 'weekdays' ? [...schedule.days] : [...DEFAULT_WEEKDAYS],
    timesPerWeek: schedule.type === 'weekly' ? schedule.times : DEFAULT_TIMES_PER_WEEK,
    measurable: measure !== undefined,
    target: measure?.target ?? null,
    unit: measure?.unit ?? '',
    mainQuestId: habit.mainQuestId ?? '',
  }
}

/** Schaltet einen Wochentag um und hält die Liste sortiert. */
export function toggleWeekday(days: readonly IsoWeekday[], day: IsoWeekday): IsoWeekday[] {
  const next = days.includes(day) ? days.filter((d) => d !== day) : [...days, day]
  return next.sort((a, b) => a - b)
}

/** Prüft die Eingaben. Leeres Ergebnis = gültig. */
export function validateHabitForm(values: HabitFormValues): HabitFormErrors {
  const errors: HabitFormErrors = {}
  const title = values.title.trim()
  if (title === '') errors.title = 'Gib deiner Quest einen Namen.'
  else if (title.length > TITLE_MAX) errors.title = `Höchstens ${TITLE_MAX} Zeichen.`

  if (values.description.trim().length > DESCRIPTION_MAX) {
    errors.description = `Höchstens ${DESCRIPTION_MAX} Zeichen.`
  }

  if (values.scheduleType === 'weekdays' && values.weekdays.length === 0) {
    errors.weekdays = 'Wähle mindestens einen Wochentag.'
  }

  if (values.scheduleType === 'weekly') {
    const times = values.timesPerWeek
    if (times === null) errors.timesPerWeek = 'Gib an, wie oft pro Woche.'
    else if (!Number.isInteger(times) || times < 1 || times > 7) {
      errors.timesPerWeek = 'Wähle eine ganze Zahl von 1 bis 7.'
    }
  }

  if (values.measurable) {
    if (values.target === null) errors.target = 'Gib ein Tagesziel an.'
    else if (!Number.isFinite(values.target) || values.target <= 0) errors.target = 'Das Ziel muss größer als 0 sein.'

    const unit = values.unit.trim()
    if (unit === '') errors.unit = 'Gib eine Einheit an, z. B. „Seiten“.'
    else if (unit.length > UNIT_MAX) errors.unit = `Höchstens ${UNIT_MAX} Zeichen.`
  }
  return errors
}

/** Inhaltlich gleiche Formularwerte (z. B. „noch nichts geändert“)? */
export function sameFormValues(a: HabitFormValues, b: HabitFormValues): boolean {
  return (Object.keys(a) as (keyof HabitFormValues)[]).every((key) => {
    const left = a[key]
    const right = b[key]
    if (Array.isArray(left) && Array.isArray(right)) {
      return left.length === right.length && left.every((value, index) => value === right[index])
    }
    return Object.is(left, right)
  })
}

export function hasErrors(errors: HabitFormErrors): boolean {
  return Object.keys(errors).length > 0
}

/** Rhythmus aus den Formularwerten (erwartet gültige Werte). */
export function scheduleFromValues(values: HabitFormValues): Schedule {
  switch (values.scheduleType) {
    case 'daily':
      return { type: 'daily' }
    case 'weekdays':
      return { type: 'weekdays', days: [...values.weekdays].sort((a, b) => a - b) }
    case 'weekly':
      return { type: 'weekly', times: values.timesPerWeek ?? DEFAULT_TIMES_PER_WEEK }
  }
}

/**
 * Wandelt gültige Formularwerte in einen Draft um. Die optionalen Felder (`description`,
 * `measure`, `mainQuestId`) stehen **immer** im Objekt – leer als `undefined`. So entfernt
 * `updateHabit` sie beim Bearbeiten, und `createHabit` lässt sie einfach weg.
 */
export function habitDraftFromValues(values: HabitFormValues): HabitDraft {
  const description = values.description.trim()
  return {
    title: values.title.trim(),
    icon: values.icon.trim() || DEFAULT_ICON,
    attribute: values.attribute,
    difficulty: values.difficulty,
    schedule: scheduleFromValues(values),
    description: description === '' ? undefined : description,
    measure:
      values.measurable && values.target !== null ? { target: values.target, unit: values.unit.trim() } : undefined,
    mainQuestId: values.mainQuestId === '' ? undefined : values.mainQuestId,
  }
}
