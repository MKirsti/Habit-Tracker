import { ArchiveRestore, ChevronRight, Trash2 } from 'lucide-react'
import { AnimatePresence, motion } from 'motion/react'
import { useId, useState } from 'react'
import type { Ref } from 'react'
import { useGameContext } from '../../app/gameContext'
import { formatDay } from '../../domain/dates'
import { deletionImpact } from '../../domain/deletion'
import type { DeletionImpact } from '../../domain/deletion'
import { describeSchedule } from '../../domain/schedule'
import type { Habit } from '../../domain/types'
import { Button, Card, ConfirmDialog, cn, formatNumber } from '../../ui'
import { chapterLossText, levelChangeText } from './questStats'

export interface ArchivedQuestsProps {
  /** Archivierte Quests (bereits sortiert). */
  habits: readonly Habit[]
  /** Ref auf den Auf-/Zuklapp-Button (Fokusziel nach Archivieren, Zurückholen, Löschen). */
  toggleRef?: Ref<HTMLButtonElement>
  /** Holt eine Quest zurück. Fehler zeigt der Aufrufer selbst an. */
  onRestore: (habit: Habit) => Promise<void>
  /** Löscht eine Quest endgültig. Wirft bei Fehlern (der Bestätigungsdialog bleibt dann offen). */
  onDelete: (habit: Habit) => Promise<void>
}

interface DeleteTarget {
  habit: Habit
  /**
   * Exakte Folgen des Löschens (Spielstand vorher → nachher): Quest-XP, Perfekter-Tag-Boni, Kapitel- und
   * Kampagnen-XP. Genau so viel fällt der Spielstand nach dem Bestätigen.
   */
  impact: DeletionImpact
}

