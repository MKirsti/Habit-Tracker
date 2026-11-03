import { describe, expect, it } from 'vitest'
import type { Schedule } from '../../domain/types'
import { bodyBlueprint } from './body'
import { bedtimeQuest, stretchingQuest, waterQuest } from './shared'
import { BLUEPRINT_LEVELS } from './types'
import type { BlueprintContent, BlueprintLevel, BlueprintQuest } from './types'

const PATH_IDS = ['strength', 'endurance', 'sports'] as const

function build(level: BlueprintLevel, pathId: string): BlueprintContent {
  return bodyBlueprint.build({ level, pathId })
}

/** Wie oft eine Quest in `days` Tagen höchstens erledigt werden kann. */
function perDays(schedule: Schedule, days: number): number {
  switch (schedule.type) {
    case 'daily':
      return days
    case 'weekdays':
      return (days * schedule.days.length) / 7
    case 'weekly':
      return (days / 7) * schedule.times
  }
}

const cases = BLUEPRINT_LEVELS.flatMap((level) => PATH_IDS.map((pathId) => ({ level, pathId, content: build(level, pathId) })))

describe('Der Weg des Körpers (Sport-Vorlage)', () => {
  it('bietet genau die drei Klassen in fester Reihenfolge an', () => {
    expect(bodyBlueprint.id).toBe('body')
    expect(bodyBlueprint.paths?.map((path) => [path.id, path.className, path.label])).toEqual([
      ['strength', 'Krieger', 'Kraftsport'],
      ['endurance', 'Waldläufer', 'Ausdauersport'],
      ['sports', 'Gladiator', 'Sport allgemein & Spielsport'],
    ])
    expect(bodyBlueprint.paths?.map((path) => path.primaryAttribute)).toEqual(['strength', 'vitality', 'strength'])
  })

  it('verlangt die Klassenwahl mit deutschen Fehlermeldungen', () => {
    expect(() => bodyBlueprint.build({ level: 'beginner' })).toThrow('Bitte wähle einen Pfad.')
    expect(() => bodyBlueprint.build({ level: 'advanced', pathId: '' })).toThrow('Bitte wähle einen Pfad.')
    expect(() => bodyBlueprint.build({ level: 'beginner', pathId: 'quidditch' })).toThrow('Unbekannter Pfad.')
    expect(() => bodyBlueprint.build({ level: 'beginner', pathId: 'toString' })).toThrow('Unbekannter Pfad.')
  })

  it('benennt die installierte Kampagne nach der Klasse', () => {
    for (const level of BLUEPRINT_LEVELS) {
      expect(build(level, 'strength')).toMatchObject({ title: 'Der Pfad des Kriegers', icon: '🗡️' })
      expect(build(level, 'endurance')).toMatchObject({ title: 'Der Pfad des Waldläufers', icon: '🏹' })
      expect(build(level, 'sports')).toMatchObject({ title: 'Der Pfad des Gladiators', icon: '🛡️' })
    }
  })

  it.each(cases)('$pathId · $level: Kern-Quest trainiert das Haupt-Attribut, Nebenquests die Neben-Attribute', ({ pathId, content }) => {
    const path = bodyBlueprint.paths?.find((candidate) => candidate.id === pathId)
    if (!path) throw new Error(pathId)
    const [core] = content.quests
    expect(core?.attribute).toBe(path.primaryAttribute)
    expect(core?.difficulty).toBe('hard')
    for (const attribute of path.secondaryAttributes) {
      expect(
        content.quests.some((quest) => quest.attribute === attribute),
        attribute,
      ).toBe(true)
    }
  })

  it.each(cases)('$pathId · $level: Tageslast passt zur Stufe', ({ level, content }) => {
    const daily = content.quests.filter((quest) => quest.schedule.type === 'daily')
    if (level === 'beginner') {
      expect(daily.length).toBeLessThanOrEqual(3)
    } else {
      expect(content.quests.length).toBeGreaterThanOrEqual(4)
      expect(content.quests.length).toBeLessThanOrEqual(6)
    }
    // Echte Trainingseinheiten sind Wochenquests – täglich gibt es nur kleine Rituale, nie eine schwere Pflicht.
    expect(content.quests.filter((quest) => quest.schedule.type === 'daily' && quest.difficulty === 'hard')).toEqual([])
  })

  it.each(cases)('$pathId · $level: das erste Kapitel ist ein schneller Erfolg (≤ 2 Wochen)', ({ content }) => {
    const [first] = content.chapters
    const criterion = first?.criterion
    if (criterion?.type !== 'habit') throw new Error('erstes Kapitel muss automatisch sein')
    expect(criterion.metric).toBe('completions')
    const quest = content.quests.find((candidate) => candidate.key === criterion.questKey)
    if (!quest) throw new Error(criterion.questKey)
    expect(criterion.target).toBeLessThanOrEqual(perDays(quest.schedule, 14))
  })

  it.each(cases)('$pathId · $level: Kapitel mischen automatische, manuelle und Zähler-Ziele', ({ content }) => {
    const types = new Set(content.chapters.map((chapter) => chapter.criterion.type))
    expect(types.has('habit')).toBe(true)
    expect(types.has('manual') || types.has('counter')).toBe(true)
    const metrics = new Set(content.chapters.flatMap((chapter) => (chapter.criterion.type === 'habit' ? [chapter.criterion.metric] : [])))
    expect(metrics.has('streak')).toBe(true)
  })

  it.each(PATH_IDS)('%s: Fortgeschritten hat höhere Ziele als Einsteiger', (pathId) => {
    const beginner = build('beginner', pathId)
    const advanced = build('advanced', pathId)
    const finalTarget = (content: BlueprintContent) => {
      const last = content.chapters.at(-1)?.criterion
      return last && last.type !== 'manual' ? last.target : 0
    }
    expect(finalTarget(advanced)).toBeGreaterThan(finalTarget(beginner))
    const coreLoad = (content: BlueprintContent) => {
      const core = content.quests[0]
      if (!core) return 0
      return perDays(core.schedule, 7) * (core.measure?.target ?? 1)
    }
    expect(coreLoad(advanced)).toBeGreaterThan(coreLoad(beginner))
  })

  it('nutzt die gemeinsamen Bausteine unverändert und konfiguriert pfadübergreifende Quests gleich', () => {
    const shared = new Map<string, (level: BlueprintLevel) => BlueprintQuest>([
      ['Wasser trinken', (level) => waterQuest(level)],
      ['Dehnen & Mobilität', (level) => stretchingQuest(level)],
      ['Rechtzeitig ins Bett', (level) => bedtimeQuest(level)],
    ])
    const seen = new Map<string, { icon: string; attribute: string; schedule: { type: string }; measure?: { unit: string } }>()
    for (const { level, content } of cases) {
      for (const quest of content.quests) {
        const builder = shared.get(quest.title)
        if (builder) expect(quest).toEqual(builder(level))
        // Gleicher Titel in verschiedenen Pfaden ⇒ gleiche Gestalt (Icon, Attribut, Rhythmus-Typ, Einheit).
        const comparable = {
          icon: quest.icon,
          attribute: quest.attribute,
          schedule: { type: quest.schedule.type },
          ...(quest.measure ? { measure: { unit: quest.measure.unit } } : {}),
        }
        const previous = seen.get(quest.title)
        if (previous) expect(comparable, quest.title).toEqual(previous)
        else seen.set(quest.title, comparable)
      }
    }
    expect(seen.get('Schritte sammeln')).toMatchObject({ attribute: 'vitality', schedule: { type: 'daily' }, measure: { unit: 'Schritte' } })
  })
})
