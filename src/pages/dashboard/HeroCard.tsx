import { ChevronRight } from 'lucide-react'
import { useId } from 'react'
import { Link } from 'react-router'
import type { CharacterProfile, GameState } from '../../domain/types'
import { Card, XpBar, formatNumber } from '../../ui'

export interface HeroCardProps {
  profile: CharacterProfile
  state: GameState
  /** Glanz-Animation im XP-Balken (Einstellung „Effekte“). */
  shimmer: boolean
}

/**
 * Kopfkarte mit Avatar, Name, Level/Rang, Abenteuertag und XP-Balken.
 * Die ganze Karte ist ein Link zur Heldenseite (unsichtbarer Link über der Fläche).
 */
export function HeroCard({ profile, state, shimmer }: HeroCardProps) {
  const nameId = useId()
  const { level, rank, adventureDay } = state

  return (
    <Card
      tone="gold"
      ornate
      padding="none"
      aria-labelledby={nameId}
      className="mb-6 transition-[border-color,box-shadow] duration-200 hover:border-gold/60 has-[a:active]:scale-[0.995]"
    >
      <Link
        to="/held"
        aria-label={`Heldenprofil von ${profile.name} öffnen`}
        className="absolute inset-0 z-10 rounded-2xl focus-visible:outline-offset-3"
      />
      <div className="flex flex-col gap-4 py-4 pr-10 pl-4 sm:flex-row sm:items-center sm:gap-8 sm:py-5 sm:pr-14 sm:pl-6">
        <div className="flex min-w-0 items-center gap-4">
          <div
            aria-hidden="true"
            className="relative grid size-16 shrink-0 place-items-center rounded-full bg-radial from-gold/25 via-gold/8 to-transparent text-[2.25rem] leading-none ring-2 ring-gold/45 sm:size-[4.5rem] sm:text-[2.5rem]"
          >
            <span className="absolute -inset-1.5 rounded-full ring-1 ring-gold/15" />
            {profile.avatar}
          </div>
          <div className="min-w-0">
            <h2
              id={nameId}
              className="truncate font-display text-xl leading-tight font-bold tracking-wide text-parchment sm:text-2xl"
            >
              {profile.name}
            </h2>
            <p className="mt-1 text-sm font-semibold text-gold-bright">
              Level <span className="tabular-nums">{formatNumber(level.level)}</span> · {rank}
            </p>
            <p className="mt-0.5 text-xs text-muted">
              Tag <span className="tabular-nums">{formatNumber(adventureDay)}</span> deines Abenteuers
            </p>
          </div>
        </div>
        <XpBar
          level={level.level}
          xpIntoLevel={level.xpIntoLevel}
          xpForNextLevel={level.xpForNextLevel}
          showLevel={false}
          shimmer={shimmer}
          className="sm:max-w-md sm:flex-1"
        />
      </div>
      <ChevronRight
        aria-hidden
        className="pointer-events-none absolute top-1/2 right-3 size-5 -translate-y-1/2 text-gold/70 sm:right-5"
      />
    </Card>
  )
}
