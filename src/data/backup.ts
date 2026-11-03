/**
 * Backup: Export und Import aller Daten als JSON-Datei.
 *
 * Importierte Dateien werden mit zod streng gegen das Datenmodell aus `domain/types.ts`
 * geprüft, bevor irgendetwas in die Datenbank geschrieben wird. Unbekannte Felder werden
 * dabei verworfen. Fehlermeldungen sind deutsch und können direkt angezeigt werden.
 *
 * Neue **optionale** Felder (z. B. `scheduleHistory`, `pauses` einer Quest) erhöhen die
 * Schema-Version nicht: Ältere Backups ohne diese Felder bleiben gültig.
 */
import { z } from 'zod'
import { ATTRIBUTE_IDS } from '../domain/attributes'
import { DIFFICULTIES } from '../domain/balancing'
import { isValidDayKey } from '../domain/dates'
import type { GameData } from '../domain/types'
import { db, KV_KEYS, type QuestlogDB } from './db'
import { completionId, resetAllData, loadGameData } from './repository'

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

const chapterCriterionSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('manual') }),
  z.object({ type: z.literal('counter'), target: z.number().positive(), label: z.string() }),
  z.object({
    type: z.literal('habit'),
    habitId: idSchema,
    metric: z.enum(['completions', 'total', 'streak']),
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
  createdAt: z.number(),
})

const profileSchema = z.object({
  name: z.string(),
  avatar: z.string(),
  createdDay: dayKeySchema,
})

const settingsSchema = z.object({
  dayStartHour: z.number().int().min(0).max(12),
  effects: z.boolean(),
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

export const gameDataSchema = z
  .object({
    profile: profileSchema.optional(),
    settings: settingsSchema,
    habits: z.array(habitSchema),
    completions: z.array(completionSchema),
    mainQuests: z.array(mainQuestSchema),
  })
  .superRefine((data, ctx) => {
    checkUniqueIds(data.habits, ['habits'], ctx)
    checkUniqueIds(data.completions, ['completions'], ctx)
    checkUniqueIds(data.mainQuests, ['mainQuests'], ctx)
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
 */
export async function restoreBackup(backup: BackupFile, database: QuestlogDB = db): Promise<void> {
  const parsed = parseBackup(backup)
  if (!parsed.ok) throw new Error(parsed.error)
  const { data } = parsed.backup

  await database.transaction('rw', [database.habits, database.completions, database.mainQuests, database.kv], async () => {
    await resetAllData(database)
    await database.habits.bulkAdd(data.habits)
    await database.completions.bulkAdd(data.completions)
    await database.mainQuests.bulkAdd(data.mainQuests)
    await database.kv.put({ key: KV_KEYS.settings, value: data.settings })
    if (data.profile) await database.kv.put({ key: KV_KEYS.profile, value: data.profile })
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function formatIssue(issue: z.core.$ZodIssue | undefined): string {
  if (!issue) return 'Unbekannter Fehler.'
  const path = issue.path.map((segment) => String(segment)).join('.')
  return path ? `${path} – ${issue.message}` : issue.message
}
