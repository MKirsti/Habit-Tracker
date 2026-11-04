import 'fake-indexeddb/auto'
import { afterEach, beforeEach, describe, expect, expectTypeOf, it, vi } from 'vitest'
import type { z } from 'zod'
import { makeItemPurchase } from '../domain/testing'
import type { GameData } from '../domain/types'
import {
  BACKUP_APP_ID,
  BACKUP_SCHEMA_VERSION,
  backupFileName,
  createBackup,
  gameDataSchema,
  parseBackup,
  restoreBackup,
  type BackupFile,
} from './backup'
import { QuestlogDB } from './db'
import {
  addRestPeriod,
  archiveHabit,
  archiveReward,
  completeSideQuest,
  createHabit,
  createMainQuest,
  createReward,
  createSideQuest,
  deleteHabit,
  loadGameData,
  markHpIntroSeen,
  purchaseReward,
  recordAchievementUnlocks,
  saveProfile,
  settleHpDays,
  setChapterCounter,
  setChapterManual,
  restoreHabit,
  setCompletionValue,
  toggleCompletion,
  updateHabit,
  updateSettings,
} from './repository'

const DAY = '2026-11-03'
const EXPORT_TIME = new Date('2026-11-03T18:30:00.000Z')

const openDatabases: QuestlogDB[] = []
let dbCounter = 0

function freshDatabase(): QuestlogDB {
  const database = new QuestlogDB(`questlog-test-backup-${++dbCounter}`)
  openDatabases.push(database)
  return database
}

let source: QuestlogDB

beforeEach(() => {
  source = freshDatabase()
})

afterEach(async () => {
  vi.restoreAllMocks()
  await Promise.all(openDatabases.splice(0).map((database) => database.delete()))
})

/** Füllt eine Datenbank mit Daten, die (fast) alle optionalen Felder und Varianten nutzen. */
async function fillWithRichData(database: QuestlogDB): Promise<void> {
  await saveProfile({ name: 'Aria', avatar: '🧝', createdDay: '2026-10-01' }, database)
  await updateSettings({ dayStartHour: 5, effects: false }, database)

  const quest = await createMainQuest(
    {
      title: 'Der Weg des Gelehrten',
      icon: '📚',
      description: 'Ein Jahr voller Bücher',
      why: 'Mehr wissen',
      reward: 'Ein schönes Buch',
      startDay: '2026-10-01',
      deadline: '2027-10-01',
      chapters: [
        { id: 'c1', title: 'Erstes Buch', description: 'Egal wie dick', criterion: { type: 'manual' } },
        { id: 'c2', title: 'Zwölf Bücher', criterion: { type: 'counter', target: 12, label: 'Bücher' } },
        { id: 'c3', title: 'Platzhalter', criterion: { type: 'manual' } },
      ],
    },
    database,
  )
  const reading = await createHabit(
    {
      title: 'Lesen',
      icon: '📖',
      description: '10 Seiten',
      attribute: 'intellect',
      difficulty: 'medium',
      schedule: { type: 'daily' },
      measure: { target: 10, unit: 'Seiten' },
      mainQuestId: quest.id,
    },
    '2026-10-01',
    database,
  )
  const gym = await createHabit(
    {
      title: 'Training',
      icon: '🏋️',
      attribute: 'strength',
      difficulty: 'hard',
      schedule: { type: 'weekdays', days: [1, 3, 5] },
    },
    '2026-10-01',
    database,
  )
  const talk = await createHabit(
    {
      title: 'Anrufen',
      icon: '📞',
      attribute: 'charisma',
      difficulty: 'easy',
      schedule: { type: 'weekly', times: 2 },
    },
    '2026-10-02',
    database,
  )
  await archiveHabit(talk.id, '2026-10-20', database)
  // Rhythmus-Änderung und zurückgeholte Archivierung → scheduleHistory und pauses
  await updateHabit(gym.id, { schedule: { type: 'daily' } }, '2026-10-10', database)
  await archiveHabit(gym.id, '2026-10-12', database)
  await restoreHabit(gym.id, '2026-10-15', database)

  await setCompletionValue(reading.id, '2026-10-01', 4, database)
  await setCompletionValue(reading.id, '2026-10-02', 12, database)
  await toggleCompletion(gym.id, '2026-10-02', database)
  await toggleCompletion(talk.id, '2026-10-05', database)

  await setChapterManual(quest.id, 'c1', true, '2026-10-15', database)
  await setChapterCounter(quest.id, 'c2', 3, '2026-10-16', database)

  // Gelöschte Quest mit Rhythmus-Verlauf und Pause → Grabstein in `deletedHabits`
  const gone = await createHabit(
    { title: 'Weg', icon: '🗑️', attribute: 'vitality', difficulty: 'easy', schedule: { type: 'daily' } },
    '2026-10-01',
    database,
  )
  await updateHabit(gone.id, { schedule: { type: 'weekdays', days: [2, 4] } }, '2026-10-05', database)
  await archiveHabit(gone.id, '2026-10-07', database)
  await restoreHabit(gone.id, '2026-10-09', database)
  await archiveHabit(gone.id, '2026-10-18', database)
  await toggleCompletion(gone.id, '2026-10-02', database)
  await deleteHabit(gone.id, '2026-10-20', database)

  await createMainQuest(
    {
      title: 'Alte Kampagne',
      icon: '🗡️',
      why: '',
      reward: '',
      startDay: '2026-01-01',
      archived: true,
      chapters: [{ id: 'old', title: 'Fertig', criterion: { type: 'habit', habitId: 'gelöscht', metric: 'total', target: 5 } }],
    },
    database,
  )

  // Phase 2a: Schatzkammer (auch ausgeblendet, einmalig), Einlösungen, Nebenquests (offen/erledigt), Erfolge
  const pizza = await createReward(
    { title: 'Pizza', icon: '🍕', description: 'Mit extra Käse', price: 40, repeatable: true },
    database,
  )
  const book = await createReward({ title: 'Buch', icon: '📕', price: 5, repeatable: false }, database)
  const old = await createReward({ title: 'Alter Wunsch', icon: '🗝️', price: 999, repeatable: true }, database)
  await archiveReward(old.id, database)
  const taxes = await createSideQuest(
    { title: 'Steuer', icon: '🧾', description: 'Belege', attribute: 'discipline', difficulty: 'epic', dueDay: '2026-10-20' },
    '2026-10-01',
    database,
  )
  await completeSideQuest(taxes.id, '2026-10-03', database)
  await createSideQuest({ title: 'Zahnarzt', icon: '🦷', attribute: 'vitality', difficulty: 'easy' }, '2026-10-05', database)
  await purchaseReward(pizza.id, '2026-10-16', database)
  await purchaseReward(book.id, '2026-10-17', database)
  await recordAchievementUnlocks(
    [
      { id: 'quests-10', day: '2026-10-09' },
      { id: 'side-quests-1', day: '2026-10-03' },
    ],
    database,
  )

  // Phase 2b: Abrechnung ab 1. Oktober, Gegenstand, Rast (laufend und geplant), Einführung gesehen
  await settleHpDays('2026-10-01', database)
  await database.purchases.add(makeItemPurchase('frost', 'streakFreeze', '2026-10-05', { createdAt: 5 }))
  await settleHpDays('2026-10-20', database)
  await addRestPeriod({ from: '2026-10-19', until: '2026-10-21', note: 'Krank' }, '2026-10-20', database)
  await addRestPeriod({ from: '2026-12-24', until: '2026-12-26' }, '2026-10-20', database)
  await markHpIntroSeen(database)
}

