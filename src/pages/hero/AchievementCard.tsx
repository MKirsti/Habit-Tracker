import { CircleCheck, Coins, Lock } from 'lucide-react'
import { useId } from 'react'
import type { AchievementState } from '../../domain/types'
import { accentVars } from '../../features/campaignTheme'
import { Badge, ProgressBar, cn, formatNumber } from '../../ui'
import {
  ACHIEVEMENT_TIER_LABELS,
  SECRET_DESCRIPTION,
  SECRET_TITLE,
  TIER_COLORS,
  formatUnlockDate,
  isHidden,
  progressText,
} from './achievementView'

export interface AchievementCardProps {
  achievement: AchievementState
}

/**
 * Ein Erfolg: Symbol im Medaillon, Name, Beschreibung, Stufe (Bronze/Silber/Gold) mit Gold-Belohnung –
 * freigeschaltet mit Datum und Leuchten in der Stufenfarbe, sonst gedämpft mit Fortschrittsbalken.
 * Geheime Erfolge bleiben bis zum Freischalten „???“.
 */
export function AchievementCard({ achievement }: AchievementCardProps) {
  const titleId = useId()
  const { definition, unlocked, unlockedDay, progress } = achievement
  const hidden = isHidden(achievement)
  const color = TIER_COLORS[definition.tier]
  const tierLabel = ACHIEVEMENT_TIER_LABELS[definition.tier]

  return (
    <li
      aria-labelledby={titleId}
      data-tier={definition.tier}
      data-unlocked={unlocked || undefined}
      style={accentVars(color)}
      className={cn(
        'relative isolate flex min-w-0 flex-col rounded-2xl border p-4',
        unlocked
          ? 'border-(--accent-35) bg-linear-to-b from-(--accent-10) to-surface/90 shadow-[0_0_0_1px_var(--accent-10),0_14px_34px_-20px_var(--accent-60)]'
          : 'border-border bg-surface/60',
      )}
    >
      {unlocked && (
        <span
          aria-hidden="true"
          className="pointer-events-none absolute inset-x-8 top-0 h-px bg-linear-to-r from-transparent via-(--accent-60) to-transparent"
        />
      )}
      <div className="flex items-start gap-3.5">
        <div
          aria-hidden="true"
          className={cn(
            'relative grid size-13 shrink-0 place-items-center rounded-full text-[1.625rem] leading-none',
            unlocked
              ? 'bg-radial from-(--accent-20) to-(--accent-5) shadow-[0_0_18px_-4px_var(--accent-60)] ring-2 ring-(--accent-60)'
              : 'bg-bg-deep/70 ring-1 ring-border-strong',
          )}
        >
          <span className={cn(!unlocked && 'opacity-45 grayscale')}>{hidden ? '❔' : definition.icon}</span>
          {!unlocked && (
            <span className="absolute -right-1 -bottom-1 grid size-5 place-items-center rounded-full border border-border-strong bg-surface-raised">
              <Lock className="size-3 text-muted" />
            </span>
          )}
        </div>
        <div className="min-w-0 flex-1">
          <h3
            id={titleId}
            className={cn(
              'font-display text-[0.9375rem] leading-snug font-semibold tracking-wide',
              unlocked ? 'text-parchment' : 'text-parchment/85',
            )}
          >
            {hidden ? (
              <>
                <span aria-hidden="true">{SECRET_TITLE}</span>
                <span className="sr-only">Geheimer Erfolg</span>
              </>
            ) : (
              definition.title
            )}
          </h3>
          <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
            <Badge color={color}>
              <span className="sr-only">Stufe: </span>
              {tierLabel}
            </Badge>
            <span className="inline-flex items-center gap-1 text-xs font-medium text-gold tabular-nums">
              <Coins aria-hidden className="size-3.5" />+{formatNumber(definition.goldReward)} Gold
            </span>
          </div>
        </div>
      </div>

      <p className="mt-3 text-sm text-muted">{hidden ? SECRET_DESCRIPTION : definition.description}</p>

      <div className="mt-auto pt-3">
        {unlocked ? (
          <p className="flex items-center gap-1.5 text-sm text-(--accent-text)">
            <CircleCheck aria-hidden className="size-4 shrink-0" />
            {unlockedDay !== undefined ? `Freigeschaltet am ${formatUnlockDate(unlockedDay)}` : 'Freigeschaltet'}
          </p>
        ) : (
          !hidden && (
            <ProgressBar
              value={progress}
              size="xs"
              color={color}
              animated={false}
              aria-label={`Fortschritt: ${definition.title}`}
              valueLabel={<span className="text-xs">{progressText(achievement)}</span>}
              valueText={progressText(achievement).replace(' / ', ' von ')}
            />
          )
        )}
      </div>
    </li>
  )
}
