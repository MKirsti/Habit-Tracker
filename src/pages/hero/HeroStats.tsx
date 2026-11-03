import { CalendarCheck, CalendarRange, CircleCheckBig, Flame, Sparkles, Star } from 'lucide-react'
import type { ReactNode } from 'react'
import { useId } from 'react'
import type { GameState } from '../../domain/types'
import { Card, ProgressBar, SectionTitle, StatTile, formatNumber } from '../../ui'
import { roundShares } from './heroProfile'

export interface HeroStatsProps {
  state: GameState
}

/** Kennzahlen des bisherigen Abenteuers als Kacheln. */
export function HeroStats({ state }: HeroStatsProps) {
  const titleId = useId()
  const { totals, level } = state
  const tiles: { label: string; value: number; icon: ReactNode; hint?: string }[] = [
    { label: 'Quests erledigt', value: totals.questsCompleted, icon: <CircleCheckBig /> },
    { label: 'Perfekte Tage', value: totals.perfectDays, icon: <Star /> },
    { label: 'Aktive Tage', value: totals.activeDays, icon: <CalendarCheck /> },
    { label: 'Bester Streak', value: totals.bestDayStreak, icon: <Flame />, hint: plural(totals.bestDayStreak, 'Tag', 'Tage') },
    {
      label: 'Bester Wochen-Streak',
      value: totals.bestWeekStreak,
      icon: <CalendarRange />,
      hint: plural(totals.bestWeekStreak, 'Woche', 'Wochen'),
    },
    { label: 'Gesamt-XP', value: level.totalXp, icon: <Sparkles /> },
  ]

  return (
    <section aria-labelledby={titleId}>
      <SectionTitle id={titleId}>Statistik</SectionTitle>
      {/* Zwei Spalten: So passen auch lange Beschriftungen („Bester Wochen-Streak“) auf dem Desktop in eine Zeile. */}
      <ul className="grid grid-cols-2 gap-3">
        {tiles.map((tile) => (
          <li key={tile.label} className="flex min-w-0">
            <StatTile
              label={tile.label}
              value={formatNumber(Math.round(tile.value))}
              icon={tile.icon}
              hint={tile.hint}
              className="flex-1"
            />
          </li>
        ))}
      </ul>
    </section>
  )
}

/** Woher die XP stammen: Quests, Perfekte Tage, Kapitel & Kampagnen. */
export function XpBreakdown({ state }: HeroStatsProps) {
  const { xpFromQuests, xpFromPerfectDays, xpFromChapters } = state.totals
  const total = xpFromQuests + xpFromPerfectDays + xpFromChapters
  const rows: { label: string; xp: number; color?: string }[] = [
    { label: 'Quests', xp: xpFromQuests },
    { label: 'Perfekte Tage', xp: xpFromPerfectDays, color: 'var(--color-success)' },
    { label: 'Kapitel & Kampagnen', xp: xpFromChapters, color: 'var(--color-info)' },
  ]
  // Zusammen immer genau 100 % – Balken, Beschriftung und Vorlesewert zeigen denselben Anteil.
  const shares = roundShares(rows.map((row) => row.xp))

  return (
    <Card title="Herkunft deiner XP" icon={<Sparkles />} subtitle={`${formatNumber(total)} XP insgesamt`}>
      <ul className="flex flex-col gap-4">
        {rows.map((row, index) => {
          const share = shares[index] / 100
          const percent = formatNumber(shares[index])
          return (
            <li key={row.label}>
              <ProgressBar
                value={share}
                color={row.color}
                size="sm"
                label={row.label}
                valueLabel={
                  <>
                    <span className="font-medium text-parchment">{formatNumber(row.xp)} XP</span> · {percent} %
                  </>
                }
                valueText={`${formatNumber(row.xp)} XP, ${percent} %`}
              />
            </li>
          )
        })}
      </ul>
      {total === 0 && (
        <p className="mt-4 text-sm text-muted">Noch keine XP – erledige deine erste Quest, dann füllt sich die Chronik.</p>
      )}
    </Card>
  )
}

function plural(count: number, one: string, many: string): string {
  return count === 1 ? one : many
}
