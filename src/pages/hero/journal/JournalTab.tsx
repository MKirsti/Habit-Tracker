import { BookOpen, ChevronDown, NotebookPen, Pencil, ScrollText } from 'lucide-react'
import { useEffect, useId, useMemo, useRef, useState } from 'react'
import type { CSSProperties } from 'react'
import { useGameContext } from '../../../app/gameContext'
import { journalEvents } from '../../../domain/chronicle/journal'
import { weeklyReviews } from '../../../domain/chronicle/weeklyReview'
import { compareDays, isValidDayKey } from '../../../domain/dates'
import type { DayKey, JournalEvent, JournalNote } from '../../../domain/types'
import { Button, EmptyState, IconButton, SegmentedControl, cn, formatNumber } from '../../../ui'
import { BOSS_COLOR } from '../../dashboard/bossTheme'
import { moodLabel } from '../../dashboard/journalText'
import { ReviewStatList } from '../../dashboard/ReviewStatList'
import { REVIEW_TITLE, reviewWeekLabel, reviewXpChange, reviewXpLabel } from '../../dashboard/reviewText'
import { JournalNoteDialog } from './JournalNoteDialog'
import {
  JOURNAL_PAGE_DAYS,
  journalDayLabel,
  journalDaySubLabel,
  journalDays,
  journalMonthLabel,
  journalTone,
  moreEventsText,
  noteCount,
  noteDialogTitle,
  noteCountText,
  olderDaysText,
  previewEvents,
  reviewWeekStartOf,
  startsNewMonth,
} from './journalView'
import type { JournalFilter, JournalTone } from './journalView'

interface NoteDialogState {
  key: number
  day: DayKey
  fixedDay: boolean
}

/**
 * Held → Tagebuch (`?tab=tagebuch`, Phase 3b): die Chronik des Abenteuers, nach Tagen gruppiert (neueste zuerst) –
 * automatische Ereignisse (`journalEvents`: Level-Ups, Kapitel, Boss-Siege, Erfolge, Truhen, Gefährte …) und die
 * eigenen Notizen (mit Stimmung, hervorgehoben). Notizen lassen sich für heute und frühere Tage schreiben und
 * bearbeiten; Filter „Alles“ / „Nur Notizen“; vergangene Wochenrückblicke als kompakte Einträge (aufklappbar).
 * Lange Geschichten erscheinen seitenweise (`JOURNAL_PAGE_DAYS` Tage, dann „Ältere laden“).
 */
