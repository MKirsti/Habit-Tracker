import 'fake-indexeddb/auto'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { DEFAULT_SETTINGS } from '../domain/balancing'
import { evaluateChapter } from '../domain/chapters'
import { addDays, dayRange } from '../domain/dates'
import { deriveGameState } from '../domain/engine'
import { isActiveOn, isArchivedOn, isDone, isRequiredOn, isVisibleOn, scheduleOn } from '../domain/schedule'
import { seededRandom } from '../domain/testing'
import type { Chapter, Completion, DayKey, GameData, Habit, MainQuest, Schedule } from '../domain/types'
import { applyHabitDeletion } from '../domain/deletion'
import { createBackup, parseBackup } from './backup'
import { KV_KEYS, QuestlogDB } from './db'
import {
  archiveHabit,
  completionId,
  createHabit,
  createMainQuest,
  deleteHabit,
  deleteMainQuest,
  loadGameData,
  moveHabit,
  resetAllData,
  restoreHabit,
  saveProfile,
  setChapterCounter,
  setChapterManual,
  setCompletionValue,
  toggleCompletion,
  updateHabit,
  updateMainQuest,
  updateSettings,
  type HabitDraft,
  type MainQuestDraft,
} from './repository'

const DAY = '2026-11-03'
const NEXT_DAY = '2026-11-04'

let database: QuestlogDB
let dbCounter = 0

beforeEach(async () => {
  database = new QuestlogDB(`questlog-test-repository-${++dbCounter}`)
  await database.open()
})

afterEach(async () => {
  vi.restoreAllMocks()
  await database.delete()
})

/** Minimale gültige Abhak-Quest. */
function checkDraft(overrides: Partial<HabitDraft> = {}): HabitDraft {
  return {
    title: 'Meditieren',
    icon: '🧘',
    attribute: 'wisdom',
    difficulty: 'easy',
    schedule: { type: 'daily' },
    ...overrides,
  }
}

/** Minimale gültige messbare Quest (10 Seiten). */
function measureDraft(overrides: Partial<HabitDraft> = {}): HabitDraft {
  return checkDraft({
    title: 'Lesen',
    icon: '📖',
    attribute: 'intellect',
    difficulty: 'medium',
    measure: { target: 10, unit: 'Seiten' },
    ...overrides,
  })
}

function questDraft(overrides: Partial<MainQuestDraft> = {}): MainQuestDraft {
  return {
    title: 'Halbmarathon',
    icon: '🏃',
    why: 'Weil ich es kann.',
    reward: 'Neue Laufschuhe',
    startDay: DAY,
    chapters: [],
    ...overrides,
  }
}

async function storedHabit(id: string): Promise<Habit> {
  const habit = await database.habits.get(id)
  if (!habit) throw new Error(`Quest ${id} fehlt`)
  return habit
}

async function storedQuest(id: string): Promise<MainQuest> {
  const quest = await database.mainQuests.get(id)
  if (!quest) throw new Error(`Kampagne ${id} fehlt`)
  return quest
}

async function storedChapter(questId: string, chapterId: string): Promise<Chapter> {
  const chapter = (await storedQuest(questId)).chapters.find((c) => c.id === chapterId)
  if (!chapter) throw new Error(`Kapitel ${chapterId} fehlt`)
  return chapter
}

/** Titel der am Tag `day` aktiven (nicht archivierten) Quests in Anzeige-Reihenfolge. */
async function activeTitles(day: DayKey = DAY): Promise<string[]> {
  const { habits } = await loadGameData(database)
  return habits.filter((h) => !isArchivedOn(h, day)).map((h) => h.title)
}

// ---------------------------------------------------------------------------

describe('loadGameData', () => {
  it('liefert für eine leere Datenbank Standardwerte ohne Profil', async () => {
    const data = await loadGameData(database)
    expect(data).toStrictEqual({ settings: { ...DEFAULT_SETTINGS }, habits: [], completions: [], mainQuests: [] })
    expect('profile' in data).toBe(false)
  })

  it('sortiert Quests nach order', async () => {
    const a = await createHabit(checkDraft({ title: 'A' }), DAY, database)
    const b = await createHabit(checkDraft({ title: 'B' }), DAY, database)
    await database.habits.update(a.id, { order: 5 })
    const { habits } = await loadGameData(database)
    expect(habits.map((h) => h.id)).toEqual([b.id, a.id])
  })

  it('sortiert Kampagnen nach createdAt', async () => {
    const now = vi.spyOn(Date, 'now')
    now.mockReturnValue(300)
    const late = await createMainQuest(questDraft({ title: 'Spät' }), database)
    now.mockReturnValue(100)
    const early = await createMainQuest(questDraft({ title: 'Früh' }), database)
    now.mockReturnValue(200)
    const middle = await createMainQuest(questDraft({ title: 'Mitte' }), database)
    const { mainQuests } = await loadGameData(database)
    expect(mainQuests.map((q) => q.id)).toEqual([early.id, middle.id, late.id])
  })

  it('liefert Rhythmus-Verlauf und Pausen der Quests mit', async () => {
    const habit = await createHabit(checkDraft(), DAY, database)
    await updateHabit(habit.id, { schedule: { type: 'weekly', times: 4 } }, '2026-11-10', database)
    await archiveHabit(habit.id, '2026-11-12', database)
    await restoreHabit(habit.id, '2026-11-14', database)
    const [loaded] = (await loadGameData(database)).habits
    expect(loaded.scheduleHistory).toStrictEqual([{ until: '2026-11-10', schedule: { type: 'daily' } }])
    expect(loaded.pauses).toStrictEqual([{ from: '2026-11-12', until: '2026-11-14' }])
  })

  it('ignoriert ungültige oder unbekannte gespeicherte Einstellungen', async () => {
    await database.kv.put({ key: KV_KEYS.settings, value: { dayStartHour: 'drei', effects: false, foo: 1 } })
    const { settings } = await loadGameData(database)
    expect(settings).toStrictEqual({ dayStartHour: DEFAULT_SETTINGS.dayStartHour, effects: false })
  })
})

describe('Profil & Einstellungen', () => {
  it('speichert das Profil getrimmt und mit Avatar-Fallback', async () => {
    await saveProfile({ name: '  Aria  ', avatar: '  ', createdDay: DAY }, database)
    const { profile } = await loadGameData(database)
    expect(profile).toStrictEqual({ name: 'Aria', avatar: '🧙', createdDay: DAY })
  })

  it('lehnt ein Profil ohne Namen ab', async () => {
    await expect(saveProfile({ name: '   ', avatar: '🧙', createdDay: DAY }, database)).rejects.toThrow(
      'Bitte gib deinem Helden einen Namen.',
    )
  })

  it('merged Einstellungen mit den Standardwerten und speichert nur explizite Werte', async () => {
    await updateSettings({ effects: false }, database)
    expect((await loadGameData(database)).settings).toStrictEqual({ dayStartHour: 4, effects: false })
    expect((await database.kv.get(KV_KEYS.settings))?.value).toStrictEqual({ effects: false })

    await updateSettings({ dayStartHour: 6 }, database)
    expect((await loadGameData(database)).settings).toStrictEqual({ dayStartHour: 6, effects: false })
  })

  it('begrenzt dayStartHour auf ganze Stunden zwischen 0 und 12', async () => {
    await updateSettings({ dayStartHour: 15 }, database)
    expect((await loadGameData(database)).settings.dayStartHour).toBe(12)
    await updateSettings({ dayStartHour: -3 }, database)
    expect((await loadGameData(database)).settings.dayStartHour).toBe(0)
    await updateSettings({ dayStartHour: 5.6 }, database)
    expect((await loadGameData(database)).settings.dayStartHour).toBe(6)
    await expect(updateSettings({ dayStartHour: Number.NaN }, database)).rejects.toThrow()
  })
})

