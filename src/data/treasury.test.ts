import 'fake-indexeddb/auto'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { DEFAULT_SETTINGS } from '../domain/balancing'
import { deriveGameState } from '../domain/engine'
import type { DayKey, Reward } from '../domain/types'
import { QuestlogDB } from './db'
import {
  archiveReward,
  completeSideQuest,
  createReward,
  createSideQuest,
  DEFAULT_REWARD_ICON,
  deleteReward,
  loadGameData,
  MAX_REWARD_PRICE,
  missingGoldMessage,
  moveReward,
  purchaseReward,
  recordAchievementUnlocks,
  reopenSideQuest,
  resetAllData,
  restoreReward,
  undoPurchase,
  updateReward,
  type RewardDraft,
} from './repository'

const DAY = '2026-11-03'
const NEXT_DAY = '2026-11-04'
const PRICE_ERROR = 'Der Preis muss eine ganze Zahl zwischen 1 und 1.000.000 Gold sein.'

let database: QuestlogDB
let dbCounter = 0

beforeEach(async () => {
  database = new QuestlogDB(`questlog-test-treasury-${++dbCounter}`)
  await database.open()
})

afterEach(async () => {
  vi.restoreAllMocks()
  await database.delete()
})

function rewardDraft(overrides: Partial<RewardDraft> = {}): RewardDraft {
  return { title: 'Pizza bestellen', icon: '🍕', price: 40, repeatable: true, ...overrides }
}

async function storedReward(id: string): Promise<Reward> {
  const reward = await database.rewards.get(id)
  if (!reward) throw new Error(`Belohnung ${id} fehlt`)
  return reward
}

async function gold(today: DayKey = DAY) {
  return deriveGameState(await loadGameData(database), today).gold
}

/** Verdient Gold über erledigte epische Nebenquests (je 80 XP = 40 Gold, plus evtl. Erfolgs-Gold). */
async function earnGold(epicQuests: number, day: DayKey = DAY): Promise<void> {
  for (let i = 0; i < epicQuests; i++) {
    const quest = await createSideQuest(
      { title: `Großtat ${i + 1}`, icon: '🐉', attribute: 'strength', difficulty: 'epic' },
      day,
      database,
    )
    await completeSideQuest(quest.id, day, database)
  }
}

async function rewardTitles(): Promise<string[]> {
  return ((await loadGameData(database)).rewards ?? []).map((reward) => reward.title)
}

// ---------------------------------------------------------------------------

describe('createReward', () => {
  it('legt eine Belohnung getrimmt an, mit order = max + 1 und Anlagezeit', async () => {
    vi.spyOn(Date, 'now').mockReturnValue(1234)
    const first = await createReward(
      rewardDraft({ title: '  Pizza bestellen ', description: '  Mit extra Käse  ' }),
      database,
    )
    const second = await createReward(rewardDraft({ title: 'Kinoabend', icon: '   ', repeatable: false }), database)

    expect(first).toStrictEqual({
      id: first.id,
      title: 'Pizza bestellen',
      icon: '🍕',
      description: 'Mit extra Käse',
      price: 40,
      repeatable: true,
      order: 0,
      createdAt: 1234,
    })
    expect(await storedReward(first.id)).toStrictEqual(first)
    expect(second).toMatchObject({ icon: DEFAULT_REWARD_ICON, repeatable: false, order: 1 })
    expect('description' in second).toBe(false)
    expect('archived' in second).toBe(false)
  })

  it('verlangt einen Namen', async () => {
    await expect(createReward(rewardDraft({ title: '   ' }), database)).rejects.toThrow('Die Belohnung braucht einen Namen.')
    expect(await database.rewards.count()).toBe(0)
  })

  it.each([0, -5, 2.5, Number.NaN, Number.POSITIVE_INFINITY, MAX_REWARD_PRICE + 1, '10' as unknown as number])(
    'lehnt den Preis %s ab',
    async (price) => {
      await expect(createReward(rewardDraft({ price }), database)).rejects.toThrow(PRICE_ERROR)
      expect(await database.rewards.count()).toBe(0)
    },
  )

  it('akzeptiert Preise von 1 bis 1.000.000 Gold', async () => {
    expect((await createReward(rewardDraft({ price: 1 }), database)).price).toBe(1)
    expect((await createReward(rewardDraft({ price: MAX_REWARD_PRICE }), database)).price).toBe(MAX_REWARD_PRICE)
  })
})

