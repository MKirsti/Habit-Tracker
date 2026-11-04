import 'fake-indexeddb/auto'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { deriveGameState } from '../domain/engine'
import type { DayKey, SideQuest } from '../domain/types'
import { QuestlogDB } from './db'
import {
  completeSideQuest,
  createSideQuest,
  DEFAULT_SIDE_QUEST_ICON,
  deleteSideQuest,
  loadGameData,
  recordAchievementUnlocks,
  reopenSideQuest,
  updateSideQuest,
  type SideQuestDraft,
} from './repository'

const DAY = '2026-11-03'
const NEXT_DAY = '2026-11-04'
const PREV_DAY = '2026-11-02'

let database: QuestlogDB
let dbCounter = 0

beforeEach(async () => {
  database = new QuestlogDB(`questlog-test-side-quests-${++dbCounter}`)
  await database.open()
})

afterEach(async () => {
  vi.restoreAllMocks()
  await database.delete()
})

function sideQuestDraft(overrides: Partial<SideQuestDraft> = {}): SideQuestDraft {
  return { title: 'Steuererklärung', icon: '🧾', attribute: 'discipline', difficulty: 'hard', ...overrides }
}

async function storedSideQuest(id: string): Promise<SideQuest> {
  const quest = await database.sideQuests.get(id)
  if (!quest) throw new Error(`Nebenquest ${id} fehlt`)
  return quest
}

async function stateOn(today: DayKey) {
  return deriveGameState(await loadGameData(database), today)
}

// ---------------------------------------------------------------------------

describe('createSideQuest', () => {
  it('legt eine offene Nebenquest getrimmt an – createdDay = today, order = max + 1', async () => {
    const first = await createSideQuest(
      sideQuestDraft({ title: '  Steuererklärung ', description: ' Belege sortieren ', dueDay: '2026-11-10' }),
      DAY,
      database,
    )
    const second = await createSideQuest(sideQuestDraft({ title: 'Keller', icon: ' ', dueDay: '' }), NEXT_DAY, database)

    expect(first).toStrictEqual({
      id: first.id,
      title: 'Steuererklärung',
      icon: '🧾',
      description: 'Belege sortieren',
      attribute: 'discipline',
      difficulty: 'hard',
      dueDay: '2026-11-10',
      createdDay: DAY,
      order: 0,
    })
    expect(await storedSideQuest(first.id)).toStrictEqual(first)
    expect(second).toMatchObject({ icon: DEFAULT_SIDE_QUEST_ICON, createdDay: NEXT_DAY, order: 1 })
    for (const key of ['dueDay', 'description', 'doneDay']) expect(key in second).toBe(false)
  })

  it('erlaubt einen Termin in der Vergangenheit (gleich überfällig)', async () => {
    const quest = await createSideQuest(sideQuestDraft({ dueDay: PREV_DAY }), DAY, database)
    const state = await stateOn(DAY)
    expect(state.sideQuests.find((entry) => entry.quest.id === quest.id)).toMatchObject({ overdue: true, done: false })
  })

  it.each([
    ['ohne Namen', { title: '  ' }, 'Die Nebenquest braucht einen Namen.'],
    ['unbekanntes Attribut', { attribute: 'luck' as never }, 'Unbekanntes Attribut.'],
    ['unbekannte Schwierigkeit', { difficulty: 'legendary' as never }, 'Unbekannte Schwierigkeit.'],
    ['ungültiger Termin', { dueDay: '10.11.2026' }, 'Ungültiges Datum für den Termin: 10.11.2026 (erwartet JJJJ-MM-TT).'],
  ])('lehnt ab: %s', async (_label, overrides, message) => {
    await expect(createSideQuest(sideQuestDraft(overrides), DAY, database)).rejects.toThrow(message)
    expect(await database.sideQuests.count()).toBe(0)
  })

  it('verlangt einen gültigen Spieltag', async () => {
    await expect(createSideQuest(sideQuestDraft(), 'heute', database)).rejects.toThrow('Ungültiges Datum: heute')
  })
})

