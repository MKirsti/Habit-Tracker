/**
 * Backup: Export und Import aller Daten als JSON-Datei.
 *
 * Importierte Dateien werden mit zod streng gegen das Datenmodell aus `domain/types.ts`
 * geprüft, bevor irgendetwas in die Datenbank geschrieben wird. Unbekannte Felder werden
 * dabei verworfen. Fehlermeldungen sind deutsch und können direkt angezeigt werden.
 *
 * Neue **optionale** Felder (z. B. `scheduleHistory`, `pauses` einer Quest, `deletedHabits`, `blueprint` und
 * `sharedHabitIds` einer Kampagne, die Phase-2a-Listen `rewards`, `purchases`, `sideQuests` und
 * `achievementUnlocks`, Phase 2b: `hpLedger`, `restPeriods`, `settings.penalties`, `settings.hpIntroSeen`, Phase 3a:
 * `bossVictories`, `chests`, `cosmeticUnlocks`, `settings.combatIntroSeen`, `profile.form/titleId/frameId`)
 * erhöhen die Schema-Version nicht: Ältere Backups ohne sie bleiben gültig.
 */
import { z } from 'zod'
import { ATTRIBUTE_IDS } from '../domain/attributes'
import { DIFFICULTIES } from '../domain/balancing'
import { BALANCING } from '../domain/balancing'
import { addDays, compareDays, diffDays, isoWeekday, isValidDayKey, toDayKey } from '../domain/dates'
import { nextUnsettledDay, sortedLedger } from '../domain/hp'
import type {
  BlueprintRef,
  ChapterMetric,
  ChestRarity,
  ChestSource,
  DayKey,
  DayScore,
  GameData,
  GrammaticalForm,
  ItemId,
  MainQuest,
  Settings,
} from '../domain/types'
import { getBlueprint } from './blueprints'
import { BLUEPRINT_LEVELS } from './blueprints/types'
import { allTables, db, KV_KEYS, legacyBlueprintRef, type QuestlogDB } from './db'
import {
  completionId,
  GRAMMATICAL_FORMS,
  ITEM_IDS,
  loadGameData,
  MAX_REST_PERIOD_DAYS,
  MAX_REWARD_PRICE,
  resetAllData,
} from './repository'

export const BACKUP_APP_ID = 'questlog'
export const BACKUP_SCHEMA_VERSION = 1

export interface BackupFile {
  app: 'questlog'
  schemaVersion: number
  /** Zeitpunkt des Exports (ISO 8601). */
  exportedAt: string
  data: GameData
}

export type ParseBackupResult = { ok: true; backup: BackupFile } | { ok: false; error: string }

const NOT_A_BACKUP = 'Diese Datei ist kein Questlog-Backup.'

// ---------------------------------------------------------------------------
// zod-Schemas (spiegeln domain/types.ts)
// ---------------------------------------------------------------------------

const idSchema = z.string().min(1, { error: 'Die ID darf nicht leer sein.' })

const dayKeySchema = z.string().refine(isValidDayKey, { error: 'Ungültiger Spieltag (erwartet JJJJ-MM-TT).' })

const attributeSchema = z.enum(ATTRIBUTE_IDS)

const difficultySchema = z.enum(DIFFICULTIES)

const isoWeekdaySchema = z.union([
  z.literal(1),
  z.literal(2),
  z.literal(3),
  z.literal(4),
  z.literal(5),
  z.literal(6),
  z.literal(7),
])

const scheduleSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('daily') }),
  z.object({ type: z.literal('weekdays'), days: z.array(isoWeekdaySchema).min(1) }),
  z.object({ type: z.literal('weekly'), times: z.number().int().min(1).max(7) }),
])

/** Früherer Rhythmus einer Quest (gilt für die Tage vor `until`). */
const scheduleHistoryEntrySchema = z.object({
  until: dayKeySchema,
  schedule: scheduleSchema,
})

