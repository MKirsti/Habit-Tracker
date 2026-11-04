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

/**
 * - completions: Anzahl erledigter Tage · total: Summe aller Werte · streak: bester Streak
 * - best (Phase 2b): höchster Tageswert einer messbaren Quest, z. B. "30 Minuten am Stück" (nur messbare Quests)
 */
export type ChapterMetric = 'completions' | 'total' | 'streak' | 'best'

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
  | { type: 'habit'; habitId: string; metric: ChapterMetric; target: number }

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
   * Archiviert (beendet bzw. in die Ruhmeshalle gelegt): zählt nicht mehr als aktive Kampagne, erscheint statt
   * in `GameState.mainQuests` in `GameState.archivedMainQuests`; verdiente Kapitel- und Kampagnen-XP bleiben
   * erhalten.
   */
  archived?: boolean
  /** Gesetzt, wenn die Kampagne aus einer Vorlage gestartet wurde. */
  blueprint?: BlueprintRef
  /**
   * Geteilte Quests: Quests, die zu dieser Kampagne gehören, aber (über `mainQuestId`) einer anderen zugeordnet
   * sind – z. B. "Wasser trinken", das beim Installieren einer zweiten Vorlage mitbenutzt statt verdoppelt
   * wurde. Zählen für `MainQuestState.linkedHabitIds`. Fehlt ohne geteilte Quests.
   */
  sharedHabitIds?: string[]
  createdAt: number
}

export interface CharacterProfile {
  name: string
  /** Emoji. */
  avatar: string
  /** Spieltag, an dem das Abenteuer begann. */
  createdDay: DayKey
  /** Sprachform für Klassen und Titel (Phase 3a). Fehlt = 'neutral'. */
  form?: GrammaticalForm
  /** Gewählter Titel (Phase 3a, `TitleDefinition.id`), erscheint unter dem Namen. */
  titleId?: string
  /** Gewählter Avatar-Rahmen (Phase 3a, `FrameDefinition.id`). */
  frameId?: string
  /**
   * Festgehaltener Helden-Seed (Phase 3a, Grundlage von Boss-Wahl, Schwäche und Truhen – `heroSeedOf`). Fehlt =
   * `createdDay + name`. Vom Repository gepflegt: Benennt sich der Held um, bleibt der bisherige Seed hier stehen, damit
   * Umbenennen weder den Boss der Woche noch offene Truhen-Funde neu auswürfelt. Für Seiten nur lesend.
   */
  heroSeed?: string
}

/** Sprachform für Klassen- und Titelnamen: Magierin / Magier / neutral (z. B. „Arkane Seele“). */
export type GrammaticalForm = 'female' | 'male' | 'neutral'

export interface Settings {
  /** Stunde (0–12), zu der ein neuer Spieltag beginnt. Standard: 4 → bis 3:59 Uhr zählt noch zum Vortag. */
  dayStartHour: number
  /** Animationen & Effekte (Konfetti, Level-Up-Szene). */
  effects: boolean
  /**
   * Lebenspunkte (Phase 2b). `enabled: false` = Sanfter Modus (keine HP, kein Schaden, keine Niederlage).
   * `since`: erster Spieltag, ab dem Tage abgerechnet werden (gesetzt beim ersten Abrechnen bzw. beim
   * (Wieder-)Einschalten; davor wird nie rückwirkend abgerechnet).
   */
  penalties?: { enabled: boolean; since?: DayKey }
  /** Die Einführung „Neu: Lebenspunkte“ wurde gesehen. */
  hpIntroSeen?: boolean
  /** Die Einführung „Neu: Klassen, Bosse & Beute“ (Phase 3a) wurde gesehen. */
  combatIntroSeen?: boolean
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
  /** Belohnungen der Schatzkammer (Phase 2a). Fehlt = keine. */
  rewards?: Reward[]
  /** Eingelöste Belohnungen (Gold-Ausgaben). Fehlt = keine. */
  purchases?: Purchase[]
  /** Nebenquests (einmalige Aufgaben). Fehlt = keine. */
  sideQuests?: SideQuest[]
  /** Dauerhaft freigeschaltete Erfolge (einmal erreicht = für immer). Fehlt = keine. */
  achievementUnlocks?: AchievementUnlock[]
  /** Besiegte Wochen-Bosse (Phase 3a, dauerhaft). Fehlt = keine. */
  bossVictories?: BossVictory[]
  /** Gefundene Truhen (Phase 3a, dauerhaft; Inhalt beim Fund festgelegt). Fehlt = keine. */
  chests?: Chest[]
  /** Aus Truhen freigeschaltete Titel/Rahmen (Phase 3a). Bedingungs-Freischaltungen werden abgeleitet. Fehlt = keine. */
  cosmeticUnlocks?: CosmeticUnlock[]
  /** Endgültig abgerechnete Tage (Lebenspunkte, Streak-Schutz, Niederlagen) – Phase 2b. Fehlt = keine. */
  hpLedger?: HpLedgerEntry[]
  /** Urlaub und Ruhetage – Phase 2b. Fehlt = keine. */
  restPeriods?: RestPeriod[]
}

