import 'fake-indexeddb/auto'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { BALANCING } from '../domain/balancing'
import { addDays, dayRange } from '../domain/dates'
import { deriveGameState } from '../domain/engine'
import { settleDays } from '../domain/hp'
import { makeLedgerEntry, makeRestPeriod } from '../domain/testing'
import type { DayKey, Habit } from '../domain/types'
import { KV_KEYS, QuestlogDB } from './db'
import {
  completeSideQuest,
  createHabit,
  createSideQuest,
  loadGameData,
  markHpIntroSeen,
  saveProfile,
  setPenaltiesEnabled,
  settleHpDays,
  toggleCompletion,
  updateSettings,
} from './repository'

const START = '2026-10-01'

let database: QuestlogDB
let dbCounter = 0

beforeEach(async () => {
  database = new QuestlogDB(`questlog-test-life-points-${++dbCounter}`)
  await database.open()
})

afterEach(async () => {
  await database.delete()
})

/** Held (seit START) mit `count` leichten Tagesquests. */
async function hero(count = 3): Promise<Habit[]> {
  await saveProfile({ name: 'Aria', avatar: '🧙', createdDay: START }, database)
  const habits: Habit[] = []
  for (let i = 1; i <= count; i++) {
    habits.push(
      await createHabit(
        { title: `Quest ${i}`, icon: '⭐', attribute: 'discipline', difficulty: 'easy', schedule: { type: 'daily' } },
        START,
        database,
      ),
    )
  }
  return habits
}

/** Hakt an `day` die ersten `done` Quests ab. */
async function complete(habits: Habit[], day: DayKey, done: number): Promise<void> {
  for (const habit of habits.slice(0, done)) await toggleCompletion(habit.id, day, database)
}

async function storedSettings(): Promise<unknown> {
  return (await database.kv.get(KV_KEYS.settings))?.value
}

async function state(today: DayKey) {
  return deriveGameState(await loadGameData(database), today)
}

// ---------------------------------------------------------------------------

describe('loadGameData – Phase 2b', () => {
  it('liefert das Ledger nach Tag und die Rast nach Beginn sortiert; leere Listen fehlen', async () => {
    const empty = await loadGameData(database)
    expect('hpLedger' in empty).toBe(false)
    expect('restPeriods' in empty).toBe(false)

    await database.hpLedger.bulkAdd([makeLedgerEntry('2026-10-03'), makeLedgerEntry('2026-10-01'), makeLedgerEntry('2026-10-02')])
    await database.restPeriods.bulkAdd([
      makeRestPeriod('spät', '2026-10-20', '2026-10-21'),
      makeRestPeriod('lang', '2026-10-05', '2026-10-09', { createdAt: 1 }),
      makeRestPeriod('kurz', '2026-10-05', '2026-10-05', { createdAt: 2 }),
    ])
    const data = await loadGameData(database)
    expect(data.hpLedger?.map((entry) => entry.day)).toEqual(['2026-10-01', '2026-10-02', '2026-10-03'])
    expect(data.restPeriods?.map((period) => period.id)).toEqual(['kurz', 'lang', 'spät'])
  })

  it('Standard: Lebenspunkte an, noch nie abgerechnet (penalties fehlt)', async () => {
    const data = await loadGameData(database)
    expect(data.settings.penalties).toBeUndefined()
    expect(deriveGameState(data, START).hp).toMatchObject({ enabled: true, current: 50, max: 50 })
  })

  it.each([
    ['gültig', { enabled: false, since: START }, { enabled: false, since: START }],
    ['ohne Beginn', { enabled: true }, { enabled: true }],
    ['ungültiger Beginn', { enabled: false, since: '2026-13-01' }, { enabled: false }],
    ['enabled kein Wahrheitswert', { enabled: 'ja', since: START }, undefined],
    ['kein Objekt', 'an', undefined],
  ])('übernimmt nur gültige Lebenspunkte-Einstellungen: %s', async (_label, penalties, expected) => {
    await database.kv.put({ key: KV_KEYS.settings, value: { dayStartHour: 5, penalties, hpIntroSeen: 'ja' } })
    const { settings } = await loadGameData(database)
    expect(settings.penalties).toStrictEqual(expected)
    expect(settings.hpIntroSeen).toBeUndefined()
    expect(settings.dayStartHour).toBe(5)
  })
})