describe('updateReward', () => {
  it('ändert nur die Felder im Patch; Reihenfolge, Archivierung und Anlagezeit bleiben', async () => {
    const reward = await createReward(rewardDraft({ description: 'Mit extra Käse' }), database)
    await archiveReward(reward.id, database)
    await updateReward(reward.id, { title: ' Große Pizza ', price: 60 }, database)
    expect(await storedReward(reward.id)).toStrictEqual({
      ...reward,
      title: 'Große Pizza',
      price: 60,
      archived: true,
    })
  })

  it('entfernt die Beschreibung bei explizitem undefined bzw. leerem Text', async () => {
    const reward = await createReward(rewardDraft({ description: 'Mit extra Käse' }), database)
    await updateReward(reward.id, { description: undefined }, database)
    expect('description' in (await storedReward(reward.id))).toBe(false)

    await updateReward(reward.id, { description: 'Wieder da' }, database)
    await updateReward(reward.id, { description: '  ' }, database)
    expect('description' in (await storedReward(reward.id))).toBe(false)
  })

  it('kann zwischen einmalig und wiederholbar wechseln', async () => {
    const reward = await createReward(rewardDraft({ repeatable: true }), database)
    await updateReward(reward.id, { repeatable: false }, database)
    expect((await storedReward(reward.id)).repeatable).toBe(false)
  })

  it('prüft wie beim Anlegen und ändert bei Fehlern nichts', async () => {
    const reward = await createReward(rewardDraft(), database)
    await expect(updateReward(reward.id, { price: 0 }, database)).rejects.toThrow(PRICE_ERROR)
    await expect(updateReward(reward.id, { title: '' }, database)).rejects.toThrow('Die Belohnung braucht einen Namen.')
    expect(await storedReward(reward.id)).toStrictEqual(reward)
  })

  it('wirft für eine unbekannte Belohnung', async () => {
    await expect(updateReward('gibt-es-nicht', { price: 5 }, database)).rejects.toThrow('Diese Belohnung gibt es nicht (mehr).')
  })

  it('ändert bisherige Einlösungen nicht (Momentaufnahme)', async () => {
    await earnGold(1)
    const reward = await createReward(rewardDraft({ price: 10 }), database)
    const purchase = await purchaseReward(reward.id, DAY, database)
    await updateReward(reward.id, { title: 'Anders', icon: '🥗', price: 99 }, database)
    expect(await database.purchases.get(purchase.id)).toStrictEqual(purchase)
    expect(purchase).toMatchObject({ title: 'Pizza bestellen', icon: '🍕', price: 10 })
  })
})

describe('archiveReward / restoreReward', () => {
  it('blendet aus und holt an den bisherigen Platz zurück', async () => {
    const a = await createReward(rewardDraft({ title: 'A' }), database)
    const b = await createReward(rewardDraft({ title: 'B' }), database)
    await archiveReward(a.id, database)
    await archiveReward(a.id, database) // bleibt archiviert
    expect(await storedReward(a.id)).toStrictEqual({ ...a, archived: true })

    await restoreReward(a.id, database)
    expect(await storedReward(a.id)).toStrictEqual(a)
    await restoreReward(b.id, database) // nicht archiviert → unverändert
    expect(await storedReward(b.id)).toStrictEqual(b)
    expect(await rewardTitles()).toEqual(['A', 'B'])
  })

  it('wirft für eine unbekannte Belohnung', async () => {
    await expect(archiveReward('weg', database)).rejects.toThrow('Diese Belohnung gibt es nicht (mehr).')
    await expect(restoreReward('weg', database)).rejects.toThrow('Diese Belohnung gibt es nicht (mehr).')
  })
})

