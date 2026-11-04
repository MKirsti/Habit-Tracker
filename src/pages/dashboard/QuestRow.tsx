import { Check, Minus, PenLine, Plus } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import type { MouseEvent, ReactNode } from 'react'
import { ATTRIBUTES } from '../../domain/attributes'
import { habitTarget, reachesTarget } from '../../domain/schedule'
import type { HabitStatus } from '../../domain/types'
import { ProgressBar, cn, formatNumber } from '../../ui'
import { CheckButton } from './CheckButton'
import { CompletionBurst } from './CompletionBurst'
import { formatValue, stepValue, streakBonusLabel, streakBonusText, streakShort, streakText } from './dashboardText'
import type { QuestActions } from './useQuestActions'

export interface QuestRowProps {
  status: HabitStatus
  /** Verknüpfte Kampagne (Icon + Titel), falls vorhanden. */
  campaign?: { icon: string; title: string }
  /** "diese Woche" / "letzte Woche" – Bezug des Wochenfortschritts. */
  weekWord: string
  actions: QuestActions
  /** Öffnet den Dialog zur genauen Eingabe (messbare Quests). */
  onEditValue: (habitId: string) => void
}

/** Eine Quest in der Tagesliste: Abhak-Knopf, Titel, Meta-Zeile und ggf. Mess- bzw. Wochenfortschritt. */
export function QuestRow({ status, campaign, weekWord, actions, onEditValue }: QuestRowProps) {
  const { habit, done, value, target, streak, xp, week, streakBonus } = status
  const measure = habit.measure
  const attribute = ATTRIBUTES[habit.attribute]
  const weekMet = week !== undefined && week.done >= week.target
  const subdued = done || weekMet
  // Was „Auffüllen“ bis zum aktuellen Ziel der Quest noch ergänzt (gleiches Ziel wie toggleCompletion).
  // Zielvergleich wie in der Engine (tolerant gegenüber Gleitkomma-Rauschen) – so entsteht nie ein „+0“.
  const canFill = measure !== undefined && !done && !reachesTarget(value, habitTarget(habit))
  const missing = canFill ? habitTarget(habit) - value : 0

  // Lokale Mikro-Animation, sobald die Quest (egal wodurch) erledigt wird – nicht beim ersten Anzeigen.
  const [prevDone, setPrevDone] = useState(done)
  const [burst, setBurst] = useState(0)
  if (prevDone !== done) {
    setPrevDone(done)
    if (done) setBurst((n) => n + 1)
  }

  // Schnelles Tippen auf +/−: Solange Schreibvorgänge laufen bzw. deren Ergebnis noch nicht in den
  // Live-Daten angekommen ist, wird vom zuletzt geschriebenen Wert weitergezählt (sonst gingen Tipps verloren).
  const pending = useRef<{ value: number; inflight: number } | null>(null)
  useEffect(() => {
    if (pending.current?.inflight === 0) pending.current = null
  }, [value])

  async function writeValue(next: number): Promise<boolean> {
    pending.current = { value: next, inflight: (pending.current?.inflight ?? 0) + 1 }
    const ok = await actions.setValue(habit.id, next)
    const current = pending.current
    if (current) current.inflight -= 1
    if (!ok) pending.current = null
    return ok
  }

  // „Auffüllen“ verschwindet, sobald die Quest erledigt ist. Hatte der Knopf den Tastaturfokus, wandert
  // er auf den Haken (der „erledigt“ ansagt), statt ins Leere (document.body) zu fallen.
  const checkRef = useRef<HTMLButtonElement>(null)
  async function fillToTarget(button: HTMLButtonElement) {
    const hadFocus = document.activeElement === button
    const ok = await writeValue(Math.max(habitTarget(habit), baseValue()))
    // Nur, wenn der Fokus noch auf dem Knopf liegt oder mit ihm verloren ging (nicht, wenn man weitergetabbt ist).
    const active = document.activeElement
    const focusLost = active === button || active === null || active === document.body
    if (ok && hadFocus && focusLost) checkRef.current?.focus()
  }

  function baseValue() {
    return pending.current?.value ?? value
  }

  return (
    <li
      className={cn(
        // Abgerundete Ecken statt overflow-hidden an der Karte – so darf das "+XP" über den Rand aufsteigen.
        'relative px-3 py-3.5 transition-colors duration-300 first:rounded-t-[15px] last:rounded-b-[15px] sm:px-4',
        // Per Tastatur fokussierte Knöpfe nicht hinter der festen unteren Navigation verschwinden lassen.
        '[&_button]:scroll-mb-[calc(var(--bottom-nav-height)+env(safe-area-inset-bottom)+1rem)] md:[&_button]:scroll-mb-6',
        subdued && 'bg-linear-to-r from-gold/[0.06] to-transparent',
      )}
    >
      <div className="flex items-start gap-3">
        <div className="relative shrink-0">
          <CheckButton
            ref={checkRef}
            checked={done}
            progress={measure && target > 0 ? value / target : 0}
            label={`${habit.title} erledigt`}
            onToggle={() => {
              pending.current = null
              void actions.toggle(habit.id)
            }}
          />
          <CompletionBurst burst={burst} xp={xp} onDone={() => setBurst(0)} />
        </div>

        <div className="min-w-0 flex-1 pt-0.5">
          <p className="flex items-start gap-2">
            <span aria-hidden="true" className={cn('text-xl leading-6', subdued && 'opacity-75 saturate-50')}>
              {habit.icon}
            </span>
            <span
              className={cn(
                'min-w-0 leading-6 font-medium transition-colors duration-300',
                subdued ? 'text-muted' : 'text-parchment',
              )}
            >
              {habit.title}
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
            {/* XP inklusive Streak-Bonus – die tatsächlich gutgeschriebenen bzw. die, die ein Haken jetzt bringt. */}
            <span className={cn('font-semibold tabular-nums', done ? 'text-gold-bright' : 'text-gold')}>
              +{formatNumber(xp)} XP
            </span>
            <StreakInfo streak={streak} bonus={streakBonus} />
            {campaign && (
              <span className="inline-flex items-center" title={`Kampagne: ${campaign.title}`}>
                <span aria-hidden="true">{campaign.icon}</span>
                <span className="sr-only">Kampagne: {campaign.title}</span>
              </span>
            )}
          </div>

          {week && <WeekProgress done={week.done} target={week.target} met={weekMet} weekWord={weekWord} />}

          {measure && (
            <ProgressBar
              value={target > 0 ? value / target : 0}
              size="xs"
              aria-label={`Fortschritt: ${habit.title}`}
              valueText={`${formatValue(value)} von ${formatValue(target)} ${measure.unit}`}
              className="mt-2.5"
            />
          )}
        </div>
      </div>

      {measure && (
        <div className="mt-3 flex items-center gap-1.5 sm:pl-15">
          <button
            type="button"
            onClick={() => onEditValue(habit.id)}
            aria-label={`${habit.title}: ${formatValue(value)} von ${formatValue(target)} ${measure.unit} – genauen Wert eingeben`}
            className="group/value flex h-10 min-w-0 flex-1 touch-manipulation items-center justify-between gap-2 rounded-xl border border-border-strong bg-bg-deep/50 px-3 text-left text-sm transition-colors hover:border-gold-dim hover:bg-surface-hover"
          >
            <span className="min-w-0 truncate text-muted tabular-nums">
              <span className={cn('font-semibold', done ? 'text-gold-bright' : 'text-parchment')}>
                {formatValue(value)}
              </span>{' '}
              / {formatValue(target)} {measure.unit}
            </span>
            <PenLine aria-hidden className="size-4 shrink-0 text-faint transition-colors group-hover/value:text-gold" />
          </button>
          <StepButton
            label={`${habit.title}: 1 weniger`}
            disabled={value <= 0}
            onClick={() => void writeValue(stepValue(baseValue(), -1))}
          >
            <Minus aria-hidden />
          </StepButton>
          <StepButton label={`${habit.title}: 1 mehr`} onClick={() => void writeValue(stepValue(baseValue(), 1))}>
            <Plus aria-hidden />
          </StepButton>
          {/* Fehlt nichts mehr (Ziel nachträglich gesenkt), schließt der Haken ab – kein „+0“. */}
          {canFill && (
            <StepButton
              label={`${habit.title}: auf Ziel auffüllen (+${formatValue(missing)} ${measure.unit})`}
              onClick={(event) => void fillToTarget(event.currentTarget)}
              tone="gold"
            >
              <span className="px-1 text-[0.8125rem] font-semibold tabular-nums">+{formatValue(missing)}</span>
            </StepButton>
          )}
        </div>
      )}
    </li>
  )
}

