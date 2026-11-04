import 'fake-indexeddb/auto'
import { Dexie } from 'dexie'
import { afterEach, describe, expect, it } from 'vitest'
import { deriveGameState } from '../domain/engine'
import { makeBossVictory, makeChest, makeCompletion, makeHabit, makeMainQuest } from '../domain/testing'
import { allTables, KV_KEYS, legacyBlueprintRef, QuestlogDB } from './db'
import {
  addRestPeriod,
  createReward,
  createSideQuest,
  loadGameData,
  openChest,
  purchaseReward,
  recordAchievementUnlocks,
  recordProgress,
  resetAllData,
  settleHpDays,
} from './repository'

/** Schema der Versionen 1 und 2 (unverändert). */
const LEGACY_SCHEMA = { habits: '&id, order, mainQuestId', completions: '&id, habitId, day', mainQuests: '&id', kv: '&key' }
/** Schema der Version 3 (Phase 2a). */
const SCHEMA_V3 = {
  ...LEGACY_SCHEMA,
  rewards: '&id, order',
  purchases: '&id, day',
  sideQuests: '&id, order',
  achievementUnlocks: '&id',
}
/** Schema der Version 4 (Phase 2b). */
const SCHEMA_V4 = { ...SCHEMA_V3, hpLedger: '&day', restPeriods: '&id, from' }
/** Aktuelle Version der Datenbank. */
const CURRENT_VERSION = 5

const names: string[] = []

afterEach(async () => {
  await Promise.all(names.splice(0).map((name) => Dexie.delete(name)))
})

describe('legacyBlueprintRef', () => {
  it('erkennt nur die frühere Gelehrten-Kampagne ohne Herkunft', () => {
    expect(legacyBlueprintRef({ title: 'Der Weg des Gelehrten' })).toEqual({ id: 'scholar', level: 'beginner' })
    expect(legacyBlueprintRef({ title: '  Der Weg des Gelehrten ' })).toEqual({ id: 'scholar', level: 'beginner' })
    expect(legacyBlueprintRef({ title: 'Halbmarathon' })).toBeUndefined()
    expect(
      legacyBlueprintRef({ title: 'Der Weg des Gelehrten', blueprint: { id: 'scholar', level: 'advanced' } }),
    ).toBeUndefined()
  })
})

describe('QuestlogDB – Version 2', () => {
  it('ergänzt beim Upgrade die Herkunft der früheren Gelehrten-Kampagne, sonst nichts', async () => {
    const name = 'questlog-test-db-upgrade'
    names.push(name)
    // Stand vor der Kampagnen-Bibliothek: Version 1 ohne `blueprint`.
    const legacy = new Dexie(name)
    legacy.version(1).stores(LEGACY_SCHEMA)
    const scholar = makeMainQuest({ id: 'scholar-old', title: 'Der Weg des Gelehrten' })
    const own = makeMainQuest({ id: 'own', title: 'Halbmarathon' })
    await legacy.table('mainQuests').bulkAdd([scholar, own])
    legacy.close()

    const upgraded = new QuestlogDB(name)
    await upgraded.open()
    expect(await upgraded.mainQuests.get('scholar-old')).toStrictEqual({ ...scholar, blueprint: { id: 'scholar', level: 'beginner' } })
    expect(await upgraded.mainQuests.get('own')).toStrictEqual(own)
    upgraded.close()
  })

  it('eine neue Datenbank startet leer', async () => {
    const name = 'questlog-test-db-fresh'
    names.push(name)
    const fresh = new QuestlogDB(name)
    await fresh.open()
    expect(fresh.verno).toBe(CURRENT_VERSION)
    expect(await fresh.mainQuests.count()).toBe(0)
    fresh.close()
  })
})