describe('deleteReward', () => {
  it('löscht eine nie eingelöste Belohnung endgültig', async () => {
    const reward = await createReward(rewardDraft(), database)
    expect(await deleteReward(reward.id, database)).toBe('deleted')
    expect(await database.rewards.count()).toBe(0)
  })

  it('blendet eine eingelöste Belohnung stattdessen aus – die Chronik bleibt', async () => {
    await earnGold(1)
    const reward = await createReward(rewardDraft({ price: 10, repeatable: false }), database)
    const purchase = await purchaseReward(reward.id, DAY, database)

    expect(await deleteReward(reward.id, database)).toBe('archived')
    expect(await storedReward(reward.id)).toStrictEqual({ ...reward, archived: true })
    expect((await loadGameData(database)).purchases).toStrictEqual([purchase])
    expect(await deleteReward(reward.id, database)).toBe('archived') // erneut: bleibt ausgeblendet

    // Nach dem Rückgängigmachen der einzigen Einlösung darf sie gelöscht werden.
    await undoPurchase(purchase.id, DAY, database)
    expect(await deleteReward(reward.id, database)).toBe('deleted')
    expect(await database.rewards.count()).toBe(0)
  })

  it('ändert bei einer unbekannten Belohnung nichts', async () => {
    const reward = await createReward(rewardDraft(), database)
    expect(await deleteReward('weg', database)).toBe('deleted')
    expect(await storedReward(reward.id)).toStrictEqual(reward)
  })
})

describe('moveReward', () => {
  it('tauscht mit dem Nachbarn; am Rand passiert nichts', async () => {
    const a = await createReward(rewardDraft({ title: 'A' }), database)
    await createReward(rewardDraft({ title: 'B' }), database)
    const c = await createReward(rewardDraft({ title: 'C' }), database)

    await moveReward(c.id, 'up', database)
    expect(await rewardTitles()).toEqual(['A', 'C', 'B'])
    await moveReward(a.id, 'up', database)
    await moveReward('weg', 'down', database)
    expect(await rewardTitles()).toEqual(['A', 'C', 'B'])
    await moveReward(a.id, 'down', database)
    expect(await rewardTitles()).toEqual(['C', 'A', 'B'])
  })

  it('überspringt ausgeblendete Belohnungen und bewegt keine ausgeblendete', async () => {
    const a = await createReward(rewardDraft({ title: 'A' }), database)
    const b = await createReward(rewardDraft({ title: 'B' }), database)
    await createReward(rewardDraft({ title: 'C' }), database)
    await archiveReward(b.id, database)

    // Sichtbar: A, C → A tauscht mit C (B bleibt auf seinem Platz dazwischen).
    await moveReward(a.id, 'down', database)
    expect(await rewardTitles()).toEqual(['C', 'B', 'A'])
    await moveReward(b.id, 'down', database)
    expect(await rewardTitles()).toEqual(['C', 'B', 'A'])
  })

  it('nummeriert doppelte order-Werte vorher lückenlos durch', async () => {
    const a = await createReward(rewardDraft({ title: 'A' }), database)
    const b = await createReward(rewardDraft({ title: 'B' }), database)
    const c = await createReward(rewardDraft({ title: 'C' }), database)
    // Gleicher order → Reihenfolge nach Anlagezeit. Die Zeiten direkt setzen statt Date.now zu ersetzen: auch
    // fake-indexeddb ruft Date.now auf (Zeitstempel der Events), das würde die ersetzten Werte verbrauchen.
    await database.rewards.bulkPut([
      { ...a, order: 0, createdAt: 1 },
      { ...b, order: 0, createdAt: 2 },
      { ...c, order: 0, createdAt: 3 },
    ])

    await moveReward(c.id, 'up', database)
    expect(await rewardTitles()).toEqual(['A', 'C', 'B'])
    const orders = ((await loadGameData(database)).rewards ?? []).map((reward) => reward.order)
    expect(orders).toEqual([0, 1, 2])
  })
})

