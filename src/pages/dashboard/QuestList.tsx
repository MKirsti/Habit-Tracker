import { useId, useMemo, useState } from 'react'
import type { DayState, MainQuest } from '../../domain/types'
import { Card, SectionTitle, formatNumber } from '../../ui'
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
}

/** Die Quests des gewählten Tages in zwei Abschnitten: Tagesquests (Pflicht) und Wochenquests. */
export function QuestList({ dayState, mainQuests, weekWord, dayWord, actions }: QuestListProps) {
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

  function renderRows(list: typeof daily) {
    return (
      <Card padding="none">
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
      </Card>
    )
  }

  return (
    <>
      {daily.length > 0 && (
        <section aria-labelledby={dailyId}>
          <SectionTitle
            id={dailyId}
            meta={`${formatNumber(dayState.requiredDone)} / ${formatNumber(dayState.requiredCount)}`}
          >
            Tagesquests
          </SectionTitle>
          {renderRows(daily)}
        </section>
      )}
      {weekly.length > 0 && (
        <section aria-labelledby={weeklyId}>
          <SectionTitle id={weeklyId} meta={`${formatNumber(weeklyMet.length)} / ${formatNumber(weekly.length)} erfüllt`}>
            Wochenquests
          </SectionTitle>
          {renderRows(weekly)}
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
