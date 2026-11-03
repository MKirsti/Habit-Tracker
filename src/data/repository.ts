/**
 * Repository: alle lesenden und schreibenden Operationen auf der Datenbank.
 *
 * Grundsätze:
 * - Jede Funktion nimmt optional als letzten Parameter eine eigene `QuestlogDB`-Instanz
 *   (Standard: `db`), damit Tests isolierte Datenbanken verwenden können.
 * - Eingaben aus der UI werden hier validiert und normalisiert (Texte getrimmt, Wochentage
 *   sortiert usw.). Ungültige Eingaben führen zu einem `Error` mit deutscher Meldung, die
 *   direkt angezeigt werden kann.
 * - Optionale Felder werden beim Entfernen wirklich gelöscht (nicht als `undefined`
 *   gespeichert). Dafür nutzen Updates ein "Lesen → Zusammenführen → Normalisieren → put"
 *   innerhalb einer Transaktion.
 * - Operationen, die mehrere Tabellen berühren, laufen in einer gemeinsamen Transaktion.
 * - Die Vergangenheit bleibt unangetastet: Ändert sich der Rhythmus einer Quest, wird der alte in
 *   `scheduleHistory` festgehalten; wird eine archivierte Quest zurückgeholt, wird die archivierte
 *   Zeit als Pause (`pauses`) gespeichert. So gehen verdiente XP, Perfekte Tage und Streaks nie verloren.
 *   Wird eine Quest gelöscht, bleibt ein Grabstein (`DeletedHabit`) mit ihrem Zeitplan zurück, damit kein
 *   vergangener Tag nachträglich perfekt wird.
 */
import { ATTRIBUTE_IDS } from '../domain/attributes'
import { DEFAULT_SETTINGS, DIFFICULTIES } from '../domain/balancing'
import { compareDays, isValidDayKey, toDayKey } from '../domain/dates'
import { habitTombstone, withTombstone } from '../domain/deletion'
import { habitTarget, isArchivedOn, isDone, mergePauses, reachesTarget, sameSchedule } from '../domain/schedule'
import type {
  AttributeId,
  Chapter,
  ChapterCriterion,
  CharacterProfile,
  Completion,
  DayKey,
  DeletedHabit,
  Difficulty,
  GameData,
  Habit,
  HabitPause,
  IsoWeekday,
  MainQuest,
  Measure,
  Schedule,
  ScheduleHistoryEntry,
  Settings,
} from '../domain/types'
import { db, KV_KEYS, type QuestlogDB } from './db'
import { newId } from './ids'

// ---------------------------------------------------------------------------
// Konstanten & Typen
// ---------------------------------------------------------------------------

/** Icon, wenn eine Quest ohne Emoji angelegt wird. */
export const DEFAULT_HABIT_ICON = '✨'
/** Icon, wenn eine Kampagne ohne Emoji angelegt wird. */
export const DEFAULT_MAIN_QUEST_ICON = '🏔️'
/** Avatar, wenn das Profil ohne Emoji gespeichert wird. */
export const DEFAULT_AVATAR = '🧙'
/** Bezeichnung eines Kapitel-Zählers, wenn keine angegeben wurde. */
export const DEFAULT_COUNTER_LABEL = 'Fortschritt'

/** Die bearbeitbaren Felder einer Quest. Verlauf (`scheduleHistory`) und Pausen pflegt das Repository selbst. */
export type HabitDraft = Omit<Habit, 'id' | 'order' | 'createdDay' | 'archivedDay' | 'scheduleHistory' | 'pauses'>
export type MainQuestDraft = Omit<MainQuest, 'id' | 'createdAt'>

const HABIT_METRICS = ['completions', 'total', 'streak'] as const

const MSG = {
  habitNotFound: 'Diese Quest gibt es nicht (mehr).',
  questNotFound: 'Diese Kampagne gibt es nicht (mehr).',
  chapterNotFound: 'Dieses Kapitel gibt es nicht (mehr).',
} as const

// ---------------------------------------------------------------------------
// Laden
// ---------------------------------------------------------------------------

/**
 * Lädt alle gespeicherten Daten in einer Lese-Transaktion (konsistenter Schnappschuss).
 * - `settings` = `DEFAULT_SETTINGS` überschrieben mit den gespeicherten (gültigen) Werten
 * - `profile` fehlt, solange das Onboarding nicht abgeschlossen ist
 * - `habits` nach `order` sortiert (bei Gleichstand nach Titel), `mainQuests` nach `createdAt`
 * - `deletedHabits` (Grabsteine gelöschter Quests) geprüft und normalisiert; fehlt, wenn es keine gibt
 */
export async function loadGameData(database: QuestlogDB = db): Promise<GameData> {
  return database.transaction('r', allTables(database), async () => {
    const [habits, completions, mainQuests, profileEntry, settingsEntry, deletedEntry] = await Promise.all([
      database.habits.toArray(),
      database.completions.toArray(),
      database.mainQuests.toArray(),
      database.kv.get(KV_KEYS.profile),
      database.kv.get(KV_KEYS.settings),
      database.kv.get(KV_KEYS.deletedHabits),
    ])

    const data: GameData = {
      settings: { ...DEFAULT_SETTINGS, ...pickValidSettings(settingsEntry?.value) },
      habits: habits.sort(compareHabitOrder),
      completions,
      mainQuests: mainQuests.sort((a, b) => a.createdAt - b.createdAt),
    }
    // Das Profil wird nur über `saveProfile` (validiert) oder `restoreBackup` (zod-validiert) geschrieben.
    if (isRecord(profileEntry?.value)) data.profile = profileEntry.value as unknown as CharacterProfile
    const deletedHabits = sanitizeTombstones(deletedEntry?.value)
    if (deletedHabits.length > 0) data.deletedHabits = deletedHabits
    return data
  })
}

