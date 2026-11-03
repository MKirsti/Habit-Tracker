import { ArrowDown, ArrowUp, Flame, Pencil, Repeat, Target } from 'lucide-react'
import { useId } from 'react'
import { DIFFICULTY_META } from '../../domain/balancing'
import { describeSchedule, questXp } from '../../domain/schedule'
import type { Habit, MainQuest, Streak } from '../../domain/types'
import { AttributeChip, Badge, Card, IconButton, cn, formatNumber } from '../../ui'
import { questEditButtonId } from './domIds'
import { formatStreakUnit } from './questStats'

export type MoveDirection = 'up' | 'down'

export interface QuestRowProps {
  habit: Habit
  /** Verknüpfte Kampagne (falls vorhanden). */
  campaign?: MainQuest
  streak: Streak
  isFirst: boolean
  isLast: boolean
  /** Verschiebt die Quest (Fehler zeigt der Aufrufer selbst an). */
  onMove: (habit: Habit, direction: MoveDirection) => void
  onEdit: (habit: Habit) => void
}

/**
 * Eine aktive Quest in der Verwaltung: Symbol, Titel, Rhythmus, Schwierigkeit/XP, Attribut, Ziel,
 * Kampagne, Serie und Aktionen. Auf dem Handy stehen Serie und Aktionen in einer eigenen Zeile.
 */
export function QuestRow({ habit, campaign, streak, isFirst, isLast, onMove, onEdit }: QuestRowProps) {
  const titleId = useId()

  // Am Rand gesperrt über aria-disabled statt disabled: Ein fokussierter Button behält so den Fokus, wenn die
  // Quest oben bzw. unten ankommt (ein deaktivierter Button verliert ihn an <body>), und weiteres Drücken
  // – etwa gedrückt gehaltenes Enter – tut einfach nichts.
  function move(direction: MoveDirection) {
    if (direction === 'up' ? isFirst : isLast) return
    onMove(habit, direction)
  }

  const { measure } = habit
  const xp = questXp(habit.difficulty)

  return (
    <Card as="li" padding="none" aria-labelledby={titleId} className="p-3 sm:p-4">
      <div className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-x-3 gap-y-2.5 sm:grid-cols-[auto_minmax(0,1fr)_auto_auto] sm:gap-x-5">
        <div
          aria-hidden="true"
          className="col-start-1 row-start-1 grid size-12 place-items-center self-start rounded-xl bg-radial from-gold/14 to-gold/3 text-[1.625rem] leading-none ring-1 ring-gold/25 ring-inset"
        >
          {habit.icon}
        </div>

        <div className="col-span-2 col-start-2 row-start-1 min-w-0 sm:col-span-1">
          <h3 id={titleId} className="font-display text-base leading-snug font-semibold tracking-wide text-parchment">
            {habit.title}
          </h3>
          <p className="mt-0.5 flex flex-wrap items-center gap-x-1.5 text-sm text-muted">
            <span className="inline-flex items-center gap-1">
              <Repeat aria-hidden className="size-3.5 shrink-0 text-faint" />
              {describeSchedule(habit.schedule)}
            </span>
            <span aria-hidden="true" className="text-faint">
              ·
            </span>
            <span>
              {DIFFICULTY_META[habit.difficulty].label} ·{' '}
              <span className="font-medium text-gold tabular-nums">{formatNumber(xp)} XP</span>
            </span>
          </p>
          {habit.description !== undefined && (
            <p className="mt-1 line-clamp-2 text-sm text-faint">{habit.description}</p>
          )}
          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            <AttributeChip attribute={habit.attribute} />
            {measure && (
              // min-w-0 + truncate: Große Ziele mit langer Einheit bleiben auf schmalen Handys in der Karte.
              <Badge icon={<Target aria-hidden />} className="min-w-0">
                <span className="truncate">
                  Ziel: {formatNumber(measure.target)} {measure.unit}
                </span>
              </Badge>
            )}
            {campaign && (
              <Badge tone="gold" icon={<span aria-hidden="true">{campaign.icon}</span>} className="min-w-0">
                <span className="sr-only">Kampagne: </span>
                <span className="truncate">{campaign.title}</span>
              </Badge>
            )}
          </div>
        </div>

        <StreakInfo
          streak={streak}
          className="col-span-2 col-start-1 row-start-2 sm:col-span-1 sm:col-start-3 sm:row-start-1"
        />

        <div className="col-start-3 row-start-2 flex items-center justify-end gap-1 sm:col-start-4 sm:row-start-1">
          <IconButton
            size="sm"
            icon={<ArrowUp />}
            aria-label={`„${habit.title}“ nach oben verschieben`}
            title="Nach oben"
            aria-disabled={isFirst || undefined}
            onClick={() => move('up')}
          />
          <IconButton
            size="sm"
            icon={<ArrowDown />}
            aria-label={`„${habit.title}“ nach unten verschieben`}
            title="Nach unten"
            aria-disabled={isLast || undefined}
            onClick={() => move('down')}
          />
          <IconButton
            id={questEditButtonId(habit.id)}
            size="sm"
            variant="secondary"
            icon={<Pencil />}
            aria-label={`„${habit.title}“ bearbeiten`}
            title="Bearbeiten"
            onClick={() => onEdit(habit)}
            className="ml-1"
          />
        </div>
      </div>
    </Card>
  )
}

function StreakInfo({ streak, className }: { streak: Streak; className?: string }) {
  const { current, best, unit } = streak
  const active = current > 0
  return (
    <div
      className={cn(
        'flex min-w-0 items-center gap-x-2 text-sm sm:min-w-[6.5rem] sm:flex-col sm:items-end sm:gap-0.5',
        className,
      )}
    >
      <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
        <Flame
          aria-hidden
          className={cn('size-4 shrink-0', active ? 'text-warning drop-shadow-[0_0_6px_rgb(232_169_72/0.55)]' : 'text-faint')}
        />
        <span className="sr-only">Aktuelle Serie:</span>
        <span className={cn('font-semibold tabular-nums', active ? 'text-parchment' : 'text-muted')}>
          {formatNumber(current)}
        </span>
        <span className={active ? 'text-parchment' : 'text-muted'}>{formatStreakUnit(current, unit)}</span>
      </span>
      <span aria-hidden="true" className="text-faint sm:hidden">
        ·
      </span>
      <span className="whitespace-nowrap text-muted">
        Rekord <span className="tabular-nums">{formatNumber(best)}</span>
        <span className="sr-only"> {formatStreakUnit(best, unit)}</span>
      </span>
    </div>
  )
}
