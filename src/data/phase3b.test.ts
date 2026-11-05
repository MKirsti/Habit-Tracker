/**
 * Phase 3b (Daten): Gefährte im Profil (`setCompanion`), Tagebuch-Notizen (`saveJournalNote`, Tabelle `journalNotes`),
 * neue Einstellungen (Klänge, Vibration, Einführung, Wochenrückblick), Endgegner-Truhen (`source: 'campaign'`),
 * Upgrade von Version 5 mit echtem Verlauf und Backup hin und zurück (auch ein altes Backup aus Phase 3a).
 */
import 'fake-indexeddb/auto'
import { Dexie } from 'dexie'
import { afterEach, describe, expect, it } from 'vitest'
import { pendingReviewWeek } from '../domain/chronicle/weeklyReview'
import { unrecordedVictories } from '../domain/combat/boss'
import { unrecordedChests } from '../domain/combat/chests'
import { addDays, dayRange, startOfWeek, toDayKey } from '../domain/dates'
import { deriveGameState } from '../domain/engine'
import { makeChest, makeCompletion, makeHabit } from '../domain/testing'
import type { DayKey, GameData } from '../domain/types'
import { createBackup, parseBackup, restoreBackup } from './backup'
import { KV_KEYS, QuestlogDB } from './db'
import {
  loadGameData,
  markCompanionIntroSeen,
  markWeeklyReviewSeen,
  MAX_COMPANION_NAME_LENGTH,
  MAX_JOURNAL_NOTE_LENGTH,
  recordProgress,
  resetAllData,
  saveJournalNote,
  saveProfile,
  setCompanion,
  settleHpDays,
  updateProfile,
  updateSettings,
} from './repository'

const opened: QuestlogDB[] = []
const names: string[] = []
let counter = 0

function freshDatabase(): QuestlogDB {
  const database = new QuestlogDB(`questlog-test-phase3b-${++counter}`)
  opened.push(database)
  return database
}

afterEach(async () => {
  await Promise.all(opened.splice(0).map((database) => database.delete()))
  await Promise.all(names.splice(0).map((name) => Dexie.delete(name)))
})

const START: DayKey = '2026-10-05' // Montag
const TODAY: DayKey = '2026-11-05' // Donnerstag, gut vier Wochen später

/** Mittags (lokal) am Spieltag `day` – mit Tageswechsel um 4 Uhr eindeutig dieser Spieltag. */
function noon(day: DayKey): Date {
  const [year, month, date] = day.split('-').map(Number)
  return new Date(year, month - 1, date, 12)
}

async function heroIn(database: QuestlogDB, createdDay: DayKey = START): Promise<void> {
  await saveProfile({ name: 'Aria', avatar: '🧙', createdDay }, database)
}

