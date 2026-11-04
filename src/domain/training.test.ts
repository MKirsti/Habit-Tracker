import { describe, expect, it } from 'vitest'
import { dominantAttribute, plannedPerWeek, plannedWeeklyXp, plannedWeeklyXpByAttribute } from './training'
import type { AttributeId, Difficulty } from './types'

describe('plannedPerWeek / plannedWeeklyXp', () => {
  it('zählt Termine pro Woche je Rhythmus', () => {
    expect(plannedPerWeek({ type: 'daily' })).toBe(7)
    expect(plannedPerWeek({ type: 'weekdays', days: [1, 3, 5, 3] })).toBe(3)
    expect(plannedPerWeek({ type: 'weekly', times: 4 })).toBe(4)
  })

  it('multipliziert mit den Quest-XP (easy 10, medium 20, hard 40, epic 80)', () => {
    expect(plannedWeeklyXp({ difficulty: 'easy', schedule: { type: 'daily' } })).toBe(70)
    expect(plannedWeeklyXp({ difficulty: 'hard', schedule: { type: 'weekly', times: 3 } })).toBe(120)
    expect(plannedWeeklyXp({ difficulty: 'legendary' as Difficulty, schedule: { type: 'daily' } })).toBe(0)
  })
})

describe('dominantAttribute', () => {
  it('nimmt das Attribut mit den meisten geplanten XP pro Woche', () => {
    expect(
      dominantAttribute([
        { attribute: 'strength', difficulty: 'hard', schedule: { type: 'weekly', times: 3 } }, // 120
        { attribute: 'vitality', difficulty: 'easy', schedule: { type: 'daily' } }, // 70
        { attribute: 'vitality', difficulty: 'easy', schedule: { type: 'daily' } }, // 140
      ]),
    ).toBe('vitality')
  })

  it('bei Gleichstand gewinnt das zuerst genannte Attribut', () => {
    const quests = [
      { attribute: 'wisdom' as const, difficulty: 'easy' as const, schedule: { type: 'daily' as const } },
      { attribute: 'charisma' as const, difficulty: 'medium' as const, schedule: { type: 'weekly' as const, times: 3 } },
      { attribute: 'charisma' as const, difficulty: 'easy' as const, schedule: { type: 'weekly' as const, times: 1 } },
    ]
    expect(plannedWeeklyXpByAttribute(quests)).toEqual(new Map([['wisdom', 70], ['charisma', 70]]))
    expect(dominantAttribute(quests)).toBe('wisdom')
    expect(dominantAttribute([...quests].reverse())).toBe('charisma')
  })

  it('ohne zählende Quest: undefined (kaputte Attribute/Schwierigkeiten zählen nicht)', () => {
    expect(dominantAttribute([])).toBeUndefined()
    expect(
      dominantAttribute([
        { attribute: 'mystery' as AttributeId, difficulty: 'epic', schedule: { type: 'daily' } },
        { attribute: 'strength', difficulty: 'easy', schedule: { type: 'weekly', times: 0 } },
      ]),
    ).toBeUndefined()
  })
})