export function JournalTab() {
  const { data, state, today } = useGameContext()
  const baseId = `journal${useId().replace(/:/g, '')}`
  const events = useMemo(() => journalEvents(data, state, today), [data, state, today])
  const [filter, setFilter] = useState<JournalFilter>('all')
  const [shown, setShown] = useState(JOURNAL_PAGE_DAYS)
  const days = useMemo(() => journalDays(events, data.journalNotes, today, filter), [events, data.journalNotes, today, filter])
  const visible = days.slice(0, shown)
  const rest = days.length - visible.length
  const notes = noteCount(data.journalNotes, today)
  const createdDay = data.profile?.createdDay
  const [dialog, setDialog] = useState<NoteDialogState | undefined>(undefined)
  const [dialogOpen, setDialogOpen] = useState(false)

  // Nach „Ältere laden“ springt der Fokus zur Überschrift des ersten neuen Tages (der Knopf kann verschwinden).
  const focusDay = useRef<DayKey | undefined>(undefined)
  useEffect(() => {
    const day = focusDay.current
    focusDay.current = undefined
    if (day !== undefined) document.getElementById(dayHeadingId(baseId, day))?.focus()
  }, [shown, baseId])

  function openNote(day: DayKey, fixedDay: boolean) {
    setDialog((current) => ({ key: (current?.key ?? 0) + 1, day, fixedDay }))
    setDialogOpen(true)
  }

  function loadMore() {
    focusDay.current = days[visible.length]?.day
    setShown((count) => count + JOURNAL_PAGE_DAYS)
  }

  const canWrite = (day: DayKey) =>
    createdDay === undefined || !isValidDayKey(createdDay) || compareDays(day, createdDay) >= 0

  return (
    // Lesebreite: Die Chronik ist Fließtext – auf breiten Bildschirmen nicht über die ganze Fläche.
    <div className="flex max-w-3xl flex-col gap-5">
      <div className="flex flex-col gap-3 rounded-2xl border border-border bg-surface/55 p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5">
        <div className="flex min-w-0 items-start gap-3">
          <span
            aria-hidden="true"
            className="grid size-10 shrink-0 place-items-center rounded-xl bg-gold/10 text-gold ring-1 ring-gold/25 ring-inset"
          >
            <BookOpen className="size-5" />
          </span>
          <div className="min-w-0">
            <h2 className="font-display text-[1.0625rem] leading-snug font-semibold tracking-wide text-parchment">
              Tagebuch deines Abenteuers
            </h2>
            <p className="mt-0.5 text-sm text-muted">
              Was du erlebt hast, hält die Chronik von selbst fest – deine Gedanken schreibst du dazu.
            </p>
          </div>
        </div>
        <Button icon={<NotebookPen />} onClick={() => openNote(today, false)} className="shrink-0 max-sm:w-full">
          Notiz schreiben
        </Button>
      </div>

      <SegmentedControl<JournalFilter>
        aria-label="Einträge filtern"
        size="sm"
        fullWidth={false}
        className="self-start"
        value={filter}
        onChange={(next) => {
          setFilter(next)
          setShown(JOURNAL_PAGE_DAYS)
        }}
        options={[
          { value: 'all', label: 'Alles' },
          { value: 'notes', label: <>Nur Notizen{notes > 0 && <span className="ml-1 text-muted tabular-nums">{formatNumber(notes)}</span>}</>, 'aria-label': `Nur Notizen (${noteCountText(notes)})` },
        ]}
      />

      {visible.length === 0 ? (
        <EmptyState
          icon={<NotebookPen />}
          title="Noch keine Notizen"
          text="Halte fest, was dich bewegt – ein Satz genügt. Deine Notizen erscheinen dann hier."
          action={
            <Button icon={<NotebookPen />} onClick={() => openNote(today, false)}>
              Erste Notiz schreiben
            </Button>
          }
        />
      ) : (
        <ol aria-label={filter === 'notes' ? 'Deine Notizen' : 'Chronik nach Tagen'} className="flex flex-col gap-5">
          {visible.map((entry, index) => (
            <JournalDayEntry
              key={entry.day}
              baseId={baseId}
              day={entry.day}
              today={today}
              events={filter === 'all' ? entry.events : []}
              note={entry.note}
              monthLabel={startsNewMonth(entry.day, visible[index - 1]?.day) && index > 0 ? journalMonthLabel(entry.day) : undefined}
              canWrite={canWrite(entry.day)}
              onWrite={() => openNote(entry.day, true)}
            />
          ))}
        </ol>
      )}

      {rest > 0 && (
        <div className="flex flex-col items-center gap-2 pt-1">
          <p className="text-sm text-muted">{olderDaysText(rest)}</p>
          <Button variant="secondary" icon={<ChevronDown />} onClick={loadMore}>
            Ältere laden
          </Button>
        </div>
      )}

      {dialog && (
        <JournalNoteDialog
          key={dialog.key}
          open={dialogOpen}
          onClose={() => setDialogOpen(false)}
          day={dialog.day}
          fixedDay={dialog.fixedDay}
          notes={data.journalNotes}
          today={today}
          createdDay={createdDay}
        />
      )}
    </div>
  )
}

function dayHeadingId(baseId: string, day: DayKey): string {
  return `${baseId}-day-${day}`
}

interface JournalDayEntryProps {
  baseId: string
  day: DayKey
  today: DayKey
  events: readonly JournalEvent[]
  note?: JournalNote
  /** Monats-Trenner über dem Tag („Oktober 2026“). */
  monthLabel?: string
  /** Darf für diesen Tag eine Notiz geschrieben werden (ab dem Abenteuerbeginn)? */
  canWrite: boolean
  onWrite: () => void
}

