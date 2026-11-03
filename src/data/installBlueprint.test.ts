/**
 * Kampagnen aus der Bibliothek starten: `createCampaignFromBlueprint`, `installBlueprint`, `startAdventure` –
 * für jede Vorlage, jede Stufe und jeden Pfad, inklusive geteilter Quests und Limit.
 */
import 'fake-indexeddb/auto'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { BALANCING } from '../domain/balancing'
import { CAMPAIGN_LIMIT_MESSAGE, campaignSlotsLeft, countActiveCampaigns } from '../domain/campaigns'
import { addDays, dayRange } from '../domain/dates'
import { deriveGameState, evaluateMainQuests } from '../domain/engine'
import { habitTarget, isArchivedOn } from '../domain/schedule'
import type { Completion, DayKey, GameData, Habit, MainQuest, MainQuestState } from '../domain/types'
import { createBackup, parseBackup } from './backup'
import { BLUEPRINTS, getBlueprint } from './blueprints'
import { BLUEPRINT_LEVELS } from './blueprints/types'
import type { BlueprintContent, BlueprintOptions, CampaignBlueprint } from './blueprints/types'
import { QuestlogDB } from './db'
import {
  archiveMainQuest,
  completionId,
  createHabit,
  createMainQuest,
  loadGameData,
  setChapterCounter,
  setChapterManual,
} from './repository'
import { createCampaignFromBlueprint, installBlueprint, startAdventure } from './seed'

const TODAY = '2026-11-03'

let database: QuestlogDB
let dbCounter = 0

beforeEach(async () => {
  database = new QuestlogDB(`questlog-test-blueprints-${++dbCounter}`)
  await database.open()
})

afterEach(async () => {
  vi.restoreAllMocks()
  await database.delete()
})

/** Alle gültigen Optionen einer Vorlage (jede Stufe × jeder Pfad). */
function allOptions(blueprint: CampaignBlueprint): BlueprintOptions[] {
  const paths = blueprint.paths?.map((path) => path.id) ?? [undefined]
  return BLUEPRINT_LEVELS.flatMap((level) => paths.map((pathId) => (pathId ? { level, pathId } : { level })))
}

function label(blueprint: CampaignBlueprint, options: BlueprintOptions): string {
  return `${blueprint.id} · ${options.level}${options.pathId ? ` · ${options.pathId}` : ''}`
}

const cases = BLUEPRINTS.flatMap((blueprint) =>
  allOptions(blueprint).map((options) => ({ name: label(blueprint, options), blueprint, options })),
)

function titlesOf(content: BlueprintContent): string[] {
  return content.quests.map((quest) => quest.title)
}

function stateOf(data: GameData, questId: string, day: DayKey = TODAY): MainQuestState {
  const state = evaluateMainQuests(data, day).find((candidate) => candidate.quest.id === questId)
  if (!state) throw new Error(`Kampagne ${questId} fehlt`)
  return state
}

function linkedTitles(data: GameData, questId: string): string[] {
  const byId = new Map(data.habits.map((habit) => [habit.id, habit]))
  return stateOf(data, questId).linkedHabitIds.map((id) => byId.get(id)?.title ?? `?${id}`)
}

/**
 * Schließt alle Kapitel einer Kampagne ab: manuelle abhaken, Zähler aufs Ziel, und für Quest-Kapitel jeden Tag
 * von Start bis `end` (doppelter Zielwert) erledigen.
 */
async function completeCampaign(quest: MainQuest, end: DayKey): Promise<void> {
  const data = await loadGameData(database)
  const habitsById = new Map(data.habits.map((habit) => [habit.id, habit]))
  const completions = new Map<string, Completion>()
  for (const chapter of quest.chapters) {
    const { criterion } = chapter
    if (criterion.type === 'manual') await setChapterManual(quest.id, chapter.id, true, quest.startDay, database)
    else if (criterion.type === 'counter') await setChapterCounter(quest.id, chapter.id, criterion.target, quest.startDay, database)
    else {
      const habit = habitsById.get(criterion.habitId)
      if (!habit) throw new Error(`Quest ${criterion.habitId} fehlt`)
      for (const day of dayRange(quest.startDay, end)) completions.set(completionId(habit.id, day), completionFor(habit, day))
    }
  }
  await database.completions.bulkPut([...completions.values()])
}

