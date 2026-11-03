import { ArrowRight, Plus } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import type { Ref } from 'react'
import { Link, useSearchParams } from 'react-router'
import { useGameContext } from '../app/gameContext'
import { deleteHabit, moveHabit, restoreHabit } from '../data/repository'
import type { Habit, MainQuest, Streak } from '../domain/types'
import { Button, EmptyState, PageHeader, SectionTitle, buttonClassName, cn, formatNumber, useToast } from '../ui'
import { ArchivedQuests } from './quests/ArchivedQuests'
import { questEditButtonId } from './quests/domIds'
import { errorMessage } from './quests/errors'
import { HabitFormDialog } from './quests/HabitFormDialog'
import { buildHabitStats, habitStreak, isArchivedOn } from './quests/questStats'
import { QuestRow } from './quests/QuestRow'
import type { MoveDirection } from './quests/QuestRow'

/** Was der Quest-Dialog gerade zeigt. Bleibt beim Schließen erhalten (für die Ausblend-Animation). */
type FormTarget = { mode: 'create'; mainQuestId?: string } | { mode: 'edit'; habitId: string }

/**
 * Fokus nach Aktionen, die erst mit den nächsten Live-Daten sichtbar werden:
 * - Archivieren/Zurückholen/Löschen: Die Zeile mit dem benutzten Button verschwindet – der Fokus springt
 *   an eine stabile Stelle (Archiv-Schalter bzw. „Neue Quest“).
 * - Anlegen: Die neue Quest steht am Ende der Liste – sie wird ins Bild gerollt und fokussiert.
 */
interface PendingFocus {
  habitId: string
  until: 'archived' | 'active' | 'deleted' | 'created'
}

/** Zuletzt verschobene Quest und ihre zuletzt angezeigte Position (0-basiert) – für die Ansage. */
interface MovedQuest {
  habitId: string
  index: number
}

function compareByOrder(a: Habit, b: Habit): number {
  return a.order - b.order || a.title.localeCompare(b.title, 'de')
}

/** Zuletzt archivierte zuerst. */
function compareByArchivedDay(a: Habit, b: Habit): number {
  return (b.archivedDay ?? '').localeCompare(a.archivedDay ?? '') || a.title.localeCompare(b.title, 'de')
}

/**
 * Quest-Verwaltung (`/quests`): aktive Quests ordnen und bearbeiten, neue anlegen, archivierte
 * zurückholen oder endgültig löschen. Deep-Link `/quests?neu=1&kampagne=<id>` öffnet den Anlege-Dialog.
 */
