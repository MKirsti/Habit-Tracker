import { Minus, Plus } from 'lucide-react'
import { useId, useState } from 'react'
import type { FocusEvent, KeyboardEvent, ReactNode, Ref } from 'react'
import { cn } from './cn'
import { Field } from './Field'
import { INPUT_GROUP_CLASS, describedBy, hasContent } from './fieldStyles'
import { countDecimals, formatDecimalInput, parseDecimal } from './format'

export interface NumberFieldProps {
  /** Aktueller Wert; `null` = leer. */
  value: number | null
  /**
   * Wird bei jeder gültigen Eingabe aufgerufen (leer → `null`). Während des Tippens wird der
   * Wert ungeklemmt gemeldet; beim Verlassen des Feldes (und bei ±) wird auf min/max begrenzt.
   */
  onChange: (value: number | null) => void
  min?: number
  max?: number
  /** Schrittweite für ±-Buttons und Pfeiltasten. Standard: 1. */
  step?: number
  label?: ReactNode
  hint?: ReactNode
  error?: ReactNode
  /** Einheit rechts im Feld, z. B. "Seiten". */
  unit?: string
  /** ±-Buttons anzeigen (Standard: an). */
  steppers?: boolean
  placeholder?: string
  disabled?: boolean
  required?: boolean
  id?: string
  name?: string
  'aria-label'?: string
  onBlur?: (event: FocusEvent<HTMLInputElement>) => void
  ref?: Ref<HTMLInputElement>
  className?: string
  fieldClassName?: string
}

/**
 * Zahlenfeld für deutschsprachige Eingabe: akzeptiert Komma (und Punkt) als Dezimaltrenner,
 * zeigt die Dezimaltastatur (inputMode="decimal"), unterstützt Pfeiltasten und ±-Buttons.
 * Bewusst `type="text"`, weil `type="number"` in vielen Browsern kein Komma annimmt.
 */
export function NumberField({
  value,
  onChange,
  min,
  max,
  step = 1,
  label,
  hint,
  error,
  unit,
  steppers = true,
  placeholder,
  disabled,
  required,
  id: idProp,
  name,
  'aria-label': ariaLabel,
  onBlur,
  ref,
  className,
  fieldClassName,
}: NumberFieldProps) {
  const autoId = useId()
  const id = idProp ?? autoId

  const [text, setText] = useState(() => formatDecimalInput(value))
  // Externe Wertänderungen übernehmen, ohne laufende Eingaben (z. B. "1," → 1) zu überschreiben.
  // (Muster „State während des Renderns anpassen“ statt useEffect.)
  const [syncedValue, setSyncedValue] = useState(value)
  if (!Object.is(value, syncedValue)) {
    setSyncedValue(value)
    if (!Object.is(parseDecimal(text), value)) setText(formatDecimalInput(value))
  }

  const parsed = parseDecimal(text)
  const isEmpty = text.trim() === ''
  const unparsable = !isEmpty && parsed === null
  const outOfRange = parsed !== null && ((min !== undefined && parsed < min) || (max !== undefined && parsed > max))
  const invalid = hasContent(error) || unparsable || outOfRange
  // Die Einheit steht nur optisch im Feld (aria-hidden) – Screenreader hören sie über aria-valuetext.
  const valueText = unit !== undefined && parsed !== null ? `${formatDecimalInput(parsed)} ${unit}` : undefined

  function limit(n: number): number {
    let result = n
    if (min !== undefined) result = Math.max(min, result)
    if (max !== undefined) result = Math.min(max, result)
    return result
  }

  function commit(next: number) {
    setText(formatDecimalInput(next))
    if (!Object.is(next, value)) onChange(next)
  }

  function handleChange(nextText: string) {
    setText(nextText)
    if (nextText.trim() === '') {
      if (value !== null) onChange(null)
      return
    }
    const n = parseDecimal(nextText)
    if (n !== null && !Object.is(n, value)) onChange(n)
  }

  function handleBlur(event: FocusEvent<HTMLInputElement>) {
    if (!isEmpty) {
      // Ungültiges zurücksetzen, Gültiges begrenzen und einheitlich formatieren.
      if (parsed === null) setText(formatDecimalInput(value))
      else commit(limit(parsed))
    }
    onBlur?.(event)
  }

  function stepBy(direction: 1 | -1) {
    const base = parsed ?? value ?? (direction === 1 ? (min ?? 0) - step : (max ?? 0) + step)
    const decimals = Math.max(countDecimals(base), countDecimals(step))
    const next = Number((base + direction * step).toFixed(Math.min(decimals, 10)))
    commit(limit(next))
  }

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'ArrowUp') {
      event.preventDefault()
      stepBy(1)
    } else if (event.key === 'ArrowDown') {
      event.preventDefault()
      stepBy(-1)
    } else if (event.key === 'Enter' && parsed !== null) {
      // Vor dem Absenden eines Formulars noch begrenzen.
      commit(limit(parsed))
    }
  }

  const canDecrement = !disabled && (min === undefined || parsed === null || parsed > min)
  const canIncrement = !disabled && (max === undefined || parsed === null || parsed < max)

  const input = (
    <div data-invalid={invalid || undefined} className={cn(INPUT_GROUP_CLASS, 'h-11 flex-1')}>
      <input
        ref={ref}
        id={id}
        name={name}
        type="text"
        inputMode="decimal"
        autoComplete="off"
        role="spinbutton"
        aria-valuenow={parsed ?? undefined}
        aria-valuetext={valueText}
        aria-valuemin={min}
        aria-valuemax={max}
        aria-label={ariaLabel}
        aria-invalid={invalid || undefined}
        aria-describedby={describedBy(id, hint, error)}
        value={text}
        placeholder={placeholder}
        disabled={disabled}
        required={required}
        onChange={(event) => handleChange(event.target.value)}
        onBlur={handleBlur}
        onKeyDown={handleKeyDown}
        className={cn(
          'h-full w-full min-w-0 flex-1 bg-transparent px-3.5 text-base tabular-nums outline-none focus-visible:outline-none disabled:cursor-not-allowed',
          steppers && unit === undefined && 'text-center',
          className,
        )}
      />
      {unit !== undefined && (
        <span aria-hidden="true" className="shrink-0 pr-3.5 text-sm text-muted">
          {unit}
        </span>
      )}
    </div>
  )

  return (
    <Field id={id} label={label} hint={hint} error={error} required={required} className={fieldClassName}>
      {steppers ? (
        <div className="flex items-stretch gap-2">
          <StepButton label="Verringern" disabled={!canDecrement} onClick={() => stepBy(-1)}>
            <Minus aria-hidden />
          </StepButton>
          {input}
          <StepButton label="Erhöhen" disabled={!canIncrement} onClick={() => stepBy(1)}>
            <Plus aria-hidden />
          </StepButton>
        </div>
      ) : (
        input
      )}
    </Field>
  )
}

function StepButton({
  label,
  disabled,
  onClick,
  children,
}: {
  label: string
  disabled: boolean
  onClick: () => void
  children: ReactNode
}) {
  return (
    <button
      type="button"
      aria-label={label}
      // Nicht per Tab erreichbar: Pfeiltasten im Feld erfüllen denselben Zweck.
      tabIndex={-1}
      disabled={disabled}
      onClick={onClick}
      className="grid size-11 shrink-0 place-items-center rounded-xl border border-border-strong bg-surface-raised text-parchment transition-colors hover:border-gold-dim hover:bg-surface-hover active:scale-95 disabled:pointer-events-none disabled:opacity-40 [&_svg]:size-4"
    >
      {children}
    </button>
  )
}
