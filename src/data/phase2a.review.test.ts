/**
 * Phase 2a – unabhängige Prüfung (Review) der Datenschicht: Gold über echte Repository-Abläufe (Einlösen,
 * Rückgängig, gelöschte Quest), Nebenquests an der Tagesgrenze, Dauerhaftigkeit der Erfolge, Upgrade einer
 * Version-2-Datenbank mit echtem Verlauf, Backup-Rundreise, Reset und Laufzeit mit großem Datenbestand.
 */
import 'fake-indexeddb/auto'
import { Dexie } from 'dexie'
import { afterEach, describe, expect, it } from 'vitest'
import { addDays, dayRange } from '../domain/dates'
import { deriveGameState } from '../domain/engine'
import { completeRange, makeCompletion, makeHabit, makeMainQuest, makePurchase, makeSideQuest } from '../domain/testing'
import type { Completion, DayKey, Habit } from '../domain/types'
import { createBackup, parseBackup, restoreBackup, type BackupFile } from './backup'
import { KV_KEYS, QuestlogDB } from './db'
import {
  completeSideQuest,
  createHabit,
  createReward,
  createSideQuest,
  deleteHabit,
  loadGameData,
  missingGoldMessage,
  purchaseReward,
  recordAchievementUnlocks,
  reopenSideQuest,
  resetAllData,
  saveProfile,
  toggleCompletion,
  undoPurchase,
} from './repository'

const START: DayKey = '2026-10-05' // Montag
const TODAY: DayKey = '2026-10-16'

const databases: QuestlogDB[] = []
const rawNames: string[] = []
let counter = 0

function freshDatabase(): QuestlogDB {
  const database = new QuestlogDB(`questlog-test-review-2a-${++counter}`)
  databases.push(database)
  return database
}

afterEach(async () => {
  await Promise.all(databases.splice(0).map((database) => database.delete()))
  await Promise.all(rawNames.splice(0).map((name) => Dexie.delete(name)))
})

async function stateOf(database: QuestlogDB, today: DayKey = TODAY) {
  return deriveGameState(await loadGameData(database), today)
}

/** Leichte tägliche Quest, an `days` Tagen ab START abgehakt: 10, 11, 11, 12, … XP (Streak-Bonus). */
async function seedReading(database: QuestlogDB, days: number): Promise<Habit> {
  const habit = await createHabit(
    { title: 'Lesen', icon: '📖', attribute: 'intellect', difficulty: 'easy', schedule: { type: 'daily' } },
    START,
    database,
  )
  for (const day of dayRange(START, addDays(START, days - 1))) await toggleCompletion(habit.id, day, database)
  return habit
}