function completionFor(habit: Habit, day: DayKey): Completion {
  return {
    id: completionId(habit.id, day),
    habitId: habit.id,
    day,
    value: habit.measure ? habit.measure.target * 2 : 1,
    target: habitTarget(habit),
    difficulty: habit.difficulty,
    attribute: habit.attribute,
    updatedAt: 0,
  }
}

function endOf(blueprint: CampaignBlueprint): DayKey {
  return addDays(TODAY, blueprint.durationDays + 14)
}

// ---------------------------------------------------------------------------

describe('Bibliothek für die Tests', () => {
  it('enthält alle Vorlagen aus dem Plan', () => {
    expect(BLUEPRINTS.map((blueprint) => blueprint.id)).toEqual(
      expect.arrayContaining(['scholar', 'body', 'alchemist', 'monk', 'earlyRiser', 'fortress', 'fellowship', 'polyglot']),
    )
    expect(cases.length).toBeGreaterThanOrEqual(BLUEPRINTS.length * 2)
  })
})

describe.each(cases)('createCampaignFromBlueprint – $name', ({ blueprint, options }) => {
  it('übernimmt Quests, Kapitel und Texte der Vorlage mit neuen IDs', () => {
    const content = blueprint.build(options)
    const { mainQuest, habits } = createCampaignFromBlueprint(blueprint, options, TODAY, 77)

    expect(mainQuest).toMatchObject({
      title: content.title,
      icon: content.icon,
      why: content.why,
      reward: content.reward,
      startDay: TODAY,
      deadline: addDays(TODAY, blueprint.durationDays),
      blueprint: options.pathId
        ? { id: blueprint.id, level: options.level, pathId: options.pathId }
        : { id: blueprint.id, level: options.level },
      createdAt: 77,
    })
    expect(mainQuest.blueprint).toStrictEqual(
      options.pathId ? { id: blueprint.id, level: options.level, pathId: options.pathId } : { id: blueprint.id, level: options.level },
    )
    expect(mainQuest.description ?? '').toBe(content.description.trim() === '' ? '' : content.description)
    expect(mainQuest.archived).toBeUndefined()
    expect(mainQuest.sharedHabitIds).toBeUndefined()

    // Quests: gleiche Inhalte, verknüpft, ab heute aktiv, Reihenfolge 0..n-1, eindeutige IDs.
    expect(habits).toHaveLength(content.quests.length)
    habits.forEach((habit, index) => {
      const quest = content.quests[index]
      const expected: Habit = {
        id: habit.id,
        icon: quest.icon,
        title: quest.title,
        description: quest.description,
        attribute: quest.attribute,
        difficulty: quest.difficulty,
        schedule: quest.schedule,
        mainQuestId: mainQuest.id,
        order: index,
        createdDay: TODAY,
      }
      if (quest.measure) expected.measure = quest.measure
      expect(habit).toStrictEqual(expected)
      // Kopien, keine geteilten Objekte mit der Vorlage.
      expect(habit.schedule).not.toBe(quest.schedule)
    })
    expect(new Set([mainQuest.id, ...habits.map((habit) => habit.id)]).size).toBe(habits.length + 1)

    // Kapitel: gleiche Texte, frische IDs, Quest-Kapitel verweisen auf die erzeugte Quest mit dem Schlüssel.
    const idByKey = new Map(content.quests.map((quest, index) => [quest.key, habits[index].id]))
    expect(mainQuest.chapters).toHaveLength(content.chapters.length)
    mainQuest.chapters.forEach((chapter, index) => {
      const source = content.chapters[index]
      expect(chapter.title).toBe(source.title)
      expect(chapter.description).toBe(source.description)
      expect(Object.keys(chapter).every((key) => ['id', 'title', 'description', 'criterion'].includes(key))).toBe(true)
      const { criterion } = source
      if (criterion.type === 'habit') {
        expect(chapter.criterion).toStrictEqual({
          type: 'habit',
          habitId: idByKey.get(criterion.questKey),
          metric: criterion.metric,
          target: criterion.target,
        })
      } else {
        expect(chapter.criterion).toStrictEqual(criterion)
      }
    })
    expect(new Set(mainQuest.chapters.map((chapter) => chapter.id)).size).toBe(mainQuest.chapters.length)
  })

  it('erzeugt bei jedem Aufruf neue IDs', () => {
    const first = createCampaignFromBlueprint(blueprint, options, TODAY)
    const second = createCampaignFromBlueprint(blueprint, options, TODAY)
    expect(second.mainQuest.id).not.toBe(first.mainQuest.id)
    expect(second.habits[0].id).not.toBe(first.habits[0].id)
    expect(second.mainQuest.chapters[0].id).not.toBe(first.mainQuest.chapters[0].id)
  })
})

