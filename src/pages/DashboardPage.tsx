import { Archive, Plus, ScrollText } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router'
import { useGameContext } from '../app/gameContext'
import { addDays, formatDay } from '../domain/dates'
import { getDayState } from '../domain/engine'
import { Button, EmptyState, PageHeader, buttonClassName } from '../ui'
import { AttributesCard } from './dashboard/AttributesCard'
import { CampaignSection } from './dashboard/CampaignCard'
import { dayOffsetWord, hasActiveHabits, selectableDayOffsets, weekWord } from './dashboard/dashboardText'
import { DayPanel } from './dashboard/DayPanel'
import { HeroCard } from './dashboard/HeroCard'
import { QuestList } from './dashboard/QuestList'
import { useQuestActions } from './dashboard/useQuestActions'

/**
 * „Heute“ – die Tagesübersicht: Held, Tagesbilanz, Quests zum Abhaken, Kampagne und Attribute.
 * Rückwirkendes Nachtragen ist bis `BALANCING.backfillDays` Tage möglich (Umschalter „Gestern“).
 */
export function DashboardPage() {
  const { data, today, state } = useGameContext()
  const navigate = useNavigate()
  const [selectedOffset, setSelectedOffset] = useState(0)

  const offsets = useMemo(() => selectableDayOffsets(data, today), [data, today])
  // Ist der gewählte Tag (z. B. nach dem Zurücksetzen) nicht mehr wählbar, gilt wieder „Heute“.
  const offset = offsets.includes(selectedOffset) ? selectedOffset : 0
  const day = offset === 0 ? today : addDays(today, -offset)
  const dayState = useMemo(
    () => (day === today ? state.todayState : getDayState(data, day)),
    [day, today, state.todayState, data],
  )
  const actions = useQuestActions(day)
  const showQuests = useMemo(() => hasActiveHabits(data, today), [data, today])

  return (
    <>
      <PageHeader eyebrow={formatDay(today)} title="Heute" className="mb-5 sm:mb-6" />

      {data.profile && <HeroCard profile={data.profile} state={state} shimmer={data.settings.effects} />}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(17.5rem,0.65fr)] lg:items-start lg:gap-8">
        <div className="flex min-w-0 flex-col gap-6">
          {showQuests ? (
            <>
              <DayPanel dayState={dayState} offset={offset} offsets={offsets} onOffsetChange={setSelectedOffset} />
              <QuestList
                dayState={dayState}
                mainQuests={data.mainQuests}
                weekWord={weekWord(day, today)}
                dayWord={dayOffsetWord(offset)}
                actions={actions}
              />
            </>
          ) : data.habits.length > 0 ? (
            // Es gibt Quests, aber alle sind archiviert: nicht so tun, als wäre das Questlog neu.
            <EmptyState
              icon={<Archive />}
              title="Alle Quests ruhen"
              text="Deine Quests sind archiviert. Hol unter „Quests“ eine zurück oder beginne eine neue."
              action={
                <>
                  <Button icon={<Plus />} onClick={() => navigate('/quests?neu=1')}>
                    Neue Quest anlegen
                  </Button>
                  <Link to="/quests" className={buttonClassName({ variant: 'secondary' })}>
                    Zu deinen Quests
                  </Link>
                </>
              }
            />
          ) : (
            <EmptyState
              icon={<ScrollText />}
              title="Dein Questlog ist noch leer"
              text="Lege deine erste Quest an – eine kleine Gewohnheit, die dich jeden Tag ein Stück weiterbringt."
              action={
                <Button icon={<Plus />} onClick={() => navigate('/quests?neu=1')}>
                  Erste Quest anlegen
                </Button>
              }
            />
          )}
        </div>

        <div className="flex min-w-0 flex-col gap-6">
          <CampaignSection campaigns={state.mainQuests} />
          <AttributesCard attributes={state.attributes} />
        </div>
      </div>
    </>
  )
}
