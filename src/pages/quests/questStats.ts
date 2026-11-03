/**
 * Kennzahlen für die Quest-Verwaltung – einmal pro Datenstand über alle Erledigungen berechnet.
 */
import { BALANCING } from '../../domain/balancing'
import type { CampaignDeletionImpact, DeletionImpact } from '../../domain/deletion'
import { isDone, questXp } from '../../domain/schedule'
import type { Completion, DayKey, Habit, Streak } from '../../domain/types'
import { computeStreak } from '../../domain/streaks'
import { formatNumber } from '../../ui'

export interface HabitStats {
  /** Tage (≤ heute), an denen die Quest erledigt war. */
  doneDays: Set<DayKey>
  /** Summe der Quest-XP aus allen erledigten Tagen (≤ heute). */
  xp: number
}

const EMPTY_STATS: Readonly<HabitStats> = { doneDays: new Set(), xp: 0 }

/** Indiziert die Erledigungen einmal: Quest-ID → erledigte Tage und verdiente Quest-XP. */
export function buildHabitStats(completions: readonly Completion[], today: DayKey): Map<string, HabitStats> {
  const stats = new Map<string, HabitStats>()
  for (const completion of completions) {
    // DayKeys ('YYYY-MM-DD') lassen sich als Text vergleichen – und kaputte Werte werfen dabei nicht.
    if (!isDone(completion) || !(completion.day <= today)) continue
    let entry = stats.get(completion.habitId)
    if (!entry) stats.set(completion.habitId, (entry = { doneDays: new Set(), xp: 0 }))
    // Pro Quest und Tag zählt höchstens ein Eintrag (wie in der Engine).
    if (entry.doneDays.has(completion.day)) continue
    entry.doneDays.add(completion.day)
    entry.xp += questXp(completion.difficulty)
  }
  return stats
}

export function statsFor(stats: ReadonlyMap<string, HabitStats>, habitId: string): Readonly<HabitStats> {
  return stats.get(habitId) ?? EMPTY_STATS
}

/** Aktuelle und beste Serie einer Quest zum heutigen Tag. */
export function habitStreak(habit: Habit, stats: ReadonlyMap<string, HabitStats>, today: DayKey): Streak {
  return computeStreak(habit, statsFor(stats, habit.id).doneDays, today)
}

/**
 * Ist die Quest heute (oder schon früher) archiviert? Dieselbe Regel wie im Repository (`moveHabit`,
 * `archiveHabit`) und auf den übrigen Seiten.
 */
export { isArchivedOn } from '../../domain/schedule'

/** "1 Tag", "5 Tage", "1 Woche", "3 Wochen". */
export function formatStreakUnit(count: number, unit: Streak['unit']): string {
  if (unit === 'week') return count === 1 ? 'Woche' : 'Wochen'
  return count === 1 ? 'Tag' : 'Tage'
}

// ---------------------------------------------------------------------------
// Texte für die Rückfrage vor dem Löschen
// ---------------------------------------------------------------------------

/** "„A“", "„A“ und „B“", "„A“, „B“ und „C“". */
function quotedList(titles: readonly string[]): string {
  const quoted = titles.map((title) => `„${title}“`)
  if (quoted.length <= 1) return quoted.join('')
  return `${quoted.slice(0, -1).join(', ')} und ${quoted[quoted.length - 1]}`
}

/** "−100 XP" (mit echtem Minuszeichen, Zahl de-DE). */
function minusXp(xp: number): string {
  return `−${formatNumber(xp)} XP`
}

/** Level-Wechsel durch das Löschen, z. B. "Level 3 → 1" – `undefined`, wenn das Level gleich bleibt. */
export function levelChangeText(impact: Pick<DeletionImpact, 'levelBefore' | 'levelAfter'>): string | undefined {
  if (impact.levelBefore === impact.levelAfter) return undefined
  return `Level ${formatNumber(impact.levelBefore)} → ${formatNumber(impact.levelAfter)}`
}

/**
 * Was eine Kampagne durch das Löschen verliert, z. B. "Kapitel „Funke“ verliert seinen Abschluss (−100 XP);
 * die Kampagne „Gelehrter“ ist dann nicht mehr gemeistert (−500 XP)." – `undefined`, wenn kein Abschluss
 * verloren geht (offene Kapitel beschreibt der allgemeine Hinweis zum Fortschritt).
 */
export function chapterLossText(campaign: CampaignDeletionImpact): string | undefined {
  const { lostChapters, losesCompletion, quest } = campaign
  if (lostChapters.length === 0) return undefined
  const titles = quotedList(lostChapters.map((chapter) => chapter.title))
  const xp = minusXp(lostChapters.length * BALANCING.chapterXp)
  let text =
    lostChapters.length === 1
      ? `Kapitel ${titles} verliert seinen Abschluss (${xp})`
      : `Die Kapitel ${titles} verlieren ihren Abschluss (${xp})`
  if (losesCompletion) {
    text += `; die Kampagne „${quest.title}“ ist dann nicht mehr gemeistert (${minusXp(BALANCING.mainQuestXp)})`
  }
  return `${text}.`
}
