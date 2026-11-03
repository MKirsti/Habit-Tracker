/**
 * Mehrere Kampagnen: Limit aktiver Kampagnen, Beenden (Archivieren) und Zurückholen – samt Quests –, Herkunft
 * (`blueprint`) und geteilte Quests (`sharedHabitIds`) in Repository und Backup.
 */
import 'fake-indexeddb/auto'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { BALANCING } from '../domain/balancing'
import { CAMPAIGN_LIMIT_MESSAGE, CAMPAIGN_RESTORE_LIMIT_MESSAGE, countActiveCampaigns } from '../domain/campaigns'
import { addDays } from '../domain/dates'
import { deriveGameState } from '../domain/engine'
import type { Chapter, DayKey, GameState, MainQuest } from '../domain/types'
import { createBackup, parseBackup, restoreBackup } from './backup'
import { QuestlogDB } from './db'
import {
  archiveHabit,
  archiveMainQuest,
  createHabit,
  createMainQuest,
  loadGameData,
  restoreMainQuest,
  setChapterManual,
  setCompletionValue,
  updateMainQuest,
  type HabitDraft,
  type MainQuestDraft,
} from './repository'

const DAY = '2026-11-03'

let database: QuestlogDB
let dbCounter = 0

beforeEach(async () => {
  database = new QuestlogDB(`questlog-test-campaigns-${++dbCounter}`)
  await database.open()
  // createMainQuest/updateMainQuest bestimmen den Spieltag über die Uhr (Tageswechsel 4 Uhr).
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date(2026, 10, 3, 12, 0, 0))
})

afterEach(async () => {
  vi.useRealTimers()
  vi.restoreAllMocks()
  await database.delete()
})

const OPEN: Chapter = { id: 'open', title: 'Offen', criterion: { type: 'manual' } }

function questDraft(overrides: Partial<MainQuestDraft> = {}): MainQuestDraft {
  return { title: 'Kampagne', icon: '🏔️', why: 'Darum.', reward: 'Kuchen', startDay: DAY, chapters: [OPEN], ...overrides }
}

function habitDraft(title: string, overrides: Partial<HabitDraft> = {}): HabitDraft {
  return { title, icon: '⭐', attribute: 'discipline', difficulty: 'medium', schedule: { type: 'daily' }, ...overrides }
}

async function create(title: string, overrides: Partial<MainQuestDraft> = {}): Promise<MainQuest> {
  return createMainQuest(questDraft({ title, ...overrides }), database)
}

async function state(day: DayKey = DAY): Promise<GameState> {
  return deriveGameState(await loadGameData(database), day)
}

async function activeCount(day: DayKey = DAY): Promise<number> {
  return countActiveCampaigns(await loadGameData(database), day)
}

/** Vergleichbarer Spielstand ohne Objekt-Identitäten (Level, XP, Attribute, Gesamtwerte, Kapitel). */
function summary(game: GameState) {
  const campaigns = [...game.mainQuests, ...game.archivedMainQuests]
    .map((campaign) => ({ id: campaign.quest.id, done: campaign.chapters.map((c) => c.done), complete: campaign.complete }))
    .sort((a, b) => (a.id < b.id ? -1 : 1))
  return { level: game.level, attributes: game.attributes, totals: game.totals, campaigns }
}

