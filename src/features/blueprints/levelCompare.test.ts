import { describe, expect, it } from 'vitest'
import { getBlueprint } from '../../data/blueprints'
import type { BlueprintContent, BlueprintQuest } from '../../data/blueprints'
import { compareLevels, otherLevel } from './levelCompare'

function content(quests: BlueprintQuest[]): BlueprintContent {
  return { title: 'Test', icon: '🧪', description: '', why: '', reward: '', quests, chapters: [] }
}

const base: BlueprintQuest = {
  key: 'push',
  icon: '💪',
  title: 'Liegestütze',
  description: '',
  attribute: 'strength',
  difficulty: 'easy',
  schedule: { type: 'daily' },
  measure: { target: 10, unit: 'Mal' },
}

describe('levelCompare', () => {
  it('otherLevel: die jeweils andere Stufe', () => {
    expect(otherLevel('beginner')).toBe('advanced')
    expect(otherLevel('advanced')).toBe('beginner')
  })

  it('nennt nur die abweichenden Werte der anderen Stufe (Rhythmus, Ziel, XP)', () => {
    const advanced = content([
      { ...base, difficulty: 'medium', measure: { target: 30, unit: 'Mal' } },
      { ...base, key: 'train', title: 'Krafttraining', schedule: { type: 'weekly', times: 4 }, measure: undefined },
      { ...base, key: 'same', title: 'Dehnen' },
    ])
    const beginner = content([
      base,
      { ...base, key: 'train', title: 'Krafttraining', schedule: { type: 'weekly', times: 2 }, measure: undefined },
      { ...base, key: 'same', title: 'Dehnen' },
    ])
    const result = compareLevels(advanced, beginner, 'advanced')
    expect(result.otherLevel).toBe('beginner')
    expect(result.quests.get('push')).toEqual({ kind: 'changed', other: '10 Mal · +10 XP' })
    expect(result.quests.get('train')).toEqual({ kind: 'changed', other: '2× pro Woche' })
    expect(result.quests.has('same')).toBe(false)
    expect(result.missing).toEqual([])
  })

  it('markiert Quests, die es nur in einer Stufe gibt – in beiden Richtungen', () => {
    const water: BlueprintQuest = { ...base, key: 'water', title: 'Wasser trinken', measure: { target: 2.5, unit: 'L' } }
    const beginner = content([base])
    const advanced = content([base, water])
    expect(compareLevels(advanced, beginner, 'advanced').quests.get('water')).toEqual({ kind: 'only' })
    const fromBeginner = compareLevels(beginner, advanced, 'beginner')
    expect(fromBeginner.missing.map((quest) => quest.title)).toEqual(['Wasser trinken'])
    expect(fromBeginner.quests.size).toBe(0)
  })

  it('Ziel neu bzw. entfallen: „ohne Zielwert“ oder das Ziel der anderen Stufe', () => {
    const plain = content([{ ...base, measure: undefined }])
    const measured = content([base])
    expect(compareLevels(measured, plain, 'beginner').quests.get('push')).toEqual({ kind: 'changed', other: 'ohne Zielwert' })
    expect(compareLevels(plain, measured, 'advanced').quests.get('push')).toEqual({ kind: 'changed', other: '10 Mal' })
  })

  it('Sport-Vorlage, Krieger: Fortgeschritten trainiert öfter, mehr und trinkt zusätzlich Wasser', () => {
    const body = getBlueprint('body')
    if (!body) throw new Error('Vorlage fehlt')
    const beginner = body.build({ level: 'beginner', pathId: 'strength' })
    const advanced = body.build({ level: 'advanced', pathId: 'strength' })
    const result = compareLevels(beginner, advanced, 'beginner')
    const byTitle = new Map(beginner.quests.map((quest) => [quest.title, result.quests.get(quest.key)]))
    expect(byTitle.get('Krafttraining')).toEqual({ kind: 'changed', other: '4× pro Woche' })
    expect(byTitle.get('Liegestütze')).toEqual({ kind: 'changed', other: '30 Mal · +20 XP' })
    expect(result.missing.map((quest) => quest.title)).toEqual(['Wasser trinken'])
  })
})