describe('createHabit', () => {
  it('legt eine Quest mit ID, order = max + 1 und createdDay an', async () => {
    const first = await createHabit(checkDraft(), DAY, database)
    expect(first.id).toMatch(/\S+/)
    expect(first.order).toBe(0)
    expect(first.createdDay).toBe(DAY)
    expect(await storedHabit(first.id)).toStrictEqual(first)

    await database.habits.update(first.id, { order: 10 })
    const second = await createHabit(checkDraft({ title: 'Zweite' }), DAY, database)
    expect(second.order).toBe(11)
    expect(second.id).not.toBe(first.id)
  })

  it('zählt auch archivierte Quests für die nächste order', async () => {
    const first = await createHabit(checkDraft(), DAY, database)
    await archiveHabit(first.id, DAY, database)
    const second = await createHabit(checkDraft(), DAY, database)
    expect(second.order).toBe(1)
  })

  it('normalisiert Texte, Icon, Wochentage und Wochenziel', async () => {
    const habit = await createHabit(
      checkDraft({
        title: '  Laufen ',
        icon: ' ',
        description: '   ',
        mainQuestId: '',
        schedule: { type: 'weekdays', days: [5, 1, 3, 1, 5] },
      }),
      DAY,
      database,
    )
    expect(habit.title).toBe('Laufen')
    expect(habit.icon).toBe('✨')
    expect(habit.schedule).toStrictEqual({ type: 'weekdays', days: [1, 3, 5] })
    expect('description' in habit).toBe(false)
    expect('mainQuestId' in habit).toBe(false)
    expect('measure' in habit).toBe(false)
    expect('archivedDay' in habit).toBe(false)

    const described = await createHabit(checkDraft({ description: '  Morgens ' }), DAY, database)
    expect(described.description).toBe('Morgens')
  })

  it('begrenzt "X-mal pro Woche" auf ganze Zahlen von 1 bis 7', async () => {
    const times = async (value: number) => {
      const habit = await createHabit(checkDraft({ schedule: { type: 'weekly', times: value } }), DAY, database)
      return habit.schedule.type === 'weekly' ? habit.schedule.times : undefined
    }
    expect(await times(9)).toBe(7)
    expect(await times(0)).toBe(1)
    expect(await times(2.6)).toBe(3)
    expect(await times(3)).toBe(3)
  })

  it('trimmt die Einheit messbarer Quests', async () => {
    const habit = await createHabit(measureDraft({ measure: { target: 2.5, unit: ' L ' } }), DAY, database)
    expect(habit.measure).toStrictEqual({ target: 2.5, unit: 'L' })
  })

  it.each([
    ['leerer Titel', checkDraft({ title: '   ' }), 'Die Quest braucht einen Namen.'],
    ['keine Wochentage', checkDraft({ schedule: { type: 'weekdays', days: [] } }), 'Wähle mindestens einen Wochentag.'],
    ['Zielwert 0', measureDraft({ measure: { target: 0, unit: 'Seiten' } }), 'Der Zielwert muss größer als 0 sein.'],
    ['negativer Zielwert', measureDraft({ measure: { target: -5, unit: 'Seiten' } }), 'größer als 0'],
    ['Zielwert NaN', measureDraft({ measure: { target: Number.NaN, unit: 'Seiten' } }), 'größer als 0'],
    ['leere Einheit', measureDraft({ measure: { target: 10, unit: '  ' } }), 'Bitte gib eine Einheit an'],
    ['Wochenziel NaN', checkDraft({ schedule: { type: 'weekly', times: Number.NaN } }), 'pro Woche'],
  ])('lehnt ungültige Eingaben ab: %s', async (_label, draft, message) => {
    await expect(createHabit(draft, DAY, database)).rejects.toThrow(message)
    expect(await database.habits.count()).toBe(0)
  })

  it('lehnt unbekannte Attribute/Schwierigkeiten und ungültige Tage ab', async () => {
    await expect(
      createHabit(checkDraft({ attribute: 'luck' as unknown as Habit['attribute'] }), DAY, database),
    ).rejects.toThrow('Unbekanntes Attribut.')
    await expect(
      createHabit(checkDraft({ difficulty: 'legendary' as unknown as Habit['difficulty'] }), DAY, database),
    ).rejects.toThrow('Unbekannte Schwierigkeit.')
    await expect(createHabit(checkDraft(), '2026-02-30', database)).rejects.toThrow('Ungültiges Datum')
    expect(await database.habits.count()).toBe(0)
  })
})

describe('updateHabit', () => {
  it('ändert nur die angegebenen Felder und behält id, order, createdDay und archivedDay', async () => {
    const habit = await createHabit(measureDraft({ description: 'Abends' }), DAY, database)
    await archiveHabit(habit.id, NEXT_DAY, database)
    await updateHabit(habit.id, { title: ' Mehr lesen ', difficulty: 'hard' }, NEXT_DAY, database)
    expect(await storedHabit(habit.id)).toStrictEqual({ ...habit, title: 'Mehr lesen', difficulty: 'hard', archivedDay: NEXT_DAY })
  })

  it('ignoriert undefined bei Pflichtfeldern', async () => {
    const habit = await createHabit(checkDraft(), DAY, database)
    await updateHabit(habit.id, { title: undefined, schedule: undefined }, NEXT_DAY, database)
    expect(await storedHabit(habit.id)).toStrictEqual(habit)
  })

  it('entfernt optionale Felder, die explizit undefined sind (z. B. Kampagnen-Verknüpfung)', async () => {
    const habit = await createHabit(measureDraft({ description: 'Abends', mainQuestId: 'quest-1' }), DAY, database)
    expect((await storedHabit(habit.id)).mainQuestId).toBe('quest-1')

    await updateHabit(habit.id, { mainQuestId: undefined }, DAY, database)
    const unlinked = await storedHabit(habit.id)
    expect('mainQuestId' in unlinked).toBe(false)
    expect(unlinked.description).toBe('Abends')
    expect(unlinked.measure).toStrictEqual({ target: 10, unit: 'Seiten' })
    expect(await database.habits.where('mainQuestId').equals('quest-1').count()).toBe(0)

    await updateHabit(habit.id, { description: undefined, measure: undefined }, DAY, database)
    const plain = await storedHabit(habit.id)
    expect('description' in plain).toBe(false)
    expect('measure' in plain).toBe(false)
  })

  it('validiert den zusammengeführten Stand und ändert bei Fehlern nichts', async () => {
    const habit = await createHabit(checkDraft(), DAY, database)
    await expect(updateHabit(habit.id, { title: '  ' }, NEXT_DAY, database)).rejects.toThrow('Die Quest braucht einen Namen.')
    await expect(
      updateHabit(habit.id, { schedule: { type: 'weekdays', days: [] } }, NEXT_DAY, database),
    ).rejects.toThrow('Wähle mindestens einen Wochentag.')
    expect(await storedHabit(habit.id)).toStrictEqual(habit)
  })

  it('wirft bei unbekannter Quest', async () => {
    await expect(updateHabit('gibt-es-nicht', { title: 'X' }, DAY, database)).rejects.toThrow('Diese Quest gibt es nicht')
  })
})

