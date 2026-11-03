import 'fake-indexeddb/auto'
import { Dexie } from 'dexie'
import { afterEach, describe, expect, it } from 'vitest'
import { makeMainQuest } from '../domain/testing'
import { legacyBlueprintRef, QuestlogDB } from './db'

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
    legacy.version(1).stores({ habits: '&id, order, mainQuestId', completions: '&id, habitId, day', mainQuests: '&id', kv: '&key' })
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
    expect(fresh.verno).toBe(2)
    expect(await fresh.mainQuests.count()).toBe(0)
    fresh.close()
  })
})