describe('purchaseReward', () => {
  it('löst ein: Momentaufnahme, Spieltag, Gold wird abgezogen', async () => {
    await earnGold(2)
    const reward = await createReward(rewardDraft({ price: 50, description: 'Lecker' }), database)
    const before = await gold()
    vi.spyOn(Date, 'now').mockReturnValue(5000)

    const purchase = await purchaseReward(reward.id, DAY, database)

    expect(purchase).toStrictEqual({
      id: purchase.id,
      kind: 'reward',
      rewardId: reward.id,
      title: 'Pizza bestellen',
      icon: '🍕',
      price: 50,
      day: DAY,
      createdAt: 5000,
    })
    expect((await loadGameData(database)).purchases).toStrictEqual([purchase])
    const after = await gold()
    expect(after.spent).toBe(before.spent + 50)
    expect(after.balance).toBe(after.earned - after.spent)
  })

  it('wiederholbare Belohnungen gehen mehrmals', async () => {
    await earnGold(3)
    const reward = await createReward(rewardDraft({ price: 20 }), database)
    await purchaseReward(reward.id, DAY, database)
    await purchaseReward(reward.id, DAY, database)
    expect((await loadGameData(database)).purchases).toHaveLength(2)
    expect((await gold()).spent).toBe(40)
  })

  it('meldet, wie viel Gold fehlt, und speichert nichts', async () => {
    await earnGold(1)
    const { balance } = await gold()
    expect(balance).toBeGreaterThan(0)
    const reward = await createReward(rewardDraft({ price: balance + 1 }), database)
    await expect(purchaseReward(reward.id, DAY, database)).rejects.toThrow('Dafür fehlen dir noch 1 Gold.')

    const expensive = await createReward(rewardDraft({ price: balance + 1500 }), database)
    await expect(purchaseReward(expensive.id, DAY, database)).rejects.toThrow('Dafür fehlen dir noch 1.500 Gold.')
    expect(await database.purchases.count()).toBe(0)

    const exact = await createReward(rewardDraft({ price: balance }), database)
    await purchaseReward(exact.id, DAY, database)
    expect((await gold()).spent).toBe(balance)
  })

  it('ohne Gold: auch die günstigste Belohnung geht nicht', async () => {
    const reward = await createReward(rewardDraft({ price: 1 }), database)
    const { balance } = await gold()
    await expect(purchaseReward(reward.id, DAY, database)).rejects.toThrow(missingGoldMessage(1 - balance))
  })

  it('rechnet mit einem negativen Guthaben (nachträglich verlorenes Gold)', async () => {
    await earnGold(1)
    const quest = (await loadGameData(database)).sideQuests?.[0]
    if (!quest) throw new Error('Nebenquest fehlt')
    const { balance } = await gold()
    const reward = await createReward(rewardDraft({ price: balance }), database)
    await purchaseReward(reward.id, DAY, database)
    await reopenSideQuest(quest.id, database) // die XP (und das Gold) dafür sind weg
    const negative = (await gold()).balance
    expect(negative).toBeLessThan(0)

    const cheap = await createReward(rewardDraft({ price: 1 }), database)
    await expect(purchaseReward(cheap.id, DAY, database)).rejects.toThrow(missingGoldMessage(1 - negative))
  })

  it('zählt das Gold zum übergebenen Spieltag', async () => {
    await earnGold(1, NEXT_DAY)
    const reward = await createReward(rewardDraft({ price: 10 }), database)
    await expect(purchaseReward(reward.id, DAY, database)).rejects.toThrow(/^Dafür fehlen dir noch/)
    await expect(purchaseReward(reward.id, NEXT_DAY, database)).resolves.toMatchObject({ day: NEXT_DAY })
  })

  it('zählt freigeschaltete Erfolge zum Guthaben', async () => {
    await earnGold(1)
    const before = await gold()
    // Gespeicherte Freischaltung eines Erfolgs, der jetzt (noch) nicht erreicht ist → sein Gold zählt.
    await recordAchievementUnlocks([{ id: 'streak-365', day: DAY }], database)
    const after = await gold()
    expect(after.fromAchievements).toBeGreaterThan(before.fromAchievements)

    const reward = await createReward(rewardDraft({ price: after.balance }), database)
    await expect(purchaseReward(reward.id, DAY, database)).resolves.toMatchObject({ price: after.balance })
  })

  it('einmalige Belohnungen nur einmal – nach dem Rückgängigmachen wieder', async () => {
    await earnGold(2)
    const reward = await createReward(rewardDraft({ price: 10, repeatable: false }), database)
    const purchase = await purchaseReward(reward.id, DAY, database)
    await expect(purchaseReward(reward.id, DAY, database)).rejects.toThrow('Diese Belohnung hast du schon eingelöst.')
    expect(await database.purchases.count()).toBe(1)

    await undoPurchase(purchase.id, DAY, database)
    await expect(purchaseReward(reward.id, DAY, database)).resolves.toMatchObject({ rewardId: reward.id })
  })

  it('ausgeblendete Belohnungen sind nicht einlösbar', async () => {
    await earnGold(1)
    const reward = await createReward(rewardDraft({ price: 10 }), database)
    await archiveReward(reward.id, database)
    await expect(purchaseReward(reward.id, DAY, database)).rejects.toThrow('Diese Belohnung ist nicht mehr verfügbar.')
    await restoreReward(reward.id, database)
    await expect(purchaseReward(reward.id, DAY, database)).resolves.toMatchObject({ price: 10 })
  })

  it('wirft für unbekannte Belohnungen und ungültige Tage', async () => {
    await expect(purchaseReward('weg', DAY, database)).rejects.toThrow('Diese Belohnung gibt es nicht (mehr).')
    const reward = await createReward(rewardDraft(), database)
    await expect(purchaseReward(reward.id, '03.11.2026', database)).rejects.toThrow('Ungültiges Datum')
  })

  it('gleichzeitige Einlösungen geben nie mehr Gold aus, als da ist', async () => {
    await earnGold(1)
    const { balance } = await gold()
    // Das ganze Guthaben: Nach der ersten Einlösung bleibt nur das Gold des Erfolgs „erste Einlösung“ (< Preis).
    const reward = await createReward(rewardDraft({ price: balance }), database)
    const results = await Promise.allSettled([
      purchaseReward(reward.id, DAY, database),
      purchaseReward(reward.id, DAY, database),
    ])
    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1)
    const failed = results.find((result) => result.status === 'rejected')
    expect(failed?.status === 'rejected' && String(failed.reason)).toMatch(/Dafür fehlen dir noch/)
    expect(await database.purchases.count()).toBe(1)
  })
})