describe('updateHabit – Rhythmus-Verlauf', () => {
  const D1 = '2026-11-10'
  const D2 = '2026-11-17'

  it('hält bei einer Rhythmus-Änderung den alten Rhythmus für die Tage vor heute fest', async () => {
    const habit = await createHabit(checkDraft({ schedule: { type: 'weekly', times: 3 } }), DAY, database)
    await updateHabit(habit.id, { schedule: { type: 'daily' } }, D1, database)
    const stored = await storedHabit(habit.id)
    expect(stored.schedule).toStrictEqual({ type: 'daily' })
    expect(stored.scheduleHistory).toStrictEqual([{ until: D1, schedule: { type: 'weekly', times: 3 } }])
    expect(scheduleOn(stored, addDays(D1, -1))).toStrictEqual({ type: 'weekly', times: 3 })
    expect(scheduleOn(stored, D1)).toStrictEqual({ type: 'daily' })
    expect(isRequiredOn(stored, '2026-11-05')).toBe(false)
    expect(isRequiredOn(stored, D1)).toBe(true)
  })

  it('legt keinen Eintrag an, wenn sich der Rhythmus inhaltlich nicht ändert', async () => {
    const habit = await createHabit(checkDraft({ schedule: { type: 'weekdays', days: [1, 3, 5] } }), DAY, database)
    await updateHabit(habit.id, { schedule: { type: 'weekdays', days: [5, 3, 1, 3] }, title: 'Neu' }, D1, database)
    await updateHabit(habit.id, { difficulty: 'hard' }, D2, database)
    const stored = await storedHabit(habit.id)
    expect('scheduleHistory' in stored).toBe(false)
    expect(stored).toStrictEqual({ ...habit, title: 'Neu', difficulty: 'hard' })
  })

  it('ersetzt den Rhythmus einfach, solange die Quest noch keine Vergangenheit hat (today ≤ createdDay)', async () => {
    const habit = await createHabit(checkDraft(), DAY, database)
    await updateHabit(habit.id, { schedule: { type: 'weekly', times: 2 } }, DAY, database)
    await updateHabit(habit.id, { schedule: { type: 'weekdays', days: [2] } }, '2026-11-01', database)
    const stored = await storedHabit(habit.id)
    expect(stored.schedule).toStrictEqual({ type: 'weekdays', days: [2] })
    expect('scheduleHistory' in stored).toBe(false)
  })

  it('mehrere Änderungen am selben Tag: für die Tage davor bleibt der ursprüngliche Rhythmus', async () => {
    const habit = await createHabit(checkDraft(), DAY, database)
    await updateHabit(habit.id, { schedule: { type: 'weekly', times: 2 } }, D1, database)
    await updateHabit(habit.id, { schedule: { type: 'weekdays', days: [1, 2] } }, D1, database)
    const stored = await storedHabit(habit.id)
    expect(stored.scheduleHistory).toStrictEqual([{ until: D1, schedule: { type: 'daily' } }])
    expect(stored.schedule).toStrictEqual({ type: 'weekdays', days: [1, 2] })

    // Zurück zum ursprünglichen Rhythmus am selben Tag → der Verlauf ist überflüssig und entfällt.
    await updateHabit(habit.id, { schedule: { type: 'daily' } }, D1, database)
    expect(await storedHabit(habit.id)).toStrictEqual(habit)
  })

  it('Änderungen an verschiedenen Tagen ergeben einen aufsteigenden Verlauf', async () => {
    const habit = await createHabit(checkDraft(), DAY, database)
    await updateHabit(habit.id, { schedule: { type: 'weekly', times: 2 } }, D1, database)
    await updateHabit(habit.id, { schedule: { type: 'weekdays', days: [6, 7] } }, D2, database)
    await updateHabit(habit.id, { schedule: { type: 'daily' } }, '2026-11-24', database)
    const stored = await storedHabit(habit.id)
    expect(stored.scheduleHistory).toStrictEqual([
      { until: D1, schedule: { type: 'daily' } },
      { until: D2, schedule: { type: 'weekly', times: 2 } },
      { until: '2026-11-24', schedule: { type: 'weekdays', days: [6, 7] } },
    ])
    expect(stored.schedule).toStrictEqual({ type: 'daily' })
    expect(scheduleOn(stored, '2026-11-05')).toStrictEqual({ type: 'daily' })
    expect(scheduleOn(stored, '2026-11-12')).toStrictEqual({ type: 'weekly', times: 2 })
    expect(scheduleOn(stored, '2026-11-20')).toStrictEqual({ type: 'weekdays', days: [6, 7] })
    expect(scheduleOn(stored, '2026-11-24')).toStrictEqual({ type: 'daily' })
  })

  it('behält Verlauf und Pausen bei anderen Änderungen', async () => {
    const habit = await createHabit(checkDraft(), DAY, database)
    await updateHabit(habit.id, { schedule: { type: 'weekly', times: 2 } }, D1, database)
    await archiveHabit(habit.id, '2026-11-12', database)
    await restoreHabit(habit.id, '2026-11-15', database)
    const before = await storedHabit(habit.id)
    await updateHabit(habit.id, { title: 'Umbenannt', description: 'Neu' }, D2, database)
    expect(await storedHabit(habit.id)).toStrictEqual({ ...before, title: 'Umbenannt', description: 'Neu' })
  })

  it('ignoriert Verlauf und Pausen in Entwurf/Patch (die pflegt nur das Repository)', async () => {
    const sneaky = {
      ...checkDraft(),
      scheduleHistory: [{ until: D1, schedule: { type: 'weekly', times: 1 } }],
      pauses: [{ from: DAY, until: D1 }],
    } as HabitDraft
    const habit = await createHabit(sneaky, DAY, database)
    expect('scheduleHistory' in habit).toBe(false)
    expect('pauses' in habit).toBe(false)
    await updateHabit(habit.id, sneaky, D1, database)
    expect(await storedHabit(habit.id)).toStrictEqual(habit)
  })

  it('verlangt einen gültigen Spieltag und ändert sonst nichts', async () => {
    const habit = await createHabit(checkDraft(), DAY, database)
    await expect(
      updateHabit(habit.id, { schedule: { type: 'weekly', times: 2 } }, '2026-02-30', database),
    ).rejects.toThrow('Ungültiges Datum')
    await expect(
      updateHabit(habit.id, { title: 'X' }, undefined as unknown as string, database),
    ).rejects.toThrow('Ungültiges Datum')
    expect(await storedHabit(habit.id)).toStrictEqual(habit)
  })

  it('normalisiert einen gespeicherten Verlauf und verwirft kaputte Einträge', async () => {
    const habit = await createHabit(checkDraft(), DAY, database)
    await database.habits.update(habit.id, {
      schedule: { type: 'weekly', times: 2 },
      scheduleHistory: [
        { until: D2, schedule: { type: 'weekly', times: 3 } },
        { until: 'kaputt', schedule: { type: 'daily' } },
        { until: D1, schedule: { type: 'daily' } },
        { until: '2026-11-12', schedule: { type: 'weekdays', days: [] } },
      ],
    } as Partial<Habit>)
    await updateHabit(habit.id, { schedule: { type: 'daily' } }, '2026-11-24', database)
    expect((await storedHabit(habit.id)).scheduleHistory).toStrictEqual([
      { until: D1, schedule: { type: 'daily' } },
      { until: D2, schedule: { type: 'weekly', times: 3 } },
      { until: '2026-11-24', schedule: { type: 'weekly', times: 2 } },
    ])
  })

  it('bei zurückgestellter Uhr bleibt die Vergangenheit vor heute ebenfalls erhalten', async () => {
    const habit = await createHabit(checkDraft(), DAY, database)
    await updateHabit(habit.id, { schedule: { type: 'weekly', times: 2 } }, D2, database)
    // Uhr zurück auf D1 (< D2): Vor D1 galt laut Verlauf "täglich" – das bleibt so.
    await updateHabit(habit.id, { schedule: { type: 'weekdays', days: [1] } }, D1, database)
    const stored = await storedHabit(habit.id)
    expect(stored.scheduleHistory).toStrictEqual([{ until: D1, schedule: { type: 'daily' } }])
    expect(scheduleOn(stored, '2026-11-09')).toStrictEqual({ type: 'daily' })
    expect(scheduleOn(stored, D1)).toStrictEqual({ type: 'weekdays', days: [1] })
  })
})

describe('archiveHabit / restoreHabit / deleteHabit', () => {
  it('archiviert und holt zurück (archivedDay wird wirklich entfernt)', async () => {
    const habit = await createHabit(checkDraft(), DAY, database)
    await archiveHabit(habit.id, NEXT_DAY, database)
    expect((await storedHabit(habit.id)).archivedDay).toBe(NEXT_DAY)
    // Am Tag der Archivierung zurückgeholt: keine Pause nötig, die Quest ist wieder wie vorher.
    await restoreHabit(habit.id, NEXT_DAY, database)
    const restored = await storedHabit(habit.id)
    expect('archivedDay' in restored).toBe(false)
    expect('pauses' in restored).toBe(false)
    expect(restored).toStrictEqual(habit)
  })

  it('restoreHabit speichert die archivierte Zeit als Pause', async () => {
    const habit = await createHabit(checkDraft(), DAY, database)
    await archiveHabit(habit.id, '2026-11-05', database)
    await restoreHabit(habit.id, '2026-11-12', database)
    const restored = await storedHabit(habit.id)
    expect('archivedDay' in restored).toBe(false)
    expect(restored).toStrictEqual({ ...habit, pauses: [{ from: '2026-11-05', until: '2026-11-12' }] })
    expect(isActiveOn(restored, '2026-11-04')).toBe(true)
    expect(isActiveOn(restored, '2026-11-05')).toBe(false)
    expect(isActiveOn(restored, '2026-11-11')).toBe(false)
    expect(isActiveOn(restored, '2026-11-12')).toBe(true)
  })

  it('restoreHabit fasst mehrere Archiv-Zeiten zusammen', async () => {
    const habit = await createHabit(checkDraft(), DAY, database)
    await archiveHabit(habit.id, '2026-11-05', database)
    await restoreHabit(habit.id, '2026-11-08', database)
    await archiveHabit(habit.id, '2026-11-08', database) // direkt wieder archiviert → grenzt an
    await restoreHabit(habit.id, '2026-11-10', database)
    await archiveHabit(habit.id, '2026-11-20', database)
    await restoreHabit(habit.id, '2026-11-22', database)
    expect((await storedHabit(habit.id)).pauses).toStrictEqual([
      { from: '2026-11-05', until: '2026-11-10' },
      { from: '2026-11-20', until: '2026-11-22' },
    ])
  })

  it('restoreHabit ändert eine nicht archivierte Quest nicht und verlangt einen gültigen Tag', async () => {
    const habit = await createHabit(checkDraft(), DAY, database)
    await restoreHabit(habit.id, NEXT_DAY, database)
    expect(await storedHabit(habit.id)).toStrictEqual(habit)
    await archiveHabit(habit.id, NEXT_DAY, database)
    await expect(restoreHabit(habit.id, 'gestern', database)).rejects.toThrow('Ungültiges Datum')
    expect((await storedHabit(habit.id)).archivedDay).toBe(NEXT_DAY)
    await expect(restoreHabit('unbekannt', DAY, database)).rejects.toThrow('Diese Quest gibt es nicht')
  })

  it('erneutes Archivieren verschiebt archivedDay nicht nach hinten (Vergangenheit bleibt unverändert)', async () => {
    // Würde archivedDay auf einen späteren Tag gesetzt, wäre die Quest rückwirkend für die Tage dazwischen
    // wieder aktiv (Pflicht-Quest, nicht erledigt) – Perfekte Tage und Streaks würden nachträglich zerstört.
    const habit = await createHabit(checkDraft(), DAY, database)
    await archiveHabit(habit.id, NEXT_DAY, database)
    await archiveHabit(habit.id, '2026-11-20', database)
    expect((await storedHabit(habit.id)).archivedDay).toBe(NEXT_DAY)
    expect(isActiveOn(await storedHabit(habit.id), '2026-11-10')).toBe(false)

    await expect(archiveHabit('unbekannt', DAY, database)).rejects.toThrow('Diese Quest gibt es nicht')
  })

  it('archiveHabit zieht einen künftigen archivedDay auf heute vor', async () => {
    const habit = await createHabit(checkDraft(), '2026-10-01', database)
    await database.habits.update(habit.id, { archivedDay: NEXT_DAY })
    await archiveHabit(habit.id, DAY, database)
    expect((await storedHabit(habit.id)).archivedDay).toBe(DAY)
    expect(isArchivedOn(await storedHabit(habit.id), DAY)).toBe(true)
  })

  it('deleteHabit und deleteMainQuest ignorieren unbekannte IDs', async () => {
    const habit = await createHabit(checkDraft(), DAY, database)
    const before = await loadGameData(database)
    await deleteHabit('unbekannt', DAY, database)
    await deleteMainQuest('unbekannt', database)
    expect(await loadGameData(database)).toStrictEqual(before)
    expect(before.habits.map((h) => h.id)).toEqual([habit.id])
  })

  it('löscht eine Quest samt aller ihrer Erledigungen, andere bleiben erhalten', async () => {
    const doomed = await createHabit(checkDraft({ title: 'Weg damit' }), DAY, database)
    const kept = await createHabit(checkDraft({ title: 'Bleibt' }), DAY, database)
    await toggleCompletion(doomed.id, DAY, database)
    await toggleCompletion(doomed.id, NEXT_DAY, database)
    await toggleCompletion(kept.id, DAY, database)

    await deleteHabit(doomed.id, NEXT_DAY, database)

    const data = await loadGameData(database)
    expect(data.habits.map((h) => h.id)).toEqual([kept.id])
    expect(data.completions.map((c) => c.habitId)).toEqual([kept.id])
  })
})

