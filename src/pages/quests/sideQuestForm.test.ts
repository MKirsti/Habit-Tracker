import { describe, expect, it } from 'vitest'
import { makeGameData, makeSideQuest } from '../../domain/testing'
import type { CharacterProfile, DayKey } from '../../domain/types'
import {
  doneDifficultyNote,
  dueDayPresets,
  initialSideQuestFormValues,
  isSideQuestDoneOn,
  sameSideQuestFormValues,
  shortDate,
  sideQuestDeletionImpact,
  sideQuestDeletionText,
  sideQuestDraftFromValues,
  sideQuestDueLabel,
  validateSideQuestForm,
} from './sideQuestForm'

const TODAY: DayKey = '2026-11-03'
const PROFILE: CharacterProfile = { name: 'Aria', avatar: '🧙', createdDay: '2026-10-01' }

describe('Formular', () => {
  it('startet neu mit Standardwerten und übernimmt eine bestehende Nebenquest', () => {
    expect(initialSideQuestFormValues()).toEqual({
      icon: '📜',
      title: '',
      description: '',
      attribute: 'discipline',
      difficulty: 'medium',
      dueDay: '',
    })
    const quest = makeSideQuest({ id: 'q', title: 'Steuer', icon: '🧾', difficulty: 'hard', dueDay: '2026-11-10' })
    expect(initialSideQuestFormValues(quest)).toMatchObject({ title: 'Steuer', icon: '🧾', dueDay: '2026-11-10' })
    // Kaputter Termin wird zu „ohne Termin“ statt das Datumsfeld zu blockieren.
    expect(initialSideQuestFormValues({ ...quest, dueDay: 'irgendwann' }).dueDay).toBe('')
  })

  it('prüft Titel, Beschreibung und Termin', () => {
    const values = initialSideQuestFormValues()
    expect(validateSideQuestForm(values)).toEqual({ title: 'Gib deiner Nebenquest einen Namen.' })
    expect(validateSideQuestForm({ ...values, title: '   ' }).title).toBeDefined()
    expect(validateSideQuestForm({ ...values, title: 'x'.repeat(61) }).title).toBe('Höchstens 60 Zeichen.')
    expect(validateSideQuestForm({ ...values, title: 'Ok', description: 'x'.repeat(201) })).toEqual({
      description: 'Höchstens 200 Zeichen.',
    })
    expect(validateSideQuestForm({ ...values, title: 'Ok', dueDay: '2026-02-30' })).toEqual({ dueDay: 'Ungültiges Datum.' })
    expect(validateSideQuestForm({ ...values, title: 'Ok', dueDay: '2026-11-10' })).toEqual({})
  })

  it('baut den Draft – leere optionale Felder als undefined (damit Bearbeiten sie entfernt)', () => {
    const draft = sideQuestDraftFromValues({
      icon: ' ',
      title: '  Steuer abgeben ',
      description: '  ',
      attribute: 'discipline',
      difficulty: 'hard',
      dueDay: '',
    })
    expect(draft).toEqual({
      title: 'Steuer abgeben',
      icon: '📜',
      attribute: 'discipline',
      difficulty: 'hard',
      description: undefined,
      dueDay: undefined,
    })
    expect(Object.hasOwn(draft, 'dueDay')).toBe(true)
    expect(sideQuestDraftFromValues({ ...initialSideQuestFormValues(), title: 'A', dueDay: '2026-11-04' }).dueDay).toBe(
      '2026-11-04',
    )
  })

  it('erkennt unveränderte Werte', () => {
    const values = initialSideQuestFormValues()
    expect(sameSideQuestFormValues(values, { ...values })).toBe(true)
    expect(sameSideQuestFormValues(values, { ...values, dueDay: TODAY })).toBe(false)
  })

  it('bietet Heute, Morgen und In einer Woche als Schnellwahl', () => {
    expect(dueDayPresets(TODAY)).toEqual([
      { label: 'Heute', day: '2026-11-03' },
      { label: 'Morgen', day: '2026-11-04' },
      { label: 'In einer Woche', day: '2026-11-10' },
    ])
  })
})

