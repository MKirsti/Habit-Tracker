/**
 * Anzeige der Erfolge (Held → Erfolge): Gruppierung nach Kategorie, Zusammenfassung, Stufenfarben und Texte.
 * Reine Funktionen über `GameState.achievements`.
 */
import {
  ACHIEVEMENT_CATEGORY_LABELS,
  ACHIEVEMENT_CATEGORY_ORDER,
  ACHIEVEMENT_TIER_LABELS,
} from '../../domain/achievements/definitions'
import type { AchievementCategory, AchievementState, AchievementTier, DayKey } from '../../domain/types'
import { ACHIEVEMENT_TIER_COLORS } from '../../features/feedback/achievementTier'
import { formatNumber } from '../../ui/format'

export const ACHIEVEMENT_TIERS: readonly AchievementTier[] = ['bronze', 'silver', 'gold']

/**
 * Farben der Stufen (Rahmen, Leuchten, Abzeichen) – dieselben wie im Erfolgs-Toast und im Konfetti
 * (`features/feedback/achievementTier.ts`), damit ein Erfolg überall gleich aussieht. Gold = das App-Gold
 * (`--color-gold`). Als Schrift immer über `tintTextColor`/`Badge color` bzw. `--accent-text` (leicht mit
 * Pergament aufgehellt).
 */
export const TIER_COLORS: Record<AchievementTier, string> = ACHIEVEMENT_TIER_COLORS

export { ACHIEVEMENT_TIER_LABELS }

export interface AchievementGroup {
  category: AchievementCategory
  label: string
  achievements: AchievementState[]
  unlocked: number
}

/** Erfolge nach Kategorie in Anzeige-Reihenfolge; leere Kategorien entfallen. Innerhalb: Definitions-Reihenfolge. */
export function groupAchievements(achievements: readonly AchievementState[]): AchievementGroup[] {
  return ACHIEVEMENT_CATEGORY_ORDER.flatMap((category) => {
    const items = achievements.filter((achievement) => achievement.definition.category === category)
    if (items.length === 0) return []
    return [
      {
        category,
        label: ACHIEVEMENT_CATEGORY_LABELS[category],
        achievements: items,
        unlocked: items.filter((achievement) => achievement.unlocked).length,
      },
    ]
  })
}

export interface AchievementSummary {
  unlocked: number
  total: number
  /** Je Stufe: freigeschaltet / insgesamt. */
  byTier: Record<AchievementTier, { unlocked: number; total: number }>
}

export function summarizeAchievements(achievements: readonly AchievementState[]): AchievementSummary {
  const byTier: AchievementSummary['byTier'] = {
    bronze: { unlocked: 0, total: 0 },
    silver: { unlocked: 0, total: 0 },
    gold: { unlocked: 0, total: 0 },
  }
  let unlocked = 0
  for (const achievement of achievements) {
    const tier = byTier[achievement.definition.tier]
    tier.total += 1
    if (achievement.unlocked) {
      tier.unlocked += 1
      unlocked += 1
    }
  }
  return { unlocked, total: achievements.length, byTier }
}

/** Geheim und noch nicht freigeschaltet: Titel, Beschreibung und Fortschritt bleiben verborgen. */
export function isHidden(achievement: AchievementState): boolean {
  return achievement.definition.secret === true && !achievement.unlocked
}

/** „7 / 30“ (de-DE). */
export function progressText(achievement: Pick<AchievementState, 'current' | 'target'>): string {
  return `${formatNumber(Math.floor(achievement.current))} / ${formatNumber(achievement.target)}`
}

const unlockDateFormatter = new Intl.DateTimeFormat('de-DE', {
  timeZone: 'UTC',
  day: 'numeric',
  month: 'long',
  year: 'numeric',
})

/** Tag der Freischaltung ohne Wochentag, z. B. „4. November 2026“ (passt in schmale Karten). */
export function formatUnlockDate(day: DayKey): string {
  const [year, month, date] = day.split('-').map(Number)
  return unlockDateFormatter.format(new Date(Date.UTC(year, month - 1, date)))
}

/** „12 / 31 freigeschaltet“. */
export function unlockedText(unlocked: number, total: number): string {
  return `${formatNumber(unlocked)} / ${formatNumber(total)} freigeschaltet`
}

export const SECRET_TITLE = '???'
export const SECRET_DESCRIPTION = 'Ein geheimer Erfolg – er zeigt sich erst, wenn du ihn erreichst.'
