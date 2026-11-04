import { ChevronRight, Plus } from 'lucide-react'
import { AnimatePresence, motion } from 'motion/react'
import { useEffect, useId, useMemo, useRef, useState } from 'react'
import type { Ref } from 'react'
import { useGameContext } from '../../app/gameContext'
import { compareDays } from '../../domain/dates'
import type { SideQuest } from '../../domain/types'
import { Button, EmptyState, SectionTitle, cn, formatNumber } from '../../ui'
import { sideQuestCheckButtonId } from './domIds'
import { SideQuestCard } from './SideQuestCard'
import { isSideQuestDoneOn } from './sideQuestForm'
import { useSideQuestActions } from './useSideQuestActions'

export interface SideQuestPanelProps {
  onCreate: () => void
  onEdit: (quest: SideQuest) => void
  /** Ref auf „Neue Nebenquest“ im leeren Zustand (Fokusziel). */
  createButtonRef?: Ref<HTMLButtonElement>
}

/** Früher erledigte zuerst nach Erledigungstag (neueste oben), dann Reihenfolge. */
function compareDone(a: SideQuest, b: SideQuest): number {
  return compareDays(b.doneDay ?? '', a.doneDay ?? '') || a.order - b.order || a.title.localeCompare(b.title, 'de')
}

/**
 * Reiter „Nebenquests“ der Quests-Seite: offene Nebenquests (mit Termin zuerst, Überfällige vorn – wie die Engine
 * sie sortiert), darunter die heute erledigten, und eingeklappt alle früher erledigten. Abhaken gilt für heute;
 * bearbeiten und löschen über den Dialog.
 */
export function SideQuestPanel({ onCreate, onEdit, createButtonRef }: SideQuestPanelProps) {
  const { data, today, state } = useGameContext()
  const actions = useSideQuestActions(today)
  const [doneExpanded, setDoneExpanded] = useState(false)
  const headingId = useId()
  const doneHeadingId = useId()
  const doneListId = useId()
  // Nach dem Abhaken wandert die Karte (offen ↔ erledigt) – hatte ihr Haken den Fokus, bekommt er ihn zurück.
  const refocus = useRef<string | null>(null)

  // `state.sideQuests`: offene (sortiert) und die heute erledigten. Früher erledigte stehen nur in den Daten.
  const current = state.sideQuests.map((entry) => entry.quest)
  const openCount = state.sideQuests.filter((entry) => !entry.done).length
  const earlier = useMemo(
    () =>
      (data.sideQuests ?? [])
        .filter((quest) => isSideQuestDoneOn(quest, today) && quest.doneDay !== today)
        .sort(compareDone),
    [data.sideQuests, today],
  )
  const total = (data.sideQuests ?? []).length

  useEffect(() => {
    const id = refocus.current
    if (id === null) return
    const button = document.getElementById(sideQuestCheckButtonId(id))
    if (!button) return
    refocus.current = null
    // Nur zurückholen, wenn der Fokus verloren ging – nie jemandem wegnehmen, der schon weitergetabbt ist.
    const active = document.activeElement
    if (button !== active && (active === null || active === document.body)) button.focus({ preventScroll: true })
  }, [state.sideQuests, earlier])

  async function toggle(quest: SideQuest, done: boolean) {
    const hadFocus = document.activeElement?.id === sideQuestCheckButtonId(quest.id)
    const ok = await actions.setDone(quest.id, done)
    if (ok && hadFocus) refocus.current = quest.id
  }

  if (total === 0) {
    return (
      <EmptyState
        icon="📜"
        title="Noch keine Nebenquests"
        text={
          <>
            Nebenquests sind einmalige Aufgaben – etwa „Steuererklärung abgeben“ oder „Fahrrad reparieren“. Erledigt
            bringen sie XP und Gold, liegen gelassen kosten sie nichts. Ein Termin ist optional.
          </>
        }
        action={
          <Button ref={createButtonRef} icon={<Plus />} onClick={onCreate}>
            Neue Nebenquest
          </Button>
        }
      />
    )
  }

  return (
    <div className="space-y-10">
      <section aria-labelledby={headingId}>
        <SectionTitle id={headingId} meta={`${formatNumber(openCount)} offen`}>
          Anstehend
        </SectionTitle>
        {current.length === 0 ? (
          <EmptyState
            icon="🏕️"
            titleAs="h3"
            title="Alles erledigt"
            text="Gerade wartet keine Nebenquest auf dich. Neue Aufgabe? Leg sie einfach an."
            className="py-10"
          />
        ) : (
          <>
            {openCount === 0 && (
              <p className="-mt-1 mb-4 text-sm text-muted">Alles für heute erledigt – stark!</p>
            )}
            <ul className="space-y-3">
              {current.map((quest) => (
                <SideQuestCard
                  key={quest.id}
                  quest={quest}
                  today={today}
                  onToggle={(target, done) => void toggle(target, done)}
                  onEdit={onEdit}
                />
              ))}
            </ul>
          </>
        )}
      </section>

      {earlier.length > 0 && (
        <section aria-labelledby={doneHeadingId}>
          <h2 id={doneHeadingId} className="mb-3">
            <button
              type="button"
              aria-expanded={doneExpanded}
              aria-controls={doneListId}
              onClick={() => setDoneExpanded((expanded) => !expanded)}
              className="group flex h-11 w-full items-center gap-2.5 rounded-xl text-left"
            >
              <ChevronRight
                aria-hidden
                className={cn('size-4 shrink-0 text-gold transition-transform duration-200', doneExpanded && 'rotate-90')}
              />
              <span className="font-display text-[0.8125rem] font-semibold tracking-[0.16em] text-gold uppercase group-hover:text-gold-bright">
                Erledigt
              </span>{' '}
              <span className="text-[0.8125rem] text-muted tabular-nums">
                {formatNumber(earlier.length)}{' '}
                <span className="sr-only">{earlier.length === 1 ? 'Nebenquest' : 'Nebenquests'}</span>
              </span>
              <span aria-hidden="true" className="h-px min-w-6 flex-1 bg-linear-to-r from-border-strong to-transparent" />
              <span className="sr-only">, </span>
              <span className="text-xs text-muted group-hover:text-parchment">
                {doneExpanded ? 'Einklappen' : 'Anzeigen'}
              </span>
            </button>
          </h2>
          <div id={doneListId}>
            <AnimatePresence initial={false}>
              {doneExpanded && (
                <motion.div
                  key="done-list"
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
                  className="-mx-1 overflow-hidden px-1"
                >
                  <p className="mb-3 text-sm text-muted">
                    Früher erledigte Nebenquests – ihre XP gehören dir. Wieder öffnen nimmt die XP zurück, bis du sie
                    erneut erledigst.
                  </p>
                  <ul className="space-y-2">
                    {earlier.map((quest) => (
                      <SideQuestCard
                        key={quest.id}
                        quest={quest}
                        today={today}
                        onToggle={(target, done) => void toggle(target, done)}
                        onEdit={onEdit}
                      />
                    ))}
                  </ul>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </section>
      )}
    </div>
  )
}
