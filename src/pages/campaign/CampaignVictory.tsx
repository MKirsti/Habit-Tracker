import { Plus, Trophy } from 'lucide-react'
import { useId } from 'react'
import { BALANCING } from '../../domain/balancing'
import type { MainQuestState } from '../../domain/types'
import { Button, Card, Ornament, formatNumber } from '../../ui'
import { countLabel } from './campaignText'

export interface CampaignVictoryProps {
  campaign: MainQuestState
  onNewCampaign: () => void
}

/**
 * Feierlicher Hinweis für eine abgeschlossene Kampagne mit Erinnerung an die Belohnung.
 * (Die große Feier-Animation zeigt `GameFeedback` zentral.)
 */
export function CampaignVictory({ campaign, onNewCampaign }: CampaignVictoryProps) {
  const titleId = useId()
  const { quest, chapters } = campaign
  return (
    <Card as="section" tone="gold" ornate padding="lg" aria-labelledby={titleId} className="mb-5 overflow-hidden text-center">
      {/* Lichtschein + Schimmer */}
      <span
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 -top-24 mx-auto size-72 rounded-full bg-radial from-gold/25 to-transparent"
      />
      <span aria-hidden="true" className="pointer-events-none absolute inset-0 overflow-hidden rounded-2xl">
        <span className="absolute inset-y-0 -left-1/3 w-1/3 animate-shimmer bg-linear-to-r from-transparent via-gold-bright/10 to-transparent motion-reduce:hidden" />
      </span>

      <div
        aria-hidden="true"
        className="relative mx-auto grid size-16 place-items-center rounded-full bg-linear-to-b from-gold-bright to-gold text-on-gold shadow-glow"
      >
        <span className="absolute -inset-2 animate-glow-pulse rounded-full ring-1 ring-gold/50" />
        <Trophy className="size-8" />
      </div>
      <h2 id={titleId} className="relative mt-4 font-display text-2xl font-bold tracking-wide text-gold-bright">
        Kampagne gemeistert!
      </h2>
      <Ornament className="relative mx-auto mt-2 h-3 w-20" />
      <p className="relative mx-auto mt-3 max-w-md text-[0.9375rem] text-parchment/90">
        Du hast {chapters.length === 1 ? 'das Kapitel' : `alle ${countLabel(chapters.length, 'Kapitel', 'Kapitel')}`} von
        „{quest.title}“ abgeschlossen.
      </p>
      {quest.reward !== '' ? (
        <div className="relative mx-auto mt-4 max-w-md rounded-xl border border-gold/35 bg-bg-deep/50 px-4 py-3">
          <p className="text-xs font-semibold tracking-[0.18em] text-gold uppercase">Deine Belohnung wartet</p>
          <p className="mt-1 font-display text-lg font-semibold text-parchment">{quest.reward}</p>
          <p className="mt-1 text-sm text-muted">Du hast sie dir verdient – gönn sie dir!</p>
        </div>
      ) : (
        <p className="relative mt-2 text-sm text-muted">Zeit, dich selbst zu feiern.</p>
      )}
      <p className="relative mt-3 text-sm font-medium text-gold-bright tabular-nums">
        +{formatNumber(BALANCING.mainQuestXp)} XP Kampagnen-Bonus
      </p>
      <Button variant="secondary" icon={<Plus />} onClick={onNewCampaign} className="relative mt-5">
        Neue Kampagne beginnen
      </Button>
    </Card>
  )
}
