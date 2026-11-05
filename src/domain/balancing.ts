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
  /**
   * Durchhänger-Pause: Nach so vielen schadenden Tagen in Folge (`weak`/`missed` ohne Streak-Schutz; Ruhetage,
   * „none“-Tage und aufgefangene Tage zählen nicht mit und brechen die Folge nicht) ist jeder weitere schwache oder
   * verpasste Tag `absent` („Pause“: 0 HP, kein Streak-Schutz-Verbrauch) – bis zum nächsten guten oder perfekten Tag.
   * Ein Durchhänger kostet so höchstens 3 schadende Tage (≤ 3 × −6 = −18 HP).
   */
  slumpPauseAfterDays: 3,
  /** Anteil des Gold-Guthabens, der bei einer Niederlage verloren geht. */
  defeatGoldLoss: 0.15,
  /** Höchstens so viel Gold kostet eine Niederlage. */
  defeatGoldLossMax: 100,
  /** Gegenstände der Schatzkammer. */
  items: {
    streakFreeze: { price: 150, max: 5 },
    healingPotion: { price: 80, heal: 20 },
  },
  /** Kampf (Phase 3a). */
  combat: {
    /** +10 % Schaden je Attribut-Level über 1. */
    attributeBonusPerLevel: 0.1,
    /** Klassen-Bonus: Grundklasse +20 % auf ihr Attribut, Hybrid +10 % auf beide. */
    classBonus: 0.2,
    hybridClassBonus: 0.1,
    /** Ab diesem Attribut-Level gibt es eine echte Klasse (vorher "Abenteurer"). */
    classMinLevel: 3,
    /** Hybrid, wenn die zwei stärksten Attribute höchstens so weit auseinander liegen (beide ≥ classMinLevel). */
    hybridMaxLevelGap: 1,
    /** Schaden gegen die Schwäche des Bosses. */
    weaknessMultiplier: 1.5,
    /** Boss-HP = Anteil des geplanten Wochenschadens. */
    bossHpShare: 0.7,
    /** Untergrenze der Boss-HP (bei geplanter Wirkung > 0). */
    bossMinHp: 60,
  },
  /** Beutetruhen (Phase 3a). */
  chests: {
    /** Chance je erledigter Quest (deterministisch je Erledigung). */
    questDropChance: 0.1,
    maxQuestChestsPerDay: 1,
    /** Gewichte der Seltenheiten (Summe 100). */
    rarityWeights: { common: 70, uncommon: 22, rare: 7, legendary: 1 },
    /** Halbiert (vom Spieler gewünscht): Truhen sollen das Gold-Gefüge nicht sprengen. */
    gold: { common: [10, 25], uncommon: [30, 50] },
    /** Ersatz-Gold, wenn ein Streak-Schutz den vollen Vorrat überschreiten würde (halbiert wie das übrige Truhen-Gold). */
    freezeFallbackGold: 50,
  },
  /** Gefährte (Phase 3b). */
  companion: {
    /** Stufe ab so vielen aktiven Tagen insgesamt: Jungtier, Gefährte, Erwachsen, Legendär. */
    stageDays: [0, 14, 60, 180],
    /** Bonus-Treffer an einem Perfekten Tag: Anteil des Quest-Schadens dieses Tages. */
    perfectDayHitShare: 0.1,
    /** Schläft nach so vielen Tagen ohne erledigte Quest (oder in einer Durchhänger-Pause). */
    sleepAfterInactiveDays: 3,
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
