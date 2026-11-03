import { useId, useMemo, useState } from 'react'
import type { DayState, HabitStatus, MainQuest } from '../../domain/types'
import { Card, SectionTitle, cn, formatNumber } from '../../ui'
import { BackfillNotice, DaySummary, DaySwitcher } from './DayPanel'
import { MeasureDialog } from './MeasureDialog'
import { QuestRow } from './QuestRow'
import type { QuestActions } from './useQuestActions'

export interface QuestListProps {
  dayState: DayState
  mainQuests: readonly MainQuest[]
  /** "diese Woche" / "letzte Woche" für Wochenquests. */
  weekWord: string
  /** "heute" / "gestern". */
  dayWord: string
  actions: QuestActions
  /** Gewählter Tag als Abstand zu heute (0 = heute, 1 = gestern). */
  offset: number
  /** Wählbare Abstände; bei nur einem Eintrag wird kein Umschalter gezeigt. */
  offsets: readonly number[]
  onOffsetChange: (offset: number) => void
}

/**
 * Die Quests des gewählten Tages in zwei Abschnitten: Tagesquests (Pflicht) und Wochenquests.
 * Der Abschnitt „Tagesquests“ trägt auch die Tagesbilanz: Umschalter Heute/Gestern im Titel, darunter
 * Fortschritt, Weg zum Perfekten Tag und verdiente XP. Er steht immer da (auch ohne Tagesquests), damit der
 * Umschalter erreichbar bleibt.
 */
export function QuestList({
  dayState,
  mainQuests,
  weekWord,
  dayWord,
  actions,
  offset,
  offsets,
  onOffsetChange,
}: QuestListProps) {
  const dailyId = useId()
  const weeklyId = useId()
  const [editId, setEditId] = useState<string | null>(null)
  const [editOpen, setEditOpen] = useState(false)

  const campaigns = useMemo(() => new Map(mainQuests.map((quest) => [quest.id, quest])), [mainQuests])
  // Abschnitte nach dem Rhythmus des gewählten Tages (`required` bzw. `week` kommen aus `scheduleOn`),
  // nicht nach `habit.schedule`: Wurde der Rhythmus heute geändert, zeigt „Gestern“ den damaligen.
  const daily = dayState.habits.filter((status) => status.required)
  const weekly = dayState.habits.filter((status) => status.week !== undefined)
  const weeklyMet = weekly.filter((status) => status.week !== undefined && status.week.done >= status.week.target)
  const editing = editId === null ? undefined : dayState.habits.find((status) => status.habit.id === editId)
  const { perfect } = dayState

  function renderRows(list: readonly HabitStatus[]) {
    return (
      <ul className="divide-y divide-border/70">
        {list.map((status) => {
          const campaign = status.habit.mainQuestId ? campaigns.get(status.habit.mainQuestId) : undefined
          return (
            <QuestRow
              // Pro Tag neu aufbauen: Ein Tageswechsel soll keine "Erledigt"-Animation auslösen.
              key={`${dayState.day}:${status.habit.id}`}
              status={status}
              campaign={campaign ? { icon: campaign.icon, title: campaign.title } : undefined}
              weekWord={weekWord}
              actions={actions}
              onEditValue={(habitId) => {
                setEditId(habitId)
                setEditOpen(true)
              }}
            />
          )
        })}
      </ul>
    )
  }

  return (
    <>
      <section aria-labelledby={dailyId}>
        <SectionTitle
          id={dailyId}
          action={<DaySwitcher offset={offset} offsets={offsets} onOffsetChange={onOffsetChange} />}
          className="min-h-10"
        >
          Tagesquests
        </SectionTitle>
        <BackfillNotice dayState={dayState} offset={offset} />
        <Card
          as="div"
          padding="none"
          tone={perfect ? 'gold' : 'default'}
          className={cn('transition-[border-color,box-shadow] duration-500', perfect && 'shadow-glow')}
        >
          <DaySummary dayState={dayState} offset={offset} />
          {daily.length > 0 && (
            // Die erste Zeile liegt unter der Bilanz, nicht an der Kartenkante: oben keine Rundung.
            <div className="border-t border-border/70 [&>ul>li:first-child]:rounded-t-none">{renderRows(daily)}</div>
          )}
        </Card>
      </section>
      {weekly.length > 0 && (
        <section aria-labelledby={weeklyId}>
          <SectionTitle id={weeklyId} meta={`${formatNumber(weeklyMet.length)} / ${formatNumber(weekly.length)} erfüllt`}>
            Wochenquests
          </SectionTitle>
          <Card as="div" padding="none">
            {renderRows(weekly)}
          </Card>
        </section>
      )}
      <MeasureDialog
        open={editOpen && editing !== undefined}
        onClose={() => setEditOpen(false)}
        status={editing}
        dayWord={dayWord}
        onSave={actions.setValue}
      />
    </>
  )
}