// ---------------------------------------------------------------------------
// Profil & Einstellungen
// ---------------------------------------------------------------------------

/** Speichert (bzw. ersetzt) das Charakterprofil. Der Name darf nicht leer sein. */
export async function saveProfile(profile: CharacterProfile, database: QuestlogDB = db): Promise<void> {
  const name = requireText(profile.name, 'Bitte gib deinem Helden einen Namen.')
  assertDayKey(profile.createdDay, 'Startdatum')
  const clean: CharacterProfile = {
    name,
    avatar: optionalText(profile.avatar) ?? DEFAULT_AVATAR,
    createdDay: profile.createdDay,
  }
  await database.kv.put({ key: KV_KEYS.profile, value: clean })
}

/**
 * Ändert einzelne Einstellungen. Gespeichert werden nur explizit gesetzte Werte –
 * nicht gesetzte fallen beim Laden auf `DEFAULT_SETTINGS` zurück.
 * `dayStartHour` wird auf eine ganze Stunde zwischen 0 und 12 begrenzt.
 */
export async function updateSettings(patch: Partial<Settings>, database: QuestlogDB = db): Promise<void> {
  const changes: Partial<Settings> = {}
  if (patch.dayStartHour !== undefined) {
    if (!Number.isFinite(patch.dayStartHour)) throw new Error('Ungültige Uhrzeit für den Tageswechsel.')
    changes.dayStartHour = clamp(Math.round(patch.dayStartHour), 0, 12)
  }
  if (patch.effects !== undefined) changes.effects = Boolean(patch.effects)

  await database.transaction('rw', database.kv, async () => {
    const entry = await database.kv.get(KV_KEYS.settings)
    const stored = pickValidSettings(entry?.value)
    await database.kv.put({ key: KV_KEYS.settings, value: { ...stored, ...changes } })
  })
}

// ---------------------------------------------------------------------------
// Quests (Habits)
// ---------------------------------------------------------------------------

/** Legt eine Quest an. Sie wird ans Ende der Liste gestellt (`order` = max + 1) und ist ab `today` aktiv. */
export async function createHabit(draft: HabitDraft, today: DayKey, database: QuestlogDB = db): Promise<Habit> {
  assertDayKey(today)
  const clean = normalizeHabitDraft(draft)
  return database.transaction('rw', database.habits, async () => {
    const habit: Habit = { id: newId(), ...clean, order: await nextHabitOrder(database), createdDay: today }
    await database.habits.add(habit)
    return habit
  })
}

/**
 * Ändert eine Quest am Spieltag `today`. Pflichtfelder, die im Patch fehlen oder `undefined` sind, bleiben
 * unverändert. Optionale Felder (`description`, `measure`, `mainQuestId`), die im Patch **explizit** mit
 * `undefined` stehen, werden entfernt.
 *
 * Änderungen gelten ab heute – auch für den heutigen Eintrag: Gibt es eine Erledigung an `today` und ändern
 * sich Ziel, Schwierigkeit, Attribut oder die Art (Abhaken ↔ messbar), bekommt sie die neuen Snapshots
 * (siehe `retargetCompletion`). Sonst würde z. B. ein gesenktes Ziel erst morgen gelten, und die Anzeige
 * (Ziel der Erledigung, XP der Quest) widerspräche der Wertung.
 *
 * Die Vergangenheit bleibt unverändert:
 * - Erledigungen früherer Tage behalten ihre Snapshots (Ziel, Schwierigkeit, Attribut).
 * - Ändert sich der Rhythmus (inhaltlich, nach Normalisierung) und liegt `today` nach `createdDay`, wird der
 *   bisher gültige Rhythmus mit `until: today` an `scheduleHistory` angehängt – er gilt weiter für alle Tage
 *   vor `today`, der neue ab `today`. Mehrere Änderungen am selben Tag hängen nichts weiteres an: Für die
 *   Tage vor `today` bleibt der ursprüngliche Rhythmus maßgeblich. Ist `today ≤ createdDay`, wird der
 *   Rhythmus einfach ersetzt (es gibt noch keine Vergangenheit).
 * - Der Verlauf wird dabei normalisiert (sortiert, gleiche Nachbarn zusammengefasst, Einträge mit dem
 *   aktuellen Rhythmus am Ende entfernt), ohne an der Bedeutung für irgendeinen Tag etwas zu ändern.
 */
