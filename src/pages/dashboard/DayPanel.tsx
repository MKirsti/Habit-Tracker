import { CalendarArrowLeft, Crown, Heart, Snowflake, Sparkles, Star, Tent } from 'lucide-react'
import { motion } from 'motion/react'
import { useCallback, useState } from 'react'
import { formatDay } from '../../domain/dates'
import type { DayKey, DayState, RestPeriod } from '../../domain/types'
import { Button, ConfirmDialog, ProgressBar, SegmentedControl, cn, formatNumber } from '../../ui'
import { countLabel, dayOffsetLabel, dayOffsetWord, perfectBonusExplanation, perfectBonusPercent } from './dashboardText'
import { HP_COLOR } from '../../features/feedback/hpTheme'
import { DAY_SUMMARY_ID, REST_DAY_UNDO_ID } from './dashboardFocus'
import { restBannerText, restBannerTitle, yesterdayRestConfirmText } from './hpText'
import type { GoodDayMilestone, YesterdayPreview } from './hpText'

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

export interface BackfillNoticeProps {
  dayState: DayState
  offset: number
  /**
   * Lebenspunkte: Stand der (noch offenen) Wertung dieses Tages, z. B. "Stand jetzt: −1 HP · Ein Anfang" –
   * aktualisiert sich beim Nachtragen.
   */
  standing?: string
  /** Beim Erscheinen fokussieren (nach „Nachtragen“ in der Vorschau – deren Knopf verschwindet dann). */
  focusOnShow?: boolean
}