describe('setCompanion', () => {
  it('ohne Helden gibt es keinen Gefährten', async () => {
    const database = freshDatabase()
    await expect(setCompanion({ species: 'fox', name: 'Flink' }, TODAY, database)).rejects.toThrow('noch keinen Helden')
    expect((await loadGameData(database)).profile).toBeUndefined()
  })

  it('wählen, umbenennen und Art wechseln (Tag der Wahl bleibt), entfernen', async () => {
    const database = freshDatabase()
    await heroIn(database)
    expect(await setCompanion({ species: 'fox', name: '  Flink  ' }, '2026-10-10', database)).toStrictEqual({
      species: 'fox',
      name: 'Flink',
      chosenDay: '2026-10-10',
    })
    expect((await loadGameData(database)).profile).toStrictEqual({
      name: 'Aria',
      avatar: '🧙',
      createdDay: START,
      companion: { species: 'fox', name: 'Flink', chosenDay: '2026-10-10' },
    })

    // Umbenennen: gleiche Art → der Tag der Wahl bleibt (auch wenn ein anderer mitgegeben wird).
    await setCompanion({ species: 'fox', name: 'Fuchsi', chosenDay: TODAY }, TODAY, database)
    expect((await loadGameData(database)).profile?.companion).toStrictEqual({ species: 'fox', name: 'Fuchsi', chosenDay: '2026-10-10' })

    // Art wechseln: derselbe Begleiter in neuer Gestalt – der Tag der Wahl bleibt (Review 3b: verdiente Treffer bleiben).
    await setCompanion({ species: 'dragon', name: 'Glut' }, TODAY, database)
    expect((await loadGameData(database)).profile?.companion).toStrictEqual({ species: 'dragon', name: 'Glut', chosenDay: '2026-10-10' })

    // Entfernen.
    expect(await setCompanion(undefined, TODAY, database)).toBeUndefined()
    expect((await loadGameData(database)).profile).toStrictEqual({ name: 'Aria', avatar: '🧙', createdDay: START })
  })

  it('prüft Art und Name – bei einem Fehler bleibt alles, wie es war', async () => {
    const database = freshDatabase()
    await heroIn(database)
    await setCompanion({ species: 'owl', name: 'Eulalia' }, TODAY, database)
    const before = (await loadGameData(database)).profile

    // @ts-expect-error – unbekannte Art (etwa aus einer veralteten Oberfläche)
    await expect(setCompanion({ species: 'unicorn', name: 'Glitzer' }, TODAY, database)).rejects.toThrow('Diesen Gefährten gibt es nicht.')
    await expect(setCompanion({ species: 'owl', name: '   ' }, TODAY, database)).rejects.toThrow('Gib ihm einen Namen.')
    const tooLong = 'x'.repeat(MAX_COMPANION_NAME_LENGTH + 1)
    await expect(setCompanion({ species: 'owl', name: tooLong }, TODAY, database)).rejects.toThrow('höchstens 20 Zeichen')
    await expect(setCompanion({ species: 'owl', name: 'Eule' }, 'gestern', database)).rejects.toThrow('Ungültiges Datum')
    expect((await loadGameData(database)).profile).toStrictEqual(before)

    // Genau 20 Zeichen (nach dem Trimmen) passen.
    const longest = 'y'.repeat(MAX_COMPANION_NAME_LENGTH)
    await setCompanion({ species: 'owl', name: ` ${longest} ` }, TODAY, database)
    expect((await loadGameData(database)).profile?.companion?.name).toBe(longest)
  })

  it('der Tag der Wahl liegt nie vor dem Abenteuerbeginn; ohne Spieltag gilt der mitgegebene bzw. der heutige', async () => {
    const database = freshDatabase()
    await heroIn(database)
    await setCompanion({ species: 'snake', name: 'Sira' }, '2026-09-01', database)
    expect((await loadGameData(database)).profile?.companion?.chosenDay).toBe(START)

    // Eine neue Wahl (nach dem Entfernen) – ein Wechsel der Art behielte den Tag der Wahl.
    await setCompanion(undefined, START, database)
    await setCompanion({ species: 'raccoon', name: 'Krümel', chosenDay: '2026-10-20' }, undefined, database)
    expect((await loadGameData(database)).profile?.companion?.chosenDay).toBe('2026-10-20')

    await setCompanion(undefined, START, database)
    const earliest = toDayKey(new Date(), 4)
    await setCompanion({ species: 'fox', name: 'Flink' }, undefined, database)
    const latest = toDayKey(new Date(), 4)
    const chosenDay = (await loadGameData(database)).profile?.companion?.chosenDay
    expect([earliest, latest]).toContain(chosenDay)
  })

  it('„Held bearbeiten“ verliert den Gefährten nie; übergeben wird er geprüft', async () => {
    const database = freshDatabase()
    await heroIn(database)
    await setCompanion({ species: 'fox', name: 'Flink' }, '2026-10-06', database)
    const companion = { species: 'fox', name: 'Flink', chosenDay: '2026-10-06' } as const

    await saveProfile({ name: 'Aria Sturmwind', avatar: '🧝', createdDay: START, form: 'female' }, database)
    expect((await loadGameData(database)).profile).toStrictEqual({
      name: 'Aria Sturmwind',
      avatar: '🧝',
      createdDay: START,
      form: 'female',
      heroSeed: `${START}Aria`,
      companion,
    })
    await updateProfile({ titleId: 'daring' }, database)
    expect((await loadGameData(database)).profile?.companion).toStrictEqual(companion)

    await expect(updateProfile({ companion: { ...companion, name: '' } }, database)).rejects.toThrow('Gib ihm einen Namen.')
    await expect(updateProfile({ companion: { ...companion, chosenDay: 'kaputt' } }, database)).rejects.toThrow('Ungültiges')
    expect((await loadGameData(database)).profile?.companion).toStrictEqual(companion)

    await updateProfile({ companion: undefined }, database)
    expect((await loadGameData(database)).profile?.companion).toBeUndefined()
  })

  it('die Engine sieht den Gefährten (Stufe nach aktiven Tagen)', async () => {
    const database = freshDatabase()
    await heroIn(database)
    const lesen = makeHabit({ id: 'lesen', attribute: 'intellect', createdDay: START })
    await database.habits.add(lesen)
    await database.completions.bulkAdd(dayRange(START, '2026-10-20').map((day) => makeCompletion(lesen, day)))
    await setCompanion({ species: 'owl', name: 'Eulalia' }, START, database)
    const { companion } = deriveGameState(await loadGameData(database), TODAY)
    expect(companion?.choice).toStrictEqual({ species: 'owl', name: 'Eulalia', chosenDay: START })
    expect(companion?.stage).toBe(1) // 16 aktive Tage ≥ 14
  })
})

