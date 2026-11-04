import { Swords } from 'lucide-react'
import { useId } from 'react'
import { ATTRIBUTES } from '../../domain/attributes'
import { formatDay } from '../../domain/dates'
import { attributeAccentVars } from '../../features/campaignTheme'
import { SectionTitle, cn, formatNumber } from '../../ui'
import {
  BOSS_THEME_HINTS,
  bestiarySummary,
  bossThemeOf,
  bossThemeTitle,
  defeatsText,
  isKnownBoss,
  unlockedCountText,
} from './collectionView'
import type { BestiaryEntry, BestiaryGroup } from './collectionView'

export interface BestiarySectionProps {
  groups: readonly BestiaryGroup[]
  /** DOM-ID des Abschnitts (Sprungziel der Übersicht). */
  id: string
}

/**
 * Bestiarium: alle Wochen-Bosse nach Thema. Besiegte mit Symbol, Name, Beschreibung, letztem Sieg und Anzahl; ein
 * Gegner, dem du gerade gegenüberstehst, ist schon bekannt; alle anderen bleiben eine Silhouette mit „???“.
 */
export function BestiarySection({ groups, id }: BestiarySectionProps) {
  const titleId = useId()
  const summary = bestiarySummary(groups)
  return (
    <section id={id} tabIndex={-1} aria-labelledby={titleId} className="scroll-mt-6 rounded-2xl">
      <SectionTitle id={titleId} meta={`${unlockedCountText(summary.defeated, summary.total)} bezwungen`}>
        Bestiarium
      </SectionTitle>
      <p className="mb-4 max-w-prose text-sm text-muted">
        Jede Woche stellt sich dir ein Boss in den Weg – passend zu dem, was du am meisten trainierst. Wen du bezwingst,
        verewigt sich hier.
        {summary.victories > 0 && (
          <>
            {' '}
            Bisher <strong className="font-semibold text-parchment">{formatNumber(summary.victories)}</strong>{' '}
            {summary.victories === 1 ? 'Sieg' : 'Siege'}.
          </>
        )}
      </p>
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {groups.map((group) => (
          <ThemeGroup key={group.theme} group={group} />
        ))}
      </div>
    </section>
  )
}

function ThemeGroup({ group }: { group: BestiaryGroup }) {
  const titleId = useId()
  const meta = ATTRIBUTES[group.theme]
  return (
    <section
      aria-labelledby={titleId}
      data-theme={group.theme}
      style={attributeAccentVars(group.theme)}
      className="min-w-0 rounded-2xl border border-(--accent-20) bg-linear-to-b from-(--accent-5) to-surface/70 p-3.5"
    >
      <h3 id={titleId} className="mb-2.5 flex items-center gap-2 px-0.5">
        <span aria-hidden="true" className="text-base leading-none">
          {meta?.icon}
        </span>
        <span className="font-display text-sm font-semibold tracking-wide text-(--accent-text)">
          {bossThemeTitle(group.theme)}
        </span>
        <span className="ml-auto text-xs text-muted tabular-nums">
          <span className="sr-only">– </span>
          {unlockedCountText(group.defeated, group.entries.length)}
        </span>
      </h3>
      <ul className="flex flex-col gap-2">
        {group.entries.map((entry) => (
          <BossEntry key={entry.boss.id} entry={entry} />
        ))}
      </ul>
    </section>
  )
}

function BossEntry({ entry }: { entry: BestiaryEntry }) {
  const { boss, defeats, lastDefeatedDay, facing } = entry
  const known = isKnownBoss(entry)

  return (
    <li
      data-boss={known ? boss.id : undefined}
      data-known={known || undefined}
      className={cn(
        'flex min-w-0 items-start gap-3 rounded-xl border p-2.5',
        defeats > 0
          ? 'border-(--accent-35) bg-surface-raised/70'
          : facing
            ? 'border-dashed border-(--accent-35) bg-surface/60'
            : 'border-border/80 bg-bg-deep/40',
      )}
    >
      <span
        aria-hidden="true"
        className={cn(
          'grid size-12 shrink-0 place-items-center rounded-full text-[1.625rem] leading-none',
          defeats > 0
            ? 'bg-radial from-(--accent-20) to-bg-deep/60 ring-1 ring-(--accent-60)'
            : 'bg-bg-deep/80 ring-1 ring-border-strong',
        )}
      >
        <span
          // Unbekannte als Silhouette: schwarz gefärbtes Symbol mit feinem Rand in der Themenfarbe.
          style={
            known
              ? undefined
              : { filter: 'brightness(0) drop-shadow(0 0 1px var(--accent-60)) drop-shadow(0 0 5px var(--accent-20))' }
          }
        >
          {boss.icon}
        </span>
      </span>
      <div className="min-w-0 flex-1">
        {known ? (
          <>
            <div className="flex items-start justify-between gap-2">
              <h4 className="min-w-0 font-display text-[0.9375rem] leading-snug font-semibold tracking-wide text-parchment">
                {boss.name}
              </h4>
              {defeats > 0 && (
                <span className="shrink-0 rounded-full bg-(--accent-10) px-1.5 py-px text-xs font-semibold text-(--accent-text) tabular-nums ring-1 ring-(--accent-35)">
                  <span aria-hidden="true">×{formatNumber(defeats)}</span>
                  <span className="sr-only">{defeatsText(defeats)}</span>
                </span>
              )}
            </div>
            {defeats > 0 ? (
              <>
                <p className="mt-0.5 text-xs text-muted">
                  Zuletzt besiegt am {lastDefeatedDay !== undefined ? formatDay(lastDefeatedDay, 'short') : '–'}
                </p>
                <p className="mt-1 text-[0.8125rem] leading-snug text-parchment/75">{boss.description}</p>
              </>
            ) : (
              <p className="mt-0.5 inline-flex items-center gap-1 text-xs font-medium text-(--accent-text)">
                <Swords aria-hidden className="size-3.5" />
                Gerade im Kampf – noch nicht bezwungen
              </p>
            )}
          </>
        ) : (
          <>
            <h4 className="font-display text-[0.9375rem] leading-snug font-semibold tracking-[0.2em] text-faint">
              <span aria-hidden="true">???</span>
              <span className="sr-only">Unbekannter Boss {bossThemeOf(boss.theme)}</span>
            </h4>
            <p className="mt-0.5 text-xs text-muted">{BOSS_THEME_HINTS[boss.theme]}</p>
          </>
        )}
      </div>
    </li>
  )
}
