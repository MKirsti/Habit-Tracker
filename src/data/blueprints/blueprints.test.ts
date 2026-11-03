/**
 * Inhaltliche Prüfung der ganzen Kampagnen-Bibliothek: jede Vorlage in jeder Stufe und jedem Pfad. Die Gruppen-Tests
 * (`body.test.ts`, `wellbeing.test.ts`, `mindSocial.test.ts`) prüfen darüber hinaus die Besonderheiten einzelner
 * Vorlagen. Hier stehen die Regeln, die für **alle** gelten:
 * - Belastung: Einsteiger höchstens 3 Pflicht-Quests an jedem Wochentag, Fortgeschritten höchstens 4.
 * - Tempo (echte Kapitel-Auswertung, Held erledigt alles genau nach Plan): erstes Kapitel in ≤ 14 Tagen, Kapitel in
 *   Erzählreihenfolge, jedes automatische Kapitel mit ≥ 20 % Puffer erreichbar, ein automatisches Schlusskapitel
 *   braucht mindestens die halbe Laufzeit.
 * - Stufen: Fortgeschritten enthält alle Einsteiger-Quests mit mindestens gleichen Zielen, bringt mehr XP pro Woche
 *   und hebt die Kapitel-Ziele an.
 * - Geteilte Quests: gleicher Titel ⇒ gleiche Quest (Icon, Attribut, Rhythmus-Typ, Einheit), Bausteine aus
 *   `shared.ts` unverändert, keine Beinahe-Dubletten ("Wasser" neben "Wasser trinken").
 * - Texte: Du-Form, deutsche Typografie, Zahlen in Texten passen zu den Zielen.
 */
import { describe, expect, it } from 'vitest'
import { ATTRIBUTE_IDS } from '../../domain/attributes'
import { BALANCING, DIFFICULTIES } from '../../domain/balancing'
import type { IsoWeekday, Schedule } from '../../domain/types'
import { BLUEPRINTS, getBlueprint } from './index'
import { daysToReachAtPlanPace } from './planPace'
import { bedtimeQuest, candlelightQuest, morningLightQuest, stretchingQuest, waterQuest } from './shared'
import { BLUEPRINT_LEVELS } from './types'
import type { BlueprintContent, BlueprintLevel, BlueprintOptions, BlueprintQuest, CampaignBlueprint } from './types'

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

/** Wie oft pro Woche die Quest (nach Plan) erledigt wird. */
function perWeek(schedule: Schedule): number {
  switch (schedule.type) {
    case 'daily':
      return 7
    case 'weekdays':
      return new Set(schedule.days).size
    case 'weekly':
      return schedule.times
  }
}

/** Pflicht an diesem Wochentag (zählt für den Perfekten Tag)? Wochenquests sind nie Pflicht. */
function requiredOnWeekday(schedule: Schedule, weekday: IsoWeekday): boolean {
  return schedule.type === 'daily' || (schedule.type === 'weekdays' && schedule.days.includes(weekday))
}

/** Höchstmögliche Quest-XP pro Woche (ohne Boni). */
function weeklyQuestXp(content: BlueprintContent): number {
  return content.quests.reduce((sum, quest) => sum + perWeek(quest.schedule) * BALANCING.questXp[quest.difficulty], 0)
}

function label(blueprint: CampaignBlueprint, options: BlueprintOptions) {
  return `${blueprint.id} · ${options.level}${options.pathId ? ` · ${options.pathId}` : ''}`
}

const WEEKDAYS: IsoWeekday[] = [1, 2, 3, 4, 5, 6, 7]

const cases = BLUEPRINTS.flatMap((blueprint) =>
  allOptions(blueprint).map((options) => ({ name: label(blueprint, options), blueprint, options, content: blueprint.build(options) })),
)

/** Titel aller Kampagnen der Bibliothek: Vorlagen und (pfadabhängig) installierte Kampagnen. */
const CAMPAIGN_TITLES = new Set([...BLUEPRINTS.map((blueprint) => blueprint.title), ...cases.map(({ content }) => content.title)])