/** Der Verlauf muss streng aufsteigend nach `until` sortiert sein (so schreibt ihn das Repository). */
const scheduleHistorySchema = z.array(scheduleHistoryEntrySchema).superRefine((entries, ctx) => {
  entries.forEach((entry, index) => {
    if (index > 0 && entries[index - 1].until >= entry.until) {
      ctx.addIssue({
        code: 'custom',
        path: [index, 'until'],
        message: 'Der Rhythmus-Verlauf muss nach Datum aufsteigend sortiert sein.',
      })
    }
  })
})

/** Ruhezeit einer Quest: `from ≤ Tag < until`, also muss `from` vor `until` liegen. */
const pauseSchema = z
  .object({
    from: dayKeySchema,
    until: dayKeySchema,
  })
  .refine((pause) => pause.from < pause.until, {
    path: ['until'],
    error: 'Eine Pause muss enden, nachdem sie begonnen hat.',
  })

const measureSchema = z.object({
  target: z.number().positive(),
  unit: z.string(),
})

const habitSchema = z.object({
  id: idSchema,
  title: z.string(),
  icon: z.string(),
  description: z.string().optional(),
  attribute: attributeSchema,
  difficulty: difficultySchema,
  schedule: scheduleSchema,
  scheduleHistory: scheduleHistorySchema.optional(),
  measure: measureSchema.optional(),
  mainQuestId: z.string().optional(),
  order: z.number(),
  createdDay: dayKeySchema,
  archivedDay: dayKeySchema.optional(),
  pauses: z.array(pauseSchema).optional(),
})

/** Grabstein einer gelöschten Quest: nur ihr Zeitplan (siehe `DeletedHabit`). */
const deletedHabitSchema = z.object({
  id: idSchema,
  createdDay: dayKeySchema,
  archivedDay: dayKeySchema,
  schedule: scheduleSchema,
  scheduleHistory: scheduleHistorySchema.optional(),
  pauses: z.array(pauseSchema).optional(),
})

const completionSchema = z.object({
  id: idSchema,
  habitId: idSchema,
  day: dayKeySchema,
  value: z.number().positive(),
  target: z.number().positive(),
  difficulty: difficultySchema,
  attribute: attributeSchema,
  updatedAt: z.number(),
})

/** Alle Kapitel-Messgrößen (Phase 2b: „Bestwert“) – `satisfies` hält die Liste vollständig zu `ChapterMetric`. */
const CHAPTER_METRIC_SET = { completions: true, total: true, streak: true, best: true } satisfies Record<ChapterMetric, true>
const CHAPTER_METRICS = Object.keys(CHAPTER_METRIC_SET) as [ChapterMetric, ...ChapterMetric[]]

const chapterCriterionSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('manual') }),
  z.object({ type: z.literal('counter'), target: z.number().positive(), label: z.string() }),
  z.object({
    type: z.literal('habit'),
    habitId: idSchema,
    metric: z.enum(CHAPTER_METRICS),
    target: z.number().positive(),
  }),
])

const chapterSchema = z.object({
  id: idSchema,
  title: z.string(),
  description: z.string().optional(),
  criterion: chapterCriterionSchema,
  manualDone: z.boolean().optional(),
  counter: z.number().nonnegative().optional(),
  completedDay: dayKeySchema.optional(),
})

/** Herkunft einer Kampagne aus einer Vorlage (`MainQuest.blueprint`). */
const blueprintRefSchema = z.object({
  id: idSchema,
  level: z.enum(BLUEPRINT_LEVELS),
  pathId: idSchema.optional(),
})

const mainQuestSchema = z.object({
  id: idSchema,
  title: z.string(),
  icon: z.string(),
  description: z.string().optional(),
  why: z.string(),
  reward: z.string(),
  startDay: dayKeySchema,
  deadline: dayKeySchema.optional(),
  chapters: z.array(chapterSchema),
  archived: z.boolean().optional(),
  blueprint: blueprintRefSchema.optional(),
  sharedHabitIds: z.array(idSchema).optional(),
  createdAt: z.number(),
})

