import 'fake-indexeddb/auto'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { GameData, Habit } from '../domain/types'
import { createBackup, parseBackup } from './backup'
import { QuestlogDB } from './db'
import { archiveHabit, createHabit, createMainQuest, deleteMainQuest, loadGameData, updateHabit } from './repository'
import { createScholarCampaign, installScholarCampaign, startAdventure } from './seed'

const TODAY = '2026-11-03'

let database: QuestlogDB
let dbCounter = 0

beforeEach(async () => {
  database = new QuestlogDB(`questlog-test-seed-${++dbCounter}`)
  await database.open()
})

afterEach(async () => {
  vi.restoreAllMocks()
  await database.delete()
})

/** Felder einer Quest ohne die zufälligen bzw. kontextabhängigen Werte. */
function shape(habit: Habit) {
  const { id: _id, mainQuestId: _mainQuestId, ...rest } = habit
  return rest
}

describe('createScholarCampaign', () => {
  it('erzeugt die Kampagne "Der Weg des Gelehrten"', () => {
    const { mainQuest } = createScholarCampaign(TODAY, 1234)
    expect(mainQuest).toStrictEqual({
      id: mainQuest.id,
      icon: '📚',
      title: 'Der Weg des Gelehrten',
      description: 'Ein Jahr voller Bücher: Aus kleinen täglichen Leseeinheiten wird ein belesener Geist.',
      why: 'Ich will mehr wissen, klarer denken und Geschichten in mir tragen.',
      reward: 'Eine wunderschöne Ausgabe meines Lieblingsbuchs',
      startDay: TODAY,
      deadline: '2027-11-03',
      chapters: mainQuest.chapters,
      createdAt: 1234,
    })
  })

  it('setzt die Deadline auf heute + 365 Tage (auch über Schaltjahre)', () => {
    expect(createScholarCampaign('2026-11-03').mainQuest.deadline).toBe('2027-11-03')
    expect(createScholarCampaign('2027-03-01').mainQuest.deadline).toBe('2028-02-29')
  })

  it('erzeugt fünf verknüpfte Quests mit den vorgesehenen Werten', () => {
    const { mainQuest, habits } = createScholarCampaign(TODAY)
    expect(habits.map(shape)).toStrictEqual([
      {
        icon: '📖',
        title: 'Täglich lesen',
        description: '10 Seiten in deinem aktuellen Buch.',
        attribute: 'intellect',
        difficulty: 'medium',
        schedule: { type: 'daily' },
        measure: { target: 10, unit: 'Seiten' },
        order: 0,
        createdDay: TODAY,
      },
      {
        icon: '🕯️',
        title: 'Kerzenlicht statt Bildschirm',
        description: '30 Minuten vor dem Schlafen kein Handy – lieber ein Buch.',
        attribute: 'wisdom',
        difficulty: 'medium',
        schedule: { type: 'daily' },
        order: 1,
        createdDay: TODAY,
      },
      {
        icon: '✍️',
        title: 'Gedanke des Tages',
        description: 'Ein Zitat oder eine Erkenntnis aus dem Gelesenen notieren.',
        attribute: 'wisdom',
        difficulty: 'easy',
        schedule: { type: 'daily' },
        order: 2,
        createdDay: TODAY,
      },
      {
        icon: '⏳',
        title: 'Tiefenlese-Session',
        description: '30 Minuten am Stück lesen, ohne Ablenkung.',
        attribute: 'intellect',
        difficulty: 'hard',
        schedule: { type: 'weekly', times: 3 },
        order: 3,
        createdDay: TODAY,
      },
      {
        icon: '🗣️',
        title: 'Bücher-Gespräch',
        description: 'Mit jemandem über ein Buch sprechen oder eine Empfehlung teilen.',
        attribute: 'charisma',
        difficulty: 'medium',
        schedule: { type: 'weekly', times: 1 },
        order: 4,
        createdDay: TODAY,
      },
    ])
    for (const habit of habits) expect(habit.mainQuestId).toBe(mainQuest.id)
    expect(new Set(habits.map((h) => h.id)).size).toBe(5)
  })

  it('erzeugt sechs Kapitel, deren Quest-Verweise auf die erzeugten Quests zeigen', () => {
    const { mainQuest, habits } = createScholarCampaign(TODAY)
    const [reading, , thought] = habits
    const chapters = mainQuest.chapters

    expect(chapters.map(({ title, description, criterion }) => ({ title, description, criterion }))).toStrictEqual([
      {
        title: 'Der erste Funke',
        description: 'Lies an 7 Tagen deine 10 Seiten.',
        criterion: { type: 'habit', habitId: reading.id, metric: 'completions', target: 7 },
      },
      {
        title: 'Das erste Buch',
        description: 'Beende dein erstes Buch – egal wie dick.',
        criterion: { type: 'manual' },
      },
      {
        title: 'Die Gewohnheit erwacht',
        description: '21 Tage am Stück lesen. Jetzt sitzt die Gewohnheit.',
        criterion: { type: 'habit', habitId: reading.id, metric: 'streak', target: 21 },
      },
      {
        title: 'Der Gedankensammler',
        description: 'Sammle 50 Gedanken des Tages.',
        criterion: { type: 'habit', habitId: thought.id, metric: 'completions', target: 50 },
      },
      {
        title: 'Tausend Seiten',
        description: 'Lies insgesamt 1.000 Seiten.',
        criterion: { type: 'habit', habitId: reading.id, metric: 'total', target: 1000 },
      },
      {
        title: 'Der Gelehrte',
        description: 'Beende 12 Bücher.',
        criterion: { type: 'counter', target: 12, label: 'Bücher beendet' },
      },
    ])

    // Kapitel starten unberührt und haben eindeutige IDs.
    for (const chapter of chapters) {
      expect(Object.keys(chapter).sort()).toEqual(['criterion', 'description', 'id', 'title'])
    }
    expect(new Set(chapters.map((c) => c.id)).size).toBe(6)

    const habitIds = new Set(habits.map((h) => h.id))
    for (const { criterion } of chapters) {
      if (criterion.type === 'habit') expect(habitIds.has(criterion.habitId)).toBe(true)
    }
  })

  it('erzeugt bei jedem Aufruf neue IDs', () => {
    const first = createScholarCampaign(TODAY)
    const second = createScholarCampaign(TODAY)
    expect(second.mainQuest.id).not.toBe(first.mainQuest.id)
    expect(second.habits[0].id).not.toBe(first.habits[0].id)
  })

  it('wirft bei ungültigem Tag', () => {
    expect(() => createScholarCampaign('2026-02-30')).toThrow()
  })
})