describe('saveJournalNote', () => {
  it('ohne Helden gibt es kein Tagebuch', async () => {
    const database = freshDatabase()
    await expect(saveJournalNote(TODAY, { text: 'Hallo' }, TODAY, database)).rejects.toThrow('noch keinen Helden')
    expect(await database.journalNotes.count()).toBe(0)
  })

  it('schreibt, ersetzt und löscht die eine Notiz des Tages (Text getrimmt, Stimmung optional)', async () => {
    const database = freshDatabase()
    await heroIn(database)
    expect(await saveJournalNote(TODAY, { text: '  Guter Tag!  ', mood: ' 😊 ' }, TODAY, database, 1000)).toStrictEqual({
      day: TODAY,
      text: 'Guter Tag!',
      mood: '😊',
      updatedAt: 1000,
    })
    // Ersetzen: dieselbe Notiz des Tages, neue Zeit; ohne Stimmung fällt sie weg.
    await saveJournalNote(TODAY, { text: 'Doch eher ruhig.' }, TODAY, database, 2000)
    expect((await loadGameData(database)).journalNotes).toStrictEqual([{ day: TODAY, text: 'Doch eher ruhig.', updatedAt: 2000 }])

    // Nur eine Stimmung (leerer Text) ist auch eine Notiz.
    await saveJournalNote(TODAY, { text: '   ', mood: '😴' }, TODAY, database, 3000)
    expect((await loadGameData(database)).journalNotes).toStrictEqual([{ day: TODAY, text: '', mood: '😴', updatedAt: 3000 }])

    // Leer und ohne Stimmung → gelöscht; eine leere Stimmung zählt nicht.
    expect(await saveJournalNote(TODAY, { text: '', mood: '  ' }, TODAY, database)).toBeUndefined()
    expect((await loadGameData(database)).journalNotes).toBeUndefined()
    // Löschen einer nicht vorhandenen Notiz: nichts passiert.
    expect(await saveJournalNote(addDays(TODAY, -1), { text: '' }, TODAY, database)).toBeUndefined()
    expect(await database.journalNotes.count()).toBe(0)
  })

  it('höchstens 280 Zeichen (nach dem Trimmen), die Stimmung ist ein einzelnes Emoji', async () => {
    const database = freshDatabase()
    await heroIn(database)
    const longest = 'a'.repeat(MAX_JOURNAL_NOTE_LENGTH)
    await saveJournalNote(TODAY, { text: `  ${longest}\n` }, TODAY, database, 1)
    expect((await database.journalNotes.get(TODAY))?.text).toBe(longest)
    await expect(saveJournalNote(TODAY, { text: `${longest}b` }, TODAY, database)).rejects.toThrow('höchstens 280 Zeichen')
    await expect(saveJournalNote(TODAY, { text: 'Hm', mood: '😊 😢' }, TODAY, database)).rejects.toThrow('einzelnes Emoji')
    await expect(saveJournalNote(TODAY, { text: 'Hm', mood: '😊'.repeat(9) }, TODAY, database)).rejects.toThrow('einzelnes Emoji')
    // Zusammengesetzte Emojis passen.
    await saveJournalNote(TODAY, { text: 'Familientag', mood: '👨‍👩‍👧‍👦' }, TODAY, database, 2)
    expect((await database.journalNotes.get(TODAY))?.mood).toBe('👨‍👩‍👧‍👦')
  })

  it('nur für heute und vergangene Tage ab dem Abenteuerbeginn', async () => {
    const database = freshDatabase()
    await heroIn(database)
    await expect(saveJournalNote(addDays(TODAY, 1), { text: 'Morgen' }, TODAY, database)).rejects.toThrow('Zukunft')
    await expect(saveJournalNote(addDays(START, -1), { text: 'Davor' }, TODAY, database)).rejects.toThrow('Abenteuerbeginn')
    await expect(saveJournalNote('31.10.2026', { text: 'Falsch' }, TODAY, database)).rejects.toThrow('Ungültiges')
    await saveJournalNote(START, { text: 'Der erste Tag.' }, TODAY, database, 1)
    await saveJournalNote('2026-10-20', { text: 'Mitten drin.' }, TODAY, database, 2)
    await saveJournalNote(TODAY, { text: 'Heute.' }, TODAY, database, 3)
    // Nach Tag sortiert geladen.
    expect((await loadGameData(database)).journalNotes?.map((note) => note.day)).toEqual([START, '2026-10-20', TODAY])
    await resetAllData(database)
    expect(await database.journalNotes.count()).toBe(0)
  })
})

