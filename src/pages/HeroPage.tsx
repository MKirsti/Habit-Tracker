import { UserRound } from 'lucide-react'
import { useGameContext } from '../app/gameContext'
import { EmptyState, PageHeader } from '../ui'
import { AttributeGrid } from './hero/AttributeGrid'
import { HeroSheet } from './hero/HeroSheet'
import { HeroStats, XpBreakdown } from './hero/HeroStats'
import { RankLadder } from './hero/RankLadder'

/**
 * „Held“ – der Charakterbogen: Avatar, Rang, Level, Attribute, Statistik, XP-Herkunft und Rangleiter.
 */
export function HeroPage() {
  const { data, state } = useGameContext()
  const { profile } = data

  return (
    <>
      <PageHeader
        eyebrow="Charakterbogen"
        title="Held"
        subtitle="Level, Attribute und alle Taten deines bisherigen Abenteuers."
      />

      {profile ? (
        <HeroSheet profile={profile} state={state} shimmer={data.settings.effects} />
      ) : (
        <EmptyState icon={<UserRound />} title="Noch kein Held" text="Erschaffe zuerst deinen Helden." />
      )}

      <div className="mt-8 grid gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(17rem,20rem)] lg:items-start">
        <div className="flex min-w-0 flex-col gap-8">
          <AttributeGrid attributes={state.attributes} />
          <HeroStats state={state} />
        </div>
        <div className="flex min-w-0 flex-col gap-6">
          <XpBreakdown state={state} />
          <RankLadder level={state.level.level} />
        </div>
      </div>
    </>
  )
}