/** Einträge der Phase-2b-Listen und -Einstellungen, wie sie ein Backup enthalten kann. */
function phase2bEntries() {
  return {
    settings: { dayStartHour: 4, effects: true, penalties: { enabled: true, since: '2026-10-01' }, hpIntroSeen: true },
    purchases: [
      { id: 'i1', kind: 'item', itemId: 'streakFreeze', title: 'Streak-Schutz', icon: '❄️', price: 150, day: '2026-10-01', createdAt: 1 },
      { id: 'i2', kind: 'item', itemId: 'healingPotion', title: 'Heiltrank', icon: '🧪', price: 80, day: '2026-10-02', createdAt: 2 },
    ],
    hpLedger: [
      { day: '2026-10-01', score: 'missed', frozen: true, hpDelta: 0, hpAfter: 50, maxHp: 50, penalties: true },
      { day: '2026-10-02', score: 'weak', frozen: false, hpDelta: 0, hpAfter: 50, maxHp: 50, penalties: true },
      { day: '2026-10-03', score: 'missed', frozen: false, hpDelta: 2, hpAfter: 55, maxHp: 55, defeat: { goldLost: 12 }, penalties: true },
      { day: '2026-10-04', score: 'rest', frozen: false, hpDelta: 0, hpAfter: 55, maxHp: 55, penalties: false },
    ],
    restPeriods: [
      { id: 'rast', from: '2026-10-04', until: '2026-10-04', createdAt: 3 },
      { id: 'urlaub', from: '2026-12-01', until: '2026-12-14', note: 'Italien', createdAt: 4 },
    ],
  }
}

/** Einträge der Phase-2a-Listen, wie sie ein Backup enthalten kann. */
function phase2aEntries() {
  return {
    rewards: [
      { id: 'r1', title: 'Pizza', icon: '🍕', description: 'Mit Käse', price: 40, repeatable: true, order: 0, createdAt: 1 },
      { id: 'r2', title: 'Alt', icon: '🗝️', price: 5, repeatable: false, order: 1, archived: true, createdAt: 2 },
    ],
    purchases: [
      { id: 'p1', kind: 'reward', rewardId: 'r1', title: 'Pizza', icon: '🍕', price: 40, day: DAY, createdAt: 3 },
      { id: 'p2', kind: 'reward', title: 'Ohne Verweis', icon: '🎁', price: 1, day: DAY, createdAt: 4 },
    ],
    sideQuests: [
      { id: 's1', title: 'Steuer', icon: '🧾', description: 'Belege', attribute: 'discipline', difficulty: 'hard', dueDay: DAY, createdDay: DAY, doneDay: DAY, order: 0 },
      { id: 's2', title: 'Keller', icon: '📦', attribute: 'vitality', difficulty: 'easy', createdDay: DAY, order: 1 },
    ],
    achievementUnlocks: [{ id: 'streak-7', day: DAY }],
  }
}