describe('Gold über echte Abläufe', () => {
  it('Einlösen zieht genau den Preis ab, Rückgängig gibt ihn zurück; einmalige Belohnung nur einmal', async () => {
    const database = freshDatabase()
    await seedReading(database, 12) // 155 Quest-XP + 41 Perfekte-Tage-Bonus = 196 XP → 98 Gold aus XP
    const before = (await stateOf(database)).gold
    expect(before.fromXp).toBe(98)
    expect(before.balance).toBe(98 + before.fromAchievements)

    const headphones = await createReward({ title: 'Kopfhörer', icon: '🎧', price: 60, repeatable: false }, database)
    const purchase = await purchaseReward(headphones.id, TODAY, database)
    expect(purchase).toMatchObject({ price: 60, day: TODAY, title: 'Kopfhörer', rewardId: headphones.id })
    const after = (await stateOf(database)).gold
    expect(after).toMatchObject({ fromXp: 98, spent: 60 })
    expect(after.balance).toBe(after.earned - 60)

    await expect(purchaseReward(headphones.id, TODAY, database)).rejects.toThrow('Diese Belohnung hast du schon eingelöst.')
    expect(await database.purchases.count()).toBe(1)

    await undoPurchase(purchase.id, TODAY, database)
    const undone = (await stateOf(database)).gold
    expect(undone.spent).toBe(0)
    // Der Erfolg „erste Einlösung“ bleibt nur, wenn er gespeichert wurde – hier nicht: Guthaben wie vorher
    expect(undone.balance).toBe(before.balance)
    await expect(purchaseReward(headphones.id, TODAY, database)).resolves.toMatchObject({ price: 60 })
  })

  it('eine gelöschte Quest kann das Guthaben negativ machen – Einlösen nennt den genauen Fehlbetrag', async () => {
    const database = freshDatabase()
    const reading = await seedReading(database, 12)
    const pizza = await createReward({ title: 'Pizza', icon: '🍕', price: 80, repeatable: true }, database)
    await purchaseReward(pizza.id, TODAY, database)
    await deleteHabit(reading.id, TODAY, database)

    const gold = (await stateOf(database)).gold
    expect(gold.fromXp).toBe(0)
    expect(gold.balance).toBe(gold.fromAchievements - 80)
    const missing = 80 - gold.balance
    const purchasesBefore = await database.purchases.toArray()
    await expect(purchaseReward(pizza.id, TODAY, database)).rejects.toThrow(missingGoldMessage(missing))
    // Ein abgelehnter Kauf schreibt nichts
    expect(await database.purchases.toArray()).toStrictEqual(purchasesBefore)
  })

  it('gespeicherte Erfolge bleiben samt Gold, auch wenn die Quest gelöscht wird', async () => {
    const database = freshDatabase()
    const reading = await seedReading(database, 12)
    const state = await stateOf(database)
    const reached = state.achievements.filter((a) => a.unlocked)
    expect(reached.map((a) => a.definition.id)).toEqual(expect.arrayContaining(['quests-10', 'perfect-days-7', 'streak-7']))
    await recordAchievementUnlocks(
      reached.map((a) => ({ id: a.definition.id, day: TODAY })),
      database,
    )
    await deleteHabit(reading.id, TODAY, database)
    const after = await stateOf(database)
    expect(after.totals.questsCompleted).toBe(0)
    expect(after.achievements.filter((a) => a.unlocked).map((a) => a.definition.id)).toEqual(reached.map((a) => a.definition.id))
    expect(after.gold.fromAchievements).toBe(state.gold.fromAchievements)
  })

  it('Nebenquests an der Tagesgrenze: zählen ab ihrem Erledigungstag, wieder geöffnet ohne XP', async () => {
    const database = freshDatabase()
    const quest = await createSideQuest(
      { title: 'Steuererklärung', icon: '🧾', attribute: 'discipline', difficulty: 'epic', dueDay: TODAY },
      START,
      database,
    )
    await completeSideQuest(quest.id, TODAY, database)
    expect((await stateOf(database, addDays(TODAY, -1))).totals.xpFromSideQuests).toBe(0)
    const today = await stateOf(database)
    expect(today.totals.xpFromSideQuests).toBe(80)
    expect(today.attributes.discipline.totalXp).toBe(80)
    expect(today.gold.fromXp).toBe(40)
    expect(today.sideQuests.map((s) => [s.quest.id, s.done, s.dueToday])).toEqual([[quest.id, true, true]])
    // Am nächsten Spieltag ist sie aus der Liste, ihre XP bleiben
    const tomorrow = await stateOf(database, addDays(TODAY, 1))
    expect(tomorrow.sideQuests).toEqual([])
    expect(tomorrow.totals.xpFromSideQuests).toBe(80)

    await reopenSideQuest(quest.id, database)
    const reopened = await stateOf(database)
    expect(reopened.totals.xpFromSideQuests).toBe(0)
    expect(reopened.sideQuests[0]).toMatchObject({ done: false, dueToday: true, overdue: false })
    expect((await stateOf(database, addDays(TODAY, 1))).sideQuests[0]).toMatchObject({ overdue: true })
  })
})