describe('Einstellungen (Phase 3b)', () => {
  it('Klänge und Vibration sind ohne Eintrag aus; updateSettings übernimmt sie und die Einführung', async () => {
    const database = freshDatabase()
    const initial = (await loadGameData(database)).settings
    expect(initial.sound ?? false).toBe(false)
    expect(initial.haptics ?? false).toBe(false)
    expect(initial.companionIntroSeen).toBeUndefined()
    expect(initial.weeklyReviewSeen).toBeUndefined()

    await updateSettings({ sound: true, haptics: true }, database)
    expect((await loadGameData(database)).settings).toStrictEqual({ dayStartHour: 4, effects: true, sound: true, haptics: true })
    await updateSettings({ haptics: false, companionIntroSeen: true, weeklyReviewSeen: '2026-11-04' }, database)
    expect((await loadGameData(database)).settings).toStrictEqual({
      dayStartHour: 4,
      effects: true,
      sound: true,
      haptics: false,
      companionIntroSeen: true,
      weeklyReviewSeen: '2026-11-02', // Montag der Woche
    })
    await expect(updateSettings({ weeklyReviewSeen: 'irgendwann' }, database)).rejects.toThrow('Ungültiges')
  })

  it('ungültige gespeicherte Werte werden ignoriert', async () => {
    const database = freshDatabase()
    await database.kv.put({
      key: KV_KEYS.settings,
      value: { sound: 'laut', haptics: 1, companionIntroSeen: 'ja', weeklyReviewSeen: '2026-13-01' },
    })
    expect((await loadGameData(database)).settings).toStrictEqual({ dayStartHour: 4, effects: true })
  })

  it('markCompanionIntroSeen und markWeeklyReviewSeen (Montag, geht nie zurück)', async () => {
    const database = freshDatabase()
    await markCompanionIntroSeen(database)
    expect((await loadGameData(database)).settings.companionIntroSeen).toBe(true)

    await markWeeklyReviewSeen('2026-10-28', database) // Mittwoch → Montag
    expect((await loadGameData(database)).settings.weeklyReviewSeen).toBe('2026-10-26')
    await markWeeklyReviewSeen('2026-10-19', database) // älterer Rückblick (etwa aus dem Tagebuch)
    expect((await loadGameData(database)).settings.weeklyReviewSeen).toBe('2026-10-26')
    await markWeeklyReviewSeen('2026-11-02', database)
    expect((await loadGameData(database)).settings.weeklyReviewSeen).toBe('2026-11-02')
    await expect(markWeeklyReviewSeen('nie', database)).rejects.toThrow('Ungültiges')
    expect((await loadGameData(database)).settings.companionIntroSeen).toBe(true)
  })

  it('der weggeklickte Wochenrückblick der Vorwoche erscheint nicht wieder', async () => {
    const database = freshDatabase()
    await heroIn(database)
    const data = await loadGameData(database)
    const lastWeek = addDays(startOfWeek(TODAY), -7)
    expect(pendingReviewWeek(data, TODAY)).toBe(lastWeek)
    await markWeeklyReviewSeen(lastWeek, database)
    expect(pendingReviewWeek(await loadGameData(database), TODAY)).toBeUndefined()
  })
})

