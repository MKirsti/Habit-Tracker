import { CalendarDays, CalendarPlus, CalendarX2, ChevronDown, Coffee, History, Trash2, TreePalm } from 'lucide-react'
import { useEffect, useId, useMemo, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import { useGameContext } from '../../app/gameContext'
import { addRestPeriod, deleteRestPeriod, firstEditableRestDay, updateRestPeriod } from '../../data/repository'
import { addDays, compareDays, isValidDayKey } from '../../domain/dates'
import type { DayKey } from '../../domain/types'
import { Badge, Button, Card, Chip, ConfirmDialog, TextField, cn, formatNumber, useToast } from '../../ui'
import { focusIsLost, usePendingFocus } from '../treasury/focus'
import { errorMessage } from './errorMessage'
import {
  EMPTY_REST_FORM,
  REST_NOTE_MAX,
  effectiveUntil,
  hasRestErrors,
  restDraftFromValues,
  restDurationText,
  restKind,
  restLength,
  restPeriodGroups,
  restPresets,
  restRangeText,
  restTitle,
  validateRestForm,
} from './restForm'
import type { RestFormValues, RestPeriodView } from './restForm'
import { formatWeekdayDay } from './settingsText'

/** DOM-ID der Aktion (Löschen/Beenden) einer Rast in der Liste – Fokusziel nach dem Entfernen einer anderen. */
function restActionId(periodId: string): string {
  return `rest-action-${periodId}`
}

/**
 * Abschnitt „Rast & Urlaub“ (Phase 2b): Ruhetage und Urlaube planen (von/bis + Notiz) und die geplanten bzw.
 * laufenden Rasttage verwalten. An diesen Tagen ist keine Quest Pflicht, Streaks überstehen sie, Lebenspunkte bleiben
 * unberührt – Quests lassen sich trotzdem erledigen.
 */
export function RestSettings() {
  return (
    <div className="grid items-start gap-4 lg:grid-cols-2">
      <RestPlanner />
      <RestList />
    </div>
  )
}

/** Formular „Rast planen“. Meldungen erscheinen nach dem ersten Absenden direkt an den Feldern. */
function RestPlanner() {
  const { data, today } = useGameContext()
  const { toast } = useToast()
  const ids = { from: useId(), until: useId(), note: useId(), preview: useId() }
  const [values, setValues] = useState<RestFormValues>(EMPTY_REST_FORM)
  const [submitted, setSubmitted] = useState(false)
  const [busy, setBusy] = useState(false)
  const fromRef = useRef<HTMLInputElement>(null)
  const untilRef = useRef<HTMLInputElement>(null)
  const submitRef = useRef<HTMLButtonElement>(null)
  // Während des Speicherns ist „Rast eintragen“ gesperrt – der Browser nimmt ihm dabei den Fokus. Danach bekommt
  // er ihn zurück (nur, wenn er sonst auf <body> läge – nie jemandem wegnehmen, der weitergetabbt ist).
  const refocusSubmit = useRef(false)
  useEffect(() => {
    if (busy || !refocusSubmit.current) return
    refocusSubmit.current = false
    if (focusIsLost()) submitRef.current?.focus({ preventScroll: true })
  })

  const periods = useMemo(() => data.restPeriods ?? [], [data.restPeriods])
  const earliest = firstEditableRestDay(data, today)
  const errors = validateRestForm(values, { today, earliest, periods })
  const presets = restPresets(today, earliest)
  const until = effectiveUntil(values)
  const preview =
    isValidDayKey(values.from) && isValidDayKey(until) && compareDays(values.from, until) <= 0
      ? { from: values.from, until }
      : undefined

  function update(patch: Partial<RestFormValues>) {
    setValues((current) => ({ ...current, ...patch }))
  }

  async function submit(event: FormEvent) {
    event.preventDefault()
    if (busy) return
    setSubmitted(true)
    if (hasRestErrors(errors)) {
      ;(errors.from !== undefined ? fromRef : untilRef).current?.focus()
      return
    }
    const draft = restDraftFromValues(values)
    refocusSubmit.current = document.activeElement === submitRef.current
    setBusy(true)
    try {
      await addRestPeriod(draft, today)
    } catch (error) {
      toast({ tone: 'error', title: 'Rast nicht eingetragen', description: errorMessage(error) })
      return
    } finally {
      setBusy(false)
    }
    toast({
      tone: 'success',
      title: `${restKind(draft)} eingetragen`,
      description: `${restRangeText(draft)} (${restDurationText(restLength(draft))}) – gute Erholung! Deine Streaks warten auf dich.`,
    })
    setValues(EMPTY_REST_FORM)
    setSubmitted(false)
  }

  return (
    <Card title="Rast planen" titleAs="h3" icon={<TreePalm />}>
      <p className="text-sm text-muted">
        An Ruhetagen und im Urlaub ist keine Quest Pflicht: Deine Streaks überstehen die Zeit, Lebenspunkte bleiben
        unberührt. Erledigen kannst du Quests trotzdem – XP zählen wie immer.
      </p>

      <form noValidate onSubmit={(event) => void submit(event)} className="mt-4 space-y-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <TextField
            ref={fromRef}
            id={ids.from}
            type="date"
            label="Von"
            value={values.from}
            min={earliest}
            onChange={(from) => update({ from })}
            error={submitted ? errors.from : undefined}
            required
          />
          <TextField
            ref={untilRef}
            id={ids.until}
            type="date"
            label="Bis (optional)"
            value={values.until}
            min={isValidDayKey(values.from) ? values.from : earliest}
            onChange={(value) => update({ until: value })}
            error={submitted ? errors.until : undefined}
            hint="Leer lassen für einen einzelnen Ruhetag."
          />
        </div>

        <div role="group" aria-label="Zeitraum schnell wählen" className="flex flex-wrap gap-1.5">
          {presets.map((preset) => (
            <Chip
              key={preset.label}
              size="sm"
              selected={values.from === preset.from && until === preset.until}
              onClick={() => update({ from: preset.from, until: preset.until === preset.from ? '' : preset.until })}
            >
              {preset.label}
            </Chip>
          ))}
        </div>

        <TextField
          id={ids.note}
          label="Notiz (optional)"
          value={values.note}
          onChange={(note) => update({ note })}
          placeholder="z. B. Urlaub in Italien"
          maxLength={REST_NOTE_MAX}
          showCount
        />

        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <p id={ids.preview} className="min-h-5 text-sm text-muted" aria-live="polite">
            {preview && (
              <>
                <span className="font-medium text-parchment">{restKind(preview)}</span> ·{' '}
                {restDurationText(restLength(preview))} · {restRangeText(preview)}
              </>
            )}
          </p>
          <Button ref={submitRef} type="submit" icon={<CalendarPlus />} loading={busy} className="shrink-0">
            Rast eintragen
          </Button>
        </div>
      </form>
    </Card>
  )
}

/** Was die Rückfrage gerade zeigt (bleibt beim Ausblenden stehen). */
interface RemovalTarget {
  view: RestPeriodView
}

/** „Geplant & laufend“ mit Löschen bzw. Beenden; vergangene Rasttage nur zum Ansehen (aufklappbar). */
function RestList() {
  const { data, today } = useGameContext()
  const { toast } = useToast()
  const pastId = useId()
  const [target, setTarget] = useState<RemovalTarget | null>(null)
  const [lastTarget, setLastTarget] = useState<RemovalTarget | null>(null)
  const [showPast, setShowPast] = useState(false)
  const emptyRef = useRef<HTMLParagraphElement>(null)

  const periods = useMemo(() => data.restPeriods ?? [], [data.restPeriods])
  const earliest = firstEditableRestDay(data, today)
  const { active, past } = useMemo(() => restPeriodGroups(periods, today, earliest), [periods, today, earliest])
  const requestFocus = usePendingFocus(active, target !== null)

  const shown = target ?? lastTarget

  async function confirmRemoval() {
    const view = target?.view
    if (!view?.removal) return
    const { period, removal } = view
    const index = active.findIndex((item) => item.period.id === period.id)
    requestFocus({
      resolve: (current) => {
        const still = current.find((item) => item.period.id === period.id)
        if (still !== undefined && still.period.until === period.until) return undefined
        if (still?.removal !== undefined) return document.getElementById(restActionId(period.id))
        const rest = current.filter((item) => item.period.id !== period.id)
        const next = rest[Math.min(Math.max(index, 0), rest.length - 1)]
        return next ? document.getElementById(restActionId(next.period.id)) : emptyRef.current
      },
    })
    try {
      if (removal.kind === 'end') await updateRestPeriod(period.id, { until: removal.until }, today)
      else await deleteRestPeriod(period.id, today)
    } catch (error) {
      requestFocus(null)
      toast({
        tone: 'error',
        title: removal.kind === 'end' ? 'Rast nicht beendet' : 'Rast nicht gelöscht',
        description: errorMessage(error),
      })
      throw error
    }
    toast(
      removal.kind === 'end'
        ? {
            tone: 'success',
            title: 'Willkommen zurück!',
            description: 'Deine Rast endete gestern – ab heute zählen deine Quests wieder.',
          }
        : {
            tone: 'success',
            title: `${restKind(period)} gelöscht`,
            description:
              restLength(period) === 1
                ? `${restRangeText(period)} ist wieder ein ganz normaler Spieltag.`
                : `${restRangeText(period)}: wieder ganz normale Spieltage.`,
          },
    )
  }

  return (
    <Card
      title="Geplant & laufend"
      titleAs="h3"
      icon={<CalendarDays />}
      actions={active.length > 0 ? <Badge>{formatNumber(active.length)}</Badge> : undefined}
    >
      {active.length === 0 ? (
        <p
          ref={emptyRef}
          // Fokusziel, nachdem die letzte Rast gelöscht wurde.
          tabIndex={-1}
          className="rounded-xl border border-dashed border-border-strong/80 bg-surface/45 px-4 py-4 text-sm text-muted focus:outline-none"
        >
          Noch keine Rast geplant. Gönn dir eine Pause, wann immer du sie brauchst – deine Streaks warten auf dich.
        </p>
      ) : (
        <ul className="-mx-1 divide-y divide-border">
          {active.map((view) => (
            <RestRow
              key={view.period.id}
              view={view}
              onRemove={() => {
                setTarget({ view })
                setLastTarget({ view })
              }}
            />
          ))}
        </ul>
      )}

      {past.length > 0 && (
        <div className="mt-4 border-t border-border pt-3">
          <Button
            variant="ghost"
            size="sm"
            icon={<History />}
            iconRight={<ChevronDown className={cn('transition-transform', showPast && 'rotate-180')} />}
            aria-expanded={showPast}
            aria-controls={showPast ? pastId : undefined}
            onClick={() => setShowPast((current) => !current)}
            className="-ml-2"
          >
            {showPast ? 'Vergangene ausblenden' : `Vergangene anzeigen (${formatNumber(past.length)})`}
          </Button>
          {showPast && (
            <ul id={pastId} aria-label="Vergangene Rasttage" className="-mx-1 mt-1 divide-y divide-border">
              {past.map((view) => (
                <RestRow key={view.period.id} view={view} />
              ))}
            </ul>
          )}
          {showPast && (
            <p className="mt-2 text-[0.8125rem] text-muted">Vergangene Rasttage bleiben, wie sie waren.</p>
          )}
        </div>
      )}

      <ConfirmDialog
        open={target !== null}
        onClose={() => setTarget(null)}
        onConfirm={confirmRemoval}
        icon={shown?.view.removal?.kind === 'end' ? <CalendarX2 /> : <Trash2 />}
        danger={shown?.view.removal?.kind === 'delete'}
        title={shown ? removalTitle(shown.view) : 'Rast entfernen?'}
        message={shown ? removalMessage(shown.view, today) : undefined}
        confirmLabel={shown?.view.removal?.kind === 'end' ? 'Ab heute beenden' : 'Löschen'}
      />
    </Card>
  )
}

function removalTitle(view: RestPeriodView): string {
  if (view.removal?.kind === 'end') return 'Rast ab heute beenden?'
  return `${restKind(view.period)} löschen?`
}

function removalMessage(view: RestPeriodView, today: DayKey): string {
  const { period, removal } = view
  const name = period.note?.trim() ? `„${period.note.trim()}“ (${restRangeText(period)})` : restRangeText(period)
  if (removal?.kind === 'end') {
    return `Deine Rast endet dann gestern (${formatWeekdayDay(removal.until)}), gestern bleibt geschützt. Ab heute zählen deine Quests wieder – willkommen zurück!`
  }
  if (period.until === addDays(today, -1)) {
    return `${name} wird gelöscht – gestern zählt dann wieder ganz normal. Was du geschafft hast, kannst du noch nachtragen.`
  }
  return `${name} wird gelöscht. An diesen Tagen gelten deine Quests dann wieder ganz normal.`
}

interface RestRowProps {
  view: RestPeriodView
  /** Fehlt bei vergangenen Rasttagen (nur zum Ansehen). */
  onRemove?: () => void
}

function RestRow({ view, onRemove }: RestRowProps) {
  const { period, phase, status, removal } = view
  const single = period.from === period.until
  const title = restTitle(period)
  return (
    <li className={cn('flex items-center gap-3 px-1 py-3', phase === 'past' && 'opacity-80')}>
      <span
        aria-hidden="true"
        className={cn(
          'grid size-10 shrink-0 place-items-center rounded-xl ring-1 ring-inset [&_svg]:size-5',
          phase === 'current' ? 'bg-gold/12 text-gold-bright ring-gold/35' : 'bg-surface-raised text-muted ring-border-strong',
        )}
      >
        {single ? <Coffee /> : <TreePalm />}
      </span>
      <div className="min-w-0 flex-1">
        <p className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <span className="min-w-0 truncate text-[0.9375rem] font-medium text-parchment">{title}</span>
          <Badge tone={phase === 'current' ? 'gold' : 'neutral'}>{status}</Badge>
        </p>
        <p className="text-sm text-muted">
          {restRangeText(period)} · <span className="whitespace-nowrap">{restDurationText(restLength(period))}</span>
        </p>
      </div>
      {removal !== undefined && onRemove !== undefined && (
        <Button
          id={restActionId(period.id)}
          variant="ghost"
          size="sm"
          icon={removal.kind === 'end' ? <CalendarX2 /> : <Trash2 />}
          onClick={onRemove}
          aria-label={`${title} (${restRangeText(period)}) ${removal.kind === 'end' ? 'ab heute beenden' : 'löschen'}`}
          title={removal.kind === 'end' ? 'Ab heute beenden' : 'Löschen'}
          className="shrink-0"
        >
          <span className="hidden sm:inline">{removal.kind === 'end' ? 'Beenden' : 'Löschen'}</span>
        </Button>
      )}
    </li>
  )
}