describe('deleteHabit – Grabsteine', () => {
  const D3 = '2026-10-31'
  const D2 = '2026-11-01'
  const D1 = '2026-11-02'

  /**
   * Laufen (Mittel) an D-3…D-1 erledigt; Vokabeln (Leicht) heute (DAY) archiviert.
   * Laufen bringt mit Streak-Bonus 20 + 21 (+5 %) + 22 (+10 %) = 63 XP.
   */
  async function setup() {
    await saveProfile({ name: 'Aria', avatar: '🧙', createdDay: D3 }, database)
    const running = await createHabit(checkDraft({ title: 'Laufen', difficulty: 'medium', attribute: 'strength' }), D3, database)
    const vocabulary = await createHabit(checkDraft({ title: 'Vokabeln', difficulty: 'easy', attribute: 'intellect' }), D3, database)
    for (const day of [D3, D2, D1]) await toggleCompletion(running.id, day, database)
    await archiveHabit(vocabulary.id, DAY, database)
    return { running, vocabulary }
  }

  it('macht keinen vergangenen Tag perfekt und bringt keine XP (nie erledigte Pflicht-Quest)', async () => {
    const { vocabulary } = await setup()
    const before = deriveGameState(await loadGameData(database), DAY)
    expect(before.level.totalXp).toBe(63)
    expect(before.totals.perfectDays).toBe(0)

    await deleteHabit(vocabulary.id, DAY, database)
    const data = await loadGameData(database)
    expect(data.habits.map((h) => h.title)).toEqual(['Laufen'])
    expect(data.deletedHabits).toStrictEqual([
      { id: vocabulary.id, createdDay: D3, archivedDay: DAY, schedule: { type: 'daily' } },
    ])
    const after = deriveGameState(data, DAY)
    expect(after.level.totalXp).toBe(63)
    expect(after.totals.perfectDays).toBe(0)
  })

  it('kostet nur: die eigenen XP und den Perfekten Tag, an dem die Quest erledigt war', async () => {
    const { vocabulary } = await setup()
    await toggleCompletion(vocabulary.id, D3, database)
    const before = deriveGameState(await loadGameData(database), DAY)
    expect(before.level.totalXp).toBe(81) // 63 + 10 (Vokabeln an D-3) + 8 (Perfekter Tag D-3: 25 % von 30)
    expect(before.totals.perfectDays).toBe(1)

    await deleteHabit(vocabulary.id, DAY, database)
    const after = deriveGameState(await loadGameData(database), DAY)
    expect(after.level.totalXp).toBe(63)
    expect(after.totals.perfectDays).toBe(0)
  })

  it('ergibt denselben Spielstand wie applyHabitDeletion', async () => {
    await saveProfile({ name: 'Aria', avatar: '🧙', createdDay: '2026-10-01' }, database)
    const reading = await createHabit(measureDraft(), '2026-10-01', database)
    const gym = await createHabit(checkDraft({ title: 'Training', schedule: { type: 'weekdays', days: [1, 3, 5] } }), '2026-10-01', database)
    const talk = await createHabit(checkDraft({ title: 'Anrufen', schedule: { type: 'weekly', times: 2 } }), '2026-10-02', database)
    const quiet = await createHabit(checkDraft({ title: 'Stille' }), '2026-10-03', database)
    await updateHabit(gym.id, { schedule: { type: 'daily' } }, '2026-10-10', database)
    await archiveHabit(gym.id, '2026-10-12', database)
    await restoreHabit(gym.id, '2026-10-15', database)
    await archiveHabit(talk.id, '2026-10-25', database)
    for (const day of dayRange('2026-10-01', DAY)) {
      await setCompletionValue(reading.id, day, day.endsWith('7') ? 4 : 10, database)
      if (!day.endsWith('3')) await toggleCompletion(gym.id, day, database)
      if (day.endsWith('5')) await toggleCompletion(talk.id, day, database)
      if (!day.endsWith('9')) await toggleCompletion(quiet.id, day, database)
    }
    await createMainQuest(
      questDraft({
        startDay: '2026-10-01',
        chapters: [
          { id: 'a', title: 'A', criterion: { type: 'habit', habitId: gym.id, metric: 'streak', target: 3 } },
          { id: 'b', title: 'B', criterion: { type: 'habit', habitId: talk.id, metric: 'completions', target: 2 } },
        ],
      }),
      database,
    )

    for (const habit of [talk, gym, quiet, reading]) {
      const data = await loadGameData(database)
      const expected = applyHabitDeletion(data, habit.id, DAY)
      await deleteHabit(habit.id, DAY, database)
      const stored = await loadGameData(database)
      expect(stored, habit.title).toStrictEqual(expected)
      for (const day of [DAY, D1]) {
        expect(deriveGameState(stored, day), `${habit.title}, ${day}`).toStrictEqual(deriveGameState(expected, day))
      }
    }
    expect((await loadGameData(database)).deletedHabits?.map((t) => t.id)).toEqual([talk.id, gym.id, quiet.id, reading.id])
  })

  it('der Grabstein endet am Archivierungstag (≤ heute), sonst am Löschtag', async () => {
    const archived = await createHabit(checkDraft({ title: 'Archiviert' }), '2026-10-01', database)
    const active = await createHabit(checkDraft({ title: 'Aktiv' }), '2026-10-01', database)
    const future = await createHabit(checkDraft({ title: 'Morgen archiviert' }), '2026-10-01', database)
    await archiveHabit(archived.id, '2026-10-20', database)
    await database.habits.update(future.id, { archivedDay: NEXT_DAY })
    for (const habit of [archived, active, future]) await deleteHabit(habit.id, DAY, database)
    const tombstones = (await loadGameData(database)).deletedHabits ?? []
    expect(tombstones.map((t) => [t.id, t.archivedDay])).toEqual([
      [archived.id, '2026-10-20'],
      [active.id, DAY],
      [future.id, DAY],
    ])
  })

  it('übernimmt Rhythmus-Verlauf und Pausen in den Grabstein', async () => {
    const habit = await createHabit(checkDraft(), '2026-10-01', database)
    await updateHabit(habit.id, { schedule: { type: 'weekly', times: 2 } }, '2026-10-10', database)
    await archiveHabit(habit.id, '2026-10-12', database)
    await restoreHabit(habit.id, '2026-10-15', database)
    const stored = await storedHabit(habit.id)
    await deleteHabit(habit.id, DAY, database)
    expect((await loadGameData(database)).deletedHabits).toStrictEqual([
      {
        id: habit.id,
        createdDay: '2026-10-01',
        archivedDay: DAY,
        schedule: stored.schedule,
        scheduleHistory: stored.scheduleHistory,
        pauses: stored.pauses,
      },
    ])
  })

  it('ohne Spieltag gilt der heutige laut Uhr und Tageswechsel', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    try {
      vi.setSystemTime(new Date(2026, 10, 4, 3, 30)) // 3:30 Uhr → mit Tageswechsel 4 Uhr noch der 3. November
      const habit = await createHabit(checkDraft(), '2026-10-01', database)
      await deleteHabit(habit.id, undefined, database)
      expect((await loadGameData(database)).deletedHabits?.[0].archivedDay).toBe(DAY)

      await updateSettings({ dayStartHour: 0 }, database)
      const other = await createHabit(checkDraft(), '2026-10-01', database)
      await deleteHabit(other.id, undefined, database)
      expect((await loadGameData(database)).deletedHabits?.[1].archivedDay).toBe(NEXT_DAY)
    } finally {
      vi.useRealTimers()
    }
  })

  it('lädt nur gültige Grabsteine (kaputte Einträge entfallen, Rhythmen werden normalisiert)', async () => {
    await database.kv.put({
      key: KV_KEYS.deletedHabits,
      value: [
        { id: 'ok', createdDay: '2026-10-01', archivedDay: DAY, schedule: { type: 'weekdays', days: [5, 1, 1] } },
        { id: '', createdDay: '2026-10-01', archivedDay: DAY, schedule: { type: 'daily' } },
        { id: 'kaputt', createdDay: 'gestern', archivedDay: DAY, schedule: { type: 'daily' } },
        { id: 'ohne-rhythmus', createdDay: '2026-10-01', archivedDay: DAY, schedule: { type: 'monthly' } },
        {
          id: 'verlauf',
          createdDay: '2026-10-01',
          archivedDay: DAY,
          schedule: { type: 'daily' },
          scheduleHistory: [{ until: '2026-10-09', schedule: { type: 'weekly', times: 2 } }, { until: 'x' }],
          pauses: [{ from: '2026-10-20', until: '2026-10-18' }, { from: '2026-10-21', until: '2026-10-24' }],
        },
        'Unsinn',
      ],
    })
    const { deletedHabits } = await loadGameData(database)
    expect(deletedHabits).toStrictEqual([
      { id: 'ok', createdDay: '2026-10-01', archivedDay: DAY, schedule: { type: 'weekdays', days: [1, 5] } },
      {
        id: 'verlauf',
        createdDay: '2026-10-01',
        archivedDay: DAY,
        schedule: { type: 'daily' },
        scheduleHistory: [{ until: '2026-10-09', schedule: { type: 'weekly', times: 2 } }],
        pauses: [{ from: '2026-10-21', until: '2026-10-24' }],
      },
    ])
    // Was geladen wird, besteht auch die Backup-Prüfung.
    const parsed = parseBackup(await createBackup(new Date(), database))
    expect(parsed.ok ? '' : parsed.error).toBe('')
  })

  it('verlangt einen gültigen Spieltag und ändert sonst nichts', async () => {
    const habit = await createHabit(checkDraft(), DAY, database)
    await expect(deleteHabit(habit.id, '2026-02-30', database)).rejects.toThrow('Ungültiges Datum')
    expect(await storedHabit(habit.id)).toBeDefined()
  })
})