// ---------------------------------------------------------------------------
// Phase 2b: Lebenspunkte, Rast & Urlaub, Gegenstände (gespeicherte Fakten)
// ---------------------------------------------------------------------------

/**
 * Wertung eines Spieltags (eine Wertung pro Tag, egal wie viele Quests/Kampagnen):
 * - perfect: Perfekter Tag · good: ≥ 50 % der Tagesquests · weak: > 0 und < 50 % (oder keine, aber eine andere
 *   Quest erledigt, z. B. eine Wochenquest) · missed: gar keine Quest erledigt
 * - rest: Ruhetag/Urlaub · none: keine Tagesquest fällig (nur Wochenquests o. Ä.)
 * - absent: „Pause“ (Durchhänger-Pause) – ein Tag, der `weak` oder `missed` wäre, nachdem schon
 *   `BALANCING.slumpPauseAfterDays` (3) schadende Tage in Folge (`weak`/`missed` ohne Streak-Schutz) davor liegen:
 *   0 HP, kein Streak-Schutz-Verbrauch; endet mit dem nächsten guten oder perfekten Tag. Ältere Einträge stammen
 *   noch aus der früheren Abwesenheits-Regel (ab dem 4. Tag ohne jede erledigte Quest) – sie bleiben, wie sie sind,
 *   und gelten ebenfalls als laufende Pause.
 */
export type DayScore = 'perfect' | 'good' | 'weak' | 'missed' | 'rest' | 'none' | 'absent'

/**
 * Ein endgültig abgerechneter Tag. Abgerechnet wird ein Tag erst, wenn er nicht mehr nachgetragen werden kann
 * (Tag ≤ heute − backfillDays − 1). Einmal gespeichert, ändert er sich nie mehr – spätere Bearbeitungen wirken
 * nicht rückwirkend auf Lebenspunkte oder Niederlagen.
 */
export interface HpLedgerEntry {
  /** Abgerechneter Spieltag (eindeutig). */
  day: DayKey
  score: DayScore
  /** Ein Streak-Schutz wurde an diesem Tag verbraucht (nur bei weak/missed): kein Schaden, Streaks überstehen den Tag. */
  frozen: boolean
  /** HP-Änderung des Tages (inkl. Heiltränke dieses Tages und Level-Up-Heilung); 0 im Sanften Modus. */
  hpDelta: number
  /** HP nach dem Tag (nach einer Niederlage: wieder voll). */
  hpAfter: number
  /** Max-HP an diesem Tag. */
  maxHp: number
  /** Gesetzt, wenn die HP an diesem Tag auf 0 fielen. */
  defeat?: { goldLost: number }
  /** Lebenspunkte waren an diesem Tag aktiv (sonst nur Streak-Schutz/Wertung). */
  penalties: boolean
}

/** Urlaub bzw. Ruhetag: alle Quests pausieren (keine Pflicht, Streaks überstehen es, keine HP-Wirkung). */
export interface RestPeriod {
  id: string
  /** Erster Tag (inklusive). */
  from: DayKey
  /** Letzter Tag (inklusive). */
  until: DayKey
  /** Optional, z. B. "Urlaub in Italien" oder "Krank". */
  note?: string
  createdAt: number
}

// ---------------------------------------------------------------------------
// Phase 2a: Gold, Schatzkammer, Nebenquests, Erfolge (gespeicherte Fakten)
// ---------------------------------------------------------------------------

/** Eine selbst definierte, echte Belohnung in der Schatzkammer, z. B. "Pizza bestellen" für 400 Gold. */
export interface Reward {
  id: string
  title: string
  /** Emoji. */
  icon: string
  description?: string
  /** Preis in Gold, ganze Zahl ≥ 1. */
  price: number
  /** true = beliebig oft einlösbar; false = einmalig (danach "Eingelöst"). */
  repeatable: boolean
  order: number
  /** Ausgeblendet (nicht mehr kaufbar); bisherige Einlösungen bleiben in der Chronik. */
  archived?: boolean
  createdAt: number
}