/**
 * Belohnung der Schatzkammer (`Reward`): Preis ganzzahlig von 1 bis `MAX_REWARD_PRICE` – wie beim Anlegen im
 * Repository (sonst ließe sich eine importierte Belohnung später nicht mehr bearbeiten).
 */
const rewardSchema = z.object({
  id: idSchema,
  title: z.string(),
  icon: z.string(),
  description: z.string().optional(),
  price: z.number().int().min(1).max(MAX_REWARD_PRICE),
  repeatable: z.boolean(),
  order: z.number(),
  archived: z.boolean().optional(),
  createdAt: z.number(),
})

/**
 * Gold-Ausgabe (`Purchase`) mit Momentaufnahme von Titel, Icon und Preis: eine eingelöste Belohnung
 * (`kind: 'reward'`, optional `rewardId`) oder – Phase 2b – ein Gegenstand (`kind: 'item'` mit `itemId`).
 */
const purchaseSchema = z
  .object({
    id: idSchema,
    kind: z.enum(['reward', 'item']),
    rewardId: idSchema.optional(),
    itemId: z.enum(ITEM_IDS as [ItemId, ...ItemId[]]).optional(),
    title: z.string(),
    icon: z.string(),
    price: z.number().int().min(1),
    day: dayKeySchema,
    createdAt: z.number(),
  })
  .superRefine((purchase, ctx) => {
    if (purchase.kind === 'item' && purchase.itemId === undefined) {
      ctx.addIssue({ code: 'custom', path: ['itemId'], message: 'Ein gekaufter Gegenstand braucht seine Art.' })
    }
    if (purchase.kind === 'item' && purchase.rewardId !== undefined) {
      ctx.addIssue({ code: 'custom', path: ['rewardId'], message: 'Ein Gegenstand ist keine Belohnung.' })
    }
    if (purchase.kind === 'reward' && purchase.itemId !== undefined) {
      ctx.addIssue({ code: 'custom', path: ['itemId'], message: 'Eine Belohnung ist kein Gegenstand.' })
    }
  })

/** Alle Tageswertungen – `satisfies` hält die Liste vollständig zu `DayScore`. */
const DAY_SCORE_SET = {
  perfect: true,
  good: true,
  weak: true,
  missed: true,
  rest: true,
  none: true,
  absent: true,
} satisfies Record<DayScore, true>
const DAY_SCORES = Object.keys(DAY_SCORE_SET) as [DayScore, ...DayScore[]]

/** Endgültig abgerechneter Tag (`HpLedgerEntry`, Phase 2b). HP sind ganze Zahlen, `0 ≤ hpAfter ≤ maxHp`. */
const hpLedgerEntrySchema = z
  .object({
    day: dayKeySchema,
    score: z.enum(DAY_SCORES),
    frozen: z.boolean(),
    hpDelta: z.number().int(),
    hpAfter: z.number().int().nonnegative(),
    maxHp: z.number().int().positive(),
    defeat: z.object({ goldLost: z.number().int().nonnegative() }).optional(),
    penalties: z.boolean(),
  })
  .refine((entry) => entry.hpAfter <= entry.maxHp, {
    path: ['hpAfter'],
    error: 'Die Lebenspunkte nach dem Tag dürfen nicht über dem Maximum liegen.',
  })

/**
 * Rast bzw. Urlaub (`RestPeriod`, Phase 2b): `from ≤ until` (inklusive), höchstens `MAX_REST_PERIOD_DAYS` Tage –
 * wie beim Anlegen im Repository (sonst ließe sich eine importierte Rast nicht mehr bearbeiten).
 */