describe('createCampaignFromBlueprint – Stufe & Pfad', () => {
  const withPaths = BLUEPRINTS.filter((blueprint) => (blueprint.paths ?? []).length > 0)
  const withoutPaths = BLUEPRINTS.filter((blueprint) => (blueprint.paths ?? []).length === 0)

  it('die Sport-Vorlage hat Pfade, die übrigen nicht unbedingt', () => {
    expect(withPaths.map((blueprint) => blueprint.id)).toContain('body')
    expect(withoutPaths.length).toBeGreaterThan(0)
  })

  it.each(withPaths.map((blueprint) => [blueprint.id, blueprint] as const))(
    '%s: verlangt einen bekannten Pfad',
    (_id, blueprint) => {
      expect(() => createCampaignFromBlueprint(blueprint, { level: 'beginner' }, TODAY)).toThrow('Bitte wähle einen Pfad.')
      expect(() => createCampaignFromBlueprint(blueprint, { level: 'advanced', pathId: '' }, TODAY)).toThrow(
        'Bitte wähle einen Pfad.',
      )
      expect(() => createCampaignFromBlueprint(blueprint, { level: 'beginner', pathId: 'quidditch' }, TODAY)).toThrow(
        'Unbekannter Pfad.',
      )
    },
  )

  it.each(withoutPaths.map((blueprint) => [blueprint.id, blueprint] as const))(
    '%s: ohne Pfade wird ein pathId ignoriert',
    (_id, blueprint) => {
      const { mainQuest } = createCampaignFromBlueprint(blueprint, { level: 'advanced', pathId: 'strength' }, TODAY)
      expect(mainQuest.blueprint).toStrictEqual({ id: blueprint.id, level: 'advanced' })
    },
  )

  it('lehnt unbekannte Stufen und ungültige Tage ab', () => {
    const [blueprint] = withoutPaths
    expect(() => createCampaignFromBlueprint(blueprint, { level: 'expert' as 'beginner' }, TODAY)).toThrow('Unbekannte Stufe.')
    expect(() => createCampaignFromBlueprint(blueprint, { level: 'beginner' }, '2026-02-30')).toThrow()
  })

  it('Einsteiger und Fortgeschritten unterscheiden sich in den Startwerten', () => {
    const body = getBlueprint('body')
    if (!body) throw new Error('Sport-Vorlage fehlt')
    const beginner = createCampaignFromBlueprint(body, { level: 'beginner', pathId: 'strength' }, TODAY)
    const advanced = createCampaignFromBlueprint(body, { level: 'advanced', pathId: 'strength' }, TODAY)
    const shape = (habits: Habit[]) => habits.map(({ title, schedule, measure }) => ({ title, schedule, measure }))
    expect(shape(advanced.habits)).not.toEqual(shape(beginner.habits))
    expect(advanced.mainQuest.blueprint?.level).toBe('advanced')
  })
})

