import { describe, expect, it } from 'vitest'
import { makeChapter, makeCompletion, makeHabit, makeMainQuest } from '../../domain/testing'
import {
  buildHabitStats,
  chapterLossText,
  formatStreakUnit,
  habitStreak,
  isArchivedOn,
  levelChangeText,
  statsFor,
} from './questStats'

describe('buildHabitStats', () => {
  it('sammelt erledigte Tage bis heute und deren Quest-XP je Quest', () => {
    const reading = makeHabit({ id: 'r', difficulty: 'medium', measure: { target: 10, unit: 'Seiten' } })
    const running = makeHabit({ id: 'l', difficulty: 'hard' })
    const stats = buildHabitStats(
      [
        makeCompletion(reading, '2026-11-01'),
        makeCompletion(reading, '2026-11-02'),
        makeCompletion(reading, '2026-11-03', { value: 4 }), // Teilfortschritt
        makeCompletion(reading, '2026-11-04'), // Zukunft
        makeCompletion(running, '2026-11-02', { difficulty: 'epic' }), // Snapshot zählt
      ],
      '2026-11-03',
    )
    expect([...statsFor(stats, 'r').doneDays]).toEqual(['2026-11-01', '2026-11-02'])
    expect(statsFor(stats, 'r').xp).toBe(40)
    expect(statsFor(stats, 'l').xp).toBe(80)
    expect(statsFor(stats, 'unbekannt')).toEqual({ doneDays: new Set(), xp: 0 })
  })

  it('liefert die Serie zum heutigen Tag', () => {
    const habit = makeHabit({ id: 'h', createdDay: '2026-10-30' })
    const stats = buildHabitStats(
      ['2026-10-30', '2026-11-01', '2026-11-02'].map((day) => makeCompletion(habit, day)),
      '2026-11-03',
    )
    expect(habitStreak(habit, stats, '2026-11-03')).toEqual({ current: 2, best: 2, unit: 'day' })
  })
})

describe('isArchivedOn / formatStreakUnit', () => {
  it('erkennt archivierte Quests zum Stichtag', () => {
    expect(isArchivedOn(makeHabit({ id: 'a' }), '2026-11-03')).toBe(false)
    expect(isArchivedOn(makeHabit({ id: 'b', archivedDay: '2026-11-03' }), '2026-11-03')).toBe(true)
    expect(isArchivedOn(makeHabit({ id: 'c', archivedDay: '2026-11-04' }), '2026-11-03')).toBe(false)
  })

  it('beugt Tage und Wochen', () => {
    expect([0, 1, 2].map((n) => formatStreakUnit(n, 'day'))).toEqual(['Tage', 'Tag', 'Tage'])
    expect([0, 1, 2].map((n) => formatStreakUnit(n, 'week'))).toEqual(['Wochen', 'Woche', 'Wochen'])
  })
})

describe('Texte zum Löschen', () => {
  const quest = makeMainQuest({ id: 'k', title: 'Der Weg des Gelehrten' })
  const chapter = (title: string) => makeChapter({ id: title, title, criterion: { type: 'manual' } })

  it('nennt den Level-Wechsel nur, wenn sich das Level ändert', () => {
    expect(levelChangeText({ levelBefore: 3, levelAfter: 1 })).toBe('Level 3 → 1')
    expect(levelChangeText({ levelBefore: 2, levelAfter: 2 })).toBeUndefined()
  })

  it('beschreibt verlorene Kapitel-Abschlüsse samt Kampagnen-Bonus', () => {
    expect(
      chapterLossText({ quest, lostChapters: [chapter('Der erste Funke')], openChapters: [], losesCompletion: true }),
    ).toBe(
      'Kapitel „Der erste Funke“ verliert seinen Abschluss (−100 XP); die Kampagne „Der Weg des Gelehrten“ ist dann nicht mehr gemeistert (−500 XP).',
    )
    expect(
      chapterLossText({ quest, lostChapters: ['A', 'B', 'C'].map(chapter), openChapters: [], losesCompletion: false }),
    ).toBe('Die Kapitel „A“, „B“ und „C“ verlieren ihren Abschluss (−300 XP).')
    expect(chapterLossText({ quest, lostChapters: [], openChapters: [chapter('Offen')], losesCompletion: false })).toBeUndefined()
  })
})
