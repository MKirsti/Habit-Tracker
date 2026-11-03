import { motion } from 'motion/react'
import { useId } from 'react'
import type { ReactNode } from 'react'
import { cn } from './cn'

export interface SwitchProps {
  checked: boolean
  onChange: (checked: boolean) => void
  /** Sichtbares Label – die ganze Zeile wird dann zum Schalter. */
  label?: ReactNode
  /** Erklärung unter dem Label. */
  description?: ReactNode
  /** Zugänglicher Name, wenn kein sichtbares Label existiert. */
  'aria-label'?: string
  disabled?: boolean
  id?: string
  className?: string
}

/** Ein/Aus-Schalter (role="switch"). Mit Label als ganze, gut treffbare Zeile. */
export function Switch({
  checked,
  onChange,
  label,
  description,
  'aria-label': ariaLabel,
  disabled,
  id: idProp,
  className,
}: SwitchProps) {
  const autoId = useId()
  const id = idProp ?? autoId
  const labelId = `${id}-label`
  const descriptionId = `${id}-description`

  const track = (
    <span
      aria-hidden="true"
      className={cn(
        'relative inline-flex h-7 w-12 shrink-0 items-center rounded-full border p-0.5 transition-colors duration-200',
        checked
          ? 'border-gold-bright/70 bg-linear-to-b from-gold to-gold-dim shadow-[0_0_14px_-3px_rgb(212_165_72/0.7)]'
          : 'border-border-strong bg-bg-deep/80 shadow-[inset_0_1px_2px_rgb(0_0_0/0.5)]',
      )}
    >
      <motion.span
        className={cn(
          'block size-5.5 rounded-full shadow-[0_1px_3px_rgb(0_0_0/0.6)]',
          checked ? 'bg-parchment' : 'bg-[#8d7c62]',
        )}
        initial={false}
        animate={{ x: checked ? 20 : 0 }}
        transition={{ type: 'spring', stiffness: 600, damping: 34 }}
      />
    </span>
  )

  const hasLabel = label !== undefined

  return (
    <button
      type="button"
      role="switch"
      id={id}
      aria-checked={checked}
      aria-labelledby={hasLabel ? labelId : undefined}
      aria-label={hasLabel ? undefined : ariaLabel}
      aria-describedby={description !== undefined ? descriptionId : undefined}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cn(
        'group rounded-xl text-left transition-opacity disabled:cursor-not-allowed disabled:opacity-50',
        // Ohne Label ist nur die Schiene sichtbar (28 px) – die Schaltfläche bleibt trotzdem 40 px hoch.
        hasLabel ? 'flex w-full items-center justify-between gap-4 py-2' : 'inline-flex min-h-10 items-center',
        className,
      )}
    >
      {hasLabel && (
        <span className="min-w-0">
          <span id={labelId} className="block text-[0.9375rem] font-medium text-parchment">
            {label}
          </span>
          {description !== undefined && (
            <span id={descriptionId} className="mt-0.5 block text-sm text-muted">
              {description}
            </span>
          )}
        </span>
      )}
      {!hasLabel && description !== undefined && (
        <span id={descriptionId} className="sr-only">
          {description}
        </span>
      )}
      {track}
    </button>
  )
}