/** Ein gültiges, minimales Backup als frisches Objekt (zum gezielten Kaputtmachen in Tests). */
function validBackup(): Record<string, unknown> & { data: Record<string, unknown> } {
  return {
    app: 'questlog',
    schemaVersion: 1,
    exportedAt: EXPORT_TIME.toISOString(),
    data: {
      settings: { dayStartHour: 4, effects: true },
      habits: [
        {
          id: 'h1',
          title: 'Lesen',
          icon: '📖',
          attribute: 'intellect',
          difficulty: 'medium',
          schedule: { type: 'daily' },
          order: 0,
          createdDay: DAY,
        },
      ],
      completions: [
        {
          id: `h1:${DAY}`,
          habitId: 'h1',
          day: DAY,
          value: 1,
          target: 1,
          difficulty: 'medium',
          attribute: 'intellect',
          updatedAt: 1,
        },
      ],
      mainQuests: [],
    },
  }
}

function expectError(input: unknown): string {
  const result = parseBackup(input)
  if (result.ok) throw new Error('Backup hätte abgelehnt werden müssen')
  return result.error
}

// ---------------------------------------------------------------------------

describe('createBackup', () => {
  it('enthält App-Kennung, Version, Zeitpunkt und alle Daten', async () => {
    await fillWithRichData(source)
    const backup = await createBackup(EXPORT_TIME, source)
    expect(backup.app).toBe(BACKUP_APP_ID)
    expect(backup.schemaVersion).toBe(BACKUP_SCHEMA_VERSION)
    expect(backup.exportedAt).toBe('2026-11-03T18:30:00.000Z')
    expect(backup.data).toStrictEqual(await loadGameData(source))
  })
})

