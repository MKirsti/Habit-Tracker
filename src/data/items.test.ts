import 'fake-indexeddb/auto'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { BALANCING } from '../domain/balancing'
import { deriveGameState } from '../domain/engine'
import { makeItemPurchase, makeLedgerEntry } from '../domain/testing'
import type { DayKey } from '../domain/types'
import { QuestlogDB } from './db'
import {
  completeSideQuest,
  createHabit,
  createReward,
  createSideQuest,
  ITEM_IDS,
  ITEMS,
  loadGameData,
  missingGoldMessage,
  purchaseItem,
  purchaseReward,
  saveProfile,
  setPenaltiesEnabled,
  settleHpDays,
  toggleCompletion,
  undoPurchase,
} from './repository'

const START = '2026-10-01'
const FREEZE = BALANCING.items.streakFreeze
const POTION = BALANCING.items.healingPotion

const MSG = {
  stockFull: `Du hast schon ${FREEZE.max} Streak-Schutz im Vorrat – mehr passen nicht in deinen Beutel.`,
  gentle: 'Im Sanften Modus gibt es keine Lebenspunkte – ein Heiltrank hätte nichts zu heilen.',
  full: 'Deine Lebenspunkte sind schon voll – du brauchst gerade keinen Heiltrank.',
  otherDay: 'Gegenstände kannst du nur am Tag des Kaufs zurückgeben.',
  settled: 'Dieser Tag ist schon abgerechnet – der Kauf lässt sich nicht mehr zurückgeben.',
}

let database: QuestlogDB
let dbCounter = 0

beforeEach(async () => {
  database = new QuestlogDB(`questlog-test-items-${++dbCounter}`)
  await database.open()
})

afterEach(async () => {
  vi.useRealTimers()
  vi.restoreAllMocks()
  await database.delete()
})

async function stateOn(today: DayKey) {
  return deriveGameState(await loadGameData(database), today)
}

/** Held seit START mit einer leichten Tagesquest; der Beginn der Abrechnung ist START. */
async function hero() {
  await saveProfile({ name: 'Aria', avatar: '🧙', createdDay: START }, database)
  const habit = await createHabit(
    { title: 'Lesen', icon: '📖', attribute: 'intellect', difficulty: 'easy', schedule: { type: 'daily' } },
    START,
    database,
  )
  await settleHpDays(START, database)
  return habit
}

/** Verdient Gold über erledigte epische Nebenquests (je 80 XP = 40 Gold, plus Erfolgs-Gold). */
async function earnGold(epicQuests: number, day: DayKey = START): Promise<void> {
  for (let i = 0; i < epicQuests; i++) {
    const quest = await createSideQuest(
      { title: `Großtat ${i + 1}`, icon: '🐉', attribute: 'strength', difficulty: 'epic' },
      day,
      database,
    )
    await completeSideQuest(quest.id, day, database)
  }
}

/** HP des angeschlagenen Helden (`woundedHero`), von Hand gerechnet. */
const WOUNDED_HP = 34

/**
 * Angeschlagener Held: sechs epische Nebenquests am START (480 XP → Level 3, 60 HP; das Level-Up heilt am START
 * voll), „Lesen“ am 1. und 6. Oktober, am 5. Oktober nur eine Wochenquest (Nebenquests zählen nicht als erledigte
 * Quest). Höchstens drei Tage mit Schaden am Stück – danach ruht der Schaden bis zum nächsten guten Tag. Am
 * 11. Oktober abgerechnet bis zum 9. Oktober:
 * - 1. Okt.: perfekt, Level-Up → 60
 * - 2.–4. Okt.: verpasst (1.–3. Tag mit Schaden) → 60 − 3 × 6 = 42
 * - 5. Okt.: nur die Wochenquest – wäre „Ein Anfang“, nach drei Tagen mit Schaden aber Pause → bleibt 42
 * - 6. Okt.: perfekt, beendet die Pause → 42 + 10 = 52
 * - 7.–9. Okt.: verpasst (1.–3. Tag mit Schaden) → 52 − 3 × 6 = 34
 * Das Gold (≥ 240) reicht für mehrere Gegenstände; neue XP gäbe es heute nicht (ein Level-Up würde voll heilen –
 * mit gut 500 XP bleibt der Held auf Level 3).
 */
