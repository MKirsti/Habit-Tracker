import { CalendarArrowLeft, Crown, Sparkles, Star, Tent } from 'lucide-react'
import { motion } from 'motion/react'
import { formatDay } from '../../domain/dates'
import type { DayState } from '../../domain/types'
import { ProgressBar, SegmentedControl, cn, formatNumber } from '../../ui'
import { countLabel, dayOffsetLabel, dayOffsetWord, perfectBonusExplanation, perfectBonusPercent } from './dashboardText'

/*
 * Bausteine der Tagesbilanz im Abschnitt „Tagesquests“: Tagesumschalter (Heute/Gestern), Nachtrag-Hinweis
 * und eine kompakte Zusammenfassung (Fortschritt, Weg zum Perfekten Tag, verdiente XP). Früher eine eigene
 * Karte über der Liste – so stehen die Quests auf dem Handy weiter oben (PLAN §4).
 */

export interface DaySwitcherProps {
  /** Gewählter Tag als Abstand zu heute (0 = heute, 1 = gestern). */
  offset: number
  /** Wählbare Abstände; bei nur einem Eintrag wird kein Umschalter gezeigt. */
  offsets: readonly number[]
  onOffsetChange: (offset: number) => void
}

/** Kleiner Umschalter „Heute / Gestern“ (für die Aktions-Spalte des Abschnittstitels). */
export function DaySwitcher({ offset, offsets, onOffsetChange }: DaySwitcherProps) {
  if (offsets.length <= 1) return null
  return (
    <SegmentedControl
      aria-label="Tag wählen"
      size="sm"
      fullWidth={false}
      value={offset}
      onChange={onOffsetChange}
      options={offsets.map((value) => ({ value, label: dayOffsetLabel(value) }))}
      className="shrink-0"
    />
  )
}

/** Hinweis beim Nachtragen (nur für frühere Tage); wird beim Erscheinen vorgelesen. */
export function BackfillNotice({ dayState, offset }: { dayState: DayState; offset: number }) {
  const word = dayOffsetWord(offset)
  return (
    <div aria-live="polite">
      {offset > 0 && (
        <motion.p
          initial={{ opacity: 0, y: -4 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-3 flex items-start gap-2.5 rounded-xl border border-info/35 bg-info/10 px-3.5 py-2.5 text-sm text-parchment"
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
  )
}

/**
 * Kopf der Tagesquest-Karte: schmaler Fortschrittsbalken, eine Zeile zum Perfekten Tag (bzw. die Feier)
 * und rechts die an diesem Tag verdienten XP. Ohne Pflicht-Quests die Erklärung „Keine Tagesquests“/„Freier Tag“.
 */
export function DaySummary({ dayState, offset }: { dayState: DayState; offset: number }) {
  const { requiredCount, requiredDone, perfect, perfectBonusXp, questXp } = dayState
  const word = dayOffsetWord(offset)
  const backfill = offset > 0
  // Wochenquest an diesem Tag (damals gültiger Rhythmus, nicht `habit.schedule`).
  const weeklyOpen = dayState.habits.some((status) => status.week !== undefined)

  const earned =
    questXp > 0 ? (
      <p className="ml-auto flex shrink-0 items-center gap-1.5 text-xs whitespace-nowrap text-muted">
        <Sparkles aria-hidden className="size-3.5 text-gold" />
        <span>
          {backfill ? `${capitalize(word)} verdient` : 'Heute verdient'}:{' '}
          <strong className="font-semibold text-gold-bright tabular-nums">
            {formatNumber(questXp + perfectBonusXp)} XP
          </strong>
        </span>
      </p>
    ) : null

  if (requiredCount === 0) {
    return (
      <div className="px-3.5 py-3 sm:px-4">
        <div role="status" className="flex items-start gap-3">
          <span
            aria-hidden="true"
            className="grid size-8 shrink-0 place-items-center rounded-full bg-gold/10 text-gold ring-1 ring-gold/25 [&_svg]:size-4"
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
        {earned && <div className="mt-2 flex">{earned}</div>}
      </div>
    )
  }

  return (
    <div className="px-3.5 pt-3 pb-3 sm:px-4">
      {/* Balken und Stand in einer Zeile – der Stand steht nur hier (nicht noch einmal im Abschnittstitel). */}
      <div className="flex items-center gap-2.5">
        <ProgressBar
          value={requiredDone / requiredCount}
          size="xs"
          glow={perfect}
          aria-label="Tagesfortschritt"
          valueText={`${formatNumber(requiredDone)} von ${formatNumber(requiredCount)} Tagesquests erledigt`}
          className="min-w-0 flex-1"
        />
        <span
          aria-hidden="true"
          className={cn('shrink-0 text-xs font-semibold tabular-nums', perfect ? 'text-gold-bright' : 'text-parchment')}
        >
          {formatNumber(requiredDone)} / {formatNumber(requiredCount)}
        </span>
      </div>
      <div className="mt-2 flex flex-wrap items-start justify-between gap-x-3 gap-y-1.5">
        <div role="status" className="min-w-0">
          {perfect ? (
            <motion.p
              key="perfect"
              initial={{ opacity: 0, scale: 0.96 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ type: 'spring', stiffness: 380, damping: 22 }}
              className="flex items-start gap-2.5"
            >
              <span
                aria-hidden="true"
                className="grid size-8 shrink-0 place-items-center rounded-full bg-gold/15 text-gold-bright ring-1 ring-gold/45 [&_svg]:size-4"
              >
                <Crown />
              </span>
              <span className="min-w-0">
                <span className="flex flex-wrap items-baseline gap-x-2">
                  <strong className="font-display font-bold tracking-wide text-gold-gradient">Perfekter Tag!</strong>
                  <span className="text-sm font-semibold text-gold-bright tabular-nums">
                    +{formatNumber(perfectBonusXp)} Bonus-XP
                  </span>
                </span>
                <span className="mt-0.5 block text-xs text-muted">{perfectBonusExplanation(offset)}</span>
              </span>
            </motion.p>
          ) : (
            <p className="flex items-start gap-1.5 text-xs text-muted sm:text-sm">
              <Star aria-hidden className="mt-px size-3.5 shrink-0 text-gold sm:mt-0.5 sm:size-4" />
              <span>
                Noch{' '}
                <strong className="font-semibold text-parchment">
                  {countLabel(requiredCount - requiredDone, 'Quest', 'Quests')}
                </strong>{' '}
                bis zum Perfekten Tag <span className="whitespace-nowrap">(+{perfectBonusPercent()})</span>
              </span>
            </p>
          )}
        </div>
        {earned}
      </div>
    </div>
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