/** Hinweis beim Nachtragen (nur für frühere Tage); wird beim Erscheinen vorgelesen. */
export function BackfillNotice({ dayState, offset, standing, focusOnShow = false }: BackfillNoticeProps) {
  const word = dayOffsetWord(offset)
  const focusRef = useCallback(
    (element: HTMLElement | null) => {
      if (element && focusOnShow) element.focus({ preventScroll: true })
    },
    [focusOnShow],
  )
  return (
    <div aria-live="polite">
      {offset > 0 && (
        <motion.p
          ref={focusRef}
          tabIndex={focusOnShow ? -1 : undefined}
          initial={{ opacity: 0, y: -4 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-3 flex items-start gap-2.5 rounded-xl border border-info/35 bg-info/10 px-3.5 py-2.5 text-sm text-parchment outline-none"
        >
          <CalendarArrowLeft aria-hidden className="mt-0.5 size-4 shrink-0 text-info" />
          <span>
            <strong className="font-semibold text-info">Du trägst für {word} nach</strong>
            <span className="block text-xs text-muted">
              {formatDay(dayState.day)} – Häkchen und Werte gelten für diesen Tag.
            </span>
            {standing !== undefined && (
              <span className="mt-1 flex items-center gap-1.5 text-xs text-parchment" data-hp-standing="">
                <Heart aria-hidden className="size-3 shrink-0 fill-current opacity-85" style={{ color: HP_COLOR }} />
                {standing}
              </span>
            )}
          </span>
        </motion.p>
      )}
    </div>
  )
}

export interface YesterdayNoticeProps {
  preview: YesterdayPreview
  onBackfill?: () => void
  /**
   * Gestern nachträglich zum Ruhetag machen (krank, unterwegs …). Fehlt, wenn das nicht geht. Wirft bei einem Fehler
   * (die Rückfrage bleibt dann offen, der Fehler kommt als Toast).
   */
  onRestYesterday?: () => Promise<void>
}

/**
 * Vorschau für gestern (Lebenspunkte), wenn „Heute“ gewählt ist: Gestern ist noch offen und würde HP kosten bzw.
 * einen Streak-Schutz verbrauchen. Freundlich, mit dem direkten Weg zum Nachtragen – und für den Krankheitstag mit
 * „Ruhetag“ (nach einer Rückfrage), damit niemand für einen Tag im Bett Lebenspunkte verliert.
 */
export function YesterdayNotice({ preview, onBackfill, onRestYesterday }: YesterdayNoticeProps) {
  const [confirmRest, setConfirmRest] = useState(false)
  return (
    <motion.div
      initial={{ opacity: 0, y: -4 }}
      animate={{ opacity: 1, y: 0 }}
      className="mb-3 flex flex-wrap items-center gap-x-3 gap-y-2 rounded-xl border border-border bg-surface/70 px-3.5 py-2.5"
      data-yesterday-preview={preview.savedByFreeze ? 'freeze' : 'hp'}
    >
      {/* Basis 20rem: Neben dem Text bleibt er lesbar breit – sonst rutschen die Knöpfe in eine eigene Zeile. */}
      <div className="flex min-w-0 flex-[1_1_20rem] items-center gap-3">
        <span
          aria-hidden="true"
          className="grid size-8 shrink-0 place-items-center rounded-full bg-info/10 text-info ring-1 ring-info/25 [&_svg]:size-4"
        >
          {preview.savedByFreeze ? <Snowflake /> : <CalendarArrowLeft />}
        </span>
        <p className="min-w-0 flex-1 text-xs text-muted sm:text-sm">
          <strong className="block font-semibold text-parchment">{preview.title}</strong>
          {preview.text}
          {preview.effect !== undefined && (
            <>
              {' '}
              <span className="inline-flex items-center gap-1 font-medium whitespace-nowrap text-parchment">
                <Heart aria-hidden className="size-3 shrink-0 fill-current opacity-85" style={{ color: HP_COLOR }} />
                {preview.effect}
              </span>
            </>
          )}
        </p>
      </div>
      {(onBackfill || onRestYesterday) && (
        // Handy: unter dem Text, rechtsbündig; breiter: rechts neben dem Text.
        <div className="ml-auto flex shrink-0 items-center gap-1.5">
          {onRestYesterday && (
            <Button
              size="sm"
              variant="ghost"
              icon={<Tent />}
              onClick={() => setConfirmRest(true)}
              aria-label="Gestern als Ruhetag eintragen"
            >
              Ruhetag
            </Button>
          )}
          {onBackfill && (
            <Button size="sm" variant="secondary" onClick={onBackfill}>
              Nachtragen
            </Button>
          )}
        </div>
      )}
      {onRestYesterday && (
        <ConfirmDialog
          open={confirmRest}
          onClose={() => setConfirmRest(false)}
          onConfirm={onRestYesterday}
          icon={<Tent />}
          title="Gestern als Ruhetag eintragen?"
          message={yesterdayRestConfirmText(preview.savedByFreeze)}
          confirmLabel="Ruhetag eintragen"
          cancelLabel="Lieber nicht"
        />
      )}
    </motion.div>
  )
}

/** Ruhetag bzw. Urlaub am gewählten Tag (Rast & Urlaub). */
export interface DayRest {
  period: RestPeriod
  today: DayKey
  /** Nur für einen eintägigen Ruhetag heute: „Ruhetag aufheben“. */
  onUndo?: () => void
}

/**
 * Kopf der Tagesquest-Karte: schmaler Fortschrittsbalken, eine Zeile zum Perfekten Tag (bzw. die Feier)
 * und rechts die an diesem Tag verdienten XP. Ohne Pflicht-Quests die Erklärung „Keine Tagesquests“/„Freier Tag“,
 * an einem Ruhetag (`rest`) das Ruhetag-Banner – die Quests darunter bleiben erledigbar. Mit Lebenspunkten zusätzlich
 * das Zwischenziel „guter Tag“ (`milestone`): Schon die Hälfte heilt – das nimmt in vollen Wochen den Druck.
 */
export function DaySummary({
  dayState,
  offset,
  rest,
  milestone,
}: {
  dayState: DayState
  offset: number
  rest?: DayRest
  milestone?: GoodDayMilestone
}) {
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

  if (rest !== undefined) {
    return (
      <div
        id={DAY_SUMMARY_ID}
        tabIndex={-1}
        className="px-3.5 py-3 outline-none sm:px-4"
        data-rest-day={rest.period.id}
      >
        <div role="status" className="flex items-start gap-3">
          <span
            aria-hidden="true"
            className="grid size-8 shrink-0 place-items-center rounded-full bg-gold/10 text-gold ring-1 ring-gold/25 [&_svg]:size-4"
          >
            <Tent />
          </span>
          <p className="min-w-0 flex-1 text-sm text-muted">
            <strong className="block font-display font-semibold tracking-wide text-parchment">
              {restBannerTitle(rest.period, dayState.day, rest.today)}
            </strong>
            {rest.period.note !== undefined && rest.period.note.trim() !== '' && (
              <span className="block text-parchment wrap-anywhere">{rest.period.note}</span>
            )}
            {restBannerText(dayState.day, rest.today, rest.period)}
          </p>
        </div>
        {(earned || rest.onUndo) && (
          <div className="mt-2 flex flex-wrap items-center gap-2">
            {rest.onUndo && (
              <Button id={REST_DAY_UNDO_ID} size="sm" variant="ghost" onClick={rest.onUndo} className="-ml-2">
                Ruhetag aufheben
              </Button>
            )}
            {earned}
          </div>
        )}
      </div>
    )
  }

  if (requiredCount === 0) {
    return (
      <div id={DAY_SUMMARY_ID} tabIndex={-1} className="px-3.5 py-3 outline-none sm:px-4">
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
    <div id={DAY_SUMMARY_ID} tabIndex={-1} className="px-3.5 pt-3 pb-3 outline-none sm:px-4">
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
            <>
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
              {milestone !== undefined && (
                <p
                  className={cn(
                    'mt-1 flex items-start gap-1.5 text-xs sm:text-sm',
                    milestone.reached ? 'font-medium text-parchment' : 'text-muted',
                  )}
                  data-good-day={milestone.reached ? 'reached' : 'open'}
                >
                  <Heart
                    aria-hidden
                    className="mt-px size-3.5 shrink-0 fill-current opacity-85 sm:mt-0.5 sm:size-4"
                    style={{ color: HP_COLOR }}
                  />
                  <span>{milestone.text}</span>
                </p>
              )}
            </>
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