describe('Upgrade einer Version-2-Datenbank mit echtem Verlauf', () => {
  it('rechnet Streak-Bonus und Gold rückwirkend und erlaubt sofort Einlösungen', async () => {
    const name = `questlog-test-review-upgrade-${++counter}`
    rawNames.push(name)
    const legacy = new Dexie(name)
    legacy.version(2).stores({ habits: '&id, order, mainQuestId', completions: '&id, habitId, day', mainQuests: '&id', kv: '&key' })
    const habit = makeHabit({ id: 'h1', title: 'Lesen', difficulty: 'easy', attribute: 'intellect', createdDay: START })
    const weekly = makeHabit({ id: 'h2', title: 'Laufen', difficulty: 'hard', order: 1, schedule: { type: 'weekly', times: 1 }, createdDay: START })
    const completions: Completion[] = [
      ...completeRange(habit, START, TODAY), // 155 + 41
      makeCompletion(weekly, '2026-10-06'), // KW 1: 40
      makeCompletion(weekly, '2026-10-13'), // KW 2: 42
    ]
    await legacy.table('habits').bulkAdd([habit, weekly])
    await legacy.table('completions').bulkAdd(completions)
    await legacy.table('mainQuests').add(makeMainQuest({ id: 'q', startDay: START }))
    await legacy.table('kv').bulkAdd([
      { key: KV_KEYS.profile, value: { name: 'Aria', avatar: '🧙', createdDay: START } },
      { key: KV_KEYS.settings, value: { dayStartHour: 4, effects: true } },
    ])
    legacy.close()

    const database = new QuestlogDB(name)
    await database.open()
    try {
      expect(database.verno).toBe(5)
      const state = await stateOf(database)
      // Perfekter Tag: an den Tagen der Wochenquest steigt der Bonus mit (06.: 11 + 40 = 51 → 13; 13.: 14 + 42 = 56 → 14)
      // statt 3 bzw. 4 → +10 und +10 gegenüber der Tagesquest allein
      expect(state.totals).toMatchObject({ xpFromQuests: 155 + 82, xpFromStreakBonus: 35 + 2, xpFromPerfectDays: 41 + 20 })
      expect(state.gold.fromXp).toBe(Math.floor((155 + 82 + 61) / 2))
      const treat = await createReward({ title: 'Kino', icon: '🎬', price: 149, repeatable: true }, database)
      await expect(purchaseReward(treat.id, TODAY, database)).resolves.toMatchObject({ price: 149 })
      const after = (await stateOf(database)).gold
      // Die erste Einlösung schaltet „Beim Händler“ frei (Bronze, +25 Gold)
      expect(after).toMatchObject({ spent: 149, fromAchievements: state.gold.fromAchievements + 25 })
      expect(after.balance).toBe(state.gold.balance - 149 + 25)
    } finally {
      database.close()
    }
  })
})

describe('Backup-Rundreise mit Phase-2a-Daten', () => {
  async function seedEverything(database: QuestlogDB) {
    await saveProfile({ name: 'Aria', avatar: '🧙', createdDay: START }, database)
    const reading = await seedReading(database, 12)
    const doomed = await createHabit(
      { title: 'Alt', icon: '🗑️', attribute: 'wisdom', difficulty: 'easy', schedule: { type: 'daily' } },
      START,
      database,
    )
    await deleteHabit(doomed.id, TODAY, database)
    const pizza = await createReward(
      { title: 'Pizza', icon: '🍕', description: 'Verdient.', price: 40, repeatable: true },
      database,
    )
    await createReward({ title: 'Kopfhörer', icon: '🎧', price: 2500, repeatable: false }, database)
    await purchaseReward(pizza.id, TODAY, database)
    const tax = await createSideQuest(
      { title: 'Steuer', icon: '🧾', attribute: 'discipline', difficulty: 'hard', dueDay: '2026-10-20' },
      START,
      database,
    )
    await completeSideQuest(tax.id, '2026-10-10', database)
    await createSideQuest({ title: 'Zahnarzt', icon: '🦷', attribute: 'vitality', difficulty: 'easy' }, TODAY, database)
    await recordAchievementUnlocks([{ id: 'quests-10', day: '2026-10-14' }], database)
    return { reading }
  }

  it('Export → JSON → Import ergibt dieselben Daten und denselben Spielzustand', async () => {
    const source = freshDatabase()
    await seedEverything(source)
    const backup = await createBackup(new Date('2026-10-16T20:00:00Z'), source)
    const parsed = parseBackup(JSON.stringify(backup))
    if (!parsed.ok) throw new Error(parsed.error)

    const target = freshDatabase()
    await restoreBackup(parsed.backup, target)
    const original = await loadGameData(source)
    const restored = await loadGameData(target)
    expect(restored).toStrictEqual(original)
    expect(restored.rewards).toHaveLength(2)
    expect(restored.purchases).toHaveLength(1)
    expect(restored.sideQuests).toHaveLength(2)
    expect(restored.achievementUnlocks).toStrictEqual([{ id: 'quests-10', day: '2026-10-14' }])
    expect(restored.deletedHabits).toHaveLength(1)
    expect(deriveGameState(restored, TODAY)).toStrictEqual(deriveGameState(original, TODAY))
  })

  it('ein altes Backup ohne Phase-2a-Listen leert Schatzkammer, Nebenquests und Erfolge', async () => {
    const database = freshDatabase()
    await seedEverything(database)
    const backup = await createBackup(new Date('2026-10-16T20:00:00Z'), database)
    const old: BackupFile = { ...backup, data: { ...backup.data } }
    delete old.data.rewards
    delete old.data.purchases
    delete old.data.sideQuests
    delete old.data.achievementUnlocks
    const parsed = parseBackup(JSON.parse(JSON.stringify(old)))
    if (!parsed.ok) throw new Error(parsed.error)
    await restoreBackup(parsed.backup, database)
    for (const table of [database.rewards, database.purchases, database.sideQuests, database.achievementUnlocks]) {
      expect(await table.count()).toBe(0)
    }
    const state = await stateOf(database)
    expect(state.gold.spent).toBe(0)
    expect(state.totals.xpFromSideQuests).toBe(0)
  })

  it('lehnt Belohnungen ab, die das Repository nie speichern würde (Preis über 1.000.000 Gold)', async () => {
    const database = freshDatabase()
    await seedEverything(database)
    const backup = await createBackup(new Date('2026-10-16T20:00:00Z'), database)
    const rewards = (backup.data.rewards ?? []).map((reward, i) => (i === 0 ? { ...reward, price: 1_000_001 } : reward))
    const result = parseBackup({ ...backup, data: { ...backup.data, rewards } })
    expect(result.ok).toBe(false)
  })

  it('resetAllData leert alles – danach lädt ein leerer Stand', async () => {
    const database = freshDatabase()
    await seedEverything(database)
    await resetAllData(database)
    expect(await loadGameData(database)).toStrictEqual({
      settings: { dayStartHour: 4, effects: true },
      habits: [],
      completions: [],
      mainQuests: [],
    })
  })
})