/**
 * Eine Gold-Ausgabe. Titel, Icon und Preis sind Momentaufnahmen – spätere Änderungen an der Belohnung ändern
 * die Chronik nicht. `kind` ist für Phase 2b erweiterbar (z. B. Gegenstände wie der Streak-Schutz).
 */
export type ItemId = 'streakFreeze' | 'healingPotion'

export interface Purchase {
  id: string
  /** 'reward' = eigene Belohnung; 'item' = Gegenstand (Phase 2b). */
  kind: 'reward' | 'item'
  rewardId?: string
  /** Nur bei kind 'item'. */
  itemId?: ItemId
  title: string
  icon: string
  price: number
  /** Spieltag des Einlösens. */
  day: DayKey
  createdAt: number
}

/** Einmalige Aufgabe mit XP, z. B. "Steuererklärung". Zählt nicht für den Perfekten Tag, kostet nie etwas. */
export interface SideQuest {
  id: string
  title: string
  /** Emoji. */
  icon: string
  description?: string
  attribute: AttributeId
  difficulty: Difficulty
  /** Optionaler Termin. */
  dueDay?: DayKey
  createdDay: DayKey
  /** Spieltag der Erledigung; fehlt = offen. */
  doneDay?: DayKey
  order: number
}

/** Ein dauerhaft freigeschalteter Erfolg. */
export interface AchievementUnlock {
  /** ID der Erfolgs-Definition. */
  id: string
  /** Spieltag, an dem er (erstmals) freigeschaltet wurde. */
  day: DayKey
}

export type AchievementTier = 'bronze' | 'silver' | 'gold'
export type AchievementCategory = 'consistency' | 'diligence' | 'perfection' | 'campaigns' | 'growth' | 'treasury' | 'special'

/**
 * Kennzahlen, aus denen Erfolge berechnet werden (vom Engine bereitgestellt). Alles bis einschließlich `today`.
 */
export interface AchievementStats {
  questsCompleted: number
  perfectDays: number
  bestDayStreak: number
  bestWeekStreak: number
  activeDays: number
  adventureDay: number
  level: number
  totalXp: number
  attributeLevels: Record<AttributeId, number>
  chaptersCompleted: number
  campaignsCompleted: number
  /** Derzeit aktive Kampagnen (nicht archiviert, nicht abgeschlossen). */
  activeCampaigns: number
  sideQuestsCompleted: number
  purchases: number
  /** Gold aus XP (ohne Erfolgs-Gold – vermeidet Kreisbezüge). */
  goldFromXp: number
  /**
   * Wie oft der Held nach einer Pause von ≥ 7 Tagen ohne erledigte Quest wieder eine Quest erledigt hat
   * ("Phönix"-Erfolg). Gezählt über die Tage mit erledigter Completion (Nebenquests zählen nicht), ab dem ersten
   * aktiven Tag – die Zeit vor der allerersten Erledigung ist keine Pause (`achievements/evaluate.ts`).
   */
  comebacks: number
  /** Anzahl Niederlagen (Phase 2b). */
  defeats: number
  /** Perfekte Tage NACH der ersten Niederlage (für "Unbeugsam"). */
  perfectDaysAfterDefeat: number
  /** Anzahl verbrauchter Streak-Schutz-Gegenstände. */
  freezesUsed: number
}

export interface AchievementDefinition {
  /** Stabil (wird in AchievementUnlock gespeichert), z. B. 'streak-7'. */
  id: string
  title: string
  description: string
  /** Emoji. */
  icon: string
  tier: AchievementTier
  category: AchievementCategory
  /** Gold-Belohnung beim Freischalten (bronze ≈ 25, silver ≈ 75, gold ≈ 200). */
  goldReward: number
  /** Geheim: Titel/Beschreibung erst nach dem Freischalten sichtbar. */
  secret?: boolean
  /** Reine Funktion: aktueller Stand und Ziel; freigeschaltet, sobald current ≥ target. */
  progress(stats: AchievementStats): { current: number; target: number }
}

// ---------------------------------------------------------------------------
// Phase 2a: abgeleiteter Zustand
// ---------------------------------------------------------------------------

