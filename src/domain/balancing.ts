import type { Difficulty } from './types'

/**
 * Alle Spielzahlen an einem Ort. Änderungen wirken rückwirkend auf den gesamten
 * Spielstand, weil Level & Co. immer aus den gespeicherten Erledigungen berechnet werden.
 */
export const BALANCING = {
  /** XP pro erledigter Quest nach Schwierigkeit. */
  questXp: { easy: 10, medium: 20, hard: 40, epic: 80 } satisfies Record<Difficulty, number>,
  /** Charakter-Level: XP für Level n → n+1 = round(base × n^exponent). */
  levelCurve: { base: 100, exponent: 1.5 },
  /** Attribut-Level: XP für Level n → n+1 = round(base × n^exponent). Flacher als die Charakter-Kurve. */
  attributeCurve: { base: 40, exponent: 1.25 },
  /** Perfekter Tag: Bonus = round(Anteil × Quest-XP dieses Tages). */
  perfectDayBonus: 0.25,
  /** Bonus-XP pro abgeschlossenem Kapitel. */
  chapterXp: 100,
  /** Bonus-XP für eine komplett abgeschlossene Kampagne. */
  mainQuestXp: 500,
  /** Wie viele Tage rückwirkend Quests nachgetragen werden dürfen. */
  backfillDays: 1,
  /** Gold pro XP (alle XP-Quellen). */
  goldPerXp: 0.5,
  /** Streak-Bonus pro Serien-Schritt vor dem Tag bzw. der Woche (+5 %). */
  streakBonusPerStep: 0.05,
  /** Höchster Streak-Bonus (+50 %, erreicht nach 10 Schritten in Folge). */
  streakBonusMax: 0.5,
  /** Gold-Belohnung für Erfolge je Stufe (Richtwerte für die Definitionen). */
  achievementGold: { bronze: 25, silver: 75, gold: 200 },
  /** Lebenspunkte (Phase 2b): Max-HP = hpBase + hpPerLevel × Level (Level 1 → 50). */
  hpBase: 45,
  hpPerLevel: 5,
  /** HP-Wirkung je Tageswertung (eine Wertung pro Tag; Wochenquests kosten nie etwas). */
  hpByScore: { perfect: 10, good: 2, weak: -1, missed: -6, rest: 0, none: 0, absent: 0 },
  /** Nach so vielen Tagen in Folge ohne jede erledigte Quest gilt der Held als abwesend (ab dem 4. kein Schaden mehr). */
  absentAfterDays: 3,
  /** Anteil des Gold-Guthabens, der bei einer Niederlage verloren geht. */
  defeatGoldLoss: 0.15,
  /** Höchstens so viel Gold kostet eine Niederlage. */
  defeatGoldLossMax: 100,
  /** Gegenstände der Schatzkammer. */
  items: {
    streakFreeze: { price: 150, max: 5 },
    healingPotion: { price: 80, heal: 20 },
  },
  /** Höchstens so viele aktive Kampagnen gleichzeitig (aktiv = nicht archiviert und nicht abgeschlossen). */
  maxActiveCampaigns: 3,
  /** Sicherheitsgrenze für Level-Berechnungen. */
  maxLevel: 999,
} as const

export const DIFFICULTY_META: Record<Difficulty, { label: string; short: string }> = {
  easy: { label: 'Leicht', short: 'I' },
  medium: { label: 'Mittel', short: 'II' },
  hard: { label: 'Schwer', short: 'III' },
  epic: { label: 'Episch', short: 'IV' },
}

export const DIFFICULTIES: Difficulty[] = ['easy', 'medium', 'hard', 'epic']

/** Rang-Titel nach Mindest-Level (aufsteigend sortiert). */
export const RANKS: { minLevel: number; title: string }[] = [
  { minLevel: 1, title: 'Novize' },
  { minLevel: 3, title: 'Lehrling' },
  { minLevel: 5, title: 'Wanderer' },
  { minLevel: 8, title: 'Abenteurer' },
  { minLevel: 12, title: 'Veteran' },
  { minLevel: 16, title: 'Held' },
  { minLevel: 20, title: 'Champion' },
  { minLevel: 25, title: 'Meister' },
  { minLevel: 30, title: 'Legende' },
  { minLevel: 40, title: 'Mythos' },
]

export const DEFAULT_SETTINGS = {
  dayStartHour: 4,
  effects: true,
} as const