describe.each(cases)('installBlueprint – $name', ({ blueprint, options }) => {
  it('speichert Kampagne und Quests in einer leeren Datenbank', async () => {
    const content = blueprint.build(options)
    const quest = await installBlueprint(blueprint.id, options, TODAY, database)
    const data = await loadGameData(database)

    expect(data.mainQuests).toStrictEqual([quest])
    expect(quest.blueprint).toMatchObject({ id: blueprint.id, level: options.level })
    expect(quest.blueprint?.pathId).toBe(options.pathId)
    expect(data.habits.map((habit) => habit.title)).toEqual(titlesOf(content))
    expect(data.habits.map((habit) => habit.order)).toEqual(content.quests.map((_, index) => index))
    expect(data.habits.every((habit) => habit.mainQuestId === quest.id && habit.createdDay === TODAY)).toBe(true)

    // Alle Quests gehören zur Kampagne, Kapitel verweisen auf existierende Quests, nichts ist schon erreicht.
    const state = stateOf(data, quest.id)
    expect(state.linkedHabitIds).toEqual(data.habits.map((habit) => habit.id))
    expect(state.chapters.some((chapter) => chapter.brokenReference)).toBe(false)
    expect(state.complete).toBe(false)
    expect(countActiveCampaigns(data, TODAY)).toBe(1)
    expect(deriveGameState(data, TODAY).level.totalXp).toBe(0)

    // Die gespeicherten Daten sind ein gültiges Backup.
    expect(parseBackup(JSON.parse(JSON.stringify(await createBackup(new Date(), database)))).ok).toBe(true)
  })

  it('ist in der Laufzeit abschließbar – und gibt dann ihren Platz frei', async () => {
    const quest = await installBlueprint(blueprint.id, options, TODAY, database)
    const end = endOf(blueprint)
    await completeCampaign(quest, end)
    const data = await loadGameData(database)
    const state = stateOf(data, quest.id, end)
    expect(state.chapters.filter((chapter) => !chapter.done).map((chapter) => chapter.chapter.title)).toEqual([])
    expect(state.complete).toBe(true)
    expect(campaignSlotsLeft(data, end)).toBe(BALANCING.maxActiveCampaigns)
  })
})

describe('installBlueprint – Fehler', () => {
  it('unbekannte Vorlage', async () => {
    await expect(installBlueprint('gibt-es-nicht', { level: 'beginner' }, TODAY, database)).rejects.toThrow(
      'Diese Vorlage gibt es nicht.',
    )
  })

  it('fehlender oder unbekannter Pfad – nichts wird gespeichert', async () => {
    await expect(installBlueprint('body', { level: 'beginner' }, TODAY, database)).rejects.toThrow('Bitte wähle einen Pfad.')
    await expect(installBlueprint('body', { level: 'beginner', pathId: 'quidditch' }, TODAY, database)).rejects.toThrow(
      'Unbekannter Pfad.',
    )
    const data = await loadGameData(database)
    expect(data.mainQuests).toEqual([])
    expect(data.habits).toEqual([])
  })

  it('ungültiger Tag', async () => {
    await expect(installBlueprint('scholar', { level: 'beginner' }, '2026-13-01', database)).rejects.toThrow('Ungültiges Datum')
  })

  it('dieselbe Vorlage läuft schon (auch mit anderer Stufe oder anderem Pfad)', async () => {
    await installBlueprint('body', { level: 'beginner', pathId: 'strength' }, TODAY, database)
    const before = await loadGameData(database)
    await expect(installBlueprint('body', { level: 'advanced', pathId: 'endurance' }, TODAY, database)).rejects.toThrow(
      'Diese Kampagne läuft bereits.',
    )
    await expect(installBlueprint('body', { level: 'beginner', pathId: 'strength' }, TODAY, database)).rejects.toThrow(
      'Diese Kampagne läuft bereits.',
    )
    expect(await loadGameData(database)).toEqual(before)
  })

  it('nach dem Beenden kann dieselbe Vorlage neu starten – ihre weiterlaufenden Quests gehen an die neue', async () => {
    const first = await installBlueprint('scholar', { level: 'beginner' }, TODAY, database)
    await archiveMainQuest(first.id, TODAY, {}, database)
    const later = addDays(TODAY, 30)
    const second = await installBlueprint('scholar', { level: 'advanced' }, later, database)
    const data = await loadGameData(database)
    const advanced = getBlueprint('scholar')?.build({ level: 'advanced' })
    // Gleich benannte Quests werden übernommen (neu zugeordnet), nur fehlende kommen hinzu.
    const titles = data.habits.map((habit) => habit.title)
    expect(new Set(titles).size).toBe(titles.length)
    for (const title of advanced ? titlesOf(advanced) : []) {
      expect(data.habits.find((habit) => habit.title === title)?.mainQuestId, title).toBe(second.id)
    }
    expect(second.sharedHabitIds).toBeUndefined()
    expect(stateOf(data, second.id, later).linkedHabitIds).toHaveLength(advanced?.quests.length ?? -1)
  })

  it('eine gemeisterte (nicht archivierte) Kampagne blockiert ihre Vorlage nicht', async () => {
    const scholar = getBlueprint('scholar')
    if (!scholar) throw new Error('Gelehrten-Vorlage fehlt')
    const first = await installBlueprint('scholar', { level: 'beginner' }, TODAY, database)
    await completeCampaign(first, endOf(scholar))
    await expect(installBlueprint('scholar', { level: 'advanced' }, endOf(scholar), database)).resolves.toMatchObject({
      blueprint: { id: 'scholar', level: 'advanced' },
    })
  })
})

