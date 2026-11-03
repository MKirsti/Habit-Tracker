import { ChevronsUp, Crown, Pencil } from 'lucide-react'
import { useId, useState } from 'react'
import { formatDay } from '../../domain/dates'
import type { CharacterProfile, GameState } from '../../domain/types'
import { Button, Card, XpBar, formatNumber } from '../../ui'
import { AvatarMedallion } from './AvatarMedallion'
import { EditHeroDialog } from './EditHeroDialog'
import { nextRank } from './heroProfile'

export interface HeroSheetProps {
  profile: CharacterProfile
  state: GameState
  /** Glanz-Animation im XP-Balken (Einstellung „Effekte“). */
  shimmer: boolean
}

/** Kopf des Charakterbogens: Avatar, Name, Rang, Level, XP, Abenteuertag, nächster Rang, Bearbeiten. */
export function HeroSheet({ profile, state, shimmer }: HeroSheetProps) {
  const nameId = useId()
  const [editOpen, setEditOpen] = useState(false)
  // Neuer Schlüssel pro Öffnen → das Formular startet immer mit dem aktuellen Profil.
  const [editKey, setEditKey] = useState(0)
  const { level, rank, adventureDay } = state
  const upcoming = nextRank(level.level)

  return (
    <Card tone="gold" ornate padding="none" aria-labelledby={nameId}>
      <div className="relative px-5 pt-6 pb-5 sm:px-8 sm:pt-8 sm:pb-7">
        <div className="absolute top-3 right-3 z-10 sm:top-5 sm:right-5">
          <Button
            variant="secondary"
            size="sm"
            icon={<Pencil />}
            aria-label="Held bearbeiten"
            onClick={() => {
              setEditKey((key) => key + 1)
              setEditOpen(true)
            }}
          >
            Bearbeiten
          </Button>
        </div>

        <div className="flex flex-col items-center gap-5 text-center sm:flex-row sm:items-center sm:gap-7 sm:text-left">
          <AvatarMedallion avatar={profile.avatar} size="xl" className="mt-6 sm:mt-0" />
          <div className="w-full min-w-0 sm:flex-1 sm:pr-28">
            <h2
              id={nameId}
              className="font-display text-[1.625rem] leading-tight font-bold tracking-wide wrap-anywhere text-parchment sm:text-[2rem]"
            >
              {profile.name}
            </h2>
            <p className="mt-1.5 inline-flex items-center gap-2 font-display text-base font-semibold tracking-[0.08em] text-gold-bright">
              <span aria-hidden="true" className="text-[0.625rem] text-gold-dim">
                ◆
              </span>
              <span className="sr-only">Rang: </span>
              {rank}
              <span aria-hidden="true" className="text-[0.625rem] text-gold-dim">
                ◆
              </span>
            </p>
            <p className="mt-1 text-sm text-muted">
              Tag <span className="tabular-nums">{formatNumber(adventureDay)}</span> deines Abenteuers
              <span className="hidden sm:inline"> · begonnen am {formatDay(profile.createdDay)}</span>
            </p>
          </div>
        </div>

        <XpBar
          level={level.level}
          xpIntoLevel={level.xpIntoLevel}
          xpForNextLevel={level.xpForNextLevel}
          shimmer={shimmer}
          className="mt-6"
        />

        <p className="mt-4 flex items-start gap-2.5 rounded-xl border border-gold/20 bg-black/20 px-3.5 py-2.5 text-sm text-parchment">
          {upcoming ? (
            <>
              <ChevronsUp aria-hidden className="mt-0.5 size-4 shrink-0 text-gold" />
              <span>
                Nächster Rang: <strong className="font-semibold text-gold-bright">{upcoming.title}</strong> ab Level{' '}
                <span className="tabular-nums">{formatNumber(upcoming.minLevel)}</span>
                <span className="text-muted"> · noch {formatNumber(upcoming.minLevel - level.level)} Level</span>
              </span>
            </>
          ) : (
            <>
              <Crown aria-hidden className="mt-0.5 size-4 shrink-0 text-gold" />
              <span>Höchster Rang erreicht – dein Name hallt durch alle Lande.</span>
            </>
          )}
        </p>
      </div>

      <EditHeroDialog key={editKey} open={editOpen} onClose={() => setEditOpen(false)} profile={profile} />
    </Card>
  )
}
