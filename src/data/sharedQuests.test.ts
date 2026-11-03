/**
 * Geteilte Quests über mehrere Kampagnen hinweg: Beenden, Löschen und Zurückholen von Kampagnen, deren Quests
 * eine andere Kampagne mitbenutzt – ohne verwaiste, ewig laufende Quests und ohne dass verdiente XP, Perfekte
 * Tage oder Kapitel verloren gehen. Dazu Randfälle beim erneuten Installieren derselben Vorlage, beim Löschen
 * einer geteilten Quest, beim Import älterer Backups und atomares Installieren.
 */
import 'fake-indexeddb/auto'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { CAMPAIGN_LIMIT_MESSAGE, countActiveCampaigns } from '../domain/campaigns'
import { addDays, dayRange } from '../domain/dates'
import { deletionImpact } from '../domain/deletion'
import { deriveGameState, evaluateMainQuests } from '../domain/engine'
import { habitTarget, isArchivedOn } from '../domain/schedule'
import { seededRandom } from '../domain/testing'
import type { Completion, DayKey, GameData, GameState, Habit, MainQuest, MainQuestState } from '../domain/types'
import { BACKUP_APP_ID, BACKUP_SCHEMA_VERSION, createBackup, parseBackup, restoreBackup } from './backup'
import { getBlueprint } from './blueprints'
import { QuestlogDB } from './db'
import {
  archiveMainQuest,
  completionId,
  createMainQuest,
  deleteHabit,
  deleteMainQuest,
  loadGameData,
  restoreMainQuest,
  setChapterCounter,
  setChapterManual,
  updateMainQuest,
} from './repository'
import { createScholarCampaign, installBlueprint, startAdventure } from './seed'

/** Heute laut (gefälschter) Uhr, Tageswechsel 4 Uhr. */
const DAY = '2026-11-03'
const START = addDays(DAY, -14)
const YESTERDAY = addDays(DAY, -1)

let database: QuestlogDB
let dbCounter = 0

beforeEach(async () => {
  database = new QuestlogDB(`questlog-test-shared-${++dbCounter}`)
  await database.open()
  // createMainQuest/deleteMainQuest bestimmen den Spieltag über die Uhr.
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date(2026, 10, 3, 12, 0, 0))
})

afterEach(async () => {
  vi.useRealTimers()
  vi.restoreAllMocks()
  await database.delete()
})

async function data(): Promise<GameData> {
  return loadGameData(database)
}

async function state(day: DayKey = DAY): Promise<GameState> {
  return deriveGameState(await data(), day)
}

/** Vergleichbarer Spielstand: Level, XP, Attribute, Gesamtwerte, abgeschlossene Kapitel aller Kampagnen. */
function summary(game: GameState) {
  const campaigns = [...game.mainQuests, ...game.archivedMainQuests]
    .map((campaign) => ({ id: campaign.quest.id, done: campaign.chapters.map((c) => c.done), complete: campaign.complete }))
    .sort((a, b) => (a.id < b.id ? -1 : 1))
  return { level: game.level, attributes: game.attributes, totals: game.totals, campaigns }
}

function habitByTitle(game: GameData, title: string): Habit {
  const matches = game.habits.filter((habit) => habit.title === title)
  if (matches.length !== 1) throw new Error(`Erwartet genau eine Quest „${title}“, gefunden: ${matches.length}`)
  return matches[0]
}

function stateOf(game: GameData, questId: string, day: DayKey = DAY): MainQuestState {
  const found = evaluateMainQuests(game, day).find((candidate) => candidate.quest.id === questId)
  if (!found) throw new Error(`Kampagne ${questId} fehlt`)
  return found
}

function completionFor(habit: Habit, day: DayKey): Completion {
  return {
    id: completionId(habit.id, day),
    habitId: habit.id,
    day,
    value: habitTarget(habit),
    target: habitTarget(habit),
    difficulty: habit.difficulty,
    attribute: habit.attribute,
    updatedAt: 0,
  }
}

