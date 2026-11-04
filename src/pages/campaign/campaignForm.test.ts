import { describe, expect, it } from 'vitest'
import type { Chapter, Habit, MainQuest } from '../../domain/types'
import {
  campaignDraftFromValues,
  chapterFromValues,
  hasErrors,
  initialCampaignFormValues,
  initialChapterFormValues,
  moveItem,
  sortHabitsForChapter,
  validateCampaignForm,
  validateChapterForm,
} from './campaignForm'

const TODAY = '2026-11-03'

const HABIT: Habit = {
  id: 'read',
  title: 'Lesen',
  icon: '📖',
  attribute: 'intellect',
  difficulty: 'medium',
  schedule: { type: 'daily' },
  measure: { target: 10, unit: 'Seiten' },
  order: 1,
  createdDay: '2026-10-01',
}
const PLAIN: Habit = { ...HABIT, id: 'plain', title: 'Meditieren', icon: '🧘', measure: undefined, order: 0 }

describe('Kampagnen-Formular', () => {
  it('startet neu mit heute als Start und ohne Zieldatum', () => {
    const values = initialCampaignFormValues(undefined, TODAY)
    expect(values).toMatchObject({ startDay: TODAY, deadline: '', title: '', why: '', chapters: [] })
  })

  it('übernimmt eine bestehende Kampagne', () => {
    const quest: MainQuest = {
      id: 'q',
      title: 'Halbmarathon',
      icon: '🏃',
      why: 'Durchhalten',
      reward: 'Schuhe',
      startDay: '2026-10-01',
      deadline: '2027-06-01',
      chapters: [{ id: 'c', title: 'Start', criterion: { type: 'manual' } }],
      createdAt: 1,
    }
    expect(initialCampaignFormValues(quest, TODAY)).toMatchObject({
      title: 'Halbmarathon',
      description: '',
      deadline: '2027-06-01',
      chapters: [{ id: 'c' }],
    })
  })

  it('verlangt Titel, Warum und ein gültiges Startdatum', () => {
    const errors = validateCampaignForm({ ...initialCampaignFormValues(undefined, TODAY), startDay: '' })
    expect(errors.title).toBeDefined()
    expect(errors.why).toBeDefined()
    expect(errors.startDay).toBe('Wähle ein Startdatum.')
    expect(hasErrors(errors)).toBe(true)
  })

  it('lehnt ein Zieldatum vor dem Start ab', () => {
    const values = { ...initialCampaignFormValues(undefined, TODAY), title: 'X', why: 'Y', deadline: '2026-11-02' }
    expect(validateCampaignForm(values).deadline).toBe('Das Zieldatum darf nicht vor dem Start liegen.')
    expect(validateCampaignForm({ ...values, deadline: TODAY })).toEqual({})
  })

  it('baut einen bereinigten Entwurf', () => {
    const values = {
      ...initialCampaignFormValues(undefined, TODAY),
      icon: '',
      title: '  Halbmarathon ',
      why: ' Weil ',
      description: '   ',
    }
    expect(campaignDraftFromValues(values)).toEqual({
      icon: '🏔️',
      title: 'Halbmarathon',
      why: 'Weil',
      reward: '',
      description: undefined,
      startDay: TODAY,
      deadline: undefined,
      chapters: [],
    })
  })

  it('verschiebt Kapitel und bleibt an den Rändern stehen', () => {
    expect(moveItem(['a', 'b', 'c'], 2, -1)).toEqual(['a', 'c', 'b'])
    expect(moveItem(['a', 'b', 'c'], 0, 1)).toEqual(['b', 'a', 'c'])
    expect(moveItem(['a', 'b', 'c'], 0, -1)).toEqual(['a', 'b', 'c'])
    expect(moveItem(['a', 'b', 'c'], 2, 1)).toEqual(['a', 'b', 'c'])
  })
})