/** Typografie & Ton: Du-Form, deutsche Anführungszeichen, Gedankenstrich statt Bindestrich, saubere Leerzeichen. */
function expectCleanGermanText(text: string, where: string) {
  expect(text.trim(), where).toBe(text)
  expect(text.length, where).toBeGreaterThan(0)
  expect(text, `${where}: Du-Form`).not.toMatch(/\b(Sie|Ihnen|Ihr|Ihre|Ihren|Ihrem|Ihrer|Ihres)\b/)
  expect(text, `${where}: deutsche Anführungszeichen „…“ und ’`).not.toMatch(/["']/)
  expect(text, `${where}: Auslassungszeichen …`).not.toMatch(/\.\.\./)
  expect(text, `${where}: Gedankenstrich – statt Bindestrich`).not.toMatch(/\s-\s/)
  expect(text, `${where}: doppelte Leerzeichen`).not.toMatch(/ {2}/)
  expect(text, `${where}: Leerzeichen vor Satzzeichen`).not.toMatch(/\s[,.;:!?)]/)
  expect(text, `${where}: Platzhalter`).not.toMatch(/TODO|XXX|lorem/i)
  expect((text.match(/„/g) ?? []).length, `${where}: Anführungszeichen paarweise`).toBe((text.match(/“/g) ?? []).length)
}

/** Alle Zahlen (de-DE, z. B. "1.000", "1,5"), die direkt vor `unit` stehen. */
function numbersBefore(text: string, unit: string): number[] {
  const escaped = unit.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return [...text.matchAll(new RegExp(`(\\d[\\d.]*(?:,\\d+)?)\\s*${escaped}(?![\\p{L}])`, 'gu'))].map((match) =>
    Number((match[1] ?? '').replace(/\./g, '').replace(',', '.')),
  )
}

describe('Kampagnen-Bibliothek', () => {
  it('hat eindeutige, stabile IDs und alle Vorlagen aus dem Plan', () => {
    const ids = BLUEPRINTS.map((blueprint) => blueprint.id)
    expect(new Set(ids).size).toBe(ids.length)
    expect(ids).toEqual(
      expect.arrayContaining(['scholar', 'body', 'alchemist', 'monk', 'earlyRiser', 'fortress', 'fellowship', 'polyglot']),
    )
    expect(new Set(BLUEPRINTS.map((blueprint) => blueprint.title)).size).toBe(BLUEPRINTS.length)
    expect(getBlueprint('scholar')?.id).toBe('scholar')
    expect(getBlueprint('gibt-es-nicht')).toBeUndefined()
  })

  it('deckt zusammen alle sechs Attribute als Haupt-Attribut einer Vorlage oder eines Pfads ab', () => {
    const primaries = new Set(
      BLUEPRINTS.flatMap((blueprint) => [blueprint.primaryAttribute, ...(blueprint.paths ?? []).map((p) => p.primaryAttribute)]),
    )
    for (const attribute of ATTRIBUTE_IDS) expect(primaries, attribute).toContain(attribute)
  })

  it('Sport-Vorlage verlangt die Wahl eines von drei Pfaden – mit genau den gewünschten Klassen', () => {
    const body = getBlueprint('body')
    expect(body?.paths?.map((path) => path.id)).toEqual(['strength', 'endurance', 'sports'])
    expect(body?.paths?.map((path) => path.label)).toEqual(['Kraftsport', 'Ausdauersport', 'Sport allgemein & Spielsport'])
    for (const path of body?.paths ?? []) expect(body?.tagline, path.label).toContain(path.label)
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

  it.each(BLUEPRINTS.map((blueprint) => [blueprint.id, blueprint] as const))('%s: Texte der Bibliothek sind sauberes Deutsch', (_id, blueprint) => {
    const texts: [string, string][] = [
      ['title', blueprint.title],
      ['tagline', blueprint.tagline],
      ['description', blueprint.description],
      ...BLUEPRINT_LEVELS.map((level): [string, string] => [`levelHints.${level}`, blueprint.levelHints[level]]),
      ...(blueprint.paths ?? []).flatMap((path): [string, string][] => [
        [`${path.id}.className`, path.className],
        [`${path.id}.label`, path.label],
        [`${path.id}.description`, path.description],
      ]),
    ]
    for (const [where, text] of texts) expectCleanGermanText(text, `${blueprint.id}.${where}`)
  })

  describe.each(cases)('$name', ({ blueprint, options, content }) => {
    const questsByKey = new Map<string, BlueprintQuest>(content.quests.map((quest) => [quest.key, quest]))
    const path = blueprint.paths?.find((candidate) => candidate.id === options.pathId)
    const primary = path?.primaryAttribute ?? blueprint.primaryAttribute
    const secondaries = path?.secondaryAttributes ?? blueprint.secondaryAttributes

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

    it('Kern-Quest (die erste) trainiert das Haupt-Attribut, jedes Neben-Attribut hat eine eigene Quest', () => {
      expect(content.quests[0]?.attribute).toBe(primary)
      const trained = new Set(content.quests.map((quest) => quest.attribute))
      for (const attribute of secondaries) expect(trained, attribute).toContain(attribute)
    })

    it('Tageslast: Einsteiger höchstens 3, Fortgeschritten höchstens 4 Pflicht-Quests an jedem Wochentag', () => {
      const max = options.level === 'beginner' ? 3 : 4
      for (const weekday of WEEKDAYS) {
        const required = content.quests.filter((quest) => requiredOnWeekday(quest.schedule, weekday)).map((quest) => quest.title)
        expect(required.length, `Wochentag ${weekday}: ${required.join(', ')}`).toBeLessThanOrEqual(max)
      }
      if (options.level === 'beginner') {
        expect(content.quests.length, 'Einsteiger starten mit höchstens 5 Quests').toBeLessThanOrEqual(5)
        expect(content.quests.filter((quest) => quest.difficulty === 'epic'), 'keine epischen Quests für Einsteiger').toEqual([])
      }
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
          expect(Number.isInteger(criterion.target), chapter.title).toBe(true)
          // Ein Zähler bis 1 wäre ein Meilenstein ("Zähler: 1 Teilnahmen …" liest sich falsch).
          expect(criterion.target, `${chapter.title}: Zähler ab 2, sonst Meilenstein`).toBeGreaterThanOrEqual(2)
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
          expect(Number.isInteger(criterion.target), chapter.title).toBe(true)
          expect(criterion.target, chapter.title).toBeLessThanOrEqual(Math.floor(max * 0.9))
        } else {
          // Streak: Tage (daily/weekdays) bzw. Wochen (weekly) – muss in die Laufzeit passen.
          expect(Number.isInteger(criterion.target), chapter.title).toBe(true)
          const unitMax =
            quest.schedule.type === 'weekly' ? Math.floor(blueprint.durationDays / 7) : maxOccurrences(quest.schedule, blueprint.durationDays)
          expect(criterion.target, chapter.title).toBeLessThanOrEqual(unitMax)
        }
      }
    })

    it('Kapitel: eindeutige Titel, keiner heißt wie eine andere Kampagne der Bibliothek', () => {
      const titles = content.chapters.map((chapter) => chapter.title)
      expect(new Set(titles).size).toBe(titles.length)
      for (const title of titles) {
        if (title === content.title) continue // Das Finale darf so heißen wie die eigene Kampagne.
        expect(CAMPAIGN_TITLES.has(title), `${title} ist auch der Name einer Kampagne`).toBe(false)
      }
    })

    it('mischt automatische Kapitel (mindestens zwei Arten) mit Meilensteinen von Hand', () => {
      const types = new Set(content.chapters.map((chapter) => chapter.criterion.type))
      expect(types).toContain('habit')
      expect(types.has('manual') || types.has('counter')).toBe(true)
      const metrics = new Set(content.chapters.flatMap((chapter) => (chapter.criterion.type === 'habit' ? [chapter.criterion.metric] : [])))
      expect(metrics.size).toBeGreaterThanOrEqual(2)
    })

    it('nach Plan: erster Erfolg in ≤ 14 Tagen, Kapitel der Reihe nach, alle automatischen mit ≥ 20 % Puffer', () => {
      const days = daysToReachAtPlanPace(content, blueprint.durationDays)
      const [first] = content.chapters
      expect(first?.criterion.type, 'das erste Kapitel zählt automatisch').toBe('habit')
      expect(days.get(first?.title ?? ''), first?.title).toBeLessThanOrEqual(14)

      const reached = content.chapters.flatMap((chapter) => (chapter.criterion.type === 'habit' ? [days.get(chapter.title)] : []))
      for (const day of reached) expect(day).toBeDefined()
      const sorted = [...reached].sort((a = 0, b = 0) => a - b)
      expect(reached, 'Kapitel sind nach voraussichtlichem Zeitpunkt geordnet').toEqual(sorted)
      expect(Math.max(...reached.map((day) => day ?? Infinity))).toBeLessThanOrEqual(Math.floor(blueprint.durationDays * 0.8))

      // Ein automatisches Schlusskapitel ist das große Ziel: ehrgeizig, mindestens die halbe Laufzeit.
      const last = content.chapters.at(-1)
      if (last?.criterion.type === 'habit') {
        const lastDay = days.get(last.title) ?? Infinity
        expect(lastDay, last.title).toBe(Math.max(...reached.map((day) => day ?? 0)))
        expect(lastDay, last.title).toBeGreaterThanOrEqual(Math.ceil(blueprint.durationDays * 0.5))
      }
    })

    it('Kapiteltexte nennen die Zielzahl, Serien die passende Einheit (Tage bzw. Wochen)', () => {
      for (const { title, description, criterion } of content.chapters) {
        if (criterion.type === 'manual') continue
        const formatted = criterion.target.toLocaleString('de-DE').replace('.', '\\.')
        expect(description, title).toMatch(new RegExp(`(^|[^\\d.])${formatted}(?![\\d.]\\d)`))
        if (criterion.type !== 'habit' || criterion.metric !== 'streak') continue
        const weekly = questsByKey.get(criterion.questKey)?.schedule.type === 'weekly'
        if (weekly) expect(description, `${title}: Wochen-Serie`).toMatch(new RegExp(`${criterion.target} Wochen`))
        else expect(description, `${title}: Tages-Serie`).not.toMatch(/Wochen in Folge/)
      }
    })

    it('Quest-Texte passen zum Tagesziel ("20 Minuten" nur bei Ziel 20 Minuten)', () => {
      for (const quest of content.quests) {
        if (!quest.measure) continue
        for (const value of numbersBefore(quest.description, quest.measure.unit)) {
          expect(value, `${quest.title}: ${quest.description}`).toBe(quest.measure.target)
        }
      }
    })

    it('Texte: Du-Form, deutsche Typografie, keine Platzhalter', () => {
      const texts: [string, string][] = [
        ['title', content.title],
        ['description', content.description],
        ['why', content.why],
        ['reward', content.reward],
        ...content.quests.flatMap((quest): [string, string][] => [
          [`${quest.key}.title`, quest.title],
          [`${quest.key}.description`, quest.description],
          ...(quest.measure ? [[`${quest.key}.unit`, quest.measure.unit] as [string, string]] : []),
        ]),
        ...content.chapters.flatMap((chapter): [string, string][] => [
          [`Kapitel ${chapter.title}`, chapter.title],
          [`Kapitel ${chapter.title}.description`, chapter.description],
          ...(chapter.criterion.type === 'counter' ? [[`Kapitel ${chapter.title}.label`, chapter.criterion.label] as [string, string]] : []),
        ]),
      ]
      for (const [where, text] of texts) expectCleanGermanText(text, where)
    })

    it('nutzt die gemeinsamen Bausteine aus shared.ts unverändert', () => {
      const level: BlueprintLevel = options.level
      const shared: BlueprintQuest[] = [waterQuest(level), stretchingQuest(level), bedtimeQuest(level), candlelightQuest()]
      for (const reference of shared) {
        const quest = content.quests.find((candidate) => candidate.title === reference.title)
        if (quest) expect(quest).toEqual(reference)
      }
      const morningLight = content.quests.find((quest) => quest.title === 'Morgenlicht-Spaziergang')
      if (morningLight) {
        expect(morningLight.schedule.type).toBe('weekly')
        if (morningLight.schedule.type === 'weekly') expect(morningLight).toEqual(morningLightQuest(morningLight.schedule.times))
      }
    })
  })

  it.each(BLUEPRINTS.flatMap((blueprint) => (blueprint.paths?.map((path) => path.id) ?? [undefined]).map((pathId) => [`${blueprint.id}${pathId ? `/${pathId}` : ''}`, blueprint, pathId] as const)))(
    '%s: Fortgeschritten ist spürbar fordernder als Einsteiger',
    (_name, blueprint, pathId) => {
      const beginner = blueprint.build(pathId ? { level: 'beginner', pathId } : { level: 'beginner' })
      const advanced = blueprint.build(pathId ? { level: 'advanced', pathId } : { level: 'advanced' })
      expect(JSON.stringify(beginner.quests), 'Stufen müssen sich unterscheiden').not.toBe(JSON.stringify(advanced.quests))

      // Jede Einsteiger-Quest gibt es auch für Fortgeschrittene – gleich gebaut, mindestens gleich oft und gleich viel.
      for (const quest of beginner.quests) {
        const counterpart = advanced.quests.find((candidate) => candidate.key === quest.key)
        expect(counterpart, quest.title).toBeDefined()
        if (!counterpart) continue
        expect(counterpart.title, quest.key).toBe(quest.title)
        expect(counterpart.schedule.type, quest.title).toBe(quest.schedule.type)
        expect(perWeek(counterpart.schedule), quest.title).toBeGreaterThanOrEqual(perWeek(quest.schedule))
        expect(counterpart.measure?.unit, quest.title).toBe(quest.measure?.unit)
        if (quest.measure) expect(counterpart.measure?.target ?? 0, quest.title).toBeGreaterThanOrEqual(quest.measure.target)
        expect(DIFFICULTIES.indexOf(counterpart.difficulty), quest.title).toBeGreaterThanOrEqual(DIFFICULTIES.indexOf(quest.difficulty))
      }

      // Mehr mögliche Quest-XP pro Woche – und beide Stufen in einem gesunden Rahmen.
      expect(weeklyQuestXp(advanced)).toBeGreaterThan(weeklyQuestXp(beginner))
      expect(weeklyQuestXp(beginner), 'Einsteiger: höchstens 500 Quest-XP pro Woche').toBeLessThanOrEqual(500)
      expect(weeklyQuestXp(advanced), 'Fortgeschritten: höchstens 750 Quest-XP pro Woche').toBeLessThanOrEqual(750)

      // Kapitel-Ziele: für jede Quest-Kennzahl bzw. jeden Zähler, den beide Stufen haben, höher oder gleich – mindestens
      // zwei davon echt höher.
      const goals = (content: BlueprintContent) => {
        const result = new Map<string, number>()
        for (const { criterion } of content.chapters) {
          if (criterion.type === 'manual') continue
          const key = criterion.type === 'habit' ? `${criterion.questKey}.${criterion.metric}` : `Zähler ${criterion.label}`
          result.set(key, Math.max(result.get(key) ?? 0, criterion.target))
        }
        return result
      }
      const beginnerGoals = goals(beginner)
      const advancedGoals = goals(advanced)
      let raised = 0
      for (const [key, target] of beginnerGoals) {
        const advancedTarget = advancedGoals.get(key)
        if (advancedTarget === undefined) continue
        expect(advancedTarget, key).toBeGreaterThanOrEqual(target)
        if (advancedTarget > target) raised++
      }
      expect(raised, 'höhere Kapitel-Ziele').toBeGreaterThanOrEqual(2)
    },
  )

  it('gleich benannte Quests sind in allen Vorlagen gleich gebaut (Icon, Attribut, Rhythmus-Typ, Einheit)', () => {
    const seen = new Map<string, { icon: string; attribute: string; scheduleType: string; unit: string | undefined; where: string }>()
    for (const { name, content } of cases) {
      for (const quest of content.quests) {
        const shape = { icon: quest.icon, attribute: quest.attribute, scheduleType: quest.schedule.type, unit: quest.measure?.unit }
        const previous = seen.get(quest.title)
        if (previous) expect({ ...shape, where: previous.where }, `${quest.title} in ${name}`).toEqual(previous)
        else seen.set(quest.title, { ...shape, where: name })
      }
    }
  })

  it('keine Beinahe-Dubletten: kein Quest-Titel steckt in einem anderen (sonst wird nicht geteilt)', () => {
    const normalize = (title: string) => title.toLocaleLowerCase('de-DE').replace(/[^\p{L}\p{N}]+/gu, ' ').trim()
    const titles = [...new Set(cases.flatMap(({ content }) => content.quests.map((quest) => quest.title)))]
    for (const a of titles) {
      for (const b of titles) {
        if (a === b) continue
        expect(` ${normalize(b)} `.includes(` ${normalize(a)} `), `„${a}“ steckt in „${b}“`).toBe(false)
      }
    }
  })

  it('jede geteilte Quest kommt aus genau einem Baustein: gleicher Titel ⇒ gleicher Schlüssel', () => {
    const keys = new Map<string, Set<string>>()
    for (const { content } of cases) {
      for (const quest of content.quests) keys.set(quest.title, (keys.get(quest.title) ?? new Set()).add(quest.key))
    }
    for (const [title, set] of keys) expect([...set], title).toHaveLength(1)
  })
})