async function woundedHero(): Promise<DayKey> {
  const reading = await hero()
  await earnGold(6)
  const weekly = await createHabit(
    { title: 'Laufen', icon: '🏃', attribute: 'vitality', difficulty: 'easy', schedule: { type: 'weekly', times: 1 } },
    START,
    database,
  )
  await toggleCompletion(reading.id, '2026-10-01', database)
  await toggleCompletion(weekly.id, '2026-10-05', database)
  await toggleCompletion(reading.id, '2026-10-06', database)
  const today = '2026-10-11'
  const entries = await settleHpDays(today, database)
  expect(entries.map((entry) => [entry.day, entry.score, entry.hpAfter])).toEqual([
    ['2026-10-01', 'perfect', 60],
    ['2026-10-02', 'missed', 54],
    ['2026-10-03', 'missed', 48],
    ['2026-10-04', 'missed', 42],
    ['2026-10-05', 'absent', 42],
    ['2026-10-06', 'perfect', 52],
    ['2026-10-07', 'missed', 46],
    ['2026-10-08', 'missed', 40],
    ['2026-10-09', 'missed', WOUNDED_HP],
  ])
  expect((await stateOn(today)).hp).toMatchObject({ current: WOUNDED_HP, max: 60 })
  return today
}

// ---------------------------------------------------------------------------

describe('ITEMS', () => {
  it('Streak-Schutz und Heiltrank mit Preisen aus BALANCING', () => {
    expect(ITEM_IDS).toEqual(['streakFreeze', 'healingPotion'])
    expect(ITEMS.streakFreeze).toStrictEqual({ title: 'Streak-Schutz', icon: '❄️', price: FREEZE.price })
    expect(ITEMS.healingPotion).toStrictEqual({ title: 'Heiltrank', icon: '🧪', price: POTION.price })
  })
})