describe('installScholarCampaign', () => {
  it('speichert Kampagne und Quests in einer leeren Datenbank', async () => {
    await installScholarCampaign(TODAY, database)
    const data = await loadGameData(database)

    expect(data.mainQuests).toHaveLength(1)
    const [quest] = data.mainQuests
    expect(quest.title).toBe('Der Weg des Gelehrten')
    expect(data.habits.map((h) => h.title)).toEqual([
      'Täglich lesen',
      'Kerzenlicht statt Bildschirm',
      'Gedanke des Tages',
      'Tiefenlese-Session',
      'Bücher-Gespräch',
    ])
    expect(data.habits.map((h) => h.order)).toEqual([0, 1, 2, 3, 4])
    for (const habit of data.habits) expect(habit.mainQuestId).toBe(quest.id)

    // Die gespeicherten Daten sind gültig im Sinne des Backup-Schemas.
    expect(parseBackup(JSON.parse(JSON.stringify(await createBackup(new Date(), database)))).ok).toBe(true)
  })

  it('hängt die Quests hinter vorhandene an und lässt diese unverändert', async () => {
    const draft = { icon: '🏃', attribute: 'strength', difficulty: 'easy', schedule: { type: 'daily' } } as const
    const first = await createHabit({ ...draft, title: 'Laufen' }, TODAY, database)
    const second = await createHabit({ ...draft, title: 'Dehnen' }, TODAY, database)
    const archived = await createHabit({ ...draft, title: 'Alt' }, TODAY, database)
    await archiveHabit(archived.id, TODAY, database)
    const before = await loadGameData(database)

    await installScholarCampaign(TODAY, database)

    const data = await loadGameData(database)
    expect(data.habits.slice(0, 3)).toStrictEqual(before.habits)
    expect(data.habits.map((h) => h.id).slice(0, 3)).toEqual([first.id, second.id, archived.id])
    expect(data.habits.slice(3).map((h) => h.order)).toEqual([3, 4, 5, 6, 7])
    expect(data.habits.slice(3).map((h) => h.title)[0]).toBe('Täglich lesen')
  })
})

