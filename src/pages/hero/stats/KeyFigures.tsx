import { CalendarHeart, CircleCheckBig, Coins, Flame, HeartCrack, ShoppingBag, Sparkles, Star } from 'lucide-react'
import type { ReactNode } from 'react'
import { useId } from 'react'
import { compareDays, formatDay } from '../../../domain/dates'
import type { GameData, GameState } from '../../../domain/types'
import { SectionTitle, StatTile, formatNumber } from '../../../ui'
import { plural } from './statsText'

export interface KeyFiguresProps {
  state: GameState
  data: GameData
}

interface Figure {
  label: string
  value: number
  icon: ReactNode
  hint?: string
}

/** Niederlagen freundlich einordnen – nie beschämend. */
function defeatHint(state: GameState): string {
  if (state.hp.defeats > 0) return state.hp.defeats === 1 ? 'und wieder aufgestanden' : 'jedes Mal wieder aufgestanden'
  return state.hp.enabled ? 'ungebrochen' : 'Sanfter Modus'
}

/** Kennzahlen des ganzen Abenteuers als Kacheln (zwei Spalten auf dem Handy, vier auf dem Desktop). */
export function KeyFigures({ state, data }: KeyFiguresProps) {
  const titleId = useId()
  const { totals, level, gold } = state
  const purchases = (data.purchases ?? []).filter((purchase) => purchase.kind !== 'item' && compareDays(purchase.day, state.today) <= 0).length
  const start = data.profile?.createdDay
  const figures: Figure[] = [
    { label: 'Gesamt-XP', value: level.totalXp, icon: <Sparkles />, hint: `Level ${formatNumber(level.level)} · ${state.rank}` },
    {
      label: 'Quests erledigt',
      value: totals.questsCompleted,
      icon: <CircleCheckBig />,
      hint: `an ${plural(totals.activeDays, 'Tag', 'Tagen')}`,
    },
    {
      label: 'Perfekte Tage',
      value: totals.perfectDays,
      icon: <Star />,
      hint: totals.xpFromPerfectDays > 0 ? `+${formatNumber(totals.xpFromPerfectDays)} Bonus-XP` : undefined,
    },
    {
      label: 'Längster Streak',
      value: totals.bestDayStreak,
      icon: <Flame />,
      hint:
        totals.bestWeekStreak > 0
          ? `${totals.bestDayStreak === 1 ? 'Tag' : 'Tage'} · ${plural(totals.bestWeekStreak, 'Woche', 'Wochen')} am Stück`
          : totals.bestDayStreak === 1
            ? 'Tag'
            : 'Tage',
    },
    {
      label: 'Gold verdient',
      value: gold.earned,
      icon: <Coins />,
      hint: gold.fromAchievements > 0 ? `davon ${formatNumber(gold.fromAchievements)} aus Erfolgen` : '½ Gold pro XP',
    },
    {
      label: 'Gold ausgegeben',
      value: gold.spent,
      icon: <ShoppingBag />,
      hint: purchases > 0 ? plural(purchases, 'Einlösung', 'Einlösungen') : 'Gönn dir was!',
    },
    { label: 'Niederlagen', value: state.hp.defeats, icon: <HeartCrack />, hint: defeatHint(state) },
    {
      label: 'Tag des Abenteuers',
      value: state.adventureDay,
      icon: <CalendarHeart />,
      hint: start ? `seit ${formatDay(start, 'short')} ${start.slice(0, 4)}` : undefined,
    },
  ]

  return (
    <section aria-labelledby={titleId}>
      <SectionTitle id={titleId}>Kennzahlen</SectionTitle>
      <ul className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {figures.map((figure) => (
          <li key={figure.label} className="flex min-w-0">
            <StatTile
              label={figure.label}
              value={formatNumber(Math.round(figure.value))}
              icon={figure.icon}
              hint={figure.hint}
              className="flex-1"
            />
          </li>
        ))}
      </ul>
    </section>
  )
}