describe('purchaseItem – Streak-Schutz', () => {
  it('speichert den Kauf als Momentaufnahme, zieht das Gold ab und füllt den Vorrat', async () => {
    await hero()
    await earnGold(5)
    const before = await stateOn(START)
    vi.spyOn(Date, 'now').mockReturnValue(777)
    const purchase = await purchaseItem('streakFreeze', START, database)
    expect(purchase).toStrictEqual({
      id: purchase.id,
      kind: 'item',
      itemId: 'streakFreeze',
      title: 'Streak-Schutz',
      icon: '❄️',
      price: FREEZE.price,
      day: START,
      createdAt: 777,
    })
    expect((await loadGameData(database)).purchases).toStrictEqual([purchase])
    const after = await stateOn(START)
    expect(after.gold.balance).toBe(before.gold.balance - FREEZE.price)
    expect(after.inventory.streakFreezes).toBe(1)
    // Gegenstände sind keine eingelösten Belohnungen (Erfolg „Beim Händler“ bleibt aus).
    expect(after.achievements.find((achievement) => achievement.definition.id === 'purchases-1')?.unlocked ?? false).toBe(false)
  })

  it(`hält höchstens ${FREEZE.max} im Vorrat`, async () => {
    await hero()
    await earnGold(10)
    await database.purchases.bulkAdd(
      [1, 2, 3, 4].map((i) => makeItemPurchase(`alt-${i}`, 'streakFreeze', START, { price: 1 })),
    )
    await purchaseItem('streakFreeze', START, database)
    await expect(purchaseItem('streakFreeze', START, database)).rejects.toThrow(MSG.stockFull)
    expect((await stateOn(START)).inventory.streakFreezes).toBe(FREEZE.max)
  })

  it('gleichzeitige Käufe überschreiten weder den Vorrat noch das Guthaben', async () => {
    await hero()
    await earnGold(10)
    await database.purchases.bulkAdd(
      [1, 2, 3, 4].map((i) => makeItemPurchase(`alt-${i}`, 'streakFreeze', START, { price: 1 })),
    )
    const results = await Promise.allSettled([
      purchaseItem('streakFreeze', START, database),
      purchaseItem('streakFreeze', START, database),
    ])
    expect(results.map((result) => result.status).sort()).toEqual(['fulfilled', 'rejected'])
    expect((await stateOn(START)).inventory.streakFreezes).toBe(FREEZE.max)
  })

  it('reicht das Gold für genau einen, gelingt nur einer von zwei gleichzeitigen Käufen', async () => {
    await hero()
    await earnGold(4)
    const filler = await createReward({ title: 'Kino', icon: '🎬', price: 1, repeatable: true }, database)
    await purchaseReward(filler.id, START, database) // schaltet „Beim Händler“ frei (Erfolgs-Gold)
    const { balance } = (await stateOn(START)).gold
    await database.rewards.update(filler.id, { price: balance - FREEZE.price - 10 })
    await purchaseReward(filler.id, START, database)
    expect((await stateOn(START)).gold.balance).toBe(FREEZE.price + 10)

    const results = await Promise.allSettled([
      purchaseItem('streakFreeze', START, database),
      purchaseItem('streakFreeze', START, database),
    ])
    expect(results.map((result) => result.status).sort()).toEqual(['fulfilled', 'rejected'])
    const rejected = results.find((result) => result.status === 'rejected')
    expect((rejected as PromiseRejectedResult).reason.message).toBe(missingGoldMessage(FREEZE.price - 10))
    expect((await stateOn(START)).gold.balance).toBe(10)
  })

  it('zu wenig Gold → „Dafür fehlen dir noch N Gold.“', async () => {
    await hero()
    const { balance } = (await stateOn(START)).gold
    expect(balance).toBeLessThan(FREEZE.price)
    await expect(purchaseItem('streakFreeze', START, database)).rejects.toThrow(missingGoldMessage(FREEZE.price - balance))
    expect(await database.purchases.count()).toBe(0)
  })

  it('ein vorrätiger Streak-Schutz fängt einen verpassten Tag auf und ist danach verbraucht', async () => {
    await hero()
    await earnGold(5)
    const freeze = await purchaseItem('streakFreeze', '2026-10-02', database)
    // 1. Oktober verpasst (vor dem Kauf: kein Schutz), 2. Oktober verpasst (geschützt)
    const entries = await settleHpDays('2026-10-04', database)
    expect(entries.map((entry) => [entry.day, entry.score, entry.frozen])).toEqual([
      ['2026-10-01', 'missed', false],
      ['2026-10-02', 'missed', true],
    ])
    expect(entries[1].hpDelta).toBe(0)
    expect((await stateOn('2026-10-04')).inventory.streakFreezes).toBe(0)
    await expect(undoPurchase(freeze.id, '2026-10-04', database)).rejects.toThrow(MSG.otherDay)
  })
})

