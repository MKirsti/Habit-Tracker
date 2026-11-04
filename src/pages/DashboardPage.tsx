import { Archive, Plus, ScrollText } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router'
import { useGameContext } from '../app/gameContext'
import { addDays, formatDay } from '../domain/dates'
import { getDayState } from '../domain/engine'
import { restPeriodOn } from '../domain/hp'
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
import { DAY_SUMMARY_ID, REST_DAY_ACTION_ID, REST_DAY_UNDO_ID } from './dashboard/dashboardFocus'
import { YesterdayNotice } from './dashboard/DayPanel'
import { HeroCard } from './dashboard/HeroCard'
import { HpIntroCard } from './dashboard/HpIntroCard'
import { backfillStanding, canUndoRestToday, goodDayMilestone, yesterdayPreview } from './dashboard/hpText'
import { QuestList } from './dashboard/QuestList'
import { RestDayAction } from './dashboard/RestDayAction'
import { SideQuestSection } from './dashboard/SideQuestSection'
import { useQuestActions } from './dashboard/useQuestActions'
import { useRestDayActions } from './dashboard/useRestDayActions'
import { usePendingFocus } from './treasury/focus'

/**
 * „Heute“ – die Tagesübersicht: Held (mit Gold-Guthaben → Schatzkammer), Tagesbilanz, Quests zum Abhaken
 * (XP inklusive Streak-Bonus), Nebenquests, Kampagne und Attribute.
 * Rückwirkendes Nachtragen ist bis `BALANCING.backfillDays` Tage möglich (Umschalter „Gestern“); Nebenquests
 * gelten immer für heute.
 * Auf dem Handy stehen die heutigen Quests ganz oben (PLAN §4): Seitenkopf nur für Screenreader,
 * flache Heldenleiste, Tagesbilanz direkt im Abschnitt „Tagesquests“, Nebenquests darunter.
 *
 * Lebenspunkte (Phase 2b): HP-Balken im Helden-Kopf, einmalige Einführung „Neu: Lebenspunkte“, Vorschau für den noch
 * offenen Vortag (nur, wenn er HP kosten bzw. einen Streak-Schutz brauchen würde – mit „Nachtragen“ und „Ruhetag“ für
 * gestern), das Zwischenziel „guter Tag“ in der Tagesbilanz, „Heute Ruhetag“ (mit Rückfrage) und das Ruhetag-Banner –
 * an Ruhetagen bleiben die Quests erledigbar.
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
  const restActions = useRestDayActions(today)
  const showQuests = useMemo(() => hasActiveHabits(data, today), [data, today])
  // Nach „Nachtragen“ in der Vorschau: den Nachtrag-Hinweis fokussieren (der Knopf verschwindet).
  const [focusBackfill, setFocusBackfill] = useState(false)

  const { hp, todayState } = state
  // „Heute Ruhetag“ und „Ruhetag aufheben“ verschwinden nach ihrer Aktion: Der Fokus springt aufs Gegenstück
  // (bzw. die Tagesbilanz), sobald die Live-Daten den Wechsel zeigen – nie auf <body>.
  const requestRestFocus = usePendingFocus(data.restPeriods, false)
  function focusAfterRestChange(resting: boolean) {
    requestRestFocus({
      resolve: (periods) =>
        (restPeriodOn(periods, today) !== undefined) !== resting
          ? undefined
          : (document.getElementById(resting ? REST_DAY_UNDO_ID : REST_DAY_ACTION_ID) ??
            document.getElementById(DAY_SUMMARY_ID)),
    })
  }
  async function takeRestDay() {
    focusAfterRestChange(true)
    try {
      await restActions.takeRestDay()
    } catch (error) {
      requestRestFocus(null)
      throw error
    }
  }
  async function takeRestYesterday() {
    const yesterday = addDays(today, -1)
    // Die Vorschau samt Knopf verschwindet: Der Fokus landet auf der Tagesbilanz.
    requestRestFocus({
      resolve: (periods) =>
        restPeriodOn(periods, yesterday) === undefined ? undefined : document.getElementById(DAY_SUMMARY_ID),
    })
    try {
      await restActions.takeRestYesterday()
    } catch (error) {
      requestRestFocus(null)
      throw error
    }
  }
  async function undoRestDay(periodId: string) {
    focusAfterRestChange(false)
    if (!(await restActions.undoRestDay(periodId))) requestRestFocus(null)
  }

  const restPeriod = useMemo(() => restPeriodOn(data.restPeriods, day), [data.restPeriods, day])
  const rest = restPeriod
    ? {
        period: restPeriod,
        today,
        onUndo:
          offset === 0 && canUndoRestToday(restPeriod, today) ? () => void undoRestDay(restPeriod.id) : undefined,
      }
    : undefined
  // Vorschau für gestern nur, wenn „Heute“ gewählt und gestern wählbar ist; beim Nachtragen der laufende Stand.
  const preview = offset === 0 && offsets.includes(1) ? yesterdayPreview(hp.yesterday) : undefined
  const standing = offset === 1 ? backfillStanding(hp.yesterday, hp.enabled) : undefined
  const canRest = offset === 0 && !state.restToday && todayState.requiredCount > 0 && !todayState.perfect
  // Zwischenziel „guter Tag“ (nur heute, nur mit Lebenspunkten): Schon die Hälfte heilt.
  const goodDay =
    offset === 0 && hp.enabled && rest === undefined
      ? goodDayMilestone(todayState.requiredCount, todayState.requiredDone)
      : undefined

  function backfillYesterday() {
    setFocusBackfill(true)
    setSelectedOffset(1)
  }

  return (
    <>
      {/* Unter md nur für Screenreader (h1 + Datum); das Datum steht dort sichtbar in der Heldenleiste. */}
      <PageHeader eyebrow={formatDay(today)} title="Heute" className="max-md:sr-only md:mb-6" />

      {data.profile && (
        <HeroCard
          profile={data.profile}
          state={state}
          shimmer={data.settings.effects}
          today={today}
          hpLedger={data.hpLedger}
        />
      )}
      {hp.enabled && data.settings.hpIntroSeen !== true && <HpIntroCard />}

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
              onOffsetChange={(next) => {
                setFocusBackfill(false)
                setSelectedOffset(next)
              }}
              rest={rest}
              notice={
                preview && (
                  <YesterdayNotice
                    preview={preview}
                    onBackfill={backfillYesterday}
                    onRestYesterday={takeRestYesterday}
                  />
                )
              }
              footer={
                canRest ? (
                  <RestDayAction onConfirm={takeRestDay} hasProgress={todayState.requiredDone > 0} />
                ) : undefined
              }
              backfillStanding={standing}
              focusBackfill={focusBackfill}
              goodDay={goodDay}
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
          <SideQuestSection
            entries={state.sideQuests}
            hasAny={(data.sideQuests ?? []).length > 0}
            today={today}
            otherDaySelected={offset > 0}
          />
        </div>

        <div className="flex min-w-0 flex-col gap-6">
          <CampaignSection campaigns={state.mainQuests} />
          <AttributesCard attributes={state.attributes} />
        </div>
      </div>
    </>
  )
}