export interface GoldState {
  /** floor(level.totalXp × BALANCING.goldPerXp). */
  fromXp: number
  /** Summe der goldReward aller freigeschalteten Erfolge. */
  fromAchievements: number
  /** Gold aus geöffneten Truhen (Phase 3a). */
  fromChests: number
  /** fromXp + fromAchievements + fromChests (Phase 3a). */
  earned: number
  /** Summe aller Purchases. */
  spent: number
  /** Durch Niederlagen verlorenes Gold (Summe `hpLedger[].defeat.goldLost`). */
  lostToDefeats: number
  /** earned − spent − lostToDefeats. Kann nach nachträglichen Änderungen (z. B. gelöschte Quest) negativ werden. */
  balance: number
}

export interface HpState {
  /** Lebenspunkte aktiv (sonst Sanfter Modus – UI blendet HP aus). */
  enabled: boolean
  current: number
  max: number
  /** current / max, 0..1. */
  ratio: number
  /** Letzter endgültig abgerechneter Tag (falls vorhanden). */
  settledThrough?: DayKey
  /**
   * Vorschau für gestern (noch nachtragbar): Wertung und drohende HP-Änderung, falls es so bleibt; ob ein
   * Streak-Schutz ihn retten würde. undefined, wenn gestern nicht relevant ist (vor `since`, schon abgerechnet …).
   */
  yesterday?: { day: DayKey; score: DayScore; threatenedDelta: number; savedByFreeze: boolean }
  /** Anzahl Niederlagen insgesamt. */
  defeats: number
  /** Letzte Niederlage (für die Szene). */
  lastDefeat?: { day: DayKey; goldLost: number }
}

export interface InventoryState {
  /** Vorrätige Streak-Schutz-Gegenstände (gekauft + aus geöffneten Truhen − verbraucht). */
  streakFreezes: number
  /** Gefundene, noch ungeöffnete Truhen (Phase 3a). */
  unopenedChests: number
}

export interface AchievementState {
  definition: AchievementDefinition
  unlocked: boolean
  /** Spieltag der Freischaltung (gespeichert oder – falls noch nicht gespeichert – heute). */
  unlockedDay?: DayKey
  current: number
  target: number
  /** min(current / target, 1). */
  progress: number
}