describe('undoPurchase', () => {
  it('entfernt die Einlösung – das Gold ist zurück', async () => {
    await earnGold(1)
    const reward = await createReward(rewardDraft({ price: 15 }), database)
    const keep = await purchaseReward(reward.id, DAY, database)
    const undo = await purchaseReward(reward.id, DAY, database)
    expect((await gold()).spent).toBe(30)

    await undoPurchase(undo.id, DAY, database)
    expect((await loadGameData(database)).purchases).toStrictEqual([keep])
    expect((await gold()).spent).toBe(15)
  })

  it('ist für unbekannte bzw. schon rückgängig gemachte Einlösungen wirkungslos', async () => {
    await expect(undoPurchase('weg', DAY, database)).resolves.toBeUndefined()
  })
})

describe('loadGameData – Schatzkammer', () => {
  it('sortiert Belohnungen nach order und Einlösungen nach Zeitpunkt', async () => {
    await earnGold(2)
    const a = await createReward(rewardDraft({ title: 'A', price: 1 }), database)
    const b = await createReward(rewardDraft({ title: 'B', price: 1 }), database)
    await database.rewards.update(a.id, { order: 9 })

    const now = vi.spyOn(Date, 'now')
    now.mockReturnValue(300)
    const late = await purchaseReward(a.id, DAY, database)
    now.mockReturnValue(100)
    const early = await purchaseReward(b.id, DAY, database)

    const data = await loadGameData(database)
    expect(data.rewards?.map((reward) => reward.title)).toEqual(['B', 'A'])
    expect(data.purchases?.map((purchase) => purchase.id)).toEqual([early.id, late.id])
  })
})

describe('resetAllData – Phase 2a', () => {
  it('leert auch Belohnungen, Einlösungen, Nebenquests und Erfolge', async () => {
    await earnGold(1)
    const reward = await createReward(rewardDraft({ price: 5 }), database)
    await purchaseReward(reward.id, DAY, database)
    await recordAchievementUnlocks([{ id: 'quests-10', day: DAY }], database)

    await resetAllData(database)

    expect(await loadGameData(database)).toStrictEqual({
      settings: { ...DEFAULT_SETTINGS },
      habits: [],
      completions: [],
      mainQuests: [],
    })
    for (const table of [database.rewards, database.purchases, database.sideQuests, database.achievementUnlocks]) {
      expect(await table.count()).toBe(0)
    }
  })
})
