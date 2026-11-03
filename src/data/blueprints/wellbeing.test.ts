/**
 * Inhaltliche Prüfung der drei Wohlfühl-Vorlagen – "Der Alchemist" (Ernährung), "Der stille Mönch" (Ruhe & Schlaf)
 * und "Der Frühaufsteher" – über die allgemeinen Regeln in `blueprints.test.ts` hinaus: Belastung je Stufe, Tempo
 * der Kapitel (mit der echten Kapitel-Auswertung durchgespielt), Zahlen in den Texten, geteilte Quests und die
 * Werktags-Serie des Frühaufstehers.
 */
import { describe, expect, it } from 'vitest'
import { addDays, dayRange, isoWeekday } from '../../domain/dates'
import { describeSchedule, isRequiredOn } from '../../domain/schedule'
import { streakReachedDay } from '../../domain/streaks'
import type { Habit } from '../../domain/types'
import { alchemistBlueprint } from './alchemist'
import { earlyRiserBlueprint } from './earlyRiser'
import { monkBlueprint } from './monk'
import { daysToReachAtPlanPace, isEveryDay, PLAN_START } from './planPace'
import { bedtimeQuest, candlelightQuest, morningLightQuest, stretchingQuest, waterQuest } from './shared'
import { BLUEPRINT_LEVELS } from './types'
import type { BlueprintContent, BlueprintLevel, BlueprintQuest, CampaignBlueprint } from './types'

const BLUEPRINTS: CampaignBlueprint[] = [alchemistBlueprint, monkBlueprint, earlyRiserBlueprint]

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

  it('nach Plan: erster Erfolg in ≤ 14 Tagen, Kapitel der Reihe nach, das letzte mit ≥ 20 % Puffer', () => {
    const days = daysToReachAtPlanPace(content, blueprint.durationDays)
    const [first] = content.chapters
    expect(first?.criterion.type).toBe('habit')
    expect(days.get(first?.title ?? '')).toBeLessThanOrEqual(14)

    const reached = content.chapters.flatMap((chapter) => (chapter.criterion.type === 'habit' ? [days.get(chapter.title)] : []))
    for (const day of reached) expect(day).toBeDefined()
    const sorted = [...reached].sort((a = 0, b = 0) => a - b)
    expect(reached, 'Kapitel sind nach voraussichtlichem Zeitpunkt geordnet').toEqual(sorted)

    const last = content.chapters.at(-1)
    expect(last?.criterion.type, 'das letzte Kapitel ist das große automatische Ziel').toBe('habit')
    const lastDay = days.get(last?.title ?? '') ?? Infinity
    expect(lastDay).toBe(Math.max(...reached.map((day) => day ?? 0)))
    expect(lastDay).toBeLessThanOrEqual(Math.floor(blueprint.durationDays * 0.8))
    // Ambitioniert: Das große Ziel braucht mindestens die Hälfte der Laufzeit.
    expect(lastDay).toBeGreaterThanOrEqual(Math.ceil(blueprint.durationDays * 0.5))
  })

  it('nutzt geteilte Quests unverändert (gleicher Titel ⇒ gleiche Quest)', () => {
    const shared: BlueprintQuest[] = [
      waterQuest(level),
      stretchingQuest(level),
      bedtimeQuest(level),
      candlelightQuest(),
    ]
    for (const reference of shared) {
      const quest = content.quests.find((candidate) => candidate.title === reference.title)
      if (quest) expect(quest).toEqual(reference)
    }
    const morningLight = content.quests.find((quest) => quest.title === 'Morgenlicht-Spaziergang')
    if (morningLight?.schedule.type === 'weekly') expect(morningLight).toEqual(morningLightQuest(morningLight.schedule.times))
    else expect(morningLight).toBeUndefined()
  })
})

describe('Stufen', () => {
  it.each(BLUEPRINTS.map((blueprint) => [blueprint.id, blueprint] as const))(
    '%s: Fortgeschritten hat mehr Quests und höhere Ziele als Einsteiger',
    (_id, blueprint) => {
      const beginner = blueprint.build({ level: 'beginner' })
      const advanced = blueprint.build({ level: 'advanced' })
      expect(advanced.quests.length).toBeGreaterThan(beginner.quests.length)
      for (const quest of beginner.quests) {
        const counterpart = advanced.quests.find((candidate) => candidate.title === quest.title)
        expect(counterpart, quest.title).toBeDefined()
        if (!counterpart) continue
        expect(counterpart.schedule.type, quest.title).toBe(quest.schedule.type)
        if (quest.measure) expect(counterpart.measure?.target ?? 0, quest.title).toBeGreaterThanOrEqual(quest.measure.target)
        if (quest.schedule.type === 'weekly' && counterpart.schedule.type === 'weekly') {
          expect(counterpart.schedule.times, quest.title).toBeGreaterThanOrEqual(quest.schedule.times)
        }
      }
      for (const chapter of beginner.chapters) {
        const counterpart = advanced.chapters.find((candidate) => candidate.title === chapter.title)
        if (!counterpart || chapter.criterion.type === 'manual' || counterpart.criterion.type === 'manual') continue
        expect(counterpart.criterion.target, chapter.title).toBeGreaterThan(chapter.criterion.target)
      }
    },
  )

  it('Hinweise nennen die Startwerte der Stufe', () => {
    expect(alchemistBlueprint.levelHints.beginner).toContain('3 Portionen')
    expect(alchemistBlueprint.levelHints.advanced).toContain('5 Portionen')
    expect(monkBlueprint.levelHints.beginner).toContain('5 Minuten')
    expect(monkBlueprint.levelHints.advanced).toContain('15 Minuten')
    expect(earlyRiserBlueprint.levelHints.beginner).toContain('vor 7:00 Uhr')
    expect(earlyRiserBlueprint.levelHints.advanced).toContain('vor 6:00 Uhr')
  })
})