describe('createMainQuest – Limit aktiver Kampagnen', () => {
  it(`erlaubt ${BALANCING.maxActiveCampaigns} aktive Kampagnen und lehnt die nächste mit deutscher Meldung ab`, async () => {
    for (let i = 0; i < BALANCING.maxActiveCampaigns; i++) await create(`K${i}`)
    await expect(create('Zu viel')).rejects.toThrow(CAMPAIGN_LIMIT_MESSAGE)
    expect(CAMPAIGN_LIMIT_MESSAGE).toBe(
      'Du hast schon 3 aktive Kampagnen. Schließe eine ab oder beende sie, um eine neue zu beginnen.',
    )
    expect((await loadGameData(database)).mainQuests).toHaveLength(BALANCING.maxActiveCampaigns)
  })

  it('archivierte und abgeschlossene Entwürfe zählen nicht und dürfen immer angelegt werden', async () => {
    for (let i = 0; i < BALANCING.maxActiveCampaigns; i++) await create(`K${i}`)
    await create('Archiv', { archived: true })
    await create('Gemeistert', { chapters: [{ ...OPEN, manualDone: true, completedDay: DAY }] })
    expect((await loadGameData(database)).mainQuests).toHaveLength(BALANCING.maxActiveCampaigns + 2)
    expect(await activeCount()).toBe(BALANCING.maxActiveCampaigns)
  })

  it('eine abgeschlossene Kampagne gibt ihren Platz frei', async () => {
    const quests = []
    for (let i = 0; i < BALANCING.maxActiveCampaigns; i++) quests.push(await create(`K${i}`))
    await setChapterManual(quests[0].id, OPEN.id, true, DAY, database)
    const fourth = await create('Neu')
    expect((await state()).mainQuests.map((q) => q.quest.id)).toContain(fourth.id)
    // Wird das Kapitel wieder geöffnet, sind (ausnahmsweise) vier aktiv – kein Fehler, aber kein weiterer Platz.
    await setChapterManual(quests[0].id, OPEN.id, false, DAY, database)
    expect(await activeCount()).toBe(BALANCING.maxActiveCampaigns + 1)
    await expect(create('Noch eine')).rejects.toThrow(CAMPAIGN_LIMIT_MESSAGE)
  })

  it('eine beendete (archivierte) Kampagne gibt ihren Platz frei', async () => {
    const quests = []
    for (let i = 0; i < BALANCING.maxActiveCampaigns; i++) quests.push(await create(`K${i}`))
    await archiveMainQuest(quests[1].id, DAY, {}, database)
    await expect(create('Neu')).resolves.toMatchObject({ title: 'Neu' })
  })

  it('nutzt den Spieltag laut Uhr und Tageswechsel (Quest-Kapitel zählen bis heute)', async () => {
    const habit = await createHabit(habitDraft('Lesen'), DAY, database)
    const goal: Chapter = { id: 'g', title: 'Einmal', criterion: { type: 'habit', habitId: habit.id, metric: 'completions', target: 1 } }
    await create('Ziel', { chapters: [goal] })
    await create('A')
    await create('B')
    // Morgen (04.11.) erledigt → heute (03.11.) zählt das noch nicht: die Kampagne ist aktiv.
    await setCompletionValue(habit.id, '2026-11-04', 1, database)
    await expect(create('C')).rejects.toThrow(CAMPAIGN_LIMIT_MESSAGE)
    // 04.11., 3 Uhr morgens: laut Tageswechsel noch der 03.11.
    vi.setSystemTime(new Date(2026, 10, 4, 3, 0, 0))
    await expect(create('C')).rejects.toThrow(CAMPAIGN_LIMIT_MESSAGE)
    vi.setSystemTime(new Date(2026, 10, 4, 12, 0, 0))
    await expect(create('C')).resolves.toMatchObject({ title: 'C' })
  })

  it('speichert Herkunft und geteilte Quests normalisiert', async () => {
    const quest = await create('Aus Vorlage', {
      blueprint: { id: 'body', level: 'advanced', pathId: 'endurance' },
      sharedHabitIds: ['a', '', 'b', 'a'],
    })
    expect(quest.blueprint).toStrictEqual({ id: 'body', level: 'advanced', pathId: 'endurance' })
    expect(quest.sharedHabitIds).toStrictEqual(['a', 'b'])
    const invalid = await create('Kaputt', {
      blueprint: { id: '', level: 'beginner' },
      sharedHabitIds: [],
    })
    expect('blueprint' in invalid).toBe(false)
    expect('sharedHabitIds' in invalid).toBe(false)
    const badLevel = await create('Kaputt 2', { blueprint: { id: 'x', level: 'expert' as 'beginner', pathId: '' } })
    expect('blueprint' in badLevel).toBe(false)
  })
})

