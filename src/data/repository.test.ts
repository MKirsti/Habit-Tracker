import 'fake-indexeddb/auto'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { DEFAULT_SETTINGS } from '../domain/balancing'
import { evaluateChapter } from '../domain/chapters'
import { isActiveOn, isDone } from '../domain/schedule'
import type { Chapter, Habit, MainQuest } from '../domain/types'
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

/** Titel der aktiven Quests in Anzeige-Reihenfolge. */
async function activeTitles(): Promise<string[]> {
  const { habits } = await loadGameData(database)
  return habits.filter((h) => h.archivedDay === undefined).map((h) => h.title)
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
    await updateHabit(habit.id, { title: ' Mehr lesen ', difficulty: 'hard' }, database)
    expect(await storedHabit(habit.id)).toStrictEqual({ ...habit, title: 'Mehr lesen', difficulty: 'hard', archivedDay: NEXT_DAY })
  })

  it('ignoriert undefined bei Pflichtfeldern', async () => {
    const habit = await createHabit(checkDraft(), DAY, database)
    await updateHabit(habit.id, { title: undefined, schedule: undefined }, database)
    expect(await storedHabit(habit.id)).toStrictEqual(habit)
  })

  it('entfernt optionale Felder, die explizit undefined sind (z. B. Kampagnen-Verknüpfung)', async () => {
    const habit = await createHabit(measureDraft({ description: 'Abends', mainQuestId: 'quest-1' }), DAY, database)
    expect((await storedHabit(habit.id)).mainQuestId).toBe('quest-1')

    await updateHabit(habit.id, { mainQuestId: undefined }, database)
    const unlinked = await storedHabit(habit.id)
    expect('mainQuestId' in unlinked).toBe(false)
    expect(unlinked.description).toBe('Abends')
    expect(unlinked.measure).toStrictEqual({ target: 10, unit: 'Seiten' })
    expect(await database.habits.where('mainQuestId').equals('quest-1').count()).toBe(0)

    await updateHabit(habit.id, { description: undefined, measure: undefined }, database)
    const plain = await storedHabit(habit.id)
    expect('description' in plain).toBe(false)
    expect('measure' in plain).toBe(false)
  })

  it('validiert den zusammengeführten Stand und ändert bei Fehlern nichts', async () => {
    const habit = await createHabit(checkDraft(), DAY, database)
    await expect(updateHabit(habit.id, { title: '  ' }, database)).rejects.toThrow('Die Quest braucht einen Namen.')
    await expect(
      updateHabit(habit.id, { schedule: { type: 'weekdays', days: [] } }, database),
    ).rejects.toThrow('Wähle mindestens einen Wochentag.')
    expect(await storedHabit(habit.id)).toStrictEqual(habit)
  })

  it('wirft bei unbekannter Quest', async () => {
    await expect(updateHabit('gibt-es-nicht', { title: 'X' }, database)).rejects.toThrow('Diese Quest gibt es nicht')
  })
})