export async function updateHabit(
  id: string,
  patch: Partial<HabitDraft>,
  today: DayKey,
  database: QuestlogDB = db,
): Promise<void> {
  assertDayKey(today)
  await database.transaction('rw', database.habits, database.completions, async () => {
    const existing = await requireHabit(database, id)
    const merged: HabitDraft = {
      title: patch.title ?? existing.title,
      icon: patch.icon ?? existing.icon,
      attribute: patch.attribute ?? existing.attribute,
      difficulty: patch.difficulty ?? existing.difficulty,
      schedule: patch.schedule ?? existing.schedule,
      description: Object.hasOwn(patch, 'description') ? patch.description : existing.description,
      measure: Object.hasOwn(patch, 'measure') ? patch.measure : existing.measure,
      mainQuestId: Object.hasOwn(patch, 'mainQuestId') ? patch.mainQuestId : existing.mainQuestId,
    }
    const next: Habit = {
      id: existing.id,
      ...normalizeHabitDraft(merged),
      order: existing.order,
      createdDay: existing.createdDay,
    }
    if (existing.archivedDay !== undefined) next.archivedDay = existing.archivedDay
    const history = nextScheduleHistory(existing, next.schedule, today)
    if (history.length > 0) next.scheduleHistory = history
    const pauses = sanitizePauses(existing.pauses)
    if (pauses.length > 0) next.pauses = pauses
    await database.habits.put(next)

    const todayId = completionId(id, today)
    const completion = await database.completions.get(todayId)
    if (completion === undefined) return
    const updated = retargetCompletion(completion, existing, next)
    if (updated === null) await database.completions.delete(todayId)
    else if (updated !== completion) await database.completions.put(updated)
  })
}

/**
 * Die heutige Erledigung nach einer Bearbeitung der Quest (`before` → `after`):
 * - Ziel, Schwierigkeit und Attribut werden zu Snapshots der geänderten Quest.
 * - Messbar bleibt messbar: der erfasste Wert bleibt (z. B. 7 Seiten: bei Ziel 5 erledigt, bei Ziel 20 offen).
 * - Abhaken → messbar: erledigt → Wert = neues Ziel, sonst wird der Eintrag gelöscht (`null`).
 * - Messbar → Abhaken: erledigt → Wert 1, sonst wird der Eintrag gelöscht (`null`).
 * Ändert sich nichts davon, kommt dieselbe Erledigung zurück (kein Schreiben nötig).
 */
function retargetCompletion(completion: Completion, before: Habit, after: Habit): Completion | null {
  const target = habitTarget(after)
  const wasMeasurable = before.measure !== undefined
  const isMeasurable = after.measure !== undefined
  if (
    wasMeasurable === isMeasurable &&
    completion.target === target &&
    completion.difficulty === after.difficulty &&
    completion.attribute === after.attribute
  ) {
    return completion
  }
  let value = completion.value
  if (wasMeasurable !== isMeasurable) {
    if (!isDone(completion)) return null
    value = isMeasurable ? target : 1
  } else if (!isMeasurable) {
    value = 1
  }
  return {
    ...completion,
    value,
    target,
    difficulty: after.difficulty,
    attribute: after.attribute,
    updatedAt: Date.now(),
  }
}

/**
 * Archiviert eine Quest ab `today` (inklusive): Sie ist ab dann nicht mehr aktiv. Die Historie bleibt erhalten.
 * Ist die Quest bereits archiviert (`archivedDay ≤ today`), bleibt ihr `archivedDay` unverändert – ein späterer
 * Tag würde sie rückwirkend für die Tage dazwischen wieder aktiv machen (offene Pflicht-Quest → Perfekte Tage
 * und Streaks der Vergangenheit gingen verloren). Ein `archivedDay` nach `today` (der Tageswechsel wurde nach
 * dem Archivieren später gelegt) gilt als noch nicht archiviert und wird auf `today` vorgezogen.
 */
export async function archiveHabit(id: string, today: DayKey, database: QuestlogDB = db): Promise<void> {
  assertDayKey(today)
  await mutateHabit(database, id, (habit) => (isArchivedOn(habit, today) ? habit : { ...habit, archivedDay: today }))
}

/**
 * Holt eine archivierte Quest am Spieltag `today` zurück: `archivedDay` wird entfernt, die archivierte Zeit
 * `[archivedDay, today)` wird als Pause gespeichert (mit vorhandenen Pausen zusammengefasst). So wird die
 * Quest für diese Tage nicht rückwirkend zur offenen Pflicht-Quest – Perfekte Tage, XP und Streaks der
 * Vergangenheit bleiben erhalten. Am Tag der Archivierung selbst zurückgeholt, entsteht keine Pause.
 * Eine nicht archivierte Quest bleibt unverändert.
 */
export async function restoreHabit(id: string, today: DayKey, database: QuestlogDB = db): Promise<void> {
  assertDayKey(today)
  await mutateHabit(database, id, (habit) => {
    if (habit.archivedDay === undefined) return habit
    const next: Habit = { ...habit }
    delete next.archivedDay
    // Vor createdDay war die Quest ohnehin nicht aktiv – die Pause beginnt frühestens dort.
    const from = compareDays(habit.archivedDay, habit.createdDay) > 0 ? habit.archivedDay : habit.createdDay
    const pauses = sanitizePauses(habit.pauses)
    const merged = compareDays(from, today) < 0 ? mergePauses([...pauses, { from, until: today }]) : pauses
    if (merged.length > 0) next.pauses = merged
    else delete next.pauses
    return next
  })
}

/**
 * Löscht eine Quest am Spieltag `today` endgültig – inklusive aller ihrer Erledigungen – und hinterlässt einen
 * Grabstein (`DeletedHabit`) mit ihrem Zeitplan: An vergangenen Tagen, an denen sie Pflicht war, bleibt sie
 * (offene) Pflicht. So wird kein Tag nachträglich perfekt; Löschen bringt nie XP, es kann nur die XP der Quest,
 * ihren Anteil an Perfekter-Tag-Boni und Kapitel-XP kosten. Gleiche Bedeutung wie `applyHabitDeletion`.
 * Der Grabstein endet am Archivierungstag (falls ≤ today), sonst an `today`.
 *
 * `today` sollte immer übergeben werden; fehlt er, gilt der Spieltag laut Uhr und gespeichertem Tageswechsel.
 * Eine unbekannte Quest ändert nichts.
 */
