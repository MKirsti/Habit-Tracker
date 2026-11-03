import { describe, expect, it } from 'vitest'
import { getBlueprint } from '../../data/blueprints'
import type { CampaignBlueprint } from '../../data/blueprints'
import { createCampaignFromBlueprint } from '../../data/seed'
import { DEFAULT_SETTINGS } from '../../domain/balancing'
import type { GameData, Habit, MainQuest } from '../../domain/types'
import { adventureChoice, blueprintOptions, findSharedHabit, hasPaths, libraryStatus } from './libraryStatus'

const TODAY = '2026-11-03'

function blueprint(id: string): CampaignBlueprint {
  const found = getBlueprint(id)
  if (!found) throw new Error(`Vorlage ${id} fehlt`)
  return found
}

function data(mainQuests: MainQuest[], habits: Habit[] = []): GameData {
  return { settings: { ...DEFAULT_SETTINGS }, habits, completions: [], mainQuests }
}

function campaign(id: string, patch: Partial<MainQuest> = {}): MainQuest {
  const bp = blueprint(id)
  const options = hasPaths(bp) ? { level: 'beginner' as const, pathId: bp.paths?.[0].id } : { level: 'beginner' as const }
  return { ...createCampaignFromBlueprint(bp, options, TODAY, 1).mainQuest, ...patch }
}

/** Kampagne, deren einziges (manuelles) Kapitel abgehakt ist → abgeschlossen. */
function completed(id: string, patch: Partial<MainQuest> = {}): MainQuest {
  return campaign(id, {
    chapters: [{ id: 'done', title: 'Fertig', criterion: { type: 'manual' }, manualDone: true, completedDay: TODAY }],
    ...patch,
  })
}

function habit(patch: Partial<Habit>): Habit {
  return {
    id: 'h',
    title: 'Wasser trinken',
    icon: '💧',
    attribute: 'vitality',
    difficulty: 'easy',
    schedule: { type: 'daily' },
    order: 0,
    createdDay: '2026-10-01',
    ...patch,
  }
}

describe('libraryStatus', () => {
  it('zählt aktive Kampagnen, freie Plätze und laufende Vorlagen', () => {
    const status = libraryStatus(data([campaign('scholar'), campaign('body')]), TODAY)
    expect(status.activeCount).toBe(2)
    expect(status.maxActive).toBe(3)
    expect(status.slotsLeft).toBe(1)
    expect([...status.running.keys()].sort()).toEqual(['body', 'scholar'])
    expect(status.running.get('body')).toEqual({ id: 'body', level: 'beginner', pathId: 'strength' })
    expect(status.mastered.size).toBe(0)
  })

  it('abgeschlossene und archivierte Kampagnen belegen keinen Platz; gemeistert zählt auch archiviert', () => {
    const status = libraryStatus(
      data([completed('scholar'), completed('monk', { archived: true }), campaign('body', { archived: true })]),
      TODAY,
    )
    expect(status.activeCount).toBe(0)
    expect(status.slotsLeft).toBe(3)
    expect(status.running.size).toBe(0)
    expect([...status.mastered].sort()).toEqual(['monk', 'scholar'])
  })

  it('volle Plätze → 0 frei', () => {
    const status = libraryStatus(data([campaign('scholar'), campaign('body'), campaign('monk')]), TODAY)
    expect(status.slotsLeft).toBe(0)
    expect(status.activeCount).toBe(3)
  })
})

describe('findSharedHabit', () => {
  it('findet eine nicht archivierte Quest mit gleichem (getrimmten) Titel', () => {
    const habits = [habit({ id: 'a', title: '  Wasser trinken ' }), habit({ id: 'b', title: 'Lesen', order: 1 })]
    expect(findSharedHabit(habits, 'Wasser trinken', TODAY)?.id).toBe('a')
    expect(findSharedHabit(habits, 'Meditieren', TODAY)).toBeUndefined()
  })

  it('ignoriert archivierte Quests (ein archivedDay nach heute zählt noch nicht)', () => {
    expect(findSharedHabit([habit({ archivedDay: TODAY })], 'Wasser trinken', TODAY)).toBeUndefined()
    expect(findSharedHabit([habit({ archivedDay: '2026-11-04' })], 'Wasser trinken', TODAY)?.id).toBe('h')
  })

  it('bevorzugt eine keiner aktiven Kampagne zugeordnete Quest, sonst die erste in der Liste', () => {
    const habits = [
      habit({ id: 'assigned', order: 0, mainQuestId: 'q1' }),
      habit({ id: 'free', order: 5 }),
      habit({ id: 'later', order: 9 }),
    ]
    expect(findSharedHabit(habits, 'Wasser trinken', TODAY, new Set(['q1']))?.id).toBe('free')
    expect(findSharedHabit(habits, 'Wasser trinken', TODAY)?.id).toBe('assigned')
  })
})

describe('Optionen', () => {
  it('pathId nur bei Vorlagen mit Pfaden', () => {
    expect(blueprintOptions(blueprint('scholar'), 'advanced', 'strength')).toEqual({ level: 'advanced' })
    expect(blueprintOptions(blueprint('body'), 'advanced', 'strength')).toEqual({ level: 'advanced', pathId: 'strength' })
    expect(adventureChoice(blueprint('body'), { level: 'beginner', pathId: 'sports' })).toEqual({
      blueprintId: 'body',
      options: { level: 'beginner', pathId: 'sports' },
    })
    expect(hasPaths(blueprint('body'))).toBe(true)
    expect(hasPaths(blueprint('scholar'))).toBe(false)
  })
})
