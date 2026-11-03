import { Archive, Check, Minus, Pencil, Plus, Sparkles, TriangleAlert, Trophy, Undo2 } from 'lucide-react'
import { motion } from 'motion/react'
import { useId, useRef, useState } from 'react'
import type { ReactNode, Ref } from 'react'
import { useGameContext } from '../../app/gameContext'
import { setChapterCounter, setChapterManual } from '../../data/repository'
import { BALANCING } from '../../domain/balancing'
import { reachesTarget } from '../../domain/schedule'
import type { Chapter, ChapterState, Habit, MainQuestState } from '../../domain/types'
import { Badge, Button, IconButton, ProgressBar, cn, formatNumber, useToast } from '../../ui'
import { chapterProgressText, formatDate, formatValue, isArchived } from './campaignText'
import { errorMessage } from './errors'

export type ChapterStatus = 'done' | 'current' | 'upcoming'

export interface ChapterTimelineProps {
  campaign: MainQuestState
  habitsById: ReadonlyMap<string, Habit>
  /** Kapitel bearbeiten (öffnet den Kapitel-Dialog). */
  onEditChapter: (chapter: Chapter, index: number) => void
  /** Neues Kapitel am Ende anlegen. */
  onAddChapter: () => void
  /** Kurze Rückmeldung für Screenreader (aria-live der Seite). */
  onAnnounce: (message: string) => void
  /** Ref auf „Kapitel hinzufügen“ (Fokusziel nach dem Löschen eines Kapitels). */
  addButtonRef?: Ref<HTMLButtonElement>
}

/**
 * Kapitel als senkrechte Questkarte: verbundene Knoten von oben nach unten, am Ende das Ziel
 * (die Belohnung). Abgeschlossene Kapitel leuchten golden, das aktuelle Kapitel ist hervorgehoben.
 */
export function ChapterTimeline({
  campaign,
  habitsById,
  onEditChapter,
  onAddChapter,
  onAnnounce,
  addButtonRef,
}: ChapterTimelineProps) {
  const { quest, chapters, currentChapterIndex, complete } = campaign
  const lastDone = chapters.length > 0 && chapters[chapters.length - 1].done

  return (
    <ol className="relative">
      {chapters.map((state, index) => {
        const status: ChapterStatus = state.done ? 'done' : index === currentChapterIndex ? 'current' : 'upcoming'
        return (
          <ChapterNode
            key={state.chapter.id}
            questId={quest.id}
            state={state}
            index={index}
            status={status}
            habit={state.chapter.criterion.type === 'habit' ? habitsById.get(state.chapter.criterion.habitId) : undefined}
            onEdit={() => onEditChapter(state.chapter, index)}
            onAnnounce={onAnnounce}
          />
        )
      })}

      {/* Neues Kapitel: gestrichelter Knoten vor dem Ziel */}
      <li className="relative grid grid-cols-[2.75rem_minmax(0,1fr)] gap-x-3 pb-5 sm:gap-x-4">
        <TrailSegment traveled={lastDone} />
        <div className="relative flex justify-center pt-0.5">
          <span
            aria-hidden="true"
            className="grid size-10 place-items-center rounded-full border border-dashed border-border-strong bg-bg/90 text-muted"
          >
            <Plus className="size-4" />
          </span>
        </div>
        <div className="flex min-h-11 flex-col items-start justify-center">
          <Button
            ref={addButtonRef}
            variant="ghost"
            size="sm"
            icon={<Plus />}
            onClick={onAddChapter}
            className="-ml-2 text-gold! hover:text-gold-bright!"
          >
            {chapters.length === 0 ? 'Erstes Kapitel anlegen' : 'Kapitel hinzufügen'}
          </Button>
          {chapters.length === 0 && (
            <p className="mt-1 max-w-prose text-sm text-muted">
              Kapitel sind die Etappen deiner Kampagne – zum Abhaken, Zählen oder automatisch aus einer Quest. Jedes
              bringt +{formatNumber(BALANCING.chapterXp)} XP.
            </p>
          )}
        </div>
      </li>

      {/* Ziel der Reise */}
      <li className="relative grid grid-cols-[2.75rem_minmax(0,1fr)] gap-x-3 sm:gap-x-4">
        <div className="relative flex justify-center">
          <span
            aria-hidden="true"
            className={cn(
              'relative grid size-11 place-items-center rounded-full [&_svg]:size-5',
              complete
                ? 'bg-linear-to-b from-gold-bright to-gold text-on-gold shadow-glow'
                : 'border border-border-strong bg-surface text-gold-dim',
            )}
          >
            {complete && <span className="absolute -inset-1.5 animate-glow-pulse rounded-full ring-1 ring-gold/50" />}
            <Trophy />
          </span>
        </div>
        <div className="min-w-0 pt-1">
          <p className="text-xs font-semibold tracking-[0.16em] text-gold uppercase">Ziel</p>
          <p className={cn('mt-0.5 font-display text-[1.0625rem] font-semibold tracking-wide', complete ? 'text-gold-bright' : 'text-parchment')}>
            {complete ? 'Kampagne gemeistert' : 'Kampagne meistern'}
          </p>
          {quest.reward !== '' && (
            <p className="mt-0.5 text-sm text-muted">
              Belohnung: <span className="text-parchment">{quest.reward}</span>
            </p>
          )}
        </div>
      </li>
    </ol>
  )
}