const restPeriodSchema = z
  .object({
    id: idSchema,
    from: dayKeySchema,
    until: dayKeySchema,
    note: z.string().optional(),
    createdAt: z.number(),
  })
  .superRefine((period, ctx) => {
    if (!isValidDayKey(period.from) || !isValidDayKey(period.until)) return
    if (compareDays(period.from, period.until) > 0) {
      ctx.addIssue({ code: 'custom', path: ['until'], message: 'Eine Rast kann nicht enden, bevor sie beginnt.' })
    } else if (diffDays(period.from, period.until) + 1 > MAX_REST_PERIOD_DAYS) {
      ctx.addIssue({
        code: 'custom',
        path: ['until'],
        message: `Eine Rast dauert höchstens ${MAX_REST_PERIOD_DAYS} Tage am Stück.`,
      })
    }
  })

/** Nebenquest (`SideQuest`): einmalige Aufgabe mit optionalem Termin. */
const sideQuestSchema = z.object({
  id: idSchema,
  title: z.string(),
  icon: z.string(),
  description: z.string().optional(),
  attribute: attributeSchema,
  difficulty: difficultySchema,
  dueDay: dayKeySchema.optional(),
  createdDay: dayKeySchema,
  doneDay: dayKeySchema.optional(),
  order: z.number(),
})

/** Freigeschalteter Erfolg (`AchievementUnlock`). */
const achievementUnlockSchema = z.object({
  id: idSchema,
  day: dayKeySchema,
})

/** Besiegter Wochen-Boss (`BossVictory`, Phase 3a): `weekStart` ist der Montag der Woche (eindeutig je Backup). */
const bossVictorySchema = z.object({
  weekStart: dayKeySchema.refine((day) => !isValidDayKey(day) || isoWeekday(day) === 1, {
    error: 'Ein Boss-Sieg gehört zum Montag seiner Woche.',
  }),
  bossId: idSchema,
  day: dayKeySchema,
  maxHp: z.number().positive(),
})

/** Fundorte und Seltenheiten von Truhen – `satisfies` hält die Listen vollständig zu den Typen. */
const CHEST_SOURCE_SET = { boss: true, quest: true, chapter: true } satisfies Record<ChestSource, true>
const CHEST_SOURCES = Object.keys(CHEST_SOURCE_SET) as [ChestSource, ...ChestSource[]]
const CHEST_RARITY_SET = { common: true, uncommon: true, rare: true, legendary: true } satisfies Record<ChestRarity, true>
const CHEST_RARITIES = Object.keys(CHEST_RARITY_SET) as [ChestRarity, ...ChestRarity[]]
const cosmeticKindSchema = z.enum(['title', 'frame'])

/** Inhalt einer Truhe (`ChestContent`): Gold (ganze Zahl ≥ 1), ein Streak-Schutz oder ein Titel/Rahmen. */
const chestContentSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('gold'), amount: z.number().int().min(1) }),
  z.object({ kind: z.literal('item'), itemId: z.literal('streakFreeze') }),
  z.object({ kind: z.literal('cosmetic'), cosmeticKind: cosmeticKindSchema, cosmeticId: idSchema }),
])

/** Gefundene Truhe (`Chest`, Phase 3a); `openedAt` fehlt = ungeöffnet. */
const chestSchema = z.object({
  id: idSchema,
  source: z.enum(CHEST_SOURCES),
  foundDay: dayKeySchema,
  rarity: z.enum(CHEST_RARITIES),
  content: chestContentSchema,
  openedAt: z.number().optional(),
})

/** Aus einer Truhe freigeschalteter Titel bzw. Rahmen (`CosmeticUnlock`, Phase 3a). */
const cosmeticUnlockSchema = z.object({
  id: idSchema,
  kind: cosmeticKindSchema,
  day: dayKeySchema,
  source: z.literal('chest'),
})

const profileSchema = z.object({
  name: z.string(),
  avatar: z.string(),
  createdDay: dayKeySchema,
  /** Phase 3a: Sprachform, gewählter Titel und Rahmen (unbekannte IDs zeigt die App einfach nicht an). */
  form: z.enum(GRAMMATICAL_FORMS as [GrammaticalForm, ...GrammaticalForm[]]).optional(),
  titleId: idSchema.optional(),
  frameId: idSchema.optional(),
  /** Phase 3a: nach einer Umbenennung festgehaltener Helden-Seed (Boss-Wahl, Truhen) – nicht leer. */
  heroSeed: idSchema.optional(),
})

