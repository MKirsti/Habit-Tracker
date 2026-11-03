/**
 * Kampagnen aus Vorlagen (Blueprints) starten – und das Abenteuer beginnen.
 *
 * - `createCampaignFromBlueprint` (rein): macht aus einer Vorlage (Stufe, ggf. Pfad) eine fertige Kampagne
 *   samt Quests mit neuen IDs – noch nicht gespeichert (z. B. für eine Vorschau).
 * - `installBlueprint`: speichert sie in **einer** Transaktion. Vorhandene Quests mit gleichem Titel werden
 *   geteilt statt verdoppelt; höchstens `BALANCING.maxActiveCampaigns` Kampagnen sind gleichzeitig aktiv, und
 *   dieselbe Vorlage kann nicht zweimal gleichzeitig laufen.
 * - `startAdventure`: Abschluss des Onboardings (Vorlage optional + Profil) – alles oder nichts.
 *
 * "Der Weg des Gelehrten" (`createScholarCampaign`, `installScholarCampaign`) ist die Einsteiger-Stufe der
 * Gelehrten-Vorlage.
 */
import { BALANCING } from '../domain/balancing'
import { activeCampaigns, CAMPAIGN_LIMIT_MESSAGE } from '../domain/campaigns'
import { addDays, isValidDayKey } from '../domain/dates'
import { isArchivedOn } from '../domain/schedule'
import type {
  BlueprintRef,
  Chapter,
  ChapterCriterion,
  CharacterProfile,
  DayKey,
  Habit,
  MainQuest,
  Schedule,
} from '../domain/types'
import { getBlueprint } from './blueprints'
import { BLUEPRINT_LEVELS } from './blueprints/types'
import type { BlueprintCriterion, BlueprintOptions, BlueprintQuest, CampaignBlueprint } from './blueprints/types'
import { db, type QuestlogDB } from './db'
import { newId } from './ids'
import { loadGameData, saveProfile } from './repository'

/** ID der Gelehrten-Vorlage ("Der Weg des Gelehrten"). */
export const SCHOLAR_BLUEPRINT_ID = 'scholar'

const MSG = {
  unknownBlueprint: 'Diese Vorlage gibt es nicht.',
  pathRequired: 'Bitte wähle einen Pfad.',
  unknownPath: 'Unbekannter Pfad.',
  unknownLevel: 'Unbekannte Stufe.',
  alreadyRunning: 'Diese Kampagne läuft bereits.',
} as const

// ---------------------------------------------------------------------------
// Kampagne aus einer Vorlage erzeugen (rein, ohne Speichern)
// ---------------------------------------------------------------------------

/**
 * Erzeugt aus einer Vorlage die Kampagne samt Quests (noch nicht gespeichert):
 * - Stufe muss `'beginner'` oder `'advanced'` sein. Hat die Vorlage Pfade, muss `options.pathId` einer davon
 *   sein (sonst „Bitte wähle einen Pfad.“ bzw. „Unbekannter Pfad.“); ohne Pfade wird ein `pathId` ignoriert.
 * - Quests bekommen neue IDs, sind mit der Kampagne verknüpft, ab `today` aktiv und haben die Reihenfolge
 *   0..n-1 (in der Reihenfolge der Vorlage).
 * - Kapitel bekommen neue IDs; Quest-Kapitel verweisen per `habitId` auf die erzeugten Quests.
 * - Die Kampagne startet `today`, endet `today + durationDays` und merkt sich ihre Herkunft
 *   (`blueprint: { id, level, pathId? }`).
 *
 * @param createdAt Zeitstempel der Kampagne (Standard: jetzt).
 */
export function createCampaignFromBlueprint(
  blueprint: CampaignBlueprint,
  options: BlueprintOptions,
  today: DayKey,
  createdAt: number = Date.now(),
): { mainQuest: MainQuest; habits: Habit[] } {
  const ref = blueprintRef(blueprint, options)
  // addDays wirft bei einem ungültigen Tag – deshalb vor allem anderen.
  const deadline = addDays(today, blueprint.durationDays)
  const buildOptions: BlueprintOptions = ref.pathId === undefined ? { level: ref.level } : { level: ref.level, pathId: ref.pathId }
  const content = blueprint.build(buildOptions)
  const mainQuestId = newId()

  const idByKey = new Map<string, string>()
  const habits = content.quests.map((quest, order): Habit => {
    const habit = habitFromBlueprintQuest(quest, today, order)
    habit.mainQuestId = mainQuestId
    idByKey.set(quest.key, habit.id)
    return habit
  })

  const chapters = content.chapters.map((chapter): Chapter => {
    const result: Chapter = {
      id: newId(),
      title: chapter.title,
      criterion: criterionFromBlueprint(chapter.criterion, idByKey, chapter.title),
    }
    if (chapter.description.trim() !== '') result.description = chapter.description
    return result
  })

  const mainQuest: MainQuest = {
    id: mainQuestId,
    icon: content.icon,
    title: content.title,
    why: content.why,
    reward: content.reward,
    startDay: today,
    deadline,
    chapters,
    blueprint: ref,
    createdAt,
  }
  if (content.description.trim() !== '') mainQuest.description = content.description
  return { mainQuest, habits }
}

