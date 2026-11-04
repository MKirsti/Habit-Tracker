import { Coins, TriangleAlert } from 'lucide-react'
import { motion } from 'motion/react'
import { useId } from 'react'
import type { GoldState } from '../../domain/types'
import { Card, cn, formatNumber } from '../../ui'

export interface GoldBalanceProps {
  gold: GoldState
  /** Zählt bei jedem Einlösen hoch → kurzes goldenes Aufleuchten (nur mit Effekten). */
  pulse: number
  effects: boolean
}

/** Großes Gold-Guthaben mit Münze, Erklärung zum Verdienen und Aufschlüsselung (verdient / ausgegeben). */
export function GoldBalance({ gold, pulse, effects }: GoldBalanceProps) {
  const titleId = useId()
  const negative = gold.balance < 0

  return (
    // @container: Ob Guthaben und Erklärung nebeneinander passen, hängt von der Kartenbreite ab (Seitenleiste ab md).
    <Card tone="gold" ornate padding="none" aria-labelledby={titleId} className="@container overflow-hidden">
      {effects && pulse > 0 && (
        <motion.span
          key={pulse}
          aria-hidden="true"
          data-gold-pulse=""
          className="pointer-events-none absolute inset-0 rounded-2xl bg-radial-[at_20%_40%] from-gold-bright/25 to-transparent ring-1 ring-gold-bright/60 ring-inset"
          initial={{ opacity: 0 }}
          animate={{ opacity: [0, 1, 0] }}
          transition={{ duration: 1.2, ease: 'easeOut' }}
        />
      )}
      <div className="relative flex flex-col gap-5 px-5 py-6 sm:px-8 sm:py-7 @2xl:flex-row @2xl:items-center @2xl:gap-7">
        <div className="flex items-center gap-4 sm:gap-6">
          <CoinMedallion />
          <div className="min-w-0">
            <h2 id={titleId} className="text-xs font-semibold tracking-[0.2em] text-gold uppercase">
              Dein Gold
            </h2>
            <p className="mt-1 flex flex-wrap items-baseline gap-x-2 font-display leading-none">
              <span
                data-testid="gold-balance"
                className={cn(
                  'text-[2.5rem] font-bold tabular-nums sm:text-[3rem]',
                  negative ? 'text-danger' : 'text-gold-bright drop-shadow-[0_0_14px_rgb(240_201_106/0.35)]',
                )}
              >
                {formatNumber(gold.balance)}
              </span>
              <span className="text-lg font-semibold tracking-wide text-gold">Gold</span>
            </p>
          </div>
        </div>

        <div className="min-w-0 flex-1 @2xl:border-l @2xl:border-gold/20 @2xl:pl-7">
          <p className="text-[0.9375rem] text-parchment">
            Für jede XP bekommst du <strong className="font-semibold text-gold-bright">½ Gold</strong> – rückwirkend für
            alle bisherigen Taten. Erfolge bringen zusätzlich Gold.
          </p>
          <dl className="mt-3 flex flex-wrap gap-x-5 gap-y-1.5 text-sm">
            <GoldFact label="Aus XP" value={gold.fromXp} />
            <GoldFact label="Aus Erfolgen" value={gold.fromAchievements} />
            <GoldFact label="Ausgegeben" value={gold.spent} />
          </dl>
        </div>
      </div>

      {negative && (
        <p className="relative flex items-start gap-2.5 border-t border-danger/30 bg-danger/8 px-5 py-3 text-sm text-parchment sm:px-8">
          <TriangleAlert aria-hidden className="mt-0.5 size-4 shrink-0 text-danger" />
          <span>
            Dein Guthaben ist im Minus – etwa weil eine Quest samt ihrer XP gelöscht wurde. Sobald du wieder genug Gold
            verdient hast, kannst du einlösen.
          </span>
        </p>
      )}
    </Card>
  )
}

function GoldFact({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex items-baseline gap-1.5">
      <dt className="text-muted">{label}</dt>
      <dd className="font-medium text-parchment tabular-nums">{formatNumber(value)}</dd>
    </div>
  )
}

/** Goldmünze im Medaillon – das Symbol der Schatzkammer. */
export function CoinMedallion({ className }: { className?: string }) {
  return (
    <div
      aria-hidden="true"
      className={cn(
        'relative grid size-16 shrink-0 place-items-center rounded-full sm:size-20',
        'bg-radial-[at_35%_30%] from-gold-bright via-gold to-gold-dim text-on-gold',
        'shadow-[inset_0_2px_0_rgb(255_255_255/0.35),inset_0_-3px_0_rgb(90_60_10/0.45),0_0_28px_-4px_rgb(240_201_106/0.6)]',
        className,
      )}
    >
      <span className="absolute inset-1.5 rounded-full border border-gold-deep/50" />
      <Coins className="relative size-7 sm:size-9" strokeWidth={2} />
    </div>
  )
}