/** Erledigt alle (an dem Tag nicht archivierten) Quests an jedem Tag von `from` bis `to`. */
async function completeAll(from: DayKey, to: DayKey): Promise<void> {
  const { habits } = await data()
  const completions = dayRange(from, to).flatMap((day) =>
    habits.filter((habit) => !isArchivedOn(habit, day) && habit.createdDay <= day).map((habit) => completionFor(habit, day)),
  )
  await database.completions.bulkPut(completions)
}

/** Alchemist (Besitzer von „Wasser trinken“) und Krieger (Fortgeschritten, teilt „Wasser trinken“) ab START. */
async function alchemistAndWarrior(): Promise<{ alchemist: MainQuest; warrior: MainQuest; water: Habit }> {
  const alchemist = await installBlueprint('alchemist', { level: 'beginner' }, START, database)
  const warrior = await installBlueprint('body', { level: 'advanced', pathId: 'strength' }, START, database)
  const water = habitByTitle(await data(), 'Wasser trinken')
  expect(water.mainQuestId).toBe(alchemist.id)
  expect(warrior.sharedHabitIds).toEqual([water.id])
  await completeAll(START, YESTERDAY)
  return { alchemist, warrior, water }
}

describe('Geteilte Quest: Beenden des Besitzers, dann des Mitbenutzers', () => {
  it('nach beiden Kampagnen (jeweils samt Quests) läuft die geteilte Quest nicht verwaist weiter', async () => {
    const { alchemist, warrior, water } = await alchemistAndWarrior()
    const before = summary(await state(YESTERDAY))
    expect(before.totals.perfectDays).toBe(14)

    await archiveMainQuest(alchemist.id, DAY, { archiveQuests: true }, database)
    let stored = await data()
    // Der Krieger braucht „Wasser trinken“ weiter – die Quest läuft und gehört jetzt ihm.
    expect(stored.habits.find((h) => h.id === water.id)).toMatchObject({ mainQuestId: warrior.id })
    expect(stored.habits.find((h) => h.id === water.id)?.archivedDay).toBeUndefined()
    expect(stored.mainQuests.find((q) => q.id === warrior.id)?.sharedHabitIds).toBeUndefined()
    // Der Alchemist führt sie weiter als geteilte Quest (Anzeige in „Beendete Kampagnen“).
    expect(stateOf(stored, alchemist.id).linkedHabitIds).toContain(water.id)
    expect(stateOf(stored, warrior.id).linkedHabitIds).toContain(water.id)
    expect(summary(await state(YESTERDAY))).toEqual(before)

    await archiveMainQuest(warrior.id, DAY, { archiveQuests: true }, database)
    stored = await data()
    // Keine nicht archivierte Kampagne nutzt sie mehr → mit dem Krieger archiviert.
    expect(stored.habits.find((h) => h.id === water.id)?.archivedDay).toBe(DAY)
    expect(stored.habits.filter((habit) => !isArchivedOn(habit, DAY))).toEqual([])
    expect(summary(await state(YESTERDAY))).toEqual(before)
    expect((await state(DAY)).level.totalXp).toBe(before.level.totalXp)
  })

  it('auch ohne „Quests archivieren“ beim Besitzer geht die geteilte Quest an den Mitbenutzer', async () => {
    const { alchemist, warrior, water } = await alchemistAndWarrior()
    await archiveMainQuest(alchemist.id, DAY, {}, database)
    let stored = await data()
    expect(stored.habits.find((h) => h.id === water.id)?.mainQuestId).toBe(warrior.id)
    // Die übrigen Quests des Alchemisten laufen (wie gewählt) weiter und bleiben bei ihm.
    const veggies = habitByTitle(stored, 'Gemüse & Obst')
    expect(veggies).toMatchObject({ mainQuestId: alchemist.id })
    expect(veggies.archivedDay).toBeUndefined()

    await archiveMainQuest(warrior.id, DAY, { archiveQuests: true }, database)
    stored = await data()
    expect(stored.habits.find((h) => h.id === water.id)?.archivedDay).toBe(DAY)
  })

  it('Zurückholen des Besitzers holt die geteilte Quest mit zurück – ohne XP-Verlust', async () => {
    const { alchemist, warrior, water } = await alchemistAndWarrior()
    const before = summary(await state(YESTERDAY))
    await archiveMainQuest(alchemist.id, DAY, { archiveQuests: true }, database)
    await archiveMainQuest(warrior.id, DAY, { archiveQuests: true }, database)

    const later = addDays(DAY, 5)
    await restoreMainQuest(alchemist.id, later, { restoreQuests: true }, database)
    const stored = await data()
    const restoredWater = stored.habits.find((h) => h.id === water.id)
    expect(restoredWater?.archivedDay).toBeUndefined()
    expect(restoredWater?.mainQuestId).toBe(alchemist.id)
    expect(restoredWater?.pauses).toEqual([{ from: DAY, until: later }])
    // Alle Quests des Alchemisten laufen wieder; die des Kriegers bleiben im Archiv.
    const alchemistTitles = getBlueprint('alchemist')?.build({ level: 'beginner' }).quests.map((q) => q.title) ?? []
    const running = stored.habits.filter((habit) => !isArchivedOn(habit, later)).map((habit) => habit.title)
    expect(running.sort()).toEqual([...alchemistTitles].sort())
    // Der Krieger führt „Wasser trinken“ weiter als geteilte Quest.
    expect(stateOf(stored, warrior.id, later).linkedHabitIds).toContain(water.id)
    expect(stateOf(stored, alchemist.id, later).linkedHabitIds).toContain(water.id)
    expect(summary(await state(YESTERDAY))).toEqual(before)
    expect((await state(addDays(later, -1))).level.totalXp).toBe(before.level.totalXp)
  })

  it('Zurückholen nach dem Beenden: läuft der Mitbenutzer noch, behält er die Quest', async () => {
    const { alchemist, warrior, water } = await alchemistAndWarrior()
    await archiveMainQuest(alchemist.id, DAY, { archiveQuests: true }, database)
    await restoreMainQuest(alchemist.id, DAY, { restoreQuests: true }, database)
    const stored = await data()
    expect(stored.habits.find((h) => h.id === water.id)).toMatchObject({ mainQuestId: warrior.id })
    expect(stored.habits.every((habit) => habit.archivedDay === undefined)).toBe(true)
    expect(stateOf(stored, alchemist.id).linkedHabitIds).toContain(water.id)

    // Wird jetzt der Krieger samt Quests beendet, braucht der (wieder laufende) Alchemist „Wasser trinken“.
    await archiveMainQuest(warrior.id, DAY, { archiveQuests: true }, database)
    const after = await data()
    expect(after.habits.find((h) => h.id === water.id)).toMatchObject({ mainQuestId: alchemist.id })
    expect(after.habits.find((h) => h.id === water.id)?.archivedDay).toBeUndefined()
  })
})