export function QuestsPage() {
  const { data, today } = useGameContext()
  const { toast } = useToast()
  const [searchParams, setSearchParams] = useSearchParams()

  const [form, setForm] = useState<FormTarget>({ mode: 'create' })
  const [formOpen, setFormOpen] = useState(false)
  const [announcement, setAnnouncement] = useState('')
  const pendingFocus = useRef<PendingFocus | null>(null)
  const lastMoved = useRef<MovedQuest | null>(null)
  const formWasOpen = useRef(false)
  const archiveToggleRef = useRef<HTMLButtonElement>(null)
  const newQuestRef = useRef<HTMLButtonElement>(null)

  const stats = useMemo(() => buildHabitStats(data.completions, today), [data.completions, today])

  const { active, archived } = useMemo(() => {
    const activeHabits: Habit[] = []
    const archivedHabits: Habit[] = []
    for (const habit of data.habits) (isArchivedOn(habit, today) ? archivedHabits : activeHabits).push(habit)
    return { active: activeHabits.sort(compareByOrder), archived: archivedHabits.sort(compareByArchivedDay) }
  }, [data.habits, today])

  const streaks = useMemo(() => {
    const result = new Map<string, Streak>()
    for (const habit of active) result.set(habit.id, habitStreak(habit, stats, today))
    return result
  }, [active, stats, today])

  const campaignsById = useMemo(() => new Map<string, MainQuest>(data.mainQuests.map((q) => [q.id, q])), [data.mainQuests])

  // Deep-Link: /quests?neu=1(&kampagne=<id>) öffnet den Anlege-Dialog (State während des Renderns
  // anpassen), der Effekt entfernt danach die Parameter aus der Adresse.
  const deepLink = searchParams.get('neu') === '1' ? searchParams.toString() : null
  const [handledDeepLink, setHandledDeepLink] = useState<string | null>(null)
  if (deepLink !== handledDeepLink) {
    setHandledDeepLink(deepLink)
    if (deepLink !== null) {
      setForm({ mode: 'create', mainQuestId: searchParams.get('kampagne') ?? undefined })
      setFormOpen(true)
    }
  }
  useEffect(() => {
    if (searchParams.get('neu') !== '1') return
    const next = new URLSearchParams(searchParams)
    next.delete('neu')
    next.delete('kampagne')
    setSearchParams(next, { replace: true })
  }, [searchParams, setSearchParams])

  // Fokus nachziehen, sobald die Live-Daten die Änderung zeigen (siehe PendingFocus).
  useEffect(() => {
    const pending = pendingFocus.current
    if (!pending) return
    const habit = data.habits.find((h) => h.id === pending.habitId)
    if (pending.until === 'created') {
      if (!habit) return
      pendingFocus.current = null
      const editButton = document.getElementById(questEditButtonId(habit.id))
      if (!editButton) return
      // Mitte statt Rand: Unten liegt auf dem Handy die Navigationsleiste. (jsdom kennt scrollIntoView nicht.)
      editButton.closest('li')?.scrollIntoView?.({ block: 'center' })
      editButton.focus({ preventScroll: true })
      return
    }
    const settled =
      pending.until === 'deleted'
        ? habit === undefined
        : habit === undefined || isArchivedOn(habit, today) === (pending.until === 'archived')
    if (!settled) return
    pendingFocus.current = null
    const target = archiveToggleRef.current ?? newQuestRef.current
    target?.focus()
  }, [data.habits, today])

  // Position nach dem Verschieben aus den frischen Daten ansagen: Bei schnell wiederholtem Drücken liegen
  // mehrere Verschiebungen zwischen zwei gezeichneten Ständen – die Position aus dem Klick wäre veraltet.
  useEffect(() => {
    const moved = lastMoved.current
    if (!moved) return
    const index = active.findIndex((h) => h.id === moved.habitId)
    if (index === -1) {
      lastMoved.current = null
      return
    }
    if (index === moved.index) return
    moved.index = index
    announce(`„${active[index].title}“ steht jetzt an Position ${index + 1} von ${active.length}.`)
  }, [active])

  // Schließt sich der Dialog und hat der Fokus keinen Ausgangspunkt (Dialog kam per Deep-Link), bliebe er im
  // ausblendenden Dialog und fiele danach auf <body> – dann bekommt ihn „Neue Quest“. Läuft nach dem
  // Fokus-Zurückgeben des Dialogs (Effekte der Kinder zuerst).
  useEffect(() => {
    if (formOpen) {
      formWasOpen.current = true
      return
    }
    if (!formWasOpen.current) return
    formWasOpen.current = false
    const focused = document.activeElement
    const lost =
      focused === null || focused === document.body || focused.closest('[role="dialog"], [role="alertdialog"]') !== null
    if (lost) newQuestRef.current?.focus()
  }, [formOpen])

  function announce(text: string) {
    // Gleicher Text zweimal hintereinander würde nicht erneut vorgelesen – daher abwechselnd ein Leerzeichen.
    setAnnouncement((previous) => (previous === text ? `${text}\u00a0` : text))
  }

  function openCreate() {
    setForm({ mode: 'create' })
    setFormOpen(true)
  }

  function openEdit(habit: Habit) {
    setForm({ mode: 'edit', habitId: habit.id })
    setFormOpen(true)
  }

  async function handleMove(habit: Habit, direction: MoveDirection) {
    // Weitere Klicks, bevor die Liste neu gezeichnet ist, behalten die zuletzt angezeigte Position.
    if (lastMoved.current?.habitId !== habit.id) {
      lastMoved.current = { habitId: habit.id, index: active.findIndex((h) => h.id === habit.id) }
    }
    try {
      await moveHabit(habit.id, direction, today)
    } catch (error) {
      toast({ tone: 'error', title: 'Verschieben fehlgeschlagen', description: errorMessage(error) })
    }
  }

  async function handleRestore(habit: Habit) {
    try {
      await restoreHabit(habit.id, today)
    } catch (error) {
      toast({ tone: 'error', title: 'Zurückholen fehlgeschlagen', description: errorMessage(error) })
      return
    }
    toast({ tone: 'success', title: 'Quest zurückgeholt', description: `„${habit.title}“ ist ab heute wieder aktiv.` })
    lastMoved.current = null
    announce(`„${habit.title}“ ist wieder aktiv.`)
    pendingFocus.current = { habitId: habit.id, until: 'active' }
  }

  async function handleDelete(habit: Habit) {
    try {
      await deleteHabit(habit.id, today)
    } catch (error) {
      toast({ tone: 'error', title: 'Löschen fehlgeschlagen', description: errorMessage(error) })
      throw error
    }
    toast({ tone: 'info', title: 'Quest gelöscht', description: `„${habit.title}“ wurde endgültig entfernt.` })
    lastMoved.current = null
    announce(`„${habit.title}“ wurde gelöscht.`)
    pendingFocus.current = { habitId: habit.id, until: 'deleted' }
  }

  function handleCreated(habit: Habit) {
    lastMoved.current = null
    announce(`„${habit.title}“ wurde angelegt.`)
    pendingFocus.current = { habitId: habit.id, until: 'created' }
  }

  function handleArchived(habit: Habit) {
    lastMoved.current = null
    announce(`„${habit.title}“ wurde archiviert.`)
    pendingFocus.current = { habitId: habit.id, until: 'archived' }
  }

  const editHabit = form.mode === 'edit' ? data.habits.find((h) => h.id === form.habitId) : undefined
  const isEmpty = data.habits.length === 0

  return (
    <>
      <PageHeader
        eyebrow="Dein Questbuch"
        title="Quests"
        subtitle="Deine Gewohnheiten: anlegen, ordnen, anpassen – oder ins Archiv legen."
        action={
          isEmpty ? undefined : (
            <Button ref={newQuestRef} icon={<Plus />} onClick={openCreate}>
              Neue Quest
            </Button>
          )
        }
      />

      {isEmpty ? (
        <EmptyQuestbook onCreate={openCreate} buttonRef={newQuestRef} />
      ) : (
        <div className="space-y-10">
          <section aria-labelledby="quests-active-heading">
            <SectionTitle id="quests-active-heading" meta={formatNumber(active.length)}>
              Aktive Quests
            </SectionTitle>
            {active.length === 0 ? (
              <EmptyState
                icon="🗺️"
                titleAs="h3"
                title="Keine aktiven Quests"
                text="Alle deine Quests ruhen im Archiv. Hol eine zurück oder beginne eine neue Quest."
                className="py-10"
              />
            ) : (
              <>
                <p className="-mt-1 mb-4 text-sm text-muted">
                  Die Reihenfolge gilt auch für deine Tagesübersicht.
                </p>
                <ul className="space-y-3">
                  {active.map((habit, index) => (
                    <QuestRow
                      key={habit.id}
                      habit={habit}
                      campaign={habit.mainQuestId !== undefined ? campaignsById.get(habit.mainQuestId) : undefined}
                      streak={streaks.get(habit.id) ?? { current: 0, best: 0, unit: 'day' }}
                      isFirst={index === 0}
                      isLast={index === active.length - 1}
                      onMove={handleMove}
                      onEdit={openEdit}
                    />
                  ))}
                </ul>
              </>
            )}
          </section>

          {archived.length > 0 && (
            <ArchivedQuests
              habits={archived}
              toggleRef={archiveToggleRef}
              onRestore={handleRestore}
              onDelete={handleDelete}
            />
          )}
        </div>
      )}

      <p className="sr-only" role="status" aria-live="polite">
        {announcement}
      </p>

      <HabitFormDialog
        open={formOpen && (form.mode === 'create' || editHabit !== undefined)}
        onClose={() => setFormOpen(false)}
        habit={editHabit}
        initialMainQuestId={form.mode === 'create' ? form.mainQuestId : undefined}
        onCreated={handleCreated}
        onArchived={handleArchived}
      />
    </>
  )
}

