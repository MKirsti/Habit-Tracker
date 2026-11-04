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
 * - Lebenspunkte (Phase 2b): Abgerechnete Tage (`hpLedger`) werden nur angehängt, nie geändert. Rast & Urlaub
 *   lassen sich nur für Tage anlegen, ändern oder löschen, die noch nicht vorbei bzw. abgerechnet sind.
 * - Fortschritt (Phase 2a/3a): Erfolge, Boss-Siege und gefundene Truhen werden nur hinzugefügt, nie überschrieben
 *   (`recordProgress`). Eine Truhe ändert sich genau einmal – beim Öffnen (`openChest`).
 */
import { ATTRIBUTE_IDS } from '../domain/attributes'
import { BALANCING, DEFAULT_SETTINGS, DIFFICULTIES } from '../domain/balancing'
import { CAMPAIGN_LIMIT_MESSAGE, CAMPAIGN_RESTORE_LIMIT_MESSAGE, isCampaignActive } from '../domain/campaigns'
import { heroSeedOf } from '../domain/combat/boss'
import { FRAMES, TITLES } from '../domain/combat/cosmeticDefinitions'
import { addDays, compareDays, diffDays, formatDay, isoWeekday, isValidDayKey, toDayKey } from '../domain/dates'
import { habitTombstone, withTombstone } from '../domain/deletion'
import { deriveGameState, evaluateMainQuests } from '../domain/engine'
import { canUndoItemPurchase, settleDays } from '../domain/hp'
import { habitTarget, isArchivedOn, isDone, mergePauses, reachesTarget, sameSchedule } from '../domain/schedule'
import type {
  AchievementUnlock,
  AttributeId,
  BlueprintRef,
  BossVictory,
  Chapter,
  ChapterCriterion,
  ChapterMetric,
  CharacterProfile,
  Chest,
  ChestContent,
  ChestRarity,
  ChestSource,
  Completion,
  CosmeticUnlock,
  DayKey,
  DeletedHabit,
  Difficulty,
  GameData,
  GameState,
  GrammaticalForm,
  Habit,
  HabitPause,
  HpLedgerEntry,
  IsoWeekday,
  ItemId,
  MainQuest,
  Measure,
  Purchase,
  RestPeriod,
  Reward,
  Schedule,
  ScheduleHistoryEntry,
  Settings,
  SideQuest,
} from '../domain/types'
import { BLUEPRINT_LEVELS } from './blueprints/types'
import { allTables, db, KV_KEYS, type QuestlogDB } from './db'
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
/** Icon, wenn eine Belohnung ohne Emoji angelegt wird. */
export const DEFAULT_REWARD_ICON = '🎁'
/** Icon, wenn eine Nebenquest ohne Emoji angelegt wird. */
export const DEFAULT_SIDE_QUEST_ICON = '📜'
/** Höchster Preis einer Belohnung in Gold. */
export const MAX_REWARD_PRICE = 1_000_000
/** Eine Rast (Ruhetag bzw. Urlaub) dauert höchstens so viele Tage am Stück. */
export const MAX_REST_PERIOD_DAYS = 60

/**
 * Gegenstände der Schatzkammer (Phase 2b): Name, Icon und Preis – so landen sie als Momentaufnahme in der Chronik.
 * Preise und Wirkung kommen aus `BALANCING.items`.
 */
export const ITEMS: Record<ItemId, { title: string; icon: string; price: number }> = {
  streakFreeze: { title: 'Streak-Schutz', icon: '❄️', price: BALANCING.items.streakFreeze.price },
  healingPotion: { title: 'Heiltrank', icon: '🧪', price: BALANCING.items.healingPotion.price },
}
/** Alle Gegenstände in Anzeigereihenfolge (die von `ITEMS`). */
export const ITEM_IDS = Object.keys(ITEMS) as readonly ItemId[]

/** Sprachformen für Klassen und Titel (Phase 3a) – `satisfies` hält die Liste vollständig zu `GrammaticalForm`. */
const GRAMMATICAL_FORM_SET = { female: true, male: true, neutral: true } satisfies Record<GrammaticalForm, true>
/** Alle Sprachformen: Heldin, Held, neutral (Standard). */
export const GRAMMATICAL_FORMS = Object.keys(GRAMMATICAL_FORM_SET) as readonly GrammaticalForm[]
/** Fundorte von Truhen (Phase 3a). */
const CHEST_SOURCE_SET = { boss: true, quest: true, chapter: true } satisfies Record<ChestSource, true>
/** Seltenheiten von Truhen (Phase 3a). */
const CHEST_RARITY_SET = { common: true, uncommon: true, rare: true, legendary: true } satisfies Record<ChestRarity, true>

/** Die bearbeitbaren Felder einer Quest. Verlauf (`scheduleHistory`) und Pausen pflegt das Repository selbst. */
export type HabitDraft = Omit<Habit, 'id' | 'order' | 'createdDay' | 'archivedDay' | 'scheduleHistory' | 'pauses'>
export type MainQuestDraft = Omit<MainQuest, 'id' | 'createdAt'>
/** Die bearbeitbaren Felder einer Belohnung. Reihenfolge, Archivierung und Zeitstempel pflegt das Repository. */
export type RewardDraft = Omit<Reward, 'id' | 'order' | 'createdAt' | 'archived'>
/** Die bearbeitbaren Felder einer Nebenquest. Erledigt wird sie über `completeSideQuest`/`reopenSideQuest`. */
export type SideQuestDraft = Omit<SideQuest, 'id' | 'order' | 'createdDay' | 'doneDay'>
/** Die bearbeitbaren Felder einer Rast (Ruhetag bzw. Urlaub, `from`/`until` inklusive). */
export type RestPeriodDraft = Omit<RestPeriod, 'id' | 'createdAt'>

/** Alle Messgrößen automatischer Kapitel – `satisfies` hält die Liste vollständig zu `ChapterMetric`. */
const HABIT_METRICS = { completions: true, total: true, streak: true, best: true } satisfies Record<ChapterMetric, true>

const MSG = {
  habitNotFound: 'Diese Quest gibt es nicht (mehr).',
  questNotFound: 'Diese Kampagne gibt es nicht (mehr).',
  chapterNotFound: 'Dieses Kapitel gibt es nicht (mehr).',
  blueprintRunning: 'Eine Kampagne aus dieser Vorlage läuft bereits. Schließe sie ab oder beende sie zuerst.',
  rewardNotFound: 'Diese Belohnung gibt es nicht (mehr).',
  rewardUnavailable: 'Diese Belohnung ist nicht mehr verfügbar.',
  rewardAlreadyPurchased: 'Diese Belohnung hast du schon eingelöst.',
  rewardPrice: `Der Preis muss eine ganze Zahl zwischen 1 und ${MAX_REWARD_PRICE.toLocaleString('de-DE')} Gold sein.`,
  sideQuestNotFound: 'Diese Nebenquest gibt es nicht (mehr).',
  itemNotFound: 'Diesen Gegenstand gibt es nicht.',
  freezeStockFull: `Du hast schon ${BALANCING.items.streakFreeze.max} Streak-Schutz im Vorrat – mehr passen nicht in deinen Beutel.`,
  potionGentle: 'Im Sanften Modus gibt es keine Lebenspunkte – ein Heiltrank hätte nichts zu heilen.',
  potionFull: 'Deine Lebenspunkte sind schon voll – du brauchst gerade keinen Heiltrank.',
  itemUndoOtherDay: 'Gegenstände kannst du nur am Tag des Kaufs zurückgeben.',
  itemUndoFreezeUsed: 'Dieser Streak-Schutz ist schon im Einsatz und lässt sich nicht mehr zurückgeben.',
  itemUndoSettled: 'Dieser Tag ist schon abgerechnet – der Kauf lässt sich nicht mehr zurückgeben.',
  restNotFound: 'Diese Rast gibt es nicht (mehr).',
  restOrder: 'Eine Rast kann nicht enden, bevor sie beginnt.',
  restTooLong: `Eine Rast dauert höchstens ${MAX_REST_PERIOD_DAYS} Tage am Stück.`,
  restOver: 'Diese Rast ist schon vorbei – vergangene Rasttage bleiben erhalten.',
  noHero: 'Es gibt noch keinen Helden – beginne zuerst dein Abenteuer.',
  unknownForm: 'Diese Sprachform gibt es nicht.',
  unknownTitle: 'Diesen Titel gibt es nicht.',
  unknownFrame: 'Diesen Rahmen gibt es nicht.',
  invalidAchievement: 'Ungültiger Erfolg.',
  invalidVictory: 'Ungültiger Boss-Sieg.',
  invalidChest: 'Ungültige Truhe.',
  chestNotFound: 'Diese Truhe gibt es nicht (mehr).',
  chestOpened: 'Diese Truhe hast du schon geöffnet.',
} as const

/** Meldung, wenn das Gold für eine Belohnung nicht reicht, z. B. "Dafür fehlen dir noch 150 Gold." */
export function missingGoldMessage(missing: number): string {
  return `Dafür fehlen dir noch ${missing.toLocaleString('de-DE')} Gold.`
}

// ---------------------------------------------------------------------------
// Laden
// ---------------------------------------------------------------------------

/**
 * Lädt alle gespeicherten Daten in einer Lese-Transaktion (konsistenter Schnappschuss).
 * - `settings` = `DEFAULT_SETTINGS` überschrieben mit den gespeicherten (gültigen) Werten
 * - `profile` fehlt, solange das Onboarding nicht abgeschlossen ist
 * - `habits` nach `order` sortiert (bei Gleichstand nach Titel), `mainQuests` nach `createdAt`
 * - `deletedHabits` (Grabsteine gelöschter Quests) geprüft und normalisiert; fehlt, wenn es keine gibt
 * - Phase 2a: `rewards` nach `order`, `purchases` nach `createdAt`, `sideQuests` nach `order`,
 *   `achievementUnlocks` nach Tag – jeweils nur, wenn es welche gibt (fehlt = keine)
 * - Phase 2b: `hpLedger` nach Tag, `restPeriods` nach `from` (dann `until`, Anlagezeit) – ebenso nur, wenn es
 *   welche gibt. `settings.penalties` fehlt, solange nie etwas gespeichert wurde: Das heißt „Lebenspunkte an,
 *   noch nie abgerechnet“ (`penaltiesEnabled` aus `domain/hp.ts`); `since` setzt erst `settleHpDays`.
 * - Phase 3a: `bossVictories` nach Woche, `chests` nach Fundtag (dann ID), `cosmeticUnlocks` nach Tag (dann ID) –
 *   ebenso nur, wenn es welche gibt; `settings.combatIntroSeen` geprüft übernommen.
 */