describe('Geteilte Quest: eine neue Kampagne übernimmt die Quest einer beendeten', () => {
  /** Alchemist beendet (Quests laufen weiter), danach startet der Krieger und übernimmt „Wasser trinken“. */
  async function takeOver(): Promise<{ alchemist: MainQuest; warrior: MainQuest; water: Habit }> {
    const alchemist = await installBlueprint('alchemist', { level: 'beginner' }, START, database)
    await completeAll(START, YESTERDAY)
    await archiveMainQuest(alchemist.id, DAY, {}, database)
    const warrior = await installBlueprint('body', { level: 'advanced', pathId: 'strength' }, DAY, database)
    const stored = await data()
    const water = habitByTitle(stored, 'Wasser trinken')
    expect(water.mainQuestId).toBe(warrior.id)
    expect(warrior.sharedHabitIds).toBeUndefined()
    // Der Alchemist nutzt sie weiter mit (für Anzeige und Zurückholen).
    expect(stored.mainQuests.find((q) => q.id === alchemist.id)?.sharedHabitIds).toEqual([water.id])
    expect(stateOf(stored, alchemist.id).linkedHabitIds).toContain(water.id)
    return { alchemist, warrior, water }
  }

  it('zurückgeholt, während die neue läuft: die Quest bleibt dort und läuft weiter, wenn die neue endet', async () => {
    const { alchemist, warrior, water } = await takeOver()
    await restoreMainQuest(alchemist.id, DAY, { restoreQuests: true }, database)
    expect((await database.habits.get(water.id))?.mainQuestId).toBe(warrior.id)
    await archiveMainQuest(warrior.id, DAY, { archiveQuests: true }, database)
    const water2 = await database.habits.get(water.id)
    expect(water2?.archivedDay).toBeUndefined()
    expect(water2?.mainQuestId).toBe(alchemist.id)
  })

  it('zurückgeholt, nachdem die neue samt Quests endete: die Quest kommt mit zurück', async () => {
    const { alchemist, warrior, water } = await takeOver()
    const before = summary(await state(YESTERDAY))
    await archiveMainQuest(warrior.id, DAY, { archiveQuests: true }, database)
    expect((await database.habits.get(water.id))?.archivedDay).toBe(DAY)
    const later = addDays(DAY, 3)
    await restoreMainQuest(alchemist.id, later, { restoreQuests: true }, database)
    const stored = await data()
    expect(stored.habits.find((h) => h.id === water.id)).toMatchObject({ mainQuestId: alchemist.id, pauses: [{ from: DAY, until: later }] })
    expect(stored.habits.find((h) => h.id === water.id)?.archivedDay).toBeUndefined()
    expect(stored.mainQuests.find((q) => q.id === alchemist.id)?.sharedHabitIds).toBeUndefined()
    expect(stored.mainQuests.find((q) => q.id === warrior.id)?.sharedHabitIds).toEqual([water.id])
    expect(summary(await state(YESTERDAY))).toEqual(before)
  })
})

