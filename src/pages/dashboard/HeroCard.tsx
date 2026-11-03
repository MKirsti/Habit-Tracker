import { ChevronRight } from 'lucide-react'
import { useId } from 'react'
import { Link } from 'react-router'
import type { CharacterProfile, DayKey, GameState } from '../../domain/types'
import { Card, XpBar, formatNumber } from '../../ui'
import { compactDayLabel } from './dashboardText'

export interface HeroCardProps {
  profile: CharacterProfile
  state: GameState
  /** Glanz-Animation im XP-Balken (Einstellung „Effekte“). */
  shimmer: boolean
  /** Heutiger Spieltag – auf dem Handy steht das Datum hier statt im (dort ausgeblendeten) Seitenkopf. */
  today: DayKey
}

/**
 * Kopfkarte mit Avatar, Name, Level/Rang, Abenteuertag und XP-Balken.
 * Die ganze Karte ist ein Link zur Heldenseite (unsichtbarer Link über der Fläche).
 * Unter `md` eine flache Leiste (~96 px), damit die heutigen Quests weit oben stehen (PLAN §4).
 */
export function HeroCard({ profile, state, shimmer, today }: HeroCardProps) {
  const nameId = useId()
  const { level, rank, adventureDay } = state

  return (
    <Card
      tone="gold"
      ornate
      padding="none"
      aria-labelledby={nameId}
      className="mb-5 transition-[border-color,box-shadow] duration-200 hover:border-gold/60 has-[a:active]:scale-[0.995] md:mb-6"
    >
      <Link
        to="/held"
        aria-label={`Heldenprofil von ${profile.name} öffnen`}
        className="absolute inset-0 z-10 rounded-2xl focus-visible:outline-offset-3"
      />
      <div className="flex flex-col gap-2.5 py-3 pr-9 pl-3 md:flex-row md:items-center md:gap-8 md:py-5 md:pr-14 md:pl-6">
        <div className="flex min-w-0 items-center gap-3 md:gap-4">
          <div
            aria-hidden="true"
            className="relative grid size-11 shrink-0 place-items-center rounded-full bg-radial from-gold/25 via-gold/8 to-transparent text-[1.625rem] leading-none ring-2 ring-gold/45 md:size-[4.5rem] md:text-[2.5rem]"
          >
            <span className="absolute -inset-1 rounded-full ring-1 ring-gold/15 md:-inset-1.5" />
            {profile.avatar}
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-baseline justify-between gap-2">
              <h2
                id={nameId}
                className="min-w-0 truncate font-display text-[1.0625rem] leading-tight font-bold tracking-wide text-parchment md:text-2xl"
              >
                {profile.name}
              </h2>
              {/* Datum nur auf dem Handy sichtbar; vorgelesen wird es im Seitenkopf. */}
              <span aria-hidden="true" className="shrink-0 text-[0.6875rem] font-medium whitespace-nowrap text-muted md:hidden">
                {compactDayLabel(today)}
              </span>
            </div>
            {/* Handy: eine Zeile „Level 5 · Wanderer · Tag 31“; ab md zweizeilig mit „… deines Abenteuers“. */}
            <p className="mt-0.5 truncate text-xs font-semibold text-gold-bright md:mt-1 md:overflow-visible md:text-sm md:whitespace-normal">
              Level <span className="tabular-nums">{formatNumber(level.level)}</span> · {rank}
              <span aria-hidden="true" className="font-normal text-muted md:hidden">
                {' ·'}
              </span>{' '}
              <span className="font-normal text-muted md:mt-0.5 md:block md:text-xs">
                Tag <span className="tabular-nums">{formatNumber(adventureDay)}</span>
                <span className="max-md:sr-only"> deines Abenteuers</span>
              </span>
            </p>
          </div>
        </div>
        <XpBar
          level={level.level}
          xpIntoLevel={level.xpIntoLevel}
          xpForNextLevel={level.xpForNextLevel}
          showLevel={false}
          shimmer={shimmer}
          // Handy: Zahlen rechts neben dem Balken (eine Zeile); ab md wie gehabt darüber.
          className="max-md:flex max-md:flex-row-reverse max-md:items-center max-md:gap-2.5 max-md:[&>div:first-child]:mb-0 max-md:[&>div:first-child]:shrink-0 max-md:[&>div:first-child]:gap-0 max-md:[&>div:first-child]:text-xs md:max-w-md md:flex-1"
        />
      </div>
      <ChevronRight
        aria-hidden
        className="pointer-events-none absolute top-1/2 right-2.5 size-5 -translate-y-1/2 text-gold/70 md:right-5"
      />
    </Card>
  )
}