describe('Endgegner-Truhen (source „campaign“)', () => {
  it('werden gespeichert wie andere Truhen und zählen nicht gegen das Tageslimit der Quest-Truhen', async () => {
    const database = freshDatabase()
    const campaignChest = makeChest('campaign:mq', { source: 'campaign', rarity: 'rare', foundDay: TODAY })
    await recordProgress({ chests: [makeChest('quest:a', { source: 'quest', foundDay: TODAY }), campaignChest] }, database)
    expect((await loadGameData(database)).chests?.map((chest) => chest.id)).toEqual(['campaign:mq', 'quest:a'])
  })
})

/** Was der `ProgressRecorder` jetzt speichern würde – über die echte Datenbank gespeichert. */
async function recordPending(database: QuestlogDB, today: DayKey): Promise<void> {
  const data = await loadGameData(database)
  const state = deriveGameState(data, today)
  const stored = new Set((data.achievementUnlocks ?? []).map((unlock) => unlock.id))
  await recordProgress(
    {
      achievementUnlocks: state.achievements
        .filter((achievement) => achievement.unlocked && !stored.has(achievement.definition.id))
        .map((achievement) => ({ id: achievement.definition.id, day: achievement.unlockedDay ?? today })),
      bossVictories: unrecordedVictories([state.bosses.current, state.bosses.previous], data.bossVictories),
      chests: unrecordedChests(state.chests, data.chests),
    },
    database,
  )
}

/**
 * Ein Stand nach Phase 3a mit echtem Verlauf: drei Quests über vier Wochen, abgerechnete Lebenspunkte, gespeicherte
 * Erfolge, Boss-Siege und Truhen (so, wie der Recorder sie speichert). Erzeugt über die echte Datenbank.
 */
async function phase3aData(): Promise<GameData> {
  const scratch = freshDatabase()
  await scratch.kv.put({ key: KV_KEYS.settings, value: { penalties: { enabled: true, since: START }, combatIntroSeen: true } })
  await saveProfile({ name: 'Mika', avatar: '🐺', createdDay: START, form: 'male' }, scratch)
  const lesen = makeHabit({ id: 'lesen', title: 'Lesen', attribute: 'intellect', difficulty: 'medium', createdDay: START })
  const laufen = makeHabit({
    id: 'laufen',
    title: 'Laufen',
    attribute: 'vitality',
    difficulty: 'hard',
    createdDay: START,
    schedule: { type: 'weekly', times: 3 },
    order: 1,
  })
  const atmen = makeHabit({
    id: 'atmen',
    title: 'Atmen',
    attribute: 'wisdom',
    difficulty: 'easy',
    createdDay: START,
    schedule: { type: 'weekdays', days: [1, 3, 5] },
    order: 2,
  })
  await scratch.habits.bulkAdd([lesen, laufen, atmen])
  const completions = []
  for (const [n, day] of dayRange(START, addDays(TODAY, -1)).entries()) {
    if (n % 7 !== 4) completions.push(makeCompletion(lesen, day, { updatedAt: n }))
    if (n % 2 === 0) completions.push(makeCompletion(laufen, day, { updatedAt: n }))
    completions.push(makeCompletion(atmen, day, { updatedAt: n }))
  }
  await scratch.completions.bulkAdd(completions)
  // Woche für Woche wie die App: abrechnen und speichern, was der Recorder speichern würde.
  for (let day = addDays(START, 6); day < TODAY; day = addDays(day, 7)) {
    await settleHpDays(day, scratch)
    await recordPending(scratch, day)
  }
  await settleHpDays(TODAY, scratch)
  await recordPending(scratch, TODAY)
  return loadGameData(scratch)
}