describe('Geteilte Quest: Beenden und Zurückholen per updateMainQuest', () => {
  it('übergibt und übernimmt geteilte Quests genauso wie archiveMainQuest/restoreMainQuest', async () => {
    const { alchemist, warrior, water } = await alchemistAndWarrior()
    await updateMainQuest(alchemist.id, { archived: true }, database)
    let stored = await data()
    expect(stored.habits.find((h) => h.id === water.id)?.mainQuestId).toBe(warrior.id)
    expect(stored.mainQuests.find((q) => q.id === alchemist.id)).toMatchObject({ archived: true, sharedHabitIds: [water.id] })

    await archiveMainQuest(warrior.id, DAY, {}, database)
    await updateMainQuest(alchemist.id, { archived: false }, database)
    stored = await data()
    expect(stored.habits.find((h) => h.id === water.id)?.mainQuestId).toBe(alchemist.id)
    expect(stored.mainQuests.find((q) => q.id === alchemist.id)?.sharedHabitIds).toBeUndefined()
    expect(stored.mainQuests.find((q) => q.id === warrior.id)?.sharedHabitIds).toEqual([water.id])
  })
})

describe('Geteilte Quest: Löschen des Besitzers', () => {
  it('die geteilte Quest geht an den Mitbenutzer und wird mit ihm archiviert', async () => {
    const { alchemist, warrior, water } = await alchemistAndWarrior()
    await deleteMainQuest(alchemist.id, database)
    let stored = await data()
    expect(stored.habits.find((h) => h.id === water.id)?.mainQuestId).toBe(warrior.id)
    expect(stored.mainQuests.find((q) => q.id === warrior.id)?.sharedHabitIds).toBeUndefined()
    // Die übrigen Quests des Alchemisten verlieren (wie bisher) ihre Zuordnung.
    expect(habitByTitle(stored, 'Gemüse & Obst').mainQuestId).toBeUndefined()

    await archiveMainQuest(warrior.id, DAY, { archiveQuests: true }, database)
    stored = await data()
    expect(stored.habits.find((h) => h.id === water.id)?.archivedDay).toBe(DAY)
    expect(habitByTitle(stored, 'Gemüse & Obst').archivedDay).toBeUndefined()
  })
})