function JournalDayEntry({ baseId, day, today, events, note, monthLabel, canWrite, onWrite }: JournalDayEntryProps) {
  const headingId = dayHeadingId(baseId, day)
  const label = journalDayLabel(day, today)
  const sub = journalDaySubLabel(day, today)
  const isToday = day === today
  const empty = events.length === 0 && note === undefined
  const [expanded, setExpanded] = useState(false)
  const { shown, hidden } = previewEvents(events, expanded)

  return (
    <li aria-labelledby={headingId} data-journal-day={day} className="min-w-0">
      {monthLabel && (
        <p className="mb-3 flex items-center gap-3 text-xs font-semibold tracking-[0.16em] text-gold-dim uppercase">
          <span aria-hidden="true" className="h-px w-6 bg-border-strong" />
          {monthLabel}
          <span aria-hidden="true" className="h-px flex-1 bg-linear-to-r from-border-strong to-transparent" />
        </p>
      )}
      <div className="mb-2 flex min-h-9 items-center gap-2">
        <h3
          id={headingId}
          tabIndex={-1}
          className={cn(
            'min-w-0 font-display text-[0.9375rem] font-semibold tracking-wide outline-none focus-visible:underline',
            isToday ? 'text-gold-bright' : 'text-parchment',
          )}
        >
          {label}
          {sub && <span className="ml-2 font-sans text-[0.8125rem] font-normal tracking-normal text-muted">{sub}</span>}
        </h3>
        <span aria-hidden="true" className="h-px min-w-4 flex-1 bg-linear-to-r from-border to-transparent" />
        {canWrite && note === undefined && !empty && (
          <IconButton
            size="sm"
            icon={<NotebookPen />}
            aria-label={`${noteDialogTitle(day, today)} schreiben`}
            title="Notiz schreiben"
            onClick={onWrite}
            className="text-muted"
          />
        )}
      </div>

      {empty ? (
        <div className="flex flex-col items-start gap-2 rounded-xl border border-dashed border-border-strong bg-bg-deep/30 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm text-muted">Noch nichts eingetragen – wie war dein Tag?</p>
          {canWrite && (
            <Button
              variant="ghost"
              size="sm"
              icon={<NotebookPen />}
              onClick={onWrite}
              aria-label={`${noteDialogTitle(day, today)} schreiben`}
              className="-ml-2 text-gold! sm:ml-0"
            >
              Notiz schreiben
            </Button>
          )}
        </div>
      ) : (
        <div className="flex flex-col gap-2.5">
          {note && <NoteCard note={note} editLabel={`${noteDialogTitle(day, today)} bearbeiten`} onEdit={onWrite} />}
          {events.length > 0 && (
            <ul className="relative flex flex-col gap-2.5 pl-0.5">
              {/* Zeitleiste: feine Linie hinter den Symbolen */}
              {shown.length > 1 && (
                <span aria-hidden="true" className="absolute top-4 bottom-4 left-[1.1875rem] w-px bg-border-strong/70" />
              )}
              {shown.map((event, index) =>
                event.kind === 'weeklyReview' ? (
                  <ReviewEntry key={`${event.kind}-${index}`} event={event} />
                ) : (
                  <EventRow key={`${event.kind}-${index}`} event={event} />
                ),
              )}
            </ul>
          )}
          {hidden > 0 && (
            <Button
              variant="ghost"
              size="sm"
              icon={<ChevronDown />}
              onClick={() => setExpanded(true)}
              className="ml-9 self-start text-gold!"
            >
              {moreEventsText(hidden)} anzeigen
            </Button>
          )}
        </div>
      )}
    </li>
  )
}

/** Ring und Fläche des Symbols je Art des Ereignisses. */
function toneStyle(tone: JournalTone): CSSProperties | undefined {
  const mix = (color: string, percent: number) => `color-mix(in srgb, ${color} ${percent}%, transparent)`
  switch (tone) {
    case 'boss':
      return { borderColor: mix(BOSS_COLOR, 60), backgroundColor: mix(BOSS_COLOR, 16) }
    case 'companion':
      return { borderColor: mix('#e3a76f', 55), backgroundColor: mix('#e3a76f', 12) }
    default:
      return undefined
  }
}

const TONE_CLASS: Record<JournalTone, string> = {
  gold: 'border-gold/45 bg-gold/10',
  boss: '',
  companion: '',
  review: 'border-parchment/40 bg-parchment/8',
  calm: 'border-border-strong bg-surface-raised',
}

function EventIcon({ event }: { event: JournalEvent }) {
  const tone = journalTone(event.kind)
  return (
    <span
      aria-hidden="true"
      className={cn('relative z-10 grid size-9 shrink-0 place-items-center rounded-full border text-lg leading-none', TONE_CLASS[tone])}
      style={toneStyle(tone)}
    >
      {event.icon}
    </span>
  )
}

function EventRow({ event }: { event: JournalEvent }) {
  return (
    <li className="flex min-w-0 items-start gap-3" data-journal-kind={event.kind}>
      <EventIcon event={event} />
      <div className="min-w-0 flex-1 pt-1.5">
        <p className="text-sm leading-snug font-medium wrap-anywhere text-parchment">{event.text}</p>
        {event.detail && <p className="mt-0.5 text-[0.8125rem] leading-snug wrap-anywhere text-muted">{event.detail}</p>}
      </div>
    </li>
  )
}