/** Alle Quest-IDs, auf die Kapitel der Kampagne zählen. */
function chapterHabitIds(data: GameData, questId: string): string[] {
  const quest = data.mainQuests.find((q) => q.id === questId)
  return (quest?.chapters ?? []).flatMap((c) => (c.criterion.type === 'habit' ? [c.criterion.habitId] : []))
}

describe('installScholarCampaign – erneut nach dem Löschen der Kampagne', () => {
  it('verknüpft die verwaisten Vorlage-Quests neu, statt sie zu verdoppeln', async () => {
    await installScholarCampaign(TODAY, database)
    const first = await loadGameData(database)
    await deleteMainQuest(first.mainQuests[0].id, database)

    await installScholarCampaign('2026-11-10', database)
    const data = await loadGameData(database)
    expect(data.mainQuests).toHaveLength(1)
    const [quest] = data.mainQuests
    expect(data.habits).toHaveLength(5)
    // Dieselben Quests (mit ihrem Verlauf), nun mit der neuen Kampagne verknüpft.
    expect(data.habits.map((h) => h.id)).toEqual(first.habits.map((h) => h.id))
    expect(data.habits.every((h) => h.mainQuestId === quest.id)).toBe(true)
    expect(data.habits.map((h) => h.createdDay)).toEqual(first.habits.map(() => TODAY))
    const ids = new Set(data.habits.map((h) => h.id))
    expect(chapterHabitIds(data, quest.id).every((id) => ids.has(id))).toBe(true)
    expect(chapterHabitIds(data, quest.id)).toHaveLength(4)
    expect(deriveChaptersBroken(data)).toBe(false)
  })

  it('ergänzt nur fehlende Quests (hinter den vorhandenen); archivierte und umbenannte werden nicht übernommen', async () => {
    await installScholarCampaign(TODAY, database)
    const first = await loadGameData(database)
    const [reading, candle, thought] = first.habits
    await deleteMainQuest(first.mainQuests[0].id, database)
    // „Täglich lesen“ archiviert, „Kerzenlicht …“ umbenannt, „Gedanke des Tages“ mit Leerzeichen.
    await archiveHabit(reading.id, TODAY, database)
    await updateHabit(candle.id, { title: 'Abends offline' }, TODAY, database)
    await database.habits.update(thought.id, { title: '  Gedanke des Tages ' })

    await installScholarCampaign(TODAY, database)
    const data = await loadGameData(database)
    const quest = data.mainQuests[0]
    const linked = data.habits.filter((h) => h.mainQuestId === quest.id)
    expect(linked.map((h) => h.title).sort()).toEqual(
      ['  Gedanke des Tages ', 'Bücher-Gespräch', 'Kerzenlicht statt Bildschirm', 'Tiefenlese-Session', 'Täglich lesen'].sort(),
    )
    expect(linked.find((h) => h.title === '  Gedanke des Tages ')?.id).toBe(thought.id)
    // Die archivierte Lese-Quest bleibt unverknüpft im Archiv; eine neue übernimmt.
    expect(data.habits.find((h) => h.id === reading.id)?.mainQuestId).toBeUndefined()
    const newReading = linked.find((h) => h.title === 'Täglich lesen')
    expect(newReading?.id).not.toBe(reading.id)
    // Neue Quests stehen hinter allen vorhandenen.
    const maxOld = Math.max(...first.habits.map((h) => h.order))
    expect(linked.filter((h) => !first.habits.some((o) => o.id === h.id)).map((h) => h.order)).toEqual([
      maxOld + 1,
      maxOld + 2,
    ])
    // Kapitel zählen auf existierende, verknüpfte Quests.
    const linkedIds = new Set(linked.map((h) => h.id))
    expect(chapterHabitIds(data, quest.id).every((id) => linkedIds.has(id))).toBe(true)
    expect(chapterHabitIds(data, quest.id)).toContain(newReading?.id)
    expect(chapterHabitIds(data, quest.id)).toContain(thought.id)
  })

  it('übernimmt keine Quests, die mit einer anderen Kampagne verknüpft sind', async () => {
    const other = await createMainQuest(
      { title: 'Eigene', icon: '🏃', why: '', reward: '', startDay: TODAY, chapters: [] },
      database,
    )
    const own = await createHabit(
      { title: 'Täglich lesen', icon: '📕', attribute: 'intellect', difficulty: 'easy', schedule: { type: 'daily' }, mainQuestId: other.id },
      TODAY,
      database,
    )
    await installScholarCampaign(TODAY, database)
    const data = await loadGameData(database)
    expect(data.habits).toHaveLength(6)
    expect(data.habits.find((h) => h.id === own.id)?.mainQuestId).toBe(other.id)
  })
})