describe('Löschen einer Quest, die zwei Kampagnen nutzen', () => {
  it('beide Kampagnen bleiben auswertbar, XP steigen nie, Beenden/Zurückholen funktionieren weiter', async () => {
    // „Rechtzeitig ins Bett“: Mönch-Kapitel zählen darauf, der Frühaufsteher teilt sie.
    const monk = await installBlueprint('monk', { level: 'beginner' }, START, database)
    const riser = await installBlueprint('earlyRiser', { level: 'beginner' }, START, database)
    const bed = habitByTitle(await data(), 'Rechtzeitig ins Bett')
    expect(bed.mainQuestId).toBe(monk.id)
    expect(riser.sharedHabitIds).toContain(bed.id)
    await completeAll(START, YESTERDAY)
    const before = await state(DAY)

    const impact = deletionImpact(await data(), bed.id, DAY)
    expect(impact.campaigns.map((campaign) => campaign.quest.id)).toContain(monk.id)
    await deleteHabit(bed.id, DAY, database)

    const stored = await data()
    const after = deriveGameState(stored, DAY)
    expect(after.level.totalXp).toBeLessThanOrEqual(before.level.totalXp)
    expect(before.level.totalXp - after.level.totalXp).toBe(impact.xpLost)
    expect(after.totals.perfectDays).toBeLessThanOrEqual(before.totals.perfectDays)
    for (const campaign of after.mainQuests) expect(campaign.linkedHabitIds).not.toContain(bed.id)
    expect(stateOf(stored, monk.id).chapters.some((chapter) => chapter.brokenReference)).toBe(true)

    await archiveMainQuest(riser.id, DAY, { archiveQuests: true }, database)
    await archiveMainQuest(monk.id, DAY, { archiveQuests: true }, database)
    expect((await data()).habits.filter((habit) => !isArchivedOn(habit, DAY))).toEqual([])
    await restoreMainQuest(riser.id, DAY, { restoreQuests: true }, database)
    expect(countActiveCampaigns(await data(), DAY)).toBe(1)
    expect((await state(DAY)).level.totalXp).toBe(after.level.totalXp)
  })
})

