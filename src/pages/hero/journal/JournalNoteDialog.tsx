import { Check, NotebookPen, Trash2 } from 'lucide-react'
import { useId, useRef, useState } from 'react'
import type { FormEvent, KeyboardEvent } from 'react'
import { MAX_JOURNAL_NOTE_LENGTH, saveJournalNote } from '../../../data/repository'
import type { DayKey, JournalNote } from '../../../domain/types'
import { Button, Dialog, TextArea, TextField, cn, useToast } from '../../../ui'
import { JOURNAL_MOODS, NOTE_PLACEHOLDER } from '../../dashboard/journalText'
import { errorMessage } from '../../settings/errorMessage'
import { noteDayError, noteDialogTitle } from './journalView'

export interface JournalNoteDialogProps {
  open: boolean
  onClose: () => void
  /** Tag, für den der Dialog startet. */
  day: DayKey
  /** `true`: Der Tag steht fest (Notiz eines bestimmten Tages); sonst lässt er sich wählen. */
  fixedDay: boolean
  /** Alle Notizen (`data.journalNotes`) – eine schon geschriebene des gewählten Tages wird bearbeitet. */
  notes: readonly JournalNote[] | undefined
  today: DayKey
  /** Abenteuerbeginn – frühester Tag fürs Tagebuch. */
  createdDay?: DayKey
}

function noteOf(notes: readonly JournalNote[] | undefined, day: DayKey): JournalNote | undefined {
  return notes?.find((note) => note.day === day)
}

/**
 * Notiz schreiben oder bearbeiten (Phase 3b, eine pro Tag): ein paar Worte (bis 280 Zeichen) und – wer mag – eine
 * Stimmung (nochmal tippen hebt die Wahl auf; dieselben Stimmungen wie bei „Notiz zu heute“ auf der Tagesübersicht).
 * Ohne festen Tag lässt sich ein Tag wählen (heute oder früher, ab dem Abenteuerbeginn); gibt es dort schon eine Notiz,
 * wird sie geladen. „Löschen“ entfernt eine geschriebene Notiz.
 * Tipp: Mit wechselndem `key` öffnen, damit das Formular jedes Mal frisch startet.
 */
export function JournalNoteDialog({ open, onClose, day: initialDay, fixedDay, notes, today, createdDay }: JournalNoteDialogProps) {
  const { toast } = useToast()
  const formId = useId()
  const moodLabelId = useId()
  const textRef = useRef<HTMLTextAreaElement>(null)
  const [day, setDay] = useState(initialDay)
  const existing = noteOf(notes, day)
  const [text, setText] = useState(existing?.text ?? '')
  const [mood, setMood] = useState<string | undefined>(existing?.mood)
  const [error, setError] = useState<string | undefined>(undefined)
  const [busy, setBusy] = useState<'save' | 'delete' | undefined>(undefined)
  const dayError = noteDayError({ day, today, createdDay })
  // Eine gespeicherte Stimmung, die nicht (mehr) zur Auswahl gehört, bleibt wählbar.
  const moods = mood !== undefined && !JOURNAL_MOODS.some((entry) => entry.emoji === mood)
    ? [...JOURNAL_MOODS, { emoji: mood, label: 'Deine Stimmung' }]
    : JOURNAL_MOODS

  function changeDay(next: DayKey) {
    setDay(next)
    setError(undefined)
    const note = noteOf(notes, next)
    if (note !== undefined) {
      setText(note.text)
      setMood(note.mood)
    } else if (existing !== undefined && text === existing.text && mood === existing.mood) {
      // Die unveränderte Notiz des bisherigen Tages gehört nicht zum neuen – sonst stünde sie dort doppelt.
      // Selbst Getipptes bleibt dagegen stehen.
      setText('')
      setMood(undefined)
    }
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    if (busy !== undefined || dayError !== undefined) return
    if (text.trim() === '' && mood === undefined && existing === undefined) {
      setError('Schreib ein paar Worte oder wähle eine Stimmung.')
      textRef.current?.focus()
      return
    }
    setBusy('save')
    try {
      const saved = await saveJournalNote(day, { text, ...(mood !== undefined ? { mood } : {}) }, today)
      if (saved !== undefined) toast({ tone: 'success', icon: '📝', title: 'Ins Tagebuch geschrieben' })
      else toast({ tone: 'info', title: 'Notiz entfernt' })
      onClose()
    } catch (saveError) {
      toast({ tone: 'error', title: 'Notiz nicht gespeichert', description: errorMessage(saveError) })
    } finally {
      setBusy(undefined)
    }
  }

  async function remove() {
    if (busy !== undefined) return
    setBusy('delete')
    try {
      await saveJournalNote(day, { text: '' }, today)
      toast({ tone: 'info', title: 'Notiz entfernt' })
      onClose()
    } catch (saveError) {
      toast({ tone: 'error', title: 'Notiz nicht entfernt', description: errorMessage(saveError) })
    } finally {
      setBusy(undefined)
    }
  }

  return (
    <Dialog
      open={open}
      onClose={busy !== undefined ? () => {} : onClose}
      title={noteDialogTitle(day, today)}
      description="Ein Gedanke, ein kleiner Sieg, ein Gefühl – nur für dich."
      icon={<NotebookPen />}
      initialFocusRef={textRef}
      footer={
        <>
          {existing !== undefined && (
            <Button
              variant="ghost"
              icon={<Trash2 />}
              onClick={() => void remove()}
              loading={busy === 'delete'}
              disabled={busy === 'save'}
              className="text-muted sm:mr-auto"
            >
              Löschen
            </Button>
          )}
          <Button variant="secondary" onClick={onClose} disabled={busy !== undefined}>
            Abbrechen
          </Button>
          <Button
            type="submit"
            form={formId}
            icon={<Check />}
            loading={busy === 'save'}
            disabled={busy === 'delete' || dayError !== undefined}
          >
            Speichern
          </Button>
        </>
      }
    >
      <form id={formId} noValidate onSubmit={(event) => void handleSubmit(event)} className="flex flex-col gap-4">
        {!fixedDay && (
          <TextField
            type="date"
            label="Tag"
            value={day}
            onChange={changeDay}
            max={today}
            min={createdDay}
            error={dayError}
            hint={existing !== undefined && dayError === undefined ? 'Für diesen Tag gibt es schon eine Notiz – du bearbeitest sie.' : undefined}
          />
        )}
        <div>
          <p id={moodLabelId} className="mb-2 text-sm font-medium text-parchment">
            Stimmung <span className="font-normal text-muted">(optional)</span>
          </p>
          <MoodPicker moods={moods} value={mood} onChange={(next) => {
            setMood(next)
            setError(undefined)
          }} labelledBy={moodLabelId} />
        </div>
        <TextArea
          ref={textRef}
          label="Notiz"
          value={text}
          onChange={(value) => {
            setText(value)
            setError(undefined)
          }}
          maxLength={MAX_JOURNAL_NOTE_LENGTH}
          showCount
          rows={4}
          placeholder={NOTE_PLACEHOLDER}
          error={error}
        />
      </form>
    </Dialog>
  )
}