describe('QuestlogDB – Version 3 (Phase 2a)', () => {
  it('Upgrade von Version 2 behält alle Daten; die neuen Tabellen starten leer und sind nutzbar', async () => {
    const name = 'questlog-test-db-upgrade-v3'
    names.push(name)
    // Stand nach der Kampagnen-Bibliothek (Version 2): Quests, Erledigungen, Kampagnen, kv-Einträge.
    const legacy = new Dexie(name)
    legacy.version(2).stores(LEGACY_SCHEMA)
    const habit = makeHabit({ id: 'h1', title: 'Lesen', createdDay: '2026-10-01', archivedDay: '2026-10-20' })
    const completion = makeCompletion(habit, '2026-10-02')
    const quest = makeMainQuest({ id: 'q1', title: 'Der Weg des Gelehrten', blueprint: { id: 'scholar', level: 'advanced' } })
    const tombstone = { id: 'weg', createdDay: '2026-10-01', archivedDay: '2026-10-05', schedule: { type: 'daily' } }
    await legacy.table('habits').add(habit)
    await legacy.table('completions').add(completion)
    await legacy.table('mainQuests').add(quest)
    await legacy.table('kv').bulkAdd([
      { key: KV_KEYS.profile, value: { name: 'Aria', avatar: '🧙', createdDay: '2026-10-01' } },
      { key: KV_KEYS.settings, value: { dayStartHour: 5 } },
      { key: KV_KEYS.deletedHabits, value: [tombstone] },
    ])
    legacy.close()

    const upgraded = new QuestlogDB(name)
    await upgraded.open()
    expect(upgraded.verno).toBe(CURRENT_VERSION)
    expect(await loadGameData(upgraded)).toStrictEqual({
      profile: { name: 'Aria', avatar: '🧙', createdDay: '2026-10-01' },
      settings: { dayStartHour: 5, effects: true },
      habits: [habit],
      completions: [completion],
      mainQuests: [quest],
      deletedHabits: [tombstone],
    })
    for (const table of [upgraded.rewards, upgraded.purchases, upgraded.sideQuests, upgraded.achievementUnlocks]) {
      expect(await table.count()).toBe(0)
    }

    await createReward({ title: 'Pizza', icon: '🍕', price: 40, repeatable: true }, upgraded)
    await createSideQuest({ title: 'Steuer', icon: '🧾', attribute: 'discipline', difficulty: 'hard' }, '2026-11-03', upgraded)
    await recordAchievementUnlocks([{ id: 'streak-7', day: '2026-11-03' }], upgraded)
    const data = await loadGameData(upgraded)
    expect(data.rewards).toHaveLength(1)
    expect(data.sideQuests).toHaveLength(1)
    expect(data.achievementUnlocks).toStrictEqual([{ id: 'streak-7', day: '2026-11-03' }])
    upgraded.close()
  })

  it('Upgrade direkt von Version 1 wendet weiterhin die Herkunft aus Version 2 an', async () => {
    const name = 'questlog-test-db-upgrade-v1-v3'
    names.push(name)
    const legacy = new Dexie(name)
    legacy.version(1).stores(LEGACY_SCHEMA)
    const scholar = makeMainQuest({ id: 'scholar-old', title: 'Der Weg des Gelehrten' })
    await legacy.table('mainQuests').add(scholar)
    legacy.close()

    const upgraded = new QuestlogDB(name)
    await upgraded.open()
    expect(upgraded.verno).toBe(CURRENT_VERSION)
    expect(await upgraded.mainQuests.get('scholar-old')).toStrictEqual({ ...scholar, blueprint: { id: 'scholar', level: 'beginner' } })
    expect(await upgraded.rewards.count()).toBe(0)
    expect(await upgraded.hpLedger.count()).toBe(0)
    upgraded.close()
  })

  it('allTables umfasst jede Tabelle der Datenbank', () => {
    const database = new QuestlogDB('questlog-test-db-tables')
    names.push('questlog-test-db-tables')
    expect(allTables(database).map((table) => table.name).sort()).toEqual(database.tables.map((table) => table.name).sort())
    expect(database.tables.map((table) => table.name).sort()).toEqual([
      'achievementUnlocks',
      'bossVictories',
      'chests',
      'completions',
      'cosmeticUnlocks',
      'habits',
      'hpLedger',
      'kv',
      'mainQuests',
      'purchases',
      'restPeriods',
      'rewards',
      'sideQuests',
    ])
  })
})

