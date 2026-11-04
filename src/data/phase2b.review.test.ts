/**
 * Review Phase 2b (Daten): Abrechnung über die echte Datenbank – Wiederherstellen nach einer Lücke, Upgrade von
 * Version 3 mit echtem Verlauf, gleichzeitige Aufrufe, Vorrat und Rückgängig.
 */
import 'fake-indexeddb/auto'
import { Dexie } from 'dexie'
import { afterEach, describe, expect, it } from 'vitest'
import { addDays } from '../domain/dates'
import { deriveGameState } from '../domain/engine'
import { makeCompletion, makeHabit, makeItemPurchase, makeLedgerEntry, makeMainQuest } from '../domain/testing'
import type { DayKey, GameData, Habit, HpLedgerEntry } from '../domain/types'
import { createBackup, parseBackup, restoreBackup } from './backup'
import { KV_KEYS, QuestlogDB } from './db'
import {
  addRestPeriod,
  createHabit,
  createReward,
  loadGameData,
  purchaseItem,
  purchaseReward,
  saveProfile,
  settleHpDays,
  toggleCompletion,
  undoPurchase,
} from './repository'

const opened: QuestlogDB[] = []
const names: string[] = []
let counter = 0

function freshDatabase(): QuestlogDB {
  const database = new QuestlogDB(`questlog-test-phase2b-review-${++counter}`)
  opened.push(database)
  return database
}

afterEach(async () => {
  await Promise.all(opened.splice(0).map((database) => database.delete()))
  await Promise.all(names.splice(0).map((name) => Dexie.delete(name)))
})

/** Mittags am Spieltag `day` (UTC) – mit Tageswechsel um 4 Uhr eindeutig dieser Spieltag in jeder Zeitzone ±10 h. */
const noonOf = (day: DayKey) => new Date(`${day}T12:00:00.000Z`)

/** Held seit `start` mit drei leichten Tagesquests. */
async function hero(database: QuestlogDB, start: DayKey): Promise<Habit[]> {
  await saveProfile({ name: 'Aria', avatar: '🧙', createdDay: start }, database)
  const habits: Habit[] = []
  for (const title of ['Lesen', 'Laufen', 'Atmen']) {
    habits.push(
      await createHabit({ title, icon: '⭐', attribute: 'discipline', difficulty: 'easy', schedule: { type: 'daily' } }, start, database),
    )
  }
  return habits
}