export async function loadGameData(database: QuestlogDB = db): Promise<GameData> {
  return database.transaction('r', allTables(database), async () => {
    const [
      habits,
      completions,
      mainQuests,
      profileEntry,
      settingsEntry,
      deletedEntry,
      rewards,
      purchases,
      sideQuests,
      achievementUnlocks,
      hpLedger,
      restPeriods,
      bossVictories,
      chests,
      cosmeticUnlocks,
    ] = await Promise.all([
      database.habits.toArray(),
      database.completions.toArray(),
      database.mainQuests.toArray(),
      database.kv.get(KV_KEYS.profile),
      database.kv.get(KV_KEYS.settings),
      database.kv.get(KV_KEYS.deletedHabits),
      database.rewards.toArray(),
      database.purchases.toArray(),
      database.sideQuests.toArray(),
      database.achievementUnlocks.toArray(),
      database.hpLedger.toArray(),
      database.restPeriods.toArray(),
      database.bossVictories.toArray(),
      database.chests.toArray(),
      database.cosmeticUnlocks.toArray(),
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
    if (rewards.length > 0) data.rewards = rewards.sort(compareRewardOrder)
    if (purchases.length > 0) data.purchases = purchases.sort(comparePurchases)
    if (sideQuests.length > 0) data.sideQuests = sideQuests.sort(compareSideQuestOrder)
    if (achievementUnlocks.length > 0) data.achievementUnlocks = achievementUnlocks.sort(compareUnlocks)
    if (hpLedger.length > 0) data.hpLedger = hpLedger.sort((a, b) => compareDays(a.day, b.day))
    if (restPeriods.length > 0) data.restPeriods = restPeriods.sort(compareRestPeriods)
    if (bossVictories.length > 0) data.bossVictories = bossVictories.sort((a, b) => compareDays(a.weekStart, b.weekStart))
    if (chests.length > 0) data.chests = chests.sort(compareChests)
    if (cosmeticUnlocks.length > 0) data.cosmeticUnlocks = cosmeticUnlocks.sort(compareUnlocks)
    return data
  })
}

// ---------------------------------------------------------------------------
// Profil & Einstellungen
// ---------------------------------------------------------------------------

/**
 * Speichert (bzw. ersetzt) das Charakterprofil. Der Name darf nicht leer sein (getrimmt), ohne Avatar gilt 🧙.
 *
 * Phase 3a – Sprachform (`form`), gewählter Titel (`titleId`) und Rahmen (`frameId`):
 * - Fehlt eines dieser Felder im übergebenen Objekt, **bleibt** das gespeicherte (so ändert „Held bearbeiten“ mit
 *   Name und Avatar nichts an Titel, Rahmen oder Sprachform). Steht es explizit mit `undefined` (oder `''` bei Titel
 *   und Rahmen) da, wird es entfernt.
 * - Geprüft wird nur, was übergeben wird: `form` muss `'female' | 'male' | 'neutral'` sein („Diese Sprachform gibt es
 *   nicht.“), `titleId`/`frameId` ein bekannter Titel bzw. Rahmen („Diesen Titel gibt es nicht.“ …). Ob er
 *   freigeschaltet ist, entscheidet die Anzeige (`activeTitle`/`activeFrame`: gesperrte werden nicht gezeigt).
 * - Helden-Seed (`heroSeed`): Benennt sich derselbe Held (gleicher `createdDay`) um, bleibt sein bisheriger Seed
 *   festgehalten – Boss der Woche, Schwäche und offene Truhen-Funde bleiben, wie sie sind (`pinnedHeroSeed`).
 * Für einzelne Änderungen (z. B. nur den Titel) ist `updateProfile` bequemer.
 */
export async function saveProfile(profile: CharacterProfile, database: QuestlogDB = db): Promise<void> {
  await writeProfile(database, (stored) => cleanProfile(profile, profile, stored))
}

/**
 * Ändert einzelne Felder des gespeicherten Profils – z. B. `updateProfile({ titleId: 'daring' })` oder
 * `updateProfile({ frameId: undefined })` (Rahmen ablegen). Felder, die im Patch fehlen, bleiben; sonst gelten
 * dieselben Regeln und Prüfungen wie bei `saveProfile`. Ohne gespeicherten Helden: Fehler.
 */
export async function updateProfile(patch: Partial<CharacterProfile>, database: QuestlogDB = db): Promise<void> {
  await writeProfile(database, (stored) => {
    if (stored === undefined) throw new Error(MSG.noHero)
    return cleanProfile({ ...stored, ...patch }, patch, stored)
  })
}

/** Lesen → bereinigen → schreiben des Profils in einer Transaktion (`stored` = gespeichertes Profil, falls vorhanden). */
async function writeProfile(
  database: QuestlogDB,
  next: (stored: CharacterProfile | undefined) => CharacterProfile,
): Promise<void> {
  await database.transaction('rw', database.kv, async () => {
    const entry = await database.kv.get(KV_KEYS.profile)
    const stored = isRecord(entry?.value) ? (entry.value as unknown as CharacterProfile) : undefined
    await database.kv.put({ key: KV_KEYS.profile, value: next(stored) })
  })
}

/**
 * Geprüftes, normalisiertes Profil: Name, Avatar und Starttag aus `input`; Sprachform, Titel und Rahmen aus `choices`,
 * sofern sie dort (auch als `undefined`) stehen – sonst die gespeicherten aus `stored` (siehe `saveProfile`).
 */
function cleanProfile(
  input: CharacterProfile,
  choices: Partial<CharacterProfile>,
  stored: CharacterProfile | undefined,
): CharacterProfile {
  const name = requireText(input.name, 'Bitte gib deinem Helden einen Namen.')
  assertDayKey(input.createdDay, 'Startdatum')
  const clean: CharacterProfile = {
    name,
    avatar: optionalText(input.avatar) ?? DEFAULT_AVATAR,
    createdDay: input.createdDay,
  }
  const form = Object.hasOwn(choices, 'form') ? normalizeForm(choices.form) : storedForm(stored?.form)
  if (form !== undefined) clean.form = form
  const titleId = Object.hasOwn(choices, 'titleId')
    ? normalizeCosmeticId(choices.titleId, TITLES, MSG.unknownTitle)
    : optionalId(stored?.titleId)
  if (titleId !== undefined) clean.titleId = titleId
  const frameId = Object.hasOwn(choices, 'frameId')
    ? normalizeCosmeticId(choices.frameId, FRAMES, MSG.unknownFrame)
    : optionalId(stored?.frameId)
  if (frameId !== undefined) clean.frameId = frameId
  const heroSeed = pinnedHeroSeed(clean, stored)
  if (heroSeed !== undefined) clean.heroSeed = heroSeed
  return clean
}

/**
 * Helden-Seed (`CharacterProfile.heroSeed`, Phase 3a): Grundlage von Boss-Wahl, Schwäche und Truhen ist
 * `createdDay + name` – benennt sich **derselbe** Held (gleicher Anlegetag) um, bleibt der bisherige Seed festgehalten,
 * damit ein neuer Name nichts neu auswürfelt. Gespeichert wird er nur, solange er vom abgeleiteten abweicht (heißt der
 * Held wieder wie früher, fällt das Feld weg). Ein neuer Held (anderer Anlegetag) bekommt keinen. Von außen (Patch,
 * Eingabe) lässt er sich nicht setzen – nur das Backup stellt ihn wieder her.
 */
function pinnedHeroSeed(clean: CharacterProfile, stored: CharacterProfile | undefined): string | undefined {
  if (stored === undefined || stored.createdDay !== clean.createdDay) return undefined
  const seed = heroSeedOf(stored)
  return seed !== heroSeedOf({ createdDay: clean.createdDay, name: clean.name }) ? seed : undefined
}

function isGrammaticalForm(value: unknown): value is GrammaticalForm {
  return typeof value === 'string' && Object.hasOwn(GRAMMATICAL_FORM_SET, value)
}

/** Übergebene Sprachform: `undefined` entfernt sie, sonst muss sie gültig sein. */
function normalizeForm(value: unknown): GrammaticalForm | undefined {
  if (value === undefined) return undefined
  if (!isGrammaticalForm(value)) throw new Error(MSG.unknownForm)
  return value
}

/** Gespeicherte Sprachform – ungültige fallen weg (gilt dann als neutral). */
function storedForm(value: unknown): GrammaticalForm | undefined {
  return isGrammaticalForm(value) ? value : undefined
}

/**
 * Übergebener Titel bzw. Rahmen: `undefined`/`''` entfernt ihn, sonst muss es ihn geben. (Gespeicherte, inzwischen
 * unbekannte IDs bleiben beim Speichern anderer Felder erhalten – die Anzeige ignoriert sie.)
 */
function normalizeCosmeticId(value: unknown, known: readonly { id: string }[], message: string): string | undefined {
  if (value === undefined || value === '') return undefined
  if (typeof value !== 'string' || !known.some((definition) => definition.id === value)) throw new Error(message)
  return value
}

/**
 * Ändert einzelne Einstellungen. Gespeichert werden nur explizit gesetzte Werte –
 * nicht gesetzte fallen beim Laden auf `DEFAULT_SETTINGS` zurück.
 * `dayStartHour` wird auf eine ganze Stunde zwischen 0 und 12 begrenzt.
 *
 * Phase 2b: `hpIntroSeen` wird übernommen; von `penalties` nur `enabled` – `since` bleibt immer, wie es ist (nie
 * rückwirkend abrechnen). Zum Umschalten der Lebenspunkte besser `setPenaltiesEnabled` (mit Spieltag) verwenden.
 * Phase 3a: `combatIntroSeen` wird übernommen.
 */
export async function updateSettings(patch: Partial<Settings>, database: QuestlogDB = db): Promise<void> {
  const changes: Partial<Settings> = {}
  if (patch.dayStartHour !== undefined) {
    if (!Number.isFinite(patch.dayStartHour)) throw new Error('Ungültige Uhrzeit für den Tageswechsel.')
    changes.dayStartHour = clamp(Math.round(patch.dayStartHour), 0, 12)
  }
  if (patch.effects !== undefined) changes.effects = Boolean(patch.effects)
  if (patch.hpIntroSeen !== undefined) changes.hpIntroSeen = Boolean(patch.hpIntroSeen)
  if (patch.combatIntroSeen !== undefined) changes.combatIntroSeen = Boolean(patch.combatIntroSeen)
  const penalties = patch.penalties

  await updateStoredSettings(database, (stored) =>
    penalties === undefined || penalties === null
      ? changes
      : { ...changes, penalties: withPenaltiesEnabled(stored.penalties, Boolean(penalties.enabled)) },
  )
}

/**
 * Lesen → ändern → schreiben der gespeicherten Einstellungen in einer Transaktion. `change` bekommt die gültigen
 * gespeicherten Werte (ohne Standardwerte) und liefert die zu überschreibenden.
 */
async function updateStoredSettings(
  database: QuestlogDB,
  change: (stored: Partial<Settings>) => Partial<Settings>,
): Promise<Partial<Settings>> {
  return database.transaction('rw', database.kv, async () => {
    const entry = await database.kv.get(KV_KEYS.settings)
    const stored = pickValidSettings(entry?.value)
    const next = { ...stored, ...change(stored) }
    await database.kv.put({ key: KV_KEYS.settings, value: next })
    return next
  })
}

/** Lebenspunkte an/aus mit unverändertem `since` (fehlt es, bleibt es weg – außer `since` wird übergeben). */
function withPenaltiesEnabled(
  current: Settings['penalties'],
  enabled: boolean,
  sinceIfUnset?: DayKey,
): NonNullable<Settings['penalties']> {
  const penalties: NonNullable<Settings['penalties']> = { enabled }
  const since = current?.since ?? sinceIfUnset
  if (since !== undefined) penalties.since = since
  return penalties
}

// ---------------------------------------------------------------------------
// Lebenspunkte (Phase 2b)
// ---------------------------------------------------------------------------

/**
 * Rechnet alle Tage ab, die nicht mehr nachgetragen werden können (bis `today − backfillDays − 1`), und hängt sie
 * an das Ledger an – alles in **einer** Transaktion (`settleDays` aus `domain/hp.ts`):
 * - Fehlt `settings.penalties.since`, wird es auf `today` gesetzt – abgerechnet wird nie rückwirkend (auch nicht
 *   nach dem Update auf Phase 2b). `enabled` bleibt dabei, wie es ist (Standard: an).
 * - Gespeicherte Einträge ändern sich nie; es kommen nur neue Tage dazu.
 * - Idempotent: Ein zweiter Aufruf (auch gleichzeitig, auch aus einem anderen Tab – die Transaktionen laufen
 *   nacheinander) findet nichts Neues und liefert `[]`.
 * - Ohne Held (vor dem Onboarding) passiert nichts.
 * @returns die neu abgerechneten Einträge (chronologisch) – z. B. für eine Meldung über eine Niederlage.
 */
export async function settleHpDays(today: DayKey, database: QuestlogDB = db): Promise<HpLedgerEntry[]> {
  assertDayKey(today)
  return database.transaction('rw', allTables(database), async () => {
    const data = await loadGameData(database)
    if (data.profile === undefined) return []
    let settings = data.settings
    if (settings.penalties?.since === undefined) {
      const stored = await updateStoredSettings(database, (current) => ({
        penalties: withPenaltiesEnabled(current.penalties, current.penalties?.enabled ?? true, today),
      }))
      settings = { ...settings, penalties: stored.penalties }
    }
    const entries = settleDays({ ...data, settings }, today)
    if (entries.length > 0) await database.hpLedger.bulkAdd(entries)
    return entries
  })
}

/**
 * Schaltet die Lebenspunkte am Spieltag `today` an oder aus (aus = Sanfter Modus: keine HP, kein Schaden, keine
 * Niederlage; Streak-Schutz wirkt weiter). `since` bleibt; fehlt es noch, setzt das Einschalten es auf `today`.
 * Nach einer Zeit im Sanften Modus starten die HP beim nächsten abgerechneten Tag wieder voll (`settleDays`).
 */
export async function setPenaltiesEnabled(enabled: boolean, today: DayKey, database: QuestlogDB = db): Promise<void> {
  assertDayKey(today)
  const on = enabled === true
  await updateStoredSettings(database, (stored) => ({
    penalties: withPenaltiesEnabled(stored.penalties, on, on ? today : undefined),
  }))
}

/** Merkt sich, dass die Einführung „Neu: Lebenspunkte“ gesehen wurde (`settings.hpIntroSeen`). */
export async function markHpIntroSeen(database: QuestlogDB = db): Promise<void> {
  await updateStoredSettings(database, () => ({ hpIntroSeen: true }))
}

/** Merkt sich, dass die Einführung „Neu: Klassen, Bosse & Beute“ gesehen wurde (`settings.combatIntroSeen`, Phase 3a). */
export async function markCombatIntroSeen(database: QuestlogDB = db): Promise<void> {
  await updateStoredSettings(database, () => ({ combatIntroSeen: true }))
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
  await mutateHabit(database, id, (habit) => archivedHabit(habit, today))
}

/** Die Quest nach dem Archivieren am Tag `today` (siehe `archiveHabit`); unverändert → dasselbe Objekt. */
function archivedHabit(habit: Habit, today: DayKey): Habit {
  return isArchivedOn(habit, today) ? habit : { ...habit, archivedDay: today }
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
  await mutateHabit(database, id, (habit) => restoredHabit(habit, today))
}

/** Die Quest nach dem Zurückholen am Tag `today` (siehe `restoreHabit`); nicht archiviert → dasselbe Objekt. */
function restoredHabit(habit: Habit, today: DayKey): Habit {
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
    const changed = swapOrder(all, all.filter((habit) => !isArchivedOn(habit, today)), id, direction)
    if (changed.length > 0) await database.habits.bulkPut(changed)
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

/**
 * Legt eine Kampagne an. Kapitel ohne (oder mit doppelter) ID bekommen eine neue.
 *
 * Wirft `CAMPAIGN_LIMIT_MESSAGE`, wenn schon `BALANCING.maxActiveCampaigns` Kampagnen aktiv sind und die neue
 * ebenfalls aktiv wäre (nicht archiviert, nicht abgeschlossen). Maßgeblich ist der Spieltag laut Uhr und
 * gespeichertem Tageswechsel (wie `useToday`).
 */
export async function createMainQuest(draft: MainQuestDraft, database: QuestlogDB = db): Promise<MainQuest> {
  const clean = normalizeMainQuestDraft(draft)
  return database.transaction('rw', allTables(database), async () => {
    const quest: MainQuest = { id: newId(), ...clean, createdAt: Date.now() }
    const data = await loadGameData(database)
    const today = toDayKey(new Date(), data.settings.dayStartHour)
    assertCampaignCanBeActive({ ...data, mainQuests: [...data.mainQuests, quest] }, quest.id, today, CAMPAIGN_LIMIT_MESSAGE)
    await database.mainQuests.add(quest)
    return quest
  })
}

/**
 * Ändert eine Kampagne. Pflichtfelder, die im Patch fehlen oder `undefined` sind, bleiben unverändert;
 * optionale Felder (`description`, `deadline`, `archived`, `blueprint`, `sharedHabitIds`), die explizit
 * `undefined` sind, werden entfernt. `chapters` ersetzt die komplette Kapitelliste. Herkunft (`blueprint`) und
 * geteilte Quests (`sharedHabitIds`) bleiben erhalten, solange der Patch sie nicht ausdrücklich enthält.
 *
 * Holt der Patch eine archivierte Kampagne zurück (`archived` → nicht mehr `true`), gelten dieselben Regeln wie
 * bei `restoreMainQuest` (Limit aktiver Kampagnen, dieselbe Vorlage nicht doppelt, Übernahme geteilter Quests);
 * archiviert er sie, werden geteilte Quests wie bei `archiveMainQuest` übergeben – jeweils ohne Quests zu
 * archivieren bzw. zurückzuholen, zum Spieltag laut Uhr.
 */
export async function updateMainQuest(
  id: string,
  patch: Partial<MainQuestDraft>,
  database: QuestlogDB = db,
): Promise<void> {
  await database.transaction('rw', allTables(database), async () => {
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
      blueprint: Object.hasOwn(patch, 'blueprint') ? patch.blueprint : existing.blueprint,
      sharedHabitIds: Object.hasOwn(patch, 'sharedHabitIds') ? patch.sharedHabitIds : existing.sharedHabitIds,
    }
    const next: MainQuest = { id: existing.id, ...normalizeMainQuestDraft(merged), createdAt: existing.createdAt }
    const archiving = existing.archived !== true && next.archived === true
    const restoring = existing.archived === true && next.archived !== true
    if (!archiving && !restoring) {
      await database.mainQuests.put(next)
      return
    }
    // Beenden bzw. Zurückholen per Patch: dieselben Übergaben geteilter Quests wie archiveMainQuest/restoreMainQuest.
    const data = await loadGameData(database)
    const today = toDayKey(new Date(), data.settings.dayStartHour)
    const withNext: GameData = { ...data, mainQuests: data.mainQuests.map((quest) => (quest.id === id ? next : quest)) }
    const changes = archiving ? handOverSharedHabits(withNext, id, today) : adoptSharedHabits(withNext, id)
    const quests = new Map<string, MainQuest>([[id, next], ...changes.quests.map((quest) => [quest.id, quest] as const)])
    if (restoring) {
      const mainQuests = withNext.mainQuests.map((quest) => quests.get(quest.id) ?? quest)
      assertCampaignCanBeActive({ ...data, mainQuests }, id, today, CAMPAIGN_RESTORE_LIMIT_MESSAGE)
    }
    await database.mainQuests.bulkPut([...quests.values()])
    if (changes.habits.length > 0) await database.habits.bulkPut(changes.habits)
  })
}

/**
 * Beendet eine Kampagne am Spieltag `today`: Sie wird archiviert (zählt nicht mehr als aktiv, verdiente
 * Kapitel- und Kampagnen-XP bleiben). Bereits archiviert → bleibt archiviert.
 *
 * `archiveQuests: true` archiviert zusätzlich ihre Quests (`mainQuestId === id`) wie `archiveHabit` (ab
 * `today`; ein vorhandener Archivierungstag bleibt) – außer denen, die eine andere, nicht archivierte Kampagne
 * braucht (ein Kapitel zählt auf sie oder sie steht in deren `sharedHabitIds`): Geteilte Quests laufen dort
 * weiter. Vergangene Tage behalten so ihre XP, Perfekten Tage und Streaks.
 *
 * Übergabe (mit und ohne `archiveQuests`): Eine eigene Quest, die eine andere nicht archivierte Kampagne
 * mitbenutzt, geht an diese über (siehe `handOverSharedHabits`) – die beendete Kampagne führt sie danach in
 * ihren `sharedHabitIds`. So endet die Quest mit der letzten Kampagne, die sie nutzt, statt verwaist
 * weiterzulaufen, und kommt beim Zurückholen wieder mit.
 */
export async function archiveMainQuest(
  id: string,
  today: DayKey,
  options: { archiveQuests?: boolean } = {},
  database: QuestlogDB = db,
): Promise<void> {
  assertDayKey(today)
  await database.transaction('rw', allTables(database), async () => {
    const quest = await requireMainQuest(database, id)
    const data = await loadGameData(database)
    const archived: MainQuest = quest.archived === true ? quest : { ...quest, archived: true }
    const next: GameData = { ...data, mainQuests: data.mainQuests.map((candidate) => (candidate.id === id ? archived : candidate)) }

    const handover = handOverSharedHabits(next, id, today)
    const quests = new Map(handover.quests.map((changed) => [changed.id, changed]))
    if (archived !== quest && !quests.has(id)) quests.set(id, archived)
    const habits = new Map(handover.habits.map((changed) => [changed.id, changed]))
    if (options.archiveQuests === true) {
      // Übergebene Quests braucht eine andere Kampagne – sie laufen weiter.
      for (const habit of data.habits) {
        if (habit.mainQuestId !== id || habits.has(habit.id)) continue
        const nextHabit = archivedHabit(habit, today)
        if (nextHabit !== habit) habits.set(habit.id, nextHabit)
      }
    }

    if (quests.size > 0) await database.mainQuests.bulkPut([...quests.values()])
    if (habits.size > 0) await database.habits.bulkPut([...habits.values()])
  })
}

/**
 * Holt eine archivierte Kampagne am Spieltag `today` zurück. Nicht archiviert → keine Änderung.
 *
 * Wäre sie danach aktiv (nicht abgeschlossen), gilt das Limit: Sind schon `BALANCING.maxActiveCampaigns`
 * andere Kampagnen aktiv, wirft die Funktion (`CAMPAIGN_RESTORE_LIMIT_MESSAGE`); ebenso, wenn schon eine
 * aktive Kampagne aus derselben Vorlage läuft. Eine abgeschlossene Kampagne kann immer zurückgeholt werden.
 *
 * Quests, die sie mitbenutzt und deren Kampagne archiviert ist, übernimmt sie wieder (siehe
 * `adoptSharedHabits`) – z. B. eine geteilte Quest, die beim Beenden an eine andere Kampagne übergeben und mit
 * dieser beendet wurde. Quests einer nicht archivierten Kampagne bleiben dort.
 *
 * `restoreQuests: true` holt zusätzlich ihre archivierten Quests (`mainQuestId === id`, inklusive der wieder
 * übernommenen) wie `restoreHabit` zurück: Die archivierte Zeit wird zur Pause, vergangene XP, Perfekte Tage und
 * Streaks bleiben.
 */
export async function restoreMainQuest(
  id: string,
  today: DayKey,
  options: { restoreQuests?: boolean } = {},
  database: QuestlogDB = db,
): Promise<void> {
  assertDayKey(today)
  await database.transaction('rw', allTables(database), async () => {
    const quest = await requireMainQuest(database, id)
    if (quest.archived !== true) return
    const restored: MainQuest = { ...quest }
    delete restored.archived

    const data = await loadGameData(database)
    const withRestored: GameData = {
      ...data,
      mainQuests: data.mainQuests.map((candidate) => (candidate.id === id ? restored : candidate)),
    }
    const adoption = adoptSharedHabits(withRestored, id)
    const quests = new Map<string, MainQuest>([[id, restored], ...adoption.quests.map((changed) => [changed.id, changed] as const)])
    const habits = new Map(adoption.habits.map((changed) => [changed.id, changed]))
    if (options.restoreQuests === true) {
      for (const habit of data.habits) {
        const current = habits.get(habit.id) ?? habit
        if (current.mainQuestId !== id) continue
        const nextHabit = restoredHabit(current, today)
        if (nextHabit !== habit) habits.set(habit.id, nextHabit)
      }
    }
    const next: GameData = {
      ...data,
      habits: data.habits.map((habit) => habits.get(habit.id) ?? habit),
      mainQuests: data.mainQuests.map((candidate) => quests.get(candidate.id) ?? candidate),
    }
    assertCampaignCanBeActive(next, id, today, CAMPAIGN_RESTORE_LIMIT_MESSAGE)

    await database.mainQuests.bulkPut([...quests.values()])
    if (habits.size > 0) await database.habits.bulkPut([...habits.values()])
  })
}

/** IDs der Quests, auf die Kapitel einer Kampagne zählen. */
function chapterHabitIds(quest: MainQuest): string[] {
  return quest.chapters.flatMap((chapter) => (chapter.criterion.type === 'habit' ? [chapter.criterion.habitId] : []))
}

/** Nutzt die Kampagne die Quest mit – zählt ein Kapitel auf sie oder steht sie in `sharedHabitIds`? */
function usesHabit(quest: MainQuest, habitId: string): boolean {
  return (quest.sharedHabitIds ?? []).includes(habitId) || chapterHabitIds(quest).includes(habitId)
}

/** Die Kampagne mit geänderten `sharedHabitIds` (`add` angehängt, `remove` entfernt; leer → Feld entfällt). */
function withSharedHabits(quest: MainQuest, add: readonly string[], remove: readonly string[]): MainQuest {
  const removed = new Set(remove)
  const ids = [...new Set([...(quest.sharedHabitIds ?? []).filter((habitId) => !removed.has(habitId)), ...add])]
  const next: MainQuest = { ...quest }
  if (ids.length > 0) next.sharedHabitIds = ids
  else delete next.sharedHabitIds
  return next
}

/** Geänderte Quests und Kampagnen einer Übergabe (nur die tatsächlich geänderten, jeweils der Endstand). */
interface OwnershipChanges {
  habits: Habit[]
  quests: MainQuest[]
}

/**
 * Kampagne `fromId` gibt ihre Quests ab, weil sie archiviert oder gelöscht wird (in `next` schon archiviert
 * bzw. entfernt). Jede ihrer Quests (`mainQuestId === fromId`), die eine andere **nicht archivierte** Kampagne
 * mitbenutzt (Kapitel-Verweis oder `sharedHabitIds`), geht an diese über – an eine aktive vor einer
 * abgeschlossenen, sonst an die erste in gespeicherter Reihenfolge. Bei ihr fällt die Quest aus
 * `sharedHabitIds`; die abgebende Kampagne führt sie (falls es sie noch gibt) dort weiter.
 *
 * Dieselbe Regel wie beim Installieren: Eine Quest gehört einer laufenden Kampagne, die sie nutzt. Sonst liefe
 * sie nach dem Beenden der letzten Kampagne, die sie nutzt, verwaist weiter (als Pflicht-Quest ohne Kampagne).
 */
function handOverSharedHabits(next: GameData, fromId: string, today: DayKey): OwnershipChanges {
  const states = evaluateMainQuests(next, today).filter((state) => state.quest.id !== fromId && state.quest.archived !== true)
  // Aktive zuerst, sonst gespeicherte Reihenfolge (sort ist stabil).
  const candidates = states.sort((a, b) => Number(isCampaignActive(b)) - Number(isCampaignActive(a))).map((state) => state.quest)
  const quests = new Map(next.mainQuests.map((quest) => [quest.id, quest]))
  const changedQuests = new Map<string, MainQuest>()
  const habits: Habit[] = []
  for (const habit of next.habits) {
    if (habit.mainQuestId !== fromId) continue
    const target = candidates.find((candidate) => usesHabit(candidate, habit.id))
    if (target === undefined) continue
    habits.push({ ...habit, mainQuestId: target.id })
    const current = changedQuests.get(target.id) ?? target
    changedQuests.set(target.id, withSharedHabits(current, [], [habit.id]))
    const from = changedQuests.get(fromId) ?? quests.get(fromId)
    if (from !== undefined) changedQuests.set(fromId, withSharedHabits(from, [habit.id], []))
  }
  return { habits, quests: [...changedQuests.values()] }
}

/**
 * Kampagne `toId` läuft wieder (in `next` schon nicht archiviert): Sie übernimmt die Quests, die sie mitbenutzt
 * und deren Kampagne archiviert ist – und Quests ohne (existierende) Kampagne, die in ihren `sharedHabitIds`
 * stehen. Bei ihr fallen sie aus `sharedHabitIds`, die bisherige Kampagne führt sie dort weiter. Quests einer
 * nicht archivierten Kampagne bleiben dort (sie werden weiter geteilt). Gegenstück zu `handOverSharedHabits`.
 */
function adoptSharedHabits(next: GameData, toId: string): OwnershipChanges {
  const quests = new Map(next.mainQuests.map((quest) => [quest.id, quest]))
  const target = quests.get(toId)
  if (target === undefined) return { habits: [], quests: [] }
  const changedQuests = new Map<string, MainQuest>()
  const habits: Habit[] = []
  for (const habit of next.habits) {
    if (habit.mainQuestId === toId || !usesHabit(target, habit.id)) continue
    const owner = habit.mainQuestId === undefined ? undefined : quests.get(habit.mainQuestId)
    if (owner !== undefined && owner.archived !== true) continue
    if (owner === undefined && !(target.sharedHabitIds ?? []).includes(habit.id)) continue
    habits.push({ ...habit, mainQuestId: toId })
    changedQuests.set(toId, withSharedHabits(changedQuests.get(toId) ?? target, [], [habit.id]))
    if (owner !== undefined) changedQuests.set(owner.id, withSharedHabits(changedQuests.get(owner.id) ?? owner, [habit.id], []))
  }
  return { habits, quests: [...changedQuests.values()] }
}

/**
 * Prüft für den Datenstand `next` (in dem die Kampagne `questId` schon geändert bzw. enthalten ist), ob sie so
 * sein darf: Ist sie aktiv (nicht archiviert, nicht abgeschlossen), dürfen höchstens
 * `BALANCING.maxActiveCampaigns − 1` **andere** Kampagnen aktiv sein (sonst `limitMessage`), und keine andere
 * aktive Kampagne darf aus derselben Vorlage stammen.
 */
function assertCampaignCanBeActive(next: GameData, questId: string, today: DayKey, limitMessage: string): void {
  const states = evaluateMainQuests(next, today)
  const own = states.find((state) => state.quest.id === questId)
  if (own === undefined || !isCampaignActive(own)) return
  const others = states.filter((state) => state.quest.id !== questId && isCampaignActive(state))
  const blueprintId = own.quest.blueprint?.id
  if (blueprintId !== undefined && others.some((state) => state.quest.blueprint?.id === blueprintId)) {
    throw new Error(MSG.blueprintRunning)
  }
  if (others.length >= BALANCING.maxActiveCampaigns) throw new Error(limitMessage)
}

/**
 * Löscht eine Kampagne. Verknüpfte Quests bleiben bestehen, verlieren aber ihre `mainQuestId` – außer denen,
 * die eine andere nicht archivierte Kampagne mitbenutzt: Die gehen an diese über (wie beim Beenden, siehe
 * `handOverSharedHabits`; aktiv/abgeschlossen zum Spieltag laut Uhr und gespeichertem Tageswechsel).
 */
export async function deleteMainQuest(id: string, database: QuestlogDB = db): Promise<void> {
  await database.transaction('rw', allTables(database), async () => {
    const data = await loadGameData(database)
    const today = toDayKey(new Date(), data.settings.dayStartHour)
    const next: GameData = { ...data, mainQuests: data.mainQuests.filter((quest) => quest.id !== id) }
    const handover = handOverSharedHabits(next, id, today)
    const handedOver = new Set(handover.habits.map((habit) => habit.id))
    const freed = data.habits.flatMap((habit) => {
      if (habit.mainQuestId !== id || handedOver.has(habit.id)) return []
      const unlinked: Habit = { ...habit }
      delete unlinked.mainQuestId
      return [unlinked]
    })
    await database.mainQuests.delete(id)
    if (handover.quests.length > 0) await database.mainQuests.bulkPut(handover.quests)
    const habits = [...handover.habits, ...freed]
    if (habits.length > 0) await database.habits.bulkPut(habits)
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
// Schatzkammer: Belohnungen & Einlösungen
// ---------------------------------------------------------------------------

/**
 * Legt eine Belohnung an. Sie wird ans Ende der Liste gestellt (`order` = max + 1).
 * Der Titel ist Pflicht, der Preis eine ganze Zahl von 1 bis `MAX_REWARD_PRICE` Gold.
 */
export async function createReward(draft: RewardDraft, database: QuestlogDB = db): Promise<Reward> {
  const clean = normalizeRewardDraft(draft)
  return database.transaction('rw', database.rewards, async () => {
    const last = await database.rewards.orderBy('order').last()
    const reward: Reward = { id: newId(), ...clean, order: last ? last.order + 1 : 0, createdAt: Date.now() }
    await database.rewards.add(reward)
    return reward
  })
}

/**
 * Ändert eine Belohnung. Pflichtfelder, die im Patch fehlen oder `undefined` sind, bleiben unverändert;
 * `description` wird entfernt, wenn der Patch sie explizit mit `undefined` (oder leer) enthält. Reihenfolge,
 * Archivierung und Anlagezeit bleiben. Bisherige Einlösungen behalten ihre Momentaufnahme (Titel, Icon, Preis).
 */
export async function updateReward(id: string, patch: Partial<RewardDraft>, database: QuestlogDB = db): Promise<void> {
  await database.transaction('rw', database.rewards, async () => {
    const existing = await requireReward(database, id)
    const merged: RewardDraft = {
      title: patch.title ?? existing.title,
      icon: patch.icon ?? existing.icon,
      price: patch.price ?? existing.price,
      repeatable: patch.repeatable ?? existing.repeatable,
      description: Object.hasOwn(patch, 'description') ? patch.description : existing.description,
    }
    const next: Reward = {
      id: existing.id,
      ...normalizeRewardDraft(merged),
      order: existing.order,
      createdAt: existing.createdAt,
    }
    if (existing.archived === true) next.archived = true
    await database.rewards.put(next)
  })
}

/** Blendet eine Belohnung aus (nicht mehr einlösbar); ihre Einlösungen bleiben in der Chronik. */
export async function archiveReward(id: string, database: QuestlogDB = db): Promise<void> {
  await mutateReward(database, id, (reward) => (reward.archived === true ? reward : { ...reward, archived: true }))
}

/** Macht eine ausgeblendete Belohnung wieder einlösbar (an ihrem bisherigen Platz). */
export async function restoreReward(id: string, database: QuestlogDB = db): Promise<void> {
  await mutateReward(database, id, (reward) => {
    if (reward.archived === undefined) return reward
    const next: Reward = { ...reward }
    delete next.archived
    return next
  })
}

/**
 * Löscht eine Belohnung endgültig – aber nur, wenn sie nie eingelöst wurde. Mit Einlösungen wird sie
 * stattdessen ausgeblendet (wie `archiveReward`): Die Chronik verweist auf sie, und eine einmalige Belohnung
 * bliebe sonst nicht „eingelöst“.
 * @returns `'deleted'` bzw. `'archived'` – für die Rückmeldung in der UI. Eine unbekannte Belohnung ändert
 * nichts (`'deleted'`).
 */
export async function deleteReward(id: string, database: QuestlogDB = db): Promise<'deleted' | 'archived'> {
  return database.transaction('rw', database.rewards, database.purchases, async () => {
    const reward = await database.rewards.get(id)
    if (!reward) return 'deleted'
    const purchased = (await database.purchases.filter((purchase) => purchase.rewardId === id).count()) > 0
    if (!purchased) {
      await database.rewards.delete(id)
      return 'deleted'
    }
    if (reward.archived !== true) await database.rewards.put({ ...reward, archived: true })
    return 'archived'
  })
}

/**
 * Verschiebt eine (nicht ausgeblendete) Belohnung um eine Position nach oben/unten – Tausch des `order` mit dem
 * Nachbarn unter den nicht ausgeblendeten (wie `moveHabit`). Am Rand, bei ausgeblendeten oder unbekannten
 * Belohnungen passiert nichts.
 */
export async function moveReward(id: string, direction: 'up' | 'down', database: QuestlogDB = db): Promise<void> {
  await database.transaction('rw', database.rewards, async () => {
    const all = (await database.rewards.toArray()).sort(compareRewardOrder)
    const changed = swapOrder(all, all.filter((reward) => reward.archived !== true), id, direction)
    if (changed.length > 0) await database.rewards.bulkPut(changed)
  })
}

/**
 * Löst eine Belohnung am Spieltag `today` ein (Gold-Ausgabe). Alles in **einer** Transaktion – geprüft wird:
 * - ausgeblendet → „Diese Belohnung ist nicht mehr verfügbar.“
 * - einmalig und schon eingelöst → „Diese Belohnung hast du schon eingelöst.“
 * - Guthaben `deriveGameState(loadGameData(), today).gold.balance` kleiner als der Preis →
 *   „Dafür fehlen dir noch N Gold.“ (`missingGoldMessage`)
 * Die Einlösung hält Titel, Icon und Preis als Momentaufnahme fest.
 */
export async function purchaseReward(rewardId: string, today: DayKey, database: QuestlogDB = db): Promise<Purchase> {
  assertDayKey(today)
  return database.transaction('rw', allTables(database), async () => {
    const reward = await requireReward(database, rewardId)
    if (reward.archived === true) throw new Error(MSG.rewardUnavailable)
    const data = await loadGameData(database)
    if (!reward.repeatable && (data.purchases ?? []).some((purchase) => purchase.rewardId === reward.id)) {
      throw new Error(MSG.rewardAlreadyPurchased)
    }
    const balance = deriveGameState(data, today).gold.balance
    if (balance < reward.price) throw new Error(missingGoldMessage(reward.price - balance))
    const purchase: Purchase = {
      id: newId(),
      kind: 'reward',
      rewardId: reward.id,
      title: reward.title,
      icon: reward.icon,
      price: reward.price,
      day: today,
      createdAt: Date.now(),
    }
    await database.purchases.add(purchase)
    return purchase
  })
}

/**
 * Macht eine Einlösung rückgängig (z. B. versehentlich getippt): Sie verschwindet aus der Chronik, das Gold ist
 * wieder da, eine einmalige Belohnung ist wieder einlösbar. Eine unbekannte (schon rückgängig gemachte)
 * Einlösung ändert nichts.
 *
 * Gegenstände (Phase 2b) nur am Kauftag `today` und nur, solange sie nicht verbraucht bzw. abgerechnet sind
 * (`canUndoItemPurchase` aus `domain/hp.ts`) – sonst ein Fehler, nichts wird geändert. `today` sollte übergeben
 * werden; fehlt er, gilt der Spieltag laut Uhr und gespeichertem Tageswechsel. Belohnungen gehen immer.
 */
export async function undoPurchase(purchaseId: string, today?: DayKey, database: QuestlogDB = db): Promise<void> {
  if (today !== undefined) assertDayKey(today)
  await database.transaction('rw', allTables(database), async () => {
    const purchase = await database.purchases.get(purchaseId)
    if (!purchase) return
    if (purchase.kind === 'item') {
      const day = today ?? toDayKey(new Date(), await storedDayStartHour(database))
      const data = await loadGameData(database)
      if (!canUndoItemPurchase(data, purchase, day)) throw new Error(itemUndoMessage(data, purchase, day))
    }
    await database.purchases.delete(purchaseId)
  })
}

/** Warum sich ein Gegenstands-Kauf am Tag `today` nicht mehr zurückgeben lässt. */
function itemUndoMessage(data: GameData, purchase: Purchase, today: DayKey): string {
  if (purchase.day !== today) return MSG.itemUndoOtherDay
  const settled = (data.hpLedger ?? []).some((entry) => compareDays(entry.day, purchase.day) >= 0)
  return settled || purchase.itemId !== 'streakFreeze' ? MSG.itemUndoSettled : MSG.itemUndoFreezeUsed
}

// ---------------------------------------------------------------------------
// Schatzkammer: Gegenstände (Phase 2b)
// ---------------------------------------------------------------------------

/**
 * Kauft einen Gegenstand am Spieltag `today`. Alles in **einer** Transaktion über `allTables` (gleichzeitige
 * Käufe laufen nacheinander – nie mehr ausgegeben als da ist, nie mehr Vorrat als erlaubt). Geprüft wird mit
 * `deriveGameState(loadGameData(), today)`:
 * - unbekannter Gegenstand → „Diesen Gegenstand gibt es nicht.“
 * - ❄️ Streak-Schutz: Vorrat (`inventory.streakFreezes`) schon `items.streakFreeze.max` (5) → Fehler
 * - 🧪 Heiltrank (wird sofort getrunken): nur mit Lebenspunkten (nicht im Sanften Modus) und wenn HP < Max
 * - Guthaben kleiner als der Preis → `missingGoldMessage`
 * Gespeichert wird `{ kind: 'item', itemId, title, icon, price (Momentaufnahmen aus ITEMS), day: today, createdAt }`.
 */
export async function purchaseItem(itemId: ItemId, today: DayKey, database: QuestlogDB = db): Promise<Purchase> {
  assertDayKey(today)
  if (typeof itemId !== 'string' || !Object.hasOwn(ITEMS, itemId)) throw new Error(MSG.itemNotFound)
  const item = ITEMS[itemId]
  return database.transaction('rw', allTables(database), async () => {
    const state = deriveGameState(await loadGameData(database), today)
    if (itemId === 'streakFreeze' && state.inventory.streakFreezes >= BALANCING.items.streakFreeze.max) {
      throw new Error(MSG.freezeStockFull)
    }
    if (itemId === 'healingPotion') {
      if (!state.hp.enabled) throw new Error(MSG.potionGentle)
      if (state.hp.current >= state.hp.max) throw new Error(MSG.potionFull)
    }
    const balance = state.gold.balance
    if (balance < item.price) throw new Error(missingGoldMessage(item.price - balance))
    const purchase: Purchase = {
      id: newId(),
      kind: 'item',
      itemId,
      title: item.title,
      icon: item.icon,
      price: item.price,
      day: today,
      createdAt: Date.now(),
    }
    await database.purchases.add(purchase)
    return purchase
  })
}

// ---------------------------------------------------------------------------
// Rast & Urlaub (Phase 2b)
// ---------------------------------------------------------------------------

/**
 * Erster Tag, den eine Rast (neu) abdecken darf: `today − backfillDays` (gestern lässt sich noch nachtragen),
 * aber nie ein schon abgerechneter Tag (nach dem letzten Ledger-Eintrag). Frühere Tage sind fest – eine Rast
 * dort würde vergangene Perfekte Tage, Streaks und Lebenspunkte umschreiben. Für die UI (z. B. frühestes Datum).
 */
export function firstEditableRestDay(data: Pick<GameData, 'hpLedger'>, today: DayKey): DayKey {
  let earliest = addDays(today, -BALANCING.backfillDays)
  for (const entry of data.hpLedger ?? []) {
    if (!isValidDayKey(entry.day)) continue
    const next = addDays(entry.day, 1)
    if (compareDays(next, earliest) > 0) earliest = next
  }
  return earliest
}

/**
 * Plant eine Rast (Ruhetag bzw. Urlaub) von `from` bis `until` (inklusive): An diesen Tagen ist keine Quest Pflicht,
 * Streaks überstehen sie, keine HP-Wirkung. Geprüft wird: gültige Tage, `from ≤ until`, höchstens
 * `MAX_REST_PERIOD_DAYS` (60) Tage, Beginn frühestens `firstEditableRestDay` (gestern; auch in der Zukunft
 * erlaubt), keine Überschneidung mit einer anderen Rast. Die Notiz ist optional (leer = keine).
 */
export async function addRestPeriod(draft: RestPeriodDraft, today: DayKey, database: QuestlogDB = db): Promise<RestPeriod> {
  assertDayKey(today)
  const clean = normalizeRestPeriodDraft(draft)
  return database.transaction('rw', database.restPeriods, database.hpLedger, async () => {
    const [periods, hpLedger] = await Promise.all([database.restPeriods.toArray(), database.hpLedger.toArray()])
    const earliest = firstEditableRestDay({ hpLedger }, today)
    if (compareDays(clean.from, earliest) < 0) throw new Error(restStartMessage(earliest, today))
    assertNoRestOverlap(periods, clean)
    const period: RestPeriod = { id: newId(), ...clean, createdAt: Date.now() }
    await database.restPeriods.add(period)
    return period
  })
}

/**
 * Ändert eine Rast am Spieltag `today` (Felder im Patch; `note: undefined`/leer entfernt die Notiz). Tage vor
 * `firstEditableRestDay` bleiben, wie sie waren: Eine laufende Rast lässt sich verlängern oder verkürzen, ihr
 * vergangener Teil (und eine schon vorbei gegangene Rast) nicht – außer der Notiz. Sonst gleiche Prüfungen wie
 * `addRestPeriod` (die andere Rast zählt dabei nicht als Überschneidung).
 */
export async function updateRestPeriod(
  id: string,
  patch: Partial<RestPeriodDraft>,
  today: DayKey,
  database: QuestlogDB = db,
): Promise<void> {
  assertDayKey(today)
  await database.transaction('rw', database.restPeriods, database.hpLedger, async () => {
    const existing = await database.restPeriods.get(id)
    if (!existing) throw new Error(MSG.restNotFound)
    const clean = normalizeRestPeriodDraft({
      from: patch.from ?? existing.from,
      until: patch.until ?? existing.until,
      note: Object.hasOwn(patch, 'note') ? patch.note : existing.note,
    })
    const [periods, hpLedger] = await Promise.all([database.restPeriods.toArray(), database.hpLedger.toArray()])
    const earliest = firstEditableRestDay({ hpLedger }, today)
    const fixedThrough = addDays(earliest, -1)
    const before = fixedPart(existing, fixedThrough)
    const after = fixedPart(clean, fixedThrough)
    if (before?.from !== after?.from || before?.until !== after?.until) {
      throw new Error(before === undefined ? restStartMessage(earliest, today) : restPastMessage(earliest, today))
    }
    assertNoRestOverlap(
      periods.filter((period) => period.id !== id),
      clean,
    )
    const next: RestPeriod = { id: existing.id, ...clean, createdAt: existing.createdAt }
    await database.restPeriods.put(next)
  })
}

/**
 * Löscht eine Rast am Spieltag `today` – aber nur ihre Tage ab `firstEditableRestDay`:
 * - beginnt sie dort oder später → endgültig gelöscht (`'deleted'`; unbekannte ID: nichts passiert, `'deleted'`)
 * - läuft sie gerade (begann vorher) → endet sie am Tag davor (`'shortened'`, z. B. Urlaub vorzeitig beendet)
 * - ist sie schon vorbei → Fehler, nichts geändert (vergangene Rasttage bleiben).
 */
export async function deleteRestPeriod(
  id: string,
  today: DayKey,
  database: QuestlogDB = db,
): Promise<'deleted' | 'shortened'> {
  assertDayKey(today)
  return database.transaction('rw', database.restPeriods, database.hpLedger, async () => {
    const existing = await database.restPeriods.get(id)
    if (!existing) return 'deleted'
    const earliest = firstEditableRestDay({ hpLedger: await database.hpLedger.toArray() }, today)
    if (compareDays(existing.from, earliest) >= 0) {
      await database.restPeriods.delete(id)
      return 'deleted'
    }
    if (compareDays(existing.until, earliest) < 0) throw new Error(MSG.restOver)
    await database.restPeriods.put({ ...existing, until: addDays(earliest, -1) })
    return 'shortened'
  })
}

/** Teil einer Rast bis einschließlich `fixedThrough` (unveränderliche Vergangenheit), `undefined`, wenn keiner. */
function fixedPart(period: Pick<RestPeriod, 'from' | 'until'>, fixedThrough: DayKey): { from: DayKey; until: DayKey } | undefined {
  if (compareDays(period.from, fixedThrough) > 0) return undefined
  return { from: period.from, until: compareDays(period.until, fixedThrough) < 0 ? period.until : fixedThrough }
}

/** „gestern“, „heute“ bzw. „dem 3. Nov.“ – für Meldungen zum frühesten Rast-Tag. */
function restDayText(day: DayKey, today: DayKey): string {
  if (day === today) return 'heute'
  if (day === addDays(today, -1)) return 'gestern'
  if (day === addDays(today, 1)) return 'morgen'
  return `dem ${formatDay(day, 'short')}`
}

function restStartMessage(earliest: DayKey, today: DayKey): string {
  return earliest === addDays(today, -1)
    ? 'Eine Rast kannst du höchstens ab gestern rückwirkend eintragen.'
    : `Eine Rast kannst du frühestens ab ${restDayText(earliest, today)} eintragen.`
}

function restPastMessage(earliest: DayKey, today: DayKey): string {
  return `Vergangene Rasttage lassen sich nicht mehr ändern – nur die ab ${restDayText(earliest, today)}.`
}

/** Wirft, wenn `period` sich mit einer der `others` überschneidet (mit freundlicher Angabe des Zeitraums). */
function assertNoRestOverlap(others: readonly RestPeriod[], period: Pick<RestPeriod, 'from' | 'until'>): void {
  const clash = others
    .filter((other) => compareDays(other.from, period.until) <= 0 && compareDays(period.from, other.until) <= 0)
    .sort(compareRestPeriods)[0]
  if (clash === undefined) return
  const range =
    clash.from === clash.until
      ? formatDay(clash.from, 'short')
      : `${formatDay(clash.from, 'short')} – ${formatDay(clash.until, 'short')}`
  throw new Error(`An diesen Tagen rastest du schon (${range}).`)
}

// ---------------------------------------------------------------------------
// Nebenquests
// ---------------------------------------------------------------------------

/**
 * Legt eine offene Nebenquest am Spieltag `today` an (`createdDay`), ans Ende der Liste (`order` = max + 1).
 * Titel Pflicht; der Termin (`dueDay`) ist optional – leer bzw. `undefined` = ohne Termin.
 */
export async function createSideQuest(
  draft: SideQuestDraft,
  today: DayKey,
  database: QuestlogDB = db,
): Promise<SideQuest> {
  assertDayKey(today)
  const clean = normalizeSideQuestDraft(draft)
  return database.transaction('rw', database.sideQuests, async () => {
    const last = await database.sideQuests.orderBy('order').last()
    const quest: SideQuest = { id: newId(), ...clean, createdDay: today, order: last ? last.order + 1 : 0 }
    await database.sideQuests.add(quest)
    return quest
  })
}

/**
 * Ändert eine Nebenquest. Pflichtfelder, die im Patch fehlen oder `undefined` sind, bleiben unverändert;
 * `description` und `dueDay` werden entfernt, wenn der Patch sie explizit mit `undefined` (oder leer) enthält.
 * Anlagetag, Reihenfolge und Erledigung bleiben.
 */
export async function updateSideQuest(
  id: string,
  patch: Partial<SideQuestDraft>,
  database: QuestlogDB = db,
): Promise<void> {
  await database.transaction('rw', database.sideQuests, async () => {
    const existing = await requireSideQuest(database, id)
    const merged: SideQuestDraft = {
      title: patch.title ?? existing.title,
      icon: patch.icon ?? existing.icon,
      attribute: patch.attribute ?? existing.attribute,
      difficulty: patch.difficulty ?? existing.difficulty,
      description: Object.hasOwn(patch, 'description') ? patch.description : existing.description,
      dueDay: Object.hasOwn(patch, 'dueDay') ? patch.dueDay : existing.dueDay,
    }
    const next: SideQuest = {
      id: existing.id,
      ...normalizeSideQuestDraft(merged),
      createdDay: existing.createdDay,
      order: existing.order,
    }
    if (existing.doneDay !== undefined) next.doneDay = existing.doneDay
    await database.sideQuests.put(next)
  })
}

/**
 * Erledigt eine Nebenquest am Spieltag `day` (`doneDay = day`). Ist sie schon erledigt (`doneDay ≤ day`),
 * bleibt sie unverändert – doppeltes Tippen verschiebt ihre XP nicht. Ein `doneDay` nach `day` (der
 * Tageswechsel wurde später gelegt, die Erledigung zählt noch nicht) wird auf `day` vorgezogen.
 */
export async function completeSideQuest(id: string, day: DayKey, database: QuestlogDB = db): Promise<void> {
  assertDayKey(day)
  await mutateSideQuest(database, id, (quest) =>
    quest.doneDay !== undefined && isValidDayKey(quest.doneDay) && compareDays(quest.doneDay, day) <= 0
      ? quest
      : { ...quest, doneDay: day },
  )
}

/** Öffnet eine erledigte Nebenquest wieder (`doneDay` entfällt, ihre XP auch). Offen → keine Änderung. */
export async function reopenSideQuest(id: string, database: QuestlogDB = db): Promise<void> {
  await mutateSideQuest(database, id, (quest) => {
    if (quest.doneDay === undefined) return quest
    const next: SideQuest = { ...quest }
    delete next.doneDay
    return next
  })
}

/** Löscht eine Nebenquest endgültig (eine erledigte samt ihrer XP). Eine unbekannte ändert nichts. */
export async function deleteSideQuest(id: string, database: QuestlogDB = db): Promise<void> {
  await database.sideQuests.delete(id)
}

// ---------------------------------------------------------------------------
// Fortschritt: Erfolge, Boss-Siege, Truhen (Phase 2a/3a)
// ---------------------------------------------------------------------------

/** Was `recordProgress` dauerhaft speichert – jede Liste optional. */
export interface ProgressRecord {
  achievementUnlocks?: readonly AchievementUnlock[]
  bossVictories?: readonly BossVictory[]
  chests?: readonly Chest[]
}

/**
 * Speichert erreichten Fortschritt dauerhaft (einmal erreicht = für immer) – alles in **einer** Transaktion.
 * Idempotent: Vorhandenes wird **nie** überschrieben (ein gespeicherter Erfolg behält seinen Tag, ein Boss-Sieg seinen
 * Boss, eine Truhe ihren Inhalt und ihren Öffnungszustand); doppelt Gespeichertes wird übersprungen. So können der
 * `ProgressRecorder` mehrerer Tabs und mehrfache Aufrufe gefahrlos dasselbe melden.
 * - Erfolge: nicht leere ID, gültiger Tag; kommt eine ID mehrfach vor, zählt der früheste Tag.
 * - Boss-Siege: `weekStart` ein Montag, nicht leere `bossId`, gültiger Tag, `maxHp` > 0; je Woche zählt der früheste.
 * - Truhen: nicht leere ID, bekannter Fundort und Seltenheit, gültiger Fundtag und Inhalt (Gold: ganze Zahl ≥ 1,
 *   Gegenstand: Streak-Schutz, Kosmetik: Titel/Rahmen mit ID); je ID zählt die erste. Neu gespeicherte Truhen sind
 *   immer **ungeöffnet** (`openedAt` wird nicht übernommen – geöffnet wird nur mit `openChest`). Quest-Truhen höchstens
 *   `BALANCING.chests.maxQuestChestsPerDay` pro Fundtag, gespeicherte eingerechnet (überzählige werden übersprungen –
 *   etwa wenn zwischen zwei Meldungen eine andere Quest des Tages gewonnen hätte).
 * Ein ungültiger Eintrag → Fehler, **nichts** wird gespeichert. Alles leer → nichts passiert.
 */
export async function recordProgress(progress: ProgressRecord, database: QuestlogDB = db): Promise<void> {
  const unlocks = cleanUnlocks(progress.achievementUnlocks ?? [])
  const victories = cleanVictories(progress.bossVictories ?? [])
  const chests = cleanChests(progress.chests ?? [])
  if (unlocks.length === 0 && victories.length === 0 && chests.length === 0) return
  const tables = [database.achievementUnlocks, database.bossVictories, database.chests]
  await database.transaction('rw', tables, async () => {
    if (unlocks.length > 0) {
      const stored = await database.achievementUnlocks.bulkGet(unlocks.map((unlock) => unlock.id))
      const fresh = unlocks.filter((_, index) => stored[index] === undefined)
      if (fresh.length > 0) await database.achievementUnlocks.bulkAdd(fresh)
    }
    if (victories.length > 0) {
      const stored = await database.bossVictories.bulkGet(victories.map((victory) => victory.weekStart))
      const fresh = victories.filter((_, index) => stored[index] === undefined)
      if (fresh.length > 0) await database.bossVictories.bulkAdd(fresh)
    }
    if (chests.length > 0) {
      const stored = await database.chests.bulkGet(chests.map((chest) => chest.id))
      const fresh = await withinQuestChestLimit(
        database,
        chests.filter((_, index) => stored[index] === undefined),
      )
      if (fresh.length > 0) await database.chests.bulkAdd(fresh)
    }
  })
}

/**
 * Speichert neu freigeschaltete Erfolge dauerhaft – dünner Wrapper um `recordProgress` (gleiche Regeln: idempotent,
 * überschreibt nie einen gespeicherten Tag, doppelte IDs → frühester Tag, ungültige Einträge → Fehler, nichts
 * gespeichert).
 */
export async function recordAchievementUnlocks(
  unlocks: readonly AchievementUnlock[],
  database: QuestlogDB = db,
): Promise<void> {
  await recordProgress({ achievementUnlocks: unlocks }, database)
}

/**
 * Öffnet eine gefundene Truhe am Spieltag `today` – in **einer** Transaktion über `allTables`:
 * - Die Truhe muss es geben: gespeichert oder – noch nicht vom Recorder gespeichert – gerade gefunden
 *   (`deriveGameState(…, today).chests`); sonst „Diese Truhe gibt es nicht (mehr).“ Schon geöffnet → Fehler.
 * - Gold: zählt ab jetzt (`gold.fromChests`). Gespeichert wird nur `openedAt`.
 * - ❄️ Streak-Schutz: kommt in den Vorrat (ab dem Spieltag des Öffnens). Ist der Vorrat
 *   (`inventory.streakFreezes`) schon voll (`items.streakFreeze.max`), liegt stattdessen
 *   `chests.freezeFallbackGold` Gold darin – entschieden beim Öffnen und so gespeichert (der Inhalt der Truhe wird
 *   ersetzt), damit der Spielstand später derselbe bleibt.
 * - Titel/Rahmen: zusätzlich ein `CosmeticUnlock` (`{ id, kind, day: today, source: 'chest' }`; ein vorhandener bleibt).
 * @param now Zeitpunkt des Öffnens (`openedAt`, epoch ms; Standard: jetzt).
 * @returns der tatsächliche Inhalt (beim vollen Vorrat also das Ersatz-Gold).
 */
export async function openChest(
  id: string,
  today: DayKey,
  database: QuestlogDB = db,
  now: number = Date.now(),
): Promise<ChestContent> {
  assertDayKey(today)
  if (optionalId(id) === undefined) throw new Error(MSG.chestNotFound)
  return database.transaction('rw', allTables(database), async () => {
    let state: GameState | undefined
    const currentState = async () => (state ??= deriveGameState(await loadGameData(database), today))
    const chest = (await database.chests.get(id)) ?? (await currentState()).chests.find((found) => found.id === id)
    if (chest === undefined) throw new Error(MSG.chestNotFound)
    if (chest.openedAt !== undefined) throw new Error(MSG.chestOpened)

    let content = chest.content
    if (content?.kind === 'item' && content.itemId === 'streakFreeze') {
      const { inventory } = await currentState()
      if (inventory.streakFreezes >= BALANCING.items.streakFreeze.max) {
        content = { kind: 'gold', amount: BALANCING.chests.freezeFallbackGold }
      }
    }
    await database.chests.put({ ...chest, content, openedAt: now })
    if (content?.kind === 'cosmetic' && (await database.cosmeticUnlocks.get(content.cosmeticId)) === undefined) {
      const unlock: CosmeticUnlock = { id: content.cosmeticId, kind: content.cosmeticKind, day: today, source: 'chest' }
      await database.cosmeticUnlocks.add(unlock)
    }
    return content
  })
}

/** Erfolge geprüft, je ID der früheste Tag (Reihenfolge des ersten Auftretens). */
function cleanUnlocks(unlocks: readonly AchievementUnlock[]): AchievementUnlock[] {
  const earliest = new Map<string, DayKey>()
  for (const unlock of unlocks) {
    const id = optionalId(unlock?.id)
    if (id === undefined) throw new Error(MSG.invalidAchievement)
    assertDayKey(unlock.day, 'Datum eines Erfolgs')
    const known = earliest.get(id)
    if (known === undefined || compareDays(unlock.day, known) < 0) earliest.set(id, unlock.day)
  }
  return [...earliest].map(([id, day]) => ({ id, day }))
}

/** Boss-Siege geprüft und bereinigt, je Woche der früheste. */
function cleanVictories(victories: readonly BossVictory[]): BossVictory[] {
  const byWeek = new Map<DayKey, BossVictory>()
  for (const victory of victories) {
    const weekStart = victory?.weekStart
    const bossId = optionalId(victory?.bossId)
    const maxHp = victory?.maxHp
    if (!isDayKeyValue(weekStart) || isoWeekday(weekStart) !== 1 || bossId === undefined) {
      throw new Error(MSG.invalidVictory)
    }
    if (!isDayKeyValue(victory.day) || typeof maxHp !== 'number' || !Number.isFinite(maxHp) || maxHp <= 0) {
      throw new Error(MSG.invalidVictory)
    }
    const clean: BossVictory = { weekStart, bossId, day: victory.day, maxHp }
    const known = byWeek.get(weekStart)
    if (known === undefined || compareDays(clean.day, known.day) < 0) byWeek.set(weekStart, clean)
  }
  return [...byWeek.values()]
}

/** Truhen geprüft und bereinigt (ungeöffnet), je ID die erste. */
function cleanChests(chests: readonly Chest[]): Chest[] {
  const byId = new Map<string, Chest>()
  for (const chest of chests) {
    const id = optionalId(chest?.id)
    const content = cleanChestContent(chest?.content)
    if (
      id === undefined ||
      content === undefined ||
      typeof chest.source !== 'string' ||
      !Object.hasOwn(CHEST_SOURCE_SET, chest.source) ||
      typeof chest.rarity !== 'string' ||
      !Object.hasOwn(CHEST_RARITY_SET, chest.rarity) ||
      !isDayKeyValue(chest.foundDay)
    ) {
      throw new Error(MSG.invalidChest)
    }
    if (!byId.has(id)) byId.set(id, { id, source: chest.source, foundDay: chest.foundDay, rarity: chest.rarity, content })
  }
  return [...byId.values()]
}

/** Gültiger Truhen-Inhalt (nur die bekannten Felder) oder `undefined`. */
function cleanChestContent(content: unknown): ChestContent | undefined {
  if (!isRecord(content)) return undefined
  switch (content.kind) {
    case 'gold': {
      const amount = content.amount
      return typeof amount === 'number' && Number.isInteger(amount) && amount >= 1 ? { kind: 'gold', amount } : undefined
    }
    case 'item':
      return content.itemId === 'streakFreeze' ? { kind: 'item', itemId: 'streakFreeze' } : undefined
    case 'cosmetic': {
      const cosmeticId = optionalId(content.cosmeticId)
      const cosmeticKind = content.cosmeticKind
      if (cosmeticId === undefined || (cosmeticKind !== 'title' && cosmeticKind !== 'frame')) return undefined
      return { kind: 'cosmetic', cosmeticKind, cosmeticId }
    }
    default:
      return undefined
  }
}

/**
 * Neue Truhen ohne die Quest-Truhen, die das Tageslimit (`maxQuestChestsPerDay`, gespeicherte des Tages eingerechnet)
 * überschreiten würden – in der übergebenen Reihenfolge.
 */
async function withinQuestChestLimit(database: QuestlogDB, fresh: readonly Chest[]): Promise<Chest[]> {
  const questDays = [...new Set(fresh.filter((chest) => chest.source === 'quest').map((chest) => chest.foundDay))]
  if (questDays.length === 0) return [...fresh]
  const perDay = new Map<DayKey, number>()
  for (const chest of await database.chests.where('foundDay').anyOf(questDays).toArray()) {
    if (chest.source === 'quest') perDay.set(chest.foundDay, (perDay.get(chest.foundDay) ?? 0) + 1)
  }
  return fresh.filter((chest) => {
    if (chest.source !== 'quest') return true
    const count = perDay.get(chest.foundDay) ?? 0
    if (count >= BALANCING.chests.maxQuestChestsPerDay) return false
    perDay.set(chest.foundDay, count + 1)
    return true
  })
}

// ---------------------------------------------------------------------------
// Alles zurücksetzen
// ---------------------------------------------------------------------------

/**
 * Löscht ALLE Daten (Profil, Einstellungen, Quests, Erledigungen, Kampagnen, Belohnungen, Einlösungen,
 * Nebenquests, Erfolge, abgerechnete Tage, Rast & Urlaub, Boss-Siege, Truhen, Titel & Rahmen) in einer Transaktion.
 */
export async function resetAllData(database: QuestlogDB = db): Promise<void> {
  const tables = allTables(database)
  await database.transaction('rw', tables, async () => {
    await Promise.all(tables.map((table) => table.clear()))
  })
}

// ---------------------------------------------------------------------------
// Interne Helfer: Datenbank
// ---------------------------------------------------------------------------

/** Sortierung von Quests: `order`, dann Titel, dann ID (stabil & deterministisch). */
function compareHabitOrder(a: Habit, b: Habit): number {
  return a.order - b.order || a.title.localeCompare(b.title, 'de') || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)
}

/** Sortierung von Belohnungen: `order`, dann Anlagezeit, dann ID. */
function compareRewardOrder(a: Reward, b: Reward): number {
  return a.order - b.order || a.createdAt - b.createdAt || compareIds(a.id, b.id)
}

/** Sortierung der Einlösungen (Chronik): Zeitpunkt, dann ID. */
function comparePurchases(a: Purchase, b: Purchase): number {
  return a.createdAt - b.createdAt || compareIds(a.id, b.id)
}

/** Sortierung von Nebenquests: `order`, dann Titel, dann ID (wie Quests). */
function compareSideQuestOrder(a: SideQuest, b: SideQuest): number {
  return a.order - b.order || a.title.localeCompare(b.title, 'de') || compareIds(a.id, b.id)
}

/** Sortierung der Rast-Zeiträume: Beginn, Ende, Anlagezeit, ID. */
function compareRestPeriods(a: RestPeriod, b: RestPeriod): number {
  return compareDays(a.from, b.from) || compareDays(a.until, b.until) || a.createdAt - b.createdAt || compareIds(a.id, b.id)
}

/** Sortierung freigeschalteter Erfolge bzw. Titel/Rahmen: Tag, dann ID. */
function compareUnlocks(a: Pick<AchievementUnlock, 'id' | 'day'>, b: Pick<AchievementUnlock, 'id' | 'day'>): number {
  return compareDays(a.day, b.day) || compareIds(a.id, b.id)
}

/** Sortierung der Truhen: Fundtag, dann ID (wie `GameState.chests`). */
function compareChests(a: Chest, b: Chest): number {
  return compareDays(a.foundDay, b.foundDay) || compareIds(a.id, b.id)
}

function compareIds(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0
}

function needsOrderNormalization(items: readonly { order: number }[]): boolean {
  const orders = items.map((item) => item.order)
  return orders.some((order) => !Number.isFinite(order)) || new Set(orders).size !== orders.length
}

/**
 * Tauscht den `order` des Eintrags `id` mit dem seines Nachbarn (oben/unten) unter `movable` – einer Teilmenge
 * von `sorted` mit denselben Objekten in derselben Reihenfolge (z. B. nur die aktiven Quests). Sind `order`-Werte
 * doppelt oder ungültig, werden vorher alle Einträge lückenlos neu durchnummeriert (0, 1, 2, …), damit der Tausch
 * eindeutig ist. Ändert die Objekte und liefert die geänderten; am Rand oder bei unbekannter ID: `[]`.
 */
function swapOrder<T extends { id: string; order: number }>(
  sorted: T[],
  movable: T[],
  id: string,
  direction: 'up' | 'down',
): T[] {
  const index = movable.findIndex((item) => item.id === id)
  const neighborIndex = direction === 'up' ? index - 1 : index + 1
  if (index === -1 || neighborIndex < 0 || neighborIndex >= movable.length) return []

  const changed = new Set<T>()
  if (needsOrderNormalization(sorted)) {
    sorted.forEach((item, position) => {
      if (item.order !== position) {
        item.order = position
        changed.add(item)
      }
    })
  }

  // `movable` enthält dieselben Objekte wie `sorted`, d. h. die Normalisierung ist hier schon sichtbar.
  const self = movable[index]
  const neighbor = movable[neighborIndex]
  const selfOrder = self.order
  self.order = neighbor.order
  neighbor.order = selfOrder
  changed.add(self).add(neighbor)
  return [...changed]
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

async function requireReward(database: QuestlogDB, id: string): Promise<Reward> {
  const reward = await database.rewards.get(id)
  if (!reward) throw new Error(MSG.rewardNotFound)
  return reward
}

async function requireSideQuest(database: QuestlogDB, id: string): Promise<SideQuest> {
  const quest = await database.sideQuests.get(id)
  if (!quest) throw new Error(MSG.sideQuestNotFound)
  return quest
}

/** Lesen → ändern → schreiben einer Belohnung in einer Transaktion; unverändert (dasselbe Objekt) → kein Schreiben. */
async function mutateReward(database: QuestlogDB, id: string, change: (reward: Reward) => Reward): Promise<void> {
  await database.transaction('rw', database.rewards, async () => {
    const reward = await requireReward(database, id)
    const next = change(reward)
    if (next !== reward) await database.rewards.put(next)
  })
}

/** Lesen → ändern → schreiben einer Nebenquest in einer Transaktion; unverändert → kein Schreiben. */
async function mutateSideQuest(
  database: QuestlogDB,
  id: string,
  change: (quest: SideQuest) => SideQuest,
): Promise<void> {
  await database.transaction('rw', database.sideQuests, async () => {
    const quest = await requireSideQuest(database, id)
    const next = change(quest)
    if (next !== quest) await database.sideQuests.put(next)
  })
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
  const { dayStartHour, effects, penalties, hpIntroSeen, combatIntroSeen } = stored
  if (typeof dayStartHour === 'number' && Number.isInteger(dayStartHour) && dayStartHour >= 0 && dayStartHour <= 12) {
    result.dayStartHour = dayStartHour
  }
  if (typeof effects === 'boolean') result.effects = effects
  if (isRecord(penalties) && typeof penalties.enabled === 'boolean') {
    result.penalties = { enabled: penalties.enabled }
    if (isDayKeyValue(penalties.since)) result.penalties.since = penalties.since
  }
  if (typeof hpIntroSeen === 'boolean') result.hpIntroSeen = hpIntroSeen
  if (typeof combatIntroSeen === 'boolean') result.combatIntroSeen = combatIntroSeen
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
      if (!Object.hasOwn(HABIT_METRICS, criterion.metric)) throw new Error('Unbekannte Kapitel-Messgröße.')
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

/** Preis einer Belohnung: ganze Zahl von 1 bis `MAX_REWARD_PRICE`, sonst Fehler. */
function normalizeRewardPrice(value: unknown): number {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 1 || value > MAX_REWARD_PRICE) {
    throw new Error(MSG.rewardPrice)
  }
  return value
}

/** Validiert und normalisiert die bearbeitbaren Felder einer Belohnung. Eine leere Beschreibung entfällt. */
function normalizeRewardDraft(draft: RewardDraft): RewardDraft {
  const result: RewardDraft = {
    title: requireText(draft.title, 'Die Belohnung braucht einen Namen.'),
    icon: optionalText(draft.icon) ?? DEFAULT_REWARD_ICON,
    price: normalizeRewardPrice(draft.price),
    repeatable: draft.repeatable === true,
  }
  const description = optionalText(draft.description)
  if (description !== undefined) result.description = description
  return result
}

/** Validiert und normalisiert die bearbeitbaren Felder einer Nebenquest. Leere optionale Felder entfallen. */
function normalizeSideQuestDraft(draft: SideQuestDraft): SideQuestDraft {
  const result: SideQuestDraft = {
    title: requireText(draft.title, 'Die Nebenquest braucht einen Namen.'),
    icon: optionalText(draft.icon) ?? DEFAULT_SIDE_QUEST_ICON,
    attribute: normalizeAttribute(draft.attribute),
    difficulty: normalizeDifficulty(draft.difficulty),
  }
  const description = optionalText(draft.description)
  if (description !== undefined) result.description = description
  const dueDay: unknown = draft.dueDay
  if (dueDay !== undefined && dueDay !== null && dueDay !== '') {
    assertDayKey(dueDay, 'Datum für den Termin')
    result.dueDay = dueDay
  }
  return result
}

/** Validiert eine Rast: gültige Tage, `from ≤ until`, höchstens `MAX_REST_PERIOD_DAYS` Tage; leere Notiz entfällt. */
function normalizeRestPeriodDraft(draft: RestPeriodDraft): RestPeriodDraft {
  const from: unknown = draft?.from
  const until: unknown = draft?.until
  assertDayKey(from, 'Startdatum')
  assertDayKey(until, 'Enddatum')
  if (compareDays(until, from) < 0) throw new Error(MSG.restOrder)
  if (diffDays(from, until) + 1 > MAX_REST_PERIOD_DAYS) throw new Error(MSG.restTooLong)
  const result: RestPeriodDraft = { from, until }
  const note = optionalText(draft.note)
  if (note !== undefined) result.note = note
  return result
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
  const blueprint = sanitizeBlueprintRef(draft.blueprint)
  if (blueprint !== undefined) result.blueprint = blueprint
  const shared = sanitizeIdList(draft.sharedHabitIds)
  if (shared.length > 0) result.sharedHabitIds = shared
  return result
}

/** Nicht leere, eindeutige IDs (Reihenfolge bleibt); alles andere entfällt. */
function sanitizeIdList(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  const ids = new Set<string>()
  for (const entry of value as unknown[]) {
    const id = optionalId(entry)
    if (id !== undefined) ids.add(id)
  }
  return [...ids]
}

/** Gültige Herkunftsangabe (nicht leere ID, bekannte Stufe, optional nicht leerer Pfad) oder `undefined`. */
function sanitizeBlueprintRef(value: unknown): BlueprintRef | undefined {
  if (!isRecord(value)) return undefined
  const id = optionalId(value.id)
  const level = value.level
  if (id === undefined || typeof level !== 'string' || !(BLUEPRINT_LEVELS as readonly string[]).includes(level)) {
    return undefined
  }
  const ref: BlueprintRef = { id, level: level as BlueprintRef['level'] }
  const pathId = optionalId(value.pathId)
  if (pathId !== undefined) ref.pathId = pathId
  return ref
}