describe('QuestlogDB – Version 4 (Phase 2b)', () => {
  const START = '2026-10-01'
  const TODAY = '2026-10-20'

  it('Upgrade von Version 3 behält alle Daten; Ledger und Rast starten leer, abgerechnet wird nie rückwirkend', async () => {
    const name = 'questlog-test-db-upgrade-v4'
    names.push(name)
    // Stand nach Phase 2a (Version 3): drei Wochen Verlauf, in denen die Hälfte der Tage verpasst wurde.
    const legacy = new Dexie(name)
    legacy.version(3).stores(SCHEMA_V3)
    const habit = makeHabit({ id: 'h1', title: 'Lesen', createdDay: START })
    const completions = ['2026-10-01', '2026-10-03', '2026-10-05', '2026-10-07'].map((day) => makeCompletion(habit, day))
    const reward = { id: 'r1', title: 'Pizza', icon: '🍕', price: 5, repeatable: true, order: 0, createdAt: 1 }
    const purchase = { id: 'p1', kind: 'reward', rewardId: 'r1', title: 'Pizza', icon: '🍕', price: 5, day: '2026-10-08', createdAt: 2 }
    await legacy.table('habits').add(habit)
    await legacy.table('completions').bulkAdd(completions)
    await legacy.table('rewards').add(reward)
    await legacy.table('purchases').add(purchase)
    await legacy.table('achievementUnlocks').add({ id: 'quests-1', day: START })
    await legacy.table('kv').bulkAdd([
      { key: KV_KEYS.profile, value: { name: 'Aria', avatar: '🧙', createdDay: START } },
      { key: KV_KEYS.settings, value: { dayStartHour: 5, effects: false } },
    ])
    legacy.close()

    const upgraded = new QuestlogDB(name)
    await upgraded.open()
    expect(upgraded.verno).toBe(CURRENT_VERSION)
    const before = await loadGameData(upgraded)
    expect(before).toStrictEqual({
      profile: { name: 'Aria', avatar: '🧙', createdDay: START },
      settings: { dayStartHour: 5, effects: false },
      habits: [habit],
      completions,
      mainQuests: [],
      rewards: [reward],
      purchases: [purchase],
      achievementUnlocks: [{ id: 'quests-1', day: START }],
    })
    expect(await upgraded.hpLedger.count()).toBe(0)
    expect(await upgraded.restPeriods.count()).toBe(0)

    // Der erste Start nach dem Update setzt nur den Beginn der Abrechnung – die verpassten Tage kosten nichts.
    expect(await settleHpDays(TODAY, upgraded)).toStrictEqual([])
    const after = await loadGameData(upgraded)
    expect(after.settings).toStrictEqual({ dayStartHour: 5, effects: false, penalties: { enabled: true, since: TODAY } })
    expect(after.hpLedger).toBeUndefined()

    // Die neuen Tabellen sind nutzbar und werden mit allem anderen zurückgesetzt.
    await addRestPeriod({ from: TODAY, until: '2026-10-22', note: 'Urlaub' }, TODAY, upgraded)
    await purchaseReward('r1', TODAY, upgraded)
    expect(await settleHpDays('2026-10-25', upgraded)).toHaveLength(4)
    expect((await loadGameData(upgraded)).restPeriods).toHaveLength(1)
    await resetAllData(upgraded)
    for (const table of allTables(upgraded)) expect(await table.count()).toBe(0)
    upgraded.close()
  })

  it('Upgrade direkt von Version 1 durchläuft alle Versionen', async () => {
    const name = 'questlog-test-db-upgrade-v1-v4'
    names.push(name)
    const legacy = new Dexie(name)
    legacy.version(1).stores(LEGACY_SCHEMA)
    const scholar = makeMainQuest({ id: 'scholar-old', title: 'Der Weg des Gelehrten' })
    await legacy.table('mainQuests').add(scholar)
    legacy.close()

    const upgraded = new QuestlogDB(name)
    await upgraded.open()
    expect(upgraded.verno).toBe(CURRENT_VERSION)
    expect(await upgraded.mainQuests.get('scholar-old')).toStrictEqual({ ...scholar, blueprint: { id: 'scholar', level: 'beginner' } })
    expect(await upgraded.hpLedger.count()).toBe(0)
    expect(await upgraded.restPeriods.count()).toBe(0)
    upgraded.close()
  })

  it('höchstens ein Ledger-Eintrag pro Tag (Schlüssel day), Rast-Zeiträume nach Beginn indiziert', async () => {
    const name = 'questlog-test-db-v4-keys'
    names.push(name)
    const database = new QuestlogDB(name)
    await database.open()
    const entry = { day: START, score: 'none' as const, frozen: false, hpDelta: 0, hpAfter: 50, maxHp: 50, penalties: true }
    await database.hpLedger.add(entry)
    await expect(database.hpLedger.add({ ...entry, score: 'missed' })).rejects.toThrow()
    expect(await database.hpLedger.get(START)).toStrictEqual(entry)
    await database.restPeriods.bulkAdd([
      { id: 'b', from: '2026-10-10', until: '2026-10-12', createdAt: 2 },
      { id: 'a', from: '2026-10-03', until: '2026-10-03', createdAt: 1 },
    ])
    expect((await database.restPeriods.orderBy('from').toArray()).map((period) => period.id)).toEqual(['a', 'b'])
    database.close()
  })
})