describe('updateMainQuest – Herkunft & Zurückholen', () => {
  it('behält blueprint und sharedHabitIds, solange der Patch sie nicht enthält', async () => {
    const quest = await create('Vorlage', { blueprint: { id: 'scholar', level: 'beginner' }, sharedHabitIds: ['h'] })
    await updateMainQuest(quest.id, { title: 'Umbenannt', chapters: [OPEN] }, database)
    expect(await database.mainQuests.get(quest.id)).toMatchObject({
      title: 'Umbenannt',
      blueprint: { id: 'scholar', level: 'beginner' },
      sharedHabitIds: ['h'],
    })
    await updateMainQuest(quest.id, { blueprint: undefined, sharedHabitIds: undefined }, database)
    const stored = await database.mainQuests.get(quest.id)
    expect(stored && 'blueprint' in stored).toBe(false)
    expect(stored && 'sharedHabitIds' in stored).toBe(false)
  })

  it('Zurückholen per Patch (archived → false) beachtet das Limit', async () => {
    const archived = await create('Alt', { archived: true })
    for (let i = 0; i < BALANCING.maxActiveCampaigns; i++) await create(`K${i}`)
    await expect(updateMainQuest(archived.id, { archived: false }, database)).rejects.toThrow(CAMPAIGN_RESTORE_LIMIT_MESSAGE)
    expect((await database.mainQuests.get(archived.id))?.archived).toBe(true)
    // Andere Änderungen an einer archivierten Kampagne sind weiterhin möglich.
    await updateMainQuest(archived.id, { title: 'Alt (umbenannt)' }, database)
    expect(await database.mainQuests.get(archived.id)).toMatchObject({ title: 'Alt (umbenannt)', archived: true })
  })
})

describe('archiveMainQuest', () => {
  it('archiviert die Kampagne; ihre Quests laufen ohne archiveQuests weiter', async () => {
    const quest = await create('Lesen')
    const habit = await createHabit(habitDraft('Täglich lesen', { mainQuestId: quest.id }), DAY, database)
    await archiveMainQuest(quest.id, DAY, undefined, database)
    expect((await database.mainQuests.get(quest.id))?.archived).toBe(true)
    expect((await database.habits.get(habit.id))?.archivedDay).toBeUndefined()
    const game = await state()
    expect(game.mainQuests).toEqual([])
    expect(game.archivedMainQuests.map((q) => q.quest.id)).toEqual([quest.id])
    // Erneut archivieren ändert nichts.
    await archiveMainQuest(quest.id, DAY, undefined, database)
    expect((await database.mainQuests.get(quest.id))?.archived).toBe(true)
  })

  it('archiveQuests: archiviert verknüpfte Quests ab heute, ohne einen früheren Archivierungstag zu verschieben', async () => {
    const quest = await create('Lesen')
    const reading = await createHabit(habitDraft('Täglich lesen', { mainQuestId: quest.id }), '2026-10-01', database)
    const old = await createHabit(habitDraft('Alt', { mainQuestId: quest.id }), '2026-10-01', database)
    const other = await createHabit(habitDraft('Fremd'), '2026-10-01', database)
    await archiveHabit(old.id, '2026-10-20', database)
    await archiveMainQuest(quest.id, DAY, { archiveQuests: true }, database)
    expect((await database.habits.get(reading.id))?.archivedDay).toBe(DAY)
    expect((await database.habits.get(old.id))?.archivedDay).toBe('2026-10-20')
    expect((await database.habits.get(other.id))?.archivedDay).toBeUndefined()
  })

  it('archiveQuests: Quests, die eine andere nicht archivierte Kampagne braucht, laufen weiter', async () => {
    const owner = await create('Besitzer')
    const water = await createHabit(habitDraft('Wasser trinken', { mainQuestId: owner.id }), DAY, database)
    const steps = await createHabit(habitDraft('Schritte', { mainQuestId: owner.id }), DAY, database)
    const stretch = await createHabit(habitDraft('Dehnen', { mainQuestId: owner.id }), DAY, database)
    const solo = await createHabit(habitDraft('Nur hier', { mainQuestId: owner.id }), DAY, database)
    // Kapitel einer anderen Kampagne zählt auf „Wasser“; eine weitere teilt „Schritte“.
    await create('Kapitel-Nutzer', {
      chapters: [{ id: 'w', title: 'Wasser', criterion: { type: 'habit', habitId: water.id, metric: 'completions', target: 5 } }],
    })
    await create('Teilt', { sharedHabitIds: [steps.id] })
    // Eine archivierte Kampagne schützt nichts.
    await create('Archiv', { archived: true, sharedHabitIds: [stretch.id] })

    await archiveMainQuest(owner.id, DAY, { archiveQuests: true }, database)
    const archivedDays = Object.fromEntries(
      (await loadGameData(database)).habits.map((habit) => [habit.title, habit.archivedDay ?? null]),
    )
    expect(archivedDays).toEqual({ 'Wasser trinken': null, Schritte: null, Dehnen: DAY, 'Nur hier': DAY })
    expect((await database.habits.get(solo.id))?.mainQuestId).toBe(owner.id)
  })

  it('wirft bei unbekannter Kampagne und ungültigem Tag', async () => {
    await expect(archiveMainQuest('weg', DAY, {}, database)).rejects.toThrow('Diese Kampagne gibt es nicht (mehr).')
    const quest = await create('K')
    await expect(archiveMainQuest(quest.id, '2026-02-30', {}, database)).rejects.toThrow('Ungültiges Datum')
  })
})