describe('Dieselbe Vorlage erneut installieren', () => {
  /** Schließt alle Kapitel einer Kampagne ab (Quest-Kapitel: jeden Tag von Start bis `end` erledigt). */
  async function master(quest: MainQuest, end: DayKey): Promise<void> {
    const { habits } = await data()
    const byId = new Map(habits.map((habit) => [habit.id, habit]))
    const completions: Completion[] = []
    for (const chapter of quest.chapters) {
      const { criterion } = chapter
      if (criterion.type === 'manual') await setChapterManual(quest.id, chapter.id, true, quest.startDay, database)
      else if (criterion.type === 'counter') await setChapterCounter(quest.id, chapter.id, criterion.target, quest.startDay, database)
      else {
        const habit = byId.get(criterion.habitId)
        if (!habit) throw new Error('Quest fehlt')
        for (const day of dayRange(quest.startDay, end)) completions.push({ ...completionFor(habit, day), value: habitTarget(habit) * 2 })
      }
    }
    await database.completions.bulkPut(completions)
  }

  it('nach dem Meistern: die neue Kampagne übernimmt die Quests, die gemeisterte behält Kapitel und XP', async () => {
    const scholar = getBlueprint('scholar')
    if (!scholar) throw new Error('Vorlage fehlt')
    const first = await installBlueprint('scholar', { level: 'beginner' }, START, database)
    const end = addDays(START, scholar.durationDays + 14)
    await master(first, end)
    const before = summary(deriveGameState(await data(), end))
    expect(stateOf(await data(), first.id, end).complete).toBe(true)

    const second = await installBlueprint('scholar', { level: 'advanced' }, end, database)
    const stored = await data()
    // Keine doppelten Quests; alle gehören jetzt der neuen Kampagne.
    expect(stored.habits).toHaveLength(5)
    expect(stored.habits.every((habit) => habit.mainQuestId === second.id)).toBe(true)
    // Die gemeisterte Kampagne bleibt gemeistert, ihre Kapitel-Quests bleiben verknüpft – keine XP gehen verloren.
    const mastered = stateOf(stored, first.id, end)
    expect(mastered.complete).toBe(true)
    expect(mastered.chapters.some((chapter) => chapter.brokenReference)).toBe(false)
    // Sie zeigt weiter alle ihre Quests (auch die, auf die kein Kapitel zählt – jetzt als geteilte Quests).
    expect(mastered.linkedHabitIds.slice().sort()).toEqual(stored.habits.map((habit) => habit.id).sort())
    expect(summary(deriveGameState(stored, end)).level).toEqual(before.level)
    expect(countActiveCampaigns(stored, end)).toBe(1)
  })

  it('nach dem Beenden samt Quests: neue Quests, die alte Kampagne bleibt unverändert und lässt sich erst zurückholen, wenn die neue nicht mehr läuft', async () => {
    const first = await installBlueprint('scholar', { level: 'beginner' }, START, database)
    await completeAll(START, YESTERDAY)
    await archiveMainQuest(first.id, DAY, { archiveQuests: true }, database)
    const before = summary(await state(DAY))

    const second = await installBlueprint('scholar', { level: 'advanced' }, DAY, database)
    const stored = await data()
    expect(stored.habits).toHaveLength(10)
    expect(stored.habits.filter((habit) => !isArchivedOn(habit, DAY)).every((habit) => habit.mainQuestId === second.id)).toBe(true)
    expect(second.sharedHabitIds).toBeUndefined()
    expect(summary(await state(DAY)).level).toEqual(before.level)

    await expect(restoreMainQuest(first.id, DAY, { restoreQuests: true }, database)).rejects.toThrow(
      'Eine Kampagne aus dieser Vorlage läuft bereits.',
    )
    expect(await data()).toEqual(stored)
  })
})

describe('installBlueprint – atomar', () => {
  it('scheitert das Schreiben der Quests, bleibt auch keine Kampagne zurück', async () => {
    await installBlueprint('alchemist', { level: 'beginner' }, START, database)
    const before = await data()
    vi.spyOn(database.habits, 'bulkPut').mockRejectedValueOnce(new Error('Festplatte voll'))
    await expect(installBlueprint('body', { level: 'advanced', pathId: 'strength' }, DAY, database)).rejects.toThrow('Festplatte voll')
    expect(await data()).toEqual(before)
  })

  it('startAdventure: Limit erreicht (z. B. nach einem Import ohne Profil) → weder Kampagne noch Profil', async () => {
    for (let i = 0; i < 3; i++) {
      await createMainQuest({ title: `Eigene ${i}`, icon: '🏔️', why: '', reward: '', startDay: DAY, chapters: [] }, database)
    }
    const before = await data()
    await expect(
      startAdventure({ name: 'Aria', avatar: '🧝', createdDay: DAY }, { blueprintId: 'monk', options: { level: 'beginner' } }, DAY, database),
    ).rejects.toThrow(CAMPAIGN_LIMIT_MESSAGE)
    expect(await data()).toEqual(before)
  })
})