describe('Bearbeiten kostet nie verdiente XP', () => {
  /** Zwei Quests ab DAY (Di 03.11.), zwei Wochen lang erledigt wie geplant; Spielstand zum Tag `today`. */
  async function playTwoWeeks() {
    await saveProfile({ name: 'Aria', avatar: '🧙', createdDay: DAY }, database)
    const daily = await createHabit(checkDraft({ title: 'Täglich' }), DAY, database)
    const weekly = await createHabit(checkDraft({ title: 'Wöchentlich', schedule: { type: 'weekly', times: 2 } }), DAY, database)
    for (const day of dayRange(DAY, '2026-11-16')) await toggleCompletion(daily.id, day, database)
    for (const day of ['2026-11-04', '2026-11-06', '2026-11-10', '2026-11-12']) await toggleCompletion(weekly.id, day, database)
    return { daily, weekly }
  }

  async function stateOn(today: string) {
    return deriveGameState(await loadGameData(database), today)
  }

  it('eine Rhythmus-Änderung behält Perfekte Tage, XP und Level', async () => {
    const { weekly } = await playTwoWeeks()
    const today = '2026-11-17'
    const before = await stateOn(today)
    expect(before.totals.perfectDays).toBe(14)

    await updateHabit(weekly.id, { schedule: { type: 'daily' } }, today, database)
    const after = await stateOn(today)
    expect(after.totals.perfectDays).toBe(before.totals.perfectDays)
    expect(after.level).toStrictEqual(before.level)
    expect(after.attributes).toStrictEqual(before.attributes)
  })

  it('Archivieren und Zurückholen behält Perfekte Tage, XP und Streaks', async () => {
    const { daily, weekly } = await playTwoWeeks()
    await archiveHabit(weekly.id, '2026-11-13', database)
    for (const day of dayRange('2026-11-17', '2026-11-20')) await toggleCompletion(daily.id, day, database)
    const archived = await stateOn('2026-11-21')

    await restoreHabit(weekly.id, '2026-11-21', database)
    const restored = await stateOn('2026-11-21')
    expect(restored.totals.perfectDays).toBe(archived.totals.perfectDays)
    expect(restored.level).toStrictEqual(archived.level)
    expect(restored.todayState.habits.find((s) => s.habit.id === daily.id)?.streak.current).toBe(18)
    // Die Wochenserie läuft weiter: die beiden erfüllten Wochen zählen, die pausierten brechen nichts
    expect(restored.todayState.habits.find((s) => s.habit.id === weekly.id)?.streak).toStrictEqual({
      current: 2,
      best: 2,
      unit: 'week',
    })
  })

  it('zufällige Spielverläufe: Bearbeiten, Archivieren und Zurückholen ändern nie den Spielstand bis gestern', async () => {
    const random = seededRandom(20261103)
    const int = (max: number) => Math.floor(random() * (max + 1))
    const pick = <T>(items: readonly T[]): T => items[int(items.length - 1)]
    const randomSchedule = (): Schedule => {
      const kind = random()
      if (kind < 0.35) return { type: 'daily' }
      if (kind < 0.65) return { type: 'weekdays', days: [pick([1, 2, 3] as const), pick([4, 5, 6, 7] as const)] }
      return { type: 'weekly', times: 1 + int(3) }
    }
    /** Alles, was bis zum Stichtag verdient bzw. erreicht wurde (ohne den laufenden Tag). */
    const earned = (data: GameData, day: DayKey) => {
      const state = deriveGameState(data, day)
      return {
        level: state.level,
        attributes: state.attributes,
        totals: state.totals,
        chapters: state.mainQuests.flatMap((q) => q.chapters.map((c) => ({ id: c.chapter.id, done: c.done, doneDay: c.doneDay }))),
      }
    }
    /** Erledigt jede an `day` sichtbare (nicht archivierte) Quest mit Wahrscheinlichkeit `chance`. */
    const play = async (day: DayKey, chance: number) => {
      const { habits } = await loadGameData(database)
      const done: Completion[] = habits
        .filter((habit) => isVisibleOn(habit, day) && random() < chance)
        .map((habit) => ({
          id: completionId(habit.id, day),
          habitId: habit.id,
          day,
          value: 1,
          target: 1,
          difficulty: habit.difficulty,
          attribute: habit.attribute,
          updatedAt: 0,
        }))
      await database.completions.bulkPut(done)
    }

    const start = '2026-10-05' // Montag
    /** Damit der Test nicht nur zufällig grün ist: so oft kamen die kritischen Fälle vor. */
    const coverage = { unitFlips: 0, pauses: 0, doneStreakChapters: 0 }
    for (let round = 0; round < 10; round++) {
      await resetAllData(database)
      await saveProfile({ name: 'Aria', avatar: '🧙', createdDay: start }, database)
      const habits: Habit[] = []
      for (let i = 0; i < 3; i++) {
        habits.push(
          await createHabit(
            checkDraft({ title: `Quest ${i}`, schedule: randomSchedule(), difficulty: pick(['easy', 'medium', 'hard'] as const) }),
            start,
            database,
          ),
        )
      }
      const streakChapter = (id: string, habit: Habit, target: number): Chapter => ({
        id,
        title: id,
        criterion: { type: 'habit', habitId: habit.id, metric: 'streak', target },
      })
      await createMainQuest(
        questDraft({
          startDay: start,
          chapters: [streakChapter('s0', habits[0], 3), streakChapter('s1', habits[1], 2), streakChapter('s2', habits[2], 6)],
        }),
        database,
      )

      for (let offset = 0; offset < 42; offset++) {
        const today = addDays(start, offset)
        const yesterday = addDays(today, -1)
        await play(today, 0.85)
        if (random() < 0.1) await play(yesterday, 0.5) // nachgetragen
        const edits = random() < 0.3 ? 1 + int(2) : 0 // auch mehrere Änderungen am selben Tag
        for (let k = 0; k < edits; k++) {
          const before = earned(await loadGameData(database), yesterday)
          const habit = pick(habits)
          const op = random()
          const kind = op < 0.5 ? 'Rhythmus' : op < 0.6 ? 'Schwierigkeit' : op < 0.8 ? 'Archivieren' : 'Zurückholen'
          const label = `Runde ${round}, ${today}, ${kind} ${habit.title}`
          if (kind === 'Rhythmus') await updateHabit(habit.id, { schedule: randomSchedule() }, today, database)
          else if (kind === 'Schwierigkeit') {
            const patch = { difficulty: pick(['easy', 'epic'] as const), attribute: pick(['strength', 'charisma'] as const) }
            await updateHabit(habit.id, patch, today, database)
          } else if (kind === 'Archivieren') await archiveHabit(habit.id, today, database)
          else await restoreHabit(habit.id, today, database)
          expect(earned(await loadGameData(database), yesterday), label).toStrictEqual(before)
        }
      }
      // Was das Repository schreibt, muss auch ein Backup-Import akzeptieren (z. B. streng sortierter Verlauf).
      const parsed = parseBackup(await createBackup(new Date(), database))
      expect(parsed.ok ? '' : parsed.error, `Runde ${round}`).toBe('')

      const final = await loadGameData(database)
      for (const habit of final.habits) {
        const types = new Set([habit.schedule, ...(habit.scheduleHistory ?? []).map((e) => e.schedule)].map((x) => x.type === 'weekly'))
        if (types.size === 2) coverage.unitFlips++
        if (habit.pauses?.length) coverage.pauses++
      }
      coverage.doneStreakChapters += earned(final, addDays(start, 41)).chapters.filter((c) => c.done).length
    }
    expect(coverage.unitFlips).toBeGreaterThanOrEqual(5)
    expect(coverage.pauses).toBeGreaterThanOrEqual(3)
    expect(coverage.doneStreakChapters).toBeGreaterThanOrEqual(5)
  }, 30_000)
})