/**
 * Serie neben den XP: "🔥 12" – mit Streak-Bonus als kleines Abzeichen "🔥 12 · +20 %" (vorgelesen
 * "12 Tage in Folge, Streak-Bonus 20 Prozent"). Ohne Serie und ohne Bonus nichts.
 */
function StreakInfo({ streak, bonus }: { streak: HabitStatus['streak']; bonus: number }) {
  const hasStreak = streak.current > 0
  if (bonus <= 0) {
    if (!hasStreak) return null
    return (
      <span className="inline-flex items-center gap-1 text-parchment/90 tabular-nums" title={streakText(streak)}>
        <span aria-hidden="true">🔥</span>
        <span aria-hidden="true">{streakShort(streak)}</span>
        <span className="sr-only">{streakText(streak)}</span>
      </span>
    )
  }
  const spoken = hasStreak ? `${streakText(streak)}, ${streakBonusText(bonus)}` : streakBonusText(bonus)
  return (
    <span
      data-streak-bonus={Math.round(bonus * 100)}
      title={spoken}
      className="-my-0.5 inline-flex items-center gap-1 rounded-full bg-warning/10 py-0.5 pr-2 pl-1.5 text-parchment/90 tabular-nums ring-1 ring-warning/30 ring-inset"
    >
      <span aria-hidden="true">🔥</span>
      {hasStreak && (
        <>
          <span aria-hidden="true">{streakShort(streak)}</span>
          <span aria-hidden="true" className="text-faint">
            ·
          </span>
        </>
      )}
      <span aria-hidden="true" className="font-semibold text-gold-bright">
        {streakBonusLabel(bonus)}
      </span>
      <span className="sr-only">{spoken}</span>
    </span>
  )
}

