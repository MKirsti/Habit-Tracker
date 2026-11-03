import { ArrowRight, Plus, ScrollText } from 'lucide-react'
import { Link } from 'react-router'
import { describeSchedule } from '../../domain/schedule'
import type { DayKey, Habit } from '../../domain/types'
import { Badge, Button, Card, buttonClassName, cn, formatNumber } from '../../ui'
import { formatValue, isArchived } from './campaignText'

export interface LinkedQuestsProps {
  /** Mit der Kampagne verknüpfte Quests (aktive zuerst). */
  habits: readonly Habit[]
  today: DayKey
  onAddQuest: () => void
}

/** Abschnitt „Quests dieser Kampagne“: Liste der verknüpften Quests plus „Quest hinzufügen“. */
export function LinkedQuests({ habits, today, onAddQuest }: LinkedQuestsProps) {
  return (
    <Card
      title="Quests dieser Kampagne"
      subtitle={
        habits.length === 0
          ? 'Noch keine verknüpft'
          : `${formatNumber(habits.length)} ${habits.length === 1 ? 'Quest bringt' : 'Quests bringen'} dich voran`
      }
      icon={<ScrollText />}
    >
      {habits.length === 0 ? (
        <p className="text-sm text-muted">
          Verknüpfe Quests mit deiner Kampagne – jede Erledigung bringt dich deinem großen Ziel näher.
        </p>
      ) : (
        <ul className="-mx-1 divide-y divide-border/70">
          {habits.map((habit) => {
            const archived = isArchived(habit, today)
            const measure = habit.measure ? `${formatValue(habit.measure.target)} ${habit.measure.unit}` : undefined
            return (
              <li key={habit.id} className={cn('flex items-center gap-3 px-1 py-2.5', archived && 'opacity-70')}>
                <span
                  aria-hidden="true"
                  className="grid size-10 shrink-0 place-items-center rounded-xl bg-surface-raised text-xl ring-1 ring-border-strong ring-inset"
                >
                  {habit.icon}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium text-parchment">{habit.title}</span>
                  <span className="block truncate text-[0.8125rem] text-muted">
                    {describeSchedule(habit.schedule)}
                    {measure !== undefined && ` · ${measure}`}
                  </span>
                </span>
                {archived && <Badge>Archiviert</Badge>}
              </li>
            )
          })}
        </ul>
      )}

      <div className="mt-4 flex flex-wrap gap-2">
        <Button variant="secondary" size="sm" icon={<Plus />} onClick={onAddQuest} className="flex-1 sm:flex-none">
          Quest hinzufügen
        </Button>
        <Link to="/quests" className={cn(buttonClassName({ variant: 'ghost', size: 'sm' }), 'flex-1 sm:flex-none')}>
          Alle Quests
          <ArrowRight aria-hidden />
        </Link>
      </div>
    </Card>
  )
}
