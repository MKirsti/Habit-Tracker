import { Check } from 'lucide-react'
import { useEffect, useRef } from 'react'
import type { ReactNode } from 'react'
import { cn } from '../../ui'

export interface StepIndicatorProps {
  steps: readonly string[]
  /** Index des aktuellen Schritts (0-basiert). */
  current: number
  className?: string
}

/** Fortschritt des Onboardings: ein Segment pro Schritt, beschriftet; der aktuelle ist als `step` markiert. */
export function StepIndicator({ steps, current, className }: StepIndicatorProps) {
  return (
    <ol aria-label="Fortschritt der Einrichtung" className={cn('grid gap-2', className)} style={{ gridTemplateColumns: `repeat(${steps.length}, minmax(0, 1fr))` }}>
      {steps.map((label, index) => {
        const done = index < current
        const active = index === current
        return (
          <li key={label} aria-current={active ? 'step' : undefined} className="min-w-0">
            <span
              aria-hidden="true"
              className={cn(
                'block h-1.5 rounded-full transition-[background-color,box-shadow] duration-300',
                active && 'bg-linear-to-r from-gold to-gold-bright shadow-glow-sm',
                done && 'bg-gold/65',
                !active && !done && 'bg-border',
              )}
            />
            <span
              className={cn(
                // Enger gesperrt auf schmalen Handys – sonst wird „Willkommen“ samt Haken bei 360 px abgeschnitten.
                'mt-2 flex items-center gap-1 truncate text-[0.6875rem] font-semibold tracking-[0.04em] uppercase min-[400px]:tracking-[0.12em]',
                active ? 'text-gold-bright' : done ? 'text-gold/80' : 'text-muted',
              )}
            >
              {done && <Check aria-hidden className="size-3 shrink-0" strokeWidth={3} />}
              <span className="truncate">{label}</span>
              <span className="sr-only">{done ? ' (erledigt)' : active ? ' (aktueller Schritt)' : ''}</span>
            </span>
          </li>
        )
      })}
    </ol>
  )
}

export interface StepHeadingProps {
  eyebrow?: ReactNode
  title: ReactNode
  subtitle?: ReactNode
  /** Beim Erscheinen fokussieren (nach einem Schrittwechsel), damit Screenreader den neuen Schritt ansagen. */
  focusOnMount?: boolean
  align?: 'left' | 'center'
  className?: string
}

/** Überschrift eines Onboarding-Schritts (h1, Cinzel) mit kleiner Zierlinie. */
export function StepHeading({ eyebrow, title, subtitle, focusOnMount = false, align = 'left', className }: StepHeadingProps) {
  const ref = useRef<HTMLHeadingElement>(null)

  useEffect(() => {
    if (!focusOnMount) return
    window.scrollTo({ top: 0 })
    ref.current?.focus({ preventScroll: true })
  }, [focusOnMount])

  const centered = align === 'center'
  return (
    <header className={cn(centered && 'text-center', className)}>
      {eyebrow !== undefined && (
        <p className="mb-2 text-xs font-semibold tracking-[0.2em] text-gold uppercase">{eyebrow}</p>
      )}
      <h1
        ref={ref}
        tabIndex={-1}
        className="font-display text-[1.75rem] leading-tight font-bold tracking-wide text-parchment outline-none sm:text-[2.125rem]"
      >
        {title}
      </h1>
      <div
        aria-hidden="true"
        className={cn(
          'mt-3 h-px w-20 bg-linear-to-r from-gold/80 to-transparent',
          centered && 'mx-auto w-28 from-transparent via-gold/80',
        )}
      />
      {subtitle !== undefined && (
        <p className={cn('mt-3 text-[0.9375rem] leading-relaxed text-muted', centered && 'mx-auto max-w-md')}>
          {subtitle}
        </p>
      )}
    </header>
  )
}

/**
 * Aktionsleiste am Ende eines Schritts. Auf dem Handy klebt sie am unteren Rand (mit Verlauf),
 * damit der Hauptknopf auch bei langen Schritten immer erreichbar ist.
 */
export function StepActions({
  children,
  sticky = true,
  className,
}: {
  children: ReactNode
  /** Am unteren Rand kleben (nur Handy). Standard: an. */
  sticky?: boolean
  className?: string
}) {
  return (
    <div
      // Markierung für src/index.css: Solange eine klebende Leiste da ist, hält `scroll-padding-bottom`
      // (Höhe `--onboarding-cta`) beim Tabben den Fokus über ihr sichtbar (WCAG 2.2 SC 2.4.11).
      data-step-actions={sticky ? 'sticky' : 'static'}
      className={cn(
        'mt-auto pt-8 pb-[max(1rem,env(safe-area-inset-bottom))] sm:pb-8',
        sticky &&
          'sticky bottom-0 z-10 -mx-4 bg-linear-to-t from-bg-deep from-55% to-transparent px-4 sm:static sm:mx-0 sm:bg-none sm:px-0',
        className,
      )}
    >
      {children}
    </div>
  )
}