describe('moveHabit', () => {
  async function createNamed(...titles: string[]): Promise<Habit[]> {
    const habits: Habit[] = []
    for (const title of titles) habits.push(await createHabit(checkDraft({ title }), DAY, database))
    return habits
  }

  it('tauscht mit dem Nachbarn nach oben und unten', async () => {
    const [a, , c] = await createNamed('A', 'B', 'C')
    await moveHabit(c.id, 'up', DAY, database)
    expect(await activeTitles()).toEqual(['A', 'C', 'B'])
    await moveHabit(a.id, 'down', DAY, database)
    expect(await activeTitles()).toEqual(['C', 'A', 'B'])
  })

  it('macht am Anfang/Ende und bei unbekannten IDs nichts', async () => {
    const [a, , c] = await createNamed('A', 'B', 'C')
    const before = await loadGameData(database)
    await moveHabit(a.id, 'up', DAY, database)
    await moveHabit(c.id, 'down', DAY, database)
    await moveHabit('unbekannt', 'up', DAY, database)
    expect(await loadGameData(database)).toStrictEqual(before)
  })

  it('überspringt archivierte Quests', async () => {
    const [a, b, c] = await createNamed('A', 'B', 'C')
    await archiveHabit(b.id, DAY, database)
    await moveHabit(c.id, 'up', DAY, database)
    expect(await activeTitles()).toEqual(['C', 'A'])
    expect((await storedHabit(b.id)).order).toBe(1) // archivierte Quest unverändert
    expect((await storedHabit(c.id)).order).toBe(0)
    expect((await storedHabit(a.id)).order).toBe(2)

    // Archivierte Quests selbst werden nicht verschoben.
    const before = await loadGameData(database)
    await moveHabit(b.id, 'up', DAY, database)
    expect(await loadGameData(database)).toStrictEqual(before)
  })

  it('eine erst künftig archivierte Quest gilt heute als aktiv (wie in der Quest-Liste)', async () => {
    // Entsteht, wenn nach dem Archivieren der Tageswechsel später gelegt wird: archivedDay liegt dann nach heute.
    const [a, b, c] = await createNamed('A', 'B', 'C')
    await database.habits.update(b.id, { archivedDay: NEXT_DAY })
    expect(await activeTitles()).toEqual(['A', 'B', 'C'])

    // Der Nachbar von C ist B – kein Sprung über B hinweg.
    await moveHabit(c.id, 'up', DAY, database)
    expect(await activeTitles()).toEqual(['A', 'C', 'B'])
    // B selbst lässt sich verschieben.
    await moveHabit(b.id, 'up', DAY, database)
    expect(await activeTitles()).toEqual(['A', 'B', 'C'])
    await moveHabit(b.id, 'up', DAY, database)
    expect(await activeTitles()).toEqual(['B', 'A', 'C'])
    // Ab dem Archivierungstag wird B übersprungen.
    await moveHabit(c.id, 'up', NEXT_DAY, database)
    expect(await activeTitles(NEXT_DAY)).toEqual(['C', 'A'])
    expect((await storedHabit(a.id)).order).toBeGreaterThan((await storedHabit(c.id)).order)
  })

  it('verlangt einen gültigen Spieltag', async () => {
    const [a] = await createNamed('A', 'B')
    await expect(moveHabit(a.id, 'down', 'heute', database)).rejects.toThrow('Ungültiges Datum')
  })

  it('nummeriert doppelte order-Werte vorher neu durch', async () => {
    const [a, b, c] = await createNamed('A', 'B', 'C')
    await database.habits.bulkUpdate([
      { key: a.id, changes: { order: 0 } },
      { key: b.id, changes: { order: 0 } },
      { key: c.id, changes: { order: 0 } },
    ])
    expect(await activeTitles()).toEqual(['A', 'B', 'C']) // Gleichstand → nach Titel

    await moveHabit(c.id, 'up', DAY, database)
    expect(await activeTitles()).toEqual(['A', 'C', 'B'])
    const orders = (await loadGameData(database)).habits.map((h) => h.order)
    expect(orders).toEqual([0, 1, 2])

    await moveHabit(a.id, 'down', DAY, database)
    expect(await activeTitles()).toEqual(['C', 'A', 'B'])
  })
})

describe('Erledigungen', () => {
  it('Abhak-Quest: speichert bei jedem positiven Wert 1 mit Snapshots', async () => {
    vi.spyOn(Date, 'now').mockReturnValue(1_700_000_000_000)
    const habit = await createHabit(checkDraft({ difficulty: 'hard', attribute: 'strength' }), DAY, database)
    await setCompletionValue(habit.id, DAY, 5, database)
    expect(await database.completions.toArray()).toStrictEqual([
      {
        id: `${habit.id}:${DAY}`,
        habitId: habit.id,
        day: DAY,
        value: 1,
        target: 1,
        difficulty: 'hard',
        attribute: 'strength',
        updatedAt: 1_700_000_000_000,
      },
    ])
    expect(completionId(habit.id, DAY)).toBe(`${habit.id}:${DAY}`)
  })

  it('messbare Quest: Upsert mit Teilfortschritt, Überschreitung und Löschen bei ≤ 0', async () => {
    const habit = await createHabit(measureDraft(), DAY, database)
    const id = completionId(habit.id, DAY)

    await setCompletionValue(habit.id, DAY, 4, database)
    expect(await database.completions.get(id)).toMatchObject({ value: 4, target: 10 })

    await setCompletionValue(habit.id, DAY, 12, database)
    expect(await database.completions.count()).toBe(1)
    expect(await database.completions.get(id)).toMatchObject({ value: 12, target: 10 })

    await setCompletionValue(habit.id, DAY, 0, database)
    expect(await database.completions.get(id)).toBeUndefined()

    for (const value of [-1, Number.NaN, Number.POSITIVE_INFINITY]) {
      await setCompletionValue(habit.id, DAY, 3, database)
      await setCompletionValue(habit.id, DAY, value, database)
      expect(await database.completions.get(id)).toBeUndefined()
    }
  })

  it('wirft für unbekannte Quests (außer beim Löschen) und ungültige Tage', async () => {
    await expect(setCompletionValue('unbekannt', DAY, 1, database)).rejects.toThrow('Diese Quest gibt es nicht')
    await expect(setCompletionValue('unbekannt', DAY, 0, database)).resolves.toBeUndefined()
    await expect(toggleCompletion('unbekannt', DAY, database)).rejects.toThrow('Diese Quest gibt es nicht')
    const habit = await createHabit(checkDraft(), DAY, database)
    await expect(setCompletionValue(habit.id, '03.11.2026', 1, database)).rejects.toThrow('Ungültiges Datum')
  })

  it('toggleCompletion: Abhak-Quest wechselt zwischen 0 und 1', async () => {
    const habit = await createHabit(checkDraft(), DAY, database)
    const id = completionId(habit.id, DAY)
    await toggleCompletion(habit.id, DAY, database)
    expect(await database.completions.get(id)).toMatchObject({ value: 1, target: 1 })
    await toggleCompletion(habit.id, DAY, database)
    expect(await database.completions.get(id)).toBeUndefined()
  })

  it('toggleCompletion: messbare Quest – erledigt → löschen, sonst → value = target', async () => {
    const habit = await createHabit(measureDraft(), DAY, database)
    const id = completionId(habit.id, DAY)

    await toggleCompletion(habit.id, DAY, database)
    expect(await database.completions.get(id)).toMatchObject({ value: 10, target: 10 })
    await toggleCompletion(habit.id, DAY, database)
    expect(await database.completions.get(id)).toBeUndefined()

    await setCompletionValue(habit.id, DAY, 4, database) // Teilfortschritt
    await toggleCompletion(habit.id, DAY, database)
    expect(await database.completions.get(id)).toMatchObject({ value: 10, target: 10 })

    await setCompletionValue(habit.id, DAY, 15, database) // über dem Ziel = erledigt
    await toggleCompletion(habit.id, DAY, database)
    expect(await database.completions.get(id)).toBeUndefined()
  })

  it('toggleCompletion entscheidet "erledigt" wie die Engine (tolerant gegenüber Gleitkomma-Rauschen)', async () => {
    // 10 × 0,2 L aufaddiert ergibt 1,9999999999999998 – die Engine (isDone) wertet das als erledigt,
    // die UI zeigt die Quest also abgehakt. Ein Tipp muss sie dann auch wieder aufheben.
    const habit = await createHabit(measureDraft({ measure: { target: 2, unit: 'L' } }), DAY, database)
    const id = completionId(habit.id, DAY)
    let water = 0
    for (let i = 0; i < 10; i++) water += 0.2
    expect(water).toBeLessThan(2)
    await setCompletionValue(habit.id, DAY, water, database)
    const stored = await database.completions.get(id)
    if (!stored) throw new Error('Erledigung fehlt')
    expect(isDone(stored)).toBe(true)

    await toggleCompletion(habit.id, DAY, database)
    expect(await database.completions.get(id)).toBeUndefined()
  })

  it('toggleCompletion verringert nie einen bereits erfassten Wert', async () => {
    // Ziel 20 Seiten, gestern 12 erfasst (Teilfortschritt). Heute wird das Ziel auf 10 gesenkt; der Snapshot
    // von gestern bleibt bei 20, die Quest ist dort also weiterhin "nicht erledigt" (Nachtragen).
    const habit = await createHabit(measureDraft({ measure: { target: 20, unit: 'Seiten' } }), DAY, database)
    await setCompletionValue(habit.id, DAY, 12, database)
    await updateHabit(habit.id, { measure: { target: 10, unit: 'Seiten' } }, NEXT_DAY, database)

    await toggleCompletion(habit.id, DAY, database)
    // Erledigt mit dem aktuellen Ziel – die gelesenen 12 Seiten bleiben erhalten (zählen z. B. für "Seiten gesamt").
    expect(await database.completions.get(completionId(habit.id, DAY))).toMatchObject({ value: 12, target: 10 })
  })

  it('Snapshots früherer Tage bleiben bei späteren Änderungen der Quest unverändert', async () => {
    const habit = await createHabit(measureDraft(), DAY, database)
    await setCompletionValue(habit.id, DAY, 10, database)
    const before = await database.completions.get(completionId(habit.id, DAY))

    await updateHabit(
      habit.id,
      { measure: { target: 20, unit: 'Seiten' }, difficulty: 'epic', attribute: 'wisdom' },
      NEXT_DAY,
      database,
    )
    expect(await database.completions.get(completionId(habit.id, DAY))).toStrictEqual(before)
    expect(before).toMatchObject({ value: 10, target: 10, difficulty: 'medium', attribute: 'intellect' })

    // Neue Erfassungen verwenden die aktuellen Werte.
    await setCompletionValue(habit.id, NEXT_DAY, 10, database)
    expect(await database.completions.get(completionId(habit.id, NEXT_DAY))).toMatchObject({
      value: 10,
      target: 20,
      difficulty: 'epic',
      attribute: 'wisdom',
    })

    // Wird die Quest zur Abhak-Quest, bleibt die Vergangenheit ebenfalls unangetastet.
    await updateHabit(habit.id, { measure: undefined }, NEXT_DAY, database)
    expect(await database.completions.get(completionId(habit.id, DAY))).toStrictEqual(before)
  })
})