/** Einklappbarer Bereich mit archivierten Quests: zurückholen oder endgültig löschen. */
export function ArchivedQuests({ habits, toggleRef, onRestore, onDelete }: ArchivedQuestsProps) {
  const { data, today } = useGameContext()
  const [expanded, setExpanded] = useState(false)
  // Ziel samt Kennzahlen wird beim Öffnen festgehalten und bleibt nach dem Schließen gesetzt,
  // damit sich der Dialogtext beim Ausblenden (Quest schon gelöscht) nicht mehr ändert.
  const [deleteTarget, setDeleteTarget] = useState<DeleteTarget | null>(null)
  const [confirmOpen, setConfirmOpen] = useState(false)
  // Mehrere Quests können gleichzeitig zurückgeholt werden – jede bleibt gesperrt, bis ihr Speichern fertig ist.
  const [busyIds, setBusyIds] = useState<ReadonlySet<string>>(() => new Set())
  const listId = useId()
  const headingId = useId()

  async function restore(habit: Habit) {
    setBusyIds((current) => new Set(current).add(habit.id))
    try {
      await onRestore(habit)
    } finally {
      setBusyIds((current) => {
        const next = new Set(current)
        next.delete(habit.id)
        return next
      })
    }
  }

  function askDelete(habit: Habit) {
    // Wie beim Löschen selbst gerechnet (`applyHabitDeletion`) – der genannte Verlust stimmt also exakt.
    setDeleteTarget({ habit, impact: deletionImpact(data, habit.id, today) })
    setConfirmOpen(true)
  }

  return (
    <section aria-labelledby={headingId}>
      <h2 id={headingId} className="mb-3">
        <button
          ref={toggleRef}
          type="button"
          aria-expanded={expanded}
          aria-controls={listId}
          onClick={() => setExpanded((current) => !current)}
          className="group flex h-11 w-full items-center gap-2.5 rounded-xl text-left"
        >
          <ChevronRight
            aria-hidden
            className={cn('size-4 shrink-0 text-gold transition-transform duration-200', expanded && 'rotate-90')}
          />
          <span className="font-display text-[0.8125rem] font-semibold tracking-[0.16em] text-gold uppercase group-hover:text-gold-bright">
            Archiv
          </span>
          <span className="text-[0.8125rem] text-muted tabular-nums">
            {formatNumber(habits.length)}
            <span className="sr-only">{habits.length === 1 ? ' Quest' : ' Quests'}</span>
          </span>
          <span aria-hidden="true" className="h-px min-w-6 flex-1 bg-linear-to-r from-border-strong to-transparent" />
          <span className="text-xs text-muted group-hover:text-parchment">{expanded ? 'Einklappen' : 'Anzeigen'}</span>
        </button>
      </h2>

      <div id={listId}>
        <AnimatePresence initial={false}>
          {expanded && (
            <motion.div
              key="archive-list"
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
              // overflow-hidden für die Höhenanimation; -mx-1/px-1 lässt seitlich Platz für Fokusringe.
              className="-mx-1 overflow-hidden px-1"
            >
              <p className="mb-3 text-sm text-muted">
                Archivierte Quests ruhen: Sie tauchen nicht mehr in deinen Tagesquests auf, ihr Verlauf und alle XP
                bleiben aber erhalten.
              </p>
              <ul className="space-y-2">
                {habits.map((habit) => (
                  <Card
                    key={habit.id}
                    as="li"
                    tone="flat"
                    padding="none"
                    aria-label={habit.title}
                    className="grid grid-cols-[auto_minmax(0,1fr)] items-center gap-x-3 gap-y-2.5 p-3 sm:grid-cols-[auto_minmax(0,1fr)_auto] sm:px-4"
                  >
                    <div
                      aria-hidden="true"
                      className="grid size-10 place-items-center rounded-xl bg-surface-raised text-xl leading-none opacity-80 ring-1 ring-border-strong ring-inset grayscale-[35%]"
                    >
                      {habit.icon}
                    </div>
                    <div className="min-w-0">
                      <p className="font-medium text-parchment/90">{habit.title}</p>
                      <p className="text-[0.8125rem] text-muted">
                        {describeSchedule(habit.schedule)}
                        {habit.archivedDay !== undefined && <> · archiviert am {formatDay(habit.archivedDay, 'short')}</>}
                      </p>
                    </div>
                    <div className="col-span-2 flex flex-wrap justify-end gap-2 sm:col-span-1">
                      <Button
                        variant="ghost"
                        size="sm"
                        icon={<Trash2 />}
                        aria-label={`„${habit.title}“ endgültig löschen`}
                        className="text-danger! hover:bg-danger/10!"
                        onClick={() => askDelete(habit)}
                        disabled={busyIds.has(habit.id)}
                      >
                        Löschen
                      </Button>
                      <Button
                        variant="secondary"
                        size="sm"
                        icon={<ArchiveRestore />}
                        aria-label={`„${habit.title}“ zurückholen`}
                        loading={busyIds.has(habit.id)}
                        onClick={() => void restore(habit)}
                      >
                        Zurückholen
                      </Button>
                    </div>
                  </Card>
                ))}
              </ul>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <ConfirmDialog
        open={confirmOpen && deleteTarget !== null}
        onClose={() => setConfirmOpen(false)}
        onConfirm={async () => {
          if (deleteTarget) await onDelete(deleteTarget.habit)
        }}
        danger
        icon={deleteTarget?.habit.icon}
        title="Quest endgültig löschen?"
        message={deleteTarget && <DeleteMessage title={deleteTarget.habit.title} impact={deleteTarget.impact} />}
        confirmLabel="Endgültig löschen"
      />
    </section>
  )
}

/** Text der Rückfrage: was genau verloren geht (XP samt Level, Kapitel, Kampagnen-Bonus). */
function DeleteMessage({ title, impact }: { title: string; impact: DeletionImpact }) {
  const levelChange = levelChangeText(impact)
  const chapterLosses = impact.campaigns.map(chapterLossText).filter((text) => text !== undefined)
  const losesProgress = impact.campaigns.some((campaign) => campaign.openChapters.length > 0)
  return (
    <>
      <span className="block">
        „{title}“ wird mit ihrem gesamten Verlauf gelöscht.{' '}
        {impact.xpLost > 0 ? (
          <>
            Du verlierst <strong className="font-semibold text-parchment">{formatNumber(impact.xpLost)} XP</strong>
            {levelChange !== undefined && (
              <>
                {' '}
                (<strong className="font-semibold text-parchment">{levelChange}</strong>)
              </>
            )}
            .
          </>
        ) : (
          'Deine XP und dein Level bleiben dabei unverändert.'
        )}
      </span>
      {chapterLosses.map((text) => (
        <span key={text} className="mt-2 block">
          {text}
        </span>
      ))}
      {losesProgress && (
        <span className="mt-2 block">Kapitel deiner Kampagne, die auf diese Quest zählen, verlieren ihren Fortschritt.</span>
      )}
      <span className="mt-2 block">Das lässt sich nicht rückgängig machen.</span>
    </>
  )
}