/** Leeres Questbuch: erklärt, was eine Quest ist, und bietet zwei Wege zum Start. */
function EmptyQuestbook({ onCreate, buttonRef }: { onCreate: () => void; buttonRef: Ref<HTMLButtonElement> }) {
  return (
    <div className="space-y-4">
      <EmptyState
        icon="📜"
        title="Dein Questbuch ist noch leer"
        text={
          <>
            Quests sind deine Gewohnheiten – etwa „10 Seiten lesen“ oder „Abends meditieren“. Jede Erledigung bringt dir
            XP und stärkt ein Attribut deines Helden. Du legst fest, wie oft sie fällig ist und wie schwer sie wiegt.
          </>
        }
        action={
          <Button ref={buttonRef} icon={<Plus />} onClick={onCreate}>
            Neue Quest
          </Button>
        }
      />
      <div className="grid grid-cols-[auto_minmax(0,1fr)] items-start gap-x-3.5 gap-y-4 rounded-2xl border border-gold/25 bg-gold/5 p-4 sm:grid-cols-[auto_minmax(0,1fr)_auto] sm:items-center sm:gap-x-4 sm:p-5">
        <span
          aria-hidden="true"
          className="grid size-11 shrink-0 place-items-center rounded-xl bg-gold/10 text-2xl ring-1 ring-gold/25 ring-inset"
        >
          📚
        </span>
        <p className="text-[0.9375rem] text-muted">
          <span className="font-medium text-parchment">Lieber mit einer fertigen Kampagne starten?</span> Auf der
          Kampagnen-Seite wartet „Der Weg des Gelehrten“ – samt passender Quests rund ums Lesen.
        </p>
        <Link
          to="/kampagne"
          className={cn(buttonClassName({ variant: 'secondary', size: 'sm' }), 'col-span-2 sm:col-span-1')}
        >
          Zur Kampagne
          <ArrowRight aria-hidden />
        </Link>
      </div>
    </div>
  )
}
