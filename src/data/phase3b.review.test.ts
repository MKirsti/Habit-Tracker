/**
 * Review Phase 3b (Daten): Gefährten-Wechsel über das Repository (verdiente Treffer bleiben), Notizen-Regeln an den
 * Rändern, Notizen ändern nie den Spielstand, Backup hin und zurück mit allem Abgeleiteten (Tagebuch, Rückblick).
 */
import 'fake-indexeddb/auto'
import { afterEach, describe, expect, it } from 'vitest'
import { journalEvents } from '../domain/chronicle/journal'
import { addDays, dayRange } from '../domain/dates'
import { deriveGameState } from '../domain/engine'
import { makeCompletion, makeHabit } from '../domain/testing'
import type { DayKey } from '../domain/types'
import { createBackup, parseBackup, restoreBackup } from './backup'
import { QuestlogDB } from './db'
import { loadGameData, MAX_JOURNAL_NOTE_LENGTH, saveJournalNote, saveProfile, setCompanion } from './repository'

const opened: QuestlogDB[] = []
let counter = 0

function freshDatabase(): QuestlogDB {
  const database = new QuestlogDB(`questlog-test-phase3b-review-${++counter}`)
  opened.push(database)
  return database
}

afterEach(async () => {
  await Promise.all(opened.splice(0).map((database) => database.delete()))
})

const START: DayKey = '2026-10-26' // Montag
const MONDAY: DayKey = '2026-11-02'

/** Mittags (lokal) am Spieltag `day`. */
function noon(day: DayKey): Date {
  const [year, month, date] = day.split('-').map(Number)
  return new Date(year, month - 1, date, 12)
}

/** Held ab Mo 26.10. mit einer täglichen Stärke-Quest, erledigt bis `through`. */
async function heroWithWorkout(database: QuestlogDB, through: DayKey): Promise<void> {
  await saveProfile({ name: 'Aria', avatar: '🧙', createdDay: START }, database)
  const workout = makeHabit({ id: 'workout', attribute: 'strength', difficulty: 'medium', createdDay: START })
  await database.habits.add(workout)
  await database.completions.bulkAdd(dayRange(START, through).map((day) => makeCompletion(workout, day)))
}

describe('Review – Gefährten-Wechsel kostet nichts', () => {
  it('die Art wechseln behält den Tag der Wahl – die Treffer der laufenden Woche bleiben', async () => {
    const database = freshDatabase()
    await heroWithWorkout(database, '2026-11-04') // Mo–Mi der Woche 02.11. perfekt
    await setCompanion({ species: 'fox', name: 'Flink' }, START, database)
    const before = deriveGameState(await loadGameData(database), '2026-11-04')
    const hitsBefore = before.bosses.current?.attacks.filter((attack) => attack.source === 'companion') ?? []
    expect(hitsBefore.map((hit) => hit.day)).toEqual(['2026-11-02', '2026-11-03', '2026-11-04'])

    // Mittwoch: aus dem Fuchs wird eine Eule (mit neuem Namen).
    const saved = await setCompanion({ species: 'owl', name: 'Nox' }, '2026-11-04', database)
    expect(saved).toStrictEqual({ species: 'owl', name: 'Nox', chosenDay: START })
    const after = deriveGameState(await loadGameData(database), '2026-11-04')
    expect(after.bosses.current?.damage).toBe(before.bosses.current?.damage)
    expect(after.bosses.current?.hp).toBe(before.bosses.current?.hp)
    expect(after.bosses.current?.attacks.filter((attack) => attack.source === 'companion').map((hit) => [hit.day, hit.sourceId, hit.attackName])).toEqual([
      ['2026-11-02', 'owl', 'Nox'],
      ['2026-11-03', 'owl', 'Nox'],
      ['2026-11-04', 'owl', 'Nox'],
    ])
    expect(after.companion).toMatchObject({ stage: before.companion?.stage, sleeping: false })

    // Erst nach dem Entfernen ist eine Wahl wieder neu (ab dem Spieltag).
    await setCompanion(undefined, '2026-11-04', database)
    expect(await setCompanion({ species: 'dragon', name: 'Glut' }, '2026-11-05', database)).toStrictEqual({
      species: 'dragon',
      name: 'Glut',
      chosenDay: '2026-11-05',
    })
  })
})