describe('Review 2b – Backup wiederherstellen nach einer Lücke', () => {
  const START = '2026-10-01'
  const EXPORT_DAY = '2026-10-10'

  /** Backup am EXPORT_DAY: abgerechnet bis zum 8. Oktober, leicht angeschlagen (54 von 55 HP). */
  async function exportedBackup() {
    const source = freshDatabase()
    const habits = await hero(source, START)
    await settleHpDays(START, source)
    for (const day of ['2026-10-01', '2026-10-09', '2026-10-10']) {
      for (const habit of habits) await toggleCompletion(habit.id, day, source)
    }
    // Tage 2.–8. Oktober: je eine Quest – schwach („Ein Anfang“, −1) –, damit es keine Abwesenheit ist.
    for (let n = 1; n <= 7; n++) await toggleCompletion(habits[0].id, addDays(START, n), source)
    const settled = await settleHpDays(EXPORT_DAY, source)
    expect(settled.at(-1)?.day).toBe('2026-10-08')
    // 1. Oktober perfekt (voll: 50), 2.–6. Oktober je −1 (49 … 45); der Level-Aufstieg am 7. heilt voll (55),
    // am 8. wieder −1 (54).
    expect(settled.map((entry) => entry.hpAfter)).toStrictEqual([50, 49, 48, 47, 46, 45, 55, 54])
    const backup = parseBackup(JSON.parse(JSON.stringify(await createBackup(noonOf(EXPORT_DAY), source))))
    if (!backup.ok) throw new Error(backup.error)
    return backup.backup
  }

  it('Tage, die das Backup nicht kennt, werden nie abgerechnet – keine Niederlage durch das Wiederherstellen', async () => {
    const backup = await exportedBackup()
    // Neues Handy, zwei Wochen später.
    const restoreDay = '2026-10-24'
    const target = freshDatabase()
    await restoreBackup(backup, target, noonOf(restoreDay))
    const entries = await settleHpDays(restoreDay, target)
    expect(entries).toStrictEqual([])
    const state = deriveGameState(await loadGameData(target), restoreDay)
    expect(state.hp).toMatchObject({ current: 54, max: 55, defeats: 0, settledThrough: '2026-10-08' })
    expect(state.gold.lostToDefeats).toBe(0)
    // Ab jetzt läuft alles wie gewohnt: gestern ist in der Gnadenfrist, ab morgen wird gestern abgerechnet
    // (seit dem 11. Oktober nichts erledigt – der 23. ist der 13. Tag ohne Quest: abwesend, kein Schaden).
    const next = await settleHpDays(addDays(restoreDay, 1), target)
    expect(next.map((entry) => [entry.day, entry.score, entry.hpAfter])).toStrictEqual([['2026-10-23', 'absent', 54]])
  })

  it('am Tag nach dem Export rechnet die bekannten Tage ganz normal ab (der Exporttag ist dann noch nachtragbar)', async () => {
    const backup = await exportedBackup()
    const restoreDay = '2026-10-11'
    const target = freshDatabase()
    await restoreBackup(backup, target, noonOf(restoreDay))
    expect((await loadGameData(target)).settings.penalties).toStrictEqual(backup.data.settings.penalties)
    // Den 9. Oktober kennt das Backup ganz (perfekt), den 10. kann man auf dem neuen Gerät noch nachtragen.
    const entries = await settleHpDays(restoreDay, target)
    expect(entries.map((entry) => [entry.day, entry.score, entry.hpAfter])).toStrictEqual([['2026-10-09', 'perfect', 55]])
    const next = await settleHpDays('2026-10-12', target)
    expect(next.map((entry) => [entry.day, entry.score, entry.hpAfter])).toStrictEqual([['2026-10-10', 'perfect', 55]])
  })

  it('zwei Tage nach dem Export: der nur zum Teil bekannte Exporttag wird nicht mehr abgerechnet', async () => {
    const backup = await exportedBackup()
    const restoreDay = '2026-10-12'
    const target = freshDatabase()
    await restoreBackup(backup, target, noonOf(restoreDay))
    expect((await loadGameData(target)).settings.penalties).toStrictEqual({ enabled: true, since: '2026-10-11' })
    expect(await settleHpDays(restoreDay, target)).toStrictEqual([])
    expect(deriveGameState(await loadGameData(target), restoreDay).hp).toMatchObject({ current: 54, settledThrough: '2026-10-08' })
  })

  it('ohne gültigen Exportzeitpunkt gilt jeder offene Tag vor gestern als unbekannt', async () => {
    const backup = { ...(await exportedBackup()), exportedAt: 'irgendwann' }
    const sameDay = freshDatabase()
    await restoreBackup(backup, sameDay, noonOf(EXPORT_DAY))
    expect((await loadGameData(sameDay)).settings.penalties).toStrictEqual(backup.data.settings.penalties)
    const nextDay = freshDatabase()
    await restoreBackup(backup, nextDay, noonOf('2026-10-11'))
    expect((await loadGameData(nextDay)).settings.penalties).toStrictEqual({ enabled: true, since: EXPORT_DAY })
    expect(await settleHpDays('2026-10-11', nextDay)).toStrictEqual([])
  })

  it('Export → sofort Import ändert nichts (auch nicht den Beginn der Abrechnung)', async () => {
    const backup = await exportedBackup()
    const target = freshDatabase()
    await restoreBackup(backup, target, noonOf(EXPORT_DAY))
    expect(await loadGameData(target)).toStrictEqual(backup.data)
  })

  it('ein älteres Backup ohne Lebenspunkte startet frisch: abgerechnet wird erst ab dem Tag nach dem Import', async () => {
    const backup = await exportedBackup()
    const { penalties: _penalties, hpIntroSeen: _seen, ...settings } = backup.data.settings
    const old = { ...backup, data: { ...backup.data, settings, hpLedger: undefined, restPeriods: undefined } }
    const target = freshDatabase()
    await restoreBackup(old, target, noonOf('2026-10-24'))
    expect(await settleHpDays('2026-10-24', target)).toStrictEqual([])
    expect((await loadGameData(target)).settings.penalties).toStrictEqual({ enabled: true, since: '2026-10-24' })
    const state = deriveGameState(await loadGameData(target), '2026-10-24')
    expect(state.hp).toMatchObject({ current: 55, max: 55, defeats: 0 })
    expect(state.hp.yesterday).toBeUndefined()
  })

  it('ein Heiltrank aus den nicht abgerechneten Tagen geht nicht verloren', async () => {
    const backup = await exportedBackup()
    // Am Exporttag (noch nicht abgerechnet) wurde ein Heiltrank getrunken.
    const withPotion = {
      ...backup,
      data: { ...backup.data, purchases: [makeItemPurchase('trank', 'healingPotion', EXPORT_DAY)] },
    }
    const target = freshDatabase()
    const restoreDay = '2026-10-24'
    await restoreBackup(withPotion, target, noonOf(restoreDay))
    // 54 + 20, höchstens 55.
    expect(deriveGameState(await loadGameData(target), restoreDay).hp.current).toBe(55)
    // Nach der nächsten Abrechnung (gestern abwesend: ±0) ist der Trank weiter enthalten.
    await settleHpDays(addDays(restoreDay, 1), target)
    expect(deriveGameState(await loadGameData(target), addDays(restoreDay, 1)).hp.current).toBe(55)
  })
})

