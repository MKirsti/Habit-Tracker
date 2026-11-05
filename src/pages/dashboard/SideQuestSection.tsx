import { ArrowRight, CalendarCheck, ChevronDown, Plus } from 'lucide-react'
import { useEffect, useId, useRef, useState } from 'react'
import { Link } from 'react-router'
import { ATTRIBUTES } from '../../domain/attributes'
import type { DayKey, SideQuest, SideQuestState } from '../../domain/types'
import { FEEDBACK_CUES, useFeedbackCue } from '../../features/feedback/feedbackSounds'
import { Button, Card, SectionTitle, cn, formatNumber } from '../../ui'
import { SideQuestDueBadge } from '../quests/SideQuestDueBadge'
import { SideQuestFormDialog } from '../quests/SideQuestFormDialog'
import { useSideQuestActions } from '../quests/useSideQuestActions'
import { CheckButton } from './CheckButton'
import { CompletionBurst } from './CompletionBurst'

/** So viele Nebenquests stehen eingeklappt da; ab einer mehr wird eingeklappt (eine einzelne verstecken lohnt nicht). */
const SIDE_QUESTS_COLLAPSED = 3

export interface SideQuestSectionProps {
  /** `GameState.sideQuests`: offene (Termin zuerst, Überfällige vorn) und die heute erledigten. */
  entries: readonly SideQuestState[]
  /** Gibt es überhaupt Nebenquests (auch früher erledigte)? Sonst eine kurze Einladung. */
  hasAny: boolean
  today: DayKey
  /**
   * Oben ist ein früherer Tag gewählt („Gestern“): Ein Hinweis stellt klar, dass Nebenquests trotzdem für heute
   * zählen – sonst läge nahe, sie würden wie die Quests darüber nachgetragen.
   */
  otherDaySelected?: boolean
}

function checkButtonId(questId: string): string {
  return `dashboard-side-check-${questId}`
}

/**
 * Bereich „Nebenquests“ der Tagesübersicht (unter den Tages- und Wochenquests): offene Nebenquests mit Termin
 * („heute fällig“, „überfällig seit 2 Tagen“, „bis 12. Nov.“) und die heute erledigten zum Abhaken – immer für
 * heute, auch wenn oben „Gestern“ gewählt ist. „Neu“ legt eine an (derselbe Dialog wie auf der Quests-Seite).
 * Bei vielen Einträgen eingeklappt, damit das Dashboard auf dem Handy kompakt bleibt.
 */
export function SideQuestSection({ entries, hasAny, today, otherDaySelected = false }: SideQuestSectionProps) {
  const headingId = useId()
  const listId = useId()
  const actions = useSideQuestActions(today)
  const cue = useFeedbackCue()
  const [expanded, setExpanded] = useState(false)
  const [formOpen, setFormOpen] = useState(false)
  // Hatte der Haken den Fokus, als abgehakt wurde? Dann bekommt er ihn nach dem Umsortieren zurück – bzw., wenn
  // die Zeile dabei ins Eingeklappte wandert, die Zeile, die an ihre Stelle rückt.
  const refocus = useRef<{ questId: string; index: number; done: boolean } | null>(null)
  const listRef = useRef<HTMLUListElement>(null)
  const moreRef = useRef<HTMLButtonElement>(null)

  const openCount = entries.filter((entry) => !entry.done).length
  const collapsible = entries.length > SIDE_QUESTS_COLLAPSED + 1
  const visible = collapsible && !expanded ? entries.slice(0, SIDE_QUESTS_COLLAPSED) : entries
  const hidden = entries.length - visible.length

  // Abgehakt wandert die Zeile ans Ende (bzw. zurück nach vorn) – der Haken behält dabei den Fokus. Ist sie dabei
  // ins Eingeklappte gerutscht, geht er an die Zeile, die nachrückt (sonst an „N weitere anzeigen“).
  useEffect(() => {
    const pending = refocus.current
    if (pending === null) return
    const entry = entries.find((item) => item.quest.id === pending.questId)
    if (entry !== undefined && entry.done !== pending.done) return // Änderung noch nicht in den Live-Daten
    refocus.current = null
    const active = document.activeElement
    const lost = active === null || active === document.body || !active.isConnected
    const button = document.getElementById(checkButtonId(pending.questId))
    if (button) {
      if (button !== active && lost) button.focus({ preventScroll: true })
      return
    }
    if (!lost) return
    const checks = listRef.current?.querySelectorAll<HTMLElement>('[role="checkbox"]') ?? []
    const fallback = checks[Math.min(pending.index, checks.length - 1)] ?? moreRef.current
    fallback?.focus({ preventScroll: true })
  }, [entries])

  async function toggle(quest: SideQuest, done: boolean, index: number) {
    const hadFocus = document.activeElement?.id === checkButtonId(quest.id)
    // Vor dem Speichern vormerken: Die Live-Daten können schon vor dem Ende von `setDone` ankommen.
    if (hadFocus) refocus.current = { questId: quest.id, index, done }
    // Klang & Vibration sofort beim Tippen (nur wenn eingeschaltet).
    cue(done ? FEEDBACK_CUES.check : FEEDBACK_CUES.uncheck)
    const ok = await actions.setDone(quest.id, done)
    if (!ok && refocus.current?.questId === quest.id) refocus.current = null
  }

  return (
    <section aria-labelledby={headingId}>
      <SectionTitle
        id={headingId}
        meta={entries.length > 0 ? `${formatNumber(openCount)} offen` : undefined}
        action={
          <Button
            size="sm"
            variant="ghost"
            icon={<Plus />}
            onClick={() => setFormOpen(true)}
            aria-label="Neue Nebenquest"
            className="-my-1 shrink-0 px-2.5"
          >
            Neu
          </Button>
        }
        className="min-h-10"
      >
        Nebenquests
      </SectionTitle>

      {otherDaySelected && entries.length > 0 && (
        <p className="-mt-1 mb-2.5 flex items-center gap-1.5 text-xs text-muted">
          <CalendarCheck aria-hidden className="size-3.5 shrink-0 text-info" />
          Nebenquests zählen immer für heute.
        </p>
      )}

      {entries.length === 0 ? (
        <Card as="div" padding="none" tone="flat" className="border-dashed px-3.5 py-3 sm:px-4">
          <p className="flex items-start gap-2.5 text-sm text-muted">
            <span aria-hidden="true" className="text-lg leading-5">
              📜
            </span>
            <span>
              {hasAny ? (
                <>
                  <strong className="font-semibold text-parchment">Keine offenen Nebenquests.</strong> Neue Aufgabe?
                  Leg sie mit „Neu“ an.
                </>
              ) : (
                <>
                  Einmalige Aufgaben – etwa „Steuererklärung abgeben“ – bringen auch XP und Gold. Liegen bleiben kostet
                  nichts.
                </>
              )}
            </span>
          </p>
        </Card>
      ) : (
        <Card as="div" padding="none">
          <ul ref={listRef} id={listId} className="divide-y divide-border/70">
            {visible.map((entry, index) => (
              <SideQuestRow
                key={entry.quest.id}
                entry={entry}
                today={today}
                onToggle={(done) => void toggle(entry.quest, done, index)}
              />
            ))}
          </ul>
          {collapsible && (
            <div className="flex items-center justify-between gap-2 border-t border-border/70 px-1.5 py-1">
              <button
                ref={moreRef}
                type="button"
                aria-expanded={expanded}
                aria-controls={listId}
                onClick={() => setExpanded((current) => !current)}
                className="inline-flex h-10 items-center gap-1.5 rounded-lg px-2.5 text-sm font-medium text-gold transition-colors hover:bg-white/5 hover:text-gold-bright"
              >
                <ChevronDown aria-hidden className={cn('size-4 transition-transform', expanded && 'rotate-180')} />
                {expanded ? 'Weniger anzeigen' : `${formatNumber(hidden)} weitere anzeigen`}
              </button>
              <Link
                to="/quests?tab=nebenquests"
                className="inline-flex h-10 items-center gap-1 rounded-lg px-2.5 text-sm text-muted transition-colors hover:bg-white/5 hover:text-parchment"
              >
                Verwalten
                <ArrowRight aria-hidden className="size-4" />
              </Link>
            </div>
          )}
        </Card>
      )}

      <SideQuestFormDialog open={formOpen} onClose={() => setFormOpen(false)} />
    </section>
  )
}