export interface SideQuestState {
  quest: SideQuest
  done: boolean
  /** Offen und Termin vor heute. */
  overdue: boolean
  /** Termin ist heute. */
  dueToday: boolean
  /** XP bei bzw. für die Erledigung (questXp(difficulty), ohne Streak-Bonus). */
  xp: number
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
   * XP der Quest an diesem Tag **inklusive Streak-Bonus**: erledigt die tatsächlich gutgeschriebenen
   * (Schwierigkeit der Erledigung), sonst die, die eine Erledigung jetzt bringen würde (aktuelle Schwierigkeit).
   * = round(baseXp × (1 + streakBonus)).
   */
  xp: number
  /** XP ohne Streak-Bonus (questXp der maßgeblichen Schwierigkeit). */
  baseXp: number
  /**
   * Streak-Bonus als Anteil (0 … BALANCING.streakBonusMax), siehe ARCHITECTURE.md „Streak-Bonus“:
   * min(streakBonusPerStep × Länge der Serie unmittelbar VOR diesem Tag bzw. dieser Woche, streakBonusMax).
   * Die Einheit (Tage/Wochen) folgt dem Rhythmus **dieses Tages** (`scheduleOn`), siehe `streakRunsBefore`.
   * Offen: der Bonus, den eine Erledigung jetzt bekäme; erledigt: der gutgeschriebene (beides derselbe Wert).
   */
  streakBonus: number
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
  /** Summe der Quest-XP (inklusive Streak-Bonus), die an diesem Tag verdient wurde. Ohne Nebenquests. */
  questXp: number
  /** Bonus-XP für den Perfekten Tag: round(perfectDayBonus × questXp), 0, wenn nicht perfekt. */
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
  /**
   * IDs der Quests der Kampagne: alle mit `mainQuestId === quest.id` plus alle (existierenden) Quests, auf die
   * ein Kapitel verweist oder die in `quest.sharedHabitIds` stehen (geteilte Quests, die einer anderen Kampagne
   * zugeordnet sind). Ohne Doppelte, sortiert nach `order` (dann Titel). Archivierte Quests sind enthalten.
   */
  linkedHabitIds: string[]
  /**
   * Das Attribut, das diese Kampagne am stärksten trainiert – bestimmt ihre Hauptfarbe. Berechnet aus den
   * am Stichtag aktiven Quests in `linkedHabitIds`, gewichtet mit den XP, die sie pro Woche planmäßig bringen
   * (questXp × Termine pro Woche, `src/domain/training.ts`). Gleichstand → das Attribut der zuerst sortierten
   * beteiligten Quest. Ist keine Quest aktiv (alle archiviert oder pausiert), zählt ersatzweise der zuletzt gültige
   * Plan aller bereits angelegten Quests – die Kampagne behält so ihre Farbe, auch beendet in der Ruhmeshalle.
   * `undefined`, wenn gar keine Quest dazugehört (die UI nutzt dann das Haupt-Attribut der Vorlage bzw. Gold).
   */
  dominantAttribute?: AttributeId
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
  /** Quest-XP inklusive Streak-Bonus. */
  xpFromQuests: number
  /** Davon Streak-Bonus. */
  xpFromStreakBonus: number
  xpFromPerfectDays: number
  xpFromChapters: number
  xpFromSideQuests: number
  sideQuestsCompleted: number
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
  /** Nicht archivierte Kampagnen (laufende und abgeschlossene), in gespeicherter Reihenfolge. */
  mainQuests: MainQuestState[]
  /**
   * Archivierte Kampagnen (beendet bzw. in die Ruhmeshalle gelegt) – gleiche Auswertung wie `mainQuests`,
   * in gespeicherter Reihenfolge. Für die Liste „Beendete & gemeisterte Kampagnen“.
   */
  archivedMainQuests: MainQuestState[]
  gold: GoldState
  /** Alle Erfolge in Definitions-Reihenfolge. */
  achievements: AchievementState[]
  /**
   * Nebenquests: zuerst die offenen – mit Termin (nach Termin, Überfällige damit vorn) vor denen ohne, jeweils dann
   * nach `order` und Titel –, danach die heute erledigten (nach `order`). Früher erledigte fehlen.
   */
  sideQuests: SideQuestState[]
  /** Lebenspunkte (Phase 2b). */
  hp: HpState
  inventory: InventoryState
  /** Heute ist Ruhetag/Urlaub. */
  restToday: boolean
  /** Klasse des Helden für die laufende Woche (Phase 3a). */
  heroClass: HeroClassState
  /** Wochen-Boss (Phase 3a). */
  bosses: {
    /** Gegner der laufenden Woche; fehlt, wenn diese Woche kein Schaden geplant ist (keine Quests). */
    current?: WeeklyBossState
    /** Gegner der Vorwoche – nur solange gestern noch zur Vorwoche gehört (Gnadenfrist) und er nicht besiegt ist. */
    previous?: WeeklyBossState
  }
  /** Truhen: gespeicherte (gefunden/geöffnet) plus neu gefundene, noch nicht gespeicherte. */
  chests: Chest[]
  /** Freigeschaltete Titel und Rahmen. */
  cosmetics: { titles: string[]; frames: string[] }
}


// ---------------------------------------------------------------------------
// Phase 3a: Klassen, Kampf, Wochen-Boss, Truhen, Titel & Rahmen
// ---------------------------------------------------------------------------

/** Grundklassen (je ein Attribut), Hybridklassen (zwei Attribute) und der Start-"Abenteurer". */
export type HeroClassId =
  | 'adventurer'
  | 'warrior' | 'mage' | 'druid' | 'bard' | 'paladin' | 'warden'
  | 'battlemage' | 'monk' | 'bannerbearer' | 'berserker' | 'knight'
  | 'archmage' | 'illusionist' | 'healer' | 'runesmith'
  | 'seer' | 'shaman' | 'templar'
  | 'troubadour' | 'warlord'
  | 'sentinel'

export interface HeroClassDefinition {
  id: HeroClassId
  /** Name je Sprachform, z. B. { female: 'Magierin', male: 'Magier', neutral: 'Arkane Seele' }. */
  names: Record<GrammaticalForm, string>
  icon: string
  /** 0 (Abenteurer), 1 (Grundklasse) oder 2 (Hybrid) Attribute. */
  attributes: AttributeId[]
  /** 1–2 Sätze, Du-Form. */
  description: string
}