describe('updateSettings – Phase 2b', () => {
  it('behält Lebenspunkte und Einführung, wenn andere Einstellungen geändert werden', async () => {
    await database.kv.put({ key: KV_KEYS.settings, value: { penalties: { enabled: false, since: START }, hpIntroSeen: true } })
    await updateSettings({ effects: false, dayStartHour: 6 }, database)
    expect(await storedSettings()).toStrictEqual({
      penalties: { enabled: false, since: START },
      hpIntroSeen: true,
      effects: false,
      dayStartHour: 6,
    })
  })

  it('übernimmt von penalties nur enabled – der Beginn wird nie per Patch (rückwirkend) gesetzt', async () => {
    await updateSettings({ penalties: { enabled: false, since: '2020-01-01' } }, database)
    expect(await storedSettings()).toStrictEqual({ penalties: { enabled: false } })

    await database.kv.put({ key: KV_KEYS.settings, value: { penalties: { enabled: false, since: START } } })
    await updateSettings({ penalties: { enabled: true, since: '2020-01-01' } }, database)
    expect(await storedSettings()).toStrictEqual({ penalties: { enabled: true, since: START } })
  })

  it('übernimmt hpIntroSeen', async () => {
    await updateSettings({ hpIntroSeen: true }, database)
    expect((await loadGameData(database)).settings.hpIntroSeen).toBe(true)
  })
})

describe('markHpIntroSeen', () => {
  it('merkt sich die Einführung und lässt den Rest der Einstellungen stehen', async () => {
    await updateSettings({ dayStartHour: 7 }, database)
    await markHpIntroSeen(database)
    await markHpIntroSeen(database)
    expect(await storedSettings()).toStrictEqual({ dayStartHour: 7, hpIntroSeen: true })
  })
})