describe('archiveHabit / restoreHabit / deleteHabit', () => {
  it('archiviert und holt zurück (archivedDay wird wirklich entfernt)', async () => {
    const habit = await createHabit(checkDraft(), DAY, database)
    await archiveHabit(habit.id, NEXT_DAY, database)
    expect((await storedHabit(habit.id)).archivedDay).toBe(NEXT_DAY)
    await restoreHabit(habit.id, database)
    const restored = await storedHabit(habit.id)
    expect('archivedDay' in restored).toBe(false)
    expect(restored).toStrictEqual(habit)
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

  it('deleteHabit und deleteMainQuest ignorieren unbekannte IDs', async () => {
    const habit = await createHabit(checkDraft(), DAY, database)
    const before = await loadGameData(database)
    await deleteHabit('unbekannt', database)
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

    await deleteHabit(doomed.id, database)

    const data = await loadGameData(database)
    expect(data.habits.map((h) => h.id)).toEqual([kept.id])
    expect(data.completions.map((c) => c.habitId)).toEqual([kept.id])
  })
})

describe('moveHabit', () => {
  async function createNamed(...titles: string[]): Promise<Habit[]> {
    const habits: Habit[] = []
    for (const title of titles) habits.push(await createHabit(checkDraft({ title }), DAY, database))
    return habits
  }

  it('tauscht mit dem Nachbarn nach oben und unten', async () => {
    const [a, , c] = await createNamed('A', 'B', 'C')
    await moveHabit(c.id, 'up', database)
    expect(await activeTitles()).toEqual(['A', 'C', 'B'])
    await moveHabit(a.id, 'down', database)
    expect(await activeTitles()).toEqual(['C', 'A', 'B'])
  })

  it('macht am Anfang/Ende und bei unbekannten IDs nichts', async () => {
    const [a, , c] = await createNamed('A', 'B', 'C')
    const before = await loadGameData(database)
    await moveHabit(a.id, 'up', database)
    await moveHabit(c.id, 'down', database)
    await moveHabit('unbekannt', 'up', database)
    expect(await loadGameData(database)).toStrictEqual(before)
  })

  it('überspringt archivierte Quests', async () => {
    const [a, b, c] = await createNamed('A', 'B', 'C')
    await archiveHabit(b.id, DAY, database)
    await moveHabit(c.id, 'up', database)
    expect(await activeTitles()).toEqual(['C', 'A'])
    expect((await storedHabit(b.id)).order).toBe(1) // archivierte Quest unverändert
    expect((await storedHabit(c.id)).order).toBe(0)
    expect((await storedHabit(a.id)).order).toBe(2)

    // Archivierte Quests selbst werden nicht verschoben.
    const before = await loadGameData(database)
    await moveHabit(b.id, 'up', database)
    expect(await loadGameData(database)).toStrictEqual(before)
  })

  it('nummeriert doppelte order-Werte vorher neu durch', async () => {
    const [a, b, c] = await createNamed('A', 'B', 'C')
    await database.habits.bulkUpdate([
      { key: a.id, changes: { order: 0 } },
      { key: b.id, changes: { order: 0 } },
      { key: c.id, changes: { order: 0 } },
    ])
    expect(await activeTitles()).toEqual(['A', 'B', 'C']) // Gleichstand → nach Titel

    await moveHabit(c.id, 'up', database)
    expect(await activeTitles()).toEqual(['A', 'C', 'B'])
    const orders = (await loadGameData(database)).habits.map((h) => h.order)
    expect(orders).toEqual([0, 1, 2])

    await moveHabit(a.id, 'down', database)
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
    // Ziel 20 Seiten, 12 erfasst (Teilfortschritt). Danach wird das Ziel auf 10 gesenkt; der Snapshot
    // der heutigen Erledigung bleibt bei 20, die Quest ist also weiterhin "nicht erledigt".
    const habit = await createHabit(measureDraft({ measure: { target: 20, unit: 'Seiten' } }), DAY, database)
    await setCompletionValue(habit.id, DAY, 12, database)
    await updateHabit(habit.id, { measure: { target: 10, unit: 'Seiten' } }, database)

    await toggleCompletion(habit.id, DAY, database)
    // Erledigt mit dem aktuellen Ziel – die gelesenen 12 Seiten bleiben erhalten (zählen z. B. für "Seiten gesamt").
    expect(await database.completions.get(completionId(habit.id, DAY))).toMatchObject({ value: 12, target: 10 })
  })

  it('Snapshots bleiben bei späteren Änderungen der Quest unverändert', async () => {
    const habit = await createHabit(measureDraft(), DAY, database)
    await setCompletionValue(habit.id, DAY, 10, database)
    const before = await database.completions.get(completionId(habit.id, DAY))

    await updateHabit(
      habit.id,
      { measure: { target: 20, unit: 'Seiten' }, difficulty: 'epic', attribute: 'wisdom' },
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
    await updateHabit(habit.id, { measure: undefined }, database)
    expect(await database.completions.get(completionId(habit.id, DAY))).toStrictEqual(before)
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
