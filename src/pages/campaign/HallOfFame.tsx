import { CalendarCheck, Check, Gift, Landmark, ScrollText, Sparkles, Trophy } from 'lucide-react'
import { useId } from 'react'
import type { ReactNode } from 'react'
import type { HallOfFameEntry } from '../../domain/hallOfFame'
import { accentVars, campaignColor } from '../../features/campaignTheme'
import { Badge, Card, SectionTitle, cn, formatNumber } from '../../ui'
import { campaignOrigin, originSummary } from './campaignOrigin'
import { countLabel, formatDate } from './campaignText'

export interface HallOfFameProps {
  /** Gemeisterte Kampagnen mit Bilanz (`hallOfFame` aus domain/hallOfFame.ts), die zuletzt gemeisterte zuerst. */
  entries: readonly HallOfFameEntry[]
  today: string
  /** Gibt es überhaupt Kampagnen? Dann lädt eine leere Ruhmeshalle zum ersten Sieg ein. */
  hasCampaigns: boolean
}

/**
 * Ruhmeshalle: jede gemeisterte Kampagne (laufend sichtbar oder schon abgelegt) als feierliche Chronik – Dauer,
 * Kapitel, erledigte Quest-Tage, verdiente XP, die Belohnung und auf Wunsch die ganze Geschichte. Gold steht für
 * die Meisterschaft, die Kampagnenfarbe für die Kampagne selbst.
 */
export function HallOfFame({ entries, today, hasCampaigns }: HallOfFameProps) {
  const titleId = useId()
  if (entries.length === 0 && !hasCampaigns) return null
  return (
    <section aria-labelledby={titleId} className="mt-12">
      <SectionTitle id={titleId} meta={entries.length > 0 ? formatNumber(entries.length) : undefined}>
        Ruhmeshalle
      </SectionTitle>
      {entries.length === 0 ? (
        <div className="flex items-center gap-3.5 rounded-2xl border border-dashed border-gold/25 bg-surface/50 px-4 py-4">
          <span
            aria-hidden="true"
            className="grid size-11 shrink-0 place-items-center rounded-full bg-gold/8 text-gold ring-1 ring-gold/25 ring-inset"
          >
            <Landmark className="size-5" />
          </span>
          <p className="text-sm text-muted">
            Noch wartet die Halle auf ihren ersten Eintrag. Meistere alle Kapitel einer Kampagne – dann wird sie hier für
            immer verewigt.
          </p>
        </div>
      ) : (
        <>
          <p className="-mt-1 mb-4 max-w-prose text-sm text-muted">
            Deine gemeisterten Kampagnen – für immer Teil der Chronik deines Helden.
          </p>
          <ul className={cn('grid gap-4', entries.length > 1 && 'lg:grid-cols-2')}>
            {entries.map((entry) => (
              <HallOfFameCard key={entry.quest.id} entry={entry} today={today} />
            ))}
          </ul>
        </>
      )}
    </section>
  )
}

