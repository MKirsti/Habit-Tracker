import { CalendarCheck, CalendarClock } from 'lucide-react'
import type { DayKey, SideQuest } from '../../domain/types'
import { Badge, cn } from '../../ui'
import type { BadgeTone } from '../../ui'
import { sideQuestDueLabel } from './sideQuestForm'
import type { SideQuestDueTone } from './sideQuestForm'

/**
 * Überfällig ist bewusst Bernstein statt Rot: Nebenquests kosten nie etwas – ein verpasster Termin soll erinnern,
 * nicht stressen.
 */
const TONES: Record<SideQuestDueTone, BadgeTone> = {
  overdue: 'warning',
  today: 'gold',
  soon: 'info',
  normal: 'neutral',
  done: 'success',
}

/** Kompakte Textform (Dashboard-Zeilen): gleiche Töne als Schriftfarbe. */
const TEXT_TONES: Record<SideQuestDueTone, string> = {
  overdue: 'text-warning',
  today: 'text-gold-bright',
  soon: 'text-info',
  normal: 'text-muted',
  done: 'text-success',
}

export interface SideQuestDueBadgeProps {
  quest: Pick<SideQuest, 'dueDay' | 'doneDay'>
  today: DayKey
  /** badge: Abzeichen (Quests-Seite), text: kleine Zeile mit Symbol (Dashboard). */
  variant?: 'badge' | 'text'
  className?: string
}

/** Termin bzw. Erledigung als kleines Abzeichen ("heute fällig", "überfällig seit 2 Tagen", "bis 12. Nov."). */
export function SideQuestDueBadge({ quest, today, variant = 'badge', className }: SideQuestDueBadgeProps) {
  const label = sideQuestDueLabel(quest, today)
  if (!label) return null
  if (variant === 'text') {
    const Icon = label.tone === 'done' ? CalendarCheck : CalendarClock
    return (
      <span
        data-due-tone={label.tone}
        className={cn('inline-flex items-center gap-1 font-medium whitespace-nowrap', TEXT_TONES[label.tone], className)}
      >
        <Icon aria-hidden className="size-3.5 shrink-0" />
        {label.text}
      </span>
    )
  }
  return (
    <Badge
      tone={TONES[label.tone]}
      icon={label.tone === 'done' ? <CalendarCheck aria-hidden /> : <CalendarClock aria-hidden />}
      data-due-tone={label.tone}
      className={className}
    >
      {label.text}
    </Badge>
  )
}