describe('settleHpDays', () => {
  it('ohne Held (vor dem Onboarding) passiert nichts', async () => {
    expect(await settleHpDays('2026-10-20', database)).toStrictEqual([])
    expect(await storedSettings()).toBeUndefined()
    expect(await database.hpLedger.count()).toBe(0)
  })

  it('der erste Aufruf setzt nur den Beginn – ein verpasster Verlauf kostet rückwirkend nichts', async () => {
    const habits = await hero()
    await complete(habits, START, 1) // danach 19 Tage nichts
    await updateSettings({ dayStartHour: 6 }, database)

    expect(await settleHpDays('2026-10-20', database)).toStrictEqual([])
    expect(await storedSettings()).toStrictEqual({ dayStartHour: 6, penalties: { enabled: true, since: '2026-10-20' } })
    expect(await database.hpLedger.count()).toBe(0)
    expect((await state('2026-10-20')).hp).toMatchObject({ current: 50, max: 50 })

    // Ein (vorher) eingeschalteter Sanfter Modus bleibt beim Setzen des Beginns erhalten.
    await database.kv.put({ key: KV_KEYS.settings, value: { penalties: { enabled: false } } })
    await settleHpDays('2026-10-21', database)
    expect(await storedSettings()).toStrictEqual({ penalties: { enabled: false, since: '2026-10-21' } })
  })

  it('rechnet ab dem Beginn bis vorgestern ab – gestern bleibt in der Gnadenfrist', async () => {
    const habits = await hero()
    await settleHpDays(START, database) // Beginn = START
    await complete(habits, '2026-10-01', 3) // perfect: +10, schon voll → 50
    await complete(habits, '2026-10-02', 2) // good: +2, schon voll → 50
    await complete(habits, '2026-10-03', 1) // weak: 50 − 1 = 49
    // 4. Oktober: nichts → missed: 49 − 6 = 43; 5. Oktober (gestern): noch offen
    const today = '2026-10-06'
    const expected = settleDays(await loadGameData(database), today)

    const entries = await settleHpDays(today, database)
    expect(entries).toStrictEqual(expected)
    expect(entries.map((entry) => entry.day)).toEqual(dayRange('2026-10-01', '2026-10-04'))
    expect(entries.map((entry) => entry.score)).toEqual(['perfect', 'good', 'weak', 'missed'])
    expect(entries.map((entry) => entry.hpAfter)).toEqual([50, 50, 49, 43])
    expect((await loadGameData(database)).hpLedger).toStrictEqual(entries)

    const hp = (await state(today)).hp
    expect(hp).toMatchObject({ current: 43, max: 50, settledThrough: '2026-10-04' })
    expect(hp.yesterday).toMatchObject({ day: '2026-10-05', score: 'missed', threatenedDelta: BALANCING.hpByScore.missed })
  })

  it('ist idempotent, setzt nach einer Pause fort und ändert gespeicherte Tage nie', async () => {
    const habits = await hero()
    await settleHpDays(START, database)
    await complete(habits, '2026-10-02', 1)
    const first = await settleHpDays('2026-10-06', database)
    expect(first).toHaveLength(4)
    expect(await settleHpDays('2026-10-06', database)).toStrictEqual([])

    // Nachträglich bearbeitete, schon abgerechnete Tage wirken nicht rückwirkend.
    await complete(habits, '2026-10-04', 3)
    expect(await settleHpDays('2026-10-06', database)).toStrictEqual([])
    expect((await loadGameData(database)).hpLedger).toStrictEqual(first)

    // Nach ein paar Tagen ohne App geht es mit dem nächsten offenen Tag weiter.
    const later = await settleHpDays('2026-10-10', database)
    expect(later.map((entry) => entry.day)).toEqual(dayRange('2026-10-05', '2026-10-08'))
    expect((await loadGameData(database)).hpLedger).toStrictEqual([...first, ...later])
  })

  it('gleichzeitige Aufrufe rechnen jeden Tag genau einmal ab', async () => {
    const habits = await hero()
    await settleHpDays(START, database)
    await complete(habits, '2026-10-03', 2)
    const results = await Promise.all([
      settleHpDays('2026-10-12', database),
      settleHpDays('2026-10-12', database),
      settleHpDays('2026-10-12', database),
    ])
    expect(results.map((entries) => entries.length).sort()).toEqual([0, 0, 10])
    expect((await loadGameData(database)).hpLedger?.map((entry) => entry.day)).toEqual(dayRange('2026-10-01', '2026-10-10'))
  })

  it('gleichzeitig mit dem allerersten Aufruf: der Beginn wird nur einmal gesetzt', async () => {
    await hero()
    await Promise.all([settleHpDays('2026-10-05', database), settleHpDays('2026-10-07', database)])
    // Wer zuerst kommt, setzt den Beginn; der zweite rechnet höchstens ab diesem Beginn ab.
    const { settings, hpLedger } = await loadGameData(database)
    expect(['2026-10-05', '2026-10-07']).toContain(settings.penalties?.since)
    for (const entry of hpLedger ?? []) expect(entry.day >= (settings.penalties?.since ?? '')).toBe(true)
  })

  it('Niederlage: 15 % des Guthabens weg, HP wieder voll – Level, XP und Streaks bleiben', async () => {
    const habits = await hero()
    await settleHpDays(START, database)
    const loot = await createSideQuest({ title: 'Schatz', icon: '💰', attribute: 'strength', difficulty: 'hard' }, START, database)
    await completeSideQuest(loot.id, START, database) // Nebenquests zählen nicht als erledigte Quest
    // Nie mehr als drei verpasste Tage am Stück – ab dem 4. Tag ohne Quest wäre Pause (kein Schaden mehr):
    // 1.–3. Oktober verpasst: 50 − 3 × 6 = 32
    await complete(habits, '2026-10-04', 1) // weak: 32 − 1 = 31 (die Zählung der Abwesenheit beginnt neu)
    // 5.–7. Oktober verpasst: 31 − 3 × 6 = 13
    await complete(habits, '2026-10-08', 1) // weak: 13 − 1 = 12
    // 9. Oktober verpasst: 6, 10. Oktober verpasst: 0 → Niederlage
    const defeatDay = '2026-10-10'
    const before = await loadGameData(database)
    const balanceAtDefeat = deriveGameState(before, defeatDay).gold.balance
    const stateBefore = deriveGameState(before, '2026-10-12')

    const entries = await settleHpDays('2026-10-12', database)
    expect(entries.map((entry) => entry.score)).toEqual([
      ...['missed', 'missed', 'missed', 'weak'],
      ...['missed', 'missed', 'missed', 'weak'],
      ...['missed', 'missed'],
    ])
    expect(entries.map((entry) => entry.hpAfter)).toEqual([44, 38, 32, 31, 25, 19, 13, 12, 6, 50])
    const defeat = entries.at(-1)
    expect(defeat).toMatchObject({ day: defeatDay, score: 'missed', hpDelta: -6, hpAfter: 50, penalties: true })
    // Kleines Guthaben (40 XP + 2 × 10 XP → 30 Gold plus Erfolgs-Gold): 15 %, weit unter der Obergrenze.
    const goldLost = Math.floor(balanceAtDefeat * 0.15)
    expect(goldLost).toBeGreaterThan(0)
    expect(goldLost).toBeLessThan(100)
    expect(defeat?.defeat).toStrictEqual({ goldLost })

    const after = await state('2026-10-12')
    expect(after.gold.lostToDefeats).toBe(goldLost)
    expect(after.gold.balance).toBe(stateBefore.gold.balance - goldLost)
    expect(after.level).toStrictEqual(stateBefore.level)
    expect(after.totals).toStrictEqual(stateBefore.totals)
    expect(after.hp).toMatchObject({ current: 50, defeats: 1, lastDefeat: { day: defeatDay, goldLost } })
  })

  it('reine Abwesenheit führt nie zur Niederlage – ab dem 4. Tag ohne Quest ruhen die Lebenspunkte', async () => {
    const habits = await hero()
    await settleHpDays(START, database)
    await complete(habits, START, 1)
    // Abgerechnet bis START + 58 (28. November): 59 Tage.
    const entries = await settleHpDays(addDays(START, 60), database)
    expect(entries).toHaveLength(59)
    expect(entries.some((entry) => entry.defeat !== undefined)).toBe(false)
    // 1. Oktober weak (49), 2.–4. Oktober verpasst (1.–3. Tag ohne Quest: 43, 37, 31), ab dem 5. Oktober Pause.
    expect(entries.slice(0, 5).map((entry) => [entry.score, entry.hpAfter])).toEqual([
      ['weak', 49],
      ['missed', 43],
      ['missed', 37],
      ['missed', 31],
      ['absent', 31],
    ])
    expect(entries.filter((entry) => entry.score === 'absent')).toHaveLength(59 - 4)
    // Eine Pause kostet höchstens 3 × −6 = −18 HP: 50 − 1 − 18 = 31.
    expect(Math.min(...entries.map((entry) => entry.hpAfter))).toBe(31)
  })

  it('eine Wochenquest allein macht aus einem leeren Tag „Ein Anfang“ (−1 statt −6) und beendet die Pause', async () => {
    const habits = await hero(1)
    const weekly = await createHabit(
      { title: 'Laufen', icon: '🏃', attribute: 'vitality', difficulty: 'easy', schedule: { type: 'weekly', times: 2 } },
      START,
      database,
    )
    await settleHpDays(START, database)
    await toggleCompletion(weekly.id, '2026-10-01', database) // nur die Wochenquest: weak, 50 − 1 = 49
    // 2.–4. Oktober nichts: 43, 37, 31; 5.–7. Oktober nichts: Pause (4.–6. Tag ohne Quest), bleibt 31
    await toggleCompletion(weekly.id, '2026-10-08', database) // wieder nur die Wochenquest: weak, 31 − 1 = 30
    await toggleCompletion(habits[0].id, '2026-10-09', database) // die Tagesquest: perfect, 30 + 10 = 40
    // 10. Oktober nichts: 1. Tag ohne Quest → missed, 40 − 6 = 34
    const entries = await settleHpDays('2026-10-12', database)
    expect(entries.map((entry) => [entry.day, entry.score, entry.hpDelta, entry.hpAfter])).toEqual([
      ['2026-10-01', 'weak', -1, 49],
      ['2026-10-02', 'missed', -6, 43],
      ['2026-10-03', 'missed', -6, 37],
      ['2026-10-04', 'missed', -6, 31],
      ['2026-10-05', 'absent', 0, 31],
      ['2026-10-06', 'absent', 0, 31],
      ['2026-10-07', 'absent', 0, 31],
      ['2026-10-08', 'weak', -1, 30],
      ['2026-10-09', 'perfect', 10, 40],
      ['2026-10-10', 'missed', -6, 34],
    ])
  })

  it('eine Niederlage kostet höchstens 100 Gold – bei großem Guthaben nicht 15 %', async () => {
    await hero()
    await settleHpDays(START, database)
    // 20 epische Nebenquests am START: 1.600 XP → 800 Gold (plus Erfolgs-Gold); 15 % wären über 100.
    for (let i = 1; i <= 20; i++) {
      const quest = await createSideQuest({ title: `Drache ${i}`, icon: '🐉', attribute: 'strength', difficulty: 'epic' }, START, database)
      await completeSideQuest(quest.id, START, database)
    }
    // Angeschlagen in den 2. Oktober: 5 HP nach dem (schon abgerechneten) START.
    await database.hpLedger.add(makeLedgerEntry(START, { score: 'missed', hpDelta: -6, hpAfter: 5, maxHp: 65 }))
    const balanceAtDefeat = deriveGameState(await loadGameData(database), '2026-10-02').gold.balance
    expect(balanceAtDefeat).toBeGreaterThanOrEqual(800)
    expect(Math.floor(balanceAtDefeat * 0.15)).toBeGreaterThan(100)

    // 2. Oktober verpasst: 5 − 6 → 0 → Niederlage, 100 Gold statt 15 % weg.
    const [defeat] = await settleHpDays('2026-10-04', database)
    expect(defeat).toMatchObject({ day: '2026-10-02', score: 'missed', hpAfter: 65, defeat: { goldLost: 100 } })
    const after = await state('2026-10-04')
    expect(after.gold.lostToDefeats).toBe(100)
    expect(after.gold.balance).toBe(balanceAtDefeat - 100)
  })

  it('Sanfter Modus: Wertung ja, HP-Wirkung nein; wieder eingeschaltet starten die HP voll', async () => {
    const habits = await hero()
    await settleHpDays(START, database)
    await complete(habits, '2026-10-01', 1)
    const hurt = await settleHpDays('2026-10-04', database) // 1. Oktober weak: 49; 2. Oktober verpasst: 43
    expect(hurt.map((entry) => entry.hpAfter)).toEqual([49, 43])

    await setPenaltiesEnabled(false, '2026-10-04', database)
    await complete(habits, '2026-10-04', 1)
    const gentle = await settleHpDays('2026-10-07', database) // 3. Oktober verpasst, 4. Oktober weak, 5. Oktober verpasst
    expect(gentle.map((entry) => entry.score)).toEqual(['missed', 'weak', 'missed'])
    for (const entry of gentle) expect(entry).toMatchObject({ penalties: false, hpDelta: 0, frozen: false })
    expect((await state('2026-10-07')).hp.enabled).toBe(false)

    await setPenaltiesEnabled(true, '2026-10-07', database)
    expect((await loadGameData(database)).settings.penalties).toStrictEqual({ enabled: true, since: START })
    expect((await state('2026-10-07')).hp).toMatchObject({ enabled: true, current: 50 })
    // 6. Oktober verpasst (2. Tag ohne Quest seit dem 4., noch keine Pause): von voll aus 50 − 6 = 44
    const back = await settleHpDays('2026-10-08', database)
    expect(back).toMatchObject([{ day: '2026-10-06', penalties: true, hpAfter: 44 }])
  })

  it('prüft den Spieltag', async () => {
    await expect(settleHpDays('06.10.2026', database)).rejects.toThrow('Ungültiges Datum')
  })
})

