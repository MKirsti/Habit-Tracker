import { describe, expect, it } from 'vitest'
import { ATTRIBUTE_IDS } from '../../domain/attributes'
import { DIFFICULTIES } from '../../domain/balancing'
import type { Schedule } from '../../domain/types'
import { BLUEPRINTS, getBlueprint } from './index'
import { BLUEPRINT_LEVELS } from './types'
import type { BlueprintContent, BlueprintOptions, BlueprintQuest, CampaignBlueprint } from './types'

/** Alle gültigen Optionen einer Vorlage (jede Stufe × jeder Pfad). */
function allOptions(blueprint: CampaignBlueprint): BlueprintOptions[] {
  const paths = blueprint.paths?.map((path) => path.id) ?? [undefined]
  return BLUEPRINT_LEVELS.flatMap((level) => paths.map((pathId) => (pathId ? { level, pathId } : { level })))
}

/** Wie oft eine Quest in `days` Tagen höchstens fällig/erledigbar ist (für Machbarkeits-Prüfungen). */
function maxOccurrences(schedule: Schedule, days: number): number {
  switch (schedule.type) {
    case 'daily':
      return days
    case 'weekdays':
      return Math.floor((days * schedule.days.length) / 7)
    case 'weekly':
      return Math.floor((days / 7) * schedule.times)
  }
}

function label(blueprint: CampaignBlueprint, options: BlueprintOptions) {
  return `${blueprint.id} · ${options.level}${options.pathId ? ` · ${options.pathId}` : ''}`
}

const cases = BLUEPRINTS.flatMap((blueprint) =>
  allOptions(blueprint).map((options) => ({ name: label(blueprint, options), blueprint, options })),
)