describe('Der Frühaufsteher', () => {
  const wakeUp = (level: BlueprintLevel) => earlyRiserBlueprint.build({ level }).quests.find((quest) => quest.key === 'wakeUp')

  it('Einsteiger: nur Weckzeit, Routine und Schlafenszeit – an Werktagen genau drei Pflicht-Quests', () => {
    const { quests } = earlyRiserBlueprint.build({ level: 'beginner' })
    expect(quests.map((quest) => quest.key)).toEqual(['wakeUp', 'routine', 'bedtime'])
    const habits = quests.map((quest, order): Habit => ({ ...quest, id: quest.key, order, createdDay: START }))
    for (const day of dayRange(START, addDays(START, 6))) {
      expect(habits.filter((habit) => isRequiredOn(habit, day)).length, day).toBe(isoWeekday(day) <= 5 ? 3 : 2)
    }
    // Der Tagesplan kommt erst auf der Fortgeschrittenen-Stufe dazu.
    expect(earlyRiserBlueprint.build({ level: 'advanced' }).quests.map((quest) => quest.key)).toContain('dayPlan')
  })

  it('weckt Einsteiger Mo–Fr, Fortgeschrittene jeden Tag – mit demselben Rhythmus-Typ', () => {
    expect(wakeUp('beginner')?.schedule).toEqual({ type: 'weekdays', days: [1, 2, 3, 4, 5] })
    expect(wakeUp('advanced')?.schedule).toEqual({ type: 'weekdays', days: [1, 2, 3, 4, 5, 6, 7] })
    expect(describeSchedule(wakeUp('beginner')?.schedule ?? { type: 'daily' })).toBe('Mo, Di, Mi, Do, Fr')
    expect(describeSchedule(wakeUp('advanced')?.schedule ?? { type: 'weekdays', days: [1] })).toBe('Täglich')
  })

  it('Einsteiger-Serie zählt Werktage: das Wochenende bricht sie nicht, 21 Morgen sind nach 4 Wochen erreicht', () => {
    const quest = wakeUp('beginner')
    if (!quest) throw new Error('wakeUp fehlt')
    const monday = '2026-11-02'
    const habit: Habit = { ...quest, id: 'wake', order: 0, createdDay: monday }
    const end = addDays(monday, 60)
    const workdays = dayRange(monday, end).filter((day) => isoWeekday(day) <= 5)
    for (const day of dayRange(monday, end)) expect(isRequiredOn(habit, day), day).toBe(isoWeekday(day) <= 5)
    expect(streakReachedDay(habit, new Set(workdays), 21, end)).toBe('2026-11-30')
  })

  it('schläft rechtzeitig: 7,5 Stunden zwischen Schlafenszeit und Wecker', () => {
    expect(bedtimeQuest('beginner').description).toContain('23:30')
    expect(wakeUp('beginner')?.description).toContain('7:00')
    expect(bedtimeQuest('advanced').description).toContain('22:30')
    expect(wakeUp('advanced')?.description).toContain('6:00')
  })
})

describe('Der stille Mönch', () => {
  it('teilt Kerzenlicht mit dem Gelehrten, Schlafenszeit und Morgenlicht mit dem Frühaufsteher', () => {
    const monk = monkBlueprint.build({ level: 'advanced' })
    const earlyRiser = earlyRiserBlueprint.build({ level: 'advanced' })
    const titles = (content: BlueprintContent) => content.quests.map((quest) => quest.title)
    expect(titles(monk)).toContain('Kerzenlicht statt Bildschirm')
    expect(titles(monk).filter((title) => titles(earlyRiser).includes(title)).sort()).toEqual(['Morgenlicht-Spaziergang', 'Rechtzeitig ins Bett'])
  })

  it('der handyfreie Tag ist eine Wochenquest – nie Pflicht, der Tag ist frei wählbar', () => {
    for (const level of BLUEPRINT_LEVELS) {
      const quest = monkBlueprint.build({ level }).quests.find((candidate) => candidate.key === 'phoneFreeDay')
      if (!quest) throw new Error('phoneFreeDay fehlt')
      expect(quest.schedule).toEqual({ type: 'weekly', times: 1 })
      const habit: Habit = { ...quest, id: 'phone-free', order: 0, createdDay: START }
      for (const day of dayRange(START, addDays(START, 13))) expect(isRequiredOn(habit, day), day).toBe(false)
    }
  })
})

describe('Der Alchemist', () => {
  it('zählt Gemüse & Obst in Portionen – 3 bzw. „5 am Tag“', () => {
    for (const [level, target] of [['beginner', 3], ['advanced', 5]] as const) {
      const produce = alchemistBlueprint.build({ level }).quests[0]
      expect(produce).toMatchObject({ title: 'Gemüse & Obst', attribute: 'vitality', schedule: { type: 'daily' }, measure: { target, unit: 'Portionen' } })
    }
  })
})