/** Prüft Stufe und Pfad und liefert die Herkunftsangabe für `MainQuest.blueprint`. */
function blueprintRef(blueprint: CampaignBlueprint, options: BlueprintOptions): BlueprintRef {
  if (!BLUEPRINT_LEVELS.includes(options?.level)) throw new Error(MSG.unknownLevel)
  const ref: BlueprintRef = { id: blueprint.id, level: options.level }
  const paths = blueprint.paths ?? []
  if (paths.length === 0) return ref
  const pathId = options.pathId
  if (pathId === undefined || pathId === '') throw new Error(MSG.pathRequired)
  if (!paths.some((path) => path.id === pathId)) throw new Error(MSG.unknownPath)
  ref.pathId = pathId
  return ref
}

function habitFromBlueprintQuest(quest: BlueprintQuest, today: DayKey, order: number): Habit {
  const habit: Habit = {
    id: newId(),
    icon: quest.icon,
    title: quest.title,
    attribute: quest.attribute,
    difficulty: quest.difficulty,
    schedule: cloneSchedule(quest.schedule),
    order,
    createdDay: today,
  }
  if (quest.description.trim() !== '') habit.description = quest.description
  if (quest.measure !== undefined) habit.measure = { target: quest.measure.target, unit: quest.measure.unit }
  return habit
}

function cloneSchedule(schedule: Schedule): Schedule {
  switch (schedule.type) {
    case 'daily':
      return { type: 'daily' }
    case 'weekdays':
      return { type: 'weekdays', days: [...schedule.days] }
    case 'weekly':
      return { type: 'weekly', times: schedule.times }
  }
}

function criterionFromBlueprint(
  criterion: BlueprintCriterion,
  idByKey: ReadonlyMap<string, string>,
  chapterTitle: string,
): ChapterCriterion {
  switch (criterion.type) {
    case 'manual':
      return { type: 'manual' }
    case 'counter':
      return { type: 'counter', target: criterion.target, label: criterion.label }
    case 'habit': {
      const habitId = idByKey.get(criterion.questKey)
      // Nur bei einer fehlerhaften Vorlage möglich (blueprints.test.ts prüft das für alle Vorlagen).
      if (habitId === undefined) {
        throw new Error(`Die Vorlage ist fehlerhaft: Kapitel „${chapterTitle}“ verweist auf eine unbekannte Quest.`)
      }
      return { type: 'habit', habitId, metric: criterion.metric, target: criterion.target }
    }
  }
}

// ---------------------------------------------------------------------------
// Vorlage installieren
// ---------------------------------------------------------------------------

/**
 * Startet eine Kampagne aus der Vorlage `blueprintId` am Spieltag `today` – in **einer** Transaktion – und
 * liefert die gespeicherte Kampagne.
 *
 * Wirft (deutsch, nichts wird gespeichert):
 * - „Diese Vorlage gibt es nicht.“ – unbekannte Vorlage
 * - „Bitte wähle einen Pfad.“ / „Unbekannter Pfad.“ – siehe `createCampaignFromBlueprint`
 * - „Diese Kampagne läuft bereits.“ – eine aktive Kampagne aus derselben Vorlage gibt es schon
 * - Limit-Meldung (`CAMPAIGN_LIMIT_MESSAGE`) – schon `maxActiveCampaigns` aktive Kampagnen
 *
 * Geteilte Quests: Gibt es schon eine Quest mit dem (getrimmten) Titel einer Vorlage-Quest, die am Tag `today`
 * nicht archiviert ist, wird sie wiederverwendet (mit ihren Einstellungen und ihrem Verlauf) statt verdoppelt –
 * die Kapitel der neuen Kampagne zählen auf sie. Ist sie keiner aktiven Kampagne zugeordnet (keine
 * `mainQuestId`, oder ihre Kampagne ist archiviert, abgeschlossen oder gelöscht), wird sie der neuen
 * zugeordnet (eine archivierte bzw. abgeschlossene bisherige Kampagne führt sie dann in ihren `sharedHabitIds`
 * weiter); sonst behält sie ihre Zuordnung und steht in `sharedHabitIds` der neuen Kampagne (damit sie dort in
 * `linkedHabitIds` erscheint). Bei mehreren Kandidaten gewinnt eine nicht zugeordnete, dann die erste in der
 * Liste.
 * Nur fehlende Vorlage-Quests werden neu angelegt – hinter allen vorhandenen.
 */