/** Schreibt `data` roh in eine Datenbank der Version 5 (Phase 3a). */
async function legacyV5Database(name: string, data: GameData): Promise<void> {
  const v5 = new Dexie(name)
  v5.version(5).stores({
    habits: '&id, order, mainQuestId',
    completions: '&id, habitId, day',
    mainQuests: '&id',
    kv: '&key',
    rewards: '&id, order',
    purchases: '&id, day',
    sideQuests: '&id, order',
    achievementUnlocks: '&id',
    hpLedger: '&day',
    restPeriods: '&id, from',
    bossVictories: '&weekStart',
    chests: '&id, foundDay',
    cosmeticUnlocks: '&id',
  })
  await v5.table('habits').bulkAdd(data.habits)
  await v5.table('completions').bulkAdd(data.completions)
  await v5.table('mainQuests').bulkAdd(data.mainQuests)
  await v5.table('achievementUnlocks').bulkAdd(data.achievementUnlocks ?? [])
  await v5.table('hpLedger').bulkAdd(data.hpLedger ?? [])
  await v5.table('bossVictories').bulkAdd(data.bossVictories ?? [])
  await v5.table('chests').bulkAdd(data.chests ?? [])
  await v5.table('cosmeticUnlocks').bulkAdd(data.cosmeticUnlocks ?? [])
  await v5.table('kv').bulkAdd([
    { key: KV_KEYS.profile, value: data.profile },
    { key: KV_KEYS.settings, value: data.settings },
  ])
  v5.close()
}

describe('Upgrade von Version 5 mit echtem Verlauf', () => {
  it('Daten und Spielstand bleiben gleich; ein Gefährte und Notizen kommen nur dazu – nichts geht verloren', async () => {
    const v5Data = await phase3aData()
    expect(v5Data.hpLedger?.length).toBeGreaterThan(20)
    expect(v5Data.bossVictories?.length).toBeGreaterThanOrEqual(1)
    expect(v5Data.chests?.length).toBeGreaterThanOrEqual(1)
    const before = deriveGameState(v5Data, TODAY)

    const name = 'questlog-test-phase3b-upgrade'
    names.push(name)
    await legacyV5Database(name, v5Data)
    const upgraded = new QuestlogDB(name)
    await upgraded.open()
    try {
      expect(upgraded.verno).toBe(6)
      const loaded = await loadGameData(upgraded)
      expect(loaded).toStrictEqual(v5Data)
      expect(deriveGameState(loaded, TODAY)).toStrictEqual(before)
      expect(before.companion).toBeUndefined()

      // Ein Gefährte (seit Abenteuerbeginn) und eine Notiz: Level, XP, Gold, HP, Erfolge, Truhen bleiben;
      // der Boss der Woche bekommt höchstens zusätzliche Treffer.
      await setCompanion({ species: 'fox', name: 'Flink' }, START, upgraded)
      await saveJournalNote(addDays(TODAY, -1), { text: 'Gut gelaufen.', mood: '😊' }, TODAY, upgraded, 5)
      const after = deriveGameState(await loadGameData(upgraded), TODAY)
      for (const key of ['level', 'attributes', 'totals', 'gold', 'hp', 'inventory', 'achievements', 'heroClass', 'chests'] as const) {
        expect(after[key], key).toStrictEqual(before[key])
      }
      expect(after.companion?.choice).toStrictEqual({ species: 'fox', name: 'Flink', chosenDay: START })
      expect(after.bosses.current?.damage ?? 0).toBeGreaterThanOrEqual(before.bosses.current?.damage ?? 0)
    } finally {
      upgraded.close()
    }
  })
})