/** Verbindungslinie vom Knoten dieser Zeile zum nächsten. Gold = bereits zurückgelegter Weg. */
function TrailSegment({ traveled }: { traveled: boolean }) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        'absolute top-11 bottom-0 left-[1.375rem] -translate-x-1/2',
        traveled
          ? 'w-0.5 bg-linear-to-b from-gold to-gold/55 shadow-[0_0_8px_rgb(240_201_106/0.35)]'
          : 'w-0 border-l-2 border-dashed border-border-strong',
      )}
    />
  )
}

interface ChapterNodeProps {
  questId: string
  state: ChapterState
  index: number
  status: ChapterStatus
  habit: Habit | undefined
  onEdit: () => void
  onAnnounce: (message: string) => void
}

function ChapterNode({ questId, state, index, status, habit, onEdit, onAnnounce }: ChapterNodeProps) {
  const { chapter } = state
  const { today } = useGameContext()
  const titleId = useId()
  const number = formatNumber(index + 1)

  return (
    <li aria-current={status === 'current' ? 'step' : undefined} className="relative grid grid-cols-[2.75rem_minmax(0,1fr)] gap-x-3 pb-5 sm:gap-x-4">
      <TrailSegment traveled={status === 'done'} />

      {/* Knoten */}
      <div className="relative flex justify-center pt-3">
        <span
          aria-hidden="true"
          className={cn(
            'relative grid size-11 place-items-center rounded-full font-display text-base font-bold tabular-nums',
            status === 'done' && 'bg-linear-to-b from-gold-bright to-gold text-on-gold shadow-glow-sm',
            status === 'current' && 'bg-surface-raised text-gold-bright shadow-glow ring-2 ring-gold',
            status === 'upcoming' && 'bg-surface text-muted ring-1 ring-border-strong',
          )}
        >
          {status === 'current' && <span className="absolute -inset-1.5 animate-glow-pulse rounded-full ring-1 ring-gold/45" />}
          {status === 'done' ? (
            <motion.span initial={{ scale: 0.4, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="grid place-items-center">
              <Check className="size-5" strokeWidth={3} />
            </motion.span>
          ) : (
            number
          )}
        </span>
      </div>

      {/* Inhalt */}
      <article
        aria-labelledby={titleId}
        className={cn(
          'relative min-w-0 rounded-2xl border p-4 sm:p-5',
          status === 'current' &&
            'border-gold/45 bg-linear-to-b from-gold-deep/45 to-surface/95 shadow-[inset_0_1px_0_rgb(240_201_106/0.14),0_14px_36px_-18px_rgb(212_165_72/0.45)]',
          status === 'done' && 'border-gold/20 bg-surface/80 shadow-card',
          status === 'upcoming' && 'border-border bg-surface/55',
        )}
      >
        <div className="flex items-start gap-2">
          <div className="min-w-0 flex-1">
            <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs font-semibold tracking-[0.14em] uppercase">
              <span className={status === 'upcoming' ? 'text-muted' : 'text-gold'}>Kapitel {number}</span>
              {status === 'current' && (
                <Badge tone="gold" icon={<Sparkles />} className="tracking-normal normal-case">
                  Aktuelles Kapitel
                </Badge>
              )}
            </p>
            <h3
              id={titleId}
              className={cn(
                'mt-1 font-display text-[1.0625rem] leading-snug font-semibold tracking-wide',
                status === 'upcoming' ? 'text-parchment/90' : 'text-parchment',
              )}
            >
              {chapter.title}
            </h3>
          </div>
          <IconButton
            size="sm"
            icon={<Pencil />}
            aria-label={`Kapitel „${chapter.title}“ bearbeiten`}
            onClick={onEdit}
            className="-mt-1 -mr-2 text-muted"
          />
        </div>

        {status === 'done' && (
          <p className="mt-1.5 flex items-center gap-1.5 text-sm font-medium text-gold-bright">
            <Check aria-hidden className="size-4" strokeWidth={2.5} />
            {state.doneDay !== undefined ? `Abgeschlossen am ${formatDate(state.doneDay, today)}` : 'Abgeschlossen'}
          </p>
        )}

        {chapter.description !== undefined && (
          <p className={cn('mt-1.5 text-[0.9375rem]', status === 'upcoming' ? 'text-muted' : 'text-parchment/85')}>
            {chapter.description}
          </p>
        )}

        <div className="mt-3.5">
          {state.brokenReference ? (
            <BrokenReference onEdit={onEdit} />
          ) : chapter.criterion.type === 'manual' ? (
            <ManualAction questId={questId} state={state} status={status} titleId={titleId} onAnnounce={onAnnounce} />
          ) : chapter.criterion.type === 'counter' ? (
            <CounterAction questId={questId} state={state} status={status} onAnnounce={onAnnounce} />
          ) : (
            <HabitProgress
              state={state}
              habit={habit}
              status={status}
              archived={habit !== undefined && isArchived(habit, today)}
            />
          )}
        </div>
      </article>
    </li>
  )
}

function BrokenReference({ onEdit }: { onEdit: () => void }) {
  return (
    <div className="rounded-xl border border-warning/40 bg-warning/8 p-3.5 text-sm">
      <p className="flex items-start gap-2 text-parchment">
        <TriangleAlert aria-hidden className="mt-0.5 size-4 shrink-0 text-warning" />
        <span>
          <strong className="font-semibold text-warning">Verknüpfte Quest gelöscht.</strong> Dieses Kapitel kann
          nicht mehr automatisch fortschreiten. Wähle eine andere Quest oder ändere die Art des Kapitels.
        </span>
      </p>
      <Button variant="secondary" size="sm" icon={<Pencil />} onClick={onEdit} className="mt-3">
        Kapitel bearbeiten
      </Button>
    </div>
  )
}

/** Fortschrittszeile: links (optional) die Quest, rechts der Wert, darunter der Balken. */
function ProgressLine({
  state,
  status,
  lead,
  habit,
}: {
  state: ChapterState
  status: ChapterStatus
  lead?: ReactNode
  habit?: Habit
}) {
  const text = chapterProgressText(state, habit)
  if (!text) return null
  return (
    <div>
      <div className="mb-1.5 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5 text-sm">
        {lead}
        <span className={cn('text-muted tabular-nums', lead !== undefined && 'ml-auto')}>
          {text.prefix !== '' && <>{text.prefix} </>}
          <span className={cn('font-semibold', status === 'upcoming' ? 'text-parchment/90' : 'text-parchment')}>
            {text.value}
          </span>{' '}
          {text.suffix}
        </span>
      </div>
      <ProgressBar
        value={state.progress}
        size={status === 'done' ? 'sm' : 'md'}
        aria-label={`Fortschritt: ${state.chapter.title}`}
        valueText={text.spoken}
        glow={status === 'current'}
      />
    </div>
  )
}

function HabitProgress({
  state,
  habit,
  status,
  archived,
}: {
  state: ChapterState
  habit: Habit | undefined
  status: ChapterStatus
  /** Die Quest ist archiviert – das Kapitel kann gerade nicht fortschreiten. */
  archived: boolean
}) {
  const lead = habit ? (
    <span className="flex min-w-0 items-center gap-1.5 text-parchment/90">
      <span aria-hidden="true" className="text-base leading-none">
        {habit.icon}
      </span>
      <span className="truncate">{habit.title}</span>
    </span>
  ) : undefined
  return (
    <>
      <ProgressLine state={state} status={status} lead={lead} habit={habit} />
      {archived && !state.done && (
        <p className="mt-2.5 flex items-start gap-2 text-[0.8125rem] text-muted">
          <Archive aria-hidden className="mt-0.5 size-3.5 shrink-0 text-warning" />
          <span>Die Quest ist archiviert – hol sie zurück, damit dieses Kapitel weiter fortschreitet.</span>
        </p>
      )}
    </>
  )
}

function useChapterWrite() {
  const { toast } = useToast()
  return async (write: () => Promise<void>): Promise<boolean> => {
    try {
      await write()
      return true
    } catch (error) {
      toast({ tone: 'error', title: 'Kapitel konnte nicht gespeichert werden', description: errorMessage(error) })
      return false
    }
  }
}

function ManualAction({
  questId,
  state,
  status,
  titleId,
  onAnnounce,
}: {
  questId: string
  state: ChapterState
  status: ChapterStatus
  titleId: string
  onAnnounce: (message: string) => void
}) {
  const { today } = useGameContext()
  const run = useChapterWrite()
  const busy = useRef(false)
  const { chapter, done } = state

  async function toggle() {
    // Kein `disabled` während des Speicherns: Der Button soll den Fokus behalten.
    if (busy.current) return
    busy.current = true
    const ok = await run(() => setChapterManual(questId, chapter.id, !done, today))
    busy.current = false
    if (ok) onAnnounce(done ? `Kapitel „${chapter.title}“ ist wieder offen.` : `Kapitel „${chapter.title}“ abgeschlossen!`)
  }

  // Beide Zustände rendern denselben Button an derselben Stelle – so bleibt der Fokus beim Umschalten erhalten.
  return (
    <div className={cn('flex', done && 'justify-end')}>
      <Button
        variant={done ? 'ghost' : status === 'current' ? 'primary' : 'secondary'}
        size={done ? 'sm' : 'md'}
        icon={done ? <Undo2 /> : <Check />}
        aria-describedby={titleId}
        onClick={toggle}
        className={cn(done ? '-mr-2 text-muted' : 'w-full sm:w-auto')}
      >
        {done ? 'Rückgängig' : 'Als erledigt markieren'}
      </Button>
    </div>
  )
}

function CounterAction({
  questId,
  state,
  status,
  onAnnounce,
}: {
  questId: string
  state: ChapterState
  status: ChapterStatus
  onAnnounce: (message: string) => void
}) {
  const { today } = useGameContext()
  const run = useChapterWrite()
  const { chapter, target } = state
  const label = chapter.criterion.type === 'counter' ? chapter.criterion.label : ''

  // Optimistischer Wert: Schnelle Klicks bauen aufeinander auf, auch bevor die Live-Daten nachziehen.
  const [pending, setPending] = useState<number | null>(null)
  if (pending !== null && pending === state.current) setPending(null)
  const value = pending ?? state.current
  const latest = useRef(0)

  async function change(delta: 1 | -1) {
    const next = Math.max(0, value + delta)
    if (next === value) return
    const request = ++latest.current
    setPending(next)
    const ok = await run(() => setChapterCounter(questId, chapter.id, next, today))
    if (!ok) {
      if (request === latest.current) setPending(null)
      return
    }
    const reached = reachesTarget(next, target) && !reachesTarget(value, target)
    onAnnounce(
      `${label}: ${formatValue(next)} von ${formatValue(target)}${reached ? ` – Kapitel „${chapter.title}“ abgeschlossen!` : ''}`,
    )
  }

  const shown: ChapterState = pending === null ? state : { ...state, current: value, progress: target > 0 ? Math.min(1, value / target) : 1 }
  const text = chapterProgressText(shown, undefined)
  const atZero = value <= 0

  return (
    <div>
      <div className="flex items-center gap-3">
        <p className="min-w-0 flex-1 text-sm text-muted">
          <span
            className={cn(
              'text-lg font-bold tabular-nums',
              status === 'upcoming' ? 'text-parchment/90' : 'text-parchment',
            )}
          >
            {formatValue(value)}
          </span>
          <span className="tabular-nums"> / {formatValue(target)}</span>{' '}
          <span className="block leading-snug sm:inline">{label}</span>
        </p>
        <div className="flex shrink-0 gap-1.5" role="group" aria-label={`Zähler: ${chapter.title}`}>
          <IconButton
            variant="secondary"
            size="sm"
            icon={<Minus />}
            aria-label={`${label} verringern`}
            // aria-disabled statt disabled: Der Fokus bleibt auf dem Button, wenn 0 erreicht wird.
            aria-disabled={atZero || undefined}
            onClick={() => {
              if (!atZero) void change(-1)
            }}
          />
          <IconButton
            variant={status === 'current' ? 'primary' : 'secondary'}
            size="sm"
            icon={<Plus />}
            aria-label={`${label} erhöhen`}
            onClick={() => void change(1)}
          />
        </div>
      </div>
      <ProgressBar
        className="mt-2"
        value={shown.progress}
        size={status === 'done' ? 'sm' : 'md'}
        aria-label={`Fortschritt: ${chapter.title}`}
        valueText={text?.spoken}
        glow={status === 'current'}
      />
    </div>
  )
}