/** Eine Nebenquest: Haken (für heute), Symbol, Titel, Attribut, XP und Termin. */
function SideQuestRow({
  entry,
  today,
  onToggle,
}: {
  entry: SideQuestState
  today: DayKey
  onToggle: (done: boolean) => void
}) {
  const { quest, done, xp } = entry
  const attribute = ATTRIBUTES[quest.attribute]

  // Lokale Mikro-Animation beim Erledigen (nicht beim ersten Anzeigen).
  const [prevDone, setPrevDone] = useState(done)
  const [burst, setBurst] = useState(0)
  if (prevDone !== done) {
    setPrevDone(done)
    if (done) setBurst((n) => n + 1)
  }

  return (
    <li
      className={cn(
        'relative px-3 py-3 transition-colors duration-300 first:rounded-t-[15px] last:rounded-b-[15px] sm:px-4',
        '[&_button]:scroll-mb-[calc(var(--bottom-nav-height)+env(safe-area-inset-bottom)+1rem)] md:[&_button]:scroll-mb-6',
        done && 'bg-linear-to-r from-gold/[0.06] to-transparent',
      )}
    >
      <div className="flex items-start gap-3">
        <div className="relative shrink-0">
          <CheckButton
            id={checkButtonId(quest.id)}
            checked={done}
            progress={0}
            label={`${quest.title} erledigt`}
            onToggle={() => onToggle(!done)}
          />
          <CompletionBurst burst={burst} xp={xp} onDone={() => setBurst(0)} />
        </div>
        <div className="min-w-0 flex-1 pt-0.5">
          <p className="flex items-start gap-2">
            <span aria-hidden="true" className={cn('text-xl leading-6', done && 'opacity-75 saturate-50')}>
              {quest.icon}
            </span>
            <span
              className={cn(
                'min-w-0 leading-6 font-medium transition-colors duration-300',
                done ? 'text-muted' : 'text-parchment',
              )}
            >
              {quest.title}
            </span>
          </p>
          <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
            <span className="inline-flex items-center gap-1.5 font-medium" style={{ color: attribute.color }}>
              <span
                aria-hidden="true"
                className="size-2 rounded-full"
                style={{ backgroundColor: attribute.color, boxShadow: `0 0 6px ${attribute.color}` }}
              />
              <span className="sr-only">Attribut:</span>
              {attribute.name}
            </span>
            <span className={cn('font-semibold tabular-nums', done ? 'text-gold-bright' : 'text-gold')}>
              +{formatNumber(xp)} XP
            </span>
            {/* Erledigt sagt der Haken – der Termin zählt nur, solange sie offen ist. */}
            {!done && <SideQuestDueBadge quest={quest} today={today} variant="text" />}
          </div>
        </div>
      </div>
    </li>
  )
}
