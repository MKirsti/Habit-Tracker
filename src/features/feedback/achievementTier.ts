/**
 * Farben der Erfolgs-Stufen in den Rückmeldungen (Toast-Medaillon, Konfetti). Gold ist das App-Gold
 * (`--color-gold`), Bronze und Silber sind eigene, gedämpfte Metalltöne, die auf den dunklen Flächen klar
 * voneinander und vom Gold zu unterscheiden sind. Sie färben nur Ringe, Leuchten und Konfetti – Text bleibt
 * Pergament bzw. Gold.
 */
import type { AchievementTier } from '../../domain/types'

export const ACHIEVEMENT_TIER_COLORS: Record<AchievementTier, string> = {
  bronze: '#c98a5b',
  silver: '#c3ccd8',
  gold: '#d4a548',
}

/** Konfetti zu einem neuen Erfolg: Gold-Erfolge mit großem Feuerwerk, sonst dezent – in der Farbe der Stufe. */
export function achievementConfetti(tier: AchievementTier): { intensity: 'light' | 'full'; accent: string } {
  return { intensity: tier === 'gold' ? 'full' : 'light', accent: ACHIEVEMENT_TIER_COLORS[tier] }
}