function WeekProgress({ done, target, met, weekWord }: { done: number; target: number; met: boolean; weekWord: string }) {
  return (
    <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
      <span aria-hidden="true" className="flex gap-1">
        {Array.from({ length: target }, (_, index) => (
          <span
            key={index}
            className={cn(
              'h-1.5 w-3.5 rounded-full',
              index < done ? 'bg-gold shadow-[0_0_6px_-1px_rgb(240_201_106/0.7)]' : 'bg-black/45 ring-1 ring-white/8',
            )}
          />
        ))}
      </span>
      <span className={cn('tabular-nums', met ? 'font-medium text-gold-bright' : 'text-muted')}>
        {met && <Check aria-hidden className="mr-1 -mt-0.5 inline size-3.5" strokeWidth={3} />}
        {formatNumber(done)} / {formatNumber(target)} {weekWord}
        {met && ' – Wochenziel erreicht'}
      </span>
    </div>
  )
}

/**
 * Kleiner Mengen-Knopf. „Gesperrt“ über `aria-disabled` statt `disabled`: Ein per Tastatur fokussierter
 * Knopf (z. B. „−“ beim Erreichen von 0) behält so den Fokus, statt ihn an document.body zu verlieren.
 */
function StepButton({
  label,
  onClick,
  disabled = false,
  tone = 'default',
  children,
}: {
  label: string
  onClick: (event: MouseEvent<HTMLButtonElement>) => void
  disabled?: boolean
  tone?: 'default' | 'gold'
  children: ReactNode
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      aria-disabled={disabled || undefined}
      onClick={(event) => {
        if (!disabled) onClick(event)
      }}
      className={cn(
        'grid h-10 min-w-10 shrink-0 touch-manipulation place-items-center rounded-xl border transition-[background-color,border-color,transform] duration-150 active:scale-95',
        'aria-disabled:pointer-events-none aria-disabled:opacity-35 [&_svg]:size-4',
        tone === 'gold'
          ? 'border-gold/45 bg-gold/12 text-gold-bright hover:border-gold hover:bg-gold/20'
          : 'border-border-strong bg-surface-raised text-parchment hover:border-gold-dim hover:bg-surface-hover',
      )}
    >
      {children}
    </button>
  )
}