describe('Backup (Phase 3b)', () => {
  async function phase3bDatabase(): Promise<QuestlogDB> {
    const database = freshDatabase()
    await heroIn(database)
    const lesen = makeHabit({ id: 'lesen', attribute: 'intellect', createdDay: START })
    await database.habits.add(lesen)
    await database.completions.bulkAdd(dayRange(START, addDays(TODAY, -1)).map((day) => makeCompletion(lesen, day)))
    await setCompanion({ species: 'raccoon', name: 'Krümel' }, '2026-10-12', database)
    await saveJournalNote('2026-10-12', { text: 'Krümel ist da!', mood: '🤩' }, TODAY, database, 1)
    await saveJournalNote('2026-11-01', { text: '', mood: '😌' }, TODAY, database, 2)
    await saveJournalNote(TODAY, { text: 'Zeile eins\nZeile zwei' }, TODAY, database, 3)
    await updateSettings({ sound: true, haptics: false }, database)
    await markCompanionIntroSeen(database)
    await markWeeklyReviewSeen('2026-10-26', database)
    await recordProgress({ chests: [makeChest('campaign:mq', { source: 'campaign', rarity: 'rare', foundDay: TODAY })] }, database)
    return database
  }

  it('hin und zurück: Gefährte, Notizen, Einstellungen und Endgegner-Truhe bleiben', async () => {
    const source = await phase3bDatabase()
    const original = await loadGameData(source)
    expect(original.journalNotes).toHaveLength(3)
    expect(original.profile?.companion).toStrictEqual({ species: 'raccoon', name: 'Krümel', chosenDay: '2026-10-12' })

    const file = JSON.parse(JSON.stringify(await createBackup(noon(TODAY), source)))
    const parsed = parseBackup(file)
    expect(parsed.ok).toBe(true)
    if (!parsed.ok) return
    const target = freshDatabase()
    await target.journalNotes.put({ day: '2026-10-01', text: 'Wird ersetzt', updatedAt: 0 }) // vorhandene Notiz
    await restoreBackup(parsed.backup, target, noon(TODAY))
    const restored = await loadGameData(target)
    expect(restored).toStrictEqual(original)
    expect(deriveGameState(restored, TODAY).companion).toStrictEqual(deriveGameState(original, TODAY).companion)
  })

  it('ein altes Backup (Phase 3a) bleibt gültig: keine Notizen, kein Gefährte, Einstellungen aus', async () => {
    const v5Data = await phase3aData()
    const target = await phase3bDatabase() // vorhandene Notizen werden ersetzt
    const parsed = parseBackup({ app: 'questlog', schemaVersion: 1, exportedAt: noon(TODAY).toISOString(), data: v5Data })
    expect(parsed.ok).toBe(true)
    if (!parsed.ok) return
    await restoreBackup(parsed.backup, target, noon(TODAY))
    const restored = await loadGameData(target)
    expect(restored).toStrictEqual(v5Data)
    expect('journalNotes' in restored).toBe(false)
    expect(restored.profile?.companion).toBeUndefined()
    expect(restored.settings.sound).toBeUndefined()
    expect(await target.journalNotes.count()).toBe(0)
  })

  it('lehnt ungültige Phase-3b-Daten mit deutscher Meldung ab', () => {
    const base: GameData = {
      profile: { name: 'Aria', avatar: '🧙', createdDay: START },
      settings: { dayStartHour: 4, effects: true },
      habits: [],
      completions: [],
      mainQuests: [],
    }
    const check = (data: unknown) => parseBackup({ app: 'questlog', schemaVersion: 1, exportedAt: noon(TODAY).toISOString(), data })
    const note = { day: TODAY, text: 'Hallo', updatedAt: 1 }
    const companion = { species: 'fox', name: 'Flink', chosenDay: START }

    expect(check({ ...base, journalNotes: [note], profile: { ...base.profile, companion } }).ok).toBe(true)
    expect(check({ ...base, settings: { ...base.settings, sound: true, haptics: false, companionIntroSeen: true, weeklyReviewSeen: '2026-11-02' } }).ok).toBe(true)

    const duplicate = check({ ...base, journalNotes: [note, { ...note, text: 'Nochmal' }] })
    expect(duplicate).toMatchObject({ ok: false, error: expect.stringContaining('schon eine Notiz') })
    expect(check({ ...base, journalNotes: [{ ...note, text: 'x'.repeat(281) }] }).ok).toBe(false)
    expect(check({ ...base, journalNotes: [{ ...note, text: '  ' }] })).toMatchObject({
      ok: false,
      error: expect.stringContaining('Text oder eine Stimmung'),
    })
    expect(check({ ...base, journalNotes: [{ ...note, mood: '😊 😢' }] }).ok).toBe(false)
    expect(check({ ...base, journalNotes: [{ ...note, day: '2026-02-30' }] }).ok).toBe(false)
    expect(check({ ...base, profile: { ...base.profile, companion: { ...companion, species: 'unicorn' } } }).ok).toBe(false)
    expect(check({ ...base, profile: { ...base.profile, companion: { ...companion, name: '' } } }).ok).toBe(false)
    expect(check({ ...base, profile: { ...base.profile, companion: { ...companion, name: 'x'.repeat(21) } } }).ok).toBe(false)
    expect(check({ ...base, profile: { ...base.profile, companion: { ...companion, chosenDay: undefined } } }).ok).toBe(false)
    expect(check({ ...base, settings: { ...base.settings, sound: 'an' } }).ok).toBe(false)
    expect(check({ ...base, settings: { ...base.settings, weeklyReviewSeen: 'letzte Woche' } }).ok).toBe(false)
  })
})