describe('Backup – ältere Backups', () => {
  it('eine „Der Weg des Gelehrten“-Kampagne ohne Herkunft (aus der Zeit vor der Bibliothek) gilt nach dem Import als Gelehrten-Kampagne', async () => {
    const { mainQuest, habits } = createScholarCampaign(START, 1)
    const legacy = { ...mainQuest }
    delete legacy.blueprint
    const own = { ...mainQuest, id: 'own', title: 'Halbmarathon', chapters: [], createdAt: 2 }
    delete own.blueprint
    // Eine eigene, nur gleich benannte Kampagne (andere Kapitel) bleibt beim Import unverändert.
    const namesake = { ...own, id: 'namesake', title: 'Der Weg des Gelehrten', archived: true, chapters: [{ id: 'x', title: 'Eigenes Kapitel', criterion: { type: 'manual' as const } }], createdAt: 3 }
    const file = {
      app: BACKUP_APP_ID,
      schemaVersion: BACKUP_SCHEMA_VERSION,
      exportedAt: new Date().toISOString(),
      data: { settings: { dayStartHour: 4, effects: true }, habits, completions: [], mainQuests: [legacy, own, namesake] },
    }
    const parsed = parseBackup(JSON.parse(JSON.stringify(file)))
    expect(parsed.ok).toBe(true)
    if (!parsed.ok) return
    await restoreBackup(parsed.backup, database)

    const stored = await data()
    expect(stored.mainQuests.find((quest) => quest.id === mainQuest.id)?.blueprint).toStrictEqual({ id: 'scholar', level: 'beginner' })
    expect(stored.mainQuests.find((quest) => quest.id === 'own')?.blueprint).toBeUndefined()
    expect(stored.mainQuests.find((quest) => quest.id === 'namesake')).toStrictEqual(namesake)
    // Damit läuft sie in der Bibliothek – ein zweiter Gelehrter wird abgelehnt statt doppelt gestartet.
    await expect(installBlueprint('scholar', { level: 'advanced' }, DAY, database)).rejects.toThrow('Diese Kampagne läuft bereits.')

    // Neue Backups (mit Herkunft) bleiben beim Roundtrip unverändert.
    const roundtrip = parseBackup(JSON.parse(JSON.stringify(await createBackup(new Date(), database))))
    expect(roundtrip.ok).toBe(true)
    if (roundtrip.ok) expect(roundtrip.backup.data.mainQuests).toEqual(stored.mainQuests)
  })
})

// ---------------------------------------------------------------------------
// Zufallstest: beliebige Folgen von Installieren, Beenden, Zurückholen und Löschen
// ---------------------------------------------------------------------------

