import type { WeeklyReview } from '../../domain/types'
import { cn, tintTextColor } from '../../ui'
import { reviewStats } from './reviewText'

export interface ReviewStatListProps {
  review: WeeklyReview
  /** `card`: die Karte auf der Tagesübersicht · `compact`: aufgeklappter Bericht im Tagebuch (etwas kleiner). */
  variant?: 'card' | 'compact'
  className?: string
}

/**
 * Kennzahlen eines Wochenrückblicks als Kacheln (Quests, Perfekte Tage, Streak, stärkstes Attribut, Boss, Ruhetage) –
 * gemeinsam für die Karte „Bericht des Gildenmeisters“ und den aufgeklappten Bericht im Tagebuch, damit beide gleich
 * aussehen: Auf dem Handy zwei Spalten, der Boss mit seinem langen Namen über die ganze Breite (umbrechen statt
 * abschneiden); das stärkste Attribut in seiner (lesbar aufgehellten) Farbe.
 */
export function ReviewStatList({ review, variant = 'card', className }: ReviewStatListProps) {
  const compact = variant === 'compact'
  return (
    <ul
      className={cn(
        'grid grid-cols-2',
        compact ? 'gap-1.5 sm:grid-cols-3' : 'gap-1.5 sm:grid-cols-[repeat(auto-fill,minmax(10rem,1fr))] sm:gap-2',
        className,
      )}
      aria-label="Deine Woche in Zahlen"
    >
      {reviewStats(review).map((stat) => (
        <li
          key={stat.key}
          data-review-stat={stat.key}
          className={cn(
            'flex min-w-0 items-center gap-2 border',
            compact ? 'rounded-lg px-2.5 py-1.5' : 'rounded-xl px-2.5 py-2',
            stat.key === 'boss' && 'max-sm:col-span-2',
            stat.highlight ? 'border-gold/40 bg-gold/8' : compact ? 'border-border bg-surface/60' : 'border-border/70 bg-black/15',
          )}
        >
          <span aria-hidden="true" className={cn('leading-none', compact ? 'text-base' : 'text-lg')}>
            {stat.icon}
          </span>
          <span className="min-w-0">
            <span
              data-review-value=""
              className={cn(
                'block leading-tight font-semibold text-parchment tabular-nums',
                compact ? 'text-[0.8125rem]' : 'text-sm',
                // Boss-Namen sind lang („Schattenfürst der Prokrastination“): umbrechen statt abschneiden.
                stat.key === 'boss' ? 'line-clamp-2 wrap-break-word' : 'truncate',
              )}
              style={stat.color ? { color: tintTextColor(stat.color) } : undefined}
            >
              {stat.value}
            </span>
            <span
              className={cn(
                'block text-[0.6875rem] leading-tight wrap-break-word',
                stat.highlight ? 'text-gold-bright' : 'text-muted',
              )}
            >
              {stat.label}
            </span>
          </span>
        </li>
      ))}
    </ul>
  )
}