export async function deleteHabit(id: string, today?: DayKey, database: QuestlogDB = db): Promise<void> {
  if (today !== undefined) assertDayKey(today)
  await database.transaction('rw', database.habits, database.completions, database.kv, async () => {
    const existing = await database.habits.get(id)
    if (!existing) return
    const day = today ?? toDayKey(new Date(), await storedDayStartHour(database))
    const entry = await database.kv.get(KV_KEYS.deletedHabits)
    const tombstones = withTombstone(sanitizeTombstones(entry?.value), habitTombstone(existing, day))
    await database.kv.put({ key: KV_KEYS.deletedHabits, value: tombstones })
    await database.completions.where('habitId').equals(id).delete()
    await database.habits.delete(id)
  })
}

/**
 * Verschiebt eine aktive (am Spieltag `today` nicht archivierte, `isArchivedOn`) Quest um eine Position nach
 * oben/unten, indem ihr `order` mit dem des Nachbarn unter den aktiven Quests getauscht wird – also genau
 * den Quests, die die Quest-Liste als aktiv zeigt. Archivierte Quests werden übersprungen. Sind `order`-Werte
 * doppelt vergeben, werden vorher alle Quests lückenlos neu durchnummeriert (0, 1, 2, …), damit der Tausch
 * eindeutig ist. Am Anfang/Ende der Liste oder bei archivierten/unbekannten Quests passiert nichts.
 */
export async function moveHabit(
  id: string,
  direction: 'up' | 'down',
  today: DayKey,
  database: QuestlogDB = db,
): Promise<void> {
  assertDayKey(today)
  await database.transaction('rw', database.habits, async () => {
    const all = (await database.habits.toArray()).sort(compareHabitOrder)
    const active = all.filter((habit) => !isArchivedOn(habit, today))
    const index = active.findIndex((habit) => habit.id === id)
    const neighborIndex = direction === 'up' ? index - 1 : index + 1
    if (index === -1 || neighborIndex < 0 || neighborIndex >= active.length) return

    const changed = new Set<Habit>()
    if (needsOrderNormalization(all)) {
      all.forEach((habit, position) => {
        if (habit.order !== position) {
          habit.order = position
          changed.add(habit)
        }
      })
    }

    // `active` enthält dieselben Objekte wie `all`, d. h. die Normalisierung ist hier schon sichtbar.
    const self = active[index]
    const neighbor = active[neighborIndex]
    const selfOrder = self.order
    self.order = neighbor.order
    neighbor.order = selfOrder
    changed.add(self).add(neighbor)

    await database.habits.bulkPut([...changed])
  })
}

// ---------------------------------------------------------------------------
// Erledigungen (Completions)
// ---------------------------------------------------------------------------

/** ID einer Erledigung: höchstens ein Eintrag pro Quest und Tag. */
export function completionId(habitId: string, day: DayKey): string {
  return `${habitId}:${day}`
}

/**
 * Setzt den erfassten Wert einer Quest an einem Tag.
 * - `value ≤ 0` oder keine endliche Zahl → Eintrag wird gelöscht.
 * - sonst Upsert mit Snapshots (Ziel, Schwierigkeit, Attribut) der **aktuellen** Quest.
 *   Abhak-Quests speichern bei jedem positiven Wert `1`.
 */
export async function setCompletionValue(
  habitId: string,
  day: DayKey,
  value: number,
  database: QuestlogDB = db,
): Promise<void> {
  assertDayKey(day)
  await database.transaction('rw', database.habits, database.completions, async () => {
    if (!Number.isFinite(value) || value <= 0) {
      await database.completions.delete(completionId(habitId, day))
      return
    }
    const habit = await requireHabit(database, habitId)
    await writeCompletion(database, habit, day, value)
  })
}

/**
 * Abhaken per Tipp:
 * - Ist die Quest an `day` erledigt (`value ≥ target`, gleiche Prüfung `isDone` wie in der Engine),
 *   wird der Eintrag gelöscht.
 * - Sonst wird sie erledigt: Abhak-Quest → 1, messbare Quest → value = aktuelles Ziel. Ein bereits
 *   höher erfasster Wert (möglich, nachdem das Ziel gesenkt wurde) bleibt erhalten – Abhaken
 *   verringert nie den erfassten Fortschritt (z. B. "Seiten gesamt").
 */
export async function toggleCompletion(habitId: string, day: DayKey, database: QuestlogDB = db): Promise<void> {
  assertDayKey(day)
  await database.transaction('rw', database.habits, database.completions, async () => {
    const habit = await requireHabit(database, habitId)
    const id = completionId(habitId, day)
    const existing = await database.completions.get(id)
    if (existing && isDone(existing)) {
      await database.completions.delete(id)
    } else {
      await writeCompletion(database, habit, day, Math.max(habitTarget(habit), existing?.value ?? 0))
    }
  })
}

// ---------------------------------------------------------------------------
// Kampagnen (MainQuests) & Kapitel
// ---------------------------------------------------------------------------

