/**
 * Zentrales Datenmodell von Questlog.
 *
 * Grundprinzip: Gespeichert werden nur "Fakten" (Profil, Einstellungen, Quests,
 * Erledigungen, Kampagnen). Alles Spielerische – Level, XP, Attribute, Streaks,
 * Kapitel-Fortschritt – wird daraus in `engine.ts` als reine Funktion berechnet.
 */

/** Spieltag im Format 'YYYY-MM-DD'. Berücksichtigt den einstellbaren Tageswechsel (dayStartHour). */
export type DayKey = string

export type AttributeId = 'strength' | 'intellect' | 'wisdom' | 'charisma' | 'vitality' | 'discipline'

export type Difficulty = 'easy' | 'medium' | 'hard' | 'epic'

/** ISO-Wochentag: 1 = Montag … 7 = Sonntag. */
export type IsoWeekday = 1 | 2 | 3 | 4 | 5 | 6 | 7

export type Schedule =
  /** Jeden Tag. */
  | { type: 'daily' }
  /** Nur an bestimmten Wochentagen (mind. einer). */
  | { type: 'weekdays'; days: IsoWeekday[] }
  /** X-mal pro Woche (Mo–So), an beliebigen Tagen. 1 ≤ times ≤ 7. */
  | { type: 'weekly'; times: number }

/** Messbare Quest, z. B. "10 Seiten lesen". Fehlt `measure`, ist die Quest ein einfaches Abhaken. */
export interface Measure {
  /** Zielwert pro Tag, > 0. */
  target: number
  /** Einheit, z. B. "Seiten", "Minuten", "L". */
  unit: string
}

/**
 * Ein früherer Rhythmus einer Quest: `schedule` galt für alle Tage **vor** `until`
 * (und ab dem `until` des vorherigen Eintrags).
 */
export interface ScheduleHistoryEntry {
  until: DayKey
  schedule: Schedule
}

/** Zeitraum, in dem eine Quest ruht (nicht aktiv ist): `from ≤ Tag < until`. */
export interface HabitPause {
  from: DayKey
  until: DayKey
}

export interface Habit {
  id: string
  title: string
  /** Emoji. */
  icon: string
  description?: string
  attribute: AttributeId
  difficulty: Difficulty
  /** Aktueller Rhythmus: gilt ab dem `until` des letzten `scheduleHistory`-Eintrags (ohne Verlauf: immer). */
  schedule: Schedule
  /**
   * Frühere Rhythmen, aufsteigend nach `until`. Wird vom Repository gepflegt, damit eine Änderung des
   * Rhythmus die Vergangenheit (Pflicht-Quests, Perfekte Tage, Streaks, XP) nicht umschreibt.
   * Maßgeblich für einen Tag ist `scheduleOn(habit, day)` aus `schedule.ts`.
   */
  scheduleHistory?: ScheduleHistoryEntry[]
  measure?: Measure
  /** Verknüpfte Kampagne (Hauptquest). */
  mainQuestId?: string
  /** Sortierung in Listen (aufsteigend). */
  order: number
  /** Ab diesem Spieltag ist die Quest aktiv (inklusive). */
  createdDay: DayKey
  /** Ab diesem Spieltag ist die Quest archiviert, also nicht mehr aktiv (inklusive). */
  archivedDay?: DayKey
  /**
   * Ruhezeiten (z. B. eine Archivierung, die später rückgängig gemacht wurde): An diesen Tagen ist die
   * Quest nicht aktiv – keine Pflicht, Streaks überspringen sie. Wird vom Repository gepflegt.
   */
  pauses?: HabitPause[]
}

/**
 * Eine Erledigung (bzw. ein Teilfortschritt) einer Quest an einem Spieltag.
 * Pro Quest und Tag existiert höchstens ein Eintrag. Ein Wert ≤ 0 wird nicht gespeichert (Eintrag wird gelöscht).
 *
 * Die Felder `target`, `difficulty` und `attribute` sind Momentaufnahmen der Quest zum Zeitpunkt der
 * (letzten) Erfassung. Dadurch ändern spätere Bearbeitungen der Quest die Vergangenheit nicht.
 * Balancing-Werte (z. B. XP pro Schwierigkeit) werden dagegen immer aktuell aus `balancing.ts` gelesen.
 */
export interface Completion {
  /** `${habitId}:${day}` */
  id: string
  habitId: string
  day: DayKey
  /** Abhak-Quest: 1. Messbare Quest: erfasster Wert (> 0, darf über dem Ziel liegen). */
  value: number
  /** Zielwert-Snapshot (Abhak-Quest: 1). Erledigt ⇔ value ≥ target. */
  target: number
  difficulty: Difficulty
  attribute: AttributeId
  /** Zeitstempel (epoch ms) der letzten Änderung. */
  updatedAt: number
}

