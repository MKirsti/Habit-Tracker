import { Dexie, type Table } from 'dexie'
import type { BlueprintRef, Completion, Habit, MainQuest } from '../domain/types'

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

const SCHEMA = {
  habits: '&id, order, mainQuestId',
  completions: '&id, habitId, day',
  mainQuests: '&id',
  kv: '&key',
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
 *
 * Schemaänderungen immer über eine neue `version(n)` mit Upgrade-Funktion – niemals `version(1)` ändern.
 *
 * Versionen:
 * 1. Grundschema.
 * 2. Kampagnen-Bibliothek: Eine vorhandene "Der Weg des Gelehrten"-Kampagne (aus dem früheren Onboarding)
 *    bekommt ihre Herkunft `blueprint: { id: 'scholar', level: 'beginner' }` – damit sie in der Bibliothek als
 *    laufend gilt und nicht ein zweites Mal gestartet wird. Indizes unverändert.
 */
export class QuestlogDB extends Dexie {
  habits!: Table<Habit, string>
  completions!: Table<Completion, string>
  mainQuests!: Table<MainQuest, string>
  kv!: Table<KeyValueEntry, string>

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
  }
}

/** Die Datenbank-Instanz der App. */
export const db = new QuestlogDB()