describe('Backup-Roundtrip', () => {
  it('create → JSON → parse → restore in frische DB ergibt identische Daten', async () => {
    await fillWithRichData(source)
    const original = await loadGameData(source)
    // Sicherstellen, dass die Testdaten wirklich die optionalen Felder abdecken.
    expect(original.profile).toBeDefined()
    expect(original.habits.some((h) => h.archivedDay && h.measure === undefined)).toBe(true)
    expect(original.habits.some((h) => h.measure && h.mainQuestId && h.description)).toBe(true)
    expect(original.mainQuests.some((q) => q.archived)).toBe(true)
    expect(original.habits.some((h) => h.scheduleHistory?.length && h.pauses?.length)).toBe(true)
    expect(original.mainQuests.flatMap((q) => q.chapters).some((c) => c.completedDay && c.manualDone)).toBe(true)
    expect(original.deletedHabits?.some((t) => t.scheduleHistory?.length && t.pauses?.length)).toBe(true)
    expect(original.rewards?.some((r) => r.archived) && original.rewards.some((r) => r.description && r.repeatable)).toBe(true)
    expect(original.rewards?.some((r) => !r.repeatable)).toBe(true)
    expect(original.purchases).toHaveLength(3)
    expect(original.purchases?.some((purchase) => purchase.kind === 'item' && purchase.itemId === 'streakFreeze')).toBe(true)
    expect(original.hpLedger?.length).toBeGreaterThan(10)
    expect(original.hpLedger?.some((entry) => entry.frozen)).toBe(true)
    expect(original.restPeriods?.some((period) => period.note) && original.restPeriods.some((period) => !period.note)).toBe(true)
    expect(original.settings.penalties).toStrictEqual({ enabled: true, since: '2026-10-01' })
    expect(original.settings.hpIntroSeen).toBe(true)
    expect(original.sideQuests?.some((q) => q.doneDay && q.dueDay && q.description)).toBe(true)
    expect(original.sideQuests?.some((q) => q.doneDay === undefined)).toBe(true)
    expect(original.achievementUnlocks).toHaveLength(2)

    const json = JSON.stringify(await createBackup(EXPORT_TIME, source))
    const parsed = parseBackup(JSON.parse(json))
    if (!parsed.ok) throw new Error(parsed.error)

    const target = freshDatabase()
    // Gleich nach dem Export wiederhergestellt (die Uhr fest, sonst hinge der Beginn der Abrechnung vom Testtag ab).
    await restoreBackup(parsed.backup, target, EXPORT_TIME)

    expect(await loadGameData(target)).toStrictEqual(original)
  })

  it('funktioniert auch ohne Profil und mit leerer Datenbank', async () => {
    const json = JSON.stringify(await createBackup(EXPORT_TIME, source))
    const parsed = parseBackup(json) // JSON-Text wird direkt akzeptiert
    if (!parsed.ok) throw new Error(parsed.error)
    expect('profile' in parsed.backup.data).toBe(false)

    const target = freshDatabase()
    await fillWithRichData(target)
    await restoreBackup(parsed.backup, target)
    expect(await loadGameData(target)).toStrictEqual(await loadGameData(source))
  })

  it('ersetzt alle vorhandenen Daten', async () => {
    await fillWithRichData(source)
    const backup = await createBackup(EXPORT_TIME, source)

    const target = freshDatabase()
    await saveProfile({ name: 'Bram', avatar: '🧔', createdDay: DAY }, target)
    await createHabit(
      { title: 'Alt', icon: '🗑️', attribute: 'vitality', difficulty: 'easy', schedule: { type: 'daily' } },
      DAY,
      target,
    )
    await restoreBackup(backup, target, EXPORT_TIME)

    const restored = await loadGameData(target)
    expect(restored).toStrictEqual(await loadGameData(source))
    expect(restored.habits.some((h) => h.title === 'Alt')).toBe(false)
  })

  it('lässt bei einem Fehler während der Wiederherstellung den alten Stand unangetastet', async () => {
    await fillWithRichData(source)
    const backup = await createBackup(EXPORT_TIME, source)

    const target = freshDatabase()
    await saveProfile({ name: 'Bram', avatar: '🧔', createdDay: DAY }, target)
    await createHabit(
      { title: 'Alt', icon: '🗑️', attribute: 'vitality', difficulty: 'easy', schedule: { type: 'daily' } },
      DAY,
      target,
    )
    const before = await loadGameData(target)

    vi.spyOn(target.mainQuests, 'bulkAdd').mockRejectedValue(new Error('Festplatte voll'))
    await expect(restoreBackup(backup, target)).rejects.toThrow('Festplatte voll')
    vi.restoreAllMocks()

    expect(await loadGameData(target)).toStrictEqual(before)
  })

  it('lässt bei einem Fehler in den Phase-2a-Tabellen den alten Stand unangetastet', async () => {
    await fillWithRichData(source)
    const backup = await createBackup(EXPORT_TIME, source)

    const target = freshDatabase()
    await fillWithRichData(target)
    await createReward({ title: 'Nur im Ziel', icon: '🎈', price: 3, repeatable: true }, target)
    const before = await loadGameData(target)

    vi.spyOn(target.achievementUnlocks, 'bulkAdd').mockRejectedValue(new Error('Festplatte voll'))
    await expect(restoreBackup(backup, target)).rejects.toThrow('Festplatte voll')
    vi.restoreAllMocks()

    expect(await loadGameData(target)).toStrictEqual(before)
  })

  it('lässt bei einem Fehler in den Phase-2b-Tabellen den alten Stand unangetastet', async () => {
    await fillWithRichData(source)
    const backup = await createBackup(EXPORT_TIME, source)

    const target = freshDatabase()
    await fillWithRichData(target)
    await addRestPeriod({ from: '2027-01-10', until: '2027-01-12' }, '2026-10-20', target)
    const before = await loadGameData(target)

    vi.spyOn(target.restPeriods, 'bulkAdd').mockRejectedValue(new Error('Festplatte voll'))
    await expect(restoreBackup(backup, target)).rejects.toThrow('Festplatte voll')
    vi.restoreAllMocks()

    expect(await loadGameData(target)).toStrictEqual(before)
  })

  it('ein Backup ohne Phase-2b-Daten leert Ledger und Rast; abgerechnet wird danach nie rückwirkend', async () => {
    const target = freshDatabase()
    await fillWithRichData(target)
    const input = validBackup()
    input.data.profile = { name: 'Aria', avatar: '🧝', createdDay: '2026-10-01' }
    const parsed = parseBackup(input)
    if (!parsed.ok) throw new Error(parsed.error)

    await restoreBackup(parsed.backup, target)

    const restored = await loadGameData(target)
    for (const key of ['hpLedger', 'restPeriods']) expect(key in restored).toBe(false)
    expect(restored.settings).toStrictEqual({ dayStartHour: 4, effects: true })
    expect(await target.hpLedger.count()).toBe(0)
    expect(await target.restPeriods.count()).toBe(0)
    expect(await settleHpDays('2026-11-20', target)).toStrictEqual([])
    expect((await loadGameData(target)).settings.penalties).toStrictEqual({ enabled: true, since: '2026-11-20' })
  })

  it('ein älteres Backup ohne Phase-2a-Listen leert Belohnungen, Einlösungen, Nebenquests und Erfolge', async () => {
    const target = freshDatabase()
    await fillWithRichData(target)
    const parsed = parseBackup(validBackup())
    if (!parsed.ok) throw new Error(parsed.error)

    await restoreBackup(parsed.backup, target)

    const restored = await loadGameData(target)
    for (const key of ['rewards', 'purchases', 'sideQuests', 'achievementUnlocks']) expect(key in restored).toBe(false)
    for (const table of [target.rewards, target.purchases, target.sideQuests, target.achievementUnlocks]) {
      expect(await table.count()).toBe(0)
    }
    expect(restored.habits.map((habit) => habit.id)).toEqual(['h1'])
  })

  it('wirft bei ungültigem Backup, ohne Daten zu ändern', async () => {
    await saveProfile({ name: 'Bram', avatar: '🧔', createdDay: DAY }, source)
    const before = await loadGameData(source)
    const broken = { ...validBackup(), schemaVersion: 7 } as unknown as BackupFile
    await expect(restoreBackup(broken, source)).rejects.toThrow('Backup-Version 7 wird nicht unterstützt.')
    expect(await loadGameData(source)).toStrictEqual(before)
  })
})