describe('Review 2b – Upgrade von Version 3 mit echtem Verlauf', () => {
  it('Spielstand (Level, XP, Gold, Erfolge, Streaks, Kampagnen) bleibt identisch; Abrechnung erst ab dem Update', async () => {
    const name = 'questlog-test-phase2b-review-upgrade'
    names.push(name)
    const START = '2026-08-01'
    const TODAY = '2026-11-04'
    const daily = makeHabit({ id: 'daily', title: 'Lesen', difficulty: 'medium', createdDay: START, mainQuestId: 'mq' })
    const weekly = makeHabit({ id: 'weekly', title: 'Laufen', createdDay: START, schedule: { type: 'weekly', times: 2 }, order: 1 })
    const weekdays = makeHabit({ id: 'weekdays', title: 'Atmen', createdDay: START, schedule: { type: 'weekdays', days: [1, 3, 5] }, order: 2 })
    const completions = []
    for (let n = 0; addDays(START, n) < TODAY; n++) {
      const day = addDays(START, n)
      if (n % 5 !== 3) completions.push(makeCompletion(daily, day))
      if (n % 3 === 0) completions.push(makeCompletion(weekly, day))
      if (n % 2 === 0) completions.push(makeCompletion(weekdays, day))
    }
    const campaign = makeMainQuest({
      id: 'mq',
      startDay: START,
      chapters: [
        { id: 'c1', title: 'Zehn Tage', criterion: { type: 'habit', habitId: 'daily', metric: 'completions', target: 10 } },
        { id: 'c2', title: 'Serie', criterion: { type: 'habit', habitId: 'daily', metric: 'streak', target: 4 } },
      ],
    })
    const v3 = new Dexie(name)
    v3.version(3).stores({
      habits: '&id, order, mainQuestId',
      completions: '&id, habitId, day',
      mainQuests: '&id',
      kv: '&key',
      rewards: '&id, order',
      purchases: '&id, day',
      sideQuests: '&id, order',
      achievementUnlocks: '&id',
    })
    await v3.table('habits').bulkAdd([daily, weekly, weekdays])
    await v3.table('completions').bulkAdd(completions)
    await v3.table('mainQuests').add(campaign)
    await v3.table('rewards').add({ id: 'r', title: 'Pizza', icon: '🍕', price: 300, repeatable: true, order: 0, createdAt: 1 })
    await v3.table('purchases').add({ id: 'p', kind: 'reward', rewardId: 'r', title: 'Pizza', icon: '🍕', price: 300, day: '2026-10-01', createdAt: 2 })
    await v3.table('achievementUnlocks').add({ id: 'quests-10', day: '2026-08-12' })
    await v3.table('kv').bulkAdd([
      { key: KV_KEYS.profile, value: { name: 'Aria', avatar: '🧙', createdDay: START } },
      { key: KV_KEYS.settings, value: { dayStartHour: 4, effects: true } },
    ])
    const v3Data: GameData = {
      profile: { name: 'Aria', avatar: '🧙', createdDay: START },
      settings: { dayStartHour: 4, effects: true },
      habits: [daily, weekly, weekdays],
      completions: await v3.table('completions').toArray(),
      mainQuests: [campaign],
      rewards: await v3.table('rewards').toArray(),
      purchases: await v3.table('purchases').toArray(),
      achievementUnlocks: [{ id: 'quests-10', day: '2026-08-12' }],
    }
    v3.close()
    const before = deriveGameState(v3Data, TODAY)

    const upgraded = new QuestlogDB(name)
    await upgraded.open()
    try {
      const loaded = await loadGameData(upgraded)
      const after = deriveGameState(loaded, TODAY)
      for (const key of ['level', 'attributes', 'totals', 'gold', 'achievements', 'mainQuests', 'todayState'] as const) {
        expect(after[key], key).toStrictEqual(before[key])
      }
      expect(after.hp).toMatchObject({ enabled: true, current: after.hp.max, defeats: 0 })
      expect(after.hp.yesterday).toBeUndefined()
      expect(after.inventory.streakFreezes).toBe(0)

      // Erster Start: nur der Beginn; die 21 verpassten Tage (n % 5 === 3) aus dem Verlauf kosten nie etwas.
      expect(await settleHpDays(TODAY, upgraded)).toStrictEqual([])
      expect(await settleHpDays(addDays(TODAY, 1), upgraded)).toStrictEqual([])
      const first = await settleHpDays(addDays(TODAY, 2), upgraded)
      expect(first.map((entry) => entry.day)).toStrictEqual([TODAY])
      // Spielstand bis gestern unverändert durch die Abrechnung.
      const settled = deriveGameState(await loadGameData(upgraded), TODAY)
      expect(settled.level).toStrictEqual(before.level)
      expect(settled.gold.balance).toBe(before.gold.balance)
    } finally {
      upgraded.close()
    }
  })
})