/** Legt eine Kampagne an. Kapitel ohne (oder mit doppelter) ID bekommen eine neue. */
export async function createMainQuest(draft: MainQuestDraft, database: QuestlogDB = db): Promise<MainQuest> {
  const quest: MainQuest = { id: newId(), ...normalizeMainQuestDraft(draft), createdAt: Date.now() }
  await database.mainQuests.add(quest)
  return quest
}

/**
 * Ändert eine Kampagne. Pflichtfelder, die im Patch fehlen oder `undefined` sind, bleiben unverändert;
 * optionale Felder (`description`, `deadline`, `archived`), die explizit `undefined` sind, werden entfernt.
 * `chapters` ersetzt die komplette Kapitelliste.
 */
export async function updateMainQuest(
  id: string,
  patch: Partial<MainQuestDraft>,
  database: QuestlogDB = db,
): Promise<void> {
  await database.transaction('rw', database.mainQuests, async () => {
    const existing = await requireMainQuest(database, id)
    const merged: MainQuestDraft = {
      title: patch.title ?? existing.title,
      icon: patch.icon ?? existing.icon,
      why: patch.why ?? existing.why,
      reward: patch.reward ?? existing.reward,
      startDay: patch.startDay ?? existing.startDay,
      chapters: patch.chapters ?? existing.chapters,
      description: Object.hasOwn(patch, 'description') ? patch.description : existing.description,
      deadline: Object.hasOwn(patch, 'deadline') ? patch.deadline : existing.deadline,
      archived: Object.hasOwn(patch, 'archived') ? patch.archived : existing.archived,
    }
    await database.mainQuests.put({ id: existing.id, ...normalizeMainQuestDraft(merged), createdAt: existing.createdAt })
  })
}

/** Löscht eine Kampagne. Verknüpfte Quests bleiben bestehen, verlieren aber ihre `mainQuestId`. */
export async function deleteMainQuest(id: string, database: QuestlogDB = db): Promise<void> {
  await database.transaction('rw', database.mainQuests, database.habits, async () => {
    await database.habits
      .where('mainQuestId')
      .equals(id)
      .modify((habit) => {
        delete habit.mainQuestId
      })
    await database.mainQuests.delete(id)
  })
}

/**
 * Hakt ein manuelles Kapitel ab (oder wieder auf).
 * `completedDay` wird beim Abschließen auf `today` gesetzt, beim Aufheben entfernt und bleibt
 * unverändert, wenn das Kapitel ohnehin schon abgeschlossen war.
 */
export async function setChapterManual(
  questId: string,
  chapterId: string,
  done: boolean,
  today: DayKey,
  database: QuestlogDB = db,
): Promise<void> {
  assertDayKey(today)
  await mutateChapter(database, questId, chapterId, (chapter) => {
    if (chapter.criterion.type !== 'manual') throw new Error('Dieses Kapitel wird nicht von Hand abgehakt.')
    const next: Chapter = { ...chapter, manualDone: done }
    if (!done) delete next.completedDay
    else if (!chapter.manualDone) next.completedDay = today
    return next
  })
}

/**
 * Setzt den Zählerstand eines Zähler-Kapitels (auf ≥ 0 begrenzt).
 * `completedDay` wird gesetzt, wenn das Ziel dadurch erreicht wird, entfernt, wenn es nicht mehr
 * erreicht ist, und bleibt unverändert, wenn das Ziel schon vorher erreicht war.
 */
export async function setChapterCounter(
  questId: string,
  chapterId: string,
  value: number,
  today: DayKey,
  database: QuestlogDB = db,
): Promise<void> {
  assertDayKey(today)
  if (!Number.isFinite(value)) throw new Error('Ungültiger Zählerstand.')
  const counter = Math.max(0, value)
  await mutateChapter(database, questId, chapterId, (chapter) => {
    const { criterion } = chapter
    if (criterion.type !== 'counter') throw new Error('Dieses Kapitel hat keinen Zähler.')
    // Gleicher (rauschtoleranter) Zielvergleich wie in domain/chapters, damit Engine und Abschlusstag übereinstimmen.
    const wasDone = reachesTarget(Math.max(0, chapter.counter ?? 0), criterion.target)
    const nowDone = reachesTarget(counter, criterion.target)
    const next: Chapter = { ...chapter, counter }
    if (!nowDone) delete next.completedDay
    else if (!wasDone) next.completedDay = today
    return next
  })
}

// ---------------------------------------------------------------------------
// Alles zurücksetzen
// ---------------------------------------------------------------------------

/** Löscht ALLE Daten (Profil, Einstellungen, Quests, Erledigungen, Kampagnen) in einer Transaktion. */
export async function resetAllData(database: QuestlogDB = db): Promise<void> {
  const tables = allTables(database)
  await database.transaction('rw', tables, async () => {
    await Promise.all(tables.map((table) => table.clear()))
  })
}

// ---------------------------------------------------------------------------
// Interne Helfer: Datenbank
// ---------------------------------------------------------------------------

function allTables(database: QuestlogDB) {
  return [database.habits, database.completions, database.mainQuests, database.kv]
}

/** Sortierung von Quests: `order`, dann Titel, dann ID (stabil & deterministisch). */
function compareHabitOrder(a: Habit, b: Habit): number {
  return a.order - b.order || a.title.localeCompare(b.title, 'de') || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)
}

function needsOrderNormalization(habits: Habit[]): boolean {
  const orders = habits.map((habit) => habit.order)
  return orders.some((order) => !Number.isFinite(order)) || new Set(orders).size !== orders.length
}