describe('Review – Notizen', () => {
  it('Ränder: genau 280 Zeichen (nach dem Trimmen), Abenteuerbeginn ja, Tag davor und morgen nein', async () => {
    const database = freshDatabase()
    await heroWithWorkout(database, '2026-11-01')
    const longest = 'ä'.repeat(MAX_JOURNAL_NOTE_LENGTH)
    expect(await saveJournalNote(START, { text: `  ${longest}\n` }, MONDAY, database, 7)).toStrictEqual({ day: START, text: longest, updatedAt: 7 })
    await expect(saveJournalNote(START, { text: `${longest}!` }, MONDAY, database)).rejects.toThrow('höchstens 280 Zeichen')
    await expect(saveJournalNote(addDays(START, -1), { text: 'Davor' }, MONDAY, database)).rejects.toThrow('Vor deinem Abenteuerbeginn')
    await expect(saveJournalNote(addDays(MONDAY, 1), { text: 'Morgen' }, MONDAY, database)).rejects.toThrow('die Zukunft ist noch ungeschrieben')
    // Nur eine Stimmung ist eine Notiz; Leeren löscht – auch eine, die es gar nicht gibt, ohne Fehler.
    expect(await saveJournalNote(MONDAY, { text: '   ', mood: ' 😌 ' }, MONDAY, database, 8)).toStrictEqual({ day: MONDAY, text: '', mood: '😌', updatedAt: 8 })
    expect(await saveJournalNote(MONDAY, { text: '' }, MONDAY, database)).toBeUndefined()
    expect(await saveJournalNote('2026-10-30', { text: '' }, MONDAY, database)).toBeUndefined()
    expect((await loadGameData(database)).journalNotes).toStrictEqual([{ day: START, text: longest, updatedAt: 7 }])
  })

  it('Notizen ändern nie den Spielstand (sie sind keine Ereignisse, bringen weder XP noch Gold)', async () => {
    const database = freshDatabase()
    await heroWithWorkout(database, '2026-11-01')
    const before = deriveGameState(await loadGameData(database), MONDAY)
    for (const day of dayRange(START, MONDAY)) await saveJournalNote(day, { text: `Tag ${day}`, mood: '🙂' }, MONDAY, database)
    const data = await loadGameData(database)
    expect(data.journalNotes).toHaveLength(8)
    expect(deriveGameState(data, MONDAY)).toStrictEqual(before)
  })
})

describe('Review – Backup hin und zurück mit allem Abgeleiteten', () => {
  it('Spielstand, Wochenrückblick und Tagebuch sind nach dem Wiederherstellen gleich', async () => {
    const source = freshDatabase()
    await heroWithWorkout(source, '2026-11-01')
    await setCompanion({ species: 'snake', name: 'Sira' }, '2026-10-28', source)
    await saveJournalNote('2026-10-30', { text: 'Freitag!', mood: '😄' }, MONDAY, source, 1)
    const original = await loadGameData(source)
    const originalState = deriveGameState(original, MONDAY)
    expect(originalState.weeklyReview?.weekStart).toBe(START)

    const file = JSON.parse(JSON.stringify(await createBackup(noon(MONDAY), source)))
    const parsed = parseBackup(file)
    expect(parsed.ok).toBe(true)
    if (!parsed.ok) return
    const target = freshDatabase()
    await restoreBackup(parsed.backup, target, noon(MONDAY))
    const restored = await loadGameData(target)
    expect(restored).toStrictEqual(original)
    const restoredState = deriveGameState(restored, MONDAY)
    expect(restoredState).toStrictEqual(originalState)
    expect(journalEvents(restored, restoredState, MONDAY)).toStrictEqual(journalEvents(original, originalState, MONDAY))
  })
})
