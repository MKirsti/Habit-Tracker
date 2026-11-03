import { motion } from 'motion/react'
import { useId, useRef } from 'react'
import type { KeyboardEvent, ReactNode } from 'react'
import { cn } from './cn'
import { Field } from './Field'
import { fieldIds } from './fieldStyles'

export interface SegmentedOption<T extends string | number> {
  value: T
  label: ReactNode
  icon?: ReactNode
  disabled?: boolean
  /** Zugänglicher Name, falls `label` nur ein Icon/Kürzel ist. */
  'aria-label'?: string
}

export interface SegmentedControlProps<T extends string | number> {
  value: T
  onChange: (value: T) => void
  options: readonly SegmentedOption<T>[]
  /** Sichtbares Label über der Gruppe. */
  label?: ReactNode
  hint?: ReactNode
  /** Zugänglicher Name, wenn kein sichtbares Label existiert. */
  'aria-label'?: string
  size?: 'sm' | 'md'
  /** Segmente füllen die volle Breite (Standard: an). */
  fullWidth?: boolean
  id?: string
  className?: string
  fieldClassName?: string
}

/**
 * Umschalter zwischen wenigen Optionen (z. B. Schwierigkeit, Rhythmus) mit Radiogruppen-Semantik:
 * nur das gewählte Segment ist per Tab erreichbar, Pfeiltasten/Home/End wechseln die Auswahl.
 */
export function SegmentedControl<T extends string | number>({
  value,
  onChange,
  options,
  label,
  hint,
  'aria-label': ariaLabel,
  size = 'md',
  fullWidth = true,
  id: idProp,
  className,
  fieldClassName,
}: SegmentedControlProps<T>) {
  const autoId = useId()
  const id = idProp ?? autoId
  const { labelId, hintId } = fieldIds(id)
  const buttons = useRef<(HTMLButtonElement | null)[]>([])

  const selectedIndex = options.findIndex((o) => o.value === value)
  // Ist nichts (gültiges) gewählt, bekommt das erste aktive Segment den Tab-Stopp.
  const tabStopIndex =
    selectedIndex >= 0 && !options[selectedIndex].disabled ? selectedIndex : options.findIndex((o) => !o.disabled)

  function selectAt(index: number) {
    const option = options[index]
    if (!option || option.disabled) return
    buttons.current[index]?.focus()
    if (option.value !== value) onChange(option.value)
  }

  /** Nächstes aktives Segment in Richtung `direction` (mit Umlauf). */
  function findEnabled(from: number, direction: 1 | -1): number {
    for (let step = 1; step <= options.length; step++) {
      const index = (from + direction * step + options.length) % options.length
      if (!options[index].disabled) return index
    }
    return from
  }

  function handleKeyDown(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    let target: number | undefined
    switch (event.key) {
      case 'ArrowRight':
      case 'ArrowDown':
        target = findEnabled(index, 1)
        break
      case 'ArrowLeft':
      case 'ArrowUp':
        target = findEnabled(index, -1)
        break
      case 'Home':
        target = findEnabled(-1, 1)
        break
      case 'End':
        target = findEnabled(options.length, -1)
        break
      default:
        return
    }
    event.preventDefault()
    selectAt(target)
  }

  const group = (
    <div
      role="radiogroup"
      id={label === undefined ? id : undefined}
      aria-labelledby={label !== undefined ? labelId : undefined}
      aria-label={label === undefined ? ariaLabel : undefined}
      aria-describedby={hint !== undefined ? hintId : undefined}
      className={cn(
        'relative gap-1 rounded-xl border border-border-strong bg-bg-deep/70 p-1 shadow-[inset_0_1px_2px_rgb(0_0_0/0.45)]',
        fullWidth ? 'flex w-full' : 'inline-flex',
        className,
      )}
    >
      {options.map((option, index) => {
        const checked = index === selectedIndex
        return (
          <button
            key={String(option.value)}
            ref={(element) => {
              buttons.current[index] = element
            }}
            type="button"
            role="radio"
            aria-checked={checked}
            aria-label={option['aria-label']}
            tabIndex={index === tabStopIndex ? 0 : -1}
            disabled={option.disabled}
            onClick={() => selectAt(index)}
            onKeyDown={(event) => handleKeyDown(event, index)}
            className={cn(
              'relative isolate flex min-w-0 items-center justify-center gap-1.5 rounded-lg font-medium whitespace-nowrap transition-colors duration-150',
              'focus-visible:outline-offset-0 disabled:pointer-events-none disabled:opacity-40 [&_svg]:size-4 [&_svg]:shrink-0',
              // Mindestens 40 px Tap-Höhe. Bei voller Breite wenig Innenabstand, damit Beschriftungen wie
              // „Schwer“ oder „Wochentage“ auch bei 360 px Bildschirmbreite nicht abgeschnitten werden.
              size === 'sm' ? 'h-10 text-[0.8125rem]' : 'h-10 text-sm',
              fullWidth ? 'flex-1 px-1' : size === 'sm' ? 'px-2.5' : 'px-3',
              checked ? 'text-gold-bright' : 'text-muted hover:text-parchment',
            )}
          >
            {checked && (
              <motion.span
                aria-hidden="true"
                layoutId={`segment-${id}`}
                className="absolute inset-0 -z-10 rounded-lg bg-linear-to-b from-gold/22 to-gold/10 shadow-[inset_0_1px_0_rgb(240_201_106/0.25)] ring-1 ring-gold/55 ring-inset"
                transition={{ type: 'spring', stiffness: 500, damping: 38 }}
              />
            )}
            {option.icon}
            <span className="truncate">{option.label}</span>
          </button>
        )
      })}
    </div>
  )

  if (label === undefined && hint === undefined) return group
  return (
    <Field id={id} label={label} hint={hint} group className={fieldClassName}>
      {group}
    </Field>
  )
}