async function nextHabitOrder(database: QuestlogDB): Promise<number> {
  const last = await database.habits.orderBy('order').last()
  return last ? last.order + 1 : 0
}

async function requireHabit(database: QuestlogDB, id: string): Promise<Habit> {
  const habit = await database.habits.get(id)
  if (!habit) throw new Error(MSG.habitNotFound)
  return habit
}

async function requireMainQuest(database: QuestlogDB, id: string): Promise<MainQuest> {
  const quest = await database.mainQuests.get(id)
  if (!quest) throw new Error(MSG.questNotFound)
  return quest
}

/** Lesen → ändern → schreiben einer Quest in einer Transaktion. */
async function mutateHabit(database: QuestlogDB, id: string, change: (habit: Habit) => Habit): Promise<void> {
  await database.transaction('rw', database.habits, async () => {
    const habit = await requireHabit(database, id)
    await database.habits.put(change(habit))
  })
}

/** Lesen → ein Kapitel ändern → schreiben einer Kampagne in einer Transaktion. */
async function mutateChapter(
  database: QuestlogDB,
  questId: string,
  chapterId: string,
  change: (chapter: Chapter) => Chapter,
): Promise<void> {
  await database.transaction('rw', database.mainQuests, async () => {
    const quest = await requireMainQuest(database, questId)
    const index = quest.chapters.findIndex((chapter) => chapter.id === chapterId)
    if (index === -1) throw new Error(MSG.chapterNotFound)
    const chapters = quest.chapters.slice()
    chapters[index] = change(quest.chapters[index])
    await database.mainQuests.put({ ...quest, chapters })
  })
}

/** Schreibt (Upsert) eine Erledigung mit Snapshots der aktuellen Quest. Erwartet `value > 0`. */
async function writeCompletion(database: QuestlogDB, habit: Habit, day: DayKey, value: number): Promise<void> {
  const completion: Completion = {
    id: completionId(habit.id, day),
    habitId: habit.id,
    day,
    value: habit.measure ? value : 1,
    target: habitTarget(habit),
    difficulty: habit.difficulty,
    attribute: habit.attribute,
    updatedAt: Date.now(),
  }
  await database.completions.put(completion)
}

// ---------------------------------------------------------------------------
// Interne Helfer: Validierung & Normalisierung
// ---------------------------------------------------------------------------

/** Wirft einen deutschsprachigen Fehler, wenn `value` kein gültiger DayKey ('YYYY-MM-DD') ist. */
function assertDayKey(value: unknown, label = 'Datum'): asserts value is DayKey {
  if (typeof value !== 'string' || !isValidDayKey(value)) {
    throw new Error(`Ungültiges ${label}: ${String(value)} (erwartet JJJJ-MM-TT).`)
  }
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/** Gespeicherter (gültiger) Tageswechsel, sonst der Standard. */
async function storedDayStartHour(database: QuestlogDB): Promise<number> {
  const entry = await database.kv.get(KV_KEYS.settings)
  return pickValidSettings(entry?.value).dayStartHour ?? DEFAULT_SETTINGS.dayStartHour
}

/** Übernimmt aus einem gespeicherten Einstellungs-Objekt nur gültige, bekannte Werte. */
function pickValidSettings(stored: unknown): Partial<Settings> {
  const result: Partial<Settings> = {}
  if (!isRecord(stored)) return result
  const { dayStartHour, effects } = stored
  if (typeof dayStartHour === 'number' && Number.isInteger(dayStartHour) && dayStartHour >= 0 && dayStartHour <= 12) {
    result.dayStartHour = dayStartHour
  }
  if (typeof effects === 'boolean') result.effects = effects
  return result
}

/** Getrimmter, nicht leerer Text – sonst Fehler mit `message`. */
function requireText(value: unknown, message: string): string {
  const text = optionalText(value)
  if (text === undefined) throw new Error(message)
  return text
}

/** Getrimmter Text oder `undefined`, wenn leer bzw. kein Text. */
function optionalText(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined
  const trimmed = value.trim()
  return trimmed === '' ? undefined : trimmed
}

/** Nicht leere ID oder `undefined`. IDs werden nicht verändert (kein Trimmen). */
function optionalId(value: unknown): string | undefined {
  return typeof value === 'string' && value !== '' ? value : undefined
}

function requirePositive(value: unknown, message: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) throw new Error(message)
  return value
}

function normalizeAttribute(value: AttributeId): AttributeId {
  if (!ATTRIBUTE_IDS.includes(value)) throw new Error('Unbekanntes Attribut.')
  return value
}

function normalizeDifficulty(value: Difficulty): Difficulty {
  if (!DIFFICULTIES.includes(value)) throw new Error('Unbekannte Schwierigkeit.')
  return value
}

function isIsoWeekday(value: unknown): value is IsoWeekday {
  return typeof value === 'number' && Number.isInteger(value) && value >= 1 && value <= 7
}

function normalizeSchedule(schedule: Schedule): Schedule {
  switch (schedule?.type) {
    case 'daily':
      return { type: 'daily' }
    case 'weekdays': {
      const input: unknown[] = Array.isArray(schedule.days) ? schedule.days : []
      const days = [...new Set(input)].filter(isIsoWeekday).sort((a, b) => a - b)
      if (days.length === 0) throw new Error('Wähle mindestens einen Wochentag.')
      return { type: 'weekdays', days }
    }
    case 'weekly': {
      if (typeof schedule.times !== 'number' || !Number.isFinite(schedule.times)) {
        throw new Error('Gib an, wie oft pro Woche die Quest fällig ist.')
      }
      return { type: 'weekly', times: clamp(Math.round(schedule.times), 1, 7) }
    }
    default:
      throw new Error('Unbekannter Rhythmus.')
  }
}

