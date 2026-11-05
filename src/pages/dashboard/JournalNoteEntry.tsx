import { ChevronDown, NotebookPen } from 'lucide-react'
import type { FormEvent } from 'react'
import { useEffect, useId, useRef, useState } from 'react'
import { MAX_JOURNAL_NOTE_LENGTH, saveJournalNote } from '../../data/repository'
import type { DayKey, JournalNote } from '../../domain/types'
import { Button, Card, TextArea, cn, useToast } from '../../ui'
import { JOURNAL_MOODS, NOTE_PLACEHOLDER, moodLabel, notePreview } from './journalText'

export interface JournalNoteEntryProps {
  today: DayKey
  /** Die schon geschriebene Notiz von heute (`data.journalNotes`), falls vorhanden. */
  note?: JournalNote
}

/**
 * Kleiner, zugeklappter Eintrag „Notiz zu heute“ (Phase 3b, Tagebuch): aufgeklappt ein Textfeld (bis 280 Zeichen) und
 * eine Reihe Stimmungs-Emojis (eines wählbar, nochmal tippen hebt die Wahl auf). „Speichern“ schreibt ins Tagebuch
 * (`saveJournalNote` – leer ohne Stimmung entfernt die Notiz). Zugeklappt steht eine schon geschriebene Notiz als
 * kurze Vorschau da. Alle Notizen stehen im Tagebuch der Heldenseite.
 */
export function JournalNoteEntry({ today, note }: JournalNoteEntryProps) {
  const panelId = useId()
  const moodLabelId = useId()
  const { toast } = useToast()
  const [open, setOpen] = useState(false)
  const [text, setText] = useState('')
  const [mood, setMood] = useState<string | undefined>(undefined)
  const [busy, setBusy] = useState(false)
  const toggleRef = useRef<HTMLButtonElement>(null)
  const textRef = useRef<HTMLTextAreaElement>(null)
  // Nach dem Aufklappen ins Textfeld, nach dem Zuklappen zurück auf den Umschalter.
  const focusNext = useRef<'text' | 'toggle' | undefined>(undefined)
  useEffect(() => {
    const target = focusNext.current
    focusNext.current = undefined
    if (target === 'text') textRef.current?.focus({ preventScroll: true })
    else if (target === 'toggle') toggleRef.current?.focus({ preventScroll: true })
  }, [open])

  function expand() {
    setText(note?.text ?? '')
    setMood(note?.mood)
    focusNext.current = 'text'
    setOpen(true)
  }

  function collapse() {
    focusNext.current = 'toggle'
    setOpen(false)
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (busy) return
    setBusy(true)
    try {
      const saved = await saveJournalNote(today, { text, ...(mood !== undefined ? { mood } : {}) }, today)
      if (saved !== undefined) toast({ tone: 'success', icon: '📝', title: 'Ins Tagebuch geschrieben' })
      else if (note !== undefined) toast({ tone: 'info', title: 'Notiz entfernt' })
      collapse()
    } catch (error) {
      toast({
        tone: 'error',
        title: 'Notiz konnte nicht gespeichert werden',
        description: error instanceof Error ? error.message : 'Bitte versuche es noch einmal.',
      })
    } finally {
      setBusy(false)
    }
  }

  const preview = note !== undefined && note.text.trim() !== '' ? notePreview(note.text) : undefined
  const savedMood = note?.mood

  return (
    <Card as="section" padding="none" tone="flat" data-journal-note={note !== undefined ? 'written' : 'empty'}>
      <h2 className="m-0">
        <button
          ref={toggleRef}
          type="button"
          aria-expanded={open}
          aria-controls={panelId}
          onClick={() => (open ? collapse() : expand())}
          className="flex min-h-12 w-full items-center gap-3 rounded-2xl px-3.5 py-2.5 text-left transition-colors duration-150 hover:bg-surface-hover/60 sm:px-4"
        >
          <span aria-hidden="true" className="grid size-8 shrink-0 place-items-center rounded-lg bg-black/25 text-gold ring-1 ring-white/10 ring-inset">
            {savedMood !== undefined && !open ? <span className="text-base leading-none">{savedMood}</span> : <NotebookPen className="size-4" />}
          </span>
          <span className="min-w-0 flex-1">
            <span className="block font-display text-[0.9375rem] leading-snug font-semibold tracking-wide text-parchment">
              Notiz zu heute
            </span>
            {!open && (
              <span className="block truncate text-xs text-muted" data-journal-preview="">
                {preview !== undefined ? (
                  <>
                    {savedMood !== undefined && <span className="sr-only">Stimmung: {moodLabel(savedMood)}. </span>}
                    {preview}
                  </>
                ) : note !== undefined && savedMood !== undefined ? (
                  `Stimmung: ${moodLabel(savedMood)}`
                ) : (
                  'Ein paar Worte für dein Tagebuch – ganz ohne Pflicht.'
                )}
              </span>
            )}
          </span>
          <ChevronDown
            aria-hidden
            className={cn('size-4 shrink-0 text-muted transition-transform duration-200', open && 'rotate-180')}
          />
        </button>
      </h2>

      {open && (
        <form id={panelId} onSubmit={(event) => void save(event)} className="border-t border-border/70 px-3.5 pt-3 pb-3.5 sm:px-4">
          <TextArea
            ref={textRef}
            label="Deine Notiz"
            value={text}
            onChange={setText}
            maxLength={MAX_JOURNAL_NOTE_LENGTH}
            showCount
            rows={3}
            placeholder={NOTE_PLACEHOLDER}
          />
          <div className="mt-3">
            <p id={moodLabelId} className="mb-1.5 text-sm font-medium text-parchment">
              Stimmung <span className="font-normal text-muted">(optional)</span>
            </p>
            <div role="group" aria-labelledby={moodLabelId} className="flex flex-wrap gap-1.5">
              {JOURNAL_MOODS.map((option) => {
                const selected = mood === option.emoji
                return (
                  <button
                    key={option.emoji}
                    type="button"
                    aria-pressed={selected}
                    aria-label={option.label}
                    title={option.label}
                    data-mood={option.emoji}
                    onClick={() => setMood(selected ? undefined : option.emoji)}
                    className={cn(
                      'grid size-10 place-items-center rounded-xl border text-xl leading-none transition-[border-color,background-color,transform] duration-150 active:scale-90',
                      selected
                        ? 'border-gold/70 bg-gold/15 shadow-[0_0_12px_-4px_rgb(240_201_106/0.7)]'
                        : 'border-border bg-surface/60 hover:border-gold/35',
                    )}
                  >
                    <span aria-hidden="true">{option.emoji}</span>
                  </button>
                )
              })}
            </div>
          </div>
          <div className="mt-3.5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button type="button" variant="ghost" onClick={collapse} disabled={busy} className="max-sm:w-full">
              Abbrechen
            </Button>
            <Button type="submit" loading={busy} className="max-sm:w-full">
              Speichern
            </Button>
          </div>
        </form>
      )}
    </Card>
  )
}