describe('purchaseItem – Heiltrank', () => {
  it('wird sofort getrunken: +20 HP (höchstens bis zum Maximum), kostet 80 Gold', async () => {
    const today = await woundedHero()
    const before = await stateOn(today)
    const potion = await purchaseItem('healingPotion', today, database)
    expect(potion).toMatchObject({ kind: 'item', itemId: 'healingPotion', title: 'Heiltrank', icon: '🧪', price: POTION.price })
    const after = await stateOn(today)
    expect(after.hp.current).toBe(WOUNDED_HP + POTION.heal) // 34 + 20 = 54
    expect(after.gold.balance).toBe(before.gold.balance - POTION.price)
  })

  it('bei vollen HP oder im Sanften Modus gibt es keinen Heiltrank', async () => {
    await hero()
    await earnGold(4)
    await expect(purchaseItem('healingPotion', START, database)).rejects.toThrow(MSG.full)
    await setPenaltiesEnabled(false, START, database)
    await expect(purchaseItem('healingPotion', START, database)).rejects.toThrow(MSG.gentle)
    expect(await database.purchases.count()).toBe(0)
  })

  it('heilt höchstens bis voll – danach wird kein weiterer verkauft', async () => {
    const today = await woundedHero()
    await purchaseItem('healingPotion', today, database)
    await purchaseItem('healingPotion', today, database)
    expect((await stateOn(today)).hp.current).toBe(60) // 34 + 2 × 20 = 74, höchstens 60
    await expect(purchaseItem('healingPotion', today, database)).rejects.toThrow(MSG.full)
  })
})

describe('purchaseItem – Eingaben', () => {
  it('unbekannter Gegenstand oder ungültiger Tag', async () => {
    await hero()
    await expect(purchaseItem('xpPotion' as 'streakFreeze', START, database)).rejects.toThrow('Diesen Gegenstand gibt es nicht.')
    await expect(purchaseItem('streakFreeze', '1.10.2026', database)).rejects.toThrow('Ungültiges Datum')
  })
})

describe('undoPurchase – Gegenstände', () => {
  it('am Kauftag: Kauf weg, Gold zurück, Vorrat bzw. HP wie vorher', async () => {
    const today = await woundedHero()
    const before = await stateOn(today)
    const freeze = await purchaseItem('streakFreeze', today, database)
    const potion = await purchaseItem('healingPotion', today, database)
    expect((await stateOn(today)).hp.current).toBe(54) // 34 + 20

    await undoPurchase(potion.id, today, database)
    await undoPurchase(freeze.id, today, database)
    const after = await stateOn(today)
    expect(after.gold.balance).toBe(before.gold.balance)
    expect(after.hp.current).toBe(WOUNDED_HP)
    expect(after.inventory.streakFreezes).toBe(0)
    expect(await database.purchases.count()).toBe(0)
  })

  it('an einem anderen Tag nicht mehr – Belohnungen dagegen immer', async () => {
    await hero()
    await earnGold(6)
    const freeze = await purchaseItem('streakFreeze', START, database)
    const reward = await createReward({ title: 'Kino', icon: '🎬', price: 10, repeatable: true }, database)
    const treat = await purchaseReward(reward.id, START, database)

    await expect(undoPurchase(freeze.id, '2026-10-02', database)).rejects.toThrow(MSG.otherDay)
    await undoPurchase(treat.id, '2026-10-20', database)
    expect((await loadGameData(database)).purchases).toStrictEqual([freeze])
  })

  it('ein schon abgerechneter Kauftag (zurückgestellte Uhr) bleibt', async () => {
    await hero()
    await earnGold(3)
    const potionDay = '2026-10-05'
    await database.purchases.add(makeItemPurchase('trank', 'healingPotion', potionDay))
    await database.hpLedger.add(makeLedgerEntry(potionDay))
    await expect(undoPurchase('trank', potionDay, database)).rejects.toThrow(MSG.settled)
    expect(await database.purchases.count()).toBe(1)
  })

  it('ohne Spieltag gilt der heutige laut Uhr und Tageswechsel', async () => {
    await hero()
    await earnGold(5)
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date(2026, 9, 2, 3, 30)) // vor 4 Uhr: noch der 1. Oktober
    const freeze = await purchaseItem('streakFreeze', START, database)
    await undoPurchase(freeze.id, undefined, database)
    expect(await database.purchases.count()).toBe(0)

    const again = await purchaseItem('streakFreeze', START, database)
    vi.setSystemTime(new Date(2026, 9, 2, 4, 30)) // jetzt der 2. Oktober
    await expect(undoPurchase(again.id, undefined, database)).rejects.toThrow(MSG.otherDay)
  })
})
