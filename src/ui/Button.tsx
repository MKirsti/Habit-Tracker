import type { ComponentPropsWithRef, ReactNode } from 'react'
import { buttonClassName } from './buttonStyles'
import type { ButtonSize, ButtonVariant } from './buttonStyles'
import { cn } from './cn'
import { Spinner } from './Spinner'

export interface ButtonProps extends ComponentPropsWithRef<'button'> {
  /** primary = Gold (Hauptaktion), secondary, ghost (dezent), danger (destruktiv). Standard: primary. */
  variant?: ButtonVariant
  size?: ButtonSize
  fullWidth?: boolean
  /** Icon links vom Text (z. B. ein lucide-Icon). */
  icon?: ReactNode
  /** Icon rechts vom Text. */
  iconRight?: ReactNode
  /** Zeigt einen Spinner statt des Icons und deaktiviert den Button. */
  loading?: boolean
}

/** Standard-Button des Design-Systems. `type` ist standardmäßig "button" (nicht "submit"). */
export function Button({
  variant = 'primary',
  size = 'md',
  fullWidth = false,
  icon,
  iconRight,
  loading = false,
  disabled,
  className,
  children,
  type = 'button',
  ...rest
}: ButtonProps) {
  return (
    <button
      // eslint-disable-next-line react/button-has-type -- Standard "button", überschreibbar per Prop
      type={type}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={cn(buttonClassName({ variant, size, fullWidth }), className)}
      {...rest}
    >
      {loading ? <Spinner label={null} className="text-current" /> : icon}
      {children}
      {iconRight}
    </button>
  )
}

export interface IconButtonProps extends Omit<ComponentPropsWithRef<'button'>, 'children'> {
  /** Pflicht: beschreibt die Aktion für Screenreader (und als Tooltip). */
  'aria-label': string
  icon: ReactNode
  variant?: ButtonVariant
  size?: ButtonSize
}

/** Quadratischer Button nur mit Icon. Standard-Variante: ghost. */
export function IconButton({
  icon,
  variant = 'ghost',
  size = 'md',
  className,
  type = 'button',
  title,
  ...rest
}: IconButtonProps) {
  return (
    <button
      // eslint-disable-next-line react/button-has-type -- Standard "button", überschreibbar per Prop
      type={type}
      title={title ?? rest['aria-label']}
      className={cn(buttonClassName({ variant, size, iconOnly: true }), 'px-0', className)}
      {...rest}
    >
      {icon}
    </button>
  )
}