describe('Termin-Texte', () => {
  const label = (dueDay?: DayKey, doneDay?: DayKey) => sideQuestDueLabel({ dueDay, doneDay }, TODAY)

  it('beschreibt offene Nebenquests nach Termin', () => {
    expect(label()).toBeUndefined()
    expect(label(TODAY)).toEqual({ text: 'heute fällig', tone: 'today' })
    expect(label('2026-11-04')).toEqual({ text: 'morgen fällig', tone: 'soon' })
    expect(label('2026-11-12')).toEqual({ text: 'bis 12. Nov.', tone: 'normal' })
    expect(label('2027-01-03')).toEqual({ text: 'bis 3. Jan. 2027', tone: 'normal' })
    expect(label('2026-11-02')).toEqual({ text: 'überfällig seit 1 Tag', tone: 'overdue' })
    expect(label('2026-11-01')).toEqual({ text: 'überfällig seit 2 Tagen', tone: 'overdue' })
    expect(label('kaputt')).toBeUndefined()
  })

  it('beschreibt erledigte Nebenquests – auch mit überschrittenem Termin', () => {
    expect(label('2026-11-01', TODAY)).toEqual({ text: 'heute erledigt', tone: 'done' })
    expect(label(undefined, '2026-10-30')).toEqual({ text: 'erledigt am 30. Okt.', tone: 'done' })
    // Erledigung nach heute (zurückgestellte Uhr) zählt noch nicht – wie in der Engine.
    expect(label(TODAY, '2026-11-04')).toEqual({ text: 'heute fällig', tone: 'today' })
    expect(isSideQuestDoneOn({ doneDay: '2026-11-04' }, TODAY)).toBe(false)
  })

  it('kürzt Daten im laufenden Jahr', () => {
    expect(shortDate('2026-11-12', TODAY)).toBe('12. Nov.')
    expect(shortDate('2025-12-24', TODAY)).toBe('24. Dez. 2025')
  })
})

describe('Löschen', () => {
  const taxes = makeSideQuest({ id: 'taxes', title: 'Steuer', difficulty: 'hard', doneDay: TODAY })
  const open = makeSideQuest({ id: 'open', title: 'Zahnarzt', difficulty: 'easy' })

  it('nennt den exakten Verlust einer erledigten Nebenquest', () => {
    const data = makeGameData({ profile: PROFILE, sideQuests: [taxes, open] })
    const impact = sideQuestDeletionImpact(data, 'taxes', TODAY)
    expect(impact).toEqual({ done: true, xpLost: 40, goldLost: 20, levelBefore: 1, levelAfter: 1 })
    expect(sideQuestDeletionText('Steuer', impact)).toBe(
      '„Steuer“ ist bereits erledigt. Mit dem Löschen verlierst du ihre 40 XP und 20 Gold. Das lässt sich nicht rückgängig machen.',
    )
  })

  it('nennt einen Level-Verlust', () => {
    const epic = ['a', 'b'].map((id) => makeSideQuest({ id, difficulty: 'epic', doneDay: TODAY }))
    const data = makeGameData({ profile: PROFILE, sideQuests: epic }) // 160 XP → Level 2
    const impact = sideQuestDeletionImpact(data, 'a', TODAY)
    expect(impact).toMatchObject({ xpLost: 80, levelBefore: 2, levelAfter: 1 })
    expect(sideQuestDeletionText('A', impact)).toContain('80 XP und 40 Gold (Level 2 → 1)')
  })

  it('kostet bei einer offenen (oder unbekannten) Nebenquest nichts', () => {
    const data = makeGameData({ profile: PROFILE, sideQuests: [taxes, open] })
    const impact = sideQuestDeletionImpact(data, 'open', TODAY)
    expect(impact).toMatchObject({ done: false, xpLost: 0, goldLost: 0 })
    expect(sideQuestDeletionText('Zahnarzt', impact)).toBe(
      '„Zahnarzt“ wird endgültig entfernt. Deine XP und dein Gold bleiben unverändert.',
    )
    expect(sideQuestDeletionImpact(data, 'gibt-es-nicht', TODAY).done).toBe(false)
  })
})

describe('Hinweis beim Bearbeiten', () => {
  it('warnt, wenn sich die XP einer erledigten Nebenquest ändern', () => {
    const done = makeSideQuest({ id: 'q', difficulty: 'hard', doneDay: '2026-11-01' })
    const values = initialSideQuestFormValues(done)
    expect(doneDifficultyNote(done, values, TODAY)).toBeUndefined()
    expect(doneDifficultyNote(done, { ...values, difficulty: 'medium' }, TODAY)).toBe(
      'Schon erledigt – ihre XP ändern sich von 40 auf 20.',
    )
    const openQuest = { ...done, doneDay: undefined }
    expect(doneDifficultyNote(openQuest, { ...values, difficulty: 'easy' }, TODAY)).toBeUndefined()
    expect(doneDifficultyNote(undefined, values, TODAY)).toBeUndefined()
  })
})
