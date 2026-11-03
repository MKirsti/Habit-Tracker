/**
 * Inhaltliche Prüfung der Vorlagen für Geist & Miteinander – "Der Weg des Gelehrten", "Die Festung", "Die Gefährten"
 * und "Der Polyglotte" – über die allgemeinen Regeln in `blueprints.test.ts` hinaus: Belastung je Stufe, Tempo der
 * Kapitel (mit der echten Kapitel-Auswertung durchgespielt), Zahlen in den Texten, Stufen-Steigerung und die
 * Besonderheiten der einzelnen Vorlagen (Gelehrter = frühere Kampagne, sprachneutraler Polyglotter …).
 */
import { describe, expect, it } from 'vitest'
import { addDays, dayRange, isoWeekday } from '../../domain/dates'
import { isRequiredOn } from '../../domain/schedule'
import type { Habit } from '../../domain/types'
import { fellowshipBlueprint } from './fellowship'
import { fortressBlueprint } from './fortress'
import { daysToReachAtPlanPace, isEveryDay, PLAN_START } from './planPace'
import { polyglotBlueprint } from './polyglot'
import { scholarBlueprint } from './scholar'
import { candlelightQuest } from './shared'
import { BLUEPRINT_LEVELS } from './types'
import type { CampaignBlueprint } from './types'

const BLUEPRINTS: CampaignBlueprint[] = [scholarBlueprint, fortressBlueprint, fellowshipBlueprint, polyglotBlueprint]

const START = PLAN_START

const cases = BLUEPRINTS.flatMap((blueprint) =>
  BLUEPRINT_LEVELS.map((level) => ({ name: `${blueprint.id} · ${level}`, blueprint, level, content: blueprint.build({ level }) })),
)

