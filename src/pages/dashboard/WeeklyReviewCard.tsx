import { ScrollText } from 'lucide-react'
import type { MouseEvent } from 'react'
import { useId, useState } from 'react'
import { markWeeklyReviewSeen } from '../../data/repository'
import type { WeeklyReview } from '../../domain/types'
import { Button, Card, cn, useToast } from '../../ui'
import { focusIsLost } from '../treasury/focus'
import { nextTabbableAfter } from './dashboardFocus'
import { ReviewStatList } from './ReviewStatList'
import { REVIEW_TITLE, reviewWeekLabel, reviewXpChange, reviewXpLabel } from './reviewText'

export interface WeeklyReviewCardProps {
  /** `state.weeklyReview` – der Rückblick der Vorwoche, solange er nicht weggeklickt ist. */
  review: WeeklyReview
}

/**
 * Wochenrückblick „Bericht des Gildenmeisters“ (Phase 3b): XP der Vorwoche mit ▲/▼ gegenüber der Woche davor, Kacheln
 * mit erledigten Quests, Perfekten Tagen, bestem Streak, stärkstem Attribut, dem Boss (besiegt / entwischt) und ggf.
 * Ruhetagen – dazu der ermutigende Satz des Gildenmeisters. „Weiter“ merkt sich die Woche (`markWeeklyReviewSeen`);
 * nachlesen lässt sich der Bericht im Tagebuch der Heldenseite.
 */
export function WeeklyReviewCard({ review }: WeeklyReviewCardProps) {
  const titleId = useId()
  const weekId = useId()
  const { toast } = useToast()
  const [busy, setBusy] = useState(false)
  const change = reviewXpChange(review)

  async function confirm(event: MouseEvent<HTMLButtonElement>) {
    // Die Karte verschwindet gleich samt Knopf: Der Fokus wandert zum nächsten Bedienelement darunter.
    const card = event.currentTarget.closest('[data-weekly-review]')
    const next = card ? nextTabbableAfter(card) : null
    setBusy(true)
    try {
      await markWeeklyReviewSeen(review.weekStart)
      if (next?.isConnected && focusIsLost()) next.focus({ preventScroll: true })
    } catch (error) {
      toast({
        tone: 'error',
        title: 'Das hat nicht geklappt',
        description: error instanceof Error ? error.message : 'Bitte versuche es noch einmal.',
      })
      setBusy(false)
    }
  }

  return (
    <Card
      as="section"
      aria-labelledby={`${titleId} ${weekId}`}
      padding="none"
      tone="gold"
      className="mb-5 md:mb-6"
      data-weekly-review={review.weekStart}
    >
      <div className="px-4 pt-4 pb-3.5 sm:px-5 sm:pt-5 sm:pb-4">
        <div className="flex items-start gap-3">
          <span
            aria-hidden="true"
            className="grid size-10 shrink-0 place-items-center rounded-xl bg-black/25 text-gold ring-1 ring-gold/25 ring-inset"
          >
            <ScrollText className="size-5" />
          </span>
          <div className="min-w-0 flex-1">
            <p id={weekId} className="text-[0.6875rem] font-semibold tracking-[0.18em] text-gold uppercase">
              {reviewWeekLabel(review.weekStart)}
            </p>
            <h2 id={titleId} className="font-display text-[1.0625rem] leading-snug font-semibold tracking-wide text-parchment">
              {REVIEW_TITLE}
            </h2>
          </div>
          <div className="shrink-0 text-right" data-review-xp={review.xp}>
            <p className="font-display text-lg leading-tight font-bold text-gold-bright tabular-nums">{reviewXpLabel(review.xp)}</p>
            {change && (
              <p
                className={cn('text-xs font-semibold tabular-nums', change.trend === 'up' ? 'text-success' : 'text-muted')}
                data-review-trend={change.trend}
              >
                <span className="sr-only">{change.spoken}</span>
                <span aria-hidden="true">
                  {change.arrow} {change.text}
                </span>
              </p>
            )}
          </div>
        </div>

        <ReviewStatList review={review} className="mt-3" />

        <figure className="mt-3.5 border-l-2 border-gold/40 pl-3">
          <blockquote className="text-sm leading-relaxed text-parchment/90 italic sm:text-[0.9375rem]">„{review.line}“</blockquote>
          <figcaption className="mt-0.5 text-xs text-muted">– der Gildenmeister</figcaption>
        </figure>
      </div>
      <div className="flex justify-end px-4 pb-4 sm:px-5 sm:pb-5">
        <Button onClick={(event) => void confirm(event)} loading={busy} className="max-sm:w-full">
          Weiter
        </Button>
      </div>
    </Card>
  )
}