const settingsSchema = z.object({
  dayStartHour: z.number().int().min(0).max(12),
  effects: z.boolean(),
  /** Phase 2b: Lebenspunkte an/aus (Sanfter Modus) und Beginn der Abrechnung. */
  penalties: z.object({ enabled: z.boolean(), since: dayKeySchema.optional() }).optional(),
  hpIntroSeen: z.boolean().optional(),
  /** Phase 3a: Einführung „Neu: Klassen, Bosse & Beute“ gesehen. */
  combatIntroSeen: z.boolean().optional(),
})

/** Meldet doppelte IDs innerhalb einer Liste als Fehler am betroffenen Eintrag. */
function checkUniqueIds(items: { id: string }[], path: PropertyKey[], ctx: z.RefinementCtx): void {
  const seen = new Set<string>()
  items.forEach((item, index) => {
    if (seen.has(item.id)) {
      ctx.addIssue({ code: 'custom', path: [...path, index, 'id'], message: `Doppelte ID „${item.id}“.` })
    }
    seen.add(item.id)
  })
}

/** Höchstens ein Boss-Sieg pro Woche (Schlüssel der Tabelle `bossVictories`). */
function checkUniqueWeeks(victories: { weekStart: string }[], ctx: z.RefinementCtx): void {
  const seen = new Set<string>()
  victories.forEach((victory, index) => {
    if (seen.has(victory.weekStart)) {
      ctx.addIssue({
        code: 'custom',
        path: ['bossVictories', index, 'weekStart'],
        message: `Für die Woche ab ${victory.weekStart} gibt es schon einen Boss-Sieg.`,
      })
    }
    seen.add(victory.weekStart)
  })
}

/** Höchstens ein abgerechneter Eintrag pro Spieltag (Schlüssel der Tabelle `hpLedger`). */
function checkUniqueDays(entries: { day: string }[], ctx: z.RefinementCtx): void {
  const seen = new Set<string>()
  entries.forEach((entry, index) => {
    if (seen.has(entry.day)) {
      ctx.addIssue({ code: 'custom', path: ['hpLedger', index, 'day'], message: `Der Tag ${entry.day} ist doppelt abgerechnet.` })
    }
    seen.add(entry.day)
  })
}

/** Rast-Zeiträume dürfen sich nicht überschneiden (so legt sie das Repository an). */
function checkRestOverlaps(periods: { from: string; until: string }[], ctx: z.RefinementCtx): void {
  const valid = periods
    .map((period, index) => ({ period, index }))
    .filter(({ period }) => isValidDayKey(period.from) && isValidDayKey(period.until))
    .sort((a, b) => compareDays(a.period.from, b.period.from) || a.index - b.index)
  for (let i = 1; i < valid.length; i++) {
    const previous = valid[i - 1].period
    const { period, index } = valid[i]
    if (compareDays(period.from, previous.until) <= 0) {
      ctx.addIssue({
        code: 'custom',
        path: ['restPeriods', index, 'from'],
        message: 'Diese Rast überschneidet sich mit einer anderen.',
      })
    }
  }
}