describe('setPenaltiesEnabled', () => {
  it('Ausschalten vor der ersten Abrechnung setzt keinen Beginn; die erste Abrechnung danach im Sanften Modus', async () => {
    const habits = await hero()
    await setPenaltiesEnabled(false, START, database)
    expect(await storedSettings()).toStrictEqual({ penalties: { enabled: false } })
    await settleHpDays('2026-10-02', database)
    expect(await storedSettings()).toStrictEqual({ penalties: { enabled: false, since: '2026-10-02' } })
    await complete(habits, '2026-10-03', 1)
    expect(await settleHpDays('2026-10-05', database)).toMatchObject([
      { day: '2026-10-02', score: 'missed', penalties: false, hpDelta: 0, hpAfter: 50 },
      { day: '2026-10-03', score: 'weak', penalties: false, hpDelta: 0, hpAfter: 50 },
    ])
  })

  it('Einschalten setzt den Beginn nur, wenn er fehlt; andere Einstellungen bleiben', async () => {
    await updateSettings({ effects: false }, database)
    await setPenaltiesEnabled(true, '2026-10-05', database)
    expect(await storedSettings()).toStrictEqual({ effects: false, penalties: { enabled: true, since: '2026-10-05' } })
    await setPenaltiesEnabled(false, '2026-10-09', database)
    await setPenaltiesEnabled(true, '2026-10-12', database)
    expect(await storedSettings()).toStrictEqual({ effects: false, penalties: { enabled: true, since: '2026-10-05' } })
  })

  it('prüft den Spieltag', async () => {
    await expect(setPenaltiesEnabled(true, '', database)).rejects.toThrow('Ungültiges Datum')
    expect(await storedSettings()).toBeUndefined()
  })
})
