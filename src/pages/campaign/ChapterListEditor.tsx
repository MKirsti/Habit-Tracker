import { ChevronDown, ChevronUp, Pencil, Plus, Trash2 } from 'lucide-react'
import { useEffect, useId, useRef, useState } from 'react'
import { BALANCING } from '../../domain/balancing'
import type { Chapter, Habit } from '../../domain/types'
import { Button, ConfirmDialog, IconButton, formatNumber } from '../../ui'
import { moveItem } from './campaignForm'
import { CHAPTER_TYPE_LABELS, criterionSummary } from './campaignText'

export interface ChapterListEditorProps {
  chapters: readonly Chapter[]
  habitsById: ReadonlyMap<string, Habit>
  onChange: (chapters: Chapter[]) => void
  /** Kapitel an Position `index` bearbeiten. */
  onEdit: (index: number) => void
  onAdd: () => void
  /** Wird für die Rückfrage beim Löschen eines abgeschlossenen Kapitels genutzt. */
  isDone?: (chapter: Chapter) => boolean
}

type FocusRequest = { chapterId: string; button: 'up' | 'down' } | { add: true }

/**
 * Kapitel-Liste im Kampagnen-Formular: hinzufügen, bearbeiten, löschen (mit Rückfrage) und per
 * Pfeil-Buttons umsortieren. Änderungen landen im Entwurf und werden erst mit der Kampagne gespeichert.
 */
export function ChapterListEditor({ chapters, habitsById, onChange, onEdit, onAdd, isDone }: ChapterListEditorProps) {
  const baseId = useId()
  const addRef = useRef<HTMLButtonElement>(null)
  const [deleteIndex, setDeleteIndex] = useState<number | null>(null)
  const [announcement, setAnnouncement] = useState('')
  const focusRequest = useRef<FocusRequest | null>(null)

  const buttonId = (chapterId: string, button: 'up' | 'down') => `${baseId}${chapterId}-${button}`

  // Beim Umsortieren verschiebt React die Zeile im DOM – der Fokus würde verloren gehen. Danach
  // bekommt derselbe Pfeil-Button (bzw. am Rand der andere) den Fokus zurück.
  useEffect(() => {
    const request = focusRequest.current
    if (!request) return
    focusRequest.current = null
    if ('add' in request) {
      addRef.current?.focus()
      return
    }
    const preferred = document.getElementById(buttonId(request.chapterId, request.button))
    const other = document.getElementById(buttonId(request.chapterId, request.button === 'up' ? 'down' : 'up'))
    const target = preferred instanceof HTMLButtonElement && !preferred.disabled ? preferred : other
    target?.focus()
  })

  function move(index: number, direction: -1 | 1) {
    const chapter = chapters[index]
    const next = moveItem(chapters, index, direction)
    focusRequest.current = { chapterId: chapter.id, button: direction === -1 ? 'up' : 'down' }
    onChange(next)
    setAnnouncement(
      `„${chapter.title}“ ist jetzt Kapitel ${formatNumber(index + direction + 1)} von ${formatNumber(chapters.length)}.`,
    )
  }

  const toDelete = deleteIndex !== null ? chapters[deleteIndex] : undefined

  return (
    <div>
      <p aria-live="polite" className="sr-only">
        {announcement}
      </p>

      {chapters.length === 0 ? (
        <p className="rounded-xl border border-dashed border-border-strong/80 bg-surface/40 px-4 py-5 text-center text-sm text-muted">
          Noch keine Kapitel. Teile dein Ziel in Etappen – jedes abgeschlossene Kapitel bringt{' '}
          <span className="font-medium text-gold-bright">+{formatNumber(BALANCING.chapterXp)} XP</span>.
        </p>
      ) : (
        <ol className="space-y-2">
          {chapters.map((chapter, index) => (
            <li
              key={chapter.id}
              className="flex items-center gap-1.5 rounded-xl border border-border bg-bg-deep/45 p-1.5 sm:gap-2"
            >
              <div className="flex shrink-0 flex-col">
                <IconButton
                  id={buttonId(chapter.id, 'up')}
                  size="sm"
                  icon={<ChevronUp />}
                  aria-label={`„${chapter.title}“ nach oben`}
                  disabled={index === 0}
                  onClick={() => move(index, -1)}
                />
                <IconButton
                  id={buttonId(chapter.id, 'down')}
                  size="sm"
                  icon={<ChevronDown />}
                  aria-label={`„${chapter.title}“ nach unten`}
                  disabled={index === chapters.length - 1}
                  onClick={() => move(index, 1)}
                />
              </div>
              <button
                type="button"
                onClick={() => onEdit(index)}
                aria-label={`Kapitel ${formatNumber(index + 1)} „${chapter.title}“ bearbeiten`}
                className="group flex min-h-20 min-w-0 flex-1 items-center gap-2 self-stretch rounded-lg px-2 text-left transition-colors hover:bg-surface-hover"
              >
                <span className="min-w-0 flex-1">
                  <span className="block text-xs font-semibold tracking-[0.12em] text-gold uppercase">
                    Kapitel {formatNumber(index + 1)} · {CHAPTER_TYPE_LABELS[chapter.criterion.type]}
                  </span>
                  <span className="mt-0.5 block font-medium text-parchment">{chapter.title}</span>
                  <span className="mt-0.5 block truncate text-[0.8125rem] text-muted">
                    {criterionSummary(chapter.criterion, habitsById)}
                  </span>
                </span>
                <Pencil aria-hidden className="size-4 shrink-0 text-muted transition-colors group-hover:text-gold" />
              </button>
              <IconButton
                size="sm"
                icon={<Trash2 />}
                aria-label={`Kapitel „${chapter.title}“ löschen`}
                onClick={() => setDeleteIndex(index)}
                className="shrink-0 hover:text-danger!"
              />
            </li>
          ))}
        </ol>
      )}

      <Button ref={addRef} variant="secondary" icon={<Plus />} onClick={onAdd} className="mt-3 w-full sm:w-auto">
        Kapitel hinzufügen
      </Button>

      <ConfirmDialog
        open={toDelete !== undefined}
        onClose={() => setDeleteIndex(null)}
        onConfirm={() => {
          if (deleteIndex === null || !toDelete) return
          focusRequest.current = { add: true }
          onChange(chapters.filter((_, index) => index !== deleteIndex))
          setAnnouncement(`Kapitel „${toDelete.title}“ entfernt.`)
        }}
        title="Kapitel löschen?"
        message={
          toDelete
            ? `„${toDelete.title}“ wird beim Speichern aus der Kampagne entfernt.${
                isDone?.(toDelete) ? ` Seine ${formatNumber(BALANCING.chapterXp)} XP entfallen dann.` : ''
              }`
            : undefined
        }
        confirmLabel="Löschen"
        danger
        icon={<Trash2 />}
      />
    </div>
  )
}