describe('installBlueprint – Limit aktiver Kampagnen', () => {
  const ids = ['scholar', 'monk', 'polyglot', 'fortress']
  const optionsFor = (id: string): BlueprintOptions => {
    const blueprint = getBlueprint(id)
    const pathId = blueprint?.paths?.[0]?.id
    return pathId ? { level: 'beginner', pathId } : { level: 'beginner' }
  }

  it(`die ${BALANCING.maxActiveCampaigns + 1}. Kampagne scheitert, ohne etwas zu speichern`, async () => {
    for (const id of ids.slice(0, BALANCING.maxActiveCampaigns)) await installBlueprint(id, optionsFor(id), TODAY, database)
    const before = await loadGameData(database)
    expect(campaignSlotsLeft(before, TODAY)).toBe(0)
    await expect(installBlueprint(ids[3], optionsFor(ids[3]), TODAY, database)).rejects.toThrow(CAMPAIGN_LIMIT_MESSAGE)
    expect(await loadGameData(database)).toEqual(before)
    // Auch eigene Kampagnen zählen zum Limit.
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date(2026, 10, 3, 12, 0, 0))
    try {
      await expect(
        createMainQuest({ title: 'Eigene', icon: '🏔️', why: '', reward: '', startDay: TODAY, chapters: [] }, database),
      ).rejects.toThrow(CAMPAIGN_LIMIT_MESSAGE)
    } finally {
      vi.useRealTimers()
    }
  })

  it('eigene Kampagnen belegen Plätze genauso', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date(2026, 10, 3, 12, 0, 0))
    try {
      for (let i = 0; i < BALANCING.maxActiveCampaigns; i++) {
        await createMainQuest({ title: `Eigene ${i}`, icon: '🏔️', why: '', reward: '', startDay: TODAY, chapters: [] }, database)
      }
    } finally {
      vi.useRealTimers()
    }
    await expect(installBlueprint('scholar', { level: 'beginner' }, TODAY, database)).rejects.toThrow(CAMPAIGN_LIMIT_MESSAGE)
  })

  it('Beenden (Archivieren) einer Kampagne gibt einen Platz frei', async () => {
    const installed = []
    for (const id of ids.slice(0, BALANCING.maxActiveCampaigns)) installed.push(await installBlueprint(id, optionsFor(id), TODAY, database))
    await archiveMainQuest(installed[1].id, TODAY, { archiveQuests: true }, database)
    await expect(installBlueprint(ids[3], optionsFor(ids[3]), TODAY, database)).resolves.toMatchObject({
      blueprint: { id: ids[3] },
    })
  })

  it('Abschließen einer Kampagne gibt einen Platz frei', async () => {
    const installed = []
    for (const id of ids.slice(0, BALANCING.maxActiveCampaigns)) installed.push(await installBlueprint(id, optionsFor(id), TODAY, database))
    const scholar = getBlueprint('scholar')
    if (!scholar) throw new Error('Gelehrten-Vorlage fehlt')
    const end = endOf(scholar)
    await completeCampaign(installed[0], end)
    const data = await loadGameData(database)
    expect(stateOf(data, installed[0].id, end).complete).toBe(true)
    expect(campaignSlotsLeft(data, end)).toBe(1)
    await expect(installBlueprint(ids[3], optionsFor(ids[3]), end, database)).resolves.toMatchObject({ blueprint: { id: ids[3] } })
    await expect(installBlueprint('body', { level: 'beginner', pathId: 'sports' }, end, database)).rejects.toThrow(
      CAMPAIGN_LIMIT_MESSAGE,
    )
  })
})