/**
 * Stimmungen als Reihe von Emoji-Knöpfen (Radiogruppe, die sich wieder abwählen lässt: nochmal tippen hebt die Wahl
 * auf). Pfeiltasten wechseln, Leertaste/Enter wählt.
 */
function MoodPicker({
  moods,
  value,
  onChange,
  labelledBy,
}: {
  moods: readonly { emoji: string; label: string }[]
  value: string | undefined
  onChange: (mood: string | undefined) => void
  labelledBy: string
}) {
  const buttons = useRef<(HTMLButtonElement | null)[]>([])
  const selectedIndex = moods.findIndex((entry) => entry.emoji === value)
  const tabStop = selectedIndex >= 0 ? selectedIndex : 0

  function onKeyDown(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    const last = moods.length - 1
    let next: number | undefined
    if (event.key === 'ArrowRight' || event.key === 'ArrowDown') next = index === last ? 0 : index + 1
    else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') next = index === 0 ? last : index - 1
    else if (event.key === 'Home') next = 0
    else if (event.key === 'End') next = last
    if (next === undefined) return
    event.preventDefault()
    buttons.current[next]?.focus()
  }

  return (
    <div role="radiogroup" aria-labelledby={labelledBy} className="flex flex-wrap gap-1.5">
      {moods.map((entry, index) => {
        const selected = entry.emoji === value
        return (
          <button
            key={entry.emoji}
            ref={(element) => {
              buttons.current[index] = element
            }}
            type="button"
            role="radio"
            aria-checked={selected}
            aria-label={entry.label}
            title={entry.label}
            tabIndex={index === tabStop ? 0 : -1}
            onClick={() => onChange(selected ? undefined : entry.emoji)}
            onKeyDown={(event) => onKeyDown(event, index)}
            className={cn(
              'grid size-11 place-items-center rounded-xl border text-[1.375rem] leading-none transition-[border-color,background-color,box-shadow,transform] duration-150 active:scale-90',
              selected
                ? 'border-gold/70 bg-gold/15 shadow-[0_0_14px_-5px_rgb(240_201_106/0.8)]'
                : 'border-border bg-surface/60 hover:border-gold/35 hover:bg-surface-hover',
            )}
          >
            <span aria-hidden="true">{entry.emoji}</span>
          </button>
        )
      })}
    </div>
  )
}
