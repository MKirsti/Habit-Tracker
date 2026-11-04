import { Dexie, type Table } from 'dexie'
import type {
  AchievementUnlock,
  BlueprintRef,
  BossVictory,
  Chest,
  Completion,
  CosmeticUnlock,
  Habit,
  HpLedgerEntry,
  MainQuest,
  Purchase,
  RestPeriod,
  Reward,
  SideQuest,
} from '../domain/types'

/** Ein Eintrag im Schlüssel-Wert-Speicher (`kv`). */
export interface KeyValueEntry {
  key: string
  value: unknown
}

/** Schlüssel im `kv`-Speicher. */
export const KV_KEYS = {
  /** Wert: `CharacterProfile` (fehlt bis zum Abschluss des Onboardings). */
  profile: 'profile',
  /** Wert: (Teil-)`Settings`; wird beim Laden mit `DEFAULT_SETTINGS` gemergt. */
  settings: 'settings',
  /** Wert: `DeletedHabit[]` – Grabsteine gelöschter Quests (fehlt, solange keine gelöscht wurde). */
  deletedHabits: 'deletedHabits',
} as const

/** Standardname der IndexedDB-Datenbank. */
export const DEFAULT_DB_NAME = 'questlog'

/** Tabellen der Versionen 1 und 2 – nie ändern (neue Tabellen/Indizes nur über eine neue Version). */
const SCHEMA = {
  habits: '&id, order, mainQuestId',
  completions: '&id, habitId, day',
  mainQuests: '&id',
  kv: '&key',
} as const

/** Ab Version 3 (Phase 2a): Schatzkammer, Gold-Ausgaben, Nebenquests, Erfolge. */
const SCHEMA_V3 = {
  ...SCHEMA,
  rewards: '&id, order',
  purchases: '&id, day',
  sideQuests: '&id, order',
  achievementUnlocks: '&id',
} as const

/** Ab Version 4 (Phase 2b): abgerechnete Tage (Lebenspunkte) und Rast & Urlaub. */
const SCHEMA_V4 = {
  ...SCHEMA_V3,
  hpLedger: '&day',
  restPeriods: '&id, from',
} as const

/** Ab Version 5 (Phase 3a): besiegte Wochen-Bosse, gefundene Truhen, aus Truhen freigeschaltete Titel/Rahmen. */
const SCHEMA_V5 = {
  ...SCHEMA_V4,
  bossVictories: '&weekStart',
  chests: '&id, foundDay',
  cosmeticUnlocks: '&id',
} as const

/** Titel der Kampagne, die das Onboarding vor der Kampagnen-Bibliothek angelegt hat. */
const LEGACY_SCHOLAR_TITLE = 'Der Weg des Gelehrten'

/**
 * Herkunft einer Kampagne aus der Zeit vor der Kampagnen-Bibliothek: "Der Weg des Gelehrten" war die einzige
 * Vorlage und entspricht der Einsteiger-Stufe der Gelehrten-Vorlage. Andere Kampagnen (oder solche, die ihre
 * Herkunft schon kennen) → `undefined`.
 */
export function legacyBlueprintRef(quest: Pick<MainQuest, 'title' | 'blueprint'>): BlueprintRef | undefined {
  if (quest.blueprint !== undefined || typeof quest.title !== 'string') return undefined
  return quest.title.trim() === LEGACY_SCHOLAR_TITLE ? { id: 'scholar', level: 'beginner' } : undefined
}