describe.each(cases)('$name', ({ blueprint, level, content }) => {
  const primary = blueprint.primaryAttribute

  it('Einsteiger: höchstens 3 tägliche Quests · Fortgeschritten: 4–6 Quests', () => {
    const everyDay = content.quests.filter((quest) => isEveryDay(quest.schedule))
    if (level === 'beginner') expect(everyDay.length).toBeLessThanOrEqual(3)
    else expect(content.quests.length).toBeGreaterThanOrEqual(4)
    expect(content.quests.length).toBeLessThanOrEqual(6)
  })

  it('Kern-Quest trainiert das Haupt-Attribut, jedes Neben-Attribut hat eine eigene Quest', () => {
    expect(content.quests[0]?.attribute).toBe(primary)
    const trained = new Set(content.quests.map((quest) => quest.attribute))
    for (const attribute of blueprint.secondaryAttributes) expect(trained, attribute).toContain(attribute)
  })

  it('mischt automatische Kapitel mit Meilensteinen von Hand (manuell oder Zähler)', () => {
    const types = new Set(content.chapters.map((chapter) => chapter.criterion.type))
    expect(types).toContain('habit')
    expect(types.has('manual') || types.has('counter')).toBe(true)
    const metrics = new Set(content.chapters.flatMap((chapter) => (chapter.criterion.type === 'habit' ? [chapter.criterion.metric] : [])))
    expect(metrics.size).toBeGreaterThanOrEqual(2)
    expect(new Set(content.chapters.map((chapter) => chapter.title)).size).toBe(content.chapters.length)
  })

  it('nennt in Kapiteltexten genau die Zielzahl des Kriteriums', () => {
    for (const { title, description, criterion } of content.chapters) {
      if (criterion.type === 'manual') continue
      const formatted = criterion.target.toLocaleString('de-DE').replace('.', '\\.')
      expect(description, title).toMatch(new RegExp(`(^|[^\\d.])${formatted}(?![\\d.]\\d)`))
    }
  })

  it('nach Plan: erster Erfolg in ≤ 14 Tagen, Kapitel der Reihe nach, das letzte automatische mit ≥ 20 % Puffer', () => {
    const days = daysToReachAtPlanPace(content, blueprint.durationDays)
    const [first] = content.chapters
    expect(first?.criterion.type).toBe('habit')
    expect(days.get(first?.title ?? '')).toBeLessThanOrEqual(14)

    const reached = content.chapters.flatMap((chapter) => (chapter.criterion.type === 'habit' ? [days.get(chapter.title)] : []))
    for (const day of reached) expect(day).toBeDefined()
    const sorted = [...reached].sort((a = 0, b = 0) => a - b)
    expect(reached, 'Kapitel sind nach voraussichtlichem Zeitpunkt geordnet').toEqual(sorted)
    expect(Math.max(...reached.map((day) => day ?? Infinity))).toBeLessThanOrEqual(Math.floor(blueprint.durationDays * 0.8))
  })

  // Der Gelehrte endet (wie die frühere Kampagne) mit dem Bücher-Zähler; die neuen Vorlagen mit einem großen
  // automatischen Ziel, das mindestens die halbe Laufzeit braucht.
  it.skipIf(blueprint.id === 'scholar')('das letzte Kapitel ist das große automatische Ziel (≥ halbe Laufzeit nach Plan)', () => {
    const days = daysToReachAtPlanPace(content, blueprint.durationDays)
    const last = content.chapters.at(-1)
    expect(last?.criterion.type).toBe('habit')
    const lastDay = days.get(last?.title ?? '') ?? Infinity
    expect(lastDay).toBe(Math.max(...[...days.values()].map((day) => day ?? 0)))
    expect(lastDay).toBeGreaterThanOrEqual(Math.ceil(blueprint.durationDays * 0.5))
  })

  it('Texte: Du-Form, deutsche Anführungszeichen, keine Platzhalter', () => {
    const texts = [
      content.description,
      content.why,
      content.reward,
      ...content.quests.flatMap((quest) => [quest.title, quest.description]),
      ...content.chapters.flatMap((chapter) => [chapter.title, chapter.description]),
    ]
    for (const text of texts) {
      expect(text, text).not.toMatch(/\b(Sie|Ihnen|Ihr|Ihre|Ihren|Ihrem|Ihrer)\b/)
      expect(text, text).not.toMatch(/["…]|\.\.\.|TODO/)
      expect(text.trim(), text).toBe(text)
    }
  })
})

describe('Stufen', () => {
  it.each(BLUEPRINTS.map((blueprint) => [blueprint.id, blueprint] as const))(
    '%s: Fortgeschritten ist in allem mindestens so fordernd wie Einsteiger',
    (_id, blueprint) => {
      const beginner = blueprint.build({ level: 'beginner' })
      const advanced = blueprint.build({ level: 'advanced' })
      expect(advanced.quests.length).toBeGreaterThanOrEqual(beginner.quests.length)
      for (const quest of beginner.quests) {
        const counterpart = advanced.quests.find((candidate) => candidate.title === quest.title)
        expect(counterpart, quest.title).toBeDefined()
        if (!counterpart) continue
        expect(counterpart.key, quest.title).toBe(quest.key)
        expect(counterpart.schedule.type, quest.title).toBe(quest.schedule.type)
        if (quest.measure) {
          expect(counterpart.measure?.unit, quest.title).toBe(quest.measure.unit)
          expect(counterpart.measure?.target ?? 0, quest.title).toBeGreaterThanOrEqual(quest.measure.target)
        }
        if (quest.schedule.type === 'weekly' && counterpart.schedule.type === 'weekly') {
          expect(counterpart.schedule.times, quest.title).toBeGreaterThanOrEqual(quest.schedule.times)
        }
      }
      let raised = 0
      for (const chapter of beginner.chapters) {
        const counterpart = advanced.chapters.find((candidate) => candidate.title === chapter.title)
        if (!counterpart || chapter.criterion.type === 'manual' || counterpart.criterion.type === 'manual') continue
        expect(counterpart.criterion.type, chapter.title).toBe(chapter.criterion.type)
        if (chapter.criterion.type === 'habit' && counterpart.criterion.type === 'habit') {
          expect(counterpart.criterion.metric, chapter.title).toBe(chapter.criterion.metric)
        }
        expect(counterpart.criterion.target, chapter.title).toBeGreaterThanOrEqual(chapter.criterion.target)
        if (counterpart.criterion.target > chapter.criterion.target) raised++
      }
      expect(raised, 'höhere Kapitel-Ziele').toBeGreaterThanOrEqual(3)
    },
  )

  it('Hinweise nennen die Startwerte der Stufe', () => {
    const hints = (blueprint: CampaignBlueprint) => blueprint.levelHints
    expect(hints(scholarBlueprint).beginner).toContain('10 Seiten')
    expect(hints(scholarBlueprint).advanced).toContain('25 Seiten')
    expect(hints(fortressBlueprint).beginner).toContain('10 Minuten')
    expect(hints(fortressBlueprint).advanced).toContain('15 Minuten')
    expect(hints(fellowshipBlueprint).beginner).toContain('3 Komplimente')
    expect(hints(fellowshipBlueprint).advanced).toContain('5 Komplimente')
    expect(hints(polyglotBlueprint).beginner).toContain('10 Minuten Vokabeln')
    expect(hints(polyglotBlueprint).advanced).toContain('20 Minuten Vokabeln')
  })
})

describe('Der Weg des Gelehrten', () => {
  it('Einsteiger ist exakt die frühere Vorlage-Kampagne (bestehende Spielstände verlassen sich darauf)', () => {
    expect(scholarBlueprint.durationDays).toBe(365)
    expect(scholarBlueprint.build({ level: 'beginner' })).toStrictEqual({
      title: 'Der Weg des Gelehrten',
      icon: '📚',
      description: 'Ein Jahr voller Bücher: Aus kleinen täglichen Leseeinheiten wird ein belesener Geist.',
      why: 'Ich will mehr wissen, klarer denken und Geschichten in mir tragen.',
      reward: 'Eine wunderschöne Ausgabe meines Lieblingsbuchs',
      quests: [
        {
          key: 'reading',
          icon: '📖',
          title: 'Täglich lesen',
          description: '10 Seiten in deinem aktuellen Buch.',
          attribute: 'intellect',
          difficulty: 'medium',
          schedule: { type: 'daily' },
          measure: { target: 10, unit: 'Seiten' },
        },
        candlelightQuest(),
        {
          key: 'thought',
          icon: '✍️',
          title: 'Gedanke des Tages',
          description: 'Ein Zitat oder eine Erkenntnis aus dem Gelesenen notieren.',
          attribute: 'wisdom',
          difficulty: 'easy',
          schedule: { type: 'daily' },
        },
        {
          key: 'deepReading',
          icon: '⏳',
          title: 'Tiefenlese-Session',
          description: '30 Minuten am Stück lesen, ohne Ablenkung.',
          attribute: 'intellect',
          difficulty: 'hard',
          schedule: { type: 'weekly', times: 3 },
        },
        {
          key: 'bookTalk',
          icon: '🗣️',
          title: 'Bücher-Gespräch',
          description: 'Mit jemandem über ein Buch sprechen oder eine Empfehlung teilen.',
          attribute: 'charisma',
          difficulty: 'medium',
          schedule: { type: 'weekly', times: 1 },
        },
      ],
      chapters: [
        { title: 'Der erste Funke', description: 'Lies an 7 Tagen deine 10 Seiten.', criterion: { type: 'habit', questKey: 'reading', metric: 'completions', target: 7 } },
        { title: 'Das erste Buch', description: 'Beende dein erstes Buch – egal wie dick.', criterion: { type: 'manual' } },
        { title: 'Die Gewohnheit erwacht', description: '21 Tage am Stück lesen. Jetzt sitzt die Gewohnheit.', criterion: { type: 'habit', questKey: 'reading', metric: 'streak', target: 21 } },
        { title: 'Der Gedankensammler', description: 'Sammle 50 Gedanken des Tages.', criterion: { type: 'habit', questKey: 'thought', metric: 'completions', target: 50 } },
        { title: 'Tausend Seiten', description: 'Lies insgesamt 1.000 Seiten.', criterion: { type: 'habit', questKey: 'reading', metric: 'total', target: 1000 } },
        { title: 'Der Gelehrte', description: 'Beende 12 Bücher.', criterion: { type: 'counter', target: 12, label: 'Bücher beendet' } },
      ],
    })
  })

  it('teilt „Kerzenlicht statt Bildschirm“ unverändert mit dem Mönch', () => {
    for (const level of BLUEPRINT_LEVELS) {
      expect(scholarBlueprint.build({ level }).quests.find((quest) => quest.title === 'Kerzenlicht statt Bildschirm')).toEqual(candlelightQuest())
    }
  })

  it('Fortgeschritten: gleiche Geschichte in sechs Kapiteln, 25 Seiten am Tag und 4 Tiefenlese-Sessions pro Woche', () => {
    const beginner = scholarBlueprint.build({ level: 'beginner' })
    const advanced = scholarBlueprint.build({ level: 'advanced' })
    expect(advanced.chapters).toHaveLength(6)
    expect(advanced.chapters.map((chapter) => chapter.criterion.type)).toEqual(beginner.chapters.map((chapter) => chapter.criterion.type))
    expect(advanced.quests.find((quest) => quest.key === 'reading')?.measure).toEqual({ target: 25, unit: 'Seiten' })
    expect(advanced.quests.find((quest) => quest.key === 'deepReading')?.schedule).toEqual({ type: 'weekly', times: 4 })
    expect(advanced.chapters.at(-1)?.criterion).toEqual({ type: 'counter', target: 24, label: 'Bücher beendet' })
  })
})

describe('Die Festung', () => {
  it('die Wochenplanung ist nur sonntags Pflicht', () => {
    for (const level of BLUEPRINT_LEVELS) {
      const quest = fortressBlueprint.build({ level }).quests.find((candidate) => candidate.key === 'weeklyPlan')
      if (!quest) throw new Error('weeklyPlan fehlt')
      const habit: Habit = { ...quest, id: 'plan', order: 0, createdDay: START }
      for (const day of dayRange(START, addDays(START, 13))) expect(isRequiredOn(habit, day), day).toBe(isoWeekday(day) === 7)
    }
  })

  it('verbindet Ordnung und Finanzen: Notgroschen und Budget als Meilensteine in beiden Stufen', () => {
    for (const level of BLUEPRINT_LEVELS) {
      const { chapters } = fortressBlueprint.build({ level })
      const manual = chapters.filter((chapter) => chapter.criterion.type === 'manual').map((chapter) => chapter.description)
      expect(manual.some((text) => text.includes('Notgroschen') || text.includes('Notfälle')), level).toBe(true)
      expect(manual.some((text) => /budget/i.test(text)), level).toBe(true)
    }
  })
})

describe('Die Gefährten', () => {
  it('Komplimente sind eine Wochenquest – Tage ohne Begegnung brechen nichts', () => {
    expect(fellowshipBlueprint.build({ level: 'beginner' }).quests.find((quest) => quest.key === 'compliment')?.schedule).toEqual({ type: 'weekly', times: 3 })
    expect(fellowshipBlueprint.build({ level: 'advanced' }).quests.find((quest) => quest.key === 'compliment')?.schedule).toEqual({ type: 'weekly', times: 5 })
  })

  it('zählt wiederbelebte alte Kontakte von Hand', () => {
    for (const level of BLUEPRINT_LEVELS) {
      const counter = fellowshipBlueprint.build({ level }).chapters.find((chapter) => chapter.criterion.type === 'counter')
      expect(counter?.criterion, level).toMatchObject({ type: 'counter', label: 'Alte Kontakte wiederbelebt' })
    }
  })
})

describe('Der Polyglott', () => {
  it('ist sprachneutral: Quests und Kapitel nennen keine bestimmte Sprache', () => {
    const languages = /Englisch|Spanisch|Französisch|Italienisch|Japanisch|Schwedisch|Chinesisch|Portugiesisch|Russisch|Türkisch|Arabisch/
    for (const level of BLUEPRINT_LEVELS) {
      const { quests, chapters } = polyglotBlueprint.build({ level })
      for (const text of [...quests, ...chapters].flatMap((item) => [item.title, item.description])) expect(text).not.toMatch(languages)
    }
  })

  it('misst Vokabeln in Minuten – 10 bzw. 20 am Tag – und zählt sie fürs große Ziel zusammen', () => {
    for (const [level, target] of [['beginner', 10], ['advanced', 20]] as const) {
      const content = polyglotBlueprint.build({ level })
      expect(content.quests[0]).toMatchObject({ key: 'vocab', title: 'Vokabeln lernen', schedule: { type: 'daily' }, measure: { target, unit: 'Minuten' } })
      expect(content.chapters.at(-1)?.criterion).toMatchObject({ type: 'habit', questKey: 'vocab', metric: 'total' })
    }
  })
})