describe('Laufzeit mit großem Datenbestand', () => {
  it('3 Jahre × 12 Quests + 200 Nebenquests + 100 Einlösungen: Laden, Auswerten und Einlösen bleiben zügig', async () => {
    const database = freshDatabase()
    const first: DayKey = '2023-11-06'
    const today: DayKey = '2026-11-04'
    const days = dayRange(first, today)
    const habits = Array.from({ length: 12 }, (_, i) =>
      makeHabit({
        id: `h${i}`,
        title: `Quest ${i}`,
        order: i,
        createdDay: first,
        difficulty: (['easy', 'medium', 'hard', 'epic'] as const)[i % 4],
        schedule: i % 3 === 0 ? { type: 'weekly', times: 3 } : i % 3 === 1 ? { type: 'weekdays', days: [1, 3, 5] } : { type: 'daily' },
        ...(i % 4 === 0 ? { pauses: [{ from: '2025-08-01', until: '2025-08-15' }] } : {}),
      }),
    )
    const completions: Completion[] = []
    habits.forEach((habit, i) => {
      days.forEach((day, k) => {
        if ((k * 7 + i * 3) % 10 < 8) completions.push(makeCompletion(habit, day))
      })
    })
    await database.habits.bulkAdd(habits)
    await database.completions.bulkAdd(completions)
    await database.sideQuests.bulkAdd(
      Array.from({ length: 200 }, (_, i) =>
        makeSideQuest({ id: `s${i}`, order: i, createdDay: first, ...(i % 2 === 0 ? { doneDay: days[i * 5] } : { dueDay: days[i * 5] }) }),
      ),
    )
    await database.purchases.bulkAdd(
      Array.from({ length: 100 }, (_, i) => makePurchase({ id: `p${i}`, price: 10, day: days[i * 10], createdAt: i })),
    )
    await saveProfile({ name: 'Aria', avatar: '🧙', createdDay: first }, database)
    const reward = await createReward({ title: 'Pizza', icon: '🍕', price: 400, repeatable: true }, database)

    await stateOf(database, today) // Aufwärmen (JIT)
    const loadStart = performance.now()
    const data = await loadGameData(database)
    const loadMs = performance.now() - loadStart
    const deriveStart = performance.now()
    const state = deriveGameState(data, today)
    const deriveMs = performance.now() - deriveStart
    const buyStart = performance.now()
    await purchaseReward(reward.id, today, database)
    const buyMs = performance.now() - buyStart

    expect(state.totals.questsCompleted).toBe(completions.length)
    expect(state.totals.sideQuestsCompleted).toBe(100)
    expect(state.gold.spent).toBe(1000)
    expect(state.gold.balance).toBeGreaterThan(400)
    // Großzügige Grenzen gegen quadratische Ausreißer (fake-indexeddb ist deutlich langsamer als ein Browser)
    expect(deriveMs).toBeLessThan(1000)
    // Gemessen (Review, fake-indexeddb): Laden ≈ 35 ms, Auswerten ≈ 50 ms, Einlösen ≈ 80 ms
    expect(loadMs + buyMs).toBeLessThan(10_000)
  }, 60_000)
})
