import { Coins, Trophy } from 'lucide-react'
import { useId } from 'react'
import type { AchievementState } from '../../domain/types'
import { Card, ProgressBar, SectionTitle, formatNumber, tintTextColor } from '../../ui'
import { AchievementCard } from './AchievementCard'
import {
  ACHIEVEMENT_TIERS,
  ACHIEVEMENT_TIER_LABELS,
  TIER_COLORS,
  groupAchievements,
  summarizeAchievements,
  unlockedText,
} from './achievementView'

export interface AchievementsTabProps {
  achievements: readonly AchievementState[]
  /** Gold, das die freigeschalteten Erfolge eingebracht haben (`GameState.gold.fromAchievements`). */
  goldFromAchievements: number
}

/** Held → Erfolge: Zusammenfassung und alle Erfolge nach Kategorie. */
export function AchievementsTab({ achievements, goldFromAchievements }: AchievementsTabProps) {
  const summary = summarizeAchievements(achievements)
  const groups = groupAchievements(achievements)

  return (
    <div className="flex flex-col gap-8">
      <AchievementSummaryCard
        unlocked={summary.unlocked}
        total={summary.total}
        byTier={summary.byTier}
        gold={goldFromAchievements}
      />
      {groups.map((group) => (
        <AchievementGroupSection
          key={group.category}
          label={group.label}
          unlocked={group.unlocked}
          achievements={group.achievements}
        />
      ))}
    </div>
  )
}

function AchievementSummaryCard({
  unlocked,
  total,
  byTier,
  gold,
}: ReturnType<typeof summarizeAchievements> & { gold: number }) {
  const titleId = useId()
  return (
    <Card tone="gold" ornate padding="none" aria-labelledby={titleId} className="@container">
      <div className="flex flex-col gap-5 px-5 py-5 sm:px-7 sm:py-6 @2xl:flex-row @2xl:items-center @2xl:gap-8">
        <div className="flex min-w-0 flex-1 items-center gap-4">
          <div
            aria-hidden="true"
            className="grid size-14 shrink-0 place-items-center rounded-full bg-radial from-gold/25 to-gold/5 text-gold-bright shadow-[0_0_22px_-6px_rgb(240_201_106/0.7)] ring-1 ring-gold/45"
          >
            <Trophy className="size-7" strokeWidth={1.9} />
          </div>
          <div className="min-w-0 flex-1">
            <h2 id={titleId} className="text-xs font-semibold tracking-[0.2em] text-gold uppercase">
              Deine Erfolge
            </h2>
            <p className="mt-0.5 font-display text-xl font-semibold text-parchment">
              <span className="tabular-nums">{unlockedText(unlocked, total)}</span>
            </p>
            <ProgressBar
              value={total > 0 ? unlocked / total : 0}
              size="sm"
              glow
              aria-label="Freigeschaltete Erfolge"
              valueText={`${formatNumber(unlocked)} von ${formatNumber(total)}`}
              className="mt-2.5"
            />
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-x-5 gap-y-3 @2xl:flex-col @2xl:items-end @2xl:gap-2">
          <p className="inline-flex items-center gap-1.5 text-sm text-parchment">
            <Coins aria-hidden className="size-4 text-gold" />
            <span>
              <strong className="font-semibold text-gold-bright tabular-nums">+{formatNumber(gold)} Gold</strong> aus
              Erfolgen
            </span>
          </p>
          <ul aria-label="Nach Stufe" className="flex flex-wrap gap-x-3 gap-y-1 text-sm">
            {ACHIEVEMENT_TIERS.map((tier) => (
              <li key={tier} className="inline-flex items-center gap-1.5">
                <span
                  aria-hidden="true"
                  className="size-2.5 rotate-45 rounded-[2px]"
                  style={{ backgroundColor: TIER_COLORS[tier], boxShadow: `0 0 6px ${TIER_COLORS[tier]}` }}
                />
                <span style={{ color: tintTextColor(TIER_COLORS[tier]) }}>{ACHIEVEMENT_TIER_LABELS[tier]}</span>
                <span className="text-muted tabular-nums">
                  {formatNumber(byTier[tier].unlocked)}/{formatNumber(byTier[tier].total)}
                </span>
              </li>
            ))}
          </ul>
        </div>
      </div>
      <p className="border-t border-gold/15 px-5 py-2.5 text-[0.8125rem] text-muted sm:px-7">
        Einmal freigeschaltet, bleibt ein Erfolg für immer dein – auch wenn ein Wert später wieder sinkt.
      </p>
    </Card>
  )
}

function AchievementGroupSection({
  label,
  unlocked,
  achievements,
}: {
  label: string
  unlocked: number
  achievements: readonly AchievementState[]
}) {
  const titleId = useId()
  return (
    <section aria-labelledby={titleId}>
      <SectionTitle id={titleId} meta={`${formatNumber(unlocked)} / ${formatNumber(achievements.length)}`}>
        {label}
      </SectionTitle>
      <ul className="grid gap-3 sm:grid-cols-2 md:grid-cols-1 lg:grid-cols-2 xl:grid-cols-3">
        {achievements.map((achievement) => (
          <AchievementCard key={achievement.definition.id} achievement={achievement} />
        ))}
      </ul>
    </section>
  )
}