describe('parseBackup', () => {
  it('akzeptiert ein gültiges Backup und verwirft unbekannte Felder', () => {
    const input = validBackup()
    input.extra = true
    ;(input.data.habits as Record<string, unknown>[])[0].legacy = 'x'
    const result = parseBackup(input)
    if (!result.ok) throw new Error(result.error)
    expect('extra' in result.backup).toBe(false)
    expect('legacy' in result.backup.data.habits[0]).toBe(false)
    expect(result.backup.data.habits[0].title).toBe('Lesen')
  })

  it.each([
    ['null', null],
    ['Array', []],
    ['Zahl', 42],
    ['fremde App', { ...validBackup(), app: 'habitica' }],
    ['ohne App-Kennung', { schemaVersion: 1, data: {} }],
  ])('erkennt Dateien, die kein Questlog-Backup sind: %s', (_label, input) => {
    expect(expectError(input)).toBe('Diese Datei ist kein Questlog-Backup.')
  })

  it('übernimmt Rhythmus-Verlauf und Pausen; ältere Backups ohne diese Felder bleiben gültig', () => {
    const input = validBackup()
    const history = [
      { until: '2026-11-10', schedule: { type: 'weekly', times: 2 } },
      { until: '2026-11-17', schedule: { type: 'weekdays', days: [1, 3] } },
    ]
    const pauses = [{ from: '2026-11-20', until: '2026-11-25' }]
    Object.assign(habitOf(input), { scheduleHistory: history, pauses })
    const result = parseBackup(input)
    if (!result.ok) throw new Error(result.error)
    expect(result.backup.data.habits[0].scheduleHistory).toStrictEqual(history)
    expect(result.backup.data.habits[0].pauses).toStrictEqual(pauses)

    const legacy = parseBackup(validBackup())
    if (!legacy.ok) throw new Error(legacy.error)
    expect('scheduleHistory' in legacy.backup.data.habits[0]).toBe(false)
    expect('pauses' in legacy.backup.data.habits[0]).toBe(false)
  })

  it('übernimmt Grabsteine gelöschter Quests; ältere Backups ohne sie bleiben gültig', () => {
    const tombstone = {
      id: 'weg',
      createdDay: '2026-10-01',
      archivedDay: DAY,
      schedule: { type: 'weekdays', days: [1, 3] },
      scheduleHistory: [{ until: '2026-10-10', schedule: { type: 'daily' } }],
      pauses: [{ from: '2026-10-12', until: '2026-10-14' }],
    }
    const input = validBackup()
    input.data.deletedHabits = [tombstone, { id: 'schlicht', createdDay: DAY, archivedDay: DAY, schedule: { type: 'daily' } }]
    const result = parseBackup(input)
    if (!result.ok) throw new Error(result.error)
    expect(result.backup.data.deletedHabits).toStrictEqual(input.data.deletedHabits)

    const legacy = parseBackup(validBackup())
    if (!legacy.ok) throw new Error(legacy.error)
    expect('deletedHabits' in legacy.backup.data).toBe(false)
  })

  it.each([
    ['doppelte ID', [{ id: 'x' }, { id: 'x' }], /^Ungültige Daten: data\.deletedHabits\.1\.id – Doppelte ID/],
    ['ungültiger Rhythmus', [{ schedule: { type: 'weekly', times: 9 } }], /^Ungültige Daten: data\.deletedHabits\.0\.schedule/],
    ['Pause ohne Dauer', [{ pauses: [{ from: DAY, until: DAY }] }], /deletedHabits\.0\.pauses\.0\.until – Eine Pause muss enden/],
    ['unsortierter Verlauf', [{ scheduleHistory: [{ until: '2026-10-10', schedule: { type: 'daily' } }, { until: '2026-10-01', schedule: { type: 'daily' } }] }], /deletedHabits\.0\.scheduleHistory\.1\.until/],
    ['fehlender Endtag', [{ archivedDay: undefined }], /deletedHabits\.0\.archivedDay/],
  ])('lehnt ungültige Grabsteine ab: %s', (_label, overrides, message) => {
    const input = validBackup()
    input.data.deletedHabits = (overrides as Record<string, unknown>[]).map((override) => ({
      id: 'weg',
      createdDay: '2026-10-01',
      archivedDay: DAY,
      schedule: { type: 'daily' },
      ...override,
    }))
    expect(expectError(input)).toMatch(message)
  })

  it('übernimmt Belohnungen, Einlösungen, Nebenquests und Erfolge; ältere Backups ohne sie bleiben gültig', () => {
    const input = validBackup()
    Object.assign(input.data, phase2aEntries())
    const result = parseBackup(input)
    if (!result.ok) throw new Error(result.error)
    expect(result.backup.schemaVersion).toBe(1)
    expect(result.backup.data).toMatchObject(phase2aEntries())
    const { rewards, purchases, sideQuests, achievementUnlocks } = result.backup.data
    expect({ rewards, purchases, sideQuests, achievementUnlocks }).toStrictEqual(phase2aEntries())

    const legacy = parseBackup(validBackup())
    if (!legacy.ok) throw new Error(legacy.error)
    for (const key of ['rewards', 'purchases', 'sideQuests', 'achievementUnlocks']) expect(key in legacy.backup.data).toBe(false)
  })

  it.each([
    ['Preis 0', (e: Phase2a) => (e.rewards[0].price = 0), 'data.rewards.0.price'],
    ['Preis mit Nachkommastellen', (e: Phase2a) => (e.rewards[1].price = 2.5), 'data.rewards.1.price'],
    ['Belohnung ohne wiederholbar-Angabe', (e: Phase2a) => delete (e.rewards[0] as Partial<Phase2a['rewards'][0]>).repeatable, 'data.rewards.0.repeatable'],
    ['doppelte Belohnung', (e: Phase2a) => (e.rewards[1].id = 'r1'), 'data.rewards.1.id'],
    ['unbekannte Ausgabe-Art', (e: Phase2a) => (e.purchases[0].kind = 'boss'), 'data.purchases.0.kind'],
    ['Einlösung an ungültigem Tag', (e: Phase2a) => (e.purchases[1].day = '2026-02-30'), 'data.purchases.1.day'],
    ['negativer Einlösungspreis', (e: Phase2a) => (e.purchases[0].price = -40), 'data.purchases.0.price'],
    ['doppelte Einlösung', (e: Phase2a) => (e.purchases[1].id = 'p1'), 'data.purchases.1.id'],
    ['Nebenquest mit ungültigem Termin', (e: Phase2a) => (e.sideQuests[0].dueDay = 'morgen'), 'data.sideQuests.0.dueDay'],
    ['Nebenquest mit unbekannter Schwierigkeit', (e: Phase2a) => (e.sideQuests[1].difficulty = 'legendary'), 'data.sideQuests.1.difficulty'],
    ['Nebenquest ohne Anlagetag', (e: Phase2a) => delete (e.sideQuests[1] as Partial<Phase2a['sideQuests'][1]>).createdDay, 'data.sideQuests.1.createdDay'],
    ['doppelte Nebenquest', (e: Phase2a) => (e.sideQuests[1].id = 's1'), 'data.sideQuests.1.id'],
    ['Erfolg ohne ID', (e: Phase2a) => (e.achievementUnlocks[0].id = ''), 'data.achievementUnlocks.0.id'],
    ['Erfolg an ungültigem Tag', (e: Phase2a) => (e.achievementUnlocks[0].day = '3.11.2026'), 'data.achievementUnlocks.0.day'],
    ['doppelter Erfolg', (e: Phase2a) => e.achievementUnlocks.push({ id: 'streak-7', day: DAY }), 'data.achievementUnlocks.1.id'],
  ])('lehnt ungültige Phase-2a-Daten ab: %s', (_label, breakIt, path) => {
    const entries: Phase2a = phase2aEntries()
    breakIt(entries)
    const input = validBackup()
    Object.assign(input.data, entries)
    expect(expectError(input)).toContain(`Ungültige Daten: ${path} – `)
  })

  it('übernimmt Lebenspunkte, Gegenstände, Rast und Einstellungen; ältere Backups ohne sie bleiben gültig', async () => {
    const input = validBackup()
    Object.assign(input.data, phase2bEntries())
    const result = parseBackup(input)
    if (!result.ok) throw new Error(result.error)
    const { settings, purchases, hpLedger, restPeriods } = result.backup.data
    expect({ settings, purchases, hpLedger, restPeriods }).toStrictEqual(phase2bEntries())

    // Restore → Export ergibt dieselben Daten.
    const target = freshDatabase()
    await restoreBackup(result.backup, target, EXPORT_TIME)
    const exported = await createBackup(EXPORT_TIME, target)
    expect(exported.data).toStrictEqual(await loadGameData(target))
    expect({ ...exported.data, completions: [], habits: [] }).toMatchObject({ ...phase2bEntries(), completions: [], habits: [] })

    const legacy = parseBackup(validBackup())
    if (!legacy.ok) throw new Error(legacy.error)
    for (const key of ['hpLedger', 'restPeriods']) expect(key in legacy.backup.data).toBe(false)
    expect(legacy.backup.data.settings).toStrictEqual({ dayStartHour: 4, effects: true })
  })

  it('übernimmt die Kapitel-Messgröße „Bestwert“', () => {
    const input = validBackup()
    input.data.mainQuests = [
      {
        id: 'q',
        title: 'Lauf',
        icon: '🏃',
        why: '',
        reward: '',
        startDay: DAY,
        createdAt: 1,
        chapters: [{ id: 'c', title: '30 Minuten am Stück', criterion: { type: 'habit', habitId: 'h1', metric: 'best', target: 30 } }],
      },
    ]
    const result = parseBackup(input)
    if (!result.ok) throw new Error(result.error)
    expect(result.backup.data.mainQuests[0].chapters[0].criterion).toStrictEqual({ type: 'habit', habitId: 'h1', metric: 'best', target: 30 })
  })

  it.each([
    ['Gegenstand ohne Art', (e: Phase2b) => delete (e.purchases[0] as Partial<Phase2b['purchases'][0]>).itemId, 'data.purchases.0.itemId'],
    ['unbekannter Gegenstand', (e: Phase2b) => (e.purchases[1].itemId = 'xpPotion'), 'data.purchases.1.itemId'],
    ['Gegenstand mit Belohnung', (e: Phase2b) => Object.assign(e.purchases[0], { rewardId: 'r1' }), 'data.purchases.0.rewardId'],
    ['Belohnung mit Gegenstand', (e: Phase2b) => (e.purchases[0].kind = 'reward'), 'data.purchases.0.itemId'],
    ['unbekannte Wertung', (e: Phase2b) => (e.hpLedger[0].score = 'epic'), 'data.hpLedger.0.score'],
    ['HP über dem Maximum', (e: Phase2b) => (e.hpLedger[1].hpAfter = 51), 'data.hpLedger.1.hpAfter'],
    ['negative HP', (e: Phase2b) => (e.hpLedger[1].hpAfter = -1), 'data.hpLedger.1.hpAfter'],
    ['HP-Änderung mit Nachkommastellen', (e: Phase2b) => (e.hpLedger[2].hpDelta = 1.5), 'data.hpLedger.2.hpDelta'],
    ['Max-HP 0', (e: Phase2b) => (e.hpLedger[0].maxHp = 0), 'data.hpLedger.0.maxHp'],
    ['negativer Gold-Verlust', (e: Phase2b) => (e.hpLedger[2].defeat = { goldLost: -5 }), 'data.hpLedger.2.defeat.goldLost'],
    ['Ledger ohne Schutz-Angabe', (e: Phase2b) => delete (e.hpLedger[0] as Partial<Phase2b['hpLedger'][0]>).frozen, 'data.hpLedger.0.frozen'],
    ['Tag doppelt abgerechnet', (e: Phase2b) => (e.hpLedger[3].day = '2026-10-01'), 'data.hpLedger.3.day'],
    ['ungültiger abgerechneter Tag', (e: Phase2b) => (e.hpLedger[0].day = '2026-10-32'), 'data.hpLedger.0.day'],
    ['Rast endet vor Beginn', (e: Phase2b) => (e.restPeriods[1].until = '2026-11-30'), 'data.restPeriods.1.until'],
    ['Rast länger als 60 Tage', (e: Phase2b) => (e.restPeriods[1].until = '2027-01-30'), 'data.restPeriods.1.until'],
    ['Rast mit ungültigem Tag', (e: Phase2b) => (e.restPeriods[0].from = 'heute'), 'data.restPeriods.0.from'],
    ['doppelte Rast', (e: Phase2b) => (e.restPeriods[1].id = 'rast'), 'data.restPeriods.1.id'],
    ['überschneidende Rast', (e: Phase2b) => (e.restPeriods[0].until = '2026-12-01'), 'data.restPeriods.1.from'],
    ['Lebenspunkte ohne an/aus', (e: Phase2b) => (e.settings.penalties = { since: DAY } as Phase2b['settings']['penalties']), 'data.settings.penalties.enabled'],
    ['ungültiger Beginn der Abrechnung', (e: Phase2b) => (e.settings.penalties.since = '2026-02-30'), 'data.settings.penalties.since'],
    ['Einführung kein Wahrheitswert', (e: Phase2b) => Object.assign(e.settings, { hpIntroSeen: 'ja' }), 'data.settings.hpIntroSeen'],
  ])('lehnt ungültige Phase-2b-Daten ab: %s', (_label, breakIt, path) => {
    const entries: Phase2b = phase2bEntries()
    breakIt(entries)
    const input = validBackup()
    Object.assign(input.data, entries)
    expect(expectError(input)).toContain(`Ungültige Daten: ${path} – `)
  })

  it('meldet kaputtes JSON', () => {
    expect(expectError('{ "app": "questlog", ')).toBe('Die Datei enthält kein gültiges JSON.')
  })

  it('meldet nicht unterstützte Versionen', () => {
    expect(expectError({ ...validBackup(), schemaVersion: 2 })).toBe('Backup-Version 2 wird nicht unterstützt.')
  })

  it('meldet ungültige Daten mit dem Pfad des ersten Fehlers', () => {
    const missingData = validBackup() as Record<string, unknown>
    delete missingData.data
    expect(expectError(missingData)).toMatch(/^Ungültige Daten: data – /)

    const badDay = validBackup()
    ;(badDay.data.habits as Record<string, unknown>[])[0].createdDay = '2026-13-01'
    expect(expectError(badDay)).toBe(
      'Ungültige Daten: data.habits.0.createdDay – Ungültiger Spieltag (erwartet JJJJ-MM-TT).',
    )

    const badTitle = validBackup()
    ;(badTitle.data.habits as Record<string, unknown>[])[0].title = 7
    expect(expectError(badTitle)).toMatch(/^Ungültige Daten: data\.habits\.0\.title – Ungültige Eingabe/)
  })

  it.each([
    ['unbekanntes Attribut', (b: ReturnType<typeof validBackup>) => habitOf(b).attribute = 'luck', 'data.habits.0.attribute'],
    ['leere Wochentage', (b: ReturnType<typeof validBackup>) => habitOf(b).schedule = { type: 'weekdays', days: [] }, 'data.habits.0.schedule.days'],
    ['Wochentag 8', (b: ReturnType<typeof validBackup>) => habitOf(b).schedule = { type: 'weekdays', days: [8] }, 'data.habits.0.schedule.days.0'],
    ['Wochenziel 0', (b: ReturnType<typeof validBackup>) => habitOf(b).schedule = { type: 'weekly', times: 0 }, 'data.habits.0.schedule.times'],
    ['unbekannter Rhythmus', (b: ReturnType<typeof validBackup>) => habitOf(b).schedule = { type: 'monthly' }, 'data.habits.0.schedule.type'],
    ['Zielwert 0', (b: ReturnType<typeof validBackup>) => habitOf(b).measure = { target: 0, unit: 'x' }, 'data.habits.0.measure.target'],
    [
      'unsortierter Rhythmus-Verlauf',
      (b: ReturnType<typeof validBackup>) =>
        (habitOf(b).scheduleHistory = [
          { until: '2026-11-10', schedule: { type: 'daily' } },
          { until: '2026-11-10', schedule: { type: 'weekly', times: 1 } },
        ]),
      'data.habits.0.scheduleHistory.1.until',
    ],
    [
      'ungültiger Rhythmus im Verlauf',
      (b: ReturnType<typeof validBackup>) =>
        (habitOf(b).scheduleHistory = [{ until: '2026-11-10', schedule: { type: 'weekly', times: 9 } }]),
      'data.habits.0.scheduleHistory.0.schedule.times',
    ],
    [
      'ungültiger Tag im Verlauf',
      (b: ReturnType<typeof validBackup>) => (habitOf(b).scheduleHistory = [{ until: '10.11.2026', schedule: { type: 'daily' } }]),
      'data.habits.0.scheduleHistory.0.until',
    ],
    [
      'Pause ohne Dauer',
      (b: ReturnType<typeof validBackup>) => (habitOf(b).pauses = [{ from: '2026-11-05', until: '2026-11-05' }]),
      'data.habits.0.pauses.0.until',
    ],
    [
      'Pause mit ungültigem Tag',
      (b: ReturnType<typeof validBackup>) => (habitOf(b).pauses = [{ from: '2026-11-31', until: '2026-12-02' }]),
      'data.habits.0.pauses.0.from',
    ],
    ['Erledigung mit Wert 0', (b: ReturnType<typeof validBackup>) => completionOf(b).value = 0, 'data.completions.0.value'],
    ['falsche Erledigungs-ID', (b: ReturnType<typeof validBackup>) => completionOf(b).id = 'x', 'data.completions.0.id'],
    ['Tageswechsel 13 Uhr', (b: ReturnType<typeof validBackup>) => (b.data.settings = { dayStartHour: 13, effects: true }), 'data.settings.dayStartHour'],
    ['doppelte Quest-ID', (b: ReturnType<typeof validBackup>) => (b.data.habits as unknown[]).push({ ...habitOf(b) }), 'data.habits.1.id'],
    ['doppelte Erledigung', (b: ReturnType<typeof validBackup>) => (b.data.completions as unknown[]).push({ ...completionOf(b) }), 'data.completions.1.id'],
    [
      'doppelte Kapitel-ID',
      (b: ReturnType<typeof validBackup>) =>
        (b.data.mainQuests = [
          {
            id: 'q',
            title: 'Q',
            icon: '🏔️',
            why: '',
            reward: '',
            startDay: DAY,
            createdAt: 1,
            chapters: [
              { id: 'c', title: 'Eins', criterion: { type: 'manual' } },
              { id: 'c', title: 'Zwei', criterion: { type: 'manual' } },
            ],
          },
        ]),
      'data.mainQuests.0.chapters.1.id',
    ],
    [
      'negativer Kapitel-Zähler',
      (b: ReturnType<typeof validBackup>) =>
        (b.data.mainQuests = [
          {
            id: 'q',
            title: 'Q',
            icon: '🏔️',
            why: '',
            reward: '',
            startDay: DAY,
            createdAt: 1,
            chapters: [{ id: 'c', title: 'C', criterion: { type: 'counter', target: 3, label: 'x' }, counter: -1 }],
          },
        ]),
      'data.mainQuests.0.chapters.0.counter',
    ],
    [
      'unbekannte Kapitel-Art',
      (b: ReturnType<typeof validBackup>) =>
        (b.data.mainQuests = [
          { id: 'q', title: 'Q', icon: '🏔️', why: '', reward: '', startDay: DAY, createdAt: 1, chapters: [{ id: 'c', title: 'C', criterion: { type: 'boss' } }] },
        ]),
      'data.mainQuests.0.chapters.0.criterion.type',
    ],
  ])('lehnt ab: %s', (_label, breakIt, path) => {
    const backup = validBackup()
    breakIt(backup)
    expect(expectError(backup)).toContain(`Ungültige Daten: ${path} – `)
  })
})

describe('backupFileName', () => {
  it('verwendet das lokale Datum', () => {
    expect(backupFileName(new Date(2026, 10, 3, 23, 59))).toBe('questlog-backup-2026-11-03.json')
    expect(backupFileName(new Date(2027, 0, 9, 0, 1))).toBe('questlog-backup-2027-01-09.json')
  })
})

describe('Schema-Typen', () => {
  it('entsprechen exakt GameData aus domain/types.ts', () => {
    expectTypeOf<z.output<typeof gameDataSchema>>().toEqualTypeOf<GameData>()
  })
})

/** Phase-2a-Einträge (Texte als `string` typisiert) – Tests machen sie gezielt kaputt. */
type Phase2a = ReturnType<typeof phase2aEntries>
/** Phase-2b-Einträge – ebenso. */
type Phase2b = ReturnType<typeof phase2bEntries>

function habitOf(backup: ReturnType<typeof validBackup>): Record<string, unknown> {
  return (backup.data.habits as Record<string, unknown>[])[0]
}

function completionOf(backup: ReturnType<typeof validBackup>): Record<string, unknown> {
  return (backup.data.completions as Record<string, unknown>[])[0]
}