describe('updateHabit – der heutige Eintrag folgt der Änderung', () => {
  const YESTERDAY = '2026-11-02'

  async function todayStatus(habitId: string) {
    const state = deriveGameState(await loadGameData(database), DAY)
    const status = state.todayState.habits.find((s) => s.habit.id === habitId)
    if (!status) throw new Error('Quest fehlt in der Tagesansicht')
    return { state, status }
  }

  it('gesenktes Ziel: 7 / 10 wird zu 7 / 5 – erledigt und mit XP', async () => {
    const habit = await createHabit(measureDraft(), YESTERDAY, database)
    await setCompletionValue(habit.id, DAY, 7, database)
    expect((await todayStatus(habit.id)).state.totals.xpFromQuests).toBe(0)

    await updateHabit(habit.id, { measure: { target: 5, unit: 'Seiten' } }, DAY, database)
    expect(await database.completions.get(completionId(habit.id, DAY))).toMatchObject({ value: 7, target: 5 })
    const { state, status } = await todayStatus(habit.id)
    expect(status).toMatchObject({ value: 7, target: 5, done: true, xp: 20 })
    expect(state.totals.xpFromQuests).toBe(20)
    expect(state.todayState.perfect).toBe(true)
  })

  it('erhöhtes Ziel: 10 / 10 wird zu 10 / 20 – wieder offen, die XP entfallen', async () => {
    const habit = await createHabit(measureDraft(), YESTERDAY, database)
    await setCompletionValue(habit.id, DAY, 10, database)
    expect((await todayStatus(habit.id)).state.level.totalXp).toBe(25) // 20 + Perfekter Tag

    await updateHabit(habit.id, { measure: { target: 20, unit: 'Seiten' } }, DAY, database)
    const { state, status } = await todayStatus(habit.id)
    expect(status).toMatchObject({ value: 10, target: 20, done: false })
    expect(state.level.totalXp).toBe(0)
    // Eine weitere Seite führt nun zu 11 / 20 statt 11 / 10 (kein Sprung von erledigt nach offen).
    await setCompletionValue(habit.id, DAY, 11, database)
    expect((await todayStatus(habit.id)).status).toMatchObject({ value: 11, target: 20, done: false })
  })

  it('Schwierigkeit: gutgeschriebene XP und Anzeige stimmen überein (Leicht → Episch)', async () => {
    const habit = await createHabit(checkDraft({ difficulty: 'easy' }), YESTERDAY, database)
    await toggleCompletion(habit.id, DAY, database)
    await updateHabit(habit.id, { difficulty: 'epic' }, DAY, database)
    const { state, status } = await todayStatus(habit.id)
    expect(status).toMatchObject({ done: true, xp: 80 })
    expect(state.totals.xpFromQuests).toBe(80)
    expect(await database.completions.get(completionId(habit.id, DAY))).toMatchObject({ difficulty: 'epic' })
  })

  it('Attribut: die heutigen Attribut-XP wandern zum neuen Attribut', async () => {
    const habit = await createHabit(checkDraft({ attribute: 'strength', difficulty: 'medium' }), YESTERDAY, database)
    await toggleCompletion(habit.id, YESTERDAY, database)
    await toggleCompletion(habit.id, DAY, database)
    await updateHabit(habit.id, { attribute: 'charisma' }, DAY, database)
    const { state } = await todayStatus(habit.id)
    expect(state.attributes.strength.totalXp).toBe(20) // gestern bleibt bei Stärke
    expect(state.attributes.charisma.totalXp).toBe(21) // heute: 20 + 5 % Streak-Bonus (Serie von 1 Tag davor)
  })

  it('Abhaken → messbar: erledigt bleibt erledigt (Wert = neues Ziel)', async () => {
    const habit = await createHabit(checkDraft(), YESTERDAY, database)
    await toggleCompletion(habit.id, DAY, database)
    await updateHabit(habit.id, { measure: { target: 5, unit: 'Seiten' } }, DAY, database)
    expect(await database.completions.get(completionId(habit.id, DAY))).toMatchObject({ value: 5, target: 5 })
    expect((await todayStatus(habit.id)).status).toMatchObject({ value: 5, target: 5, done: true })
  })

  it('messbar → Abhaken: erledigt wird zu 1 / 1, Teilfortschritt entfällt', async () => {
    const done = await createHabit(measureDraft({ title: 'Erledigt' }), YESTERDAY, database)
    const partial = await createHabit(measureDraft({ title: 'Angefangen' }), YESTERDAY, database)
    await setCompletionValue(done.id, DAY, 12, database)
    await setCompletionValue(partial.id, DAY, 3, database)
    await updateHabit(done.id, { measure: undefined }, DAY, database)
    await updateHabit(partial.id, { measure: undefined }, DAY, database)
    expect(await database.completions.get(completionId(done.id, DAY))).toMatchObject({ value: 1, target: 1 })
    expect(await database.completions.get(completionId(partial.id, DAY))).toBeUndefined()
  })

  it('frühere Tage und andere Änderungen lassen die Erledigungen unangetastet', async () => {
    vi.spyOn(Date, 'now').mockReturnValue(1_000)
    const habit = await createHabit(measureDraft(), YESTERDAY, database)
    await setCompletionValue(habit.id, YESTERDAY, 7, database)
    await setCompletionValue(habit.id, DAY, 7, database)
    const before = await database.completions.toArray()
    vi.spyOn(Date, 'now').mockReturnValue(2_000)
    // Nur Titel/Rhythmus: kein neuer Schnappschuss nötig.
    await updateHabit(habit.id, { title: 'Abends lesen', schedule: { type: 'weekly', times: 3 } }, DAY, database)
    expect(await database.completions.toArray()).toStrictEqual(before)

    await updateHabit(habit.id, { measure: { target: 5, unit: 'Seiten' }, difficulty: 'hard' }, DAY, database)
    const yesterday = await database.completions.get(completionId(habit.id, YESTERDAY))
    expect(yesterday).toStrictEqual(before.find((c) => c.day === YESTERDAY))
    expect(await database.completions.get(completionId(habit.id, DAY))).toMatchObject({
      value: 7,
      target: 5,
      difficulty: 'hard',
      updatedAt: 2_000,
    })
  })
})

