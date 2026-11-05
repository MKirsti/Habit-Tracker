import { Archive, Check, Minus, Moon, Pencil, Plus, Sparkles, Swords, TriangleAlert, Trophy, Undo2 } from 'lucide-react'
import { motion } from 'motion/react'
import { useId, useRef, useState } from 'react'
import type { ReactNode, Ref } from 'react'
import { useGameContext } from '../../app/gameContext'
import { setChapterCounter, setChapterManual } from '../../data/repository'
import { BALANCING } from '../../domain/balancing'
import { reachesTarget } from '../../domain/schedule'
import type { Chapter, ChapterState, EndBossState, Habit, MainQuestState } from '../../domain/types'
import { accentVars, campaignColor } from '../../features/campaignTheme'
import { Badge, Button, IconButton, ProgressBar, cn, formatNumber, useToast } from '../../ui'
import { BOSS_COLOR, bossVars } from '../dashboard/bossTheme'
import { chapterProgressText, formatDate, formatValue, isArchived } from './campaignText'
import { endBossHpText, endBossPhase, endBossStatusText } from './endBossText'
import type { EndBossPhase } from './endBossText'
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
 * (die Belohnung). Abgeschlossene Kapitel, der zurückgelegte Weg und das hervorgehobene aktuelle Kapitel
 * tragen die Hauptfarbe der Kampagne (`campaignColor`); das Ziel selbst bleibt golden.
 * Phase 3b: Das letzte Kapitel ist der **Endgegner** der Kampagne (`MainQuestState.endBoss`) – mit Symbol, Namen,
 * eigenem Lebensbalken im Boss-Violett (statt des Fortschrittsbalkens) und seinem Zustand: schlafend, solange noch
 * andere Kapitel offen sind, „erwacht“ danach, besiegt mit seinem Satz zum Sieg.
 */
