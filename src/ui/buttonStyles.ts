import { cn } from './cn'

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger'
export type ButtonSize = 'sm' | 'md' | 'lg'

const BASE =
  'relative inline-flex select-none items-center justify-center gap-2 whitespace-nowrap rounded-xl border font-semibold tracking-wide ' +
  'transition-[background-color,border-color,color,box-shadow,transform,opacity] duration-150 ease-out ' +
  'active:scale-[0.97] disabled:pointer-events-none disabled:opacity-45 aria-disabled:pointer-events-none aria-disabled:opacity-45 ' +
  '[&_svg]:pointer-events-none [&_svg]:shrink-0'

const VARIANTS: Record<ButtonVariant, string> = {
  primary:
    'border-gold-bright/70 bg-linear-to-b from-gold-bright to-gold text-on-gold ' +
    'shadow-[inset_0_1px_0_rgb(255_255_255/0.4),inset_0_-2px_0_rgb(90_60_10/0.35),0_8px_22px_-10px_rgb(212_165_72/0.75)] ' +
    'hover:from-[#f7da8f] hover:to-gold-bright',
  secondary:
    'border-border-strong bg-surface-raised text-parchment shadow-[inset_0_1px_0_rgb(255_236_200/0.05)] ' +
    'hover:border-gold-dim hover:bg-surface-hover',
  ghost: 'border-transparent bg-transparent text-muted hover:bg-surface-raised hover:text-parchment',
  danger:
    'border-[#c4503d] bg-danger-strong text-parchment shadow-[inset_0_1px_0_rgb(255_255_255/0.12)] hover:bg-[#b23c2a]',
}

// Jede Größe ist mindestens 40 px hoch (Tap-Ziel auf dem Handy); `sm` ist nur schmaler und kleiner beschriftet.
const SIZES: Record<ButtonSize, string> = {
  sm: 'h-10 px-3 text-sm [&_svg]:size-4',
  md: 'h-11 px-4 text-[0.9375rem] [&_svg]:size-[1.125rem]',
  lg: 'h-13 px-6 text-base [&_svg]:size-5',
}

const ICON_SIZES: Record<ButtonSize, string> = {
  sm: 'size-10 [&_svg]:size-4',
  md: 'size-11 [&_svg]:size-5',
  lg: 'size-13 [&_svg]:size-6',
}

export interface ButtonStyleOptions {
  variant?: ButtonVariant
  size?: ButtonSize
  fullWidth?: boolean
  /** Quadratische Form für reine Icon-Buttons. */
  iconOnly?: boolean
}

/**
 * Klassen eines Buttons – auch nutzbar, um z. B. einen `<Link>` wie einen Button aussehen zu lassen:
 * `<Link className={buttonClassName({ variant: 'secondary' })} … />`.
 */
export function buttonClassName({
  variant = 'primary',
  size = 'md',
  fullWidth = false,
  iconOnly = false,
}: ButtonStyleOptions = {}): string {
  return cn(BASE, VARIANTS[variant], iconOnly ? ICON_SIZES[size] : SIZES[size], fullWidth && 'w-full')
}
