import { Archive, Plus, ScrollText } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router'
import { useGameContext } from '../app/gameContext'
import { addDays, formatDay } from '../domain/dates'
import { getDayState } from '../domain/engine'
import { Button, EmptyState, PageHeader, buttonClassName } from '../ui'
import { AttributesCard } from './dashboard/AttributesCard'
import { CampaignSection } from './dashboard/CampaignCard'
import {
  dayOffsetWord,
  hasActiveHabits,
  selectableDayOffsets,
  weekWord,
  withCurrentWeekStreaks,
} from './dashboard/dashboardText'
import { HeroCard } from './dashboard/HeroCard'
import { QuestList } from './dashboard/QuestList'
import { useQuestActions } from './dashboard/useQuestActions'

/**
 * „Heute“ – die Tagesübersicht: Held, Tagesbilanz, Quests zum Abhaken, Kampagne und Attribute.
 * Rückwirkendes Nachtragen ist bis `BALANCING.backfillDays` Tage möglich (Umschalter „Gestern“).
 * Auf dem Handy stehen die heutigen Quests ganz oben (PLAN §4): Seitenkopf nur für Screenreader,
 * flache Heldenleiste, Tagesbilanz direkt im Abschnitt „Tagesquests“.
 */
export function DashboardPage() {
  const { data, today, state } = useGameContext()
  const navigate = useNavigate()
  const [selectedOffset, setSelectedOffset] = useState(0)

  const offsets = useMemo(() => selectableDayOffsets(data, today), [data, today])
  // Ist der gewählte Tag (z. B. nach dem Zurücksetzen) nicht mehr wählbar, gilt wieder „Heute“.
  const offset = offsets.includes(selectedOffset) ? selectedOffset : 0
  const day = offset === 0 ? today : addDays(today, -offset)
  // Frühere Tage: Streaks zum Stichtag – Wochenquests derselben Woche aber mit dem Wochen-Streak von heute,
  // passend zum Wochenfortschritt (der die ganze laufende Woche zählt).
  const dayState = useMemo(
    () =>
      day === today ? state.todayState : withCurrentWeekStreaks(getDayState(data, day), state.todayState, today),
    [day, today, state.todayState, data],
  )
  const actions = useQuestActions(day)
  const showQuests = useMemo(() => hasActiveHabits(data, today), [data, today])

  return (
    <>
      {/* Unter md nur für Screenreader (h1 + Datum); das Datum steht dort sichtbar in der Heldenleiste. */}
      <PageHeader eyebrow={formatDay(today)} title="Heute" className="max-md:sr-only md:mb-6" />

      {data.profile && (
        <HeroCard profile={data.profile} state={state} shimmer={data.settings.effects} today={today} />
      )}

      <div className="grid gap-5 md:gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(17.5rem,0.65fr)] lg:items-start lg:gap-8">
        <div className="flex min-w-0 flex-col gap-5 md:gap-6">
          {showQuests ? (
            <QuestList
              dayState={dayState}
              mainQuests={data.mainQuests}
              weekWord={weekWord(day, today)}
              dayWord={dayOffsetWord(offset)}
              actions={actions}
              offset={offset}
              offsets={offsets}
              onOffsetChange={setSelectedOffset}
            />
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