export type ChapterCriterion =
  /** Wird von Hand abgehakt. */
  | { type: 'manual' }
  /** Manueller Zähler, z. B. "Bücher beendet: 3 / 12". */
  | { type: 'counter'; target: number; label: string }
  /**
   * Automatisch aus einer Quest berechnet (nur Erledigungen ab `MainQuest.startDay` zählen):
   * - completions: Anzahl erledigter Tage
   * - total: Summe aller erfassten Werte (auch Teilfortschritte), z. B. Seiten gesamt
   * - streak: bester Streak (gleiche Logik wie Quest-Streaks)
   */
  | { type: 'habit'; habitId: string; metric: 'completions' | 'total' | 'streak'; target: number }

export interface Chapter {
  id: string
  title: string
  description?: string
  criterion: ChapterCriterion
  /** Nur für 'manual': abgehakt? */
  manualDone?: boolean
  /** Nur für 'counter': aktueller Zählerstand (≥ 0). */
  counter?: number
  /** Für 'manual'/'counter': Spieltag, an dem das Kapitel abgeschlossen wurde. */
  completedDay?: DayKey
}

/** Stufe einer Kampagnen-Vorlage: andere Startwerte (Häufigkeit, Zielwerte, Kapitel-Ziele). */
export type BlueprintLevel = 'beginner' | 'advanced'

/** Herkunft einer Kampagne, die aus einer Vorlage (Blueprint) gestartet wurde. */
export interface BlueprintRef {
  /** Stabile ID der Vorlage, z. B. 'scholar' oder 'body'. */
  id: string
  level: BlueprintLevel
  /** Gewählter Pfad (Klasse), nur bei Vorlagen mit Pfaden – z. B. 'strength'. */
  pathId?: string
}

/** Kampagne = Hauptquest mit Kapiteln (Meilensteinen). */
export interface MainQuest {
  id: string
  title: string
  /** Emoji. */
  icon: string
  description?: string
  /** Die Motivation: Warum will ich das? */
  why: string
  /** Selbst gewählte Belohnung bei Abschluss. */
  reward: string
  /** Ab diesem Spieltag zählen Erledigungen für automatische Kapitel. */
  startDay: DayKey
  deadline?: DayKey
  /** Reihenfolge = Erzählreihenfolge. Kapitel werden unabhängig voneinander ausgewertet. */
  chapters: Chapter[]
  /**
   * Archiviert (beendet bzw. in die Ruhmeshalle gelegt): zählt nicht mehr als aktive Kampagne, erscheint nicht
   * mehr in `GameState.mainQuests`; verdiente Kapitel- und Kampagnen-XP bleiben erhalten.
   */
  archived?: boolean
  /** Gesetzt, wenn die Kampagne aus einer Vorlage gestartet wurde. */
  blueprint?: BlueprintRef
  createdAt: number
}

export interface CharacterProfile {
  name: string
  /** Emoji. */
  avatar: string
  /** Spieltag, an dem das Abenteuer begann. */
  createdDay: DayKey
}

export interface Settings {
  /** Stunde (0–12), zu der ein neuer Spieltag beginnt. Standard: 4 → bis 3:59 Uhr zählt noch zum Vortag. */
  dayStartHour: number
  /** Animationen & Effekte (Konfetti, Level-Up-Szene). */
  effects: boolean
}

/**
 * Rest einer endgültig gelöschten Quest („Grabstein“): nur der Zeitplan, damit vergangene Tage ihre
 * Pflicht-Quests behalten. Ohne ihn würde eine gelöschte, an einem Tag offene Pflicht-Quest aus der Wertung
 * verschwinden – der Tag würde nachträglich perfekt und brächte Bonus-XP.
 *
 * Grabsteine haben keine Erledigungen: An Tagen, an denen die Quest Pflicht war, ist sie (für immer) offen.
 * Sie erscheinen nirgends in Listen und zählen nicht für Streaks, Kapitel, Gesamtwerte oder Quest-XP.
 * Werden vom Repository gepflegt (`deleteHabit`); `applyHabitDeletion` (domain/deletion.ts) rechnet gleich.
 */
export interface DeletedHabit {
  /** ID der gelöschten Quest. */
  id: string
  createdDay: DayKey
  /**
   * Ab diesem Spieltag (inklusive) zählte die Quest nicht mehr: ihr Archivierungstag, falls sie schon
   * archiviert war (≤ Löschtag), sonst der Löschtag.
   */
  archivedDay: DayKey
  schedule: Schedule
  scheduleHistory?: ScheduleHistoryEntry[]
  pauses?: HabitPause[]
}

/** Alle gespeicherten Daten – Eingabe für die Spiel-Engine und Inhalt eines Backups. */
export interface GameData {
  /** Fehlt, solange das Onboarding nicht abgeschlossen ist. */
  profile?: CharacterProfile
  settings: Settings
  habits: Habit[]
  completions: Completion[]
  mainQuests: MainQuest[]
  /** Grabsteine gelöschter Quests (siehe `DeletedHabit`). Fehlt, solange keine Quest gelöscht wurde. */
  deletedHabits?: DeletedHabit[]
}

// ---------------------------------------------------------------------------
// Abgeleiteter Spielzustand (wird nie gespeichert, immer aus GameData berechnet)
// ---------------------------------------------------------------------------