/** Für jedes geordnete Paar verschiedener Vorlagen die erste Kombination von Optionen mit gemeinsamen Quests. */
const sharingPairs = BLUEPRINTS.flatMap((first) =>
  BLUEPRINTS.filter((second) => second.id !== first.id).flatMap((second) => {
    for (const firstOptions of allOptions(first)) {
      for (const secondOptions of allOptions(second)) {
        const firstTitles = new Set(titlesOf(first.build(firstOptions)))
        const shared = titlesOf(second.build(secondOptions)).filter((title) => firstTitles.has(title))
        if (shared.length > 0) {
          return [{ name: `${label(first, firstOptions)} → ${label(second, secondOptions)}`, first, firstOptions, second, secondOptions, shared }]
        }
      }
    }
    return []
  }),
)

describe('Geteilte Quests', () => {
  it('Vorlagen teilen sich Quests (z. B. „Wasser trinken“)', () => {
    expect(sharingPairs.length).toBeGreaterThan(0)
  })

  it.each(sharingPairs)('$name: gleiche Quests werden geteilt statt verdoppelt', async ({ first, firstOptions, second, secondOptions, shared }) => {
    const a = await installBlueprint(first.id, firstOptions, TODAY, database)
    const b = await installBlueprint(second.id, secondOptions, TODAY, database)
    const data = await loadGameData(database)

    const titles = data.habits.filter((habit) => !isArchivedOn(habit, TODAY)).map((habit) => habit.title)
    expect(new Set(titles).size, 'keine doppelten Quests').toBe(titles.length)
    const union = new Set([...titlesOf(first.build(firstOptions)), ...titlesOf(second.build(secondOptions))])
    expect(titles.length).toBe(union.size)

    const secondContent = second.build(secondOptions)
    for (const title of shared) {
      const habit = data.habits.find((candidate) => candidate.title === title)
      expect(habit?.mainQuestId, title).toBe(a.id)
      expect(b.sharedHabitIds, title).toContain(habit?.id)
      // Kapitel der zweiten Kampagne, die auf diese Quest zählen, verweisen auf die vorhandene Quest.
      const key = secondContent.quests.find((quest) => quest.title === title)?.key
      secondContent.chapters.forEach((chapter, index) => {
        if (chapter.criterion.type !== 'habit' || chapter.criterion.questKey !== key) return
        const criterion = b.chapters[index].criterion
        expect(criterion.type === 'habit' ? criterion.habitId : undefined, chapter.title).toBe(habit?.id)
      })
    }
    // Beide Kampagnen zeigen alle ihre Quests – die geteilten in beiden.
    expect(linkedTitles(data, a.id).sort()).toEqual(titlesOf(first.build(firstOptions)).sort())
    expect(linkedTitles(data, b.id).sort()).toEqual(titlesOf(secondContent).sort())
    expect(stateOf(data, b.id).chapters.some((chapter) => chapter.brokenReference)).toBe(false)
  })

  it('Alchemist + Körper: „Wasser trinken“ gibt es einmal, beide Kampagnen nutzen es', async () => {
    const body = getBlueprint('body')
    const alchemist = getBlueprint('alchemist')
    if (!body || !alchemist) throw new Error('Vorlage fehlt')
    const bodyOptions = allOptions(body).find((options) => titlesOf(body.build(options)).includes('Wasser trinken'))
    const alchemistOptions = allOptions(alchemist).find((options) => titlesOf(alchemist.build(options)).includes('Wasser trinken'))
    if (!bodyOptions || !alchemistOptions) throw new Error('„Wasser trinken“ fehlt in einer der Vorlagen')

    const first = await installBlueprint('alchemist', alchemistOptions, TODAY, database)
    const second = await installBlueprint('body', bodyOptions, TODAY, database)
    const data = await loadGameData(database)
    const water = data.habits.filter((habit) => habit.title === 'Wasser trinken')
    expect(water).toHaveLength(1)
    const [habit] = water
    expect(habit.mainQuestId).toBe(first.id)
    const state = deriveGameState(data, TODAY)
    for (const campaign of state.mainQuests) expect(campaign.linkedHabitIds, campaign.quest.title).toContain(habit.id)
    // (Reihenfolge egal: beide können in derselben Millisekunde entstehen, createdAt ist dann gleich.)
    expect(state.mainQuests.map((campaign) => campaign.quest.id).sort()).toEqual([first.id, second.id].sort())
    // Wer „Wasser trinken“ in Kapiteln nutzt, verweist auf genau diese Quest.
    const pairs = [
      { stored: first, content: alchemist.build(alchemistOptions) },
      { stored: second, content: body.build(bodyOptions) },
    ]
    for (const { stored, content } of pairs) {
      const waterKey = content.quests.find((quest) => quest.title === 'Wasser trinken')?.key
      content.chapters.forEach((chapter, index) => {
        if (chapter.criterion.type !== 'habit' || chapter.criterion.questKey !== waterKey) return
        expect(stored.chapters[index].criterion, chapter.title).toMatchObject({ type: 'habit', habitId: habit.id })
      })
    }
    // Die Einstellungen der vorhandenen Quest bleiben (die zweite Vorlage überschreibt nichts).
    const fromAlchemist = createCampaignFromBlueprint(alchemist, alchemistOptions, TODAY).habits.find((h) => h.title === 'Wasser trinken')
    expect(habit.measure).toStrictEqual(fromAlchemist?.measure)

    // Beenden des Alchemisten samt Quests: „Wasser trinken“ läuft für den Körper weiter.
    await archiveMainQuest(first.id, TODAY, { archiveQuests: true }, database)
    expect((await database.habits.get(habit.id))?.archivedDay).toBeUndefined()
  })

  it('vorhandene eigene Quests: nicht zugeordnete werden übernommen, archivierte nicht', async () => {
    const draft = { icon: '💧', attribute: 'vitality', difficulty: 'easy', schedule: { type: 'daily' } } as const
    const own = await createHabit({ ...draft, title: ' Wasser trinken ', measure: { target: 3, unit: 'L' } }, TODAY, database)
    const stretchOld = await createHabit({ ...draft, title: 'Dehnen & Mobilität' }, '2026-10-01', database)
    await database.habits.update(stretchOld.id, { archivedDay: '2026-10-15' })
    const quest = await installBlueprint('body', { level: 'advanced', pathId: 'strength' }, TODAY, database)
    const data = await loadGameData(database)
    const content = getBlueprint('body')?.build({ level: 'advanced', pathId: 'strength' })
    const usesWater = content?.quests.some((q) => q.title === 'Wasser trinken') === true
    const water = data.habits.filter((habit) => habit.title.trim() === 'Wasser trinken')
    expect(water).toHaveLength(1)
    if (usesWater) {
      expect(water[0]).toMatchObject({ id: own.id, mainQuestId: quest.id, measure: { target: 3, unit: 'L' } })
    }
    // Die archivierte Quest bleibt im Archiv; die Vorlage bekommt (falls sie sie nutzt) eine neue.
    expect((await database.habits.get(stretchOld.id))?.mainQuestId).toBeUndefined()
    if (content?.quests.some((q) => q.title === 'Dehnen & Mobilität')) {
      const fresh = data.habits.filter((habit) => habit.title === 'Dehnen & Mobilität' && habit.id !== stretchOld.id)
      expect(fresh).toHaveLength(1)
      expect(fresh[0].mainQuestId).toBe(quest.id)
      expect(fresh[0].order).toBeGreaterThan(Math.max(own.order, stretchOld.order))
    }
  })

  it('bei mehreren Kandidaten gewinnt eine nicht zugeordnete Quest', async () => {
    const owner = await installBlueprint('scholar', { level: 'beginner' }, TODAY, database)
    const draft = { icon: '🕯️', attribute: 'wisdom', difficulty: 'medium', schedule: { type: 'daily' } } as const
    const free = await createHabit({ ...draft, title: 'Kerzenlicht statt Bildschirm' }, TODAY, database)
    const monk = getBlueprint('monk')
    const options = monk ? allOptions(monk).find((o) => titlesOf(monk.build(o)).includes('Kerzenlicht statt Bildschirm')) : undefined
    if (!options) return // Der Mönch nutzt die Quest (noch) nicht – nichts zu prüfen.
    const second = await installBlueprint('monk', options, TODAY, database)
    expect((await database.habits.get(free.id))?.mainQuestId).toBe(second.id)
    expect(second.sharedHabitIds ?? []).not.toContain(free.id)
    const data = await loadGameData(database)
    expect(data.habits.filter((habit) => habit.title === 'Kerzenlicht statt Bildschirm' && habit.mainQuestId === owner.id)).toHaveLength(1)
  })
})