/**
 * Die IndexedDB-Datenbank von Questlog.
 *
 * Indizes:
 * - `habits`: `order` (Sortierung), `mainQuestId` (Verknüpfung mit Kampagnen)
 * - `completions`: `habitId` (Kaskaden-Löschen), `day`
 * - `rewards`, `sideQuests`: `order` (Sortierung); `purchases`: `day`
 * - `hpLedger`: Primärschlüssel `day` (höchstens ein abgerechneter Eintrag pro Spieltag); `restPeriods`: `from`
 * - `bossVictories`: Primärschlüssel `weekStart` (höchstens ein Sieg pro Woche); `chests`: `foundDay` (Quest-Truhen
 *   je Tag zählen); `cosmeticUnlocks`: Primärschlüssel `id` (Titel- bzw. Rahmen-ID)
 *
 * Schemaänderungen immer über eine neue `version(n)` mit Upgrade-Funktion – niemals `version(1)` ändern.
 *
 * Versionen:
 * 1. Grundschema.
 * 2. Kampagnen-Bibliothek: Eine vorhandene "Der Weg des Gelehrten"-Kampagne (aus dem früheren Onboarding)
 *    bekommt ihre Herkunft `blueprint: { id: 'scholar', level: 'beginner' }` – damit sie in der Bibliothek als
 *    laufend gilt und nicht ein zweites Mal gestartet wird. Indizes unverändert.
 * 3. Phase 2a: neue Tabellen `rewards` (Belohnungen der Schatzkammer), `purchases` (Gold-Ausgaben),
 *    `sideQuests` (Nebenquests) und `achievementUnlocks` (freigeschaltete Erfolge). Sie starten leer;
 *    vorhandene Daten bleiben unverändert.
 * 4. Phase 2b: neue Tabellen `hpLedger` (endgültig abgerechnete Tage: Tageswertung, Lebenspunkte, Streak-Schutz,
 *    Niederlagen – ein Eintrag pro Tag, Schlüssel `day`) und `restPeriods` (Rast & Urlaub). Sie starten leer;
 *    vorhandene Daten bleiben unverändert. Abgerechnet wird erst ab dem ersten Start danach
 *    (`settings.penalties.since`, gesetzt von `settleHpDays`) – nie rückwirkend.
 * 5. Phase 3a: neue Tabellen `bossVictories` (besiegte Wochen-Bosse, Schlüssel `weekStart`), `chests` (gefundene
 *    Truhen – Inhalt beim Fund festgelegt, `openedAt` beim Öffnen) und `cosmeticUnlocks` (aus Truhen freigeschaltete
 *    Titel und Rahmen). Sie starten leer; vorhandene Daten bleiben unverändert. Klasse, Bosse und Truhen werden aus
 *    dem gespeicherten Verlauf abgeleitet – neue Truhen nur ab dem Fenster der Engine (`chestWindowStart`), Bosse nur
 *    für die laufende (und in der Gnadenfrist die vorige) Woche; nichts davon rückwirkend.
 */
export class QuestlogDB extends Dexie {
  habits!: Table<Habit, string>
  completions!: Table<Completion, string>
  mainQuests!: Table<MainQuest, string>
  kv!: Table<KeyValueEntry, string>
  rewards!: Table<Reward, string>
  purchases!: Table<Purchase, string>
  sideQuests!: Table<SideQuest, string>
  achievementUnlocks!: Table<AchievementUnlock, string>
  hpLedger!: Table<HpLedgerEntry, string>
  restPeriods!: Table<RestPeriod, string>
  bossVictories!: Table<BossVictory, string>
  chests!: Table<Chest, string>
  cosmeticUnlocks!: Table<CosmeticUnlock, string>

  /** @param name Datenbankname – Tests verwenden pro Test einen eigenen Namen. */
  constructor(name: string = DEFAULT_DB_NAME) {
    super(name)
    this.version(1).stores(SCHEMA)
    this.version(2)
      .stores(SCHEMA)
      .upgrade((tx) =>
        tx
          .table<MainQuest, string>('mainQuests')
          .toCollection()
          .modify((quest) => {
            const ref = legacyBlueprintRef(quest)
            if (ref !== undefined) quest.blueprint = ref
          }),
      )
    this.version(3).stores(SCHEMA_V3)
    this.version(4).stores(SCHEMA_V4)
    this.version(5).stores(SCHEMA_V5)
  }
}

/**
 * Alle Tabellen der Datenbank – für Transaktionen, die `loadGameData` aufrufen (es liest alle Tabellen; eine
 * verschachtelte Transaktion darf nur Tabellen der äußeren nutzen) oder alles ersetzen (Reset, Backup).
 * Eine neue Tabelle gehört hier hinein.
 */
export function allTables(database: QuestlogDB) {
  return [
    database.habits,
    database.completions,
    database.mainQuests,
    database.kv,
    database.rewards,
    database.purchases,
    database.sideQuests,
    database.achievementUnlocks,
    database.hpLedger,
    database.restPeriods,
    database.bossVictories,
    database.chests,
    database.cosmeticUnlocks,
  ]
}

/** Die Datenbank-Instanz der App. */
export const db = new QuestlogDB()
