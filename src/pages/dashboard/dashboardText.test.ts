import { describe, expect, it } from 'vitest'
import { DEFAULT_SETTINGS } from '../../domain/balancing'
import type { GameData, Habit } from '../../domain/types'
import {
  countLabel,
  dayOffsetLabel,
  dayOffsetWord,
  deadlineText,
  formatValue,
  hasActiveHabits,
  perfectBonusPercent,
  selectableDayOffsets,
  stepValue,
  streakShort,
  streakText,
  weekWord,
} from './dashboardText'

const TODAY = '2026-11-03' // Dienstag

function habit(overrides: Partial<Habit> = {}): Habit {
  return {
    id: 'h1',
    title: 'Lesen',
    icon: '📖',
    attribute: 'intellect',
    difficulty: 'medium',
    schedule: { type: 'daily' },
    order: 0,
    createdDay: '2026-10-01',
    ...overrides,
  }
}

function data(overrides: Partial<GameData> = {}): GameData {
  return { settings: { ...DEFAULT_SETTINGS }, habits: [], completions: [], mainQuests: [], ...overrides }
}

describe('Texte', () => {
  it('formatiert Anzahlen mit Singular/Plural und deutschen Zahlen', () => {
    expect(countLabel(1, 'Quest', 'Quests')).toBe('1 Quest')
    expect(countLabel(3, 'Quest', 'Quests')).toBe('3 Quests')
    expect(countLabel(1200, 'Tag', 'Tage')).toBe('1.200 Tage')
    expect(formatValue(1.5)).toBe('1,5')
    expect(formatValue(2 / 3)).toBe('0,67')
    expect(perfectBonusPercent()).toBe('25 %')
  })

  it('beschreibt Streaks für Tage und Wochen', () => {
    expect(streakText({ current: 12, best: 12, unit: 'day' })).toBe('12 Tage in Folge')
    expect(streakText({ current: 1, best: 4, unit: 'day' })).toBe('1 Tag in Folge')
    expect(streakText({ current: 3, best: 3, unit: 'week' })).toBe('3 Wochen in Folge')
    expect(streakText({ current: 1, best: 3, unit: 'week' })).toBe('1 Woche in Folge')
    expect(streakShort({ current: 12, best: 12, unit: 'day' })).toBe('12')
    expect(streakShort({ current: 3, best: 3, unit: 'week' })).toBe('3 Wo.')
  })

  it('beschreibt die Restlaufzeit einer Kampagne', () => {
    expect(deadlineText(undefined)).toBeUndefined()
    expect(deadlineText(211)).toEqual({ text: 'noch 211 Tage', tone: 'normal' })
    expect(deadlineText(1)).toEqual({ text: 'noch 1 Tag', tone: 'soon' })
    expect(deadlineText(0)).toEqual({ text: 'heute fällig', tone: 'soon' })
    expect(deadlineText(-1)).toEqual({ text: 'seit 1 Tag überfällig', tone: 'overdue' })
    expect(deadlineText(-3)).toEqual({ text: 'seit 3 Tagen überfällig', tone: 'overdue' })
  })

  it('benennt Tage relativ zu heute', () => {
    expect(dayOffsetLabel(0)).toBe('Heute')
    expect(dayOffsetLabel(1)).toBe('Gestern')
    expect(dayOffsetLabel(2)).toBe('Vorgestern')
    expect(dayOffsetLabel(3)).toBe('Vor 3 Tagen')
    expect(dayOffsetWord(1)).toBe('gestern')
    expect(dayOffsetWord(3)).toBe('vor 3 Tagen')
  })

  it('bezieht den Wochenfortschritt auf diese oder letzte Woche', () => {
    expect(weekWord('2026-11-02', TODAY)).toBe('diese Woche') // Montag derselben Woche
    expect(weekWord('2026-11-01', '2026-11-02')).toBe('letzte Woche') // Sonntag → Montag
  })
})

describe('stepValue', () => {
  it('zählt ohne Gleitkomma-Rauschen und nie unter 0', () => {
    expect(stepValue(6, 1)).toBe(7)
    expect(stepValue(0.2, 1)).toBe(1.2)
    expect(stepValue(0.1, 0.2)).toBe(0.3)
    expect(stepValue(0.5, -1)).toBe(0)
    expect(stepValue(0, -1)).toBe(0)
  })
})

describe('wählbare Tage', () => {
  it('bietet gestern an, wenn das Profil gestern schon existierte', () => {
    const game = data({ profile: { name: 'Aria', avatar: '🧙', createdDay: '2026-11-02' } })
    expect(selectableDayOffsets(game, TODAY)).toEqual([0, 1])
  })

  it('bietet gestern an, wenn gestern eine Quest aktiv war (auch ohne älteres Profil)', () => {
    const game = data({
      profile: { name: 'Aria', avatar: '🧙', createdDay: TODAY },
      habits: [habit({ createdDay: '2026-11-02' })],
    })
    expect(selectableDayOffsets(game, TODAY)).toEqual([0, 1])
  })

  it('bietet nur heute an, wenn das Abenteuer heute begann', () => {
    const game = data({
      profile: { name: 'Aria', avatar: '🧙', createdDay: TODAY },
      habits: [habit({ createdDay: TODAY })],
    })
    expect(selectableDayOffsets(game, TODAY)).toEqual([0])
  })

  it('erkennt, ob es überhaupt aktive Quests gibt', () => {
    const profile = { name: 'Aria', avatar: '🧙', createdDay: '2026-10-01' }
    expect(hasActiveHabits(data({ profile }), TODAY)).toBe(false)
    expect(hasActiveHabits(data({ profile, habits: [habit()] }), TODAY)).toBe(true)
    // Heute archiviert, gestern noch aktiv → gestern kann noch nachgetragen werden.
    expect(hasActiveHabits(data({ profile, habits: [habit({ archivedDay: TODAY })] }), TODAY)).toBe(true)
    expect(hasActiveHabits(data({ profile, habits: [habit({ archivedDay: '2026-11-02' })] }), TODAY)).toBe(false)
  })
})