export function ChapterTimeline({
  campaign,
  habitsById,
  onEditChapter,
  onAddChapter,
  onAnnounce,
  addButtonRef,
}: ChapterTimelineProps) {
  const { quest, chapters, currentChapterIndex, complete, endBoss } = campaign
  const lastDone = chapters.length > 0 && chapters[chapters.length - 1].done
  const color = campaignColor(campaign)
  // Wie viele der übrigen Kapitel noch offen sind – so lange schläft der Endgegner.
  const openBefore = chapters.slice(0, -1).filter((chapter) => !chapter.done).length

  return (
    <ol className="relative" style={accentVars(color)} data-campaign-color={color}>
      {chapters.map((state, index) => {
        const status: ChapterStatus = state.done ? 'done' : index === currentChapterIndex ? 'current' : 'upcoming'
        return (
          <ChapterNode
            key={state.chapter.id}
            questId={quest.id}
            state={state}
            index={index}
            status={status}
            color={color}
            habit={state.chapter.criterion.type === 'habit' ? habitsById.get(state.chapter.criterion.habitId) : undefined}
            onEdit={() => onEditChapter(state.chapter, index)}
            onAnnounce={onAnnounce}
            endBoss={endBoss !== undefined && endBoss.chapterId === state.chapter.id ? endBoss : undefined}
            openBefore={openBefore}
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

/** Verbindungslinie vom Knoten dieser Zeile zum nächsten. Kampagnenfarbe = bereits zurückgelegter Weg. */
function TrailSegment({ traveled }: { traveled: boolean }) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        'absolute top-11 bottom-0 left-[1.375rem] -translate-x-1/2',
        traveled
          ? 'w-0.5 bg-linear-to-b from-(--accent) to-(--accent-60) shadow-[0_0_8px_var(--accent-35)]'
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
  /** Hauptfarbe der Kampagne (Hex) für die Fortschrittsbalken. */
  color: string
  habit: Habit | undefined
  onEdit: () => void
  onAnnounce: (message: string) => void
  /** Phase 3b: Dieses Kapitel ist der Endgegner der Kampagne (das letzte). */
  endBoss?: EndBossState
  /** Noch offene übrige Kapitel (für „schläft noch“). */
  openBefore?: number
}

function ChapterNode({ questId, state, index, status, color, habit, onEdit, onAnnounce, endBoss, openBefore = 0 }: ChapterNodeProps) {
  const { chapter } = state
  const { today } = useGameContext()
  const titleId = useId()
  const number = formatNumber(index + 1)
  const phase = endBoss !== undefined ? endBossPhase(endBoss) : undefined

  return (
    <li aria-current={status === 'current' ? 'step' : undefined} className="relative grid grid-cols-[2.75rem_minmax(0,1fr)] gap-x-3 pb-5 sm:gap-x-4">
      <TrailSegment traveled={status === 'done'} />

      {/* Knoten */}
      <div className="relative flex justify-center pt-3">
        {endBoss !== undefined && phase !== undefined ? (
          <EndBossMarker endBoss={endBoss} phase={phase} />
        ) : (
          <span
            aria-hidden="true"
            className={cn(
              'relative grid size-11 place-items-center rounded-full font-display text-base font-bold tabular-nums',
              // Gefüllt in der Kampagnenfarbe; der dunkle Haken hat auf jeder Attributfarbe ≥ 5:1.
              status === 'done' &&
                'bg-linear-to-b from-[color-mix(in_srgb,var(--accent)_78%,white)] to-(--accent) text-on-gold shadow-[0_0_10px_-1px_var(--accent-60)]',
              status === 'current' &&
                'bg-surface-raised text-(--accent-text) ring-2 ring-(--accent) shadow-[0_0_0_1px_var(--accent-35),0_0_22px_-4px_var(--accent-60)]',
              status === 'upcoming' && 'bg-surface text-muted ring-1 ring-border-strong',
            )}
          >
            {status === 'current' && (
              <span className="absolute -inset-1.5 animate-glow-pulse rounded-full ring-1 ring-(--accent-60)" />
            )}
            {status === 'done' ? (
              <motion.span initial={{ scale: 0.4, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="grid place-items-center">
                <Check className="size-5" strokeWidth={3} />
              </motion.span>
            ) : (
              number
            )}
          </span>
        )}
      </div>

      {/* Inhalt */}
      <article
        aria-labelledby={titleId}
        data-end-boss={endBoss?.definition.id}
        data-end-boss-phase={phase}
        style={endBoss !== undefined ? bossVars() : undefined}
        className={cn(
          'relative min-w-0 rounded-2xl border p-4 sm:p-5',
          // Der Endgegner trägt Boss-Violett, solange er steht; besiegt sieht er aus wie ein abgeschlossenes Kapitel.
          phase === 'awakened' &&
            'border-(--boss-50) bg-linear-to-b from-[color-mix(in_srgb,var(--boss)_9%,var(--color-surface))] to-surface/95 shadow-[inset_0_1px_0_var(--boss-20),0_16px_40px_-20px_var(--boss-50)]',
          phase === 'asleep' && 'border-(--boss-20) bg-surface/55',
          phase === undefined &&
            status === 'current' &&
            'border-(--accent-35) bg-linear-to-b from-[color-mix(in_srgb,var(--accent)_8%,var(--color-surface))] to-surface/95 shadow-[inset_0_1px_0_var(--accent-20),0_14px_36px_-18px_var(--accent-35)]',
          (phase === undefined || phase === 'defeated') && status === 'done' && 'border-(--accent-20) bg-surface/80 shadow-card',
          phase === undefined && status === 'upcoming' && 'border-border bg-surface/55',
        )}
      >
        <div className="flex items-start gap-2">
          <div className="min-w-0 flex-1">
            <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs font-semibold tracking-[0.14em] uppercase">
              <span className={status === 'upcoming' ? 'text-muted' : 'text-(--accent-text)'}>
                Kapitel {number}
                {endBoss !== undefined && ' · Endgegner'}
              </span>
              {phase !== undefined && <EndBossBadge phase={phase} />}
              {status === 'current' && phase === undefined && (
                <Badge
                  color={color}
                  icon={<Sparkles />}
                  className="tracking-normal normal-case"
                >
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
          <p className="mt-1.5 flex items-center gap-1.5 text-sm font-medium text-(--accent-text)">
            <Check aria-hidden className="size-4" strokeWidth={2.5} />
            {endBoss !== undefined
              ? state.doneDay !== undefined
                ? `Besiegt am ${formatDate(state.doneDay, today)}`
                : 'Besiegt'
              : state.doneDay !== undefined
                ? `Abgeschlossen am ${formatDate(state.doneDay, today)}`
                : 'Abgeschlossen'}
          </p>
        )}

        {endBoss !== undefined && phase !== undefined && (
          <EndBossPanel endBoss={endBoss} phase={phase} openBefore={openBefore} chapter={state} />
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
            <CounterAction
              questId={questId}
              state={state}
              status={status}
              color={color}
              onAnnounce={onAnnounce}
              hideBar={endBoss !== undefined}
            />
          ) : (
            <HabitProgress
              state={state}
              habit={habit}
              status={status}
              color={color}
              archived={habit !== undefined && isArchived(habit, today)}
              hideBar={endBoss !== undefined}
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
  color,
  lead,
  habit,
  hideBar = false,
}: {
  state: ChapterState
  status: ChapterStatus
  color: string
  lead?: ReactNode
  habit?: Habit
  /** Ohne Balken – der Endgegner zeigt stattdessen seinen Lebensbalken. */
  hideBar?: boolean
}) {
  const text = chapterProgressText(state, habit)
  if (!text) return null
  return (
    <div>
      <div className={cn('flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5 text-sm', !hideBar && 'mb-1.5')}>
        {lead}
        <span className={cn('text-muted tabular-nums', lead !== undefined && 'ml-auto')}>
          {text.prefix !== '' && <>{text.prefix} </>}
          <span className={cn('font-semibold', status === 'upcoming' ? 'text-parchment/90' : 'text-parchment')}>
            {text.value}
          </span>{' '}
          {text.suffix}
        </span>
      </div>
      {!hideBar && (
        <ProgressBar
          value={state.progress}
          color={color}
          size={status === 'done' ? 'sm' : 'md'}
          aria-label={`Fortschritt: ${state.chapter.title}`}
          valueText={text.spoken}
          glow={status === 'current'}
        />
      )}
    </div>
  )
}

function HabitProgress({
  state,
  habit,
  status,
  color,
  archived,
  hideBar = false,
}: {
  state: ChapterState
  habit: Habit | undefined
  status: ChapterStatus
  color: string
  /** Die Quest ist archiviert – das Kapitel kann gerade nicht fortschreiten. */
  archived: boolean
  hideBar?: boolean
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
      <ProgressLine state={state} status={status} color={color} lead={lead} habit={habit} hideBar={hideBar} />
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
  color,
  onAnnounce,
  hideBar = false,
}: {
  questId: string
  state: ChapterState
  status: ChapterStatus
  color: string
  onAnnounce: (message: string) => void
  /** Ohne Balken – der Endgegner zeigt stattdessen seinen Lebensbalken. */
  hideBar?: boolean
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
      {!hideBar && (
        <ProgressBar
          className="mt-2"
          value={shown.progress}
          color={color}
          size={status === 'done' ? 'sm' : 'md'}
          aria-label={`Fortschritt: ${chapter.title}`}
          valueText={text?.spoken}
          glow={status === 'current'}
        />
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Endgegner (Phase 3b)
// ---------------------------------------------------------------------------

/** Knoten des Endgegners auf dem Weg: sein Symbol im violetten Ring – schlafend gedimmt, besiegt mit Haken. */
function EndBossMarker({ endBoss, phase }: { endBoss: EndBossState; phase: EndBossPhase }) {
  return (
    <span
      aria-hidden="true"
      style={bossVars()}
      className={cn(
        'relative grid size-12 place-items-center rounded-full text-[1.625rem] leading-none',
        phase === 'asleep' && 'bg-surface ring-1 ring-(--boss-35)',
        phase === 'awakened' &&
          'bg-radial from-(--boss-35) to-surface-raised ring-2 ring-(--boss) shadow-[0_0_24px_-4px_var(--boss-50)]',
        phase === 'defeated' && 'bg-radial from-gold/25 to-surface-raised ring-2 ring-gold/70 shadow-glow',
      )}
    >
      {phase === 'awakened' && <span className="absolute -inset-1.5 animate-glow-pulse rounded-full ring-1 ring-(--boss-50)" />}
      <span className={cn('relative', phase === 'asleep' && 'opacity-55 grayscale-[0.5]', phase === 'defeated' && 'opacity-80')}>
        {endBoss.definition.icon}
      </span>
      {phase === 'asleep' && <span className="absolute -top-1 -right-1 text-sm leading-none">💤</span>}
      {phase === 'defeated' && (
        <span className="absolute -right-1 -bottom-1 grid size-5 place-items-center rounded-full bg-linear-to-b from-gold-bright to-gold text-on-gold ring-2 ring-bg">
          <Check className="size-3" strokeWidth={3.5} />
        </span>
      )}
    </span>
  )
}

const PHASE_BADGE: Record<EndBossPhase, { label: string; icon: ReactNode }> = {
  asleep: { label: 'Schläft', icon: <Moon /> },
  awakened: { label: 'Erwacht', icon: <Swords /> },
  defeated: { label: 'Besiegt', icon: <Check /> },
}

function EndBossBadge({ phase }: { phase: EndBossPhase }) {
  const { label, icon } = PHASE_BADGE[phase]
  return (
    <Badge
      color={phase === 'defeated' ? undefined : BOSS_COLOR}
      tone={phase === 'defeated' ? 'gold' : 'neutral'}
      icon={icon}
      className="tracking-normal normal-case"
      data-end-boss-badge={phase}
    >
      {label}
    </Badge>
  )
}

/** Wer am Ende wartet: Symbol, Name, Zustand bzw. Satz zum Sieg und – solange er steht – sein Lebensbalken. */
function EndBossPanel({
  endBoss,
  phase,
  openBefore,
  chapter,
}: {
  endBoss: EndBossState
  phase: EndBossPhase
  openBefore: number
  chapter: ChapterState
}) {
  const { definition } = endBoss
  const hp = endBossHpText(endBoss, chapter.chapter.criterion.type === 'manual')
  return (
    <div
      className={cn(
        'mt-3 rounded-xl border px-3.5 py-3',
        phase === 'defeated' ? 'border-gold/30 bg-gold/6' : 'border-(--boss-35) bg-(--boss-10)',
      )}
      data-end-boss-panel=""
    >
      <div className="flex items-start gap-3">
        <span
          aria-hidden="true"
          className={cn(
            'grid size-11 shrink-0 place-items-center rounded-xl bg-black/25 text-[1.625rem] leading-none ring-1 ring-inset',
            phase === 'defeated' ? 'ring-gold/35' : 'ring-(--boss-35)',
            phase === 'asleep' && 'grayscale-[0.4]',
          )}
        >
          {definition.icon}
        </span>
        <div className="min-w-0 flex-1">
          <p className="font-display text-[1rem] leading-snug font-semibold tracking-wide text-parchment">
            <span className="sr-only">Endgegner: </span>
            {definition.name}
          </p>
          <p
            className={cn(
              'mt-0.5 text-[0.8125rem] leading-snug',
              phase === 'defeated' ? 'font-serif text-[0.9375rem] text-parchment/85 italic' : 'text-muted',
            )}
          >
            {endBossStatusText(endBoss, openBefore)}
          </p>
        </div>
      </div>
      {phase !== 'defeated' && (
        <ProgressBar
          className="mt-3"
          value={endBoss.maxHp > 0 ? endBoss.hp / endBoss.maxHp : 0}
          color={BOSS_COLOR}
          size="md"
          glow={phase === 'awakened'}
          label={
            <span className="text-xs font-semibold tracking-[0.12em] text-muted uppercase">
              Lebenspunkte<span className="sr-only">: {definition.name}</span>
            </span>
          }
          valueLabel={<span className="text-sm font-semibold text-parchment tabular-nums">{hp.value}</span>}
          valueText={hp.spoken}
        />
      )}
    </div>
  )
}