/** Vergangener Wochenrückblick: kompakt (XP, Perfekte Tage, der Satz), aufklappbar zum ganzen Bericht. */
function ReviewEntry({ event }: { event: JournalEvent }) {
  const [open, setOpen] = useState(false)
  const detailsId = useId()
  const weekStart = reviewWeekStartOf(event)
  return (
    <li className="flex min-w-0 items-start gap-3" data-journal-kind={event.kind}>
      <EventIcon event={event} />
      <div className="min-w-0 flex-1 rounded-xl border border-parchment/20 bg-linear-to-b from-parchment/6 to-transparent px-3.5 py-2.5">
        <p className="flex flex-wrap items-center gap-x-2 text-[0.6875rem] font-semibold tracking-[0.14em] text-gold uppercase">
          <ScrollText aria-hidden className="size-3.5" />
          {REVIEW_TITLE}
          <span className="font-sans font-normal tracking-normal text-muted normal-case">· {reviewWeekLabel(weekStart)}</span>
        </p>
        <p className="mt-1 text-sm leading-snug font-medium text-parchment">{event.text}</p>
        {event.detail && <p className="mt-0.5 font-serif text-[0.9375rem] leading-snug text-parchment/80 italic">„{event.detail}“</p>}
        <Button
          variant="ghost"
          size="sm"
          iconRight={<ChevronDown className={cn('transition-transform duration-150', open && 'rotate-180')} />}
          aria-expanded={open}
          aria-controls={open ? detailsId : undefined}
          onClick={() => setOpen((value) => !value)}
          className="mt-1 -ml-2.5 text-gold!"
        >
          {open ? 'Bericht zuklappen' : 'Ganzen Bericht ansehen'}
        </Button>
        {open && <ReviewDetails id={detailsId} weekStart={weekStart} />}
      </div>
    </li>
  )
}

/** Der ganze Bericht einer Woche – erst beim Aufklappen gerechnet. */
function ReviewDetails({ id, weekStart }: { id: string; weekStart: DayKey }) {
  const { data, state } = useGameContext()
  const review = useMemo(() => weeklyReviews(data, state, [weekStart])[0], [data, state, weekStart])
  if (review === undefined) return null
  const change = reviewXpChange(review)
  return (
    <div id={id} className="mt-2 border-t border-parchment/15 pt-2.5">
      <p className="flex flex-wrap items-baseline gap-x-2 text-sm">
        <span className="font-display text-base font-semibold text-gold-bright tabular-nums">{reviewXpLabel(review.xp)}</span>
        {change && (
          <span className="text-[0.8125rem] text-muted tabular-nums">
            <span aria-hidden="true">
              {change.arrow} {change.text}
            </span>
            <span className="sr-only">{change.spoken}</span>
          </span>
        )}
      </p>
      <ReviewStatList review={review} variant="compact" className="mt-2" />
    </div>
  )
}

function NoteCard({ note, editLabel, onEdit }: { note: JournalNote; editLabel: string; onEdit: () => void }) {
  const mood = moodLabel(note.mood)
  return (
    <div
      data-journal-note={note.day}
      className="relative flex min-w-0 items-start gap-3 rounded-xl border border-gold/35 bg-linear-to-br from-gold/12 via-surface/80 to-surface/70 px-3.5 py-3 shadow-[inset_0_1px_0_rgb(240_201_106/0.15)]"
    >
      <span
        aria-hidden="true"
        className="grid size-9 shrink-0 place-items-center rounded-full border border-gold/45 bg-black/25 text-xl leading-none"
      >
        {note.mood ?? '📝'}
      </span>
      <div className="min-w-0 flex-1 pt-0.5">
        <p className="text-[0.6875rem] font-semibold tracking-[0.14em] text-gold uppercase">
          Deine Notiz
          {mood && <span className="ml-1.5 font-sans font-normal tracking-normal text-muted normal-case">· {mood}</span>}
        </p>
        {note.text !== '' ? (
          <p className="mt-1 text-[0.9375rem] leading-relaxed whitespace-pre-line wrap-anywhere text-parchment">{note.text}</p>
        ) : (
          <p className="mt-1 text-sm text-muted italic">Nur die Stimmung festgehalten.</p>
        )}
      </div>
      <IconButton
        size="sm"
        icon={<Pencil />}
        aria-label={editLabel}
        onClick={onEdit}
        className="-mt-1 -mr-1.5 text-muted"
      />
    </div>
  )
}