describe('QuestlogDB – Version 5 (Phase 3a)', () => {
  const START = '2026-10-05' // Montag
  const TODAY = '2026-10-21' // Mittwoch, drei Wochen später

  it('Upgrade von Version 4 behält alle Daten und den Spielstand; Boss-Siege, Truhen und Freischaltungen starten leer', async () => {
    const name = 'questlog-test-db-upgrade-v5'
    names.push(name)
    // Stand nach Phase 2b (Version 4): Verlauf, Schatzkammer, Erfolg, abgerechnete Tage, Rast.
    const legacy = new Dexie(name)
    legacy.version(4).stores(SCHEMA_V4)
    const habit = makeHabit({ id: 'h1', title: 'Lesen', attribute: 'intellect', createdDay: START })
    const completions = ['2026-10-05', '2026-10-06', '2026-10-12', '2026-10-19', '2026-10-20'].map((day) => makeCompletion(habit, day))
    const reward = { id: 'r1', title: 'Pizza', icon: '🍕', price: 5, repeatable: true, order: 0, createdAt: 1 }
    const purchase = { id: 'p1', kind: 'reward', rewardId: 'r1', title: 'Pizza', icon: '🍕', price: 5, day: '2026-10-08', createdAt: 2 }
    const ledger = { day: '2026-10-05', score: 'perfect', frozen: false, hpDelta: 0, hpAfter: 50, maxHp: 50, penalties: true }
    const rest = { id: 'rast', from: '2026-10-10', until: '2026-10-11', createdAt: 3 }
    await legacy.table('habits').add(habit)
    await legacy.table('completions').bulkAdd(completions)
    await legacy.table('rewards').add(reward)
    await legacy.table('purchases').add(purchase)
    await legacy.table('achievementUnlocks').add({ id: 'quests-1', day: START })
    await legacy.table('hpLedger').add(ledger)
    await legacy.table('restPeriods').add(rest)
    await legacy.table('kv').bulkAdd([
      { key: KV_KEYS.profile, value: { name: 'Aria', avatar: '🧙', createdDay: START } },
      { key: KV_KEYS.settings, value: { dayStartHour: 5, effects: false, penalties: { enabled: true, since: START }, hpIntroSeen: true } },
    ])
    legacy.close()

    const upgraded = new QuestlogDB(name)
    await upgraded.open()
    expect(upgraded.verno).toBe(CURRENT_VERSION)
    const data = await loadGameData(upgraded)
    expect(data).toStrictEqual({
      profile: { name: 'Aria', avatar: '🧙', createdDay: START },
      settings: { dayStartHour: 5, effects: false, penalties: { enabled: true, since: START }, hpIntroSeen: true },
      habits: [habit],
      completions,
      mainQuests: [],
      rewards: [reward],
      purchases: [purchase],
      achievementUnlocks: [{ id: 'quests-1', day: START }],
      hpLedger: [ledger],
      restPeriods: [rest],
    })
    for (const table of [upgraded.bossVictories, upgraded.chests, upgraded.cosmeticUnlocks]) {
      expect(await table.count()).toBe(0)
    }
    // Der Spielstand von Phase 2b bleibt (Level, XP, Gold ohne Truhen, HP) – Kampf und Beute kommen nur dazu.
    const state = deriveGameState(data, TODAY)
    expect(state.gold.fromChests).toBe(0)
    expect(state.gold.balance).toBe(state.gold.fromXp + state.gold.fromAchievements - 5)

    // Die neuen Tabellen sind nutzbar und werden mit allem anderen zurückgesetzt.
    await recordProgress(
      {
        bossVictories: [makeBossVictory('2026-10-12', { day: '2026-10-14' })],
        chests: [makeChest('boss:2026-10-12', { foundDay: '2026-10-14' })],
      },
      upgraded,
    )
    expect(await openChest('boss:2026-10-12', TODAY, upgraded)).toStrictEqual({ kind: 'gold', amount: 20 })
    const after = await loadGameData(upgraded)
    expect(after.bossVictories).toHaveLength(1)
    expect(after.chests?.[0].openedAt).toEqual(expect.any(Number))
    await resetAllData(upgraded)
    for (const table of allTables(upgraded)) expect(await table.count()).toBe(0)
    upgraded.close()
  })

  it('Upgrade direkt von Version 1 durchläuft alle Versionen bis 5', async () => {
    const name = 'questlog-test-db-upgrade-v1-v5'
    names.push(name)
    const legacy = new Dexie(name)
    legacy.version(1).stores(LEGACY_SCHEMA)
    const scholar = makeMainQuest({ id: 'scholar-old', title: 'Der Weg des Gelehrten' })
    await legacy.table('mainQuests').add(scholar)
    legacy.close()

    const upgraded = new QuestlogDB(name)
    await upgraded.open()
    expect(upgraded.verno).toBe(CURRENT_VERSION)
    expect(await upgraded.mainQuests.get('scholar-old')).toStrictEqual({ ...scholar, blueprint: { id: 'scholar', level: 'beginner' } })
    expect(await upgraded.chests.count()).toBe(0)
    upgraded.close()
  })

  it('höchstens ein Sieg pro Woche (Schlüssel weekStart), Truhen nach Fundtag indiziert, Freischaltungen je ID', async () => {
    const name = 'questlog-test-db-v5-keys'
    names.push(name)
    const database = new QuestlogDB(name)
    await database.open()
    await database.bossVictories.add(makeBossVictory('2026-10-12'))
    await expect(database.bossVictories.add(makeBossVictory('2026-10-12', { bossId: 'other' }))).rejects.toThrow()
    await database.chests.bulkAdd([
      makeChest('quest:b', { foundDay: '2026-10-14' }),
      makeChest('quest:a', { foundDay: '2026-10-13' }),
    ])
    expect((await database.chests.where('foundDay').equals('2026-10-14').toArray()).map((chest) => chest.id)).toEqual(['quest:b'])
    await database.cosmeticUnlocks.add({ id: 'aurora', kind: 'frame', day: '2026-10-14', source: 'chest' })
    await expect(database.cosmeticUnlocks.add({ id: 'aurora', kind: 'frame', day: '2026-10-15', source: 'chest' })).rejects.toThrow()
    database.close()
  })
})