export const gameDataSchema = z
  .object({
    profile: profileSchema.optional(),
    settings: settingsSchema,
    habits: z.array(habitSchema),
    completions: z.array(completionSchema),
    mainQuests: z.array(mainQuestSchema),
    deletedHabits: z.array(deletedHabitSchema).optional(),
    rewards: z.array(rewardSchema).optional(),
    purchases: z.array(purchaseSchema).optional(),
    sideQuests: z.array(sideQuestSchema).optional(),
    achievementUnlocks: z.array(achievementUnlockSchema).optional(),
    hpLedger: z.array(hpLedgerEntrySchema).optional(),
    restPeriods: z.array(restPeriodSchema).optional(),
    bossVictories: z.array(bossVictorySchema).optional(),
    chests: z.array(chestSchema).optional(),
    cosmeticUnlocks: z.array(cosmeticUnlockSchema).optional(),
  })
  .superRefine((data, ctx) => {
    checkUniqueIds(data.habits, ['habits'], ctx)
    if (data.deletedHabits) checkUniqueIds(data.deletedHabits, ['deletedHabits'], ctx)
    checkUniqueIds(data.completions, ['completions'], ctx)
    checkUniqueIds(data.mainQuests, ['mainQuests'], ctx)
    if (data.rewards) checkUniqueIds(data.rewards, ['rewards'], ctx)
    if (data.purchases) checkUniqueIds(data.purchases, ['purchases'], ctx)
    if (data.sideQuests) checkUniqueIds(data.sideQuests, ['sideQuests'], ctx)
    if (data.achievementUnlocks) checkUniqueIds(data.achievementUnlocks, ['achievementUnlocks'], ctx)
    if (data.hpLedger) checkUniqueDays(data.hpLedger, ctx)
    if (data.restPeriods) {
      checkUniqueIds(data.restPeriods, ['restPeriods'], ctx)
      checkRestOverlaps(data.restPeriods, ctx)
    }
    if (data.bossVictories) checkUniqueWeeks(data.bossVictories, ctx)
    if (data.chests) checkUniqueIds(data.chests, ['chests'], ctx)
    if (data.cosmeticUnlocks) checkUniqueIds(data.cosmeticUnlocks, ['cosmeticUnlocks'], ctx)
    data.mainQuests.forEach((quest, index) => checkUniqueIds(quest.chapters, ['mainQuests', index, 'chapters'], ctx))
    // Pro Quest und Tag darf es nur eine Erledigung geben – die ID muss das widerspiegeln.
    data.completions.forEach((completion, index) => {
      if (completion.id !== completionId(completion.habitId, completion.day)) {
        ctx.addIssue({
          code: 'custom',
          path: ['completions', index, 'id'],
          message: 'Die ID einer Erledigung muss „Quest-ID:Spieltag“ lauten.',
        })
      }
    })
  }) satisfies z.ZodType<GameData>

export const backupFileSchema = z.object({
  app: z.literal(BACKUP_APP_ID),
  schemaVersion: z.literal(BACKUP_SCHEMA_VERSION),
  exportedAt: z.string(),
  data: gameDataSchema,
}) satisfies z.ZodType<BackupFile>

/** Deutsche Standard-Fehlermeldungen von zod – nur für diese Prüfung, ohne globale Konfiguration. */
const germanErrors = z.locales.de().localeError

// ---------------------------------------------------------------------------
// Öffentliche API
// ---------------------------------------------------------------------------

/** Erstellt ein Backup aller Daten. */
export async function createBackup(now: Date = new Date(), database: QuestlogDB = db): Promise<BackupFile> {
  return {
    app: BACKUP_APP_ID,
    schemaVersion: BACKUP_SCHEMA_VERSION,
    exportedAt: now.toISOString(),
    data: await loadGameData(database),
  }
}

/**
 * Prüft ein (per `JSON.parse` gelesenes) Backup. Ein JSON-**Text** wird ebenfalls akzeptiert
 * und vorher geparst. Liefert entweder das bereinigte Backup oder eine deutsche Fehlermeldung.
 */
export function parseBackup(json: unknown): ParseBackupResult {
  let input = json
  if (typeof input === 'string') {
    try {
      input = JSON.parse(input)
    } catch {
      return { ok: false, error: 'Die Datei enthält kein gültiges JSON.' }
    }
  }

  if (!isRecord(input) || input.app !== BACKUP_APP_ID) return { ok: false, error: NOT_A_BACKUP }

  const version = input.schemaVersion
  if (typeof version === 'number' && version !== BACKUP_SCHEMA_VERSION) {
    return { ok: false, error: `Backup-Version ${version} wird nicht unterstützt.` }
  }

  const result = backupFileSchema.safeParse(input, { error: germanErrors })
  if (!result.success) {
    return { ok: false, error: `Ungültige Daten: ${formatIssue(result.error.issues[0])}` }
  }
  return { ok: true, backup: result.data }
}