describe('restoreMainQuest', () => {
  it('holt eine archivierte Kampagne zurück; nicht archivierte bleiben unverändert', async () => {
    const quest = await create('K')
    await restoreMainQuest(quest.id, DAY, {}, database)
    expect(await database.mainQuests.get(quest.id)).toStrictEqual(quest)
    await archiveMainQuest(quest.id, DAY, {}, database)
    await restoreMainQuest(quest.id, DAY, {}, database)
    const stored = await database.mainQuests.get(quest.id)
    expect(stored && 'archived' in stored).toBe(false)
  })

  it('wirft, wenn dadurch zu viele Kampagnen aktiv wären – abgeschlossene gehen immer', async () => {
    const open = await create('Offen', { archived: true })
    const mastered = await create('Gemeistert', { archived: true, chapters: [{ ...OPEN, manualDone: true, completedDay: DAY }] })
    for (let i = 0; i < BALANCING.maxActiveCampaigns; i++) await create(`K${i}`)
    await expect(restoreMainQuest(open.id, DAY, {}, database)).rejects.toThrow(CAMPAIGN_RESTORE_LIMIT_MESSAGE)
    expect((await database.mainQuests.get(open.id))?.archived).toBe(true)
    await restoreMainQuest(mastered.id, DAY, {}, database)
    expect((await state()).mainQuests.map((q) => q.quest.id)).toContain(mastered.id)
  })

  it('wirft, wenn schon eine aktive Kampagne aus derselben Vorlage läuft', async () => {
    const old = await create('Gelehrter alt', { blueprint: { id: 'scholar', level: 'beginner' } })
    await archiveMainQuest(old.id, DAY, {}, database)
    await create('Gelehrter neu', { blueprint: { id: 'scholar', level: 'advanced' } })
    await expect(restoreMainQuest(old.id, DAY, {}, database)).rejects.toThrow('Eine Kampagne aus dieser Vorlage läuft bereits.')
  })

  it('restoreQuests: holt nur die archivierten Quests der Kampagne zurück – die archivierte Zeit wird zur Pause', async () => {
    const quest = await create('K')
    const mine = await createHabit(habitDraft('Meine', { mainQuestId: quest.id }), '2026-10-01', database)
    const foreign = await createHabit(habitDraft('Fremd'), '2026-10-01', database)
    await archiveHabit(foreign.id, DAY, database)
    await archiveMainQuest(quest.id, DAY, { archiveQuests: true }, database)
    await restoreMainQuest(quest.id, '2026-11-10', { restoreQuests: true }, database)
    const restored = await database.habits.get(mine.id)
    expect(restored?.archivedDay).toBeUndefined()
    expect(restored?.pauses).toEqual([{ from: DAY, until: '2026-11-10' }])
    expect((await database.habits.get(foreign.id))?.archivedDay).toBe(DAY)
  })

  it('ohne restoreQuests bleiben die Quests im Archiv; scheitert das Limit, bleibt alles unverändert', async () => {
    const quest = await create('K')
    const mine = await createHabit(habitDraft('Meine', { mainQuestId: quest.id }), DAY, database)
    await archiveMainQuest(quest.id, DAY, { archiveQuests: true }, database)
    await restoreMainQuest(quest.id, '2026-11-05', {}, database)
    expect((await database.habits.get(mine.id))?.archivedDay).toBe(DAY)

    await archiveMainQuest(quest.id, '2026-11-05', {}, database)
    for (let i = 0; i < BALANCING.maxActiveCampaigns; i++) await create(`K${i}`)
    await expect(restoreMainQuest(quest.id, '2026-11-06', { restoreQuests: true }, database)).rejects.toThrow(
      CAMPAIGN_RESTORE_LIMIT_MESSAGE,
    )
    expect((await database.habits.get(mine.id))?.archivedDay).toBe(DAY)
  })
})