/**
 * Rhythmus-Verlauf nach einer Bearbeitung am Tag `today`, bei der der Rhythmus `nextSchedule` wird:
 * Für alle Tage vor `today` bleibt der bisher gültige Rhythmus (laut altem Verlauf) erhalten, ab `today`
 * gilt `nextSchedule`.
 */
function nextScheduleHistory(existing: Habit, nextSchedule: Schedule, today: DayKey): ScheduleHistoryEntry[] {
  const history = sanitizeHistory(existing.scheduleHistory)
  if (sameSchedule(existing.schedule, nextSchedule) || compareDays(today, existing.createdDay) <= 0) {
    return normalizeHistory(history, nextSchedule)
  }
  // Einträge, die vor `today` enden, bleiben. Die Tage zwischen dem letzten davon und `today` hatten den
  // Rhythmus des ersten Eintrags, der erst ab `today` endet (z. B. eine frühere Änderung am selben Tag),
  // sonst den bisher aktuellen.
  const kept = history.filter((entry) => compareDays(entry.until, today) < 0)
  const covering = history.find((entry) => compareDays(entry.until, today) >= 0)
  kept.push({ until: today, schedule: covering?.schedule ?? normalizeStoredSchedule(existing.schedule) })
  return normalizeHistory(kept, nextSchedule)
}

/**
 * Normalisiert einen nach `until` sortierten Verlauf, ohne die Bedeutung für irgendeinen Tag zu ändern:
 * - gleicher `until` mehrfach → der erste gilt (wie in `scheduleOn`), die übrigen entfallen
 * - direkt aufeinanderfolgende Einträge mit gleichem Rhythmus werden zusammengefasst
 * - Einträge am Ende mit dem aktuellen Rhythmus `current` sind überflüssig und entfallen
 */
function normalizeHistory(sorted: readonly ScheduleHistoryEntry[], current: Schedule): ScheduleHistoryEntry[] {
  const result: ScheduleHistoryEntry[] = []
  for (const entry of sorted) {
    const last = result.at(-1)
    if (last !== undefined && last.until === entry.until) continue
    if (last !== undefined && sameSchedule(last.schedule, entry.schedule)) {
      last.until = entry.until
      continue
    }
    result.push({ until: entry.until, schedule: entry.schedule })
  }
  while (result.length > 0 && sameSchedule(result[result.length - 1].schedule, current)) result.pop()
  return result
}

/**
 * Gültige Einträge eines gespeicherten Verlaufs (gültiger Tag, gültiger Rhythmus), normalisierte Rhythmen,
 * stabil nach `until` sortiert. Kaputte Einträge werden verworfen.
 */
function sanitizeHistory(value: unknown): ScheduleHistoryEntry[] {
  if (!Array.isArray(value)) return []
  const entries: ScheduleHistoryEntry[] = []
  for (const entry of value as unknown[]) {
    if (!isRecord(entry) || typeof entry.until !== 'string' || !isValidDayKey(entry.until)) continue
    const schedule = tryNormalizeSchedule(entry.schedule)
    if (schedule !== undefined) entries.push({ until: entry.until, schedule })
  }
  return entries.sort((a, b) => compareDays(a.until, b.until))
}

/** Gültige gespeicherte Pausen (gültige Tage, `from < until`), sortiert und zusammengefasst. */
function sanitizePauses(value: unknown): HabitPause[] {
  if (!Array.isArray(value)) return []
  const pauses: HabitPause[] = []
  for (const pause of value as unknown[]) {
    if (!isRecord(pause)) continue
    const { from, until } = pause
    if (typeof from !== 'string' || typeof until !== 'string' || !isValidDayKey(from) || !isValidDayKey(until)) continue
    pauses.push({ from, until })
  }
  return mergePauses(pauses)
}

/**
 * Gültige gespeicherte Grabsteine: gültige ID und Tage, gültiger Rhythmus; Verlauf und Pausen wie bei Quests
 * bereinigt (bedeutungsgleich normalisiert). Kaputte Einträge entfallen; bei doppelter ID gilt der letzte.
 * Das Ergebnis besteht damit auch die Backup-Prüfung.
 */
function sanitizeTombstones(value: unknown): DeletedHabit[] {
  if (!Array.isArray(value)) return []
  const byId = new Map<string, DeletedHabit>()
  for (const entry of value as unknown[]) {
    if (!isRecord(entry)) continue
    const id = optionalId(entry.id)
    const { createdDay, archivedDay } = entry
    if (id === undefined || !isDayKeyValue(createdDay) || !isDayKeyValue(archivedDay)) continue
    const schedule = tryNormalizeSchedule(entry.schedule)
    if (schedule === undefined) continue
    const tombstone: DeletedHabit = { id, createdDay, archivedDay, schedule }
    const history = normalizeHistory(sanitizeHistory(entry.scheduleHistory), schedule)
    if (history.length > 0) tombstone.scheduleHistory = history
    const pauses = sanitizePauses(entry.pauses)
    if (pauses.length > 0) tombstone.pauses = pauses
    byId.delete(tombstone.id)
    byId.set(tombstone.id, tombstone)
  }
  return [...byId.values()]
}