describe('Zufallstest – mehrere Kampagnen mit geteilten Quests', () => {
  const blueprints = ['scholar', 'body', 'alchemist', 'monk', 'earlyRiser', 'fortress', 'fellowship', 'polyglot']
  const expectedErrors = [
    CAMPAIGN_LIMIT_MESSAGE,
    'Diese Kampagne läuft bereits.',
    'Eine Kampagne aus dieser Vorlage läuft bereits.',
    'Du hast schon 3 aktive Kampagnen.',
  ]

  /** Was ein Tag `day` an Vergangenheit enthält – darf sich durch Kampagnen-Aktionen am Tag danach nie ändern. */
  function past(game: GameState) {
    const { totals } = game
    return { perfectDays: totals.perfectDays, xpFromQuests: totals.xpFromQuests, xpFromPerfectDays: totals.xpFromPerfectDays, attributes: game.attributes }
  }

  /** Läuft eine Quest verwaist weiter, obwohl eine nicht archivierte Kampagne sie nutzt? */
  function orphans(game: GameData, day: DayKey): string[] {
    const quests = new Map(game.mainQuests.map((quest) => [quest.id, quest]))
    const running = game.mainQuests.filter((quest) => quest.archived !== true)
    return game.habits.flatMap((habit) => {
      const owner = habit.mainQuestId === undefined ? undefined : quests.get(habit.mainQuestId)
      if (owner !== undefined && owner.archived !== true) return []
      const usedBy = running.filter(
        (quest) =>
          (quest.sharedHabitIds ?? []).includes(habit.id) ||
          quest.chapters.some((chapter) => chapter.criterion.type === 'habit' && chapter.criterion.habitId === habit.id),
      )
      return usedBy.length > 0 ? [`${habit.title} (${isArchivedOn(habit, day) ? 'archiviert' : 'läuft'})`] : []
    })
  }

  it.each([1, 2, 3, 4, 5, 6, 7, 8])('Seed %i: Vergangenheit bleibt, keine verwaisten Quests', async (seed) => {
    const rnd = seededRandom(seed)
    const pick = <T,>(items: readonly T[]): T => items[Math.floor(rnd() * items.length)]
    let day = START
    for (let step = 0; step < 30; step++) {
      // Gestern: einen Teil der laufenden Quests erledigen.
      const yesterday = addDays(day, -1)
      const { habits } = await data()
      const done = habits.filter((habit) => !isArchivedOn(habit, yesterday) && habit.createdDay <= yesterday && rnd() < 0.8)
      if (done.length > 0) await database.completions.bulkPut(done.map((habit) => completionFor(habit, yesterday)))

      const stored = await data()
      const before = deriveGameState(stored, yesterday)
      const roll = rnd()
      let action = 'nichts'
      try {
        if (roll < 0.4) {
          const id = pick(blueprints)
          const paths = getBlueprint(id)?.paths
          const level = rnd() < 0.5 ? 'beginner' : 'advanced'
          const pathId = paths ? pick(paths).id : undefined
          action = `install ${id}`
          await installBlueprint(id, pathId ? { level, pathId } : { level }, day, database)
        } else if (roll < 0.7) {
          const running = stored.mainQuests.filter((quest) => quest.archived !== true)
          if (running.length > 0) {
            const quest = pick(running)
            const archiveQuests = rnd() < 0.7
            action = `archive ${quest.title} ${archiveQuests}`
            await archiveMainQuest(quest.id, day, { archiveQuests }, database)
            const after = await data()
            if (archiveQuests) {
              const stillRunning = after.habits.filter((habit) => habit.mainQuestId === quest.id && !isArchivedOn(habit, day))
              expect(stillRunning.map((habit) => habit.title), action).toEqual([])
            }
          }
        } else if (roll < 0.92) {
          const archived = stored.mainQuests.filter((quest) => quest.archived === true)
          if (archived.length > 0) {
            const quest = pick(archived)
            action = `restore ${quest.title}`
            await restoreMainQuest(quest.id, day, { restoreQuests: rnd() < 0.8 }, database)
          }
        } else if (stored.mainQuests.length > 0) {
          const quest = pick(stored.mainQuests)
          action = `delete ${quest.title}`
          await deleteMainQuest(quest.id, database)
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        expect(expectedErrors.some((expected) => message.startsWith(expected)), `${action}: ${message}`).toBe(true)
      }

      const after = await data()
      const afterState = deriveGameState(after, yesterday)
      expect(past(afterState), `Schritt ${step}: ${action}`).toEqual(past(before))
      if (!action.startsWith('delete')) {
        // Beenden/Zurückholen/Installieren kosten nie Kapitel- oder Kampagnen-XP.
        expect(afterState.level, `Schritt ${step}: ${action}`).toEqual(before.level)
      }
      expect(orphans(after, day), `Schritt ${step}: ${action}`).toEqual([])
      expect(countActiveCampaigns(after, day), `Schritt ${step}: ${action}`).toBeLessThanOrEqual(3)
      if (rnd() < 0.5) day = addDays(day, 1)
    }
  })
})
