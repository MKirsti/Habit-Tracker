import { describe, expect, it } from 'vitest'
import { makeHabit } from '../../domain/testing'
import {
  habitDraftFromValues,
  hasErrors,
  initialHabitFormValues,
  sameFormValues,
  todayEntryNote,
  toggleWeekday,
  validateHabitForm,
} from './habitForm'
import type { HabitFormValues } from './habitForm'

function values(overrides: Partial<HabitFormValues> = {}): HabitFormValues {
  return { ...initialHabitFormValues(), title: 'Lesen', ...overrides }
}

describe('initialHabitFormValues', () => {
  it('liefert sinnvolle Standardwerte für eine neue Quest (optional mit Kampagne)', () => {
    const initial = initialHabitFormValues(undefined, 'kampagne-1')
    expect(initial).toMatchObject({
      title: '',
      difficulty: 'medium',
      scheduleType: 'daily',
      weekdays: [1, 2, 3, 4, 5],
      timesPerWeek: 3,
      measurable: false,
      mainQuestId: 'kampagne-1',
    })
  })

  it('übernimmt alle Felder einer bestehenden Quest', () => {
    const habit = makeHabit({
      id: 'h1',
      title: 'Laufen',
      icon: '🏃',
      description: '5 km',
      attribute: 'strength',
      difficulty: 'hard',
      schedule: { type: 'weekdays', days: [2, 4] },
      measure: { target: 5, unit: 'km' },
      mainQuestId: 'q1',
    })
    expect(initialHabitFormValues(habit)).toEqual({
      icon: '🏃',
      title: 'Laufen',
      description: '5 km',
      attribute: 'strength',
      difficulty: 'hard',
      scheduleType: 'weekdays',
      weekdays: [2, 4],
      timesPerWeek: 3,
      measurable: true,
      target: 5,
      unit: 'km',
      mainQuestId: 'q1',
    })
    expect(initialHabitFormValues(makeHabit({ id: 'h2', schedule: { type: 'weekly', times: 2 } }))).toMatchObject({
      scheduleType: 'weekly',
      timesPerWeek: 2,
      measurable: false,
      mainQuestId: '',
    })
  })
})

describe('validateHabitForm', () => {
  it('akzeptiert gültige Eingaben', () => {
    expect(hasErrors(validateHabitForm(values()))).toBe(false)
  })

  it('verlangt einen Titel mit höchstens 60 Zeichen', () => {
    expect(validateHabitForm(values({ title: '   ' })).title).toBe('Gib deiner Quest einen Namen.')
    expect(validateHabitForm(values({ title: 'x'.repeat(61) })).title).toBe('Höchstens 60 Zeichen.')
    expect(validateHabitForm(values({ description: 'x'.repeat(201) })).description).toBe('Höchstens 200 Zeichen.')
  })

  it('verlangt mindestens einen Wochentag bzw. 1–7 Mal pro Woche', () => {
    expect(validateHabitForm(values({ scheduleType: 'weekdays', weekdays: [] })).weekdays).toBe(
      'Wähle mindestens einen Wochentag.',
    )
    // Die Wochentage zählen nur, wenn der Rhythmus sie auch nutzt.
    expect(validateHabitForm(values({ scheduleType: 'daily', weekdays: [] })).weekdays).toBeUndefined()
    expect(validateHabitForm(values({ scheduleType: 'weekly', timesPerWeek: null })).timesPerWeek).toBe(
      'Gib an, wie oft pro Woche.',
    )
    for (const times of [0, 8, 2.5]) {
      expect(validateHabitForm(values({ scheduleType: 'weekly', timesPerWeek: times })).timesPerWeek).toBe(
        'Wähle eine ganze Zahl von 1 bis 7.',
      )
    }
  })

  it('verlangt bei messbaren Quests ein positives Ziel und eine Einheit', () => {
    const errors = validateHabitForm(values({ measurable: true, target: null, unit: ' ' }))
    expect(errors.target).toBe('Gib ein Tagesziel an.')
    expect(errors.unit).toBe('Gib eine Einheit an, z. B. „Seiten“.')
    expect(validateHabitForm(values({ measurable: true, target: 0, unit: 'L' })).target).toBe(
      'Das Ziel muss größer als 0 sein.',
    )
    expect(hasErrors(validateHabitForm(values({ measurable: true, target: 0.5, unit: 'L' })))).toBe(false)
    // Ohne „Messbar“ werden die Felder ignoriert.
    expect(hasErrors(validateHabitForm(values({ measurable: false, target: null, unit: '' })))).toBe(false)
  })
})