function isDayKeyValue(value: unknown): value is DayKey {
  return typeof value === 'string' && isValidDayKey(value)
}

function tryNormalizeSchedule(value: unknown): Schedule | undefined {
  try {
    return normalizeSchedule(value as Schedule)
  } catch {
    return undefined
  }
}

/** Gespeicherter Rhythmus in Normalform; ein (nur durch kaputte Daten möglicher) ungültiger bleibt wie er ist. */
function normalizeStoredSchedule(schedule: Schedule): Schedule {
  return tryNormalizeSchedule(schedule) ?? schedule
}

function normalizeMeasure(measure: Measure): Measure {
  return {
    target: requirePositive(measure.target, 'Der Zielwert muss größer als 0 sein.'),
    unit: requireText(measure.unit, 'Bitte gib eine Einheit an (z. B. „Seiten“).'),
  }
}

/** Validiert und normalisiert die bearbeitbaren Felder einer Quest. Leere optionale Felder entfallen. */
function normalizeHabitDraft(draft: HabitDraft): HabitDraft {
  const result: HabitDraft = {
    title: requireText(draft.title, 'Die Quest braucht einen Namen.'),
    icon: optionalText(draft.icon) ?? DEFAULT_HABIT_ICON,
    attribute: normalizeAttribute(draft.attribute),
    difficulty: normalizeDifficulty(draft.difficulty),
    schedule: normalizeSchedule(draft.schedule),
  }
  const description = optionalText(draft.description)
  if (description !== undefined) result.description = description
  if (draft.measure !== undefined && draft.measure !== null) result.measure = normalizeMeasure(draft.measure)
  const mainQuestId = optionalId(draft.mainQuestId)
  if (mainQuestId !== undefined) result.mainQuestId = mainQuestId
  return result
}

function normalizeCriterion(criterion: ChapterCriterion): ChapterCriterion {
  const targetMessage = 'Das Ziel eines Kapitels muss größer als 0 sein.'
  switch (criterion?.type) {
    case 'manual':
      return { type: 'manual' }
    case 'counter':
      return {
        type: 'counter',
        target: requirePositive(criterion.target, targetMessage),
        label: optionalText(criterion.label) ?? DEFAULT_COUNTER_LABEL,
      }
    case 'habit': {
      const habitId = optionalId(criterion.habitId)
      if (habitId === undefined) throw new Error('Wähle eine Quest für das Kapitel.')
      if (!HABIT_METRICS.includes(criterion.metric)) throw new Error('Unbekannte Kapitel-Messgröße.')
      return { type: 'habit', habitId, metric: criterion.metric, target: requirePositive(criterion.target, targetMessage) }
    }
    default:
      throw new Error('Unbekannte Kapitel-Art.')
  }
}

/**
 * Validiert Kapitel. Zustandsfelder bleiben nur erhalten, wenn sie zur Kapitel-Art passen
 * (`manualDone` nur bei 'manual', `counter` nur bei 'counter'); `completedDay` nur, solange das
 * Kapitel laut Zustand abgeschlossen ist.
 */
function normalizeChapters(chapters: Chapter[]): Chapter[] {
  const input: Chapter[] = Array.isArray(chapters) ? chapters : []
  const usedIds = new Set<string>()
  return input.map((chapter) => {
    const existingId = optionalId(chapter.id)
    const id = existingId !== undefined && !usedIds.has(existingId) ? existingId : newId()
    usedIds.add(id)

    const criterion = normalizeCriterion(chapter.criterion)
    const result: Chapter = {
      id,
      title: requireText(chapter.title, 'Jedes Kapitel braucht einen Namen.'),
      criterion,
    }
    const description = optionalText(chapter.description)
    if (description !== undefined) result.description = description

    let done = false
    if (criterion.type === 'manual' && typeof chapter.manualDone === 'boolean') {
      result.manualDone = chapter.manualDone
      done = chapter.manualDone
    } else if (criterion.type === 'counter' && chapter.counter !== undefined) {
      const counter = Number.isFinite(chapter.counter) ? Math.max(0, chapter.counter) : 0
      result.counter = counter
      done = reachesTarget(counter, criterion.target)
    }
    if (done && chapter.completedDay !== undefined && isValidDayKey(chapter.completedDay)) {
      result.completedDay = chapter.completedDay
    }
    return result
  })
}

/** Validiert und normalisiert die bearbeitbaren Felder einer Kampagne. Leere optionale Felder entfallen. */
function normalizeMainQuestDraft(draft: MainQuestDraft): MainQuestDraft {
  assertDayKey(draft.startDay, 'Startdatum')
  const result: MainQuestDraft = {
    title: requireText(draft.title, 'Die Kampagne braucht einen Namen.'),
    icon: optionalText(draft.icon) ?? DEFAULT_MAIN_QUEST_ICON,
    why: optionalText(draft.why) ?? '',
    reward: optionalText(draft.reward) ?? '',
    startDay: draft.startDay,
    chapters: normalizeChapters(draft.chapters),
  }
  const description = optionalText(draft.description)
  if (description !== undefined) result.description = description
  if (draft.deadline !== undefined && draft.deadline !== '') {
    assertDayKey(draft.deadline, 'Zieldatum')
    if (draft.deadline < draft.startDay) throw new Error('Das Zieldatum darf nicht vor dem Start liegen.')
    result.deadline = draft.deadline
  }
  if (draft.archived === true) result.archived = true
  return result
}