describe('updateSideQuest', () => {
  it('ändert nur die Felder im Patch; Anlagetag, Reihenfolge und Erledigung bleiben', async () => {
    const quest = await createSideQuest(sideQuestDraft({ dueDay: '2026-11-10' }), PREV_DAY, database)
    await completeSideQuest(quest.id, DAY, database)
    await updateSideQuest(quest.id, { title: 'Steuer 2026', difficulty: 'epic', attribute: 'wisdom' }, database)
    expect(await storedSideQuest(quest.id)).toStrictEqual({
      ...quest,
      title: 'Steuer 2026',
      difficulty: 'epic',
      attribute: 'wisdom',
      doneDay: DAY,
    })
  })

  it('entfernt Termin und Beschreibung bei explizitem undefined bzw. leerem Wert', async () => {
    const quest = await createSideQuest(sideQuestDraft({ description: 'Belege', dueDay: '2026-11-10' }), DAY, database)
    await updateSideQuest(quest.id, { dueDay: undefined, description: '' }, database)
    const stored = await storedSideQuest(quest.id)
    expect('dueDay' in stored).toBe(false)
    expect('description' in stored).toBe(false)

    await updateSideQuest(quest.id, { dueDay: '2026-12-01' }, database)
    expect((await storedSideQuest(quest.id)).dueDay).toBe('2026-12-01')
    await updateSideQuest(quest.id, { title: 'Nur der Titel' }, database)
    expect((await storedSideQuest(quest.id)).dueDay).toBe('2026-12-01')
  })

  it('prüft wie beim Anlegen und ändert bei Fehlern nichts', async () => {
    const quest = await createSideQuest(sideQuestDraft(), DAY, database)
    await expect(updateSideQuest(quest.id, { dueDay: '2026-02-30' }, database)).rejects.toThrow('Ungültiges Datum für den Termin')
    await expect(updateSideQuest(quest.id, { title: '' }, database)).rejects.toThrow('Die Nebenquest braucht einen Namen.')
    expect(await storedSideQuest(quest.id)).toStrictEqual(quest)
  })

  it('wirft für eine unbekannte Nebenquest', async () => {
    await expect(updateSideQuest('weg', { title: 'X' }, database)).rejects.toThrow('Diese Nebenquest gibt es nicht (mehr).')
  })
})

describe('Lebenszyklus: erledigen, wieder öffnen, löschen', () => {
  it('erledigt am Spieltag – XP an Charakter und Attribut, ohne Perfekten Tag', async () => {
    const quest = await createSideQuest(sideQuestDraft({ difficulty: 'hard', attribute: 'discipline' }), DAY, database)
    expect((await stateOn(DAY)).level.totalXp).toBe(0)

    await completeSideQuest(quest.id, DAY, database)
    expect(await storedSideQuest(quest.id)).toStrictEqual({ ...quest, doneDay: DAY })
    const state = await stateOn(DAY)
    expect(state.totals).toMatchObject({ xpFromSideQuests: 40, sideQuestsCompleted: 1, perfectDays: 0 })
    expect(state.level.totalXp).toBe(40)
    expect(state.attributes.discipline.totalXp).toBe(40)
    expect(state.sideQuests.map((entry) => [entry.quest.id, entry.done])).toEqual([[quest.id, true]])
    // Am nächsten Tag zählt sie weiter, steht aber nicht mehr in der Liste.
    expect((await stateOn(NEXT_DAY)).sideQuests).toEqual([])
    expect((await stateOn(NEXT_DAY)).level.totalXp).toBe(40)
  })

  it('doppeltes Erledigen verschiebt den Tag nicht; ein späterer Tag wird vorgezogen', async () => {
    const quest = await createSideQuest(sideQuestDraft(), PREV_DAY, database)
    await completeSideQuest(quest.id, DAY, database)
    await completeSideQuest(quest.id, NEXT_DAY, database)
    expect((await storedSideQuest(quest.id)).doneDay).toBe(DAY)
    await completeSideQuest(quest.id, DAY, database)
    expect((await storedSideQuest(quest.id)).doneDay).toBe(DAY)
    // Tageswechsel später gelegt: „heute“ ist wieder gestern → die Erledigung zählt sofort.
    await completeSideQuest(quest.id, PREV_DAY, database)
    expect((await storedSideQuest(quest.id)).doneDay).toBe(PREV_DAY)
  })

  it('wieder öffnen nimmt die XP zurück; offen bleibt offen', async () => {
    const quest = await createSideQuest(sideQuestDraft(), DAY, database)
    await reopenSideQuest(quest.id, database) // offen → unverändert
    expect(await storedSideQuest(quest.id)).toStrictEqual(quest)

    await completeSideQuest(quest.id, DAY, database)
    await reopenSideQuest(quest.id, database)
    expect(await storedSideQuest(quest.id)).toStrictEqual(quest)
    const state = await stateOn(DAY)
    expect(state.totals.xpFromSideQuests).toBe(0)
    expect(state.sideQuests.map((entry) => entry.done)).toEqual([false])
  })

  it('löscht endgültig (auch erledigte samt XP); unbekannte ändern nichts', async () => {
    const keep = await createSideQuest(sideQuestDraft({ title: 'Bleibt' }), DAY, database)
    const gone = await createSideQuest(sideQuestDraft({ title: 'Weg' }), DAY, database)
    await completeSideQuest(gone.id, DAY, database)

    await deleteSideQuest(gone.id, database)
    await deleteSideQuest('gibt-es-nicht', database)
    expect((await loadGameData(database)).sideQuests).toStrictEqual([keep])
    expect((await stateOn(DAY)).totals.xpFromSideQuests).toBe(0)
  })

  it('wirft für unbekannte Nebenquests und ungültige Tage', async () => {
    await expect(completeSideQuest('weg', DAY, database)).rejects.toThrow('Diese Nebenquest gibt es nicht (mehr).')
    await expect(reopenSideQuest('weg', database)).rejects.toThrow('Diese Nebenquest gibt es nicht (mehr).')
    const quest = await createSideQuest(sideQuestDraft(), DAY, database)
    await expect(completeSideQuest(quest.id, '2026-13-01', database)).rejects.toThrow('Ungültiges Datum')
    expect(await storedSideQuest(quest.id)).toStrictEqual(quest)
  })

  it('loadGameData sortiert nach order', async () => {
    const a = await createSideQuest(sideQuestDraft({ title: 'A' }), DAY, database)
    const b = await createSideQuest(sideQuestDraft({ title: 'B' }), DAY, database)
    await database.sideQuests.update(a.id, { order: 7 })
    expect((await loadGameData(database)).sideQuests?.map((quest) => quest.id)).toEqual([b.id, a.id])
  })
})