export async function installBlueprint(
  blueprintId: string,
  options: BlueprintOptions,
  today: DayKey,
  database: QuestlogDB = db,
): Promise<MainQuest> {
  const blueprint = requireBlueprint(blueprintId)
  assertToday(today)
  // Rein und vor der Transaktion: Stufe/Pfad werden sofort geprüft.
  const campaign = createCampaignFromBlueprint(blueprint, options, today)
  return database.transaction('rw', allTables(database), () => writeCampaign(campaign, today, database))
}

/**
 * Erzeugt die Kampagne "Der Weg des Gelehrten" (Einsteiger-Stufe der Gelehrten-Vorlage), noch nicht
 * gespeichert. Siehe `createCampaignFromBlueprint`.
 */
export function createScholarCampaign(
  today: DayKey,
  createdAt: number = Date.now(),
): { mainQuest: MainQuest; habits: Habit[] } {
  return createCampaignFromBlueprint(requireBlueprint(SCHOLAR_BLUEPRINT_ID), { level: 'beginner' }, today, createdAt)
}

/** Startet "Der Weg des Gelehrten" (Einsteiger) – `installBlueprint('scholar', { level: 'beginner' }, today)`. */
export async function installScholarCampaign(today: DayKey, database: QuestlogDB = db): Promise<MainQuest> {
  return installBlueprint(SCHOLAR_BLUEPRINT_ID, { level: 'beginner' }, today, database)
}

// ---------------------------------------------------------------------------
// Abenteuer beginnen (Onboarding)
// ---------------------------------------------------------------------------

/** Die beim Onboarding gewählte Kampagne: Vorlage samt Stufe (und ggf. Pfad). */
export type AdventureChoice = { blueprintId: string; options: BlueprintOptions }

/**
 * @deprecated Alte Auswahl des Onboardings – `AdventureChoice | null` verwenden.
 * `'scholar'` entspricht `{ blueprintId: 'scholar', options: { level: 'beginner' } }`, `'none'` entspricht `null`.
 */
export type AdventureTemplate = 'scholar' | 'none'

/**
 * Beginnt das Abenteuer (Abschluss des Onboardings) in **einer** Transaktion: startet bei einer Auswahl die
 * Kampagne aus der Vorlage (wie `installBlueprint`) und speichert das Profil (wie `saveProfile`, gleiche
 * Prüfung und Normalisierung). Beides gelingt oder nichts davon – schlägt z. B. das Speichern des Profils
 * fehl, bleibt auch keine Kampagne zurück, und ein neuer Versuch (auch nach einem Neuladen oder mit anderer
 * Wahl) beginnt sauber. `null` = ohne Kampagne.
 */
export async function startAdventure(
  profile: CharacterProfile,
  choice: AdventureChoice | AdventureTemplate | null,
  today: DayKey,
  database: QuestlogDB = db,
): Promise<void> {
  const normalized = normalizeChoice(choice)
  // Vorab (rein) prüfen und erzeugen, damit ungültige Auswahl ohne Transaktion scheitert.
  const campaign =
    normalized === null
      ? null
      : createCampaignFromBlueprint(requireBlueprint(normalized.blueprintId), normalized.options, today)
  await database.transaction('rw', allTables(database), async () => {
    if (campaign !== null) await writeCampaign(campaign, today, database)
    // Erst zum Schluss: Das gespeicherte Profil schaltet die App vom Onboarding in den Spielmodus.
    await saveProfile(profile, database)
  })
}

function normalizeChoice(choice: AdventureChoice | AdventureTemplate | null): AdventureChoice | null {
  if (choice === null || choice === 'none') return null
  if (choice === 'scholar') return { blueprintId: SCHOLAR_BLUEPRINT_ID, options: { level: 'beginner' } }
  return choice
}

// ---------------------------------------------------------------------------
// Interne Helfer
// ---------------------------------------------------------------------------

function requireBlueprint(id: string): CampaignBlueprint {
  const blueprint = getBlueprint(id)
  if (blueprint === undefined) throw new Error(MSG.unknownBlueprint)
  return blueprint
}

