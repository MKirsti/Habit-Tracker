import 'fake-indexeddb/auto'
import { Dexie } from 'dexie'
import { afterEach, describe, expect, it } from 'vitest'
import { makeCompletion, makeHabit, makeMainQuest } from '../domain/testing'
import { allTables, KV_KEYS, legacyBlueprintRef, QuestlogDB } from './db'
import { createReward, createSideQuest, loadGameData, recordAchievementUnlocks } from './repository'

/** Schema der Versionen 1 und 2 (unverändert). */
const LEGACY_SCHEMA = { habits: '&id, order, mainQuestId', completions: '&id, habitId, day', mainQuests: '&id', kv: '&key' }

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
    expect(fresh.verno).toBe(3)
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
    expect(upgraded.verno).toBe(3)
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
    expect(upgraded.verno).toBe(3)
    expect(await upgraded.mainQuests.get('scholar-old')).toStrictEqual({ ...scholar, blueprint: { id: 'scholar', level: 'beginner' } })
    expect(await upgraded.rewards.count()).toBe(0)
    upgraded.close()
  })

  it('allTables umfasst jede Tabelle der Datenbank', () => {
    const database = new QuestlogDB('questlog-test-db-tables')
    names.push('questlog-test-db-tables')
    expect(allTables(database).map((table) => table.name).sort()).toEqual(database.tables.map((table) => table.name).sort())
    expect(database.tables.map((table) => table.name).sort()).toEqual([
      'achievementUnlocks',
      'completions',
      'habits',
      'kv',
      'mainQuests',
      'purchases',
      'rewards',
      'sideQuests',
    ])
  })
})
