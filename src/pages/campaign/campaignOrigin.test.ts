import { describe, expect, it } from 'vitest'
import type { Chapter, Habit, MainQuest, MainQuestState } from '../../domain/types'
import { CAMPAIGN_RESTORE_LIMIT_MESSAGE } from '../../domain/campaigns'
import { campaignQuestsToArchive, restoreBlockedReason } from './campaignArchive'
import { campaignOrigin, originSummary, pathLabel } from './campaignOrigin'

describe('campaignOrigin', () => {
  it('liefert Vorlage, Stufe und Klasse einer Sport-Kampagne', () => {
    const origin = campaignOrigin({ blueprint: { id: 'body', level: 'advanced', pathId: 'sports' } })
    expect(origin?.blueprint.id).toBe('body')
    expect(origin?.levelLabel).toBe('Fortgeschritten')
    expect(origin?.path?.className).toBe('Gladiator')
    expect(pathLabel(origin!.path!)).toBe('🛡️ Gladiator · Sport allgemein & Spielsport')
    expect(originSummary(origin!)).toBe('🛡️ Gladiator · Fortgeschritten')
  })

  it('kennt Vorlagen ohne Klasse', () => {
    const origin = campaignOrigin({ blueprint: { id: 'scholar', level: 'beginner' } })
    expect(origin?.path).toBeUndefined()
    expect(originSummary(origin!)).toBe('Einsteiger')
  })

  it('ignoriert eigene Kampagnen und unbekannte Vorlagen oder Pfade', () => {
    expect(campaignOrigin({})).toBeUndefined()
    expect(campaignOrigin({ blueprint: { id: 'gibt-es-nicht', level: 'beginner' } })).toBeUndefined()
    expect(campaignOrigin({ blueprint: { id: 'body', level: 'beginner', pathId: 'quidditch' } })?.path).toBeUndefined()
  })
})

describe('campaignQuestsToArchive', () => {
  const TODAY = '2026-11-03'

  function habit(id: string, patch: Partial<Habit> = {}): Habit {
    return {
      id,
      title: id,
      icon: '⭐',
      attribute: 'vitality',
      difficulty: 'easy',
      schedule: { type: 'daily' },
      order: 0,
      createdDay: '2026-10-01',
      ...patch,
    }
  }

  function state(quest: Partial<MainQuest> & { id: string }, chapters: Chapter[] = []): MainQuestState {
    return {
      quest: { title: quest.id, icon: '🏁', why: '', reward: '', startDay: '2026-10-01', createdAt: 0, chapters, ...quest },
      chapters: [],
      progress: 0,
      currentChapterIndex: -1,
      complete: false,
      linkedHabitIds: [],
    }
  }

  it('archiviert eigene, laufende Quests – geteilte und schon archivierte nicht', () => {
    const target = state({ id: 'a' })
    const habits = [
      habit('own', { mainQuestId: 'a' }),
      habit('shared', { mainQuestId: 'a' }),
      habit('chapter', { mainQuestId: 'a' }),
      habit('old', { mainQuestId: 'a', archivedDay: '2026-10-20' }),
      habit('foreign', { mainQuestId: 'b' }),
    ]
    const other = state({ id: 'b', sharedHabitIds: ['shared'] }, [
      { id: 'c', title: 'Kapitel', criterion: { type: 'habit', habitId: 'chapter', metric: 'completions', target: 3 } },
    ])
    const result = campaignQuestsToArchive(target, habits, [target, other], TODAY)
    expect(result.archived.map((h) => h.id)).toEqual(['own'])
    expect(result.kept.map((h) => h.id)).toEqual(['shared', 'chapter'])
  })

  it('archivierte Kampagnen brauchen keine Quests mehr', () => {
    const target = state({ id: 'a' })
    const other = state({ id: 'b', archived: true, sharedHabitIds: ['shared'] })
    const result = campaignQuestsToArchive(target, [habit('shared', { mainQuestId: 'a' })], [target, other], TODAY)
    expect(result.archived.map((h) => h.id)).toEqual(['shared'])
    expect(result.borrowed).toEqual([])
  })

  it('nennt mitbenutzte Quests anderer laufender Kampagnen (laufen ohnehin weiter)', () => {
    const target = { ...state({ id: 'a', sharedHabitIds: ['water'] }), linkedHabitIds: ['own', 'water', 'gone', 'old'] }
    const habits = [
      habit('own', { mainQuestId: 'a' }),
      habit('water', { mainQuestId: 'b' }),
      habit('gone', { mainQuestId: 'c' }), // Kampagne c ist archiviert
      habit('old', { mainQuestId: 'b', archivedDay: '2026-10-20' }),
      habit('unrelated', { mainQuestId: 'b' }),
    ]
    const result = campaignQuestsToArchive(
      target,
      habits,
      [target, state({ id: 'b' }), state({ id: 'c', archived: true })],
      TODAY,
    )
    expect(result.archived.map((h) => h.id)).toEqual(['own'])
    expect(result.kept).toEqual([])
    expect(result.borrowed.map((h) => h.id)).toEqual(['water'])
  })
})

describe('restoreBlockedReason', () => {
  function campaignState(id: string, patch: Partial<MainQuestState> = {}, quest: Partial<MainQuest> = {}): MainQuestState {
    return {
      quest: { id, title: id, icon: '🏁', why: '', reward: '', startDay: '2026-10-01', createdAt: 0, chapters: [], ...quest },
      chapters: [],
      progress: 0,
      currentChapterIndex: 0,
      complete: false,
      linkedHabitIds: [],
      ...patch,
    }
  }

  it('erlaubt das Zurückholen mit freiem Platz und gemeisterte Kampagnen immer', () => {
    const active = [campaignState('a'), campaignState('b')]
    expect(restoreBlockedReason(campaignState('x', {}, { archived: true }), active, 3)).toBeUndefined()
    const full = [...active, campaignState('c')]
    expect(restoreBlockedReason(campaignState('x', { complete: true }, { archived: true }), full, 3)).toBeUndefined()
  })

  it('sperrt bei vollem Limit', () => {
    const full = [campaignState('a'), campaignState('b'), campaignState('c')]
    expect(restoreBlockedReason(campaignState('x', {}, { archived: true }), full, 3)).toBe(CAMPAIGN_RESTORE_LIMIT_MESSAGE)
  })

  it('sperrt, solange eine Kampagne derselben Vorlage läuft – und nennt sie', () => {
    const running = campaignState('a', {}, { title: 'Der Pfad des Kriegers', blueprint: { id: 'body', level: 'beginner', pathId: 'strength' } })
    const ended = campaignState('x', {}, { archived: true, blueprint: { id: 'body', level: 'advanced', pathId: 'sports' } })
    expect(restoreBlockedReason(ended, [running], 3)).toBe(
      'Aus dieser Vorlage läuft gerade „Der Pfad des Kriegers“. Schließe sie ab oder beende sie, um diese fortzusetzen.',
    )
  })
})