describe('startAdventure mit Vorlage', () => {
  const hero = { name: ' Aria ', avatar: '🧝', createdDay: TODAY }

  it('legt Profil und die gewählte Kampagne (mit Klasse) gemeinsam an', async () => {
    await startAdventure(hero, { blueprintId: 'body', options: { level: 'advanced', pathId: 'endurance' } }, TODAY, database)
    const data = await loadGameData(database)
    expect(data.profile).toStrictEqual({ name: 'Aria', avatar: '🧝', createdDay: TODAY })
    expect(data.mainQuests).toHaveLength(1)
    expect(data.mainQuests[0].blueprint).toStrictEqual({ id: 'body', level: 'advanced', pathId: 'endurance' })
    const content = getBlueprint('body')?.build({ level: 'advanced', pathId: 'endurance' })
    expect(data.habits.map((habit) => habit.title)).toEqual(content ? titlesOf(content) : [])
  })

  it('null: nur das Profil', async () => {
    await startAdventure(hero, null, TODAY, database)
    const data = await loadGameData(database)
    expect(data.profile?.name).toBe('Aria')
    expect(data.mainQuests).toEqual([])
    expect(data.habits).toEqual([])
  })

  it('ungültige Wahl: Fehler, nichts gespeichert (auch kein Profil)', async () => {
    await expect(startAdventure(hero, { blueprintId: 'body', options: { level: 'beginner' } }, TODAY, database)).rejects.toThrow(
      'Bitte wähle einen Pfad.',
    )
    await expect(startAdventure(hero, { blueprintId: 'nope', options: { level: 'beginner' } }, TODAY, database)).rejects.toThrow(
      'Diese Vorlage gibt es nicht.',
    )
    const data = await loadGameData(database)
    expect(data.profile).toBeUndefined()
    expect(data.mainQuests).toEqual([])
    expect(data.habits).toEqual([])
  })

  it('schlägt das Profil fehl, bleibt auch keine Kampagne zurück', async () => {
    vi.spyOn(database.kv, 'put').mockRejectedValueOnce(new Error('Festplatte voll'))
    await expect(
      startAdventure(hero, { blueprintId: 'monk', options: { level: 'beginner' } }, TODAY, database),
    ).rejects.toThrow('Festplatte voll')
    const data = await loadGameData(database)
    expect(data.mainQuests).toEqual([])
    expect(data.habits).toEqual([])
  })
})