describe('habitDraftFromValues', () => {
  it('trimmt Texte und setzt leere optionale Felder ausdrücklich auf undefined', () => {
    const draft = habitDraftFromValues(values({ title: '  Lesen ', description: '  ', icon: '' }))
    expect(draft).toEqual({
      title: 'Lesen',
      icon: '✨',
      attribute: 'discipline',
      difficulty: 'medium',
      schedule: { type: 'daily' },
      description: undefined,
      measure: undefined,
      mainQuestId: undefined,
    })
    // Die Schlüssel müssen existieren, damit updateHabit die Felder entfernt.
    expect(Object.hasOwn(draft, 'measure')).toBe(true)
    expect(Object.hasOwn(draft, 'mainQuestId')).toBe(true)
    expect(Object.hasOwn(draft, 'description')).toBe(true)
  })

  it('baut Rhythmus, Messung und Kampagne aus den Werten', () => {
    expect(
      habitDraftFromValues(
        values({
          scheduleType: 'weekdays',
          weekdays: [5, 1, 3],
          measurable: true,
          target: 2.5,
          unit: ' L ',
          mainQuestId: 'q1',
        }),
      ),
    ).toMatchObject({
      schedule: { type: 'weekdays', days: [1, 3, 5] },
      measure: { target: 2.5, unit: 'L' },
      mainQuestId: 'q1',
    })
    expect(habitDraftFromValues(values({ scheduleType: 'weekly', timesPerWeek: 4 })).schedule).toEqual({
      type: 'weekly',
      times: 4,
    })
  })
})

describe('toggleWeekday', () => {
  it('schaltet Tage um und hält sie sortiert', () => {
    expect(toggleWeekday([1, 5], 3)).toEqual([1, 3, 5])
    expect(toggleWeekday([1, 3, 5], 3)).toEqual([1, 5])
  })
})

describe('sameFormValues', () => {
  it('erkennt unveränderte Werte – auch mit neu erzeugten Wochentags-Listen', () => {
    const a = values({ weekdays: [1, 3, 5] })
    expect(sameFormValues(a, { ...a, weekdays: toggleWeekday(toggleWeekday(a.weekdays, 2), 2) })).toBe(true)
    expect(sameFormValues(initialHabitFormValues(), initialHabitFormValues())).toBe(true)
  })

  it('erkennt jede Änderung', () => {
    const a = values()
    expect(sameFormValues(a, { ...a, title: 'Lesen!' })).toBe(false)
    expect(sameFormValues(a, { ...a, weekdays: [1, 2, 3, 4] })).toBe(false)
    expect(sameFormValues(a, { ...a, target: 0 })).toBe(false)
    expect(sameFormValues(a, { ...a, measurable: true })).toBe(false)
  })
})

describe('todayEntryNote', () => {
  const reading = makeHabit({ id: 'r', measure: { target: 10, unit: 'Seiten' } })
  const edit = (overrides: Partial<HabitFormValues>) => ({ ...initialHabitFormValues(reading), ...overrides })

  it('warnt, wenn ein erhöhtes Ziel die heute erledigte Quest wieder öffnet', () => {
    expect(todayEntryNote(reading, { value: 10, target: 10 }, edit({ target: 20 }))).toBe(
      'Heute: 10 / 20 Seiten – die Quest ist danach wieder offen.',
    )
    expect(todayEntryNote(reading, { value: 2.5, target: 2 }, edit({ target: 3, unit: ' L ' }))).toBe(
      'Heute: 2,5 / 3 L – die Quest ist danach wieder offen.',
    )
  })

  it('schweigt, wenn nichts verloren geht', () => {
    expect(todayEntryNote(reading, undefined, edit({ target: 20 }))).toBeUndefined() // kein Eintrag
    expect(todayEntryNote(reading, { value: 12, target: 10 }, edit({ target: 12 }))).toBeUndefined() // bleibt erledigt
    expect(todayEntryNote(reading, { value: 7, target: 10 }, edit({ target: 20 }))).toBeUndefined() // war offen
    expect(todayEntryNote(reading, { value: 7, target: 10 }, edit({ target: 5 }))).toBeUndefined() // wird erledigt
    expect(todayEntryNote(reading, { value: 10, target: 10 }, edit({ target: null }))).toBeUndefined() // ungültig
    expect(todayEntryNote(reading, { value: 10, target: 10 }, edit({ measurable: false }))).toBeUndefined() // → 1 / 1
    const check = makeHabit({ id: 'c' })
    expect(todayEntryNote(check, { value: 1, target: 1 }, { ...initialHabitFormValues(check), measurable: true, target: 5 })).toBeUndefined()
  })

  it('warnt, wenn der Wechsel zur Abhak-Quest einen Teilfortschritt verwirft', () => {
    expect(todayEntryNote(reading, { value: 3, target: 10 }, edit({ measurable: false }))).toBe(
      'Heute erfasst: 3 / 10 Seiten – als Abhak-Quest entfällt dieser Teilfortschritt.',
    )
  })
})