function HallOfFameCard({ entry, today }: { entry: HallOfFameEntry; today: string }) {
  const titleId = useId()
  const { quest, campaign } = entry
  const color = campaignColor(campaign)
  const origin = campaignOrigin(quest)
  const questCount = entry.quests.length

  return (
    <Card
      as="li"
      tone="gold"
      ornate
      padding="none"
      aria-labelledby={titleId}
      data-campaign-color={color}
      style={accentVars(color)}
      className="@container flex min-w-0 flex-col overflow-hidden"
    >
      {/* Die Kampagnenfarbe als feiner Streifen über der goldenen Lichtkante. */}
      <span
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 top-0 h-0.5 bg-linear-to-r from-transparent via-(--accent) to-transparent"
      />
      <span
        aria-hidden="true"
        className="pointer-events-none absolute -top-16 -left-10 size-48 rounded-full bg-radial from-(--accent-20) to-transparent"
      />

      <div className="relative flex items-start gap-3.5 px-5 pt-5 sm:px-6 sm:pt-6">
        <span
          aria-hidden="true"
          className="relative grid size-14 shrink-0 place-items-center rounded-2xl bg-(--accent-10) text-[1.75rem] shadow-[0_0_22px_-6px_var(--accent-60)] ring-1 ring-(--accent-35) ring-inset"
        >
          {quest.icon}
          <span className="absolute -right-1.5 -bottom-1.5 grid size-6 place-items-center rounded-full bg-linear-to-b from-gold-bright to-gold text-on-gold shadow-glow-sm ring-2 ring-surface">
            <Trophy className="size-3.5" strokeWidth={2.4} />
          </span>
        </span>
        <div className="min-w-0 flex-1">
          <h3
            id={titleId}
            className="font-display text-lg leading-snug font-semibold tracking-wide wrap-anywhere text-parchment"
          >
            {quest.title}
          </h3>
          <p className="mt-0.5 text-sm font-medium text-gold-bright">Gemeistert am {formatDate(entry.completedDay, today)}</p>
          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            {entry.archived ? (
              <Badge tone="gold" icon={<Landmark />}>
                Verewigt
              </Badge>
            ) : (
              <Badge tone="gold" icon={<Sparkles />}>
                Frisch gemeistert
              </Badge>
            )}
            {entry.onTime === true && (
              <Badge tone="success" icon={<CalendarCheck />}>
                Vor dem Zieldatum
              </Badge>
            )}
            {origin && <span className="text-xs text-muted">{originSummary(origin)}</span>}
          </div>
        </div>
      </div>

      <dl className="relative mt-5 grid grid-cols-2 gap-px border-y border-gold/15 bg-gold/12 @lg:grid-cols-4">
        <Stat label="Dauer" value={countLabel(entry.durationDays, 'Tag', 'Tage')}>
          {formatDate(entry.startDay, today)} – {formatDate(entry.completedDay, today)}
        </Stat>
        <Stat label="Kapitel" value={formatNumber(entry.chapters.length)}>
          alle gemeistert
        </Stat>
        <Stat label="Quest-Tage" value={formatNumber(entry.questDays)}>
          {questCount > 0 ? `mit ${countLabel(questCount, 'Quest', 'Quests')}` : 'ohne Quests'}
        </Stat>
        <Stat label="Verdient" value={`+${formatNumber(entry.totalXp)} XP`} gold>
          davon {formatNumber(entry.campaignXp)} Bonus
        </Stat>
      </dl>

      <div className="relative flex flex-1 flex-col gap-4 px-5 pt-4 pb-5 sm:px-6 sm:pb-6">
        {quest.reward.trim() !== '' ? (
          <div className="flex items-start gap-3 rounded-xl border border-gold/30 bg-bg-deep/45 px-4 py-3">
            <Gift aria-hidden className="mt-0.5 size-5 shrink-0 text-gold" />
            <div className="min-w-0">
              <p className="text-xs font-semibold tracking-[0.18em] text-gold uppercase">Deine Belohnung</p>
              <p className="mt-0.5 font-display font-semibold wrap-anywhere text-parchment">{quest.reward}</p>
            </div>
          </div>
        ) : (
          <p className="text-sm text-muted">Ohne Belohnung angetreten – der Sieg selbst ist Lohn genug.</p>
        )}

        <details className="group">
          <summary className="inline-flex cursor-pointer items-center gap-1.5 rounded-md text-sm font-medium text-muted transition-colors select-none hover:text-parchment [&::-webkit-details-marker]:hidden">
            <ScrollText aria-hidden className="size-4 text-gold" />
            <span className="group-open:hidden">Chronik ansehen</span>
            <span className="hidden group-open:inline">Chronik ausblenden</span>
          </summary>
          <div className="mt-3 grid gap-4 @lg:grid-cols-2">
            <div className="min-w-0">
              <h4 className="text-xs font-semibold tracking-wider text-muted uppercase">Kapitel</h4>
              <ol className="mt-2 flex flex-col gap-1.5">
                {entry.chapters.map((chapter, index) => (
                  <li key={chapter.id} className="flex items-start gap-2 text-sm">
                    <span
                      aria-hidden="true"
                      className="mt-0.5 grid size-4.5 shrink-0 place-items-center rounded-full bg-(--accent-20) text-(--accent-text) ring-1 ring-(--accent-35) ring-inset"
                    >
                      <Check className="size-3" strokeWidth={3} />
                    </span>
                    <span className="min-w-0 text-parchment/90">
                      <span className="sr-only">Kapitel {formatNumber(index + 1)}: </span>
                      {chapter.title}
                      {chapter.doneDay && <span className="text-muted"> · {formatDate(chapter.doneDay, today)}</span>}
                    </span>
                  </li>
                ))}
              </ol>
            </div>
            {questCount > 0 && (
              <div className="min-w-0">
                <h4 className="text-xs font-semibold tracking-wider text-muted uppercase">Quests</h4>
                <ul className="mt-2 flex flex-col gap-1.5">
                  {entry.quests.map(({ habit, days, xp }) => (
                    <li key={habit.id} className="flex items-baseline justify-between gap-3 text-sm">
                      <span className="min-w-0 truncate text-parchment/90">
                        <span aria-hidden="true">{habit.icon}</span> {habit.title}
                      </span>
                      <span className="shrink-0 text-xs text-muted tabular-nums">
                        {countLabel(days, 'Tag', 'Tage')} · {formatNumber(xp)} XP
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </details>
      </div>
    </Card>
  )
}

function Stat({ label, value, gold = false, children }: { label: string; value: string; gold?: boolean; children: ReactNode }) {
  return (
    <div className="min-w-0 bg-surface/92 px-4 py-3">
      <dt className="text-[0.6875rem] font-semibold tracking-wider text-muted uppercase">{label}</dt>
      <dd className={cn('mt-0.5 font-display text-lg leading-tight font-semibold', gold ? 'text-gold-bright' : 'text-parchment')}>
        {value}
      </dd>
      <dd className="mt-0.5 text-xs text-muted">{children}</dd>
    </div>
  )
}