/**
 * Ersetzt ALLE Daten durch den Inhalt des Backups – atomar in einer Transaktion:
 * Schlägt etwas fehl, bleibt der vorherige Stand vollständig erhalten.
 * Das Backup wird vorher (erneut) validiert; bei ungültigen Daten wird ein `Error` geworfen.
 *
 * Backups aus der Zeit vor der Kampagnen-Bibliothek bekommen beim Import die Herkunft ihrer früheren
 * Onboarding-Kampagne (siehe `legacyOnboardingRef`) – sonst ließe sich der Gelehrte danach ein zweites Mal
 * starten. Alle anderen Daten kommen unverändert zurück. Backups ohne die Phase-2a-Listen (Belohnungen,
 * Einlösungen, Nebenquests, Erfolge) bzw. ohne die Phase-2b-Listen (abgerechnete Tage, Rast & Urlaub) und
 * Phase-3a-Listen (Boss-Siege, Truhen, Titel & Rahmen aus Truhen) hinterlassen diese Tabellen leer. Ein Backup ohne `settings.penalties` startet wie nach dem Update auf Phase 2b:
 * abgerechnet wird erst ab dem nächsten `settleHpDays` – nie rückwirkend.
 *
 * Lebenspunkte: Tage nach dem Export kennt das Backup nicht (vielleicht wurde auf dem alten Gerät weitergespielt).
 * Würden beim nächsten Abrechnen solche Tage als verpasst gewertet, beginnt die Abrechnung erst wieder mit dem
 * noch nachtragbaren Tag (`penalties.since` = gestern, siehe `restoredSettings`) – ein Gerätewechsel kostet so nie
 * HP und führt nie zu einer Niederlage. Am Exporttag und am Tag danach bleibt alles, wie es ist.
 * @param now Zeitpunkt des Wiederherstellens (Spieltag laut Tageswechsel des Backups).
 */
export async function restoreBackup(backup: BackupFile, database: QuestlogDB = db, now: Date = new Date()): Promise<void> {
  const parsed = parseBackup(backup)
  if (!parsed.ok) throw new Error(parsed.error)
  const { data } = parsed.backup
  const settings = restoredSettings(data, parsed.backup.exportedAt, now)
  const mainQuests = data.mainQuests.map((quest) => {
    const ref = legacyOnboardingRef(quest)
    return ref === undefined ? quest : { ...quest, blueprint: ref }
  })

  await database.transaction('rw', allTables(database), async () => {
    await resetAllData(database)
    await database.habits.bulkAdd(data.habits)
    await database.completions.bulkAdd(data.completions)
    await database.mainQuests.bulkAdd(mainQuests)
    await database.kv.put({ key: KV_KEYS.settings, value: settings })
    if (data.profile) await database.kv.put({ key: KV_KEYS.profile, value: data.profile })
    if (data.deletedHabits && data.deletedHabits.length > 0) {
      await database.kv.put({ key: KV_KEYS.deletedHabits, value: data.deletedHabits })
    }
    if (data.rewards) await database.rewards.bulkAdd(data.rewards)
    if (data.purchases) await database.purchases.bulkAdd(data.purchases)
    if (data.sideQuests) await database.sideQuests.bulkAdd(data.sideQuests)
    if (data.achievementUnlocks) await database.achievementUnlocks.bulkAdd(data.achievementUnlocks)
    if (data.hpLedger) await database.hpLedger.bulkAdd(data.hpLedger)
    if (data.restPeriods) await database.restPeriods.bulkAdd(data.restPeriods)
    if (data.bossVictories) await database.bossVictories.bulkAdd(data.bossVictories)
    if (data.chests) await database.chests.bulkAdd(data.chests)
    if (data.cosmeticUnlocks) await database.cosmeticUnlocks.bulkAdd(data.cosmeticUnlocks)
  })
}