export interface LevelInfo {
  /** Aktuelles Level, beginnt bei 1. */
  level: number
  /** Gesamt-XP. */
  totalXp: number
  /** XP innerhalb des aktuellen Levels. */
  xpIntoLevel: number
  /** XP, die für das nächste Level insgesamt innerhalb dieses Levels nötig sind. */
  xpForNextLevel: number
  /** xpIntoLevel / xpForNextLevel, 0..1. */
  progress: number
}

export interface AttributeState extends LevelInfo {
  id: AttributeId
}

export interface Streak {
  /** Aktuelle Serie. Ein noch offener heutiger Tag (bzw. die laufende Woche) bricht sie nicht. */
  current: number
  /** Längste Serie überhaupt. */
  best: number
  unit: 'day' | 'week'
}

export interface HabitStatus {
  habit: Habit
  /**
   * Zählt für den "Perfekten Tag": Quest ist an diesem Tag aktiv und planmäßig fällig
   * (daily, oder weekdays mit passendem Wochentag). Wochenquests sind nie `required`.
   */
  required: boolean
  completion?: Completion
  /** Erfasster Wert an diesem Tag (0, wenn nichts erfasst). */
  value: number
  /** Ziel an diesem Tag (Snapshot der Erledigung, sonst aktuelles Ziel der Quest; Abhak-Quest: 1). */
  target: number
  done: boolean
  /** Streak bezogen auf diesen Tag. */
  streak: Streak
  /**
   * Nur, wenn die Quest an diesem Tag eine Wochenquest ist (`scheduleOn`): erledigte Tage in der Woche dieses
   * Tages. `target` ist das Wochenziel, das (wie bei der Wochen-Serie) für diese Woche gilt: das vom Montag;
   * war die Quest am Montag keine Wochenquest, das des Tages.
   */
  week?: { done: number; target: number }
  /**
   * XP der Quest an diesem Tag: erledigt die tatsächlich gutgeschriebenen (Schwierigkeit der Erledigung),
   * sonst die, die eine Erledigung jetzt bringen würde (aktuelle Schwierigkeit).
   */
  xp: number
}

export interface DayState {
  day: DayKey
  /**
   * Alle an diesem Tag sichtbaren Quests, sortiert nach `order`:
   * aktive Tagesquests, die an diesem Tag fällig sind, plus alle aktiven Wochenquests.
   */
  habits: HabitStatus[]
  requiredCount: number
  requiredDone: number
  /** requiredCount ≥ 1 und alle Pflicht-Quests erledigt. */
  perfect: boolean
  /** Summe der Quest-XP, die an diesem Tag verdient wurde. */
  questXp: number
  /** Bonus-XP für den Perfekten Tag (0, wenn nicht perfekt). */
  perfectBonusXp: number
}

export interface ChapterState {
  chapter: Chapter
  /** Aktueller Wert (manual: 0/1). */
  current: number
  /** Zielwert (manual: 1). */
  target: number
  /** min(current / target, 1). */
  progress: number
  done: boolean
  /** Tag, an dem das Kapitel abgeschlossen wurde (falls bekannt). */
  doneDay?: DayKey
  /** Nur für 'habit': die referenzierte Quest existiert nicht mehr. */
  brokenReference?: boolean
  /**
   * Nur für Streak-Kapitel: Einheit von `current`. Meist die des aktuellen Rhythmus; wurde das Ziel nur vor
   * einer Umstellung zwischen Tages- und Wochenquest erreicht, die frühere Einheit.
   */
  unit?: 'day' | 'week'
}

export interface MainQuestState {
  quest: MainQuest
  chapters: ChapterState[]
  /** Mittelwert der Kapitel-Fortschritte, 0..1 (0 bei keinem Kapitel). */
  progress: number
  /** Index des ersten nicht abgeschlossenen Kapitels, -1 wenn alle abgeschlossen. */
  currentChapterIndex: number
  /** Mindestens ein Kapitel und alle abgeschlossen. */
  complete: boolean
  /** Tage bis zur Deadline (negativ = überschritten), undefined ohne Deadline. */
  daysLeft?: number
  /** IDs der Quests mit `mainQuestId === quest.id`. */
  linkedHabitIds: string[]
}

export interface GameTotals {
  /** Anzahl erledigter Quest-Tage (Completions mit value ≥ target). */
  questsCompleted: number
  perfectDays: number
  /**
   * Bester Streak über alle Quests (Tage- und Wochen-Streaks getrennt). Zählt auch Serien aus der Zeit vor
   * einer Umstellung zwischen Tages- und Wochenquest (`bestStreakIn`).
   */
  bestDayStreak: number
  bestWeekStreak: number
  /** Tage mit mindestens einer erledigten Quest. */
  activeDays: number
  xpFromQuests: number
  xpFromPerfectDays: number
  xpFromChapters: number
}

export interface GameState {
  today: DayKey
  /** Tag des Abenteuers (1 = Tag der Charaktererstellung). */
  adventureDay: number
  level: LevelInfo
  /** Rang-Titel passend zum Level, z. B. "Wanderer". */
  rank: string
  attributes: Record<AttributeId, AttributeState>
  totals: GameTotals
  todayState: DayState
  mainQuests: MainQuestState[]
}
