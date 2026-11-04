/**
 * Test-Hilfen: kleine Fabriken für Domain-Objekte mit sinnvollen Standardwerten.
 * Nur für Tests gedacht – im App-Code wird diese Datei nicht importiert.
 */
import { ATTRIBUTE_IDS } from './attributes'
import { DEFAULT_SETTINGS } from './balancing'
import { dayRange } from './dates'
import type {
  AchievementDefinition,
  AchievementStats,
  AttributeId,
  Chapter,
  Completion,
  DayKey,
  GameData,
  Habit,
  MainQuest,
  Purchase,
  Reward,
  SideQuest,
} from './types'

export function makeHabit(overrides: Partial<Habit> & Pick<Habit, 'id'>): Habit {
  return {
    title: `Quest ${overrides.id}`,
    icon: '⭐',
    attribute: 'discipline',
    difficulty: 'medium',
    schedule: { type: 'daily' },
    order: 0,
    createdDay: '2026-01-01',
    ...overrides,
  }
}

/**
 * Completion zu einer Quest. Standard: erledigt (value = target), Snapshots aus der Quest.
 * Mit `value` < target entsteht ein Teilfortschritt.
 */
export function makeCompletion(habit: Habit, day: DayKey, overrides: Partial<Completion> = {}): Completion {
  const target = habit.measure?.target ?? 1
  return {
    id: `${habit.id}:${day}`,
    habitId: habit.id,
    day,
    value: target,
    target,
    difficulty: habit.difficulty,
    attribute: habit.attribute,
    updatedAt: 0,
    ...overrides,
  }
}

/** Erledigte Completions für alle Tage von `from` bis `to` (inklusive). */
export function completeRange(habit: Habit, from: DayKey, to: DayKey): Completion[] {
  return dayRange(from, to).map((day) => makeCompletion(habit, day))
}

/** Set von Tagen, z. B. für `computeStreak`. */
export function daySet(...days: DayKey[]): Set<DayKey> {
  return new Set(days)
}

/** Set aller Tage von `from` bis `to` (inklusive). */
export function daySetRange(from: DayKey, to: DayKey): Set<DayKey> {
  return new Set(dayRange(from, to))
}

export function makeChapter(overrides: Partial<Chapter> & Pick<Chapter, 'id' | 'criterion'>): Chapter {
  return { title: `Kapitel ${overrides.id}`, ...overrides }
}

export function makeMainQuest(overrides: Partial<MainQuest> & Pick<MainQuest, 'id'>): MainQuest {
  return {
    title: `Kampagne ${overrides.id}`,
    icon: '📚',
    why: 'Weil es mir wichtig ist.',
    reward: 'Ein neues Buch',
    startDay: '2026-01-01',
    chapters: [],
    createdAt: 0,
    ...overrides,
  }
}

/**
 * Deterministischer Zufallsgenerator (mulberry32) für reproduzierbare Zufallstests.
 * Liefert Zahlen in [0, 1). Gleicher `seed` → gleiche Folge.
 */
export function seededRandom(seed: number): () => number {
  let state = seed >>> 0
  return () => {
    state = (state + 0x6d2b79f5) >>> 0
    let t = state
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4_294_967_296
  }
}

export function makeGameData(overrides: Partial<GameData> = {}): GameData {
  return {
    settings: { ...DEFAULT_SETTINGS },
    habits: [],
    completions: [],
    mainQuests: [],
    ...overrides,
  }
}

// ---------------------------------------------------------------------------
// Phase 2a: Schatzkammer, Nebenquests, Erfolge
// ---------------------------------------------------------------------------

export function makeReward(overrides: Partial<Reward> & Pick<Reward, 'id'>): Reward {
  return {
    title: `Belohnung ${overrides.id}`,
    icon: '🍕',
    price: 100,
    repeatable: true,
    order: 0,
    createdAt: 0,
    ...overrides,
  }
}

/** Eine Einlösung (Standard: 100 Gold am 2026-01-01). Mit `reward` werden Titel, Icon und Preis übernommen. */
export function makePurchase(overrides: Partial<Purchase> & Pick<Purchase, 'id'>, reward?: Reward): Purchase {
  return {
    kind: 'reward',
    title: reward?.title ?? `Einlösung ${overrides.id}`,
    icon: reward?.icon ?? '🍕',
    price: reward?.price ?? 100,
    day: '2026-01-01',
    createdAt: 0,
    ...(reward ? { rewardId: reward.id } : {}),
    ...overrides,
  }
}

export function makeSideQuest(overrides: Partial<SideQuest> & Pick<SideQuest, 'id'>): SideQuest {
  return {
    title: `Nebenquest ${overrides.id}`,
    icon: '📜',
    attribute: 'discipline',
    difficulty: 'medium',
    createdDay: '2026-01-01',
    order: 0,
    ...overrides,
  }
}

/** Kennzahlen für Erfolge: alles 0 (Level und Attribut-Level 1, Abenteuertag 1), einzelne Werte überschreibbar. */
export function makeAchievementStats(overrides: Partial<AchievementStats> = {}): AchievementStats {
  const attributeLevels = Object.fromEntries(ATTRIBUTE_IDS.map((id) => [id, 1])) as Record<AttributeId, number>
  return {
    questsCompleted: 0,
    perfectDays: 0,
    bestDayStreak: 0,
    bestWeekStreak: 0,
    activeDays: 0,
    adventureDay: 1,
    level: 1,
    totalXp: 0,
    attributeLevels,
    chaptersCompleted: 0,
    campaignsCompleted: 0,
    activeCampaigns: 0,
    sideQuestsCompleted: 0,
    purchases: 0,
    goldFromXp: 0,
    comebacks: 0,
    ...overrides,
  }
}

/**
 * Erfolgs-Definition für Tests: freigeschaltet, sobald `read(stats) ≥ target`.
 * Mit `deriveGameState(data, today, { achievements: [...] })` lassen sich so auch die Kennzahlen der Engine prüfen.
 */
export function makeAchievement(
  id: string,
  read: (stats: AchievementStats) => number,
  target: number,
  overrides: Partial<AchievementDefinition> = {},
): AchievementDefinition {
  return {
    id,
    title: `Erfolg ${id}`,
    description: 'Ein Erfolg für Tests.',
    icon: '🏅',
    tier: 'bronze',
    category: 'special',
    goldReward: 25,
    progress: (stats) => ({ current: read(stats), target }),
    ...overrides,
  }
}