/** Dateiname für den Export, z. B. "questlog-backup-2026-11-03.json" (lokales Datum). */
export function backupFileName(now: Date): string {
  const year = String(now.getFullYear()).padStart(4, '0')
  const month = String(now.getMonth() + 1).padStart(2, '0')
  const day = String(now.getDate()).padStart(2, '0')
  return `questlog-backup-${year}-${month}-${day}.json`
}

// ---------------------------------------------------------------------------
// Interne Helfer
// ---------------------------------------------------------------------------

/**
 * Einstellungen nach dem Wiederherstellen am Zeitpunkt `now`: Hat das Backup einen Beginn der Abrechnung
 * (`penalties.since`) und würde die nächste Abrechnung (bis vorgestern) den Exporttag oder spätere Tage erfassen –
 * die kennt das Backup nicht oder nur zum Teil, und nachtragen lassen sie sich nicht mehr –, wird `since` auf den
 * frühesten noch nachtragbaren Tag (gestern) gesetzt: Die Tage davor werden nie abgerechnet, die HP laufen ab dem
 * letzten Ledger-Eintrag weiter. Ohne gültigen Exportzeitpunkt zählt jeder noch offene Tag vor gestern als unbekannt.
 * Sonst bleiben die Einstellungen unverändert (Export → Import ändert nichts).
 */
function restoredSettings(data: GameData, exportedAt: string, now: Date): Settings {
  const { settings } = data
  const penalties = settings.penalties
  if (penalties?.since === undefined || Number.isNaN(now.getTime())) return settings
  const today = toDayKey(now, settings.dayStartHour)
  const firstOpen = addDays(today, -BALANCING.backfillDays)
  const next = nextUnsettledDay(settings, sortedLedger(data.hpLedger))
  // Nichts vor gestern offen – die nächste Abrechnung erfasst nur Tage, die es ohnehin noch gibt.
  if (next === undefined || compareDays(next, firstOpen) >= 0) return settings
  const exported = new Date(exportedAt)
  if (!Number.isNaN(exported.getTime())) {
    // Abgerechnet würde bis vorgestern. Der Exporttag selbst ist nur zum Teil bekannt (danach ging es vielleicht
    // weiter); liegt er noch nicht darin, kennt das Backup alle abzurechnenden Tage.
    const lastSettled: DayKey = addDays(firstOpen, -1)
    if (compareDays(toDayKey(exported, settings.dayStartHour), lastSettled) > 0) return settings
  }
  return { ...settings, penalties: { ...penalties, since: firstOpen } }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/** Kapitel-Titel der früheren Onboarding-Kampagne (= Einsteiger-Stufe der Gelehrten-Vorlage). */
let legacyScholarChapters: ReadonlySet<string> | undefined

/**
 * Herkunft einer importierten Kampagne aus dem früheren Onboarding: wie beim Datenbank-Upgrade
 * (`legacyBlueprintRef`: „Der Weg des Gelehrten“ ohne `blueprint`) – zusätzlich muss sie noch mindestens die
 * Hälfte der Kapitel der früheren Vorlage haben. So bleibt eine eigene, nur gleich benannte Kampagne aus einem
 * neueren Backup beim Import unverändert (Export → Import ändert nichts).
 */
function legacyOnboardingRef(quest: MainQuest): BlueprintRef | undefined {
  const ref = legacyBlueprintRef(quest)
  if (ref === undefined) return undefined
  legacyScholarChapters ??= new Set(getBlueprint(ref.id)?.build({ level: ref.level }).chapters.map((chapter) => chapter.title) ?? [])
  const known = legacyScholarChapters
  const matching = quest.chapters.filter((chapter) => known.has(chapter.title.trim())).length
  return known.size > 0 && matching * 2 >= known.size ? ref : undefined
}

function formatIssue(issue: z.core.$ZodIssue | undefined): string {
  if (!issue) return 'Unbekannter Fehler.'
  const path = issue.path.map((segment) => String(segment)).join('.')
  return path ? `${path} – ${issue.message}` : issue.message
}
