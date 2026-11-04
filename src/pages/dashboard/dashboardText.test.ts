import { describe, expect, it } from 'vitest'
import { DEFAULT_SETTINGS } from '../../domain/balancing'
import { deriveGameState, getDayState } from '../../domain/engine'
import { makeCompletion } from '../../domain/testing'
import type { GameData, Habit } from '../../domain/types'
import {
  campaignChapterLine,
  compactDayLabel,
  countLabel,
  dayOffsetLabel,
  dayOffsetWord,
  deadlineText,
  formatValue,
  goldChipLabel,
  hasActiveHabits,
  perfectBonusExplanation,
  perfectBonusPercent,
  selectableDayOffsets,
  stepValue,
  streakBonusLabel,
  streakBonusText,
  streakShort,
  streakText,
  weekWord,
  withCurrentWeekStreaks,
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

describe('perfectBonusExplanation', () => {
  it('erklärt, dass der Bonus mit jeder Quest wächst', () => {
    expect(perfectBonusExplanation(0)).toBe('25 % deiner heutigen Quest-XP – wächst mit jeder weiteren Quest (auch Wochenquests)')
    expect(perfectBonusExplanation(1)).toBe('25 % deiner gestrigen Quest-XP – wächst mit jeder weiteren Quest (auch Wochenquests)')
  })
})

describe('withCurrentWeekStreaks', () => {
  // 2× pro Woche: erfüllt in den Wochen ab 19.10. und 26.10.; diese Woche gestern (Mo) und heute (Di).
  const weekly = habit({ id: 'run', schedule: { type: 'weekly', times: 2 } })
  const daily = habit({ id: 'read' })
  const game = data({
    profile: { name: 'Aria', avatar: '🧙', createdDay: '2026-10-01' },
    habits: [weekly, daily],
    completions: [
      ...['2026-10-20', '2026-10-21', '2026-10-27', '2026-10-28', '2026-11-02', TODAY].map((day) => makeCompletion(weekly, day)),
      ...['2026-11-01', '2026-11-02'].map((day) => makeCompletion(daily, day)),
    ],
  })
  const todayState = deriveGameState(game, TODAY).todayState
  const streakOf = (state: ReturnType<typeof getDayState>, id: string) =>
    state.habits.find((status) => status.habit.id === id)?.streak.current

  it('übernimmt für Wochenquests derselben Woche den Streak von heute', () => {
    const yesterday = getDayState(game, '2026-11-02')
    expect(streakOf(yesterday, 'run')).toBe(2) // zum Stichtag gestern: diese Woche noch nicht erfüllt
    const merged = withCurrentWeekStreaks(yesterday, todayState, TODAY)
    expect(streakOf(merged, 'run')).toBe(3)
    // Tagesquests behalten den Streak zum gewählten Tag (heute ist „read“ noch offen).
    expect(streakOf(merged, 'read')).toBe(2)
  })

  it('lässt Tage einer früheren Woche und heute unverändert', () => {
    const sunday = getDayState(game, '2026-11-01')
    expect(withCurrentWeekStreaks(sunday, todayState, TODAY)).toBe(sunday)
    expect(withCurrentWeekStreaks(todayState, todayState, TODAY)).toBe(todayState)
  })
})

describe('campaignChapterLine', () => {
  const chapter = (title: string, done: boolean) => ({ chapter: { title }, done })

  it('nennt das aktuelle Kapitel und zählt die abgeschlossenen', () => {
    expect(
      campaignChapterLine({
        chapters: [chapter('Funke', true), chapter('Das erste Buch', false), chapter('Finale', false)],
        currentChapterIndex: 1,
        complete: false,
      }),
    ).toBe('Aktuelles Kapitel: Das erste Buch · 1 / 3 abgeschlossen')
  })

  it('zählt auch abgeschlossene Kapitel hinter dem aktuellen mit', () => {
    expect(
      campaignChapterLine({
        chapters: [chapter('A', false), chapter('B', true), chapter('C', true)],
        currentChapterIndex: 0,
        complete: false,
      }),
    ).toBe('Aktuelles Kapitel: A · 2 / 3 abgeschlossen')
  })

  it('erklärt leere und gemeisterte Kampagnen', () => {
    expect(campaignChapterLine({ chapters: [], currentChapterIndex: -1, complete: false })).toBe('Noch keine Kapitel')
    expect(campaignChapterLine({ chapters: [chapter('A', true)], currentChapterIndex: -1, complete: true })).toBe(
      'Alle Kapitel gemeistert',
    )
  })
})

describe('compactDayLabel', () => {
  it('zeigt Wochentag und Datum kurz', () => {
    expect(compactDayLabel(TODAY)).toBe('Di., 3. Nov.')
    expect(compactDayLabel('2027-03-28')).toBe('So., 28. März')
  })
})

describe('Gold & Streak-Bonus', () => {
  it('benennt das Gold-Abzeichen mit Ziel', () => {
    expect(goldChipLabel(1234)).toBe('1.234 Gold – zur Schatzkammer')
    expect(goldChipLabel(0)).toBe('0 Gold – zur Schatzkammer')
    expect(goldChipLabel(-5)).toBe('-5 Gold – zur Schatzkammer')
  })

  it('zeigt den Streak-Bonus in Prozent – sichtbar knapp, vorgelesen ausgeschrieben', () => {
    expect(streakBonusLabel(0.2)).toBe('+20 %')
    expect(streakBonusLabel(0.05)).toBe('+5 %')
    expect(streakBonusLabel(0.5)).toBe('+50 %')
    // Gleitkomma-Rauschen (3 × 0,05 = 0,15000000000000002) bleibt unsichtbar.
    expect(streakBonusLabel(3 * 0.05)).toBe('+15 %')
    expect(streakBonusText(0.2)).toBe('Streak-Bonus 20 Prozent')
  })
})
