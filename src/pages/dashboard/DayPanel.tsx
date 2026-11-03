import { CalendarArrowLeft, Crown, Sparkles, Star, Tent } from 'lucide-react'
import { motion } from 'motion/react'
import { useId } from 'react'
import { formatDay } from '../../domain/dates'
import type { DayState } from '../../domain/types'
import { Card, ProgressBar, SegmentedControl, cn, formatNumber } from '../../ui'
import { countLabel, dayOffsetLabel, dayOffsetWord, perfectBonusPercent } from './dashboardText'

export interface DayPanelProps {
  dayState: DayState
  /** Gewählter Tag als Abstand zu heute (0 = heute, 1 = gestern). */
  offset: number
  /** Wählbare Abstände; bei nur einem Eintrag wird kein Umschalter gezeigt. */
  offsets: readonly number[]
  onOffsetChange: (offset: number) => void
}

/** Tagesumschalter (Heute/Gestern), Nachtrag-Hinweis und Tagesbilanz mit Perfektem Tag. */
export function DayPanel({ dayState, offset, offsets, onOffsetChange }: DayPanelProps) {
  const titleId = useId()
  const { requiredCount, requiredDone, perfect, perfectBonusXp, questXp } = dayState
  const word = dayOffsetWord(offset)
  const backfill = offset > 0
  // Wochenquest an diesem Tag (damals gültiger Rhythmus, nicht `habit.schedule`).
  const weeklyOpen = dayState.habits.some((status) => status.week !== undefined)

  return (
    <Card
      tone={perfect ? 'gold' : 'default'}
      aria-labelledby={titleId}
      className={cn('transition-[border-color,box-shadow] duration-500', perfect && 'shadow-glow')}
    >
      <h2 id={titleId} className="sr-only">
        Tagesbilanz {word}
      </h2>

      {offsets.length > 1 && (
        <SegmentedControl
          aria-label="Tag wählen"
          value={offset}
          onChange={onOffsetChange}
          options={offsets.map((value) => ({ value, label: dayOffsetLabel(value) }))}
          className="mb-4"
        />
      )}

      {/* Nachtrag-Hinweis: wird beim Erscheinen vorgelesen. */}
      <div aria-live="polite">
        {backfill && (
          <motion.p
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            className="mb-4 flex items-start gap-2.5 rounded-xl border border-info/35 bg-info/10 px-3.5 py-2.5 text-sm text-parchment"
          >
            <CalendarArrowLeft aria-hidden className="mt-0.5 size-4 shrink-0 text-info" />
            <span>
              <strong className="font-semibold text-info">Du trägst für {word} nach</strong>
              <span className="block text-xs text-muted">
                {formatDay(dayState.day)} – Häkchen und Werte gelten für diesen Tag.
              </span>
            </span>
          </motion.p>
        )}
      </div>

      {requiredCount > 0 ? (
        <>
          <ProgressBar
            value={requiredDone / requiredCount}
            size="md"
            glow={perfect}
            label={<span className="font-medium">Tagesfortschritt</span>}
            valueLabel={
              <>
                <span className={cn('font-semibold', perfect ? 'text-gold-bright' : 'text-parchment')}>
                  {formatNumber(requiredDone)} / {formatNumber(requiredCount)}
                </span>{' '}
                Tagesquests
              </>
            }
            valueText={`${formatNumber(requiredDone)} von ${formatNumber(requiredCount)} Tagesquests erledigt`}
          />
          <div role="status" className="mt-3.5">
            {perfect ? (
              <motion.p
                key="perfect"
                initial={{ opacity: 0, scale: 0.96 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ type: 'spring', stiffness: 380, damping: 22 }}
                className="flex items-center gap-2.5"
              >
                <span
                  aria-hidden="true"
                  className="grid size-9 shrink-0 place-items-center rounded-full bg-gold/15 text-gold-bright ring-1 ring-gold/45 [&_svg]:size-[1.125rem]"
                >
                  <Crown />
                </span>
                <span className="min-w-0">
                  <span className="block font-display font-bold tracking-wide text-gold-gradient">Perfekter Tag!</span>
                  <span className="block text-sm font-semibold text-gold-bright tabular-nums">
                    +{formatNumber(perfectBonusXp)} Bonus-XP
                  </span>
                </span>
              </motion.p>
            ) : (
              <p className="flex items-start gap-2 text-sm text-muted">
                <Star aria-hidden className="mt-0.5 size-4 shrink-0 text-gold" />
                <span>
                  Noch{' '}
                  <strong className="font-semibold text-parchment">
                    {countLabel(requiredCount - requiredDone, 'Quest', 'Quests')}
                  </strong>{' '}
                  bis zum Perfekten Tag <span className="whitespace-nowrap">(+{perfectBonusPercent()} Bonus-XP)</span>
                </span>
              </p>
            )}
          </div>
        </>
      ) : (
        <div role="status" className="flex items-start gap-3">
          <span
            aria-hidden="true"
            className="grid size-9 shrink-0 place-items-center rounded-full bg-gold/10 text-gold ring-1 ring-gold/25 [&_svg]:size-[1.125rem]"
          >
            <Tent />
          </span>
          <p className="min-w-0 text-sm text-muted">
            <strong className="block font-display font-semibold tracking-wide text-parchment">
              {weeklyOpen ? 'Keine Tagesquests' : 'Freier Tag'}
            </strong>
            {freeDayText(capitalize(word), backfill, weeklyOpen)}
          </p>
        </div>
      )}

      {questXp > 0 && (
        <p className="mt-3.5 flex items-center gap-1.5 border-t border-border/70 pt-3 text-xs text-muted">
          <Sparkles aria-hidden className="size-3.5 text-gold" />
          <span>
            {backfill ? `${capitalize(word)} verdient` : 'Heute verdient'}:{' '}
            <strong className="font-semibold text-gold-bright tabular-nums">
              {formatNumber(questXp + perfectBonusXp)} XP
            </strong>
          </span>
        </p>
      )}
    </Card>
  )
}

/** Erklärung für Tage ohne Tagesquests – beim Nachtragen in der Vergangenheit und ohne „Rast“-Aufforderung. */
function freeDayText(dayLabel: string, backfill: boolean, weeklyOpen: boolean): string {
  if (backfill) {
    return weeklyOpen
      ? `${dayLabel} standen keine Tagesquests an – nur Wochenquests lassen sich nachtragen.`
      : `${dayLabel} standen keine Quests an – es gibt nichts nachzutragen.`
  }
  return weeklyOpen
    ? `${dayLabel} stehen keine Tagesquests an – nur deine Wochenquests sind offen.`
    : `${dayLabel} stehen keine Quests an. Genieß die Rast am Lagerfeuer.`
}

function capitalize(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1)
}