describe('Kapitel-Formular', () => {
  const habits = new Map([
    [HABIT.id, HABIT],
    [PLAIN.id, PLAIN],
  ])

  it('prüft Zähler-Ziele', () => {
    const values = { ...initialChapterFormValues(undefined), title: 'Bücher', type: 'counter' as const }
    expect(validateChapterForm(values, habits).counterTarget).toBe('Wie viele sollen es werden?')
    expect(validateChapterForm({ ...values, counterTarget: 2.5 }, habits).counterTarget).toBe('Bitte eine ganze Zahl.')
    expect(validateChapterForm({ ...values, counterTarget: 12 }, habits)).toEqual({})
  })

  it('verlangt beim Quest-Ziel eine Quest und erlaubt Gesamtmenge nur für messbare Quests', () => {
    const base = { ...initialChapterFormValues(undefined), title: 'Seiten', type: 'habit' as const, habitTarget: 100 }
    expect(validateChapterForm(base, habits).habitId).toBeDefined()
    expect(validateChapterForm({ ...base, habitId: 'plain', metric: 'total' }, habits).habitId).toMatch(/nicht messbar/)
    expect(validateChapterForm({ ...base, habitId: 'read', metric: 'total', habitTarget: 12.5 }, habits)).toEqual({})
    expect(validateChapterForm({ ...base, habitId: 'read', metric: 'streak', habitTarget: 0 }, habits).habitTarget).toBeDefined()
  })

  it('erlaubt den Bestwert nur für messbare Quests – mit Nachkommastellen', () => {
    const base = { ...initialChapterFormValues(undefined), title: 'Am Stück', type: 'habit' as const, metric: 'best' as const }
    expect(validateChapterForm({ ...base, habitId: 'plain', habitTarget: 30 }, habits).habitId).toMatch(/nicht messbar/)
    expect(validateChapterForm({ ...base, habitId: 'read', habitTarget: 2.5 }, habits)).toEqual({})
    expect(validateChapterForm({ ...base, habitId: 'read', habitTarget: null }, habits).habitTarget).toBe('Gib ein Ziel an.')
    expect(validateChapterForm({ ...base, habitId: 'read', habitTarget: 0 }, habits).habitTarget).toBe(
      'Das Ziel muss größer als 0 sein.',
    )
    const chapter = chapterFromValues({ ...base, habitId: 'read', habitTarget: 30 }, undefined, TODAY)
    expect(chapter.criterion).toEqual({ type: 'habit', habitId: 'read', metric: 'best', target: 30 })
    // Beim erneuten Öffnen steht die Messgröße wieder im Formular.
    expect(initialChapterFormValues(chapter)).toMatchObject({ metric: 'best', habitTarget: 30, habitId: 'read' })
  })

  it('behält ID und Zustand beim Bearbeiten, solange die Art gleich bleibt', () => {
    const counter: Chapter = {
      id: 'k',
      title: 'Bücher',
      criterion: { type: 'counter', target: 12, label: 'Bücher beendet' },
      counter: 5,
    }
    const values = initialChapterFormValues(counter)
    expect(values).toMatchObject({ type: 'counter', counterTarget: 12, counterLabel: 'Bücher beendet' })

    // Kleineres Ziel → jetzt erreicht → heute abgeschlossen
    const lowered = chapterFromValues({ ...values, counterTarget: 5 }, counter, TODAY)
    expect(lowered).toMatchObject({ id: 'k', counter: 5, completedDay: TODAY })

    // Art gewechselt → Zustand entfällt
    const manual = chapterFromValues({ ...values, type: 'manual' }, counter, TODAY)
    expect(manual).toEqual({ id: 'k', title: 'Bücher', criterion: { type: 'manual' } })
  })

  it('vergibt neuen Kapiteln eine ID', () => {
    const chapter = chapterFromValues({ ...initialChapterFormValues(undefined), title: ' Neu ' }, undefined, TODAY)
    expect(chapter.id).toMatch(/[0-9a-f-]{36}/)
    expect(chapter.title).toBe('Neu')
  })

  it('sortiert verknüpfte, aktive Quests nach oben', () => {
    const linked: Habit = { ...PLAIN, id: 'linked', title: 'Zuletzt', order: 5, mainQuestId: 'q' }
    const archived: Habit = { ...HABIT, id: 'old', order: -1, mainQuestId: 'q', archivedDay: '2026-10-10' }
    const sorted = sortHabitsForChapter([HABIT, PLAIN, linked, archived], 'q', TODAY).map((habit) => habit.id)
    expect(sorted).toEqual(['linked', 'plain', 'read', 'old'])
  })
})
