import { Pencil } from 'lucide-react'
import { useId, useState } from 'react'
import { DIFFICULTY_META } from '../../domain/balancing'
import { questXp } from '../../domain/schedule'
import type { DayKey, SideQuest } from '../../domain/types'
import { AttributeChip, Card, IconButton, cn, formatNumber } from '../../ui'
import { CheckButton } from '../dashboard/CheckButton'
import { CompletionBurst } from '../dashboard/CompletionBurst'
import { sideQuestCheckButtonId, sideQuestEditButtonId } from './domIds'
import { SideQuestDueBadge } from './SideQuestDueBadge'
import { isSideQuestDoneOn } from './sideQuestForm'

export interface SideQuestCardProps {
  quest: SideQuest
  today: DayKey
  /** Abhaken bzw. wieder öffnen (immer für heute). */
  onToggle: (quest: SideQuest, done: boolean) => void
  onEdit: (quest: SideQuest) => void
}

/**
 * Eine Nebenquest in der Verwaltung: Haken (heute erledigen / wieder öffnen), Symbol, Titel, Attribut,
 * Schwierigkeit und XP, Termin bzw. Erledigung, Beschreibung und „Bearbeiten“ (dort auch Löschen).
 */
export function SideQuestCard({ quest, today, onToggle, onEdit }: SideQuestCardProps) {
  const titleId = useId()
  const done = isSideQuestDoneOn(quest, today)
  const xp = questXp(quest.difficulty)

  // Lokale Mikro-Animation beim Erledigen (nicht beim ersten Anzeigen).
  const [prevDone, setPrevDone] = useState(done)
  const [burst, setBurst] = useState(0)
  if (prevDone !== done) {
    setPrevDone(done)
    if (done) setBurst((n) => n + 1)
  }

  return (
    <Card
      as="li"
      padding="none"
      tone={done ? 'flat' : 'default'}
      aria-labelledby={titleId}
      className={cn('p-3 transition-colors duration-300 sm:p-4', done && 'bg-linear-to-r from-gold/[0.05] to-transparent')}
    >
      <div className="flex items-start gap-3 sm:gap-4">
        <div className="relative shrink-0">
          <CheckButton
            id={sideQuestCheckButtonId(quest.id)}
            checked={done}
            progress={0}
            label={`${quest.title} erledigt`}
            onToggle={() => onToggle(quest, !done)}
          />
          <CompletionBurst burst={burst} xp={xp} onDone={() => setBurst(0)} />
        </div>

        <div className="min-w-0 flex-1 pt-0.5">
          <h3 id={titleId} className="flex items-start gap-2">
            <span aria-hidden="true" className={cn('text-xl leading-6', done && 'opacity-75 saturate-50')}>
              {quest.icon}
            </span>
            <span
              className={cn(
                'min-w-0 font-display text-base leading-6 font-semibold tracking-wide',
                done ? 'text-muted' : 'text-parchment',
              )}
            >
              {quest.title}
            </span>
          </h3>
          <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
            <AttributeChip attribute={quest.attribute} />
            <span className="px-0.5 text-sm text-muted">
              {DIFFICULTY_META[quest.difficulty].label} ·{' '}
              <span className={cn('font-medium tabular-nums', done ? 'text-gold-bright' : 'text-gold')}>
                {formatNumber(xp)} XP
              </span>
            </span>
            <SideQuestDueBadge quest={quest} today={today} />
          </div>
          {quest.description !== undefined && (
            <p className="mt-1.5 line-clamp-2 text-sm text-muted">{quest.description}</p>
          )}
        </div>

        <IconButton
          id={sideQuestEditButtonId(quest.id)}
          size="sm"
          variant="secondary"
          icon={<Pencil />}
          aria-label={`„${quest.title}“ bearbeiten`}
          title="Bearbeiten"
          onClick={() => onEdit(quest)}
          className="shrink-0"
        />
      </div>
    </Card>
  )
}