/** Hat irgendein Kapitel eine kaputte Quest-Referenz? */
function deriveChaptersBroken(data: GameData): boolean {
  const ids = new Set(data.habits.map((h) => h.id))
  return data.mainQuests.some((q) => q.chapters.some((c) => c.criterion.type === 'habit' && !ids.has(c.criterion.habitId)))
}

describe('startAdventure', () => {
  const hero = { name: '  Aria  ', avatar: '', createdDay: TODAY }

  it('legt Profil und (auf Wunsch) die Vorlage gemeinsam an', async () => {
    await startAdventure(hero, 'scholar', TODAY, database)
    const data = await loadGameData(database)
    expect(data.profile).toStrictEqual({ name: 'Aria', avatar: '🧙', createdDay: TODAY })
    expect(data.mainQuests).toHaveLength(1)
    expect(data.habits).toHaveLength(5)
    expect(data.habits.every((h) => h.mainQuestId === data.mainQuests[0].id)).toBe(true)
  })

  it('ohne Vorlage: nur das Profil', async () => {
    await startAdventure(hero, 'none', TODAY, database)
    const data = await loadGameData(database)
    expect(data.profile?.name).toBe('Aria')
    expect(data.mainQuests).toEqual([])
    expect(data.habits).toEqual([])
  })

  it('schlägt das Speichern des Profils fehl, bleibt nichts zurück – ein neuer Versuch startet sauber', async () => {
    const put = vi.spyOn(database.kv, 'put').mockRejectedValueOnce(new DOMException('Quota exceeded', 'QuotaExceededError'))
    await expect(startAdventure(hero, 'scholar', TODAY, database)).rejects.toThrow('Quota exceeded')
    let data = await loadGameData(database)
    expect(data.profile).toBeUndefined()
    expect(data.mainQuests).toEqual([])
    expect(data.habits).toEqual([])
    expect(put).toHaveBeenCalledTimes(1)

    // Erneut mit Vorlage: genau eine Kampagne mit fünf Quests.
    await startAdventure(hero, 'scholar', TODAY, database)
    data = await loadGameData(database)
    expect(data.mainQuests).toHaveLength(1)
    expect(data.habits).toHaveLength(5)
  })

  it('nach einem Fehlschlag mit Vorlage startet „Ohne Vorlage“ wirklich leer', async () => {
    vi.spyOn(database.kv, 'put').mockRejectedValueOnce(new Error('Festplatte voll'))
    await expect(startAdventure(hero, 'scholar', TODAY, database)).rejects.toThrow('Festplatte voll')
    await startAdventure(hero, 'none', TODAY, database)
    const data = await loadGameData(database)
    expect(data.profile?.name).toBe('Aria')
    expect(data.mainQuests).toEqual([])
    expect(data.habits).toEqual([])
  })

  it('lehnt einen leeren Namen ab, ohne etwas anzulegen', async () => {
    await expect(startAdventure({ ...hero, name: '   ' }, 'scholar', TODAY, database)).rejects.toThrow(
      'Bitte gib deinem Helden einen Namen.',
    )
    const data = await loadGameData(database)
    expect(data.profile).toBeUndefined()
    expect(data.habits).toEqual([])
    expect(data.mainQuests).toEqual([])
  })
})