describe('recordAchievementUnlocks', () => {
  it('speichert neue Freischaltungen', async () => {
    await recordAchievementUnlocks([{ id: 'streak-7', day: DAY }], database)
    expect((await loadGameData(database)).achievementUnlocks).toStrictEqual([{ id: 'streak-7', day: DAY }])
  })

  it('ist idempotent und überschreibt nie einen gespeicherten Tag', async () => {
    await recordAchievementUnlocks([{ id: 'streak-7', day: DAY }], database)
    await recordAchievementUnlocks([{ id: 'streak-7', day: DAY }], database)
    await recordAchievementUnlocks([{ id: 'streak-7', day: PREV_DAY }, { id: 'quests-10', day: NEXT_DAY }], database)
    expect((await loadGameData(database)).achievementUnlocks).toStrictEqual([
      { id: 'streak-7', day: DAY },
      { id: 'quests-10', day: NEXT_DAY },
    ])
  })

  it('nimmt bei doppelten IDs in einem Aufruf den frühesten Tag', async () => {
    await recordAchievementUnlocks(
      [
        { id: 'quests-10', day: NEXT_DAY },
        { id: 'quests-10', day: PREV_DAY },
        { id: 'quests-10', day: DAY },
      ],
      database,
    )
    expect((await loadGameData(database)).achievementUnlocks).toStrictEqual([{ id: 'quests-10', day: PREV_DAY }])
  })

  it('verträgt gleichzeitige Aufrufe mit denselben Erfolgen', async () => {
    await Promise.all([
      recordAchievementUnlocks([{ id: 'streak-7', day: DAY }], database),
      recordAchievementUnlocks([{ id: 'streak-7', day: DAY }, { id: 'quests-10', day: DAY }], database),
      recordAchievementUnlocks([{ id: 'quests-10', day: DAY }], database),
    ])
    expect((await loadGameData(database)).achievementUnlocks).toStrictEqual([
      { id: 'quests-10', day: DAY },
      { id: 'streak-7', day: DAY },
    ])
  })

  it('leere Liste → nichts passiert', async () => {
    await recordAchievementUnlocks([], database)
    expect('achievementUnlocks' in (await loadGameData(database))).toBe(false)
  })

  it.each([
    ['leere ID', [{ id: '', day: DAY }], 'Ungültiger Erfolg.'],
    ['ungültiger Tag', [{ id: 'streak-7', day: '2026-11-31' }], 'Ungültiges Datum eines Erfolgs'],
  ])('lehnt ab: %s – und speichert auch die gültigen Einträge nicht', async (_label, invalid, message) => {
    await expect(recordAchievementUnlocks([{ id: 'quests-10', day: DAY }, ...invalid], database)).rejects.toThrow(message)
    expect(await database.achievementUnlocks.count()).toBe(0)
  })

  it('gespeicherte Freischaltungen bleiben, auch wenn der Wert später sinkt', async () => {
    const quest = await createSideQuest(sideQuestDraft(), DAY, database)
    await completeSideQuest(quest.id, DAY, database)
    const unlocked = (await stateOn(DAY)).achievements.filter((entry) => entry.unlocked)
    expect(unlocked.length).toBeGreaterThan(0)
    await recordAchievementUnlocks(
      unlocked.map((entry) => ({ id: entry.definition.id, day: DAY })),
      database,
    )

    await deleteSideQuest(quest.id, database)
    const after = await stateOn(DAY)
    for (const entry of unlocked) {
      expect(after.achievements.find((a) => a.definition.id === entry.definition.id)).toMatchObject({
        unlocked: true,
        unlockedDay: DAY,
      })
    }
  })
})