export interface HeroClassState {
  definition: HeroClassDefinition
  /** Montag der Woche, für die diese Klasse gilt (Klassen wechseln nur zu Wochenbeginn). */
  weekStart: DayKey
  /** Attribut-Level, mit denen in dieser Woche gekämpft wird (Stand Ende des Vortags vor `weekStart`). */
  attributeLevels: Record<AttributeId, number>
  /** Klassen-Bonus je Attribut (0.2 für die Grundklasse, 0.1 je Attribut bei Hybriden). */
  classBonus: Partial<Record<AttributeId, number>>
  /** Klasse der Vorwoche (für die Wechsel-Szene), falls anders. */
  previousId?: HeroClassId
}

export interface BossDefinition {
  id: string
  name: string
  /** Emoji. */
  icon: string
  /** Thema (passt zum stärksten Attribut der geplanten Woche). */
  theme: AttributeId
  /** 1–2 Sätze Flavor. */
  description: string
  /** Satz beim Sieg. */
  defeatLine: string
  /** Satz, wenn er entkommt. */
  escapeLine: string
}

export interface AttackEvent {
  day: DayKey
  source: 'quest' | 'sideQuest'
  /** habitId bzw. sideQuestId. */
  sourceId: string
  attribute: AttributeId
  /** Name des Angriffs der Attribut-Art, z. B. "Arkaner Blitz". */
  attackName: string
  damage: number
  /** Traf die Schwäche des Bosses. */
  weakness: boolean
}

export interface WeeklyBossState {
  boss: BossDefinition
  weekStart: DayKey
  /** Sonntag der Woche. */
  weekEnd: DayKey
  weakness: AttributeId
  maxHp: number
  /** Summe des Schadens (gedeckelt auf maxHp für die Anzeige; `damage` selbst ungedeckelt). */
  damage: number
  /** max(0, maxHp − damage). */
  hp: number
  defeated: boolean
  /** Tag, an dem der Schaden maxHp erreichte (oder gespeicherter Sieg). */
  defeatedDay?: DayKey
  /** Restliche Tage inkl. heute (0 nach Sonntag). */
  daysLeft: number
  /** Alle Angriffe der Woche, chronologisch. */
  attacks: AttackEvent[]
}

/** Dauerhafter Boss-Sieg (Bestiarium). */
export interface BossVictory {
  /** Montag der Woche (eindeutig). */
  weekStart: DayKey
  bossId: string
  day: DayKey
  maxHp: number
}

export type ChestRarity = 'common' | 'uncommon' | 'rare' | 'legendary'
export type ChestSource = 'boss' | 'quest' | 'chapter'
export type ChestContent =
  | { kind: 'gold'; amount: number }
  | { kind: 'item'; itemId: 'streakFreeze' }
  | { kind: 'cosmetic'; cosmeticKind: 'title' | 'frame'; cosmeticId: string }

export interface Chest {
  /** Deterministisch: 'boss:<weekStart>', 'quest:<completionId>', 'chapter:<questId>:<chapterId>'. */
  id: string
  source: ChestSource
  foundDay: DayKey
  rarity: ChestRarity
  /** Beim Fund deterministisch festgelegt. */
  content: ChestContent
  /** Zeitpunkt des Öffnens (epoch ms); fehlt = ungeöffnet. */
  openedAt?: number
}

export interface CosmeticUnlock {
  id: string
  kind: 'title' | 'frame'
  day: DayKey
  source: 'chest'
}

/** Bedingung, unter der ein Titel/Rahmen freigeschaltet ist (abgeleitet, dauerhaft über gespeicherte Fakten). */
export type CosmeticCondition =
  | { type: 'achievement'; achievementId: string }
  | { type: 'bossVictories'; count: number }
  | { type: 'bossDefeated'; bossId: string }
  | { type: 'campaignsMastered'; count: number }
  | { type: 'level'; level: number }
  | { type: 'chest' }
  | { type: 'always' }

export interface TitleDefinition {
  id: string
  /** Je Sprachform, z. B. { female: 'die Unbeugsame', male: 'der Unbeugsame', neutral: 'unbeugsam' }. */
  names: Record<GrammaticalForm, string>
  condition: CosmeticCondition
  /** Wie man ihn bekommt (für gesperrte Titel). */
  hint: string
  rarity: ChestRarity
}

export interface FrameDefinition {
  id: string
  name: string
  condition: CosmeticCondition
  hint: string
  rarity: ChestRarity
  /** Darstellung: Farben/Verlauf für den Ring (CSS-Farben). */
  colors: string[]
}