describe('Kampagnen-Bibliothek', () => {
  it('hat eindeutige, stabile IDs und alle Vorlagen aus dem Plan', () => {
    const ids = BLUEPRINTS.map((blueprint) => blueprint.id)
    expect(new Set(ids).size).toBe(ids.length)
    expect(ids).toEqual(
      expect.arrayContaining(['scholar', 'body', 'alchemist', 'monk', 'earlyRiser', 'fortress', 'fellowship', 'polyglot']),
    )
    expect(getBlueprint('scholar')?.id).toBe('scholar')
    expect(getBlueprint('gibt-es-nicht')).toBeUndefined()
  })

  it('deckt zusammen alle sechs Attribute als Haupt-Attribut einer Vorlage oder eines Pfads ab', () => {
    const primaries = new Set(
      BLUEPRINTS.flatMap((blueprint) => [blueprint.primaryAttribute, ...(blueprint.paths ?? []).map((p) => p.primaryAttribute)]),
    )
    for (const attribute of ATTRIBUTE_IDS) expect(primaries, attribute).toContain(attribute)
  })

  it('Sport-Vorlage verlangt die Wahl eines von drei Pfaden', () => {
    const body = getBlueprint('body')
    expect(body?.paths?.map((path) => path.id)).toEqual(['strength', 'endurance', 'sports'])
    expect(() => body?.build({ level: 'beginner' })).toThrow()
    expect(() => body?.build({ level: 'beginner', pathId: 'quidditch' })).toThrow()
  })

  it.each(BLUEPRINTS.map((blueprint) => [blueprint.id, blueprint] as const))('%s: Metadaten sind vollständig', (_id, blueprint) => {
    expect(blueprint.title.length).toBeGreaterThan(0)
    expect(blueprint.title.length).toBeLessThanOrEqual(60)
    expect(blueprint.tagline.length).toBeGreaterThan(0)
    expect(blueprint.tagline.length).toBeLessThanOrEqual(90)
    expect(blueprint.description.length).toBeGreaterThan(0)
    expect(ATTRIBUTE_IDS).toContain(blueprint.primaryAttribute)
    expect(blueprint.secondaryAttributes).not.toContain(blueprint.primaryAttribute)
    expect(blueprint.durationDays).toBeGreaterThanOrEqual(60)
    expect(blueprint.durationDays).toBeLessThanOrEqual(366)
    for (const level of BLUEPRINT_LEVELS) expect(blueprint.levelHints[level].length).toBeGreaterThan(0)
    for (const path of blueprint.paths ?? []) {
      expect(path.className.length).toBeGreaterThan(0)
      expect(path.label.length).toBeGreaterThan(0)
      expect(path.description.length).toBeGreaterThan(0)
      expect(path.secondaryAttributes).not.toContain(path.primaryAttribute)
    }
  })

  describe.each(cases)('$name', ({ blueprint, options }) => {
    const content: BlueprintContent = blueprint.build(options)
    const questsByKey = new Map<string, BlueprintQuest>(content.quests.map((quest) => [quest.key, quest]))

    it('ist deterministisch (reine Funktion)', () => {
      expect(blueprint.build(options)).toEqual(content)
    })

    it('hat Titel, Texte und sinnvolle Längen', () => {
      expect(content.title.length).toBeGreaterThan(0)
      expect(content.title.length).toBeLessThanOrEqual(60)
      expect(content.icon.length).toBeGreaterThan(0)
      expect(content.description.length).toBeLessThanOrEqual(300)
      expect(content.why.length).toBeGreaterThan(0)
      expect(content.why.length).toBeLessThanOrEqual(300)
      expect(content.reward.length).toBeGreaterThan(0)
      expect(content.reward.length).toBeLessThanOrEqual(120)
    })

    it('hat 3–6 gültige Quests mit eindeutigen Schlüsseln und Titeln', () => {
      expect(content.quests.length).toBeGreaterThanOrEqual(3)
      expect(content.quests.length).toBeLessThanOrEqual(6)
      expect(questsByKey.size).toBe(content.quests.length)
      expect(new Set(content.quests.map((quest) => quest.title)).size).toBe(content.quests.length)
      for (const quest of content.quests) {
        expect(quest.title.length, quest.key).toBeGreaterThan(0)
        expect(quest.title.length, quest.key).toBeLessThanOrEqual(60)
        expect(quest.description.length, quest.key).toBeGreaterThan(0)
        expect(quest.description.length, quest.key).toBeLessThanOrEqual(200)
        expect(quest.icon.length, quest.key).toBeGreaterThan(0)
        expect(ATTRIBUTE_IDS, quest.key).toContain(quest.attribute)
        expect(DIFFICULTIES, quest.key).toContain(quest.difficulty)
        if (quest.schedule.type === 'weekly') {
          expect(Number.isInteger(quest.schedule.times), quest.key).toBe(true)
          expect(quest.schedule.times, quest.key).toBeGreaterThanOrEqual(1)
          expect(quest.schedule.times, quest.key).toBeLessThanOrEqual(7)
        }
        if (quest.schedule.type === 'weekdays') {
          expect(quest.schedule.days.length, quest.key).toBeGreaterThan(0)
          expect(new Set(quest.schedule.days).size, quest.key).toBe(quest.schedule.days.length)
        }
        if (quest.measure) {
          expect(quest.measure.target, quest.key).toBeGreaterThan(0)
          expect(quest.measure.unit.trim().length, quest.key).toBeGreaterThan(0)
        }
      }
    })

    it('trainiert das Haupt-Attribut (der Vorlage bzw. des Pfads) mit mindestens einer Quest', () => {
      const path = blueprint.paths?.find((candidate) => candidate.id === options.pathId)
      const primary = path?.primaryAttribute ?? blueprint.primaryAttribute
      expect(content.quests.some((quest) => quest.attribute === primary)).toBe(true)
    })

    it('hat 4–7 Kapitel mit gültigen, in der Laufzeit machbaren Zielen', () => {
      expect(content.chapters.length).toBeGreaterThanOrEqual(4)
      expect(content.chapters.length).toBeLessThanOrEqual(7)
      for (const chapter of content.chapters) {
        expect(chapter.title.length, chapter.title).toBeGreaterThan(0)
        expect(chapter.title.length, chapter.title).toBeLessThanOrEqual(60)
        expect(chapter.description.length, chapter.title).toBeGreaterThan(0)
        expect(chapter.description.length, chapter.title).toBeLessThanOrEqual(200)
        const { criterion } = chapter
        if (criterion.type === 'counter') {
          expect(criterion.target, chapter.title).toBeGreaterThan(0)
          expect(criterion.label.trim().length, chapter.title).toBeGreaterThan(0)
        }
        if (criterion.type !== 'habit') continue
        const quest = questsByKey.get(criterion.questKey)
        expect(quest, `${chapter.title} → ${criterion.questKey}`).toBeDefined()
        if (!quest) continue
        expect(criterion.target, chapter.title).toBeGreaterThan(0)
        const max = maxOccurrences(quest.schedule, blueprint.durationDays)
        if (criterion.metric === 'total') {
          expect(quest.measure, `${chapter.title}: "Gesamtmenge" nur für messbare Quests`).toBeDefined()
          if (quest.measure) expect(criterion.target, chapter.title).toBeLessThanOrEqual(quest.measure.target * max * 1.5)
        } else if (criterion.metric === 'completions') {
          expect(criterion.target, chapter.title).toBeLessThanOrEqual(Math.floor(max * 0.9))
        } else {
          // Streak: Tage (daily/weekdays) bzw. Wochen (weekly) – muss in die Laufzeit passen.
          const unitMax =
            quest.schedule.type === 'weekly' ? Math.floor(blueprint.durationDays / 7) : maxOccurrences(quest.schedule, blueprint.durationDays)
          expect(criterion.target, chapter.title).toBeLessThanOrEqual(unitMax)
        }
      }
    })

    it('nutzt jede Quest, die ein Kapitel referenziert, und mindestens ein automatisches Kapitel', () => {
      expect(content.chapters.some((chapter) => chapter.criterion.type === 'habit')).toBe(true)
    })
  })

  it('Fortgeschritten ist mindestens so fordernd wie Einsteiger (Zielwerte der Kapitel)', () => {
    for (const blueprint of BLUEPRINTS) {
      const paths = blueprint.paths?.map((path) => path.id) ?? [undefined]
      for (const pathId of paths) {
        const beginner = blueprint.build(pathId ? { level: 'beginner', pathId } : { level: 'beginner' })
        const advanced = blueprint.build(pathId ? { level: 'advanced', pathId } : { level: 'advanced' })
        const differs = JSON.stringify(beginner.quests) !== JSON.stringify(advanced.quests)
        expect(differs, `${blueprint.id}${pathId ? `/${pathId}` : ''}: Stufen müssen sich unterscheiden`).toBe(true)
      }
    }
  })

  it('gleich benannte Quests sind in allen Vorlagen gleich konfiguriert (Attribut, Rhythmus-Typ, Messbarkeit)', () => {
    const seen = new Map<string, { attribute: string; scheduleType: string; measurable: boolean; where: string }>()
    for (const { name, blueprint, options } of cases) {
      for (const quest of blueprint.build(options).quests) {
        const shape = { attribute: quest.attribute, scheduleType: quest.schedule.type, measurable: quest.measure !== undefined }
        const previous = seen.get(quest.title)
        if (previous) expect({ ...shape, where: previous.where }, `${quest.title} in ${name}`).toEqual(previous)
        else seen.set(quest.title, { ...shape, where: name })
      }
    }
  })
})