describe('Beenden und Zurückholen kosten nie verdiente XP', () => {
  it('Archivieren samt Quests und späteres Zurückholen ändern vergangene Tage nicht', async () => {
    const start = addDays(DAY, -10)
    const quest = await create('Lesen', { startDay: start, chapters: [] })
    const reading = await createHabit(habitDraft('Täglich lesen', { mainQuestId: quest.id }), start, database)
    const tidy = await createHabit(habitDraft('Aufräumen', { mainQuestId: quest.id }), start, database)
    const extra = await createHabit(habitDraft('Extra'), start, database)
    const fiveDays: Chapter = { id: 'five', title: 'Fünf Tage', criterion: { type: 'habit', habitId: reading.id, metric: 'completions', target: 5 } }
    const streak: Chapter = { id: 'streak', title: 'Serie', criterion: { type: 'habit', habitId: tidy.id, metric: 'streak', target: 4 } }
    await updateMainQuest(quest.id, { chapters: [fiveDays, streak, OPEN] }, database)
    for (let i = 0; i < 10; i++) {
      const day = addDays(start, i)
      await setCompletionValue(reading.id, day, 1, database)
      await setCompletionValue(extra.id, day, 1, database)
      if (i % 3 !== 2) await setCompletionValue(tidy.id, day, 1, database)
    }
    const yesterday = addDays(DAY, -1)
    const before = summary(await state(yesterday))
    const beforeToday = summary(await state(DAY))
    expect(before.totals.perfectDays).toBeGreaterThan(0)

    await archiveMainQuest(quest.id, DAY, { archiveQuests: true }, database)
    expect(summary(await state(yesterday))).toEqual(before)
    // Auch heute: Die Vergangenheit (alle Erledigungen liegen vor heute) bleibt komplett erhalten.
    expect((await state(DAY)).level.totalXp).toBe(beforeToday.level.totalXp)
    expect(summary(await state(DAY)).campaigns).toEqual(beforeToday.campaigns)

    const later = addDays(DAY, 7)
    await restoreMainQuest(quest.id, later, { restoreQuests: true }, database)
    expect(summary(await state(yesterday))).toEqual(before)
    const afterRestore = await state(addDays(later, -1))
    expect(afterRestore.level.totalXp).toBe(beforeToday.level.totalXp)
    // Die archivierte Zeit ist Pause: keine offenen Pflicht-Quests an diesen Tagen.
    const restored = await database.habits.get(reading.id)
    expect(restored?.pauses).toEqual([{ from: DAY, until: later }])
  })
})

describe('Backup – Herkunft und geteilte Quests', () => {
  it('Roundtrip mit blueprint und sharedHabitIds', async () => {
    const quest = await create('Körper', {
      blueprint: { id: 'body', level: 'advanced', pathId: 'sports' },
      sharedHabitIds: ['h1'],
    })
    const backup = JSON.parse(JSON.stringify(await createBackup(new Date(), database)))
    const parsed = parseBackup(backup)
    expect(parsed.ok).toBe(true)
    if (!parsed.ok) return
    expect(parsed.backup.data.mainQuests[0]).toMatchObject({ blueprint: quest.blueprint, sharedHabitIds: ['h1'] })

    const target = new QuestlogDB(`questlog-test-campaigns-restore-${dbCounter}`)
    await target.open()
    try {
      await restoreBackup(parsed.backup, target)
      expect(await loadGameData(target)).toEqual(await loadGameData(database))
    } finally {
      await target.delete()
    }
  })

  it('ältere Backups ohne Herkunft bleiben gültig; ungültige Herkunft wird abgelehnt', async () => {
    await create('Ohne Vorlage')
    const backup = JSON.parse(JSON.stringify(await createBackup(new Date(), database)))
    expect(parseBackup(backup).ok).toBe(true)

    const withRef = (blueprint: unknown) => {
      const copy = structuredClone(backup)
      copy.data.mainQuests[0].blueprint = blueprint
      return parseBackup(copy)
    }
    expect(withRef({ id: 'scholar', level: 'beginner' }).ok).toBe(true)
    for (const bad of [{ id: 'scholar', level: 'expert' }, { id: '', level: 'beginner' }, { id: 'body', level: 'advanced', pathId: '' }, { level: 'beginner' }]) {
      const result = withRef(bad)
      expect(result.ok, JSON.stringify(bad)).toBe(false)
      if (!result.ok) expect(result.error).toContain('mainQuests.0.blueprint')
    }
    const copy = structuredClone(backup)
    copy.data.mainQuests[0].sharedHabitIds = ['']
    expect(parseBackup(copy).ok).toBe(false)
  })
})