describe('Kampagnen', () => {
  const manualChapter: Chapter = { id: 'ch-manual', title: 'Erstes Buch', criterion: { type: 'manual' } }
  const counterChapter: Chapter = {
    id: 'ch-counter',
    title: 'Bücher',
    criterion: { type: 'counter', target: 3, label: 'Bücher beendet' },
  }

  it('legt eine Kampagne normalisiert an', async () => {
    vi.spyOn(Date, 'now').mockReturnValue(42)
    const quest = await createMainQuest(
      questDraft({
        title: '  Gelehrter ',
        icon: '',
        description: ' ',
        why: ' Wissen ',
        deadline: '2027-11-03',
        archived: false,
        chapters: [
          { ...manualChapter, title: ' Erstes Buch ', counter: 5, completedDay: DAY },
          { ...counterChapter, counter: 3, completedDay: DAY },
          { ...counterChapter, manualDone: true, criterion: { type: 'counter', target: 3, label: ' ' } },
          { id: '', title: 'Serie', criterion: { type: 'habit', habitId: 'h1', metric: 'streak', target: 21 } },
        ],
      }),
      database,
    )
    expect(await storedQuest(quest.id)).toStrictEqual(quest)
    expect(quest).toMatchObject({ title: 'Gelehrter', icon: '🏔️', why: 'Wissen', deadline: '2027-11-03', createdAt: 42 })
    expect('description' in quest).toBe(false)
    expect('archived' in quest).toBe(false)

    const [manual, counter, counterCopy, habit] = quest.chapters
    // Unpassende Zustandsfelder werden entfernt; completedDay nur, wenn abgeschlossen.
    expect(manual).toStrictEqual({ id: 'ch-manual', title: 'Erstes Buch', criterion: { type: 'manual' } })
    expect(counter).toStrictEqual({ ...counterChapter, counter: 3, completedDay: DAY })
    // Doppelte Kapitel-ID → neue ID; leere Zähler-Bezeichnung → Fallback.
    expect(counterCopy.id).not.toBe('ch-counter')
    expect(counterCopy.id).not.toBe('')
    expect(counterCopy.criterion).toStrictEqual({ type: 'counter', target: 3, label: 'Fortschritt' })
    expect('manualDone' in counterCopy).toBe(false)
    // Leere Kapitel-ID → neue ID.
    expect(habit.id).not.toBe('')
    expect(new Set(quest.chapters.map((c) => c.id)).size).toBe(4)
    expect(habit.criterion).toStrictEqual({ type: 'habit', habitId: 'h1', metric: 'streak', target: 21 })
  })

  it('validiert Titel, Daten und Kapitel', async () => {
    await expect(createMainQuest(questDraft({ title: ' ' }), database)).rejects.toThrow('Die Kampagne braucht einen Namen.')
    await expect(createMainQuest(questDraft({ startDay: 'morgen' }), database)).rejects.toThrow('Ungültiges Startdatum')
    await expect(createMainQuest(questDraft({ deadline: '2026-11-02' }), database)).rejects.toThrow(
      'Das Zieldatum darf nicht vor dem Start liegen.',
    )
    await expect(
      createMainQuest(questDraft({ chapters: [{ ...manualChapter, title: '' }] }), database),
    ).rejects.toThrow('Jedes Kapitel braucht einen Namen.')
    await expect(
      createMainQuest(
        questDraft({ chapters: [{ ...counterChapter, criterion: { type: 'counter', target: 0, label: 'x' } }] }),
        database,
      ),
    ).rejects.toThrow('größer als 0')
    expect(await database.mainQuests.count()).toBe(0)
  })

  it('updateMainQuest entfernt optionale Felder per undefined und behält id/createdAt', async () => {
    const quest = await createMainQuest(
      questDraft({ description: 'Beschreibung', deadline: '2027-06-01', archived: true }),
      database,
    )
    await updateMainQuest(quest.id, { title: 'Neu', deadline: undefined, description: undefined, archived: undefined }, database)
    const updated = await storedQuest(quest.id)
    expect(updated.title).toBe('Neu')
    expect(updated.id).toBe(quest.id)
    expect(updated.createdAt).toBe(quest.createdAt)
    expect('deadline' in updated).toBe(false)
    expect('description' in updated).toBe(false)
    expect('archived' in updated).toBe(false)

    await updateMainQuest(quest.id, { archived: true, chapters: [manualChapter] }, database)
    expect(await storedQuest(quest.id)).toMatchObject({ archived: true, chapters: [manualChapter], why: quest.why })
    await expect(updateMainQuest('unbekannt', { title: 'X' }, database)).rejects.toThrow('Diese Kampagne gibt es nicht')
  })

  it('deleteMainQuest löst die Verknüpfung der Quests', async () => {
    const quest = await createMainQuest(questDraft(), database)
    const other = await createMainQuest(questDraft({ title: 'Andere' }), database)
    const linked = await createHabit(checkDraft({ mainQuestId: quest.id }), DAY, database)
    const otherLinked = await createHabit(checkDraft({ mainQuestId: other.id }), DAY, database)
    const unlinked = await createHabit(checkDraft(), DAY, database)

    await deleteMainQuest(quest.id, database)

    expect(await database.mainQuests.get(quest.id)).toBeUndefined()
    const { mainQuestId: _removed, ...linkedWithoutQuest } = linked
    expect(await storedHabit(linked.id)).toStrictEqual(linkedWithoutQuest)
    expect('mainQuestId' in (await storedHabit(linked.id))).toBe(false)
    expect((await storedHabit(otherLinked.id)).mainQuestId).toBe(other.id)
    expect(await storedHabit(unlinked.id)).toStrictEqual(unlinked)
  })

  it('setChapterManual: completedDay beim Abschließen setzen, beim Aufheben entfernen', async () => {
    const quest = await createMainQuest(questDraft({ chapters: [manualChapter, counterChapter] }), database)

    await setChapterManual(quest.id, manualChapter.id, true, DAY, database)
    expect(await storedChapter(quest.id, manualChapter.id)).toMatchObject({ manualDone: true, completedDay: DAY })

    // Bleibt abgeschlossen → completedDay unverändert.
    await setChapterManual(quest.id, manualChapter.id, true, NEXT_DAY, database)
    expect((await storedChapter(quest.id, manualChapter.id)).completedDay).toBe(DAY)

    await setChapterManual(quest.id, manualChapter.id, false, NEXT_DAY, database)
    const undone = await storedChapter(quest.id, manualChapter.id)
    expect(undone.manualDone).toBe(false)
    expect('completedDay' in undone).toBe(false)

    await setChapterManual(quest.id, manualChapter.id, true, NEXT_DAY, database)
    expect((await storedChapter(quest.id, manualChapter.id)).completedDay).toBe(NEXT_DAY)

    // Andere Kapitel bleiben unberührt.
    expect(await storedChapter(quest.id, counterChapter.id)).toStrictEqual(counterChapter)
  })

  it('setChapterCounter: begrenzt auf ≥ 0 und pflegt completedDay', async () => {
    const quest = await createMainQuest(questDraft({ chapters: [manualChapter, counterChapter] }), database)
    const chapter = () => storedChapter(quest.id, counterChapter.id)

    await setChapterCounter(quest.id, counterChapter.id, 1, DAY, database)
    expect(await chapter()).toStrictEqual({ ...counterChapter, counter: 1 })

    await setChapterCounter(quest.id, counterChapter.id, 3, DAY, database)
    expect(await chapter()).toMatchObject({ counter: 3, completedDay: DAY })

    // Bleibt erreicht → completedDay unverändert.
    await setChapterCounter(quest.id, counterChapter.id, 5, NEXT_DAY, database)
    expect(await chapter()).toMatchObject({ counter: 5, completedDay: DAY })

    // Nicht mehr erreicht → completedDay entfernt.
    await setChapterCounter(quest.id, counterChapter.id, 2, NEXT_DAY, database)
    const below = await chapter()
    expect(below.counter).toBe(2)
    expect('completedDay' in below).toBe(false)

    await setChapterCounter(quest.id, counterChapter.id, -4, NEXT_DAY, database)
    expect((await chapter()).counter).toBe(0)

    await expect(setChapterCounter(quest.id, counterChapter.id, Number.NaN, DAY, database)).rejects.toThrow(
      'Ungültiger Zählerstand.',
    )
  })

  it('setChapterCounter entscheidet "erreicht" wie die Engine (tolerant gegenüber Gleitkomma-Rauschen)', async () => {
    // z. B. "30 km gelaufen" in 0,1er-Schritten: 3 − 1 ulp gilt für die Engine als erreicht.
    const kmChapter: Chapter = { id: 'ch-km', title: 'Strecke', criterion: { type: 'counter', target: 3, label: 'km' } }
    const almostThree = 3 - Number.EPSILON * 2
    expect(almostThree).toBeLessThan(3)

    const quest = await createMainQuest(questDraft({ chapters: [kmChapter] }), database)
    await setChapterCounter(quest.id, kmChapter.id, almostThree, DAY, database)
    const stored = await storedQuest(quest.id)
    const state = evaluateChapter(stored.chapters[0], stored, {
      habitsById: new Map(),
      completionsByHabit: new Map(),
      today: DAY,
    })
    expect(state.done).toBe(true)
    // Abgeschlossen ⇒ Abschlusstag bekannt.
    expect(stored.chapters[0].completedDay).toBe(DAY)
    expect(state.doneDay).toBe(DAY)

    // Auch beim Speichern der Kampagne bleibt der Abschlusstag eines (laut Engine) erreichten Zählers erhalten.
    await updateMainQuest(quest.id, { title: 'Umbenannt' }, database)
    expect((await storedChapter(quest.id, kmChapter.id)).completedDay).toBe(DAY)
  })

  it('wirft bei falscher Kapitel-Art oder unbekannten IDs', async () => {
    const quest = await createMainQuest(questDraft({ chapters: [manualChapter, counterChapter] }), database)
    await expect(setChapterManual(quest.id, counterChapter.id, true, DAY, database)).rejects.toThrow(
      'nicht von Hand abgehakt',
    )
    await expect(setChapterCounter(quest.id, manualChapter.id, 1, DAY, database)).rejects.toThrow('keinen Zähler')
    await expect(setChapterManual(quest.id, 'unbekannt', true, DAY, database)).rejects.toThrow(
      'Dieses Kapitel gibt es nicht',
    )
    await expect(setChapterCounter('unbekannt', counterChapter.id, 1, DAY, database)).rejects.toThrow(
      'Diese Kampagne gibt es nicht',
    )
    expect(await storedQuest(quest.id)).toStrictEqual(quest)
  })
})

describe('resetAllData', () => {
  it('löscht alle Daten', async () => {
    await saveProfile({ name: 'Aria', avatar: '🧙', createdDay: DAY }, database)
    await updateSettings({ effects: false }, database)
    const habit = await createHabit(checkDraft(), DAY, database)
    await toggleCompletion(habit.id, DAY, database)
    await createMainQuest(questDraft(), database)

    await resetAllData(database)

    expect(await loadGameData(database)).toStrictEqual({
      settings: { ...DEFAULT_SETTINGS },
      habits: [],
      completions: [],
      mainQuests: [],
    })
  })
})
