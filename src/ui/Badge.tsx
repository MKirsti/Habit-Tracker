import type { ComponentPropsWithRef, HTMLAttributes, ReactNode } from 'react'
import { cn } from './cn'
import { tintStyle } from './tint'

export type BadgeTone = 'neutral' | 'gold' | 'success' | 'danger' | 'info' | 'warning'

const TONES: Record<BadgeTone, string> = {
  neutral: 'border-border-strong bg-surface-raised text-muted',
  gold: 'border-gold/40 bg-gold/12 text-gold-bright',
  success: 'border-success/35 bg-success/12 text-success',
  danger: 'border-danger/40 bg-danger/12 text-danger',
  info: 'border-info/35 bg-info/12 text-info',
  warning: 'border-warning/40 bg-warning/12 text-warning',
}

export interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  tone?: BadgeTone
  /** Freie Akzentfarbe (Hex). Überschreibt `tone`. */
  color?: string
  icon?: ReactNode
  size?: 'sm' | 'md'
}

/** Kleines, nicht interaktives Etikett (Status, XP, Streak …). */
export function Badge({ tone = 'neutral', color, icon, size = 'sm', className, style, children, ...rest }: BadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex max-w-full items-center gap-1 rounded-full border font-medium whitespace-nowrap tabular-nums [&_svg]:shrink-0',
        size === 'sm' ? 'h-6 px-2 text-xs [&_svg]:size-3.5' : 'h-7 px-2.5 text-[0.8125rem] [&_svg]:size-4',
        color === undefined && TONES[tone],
        className,
      )}
      style={color === undefined ? style : { ...tintStyle(color), ...style }}
      {...rest}
    >
      {icon}
      {children}
    </span>
  )
}

export interface ChipProps extends Omit<ComponentPropsWithRef<'button'>, 'onChange'> {
  /** Ausgewählt? Wird als aria-pressed ausgegeben. */
  selected?: boolean
  icon?: ReactNode
  size?: 'sm' | 'md'
}

/**
 * Umschaltbarer Chip (Toggle-Button mit aria-pressed), z. B. für die Wochentags-Auswahl
 * „Mo Di Mi …“ oder Filter.
 */
export function Chip({ selected = false, icon, size = 'md', className, children, type = 'button', ...rest }: ChipProps) {
  return (
    <button
      // eslint-disable-next-line react/button-has-type -- Standard "button", überschreibbar per Prop
      type={type}
      aria-pressed={selected}
      className={cn(
        'inline-flex shrink-0 items-center justify-center gap-1.5 rounded-full border font-medium transition-colors duration-150',
        'disabled:pointer-events-none disabled:opacity-45 [&_svg]:size-4 [&_svg]:shrink-0',
        // Beide Größen sind 40 px hoch (Tap-Ziel); `sm` ist nur schmaler und kleiner beschriftet.
        size === 'sm' ? 'h-10 min-w-10 px-2.5 text-xs' : 'h-10 min-w-10 px-3.5 text-sm',
        selected
          ? 'border-gold/70 bg-gold/15 text-gold-bright shadow-[inset_0_0_12px_rgb(212_165_72/0.12)]'
          : 'border-border-strong bg-surface/60 text-muted hover:border-gold-dim hover:text-parchment',
        className,
      )}
      {...rest}
    >
      {icon}
      {children}
    </button>
  )
}
