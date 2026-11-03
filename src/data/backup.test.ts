import 'fake-indexeddb/auto'
import { afterEach, beforeEach, describe, expect, expectTypeOf, it, vi } from 'vitest'
import type { z } from 'zod'
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
  archiveHabit,
  createHabit,
  createMainQuest,
  loadGameData,
  saveProfile,
  setChapterCounter,
  setChapterManual,
  setCompletionValue,
  toggleCompletion,
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

  await setCompletionValue(reading.id, '2026-10-01', 4, database)
  await setCompletionValue(reading.id, '2026-10-02', 12, database)
  await toggleCompletion(gym.id, '2026-10-02', database)
  await toggleCompletion(talk.id, '2026-10-05', database)

  await setChapterManual(quest.id, 'c1', true, '2026-10-15', database)
  await setChapterCounter(quest.id, 'c2', 3, '2026-10-16', database)

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
    expect(original.mainQuests.flatMap((q) => q.chapters).some((c) => c.completedDay && c.manualDone)).toBe(true)

    const json = JSON.stringify(await createBackup(EXPORT_TIME, source))
    const parsed = parseBackup(JSON.parse(json))
    if (!parsed.ok) throw new Error(parsed.error)

    const target = freshDatabase()
    await restoreBackup(parsed.backup, target)

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
    await restoreBackup(backup, target)

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

function habitOf(backup: ReturnType<typeof validBackup>): Record<string, unknown> {
  return (backup.data.habits as Record<string, unknown>[])[0]
}

function completionOf(backup: ReturnType<typeof validBackup>): Record<string, unknown> {
  return (backup.data.completions as Record<string, unknown>[])[0]
}