describe('Review 2b – gleichzeitige Aufrufe, Vorrat und Rückgängig', () => {
  const START = '2026-10-01'

  it('Abrechnen, Kaufen und Rasten gleichzeitig: jeder Tag genau einmal, Vorrat und Gold stimmen', async () => {
    const database = freshDatabase()
    const habits = await hero(database, START)
    await settleHpDays(START, database)
    for (let n = 0; n < 20; n++) {
      for (const habit of habits.slice(0, n % 4)) await toggleCompletion(habit.id, addDays(START, n), database)
    }
    const today = addDays(START, 20)
    const results = await Promise.allSettled([
      settleHpDays(today, database),
      purchaseItem('streakFreeze', today, database),
      settleHpDays(today, database),
      purchaseItem('streakFreeze', today, database),
      addRestPeriod({ from: addDays(today, 1), until: addDays(today, 3) }, today, database),
      settleHpDays(today, database),
    ])
    const data = await loadGameData(database)
    const days = (data.hpLedger ?? []).map((entry) => entry.day)
    expect(new Set(days).size).toBe(days.length)
    expect(days.at(0)).toBe(START)
    expect(days.at(-1)).toBe(addDays(today, -2))
    expect(days).toHaveLength(19)
    // Alle gleichzeitig gestarteten Abrechnungen zusammen liefern jeden Tag genau einmal.
    const settledTogether = results
      .filter((result, index) => [0, 2, 5].includes(index) && result.status === 'fulfilled')
      .flatMap((result) => (result as PromiseFulfilledResult<HpLedgerEntry[]>).value)
    expect(settledTogether.map((entry) => entry.day)).toStrictEqual(days)
    const state = deriveGameState(data, today)
    const bought = (data.purchases ?? []).filter((purchase) => purchase.kind === 'item').length
    expect(state.inventory.streakFreezes).toBe(bought)
    expect(state.gold.spent).toBe(bought * 150)
    expect(state.restToday).toBe(false)
    expect(data.restPeriods).toHaveLength(1)
  })

  it('Vorrat: höchstens 5; ein eingesetzter macht Platz; Rückgängig nur am Kauftag, solange unverbraucht', async () => {
    const database = freshDatabase()
    const habits = await hero(database, START)
    await settleHpDays(START, database)
    // Genug Gold: 60 Tage alles erledigt.
    for (let n = 0; n < 60; n++) for (const habit of habits) await toggleCompletion(habit.id, addDays(START, n), database)
    const today = addDays(START, 60)
    await settleHpDays(today, database)
    for (let i = 0; i < 5; i++) await purchaseItem('streakFreeze', today, database)
    await expect(purchaseItem('streakFreeze', today, database)).rejects.toThrow('mehr passen nicht in deinen Beutel')
    // Rückgängig am Kauftag: einer weniger, dann passt wieder einer.
    const last = (await loadGameData(database)).purchases?.at(-1)
    await undoPurchase(last?.id ?? '', today, database)
    expect(deriveGameState(await loadGameData(database), today).inventory.streakFreezes).toBe(4)
    await purchaseItem('streakFreeze', today, database)
    // Nächster Tag: Rückgängig geht nicht mehr – eine Belohnung dagegen schon.
    const tomorrow = addDays(today, 1)
    const freeze = (await loadGameData(database)).purchases?.at(-1)
    await expect(undoPurchase(freeze?.id ?? '', tomorrow, database)).rejects.toThrow('nur am Tag des Kaufs')
    const reward = await createReward({ title: 'Kino', icon: '🎬', price: 10, repeatable: true }, database)
    const cinema = await purchaseReward(reward.id, today, database)
    await undoPurchase(cinema.id, addDays(today, 5), database)
    // Heute (Tag 60) nichts erledigt, morgen nichts: abgerechnet am Tag 62 → ein Streak-Schutz eingesetzt.
    const later = addDays(today, 2)
    const entries = await settleHpDays(later, database)
    expect(entries.map((entry) => [entry.day, entry.score, entry.frozen])).toStrictEqual([
      [addDays(START, 59), 'perfect', false],
      [today, 'missed', true],
    ])
    const state = deriveGameState(await loadGameData(database), later)
    expect(state.inventory.streakFreezes).toBe(4)
    expect(state.achievements.find((a) => a.definition.id === 'purchases-1')?.unlocked ?? false).toBe(false)
    // Jetzt passt wieder einer in den Beutel.
    await purchaseItem('streakFreeze', later, database)
    await expect(purchaseItem('streakFreeze', later, database)).rejects.toThrow('mehr passen nicht')
  })

  it('ein Backup mit abgerechneten Tagen in der Zukunft (zurückgestellte Uhr) bricht die Abrechnung nicht', async () => {
    const database = freshDatabase()
    await hero(database, START)
    await database.kv.put({ key: KV_KEYS.settings, value: { dayStartHour: 4, effects: true, penalties: { enabled: true, since: START } } })
    await database.hpLedger.bulkAdd([makeLedgerEntry('2026-10-01'), makeLedgerEntry('2026-10-30')])
    expect(await settleHpDays('2026-10-10', database)).toStrictEqual([])
    expect(await settleHpDays('2026-11-01', database)).toStrictEqual([])
    expect((await settleHpDays('2026-11-02', database)).map((entry) => entry.day)).toStrictEqual(['2026-10-31'])
    expect((await settleHpDays('2026-11-03', database)).map((entry) => entry.day)).toStrictEqual(['2026-11-01'])
  })
})