function assertToday(today: DayKey): void {
  if (typeof today !== 'string' || !isValidDayKey(today)) {
    throw new Error(`Ungültiges Datum: ${String(today)} (erwartet JJJJ-MM-TT).`)
  }
}

function allTables(database: QuestlogDB) {
  return [database.habits, database.completions, database.mainQuests, database.kv]
}

/** Sortierung wie in der Quest-Liste: `order`, dann Titel, dann ID. */
function compareHabitOrder(a: Habit, b: Habit): number {
  return a.order - b.order || a.title.localeCompare(b.title, 'de') || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)
}

/**
 * Speichert eine (mit `createCampaignFromBlueprint` erzeugte) Kampagne samt Quests – siehe `installBlueprint`.
 * Muss innerhalb einer rw-Transaktion über alle Tabellen laufen (Limit-Prüfung über `loadGameData`).
 */
async function writeCampaign(
  campaign: { mainQuest: MainQuest; habits: Habit[] },
  today: DayKey,
  database: QuestlogDB,
): Promise<MainQuest> {
  const { mainQuest, habits: templates } = campaign
  const data = await loadGameData(database)
  const active = activeCampaigns(data, today)
  const blueprintId = mainQuest.blueprint?.id
  if (blueprintId !== undefined && active.some((state) => state.quest.blueprint?.id === blueprintId)) {
    throw new Error(MSG.alreadyRunning)
  }
  if (active.length >= BALANCING.maxActiveCampaigns) throw new Error(CAMPAIGN_LIMIT_MESSAGE)

  // Zuordnungen zu aktiven Kampagnen bleiben; Quests ohne Kampagne oder einer archivierten, abgeschlossenen
  // bzw. gelöschten Kampagne gehen an die neue.
  const activeIds = new Set(active.map((state) => state.quest.id))
  const isAssigned = (habit: Habit) => habit.mainQuestId !== undefined && activeIds.has(habit.mainQuestId)

  // Kandidaten pro Titel: nicht archiviert; eine nicht zugeordnete schlägt eine zugeordnete, sonst die erste.
  const existing = data.habits.slice().sort(compareHabitOrder)
  const reusable = new Map<string, Habit>()
  for (const habit of existing) {
    if (isArchivedOn(habit, today)) continue
    const key = habit.title.trim()
    const current = reusable.get(key)
    if (current === undefined || (isAssigned(current) && !isAssigned(habit))) reusable.set(key, habit)
  }

  let nextOrder = existing.reduce((max, habit) => (Number.isFinite(habit.order) ? Math.max(max, habit.order) : max), -1) + 1
  const idFor = new Map<string, string>() // ID der Vorlage-Quest → tatsächliche ID
  const writes: Habit[] = []
  const shared: string[] = [] // wiederverwendet, bleibt einer anderen aktiven Kampagne zugeordnet
  // Übernommen von einer bestehenden (archivierten bzw. abgeschlossenen) Kampagne: Die führt sie als geteilte
  // Quest weiter – für ihre Anzeige und damit sie sie beim Zurückholen wieder übernimmt.
  const formerOwners = new Map<string, MainQuest>()
  const questsById = new Map(data.mainQuests.map((quest) => [quest.id, quest]))
  for (const template of templates) {
    const key = template.title.trim()
    const match = reusable.get(key)
    if (match) {
      reusable.delete(key)
      idFor.set(template.id, match.id)
      if (isAssigned(match)) {
        shared.push(match.id)
        continue
      }
      writes.push({ ...match, mainQuestId: mainQuest.id })
      const owner = match.mainQuestId === undefined ? undefined : (formerOwners.get(match.mainQuestId) ?? questsById.get(match.mainQuestId))
      if (owner !== undefined) {
        formerOwners.set(owner.id, { ...owner, sharedHabitIds: [...new Set([...(owner.sharedHabitIds ?? []), match.id])] })
      }
    } else {
      writes.push({ ...template, order: nextOrder++ })
    }
  }

  const chapters = mainQuest.chapters.map((chapter): Chapter => {
    const { criterion } = chapter
    if (criterion.type !== 'habit') return chapter
    return { ...chapter, criterion: { ...criterion, habitId: idFor.get(criterion.habitId) ?? criterion.habitId } }
  })
  const saved: MainQuest = { ...mainQuest, chapters }
  if (shared.length > 0) saved.sharedHabitIds = shared
  await database.mainQuests.add(saved)
  if (formerOwners.size > 0) await database.mainQuests.bulkPut([...formerOwners.values()])
  if (writes.length > 0) await database.habits.bulkPut(writes)
  return saved
}
