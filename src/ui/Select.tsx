import { ChevronDown } from 'lucide-react'
import { useId } from 'react'
import type { ReactNode, Ref } from 'react'
import { cn } from './cn'
import { Field } from './Field'
import { INPUT_CLASS, describedBy, hasContent } from './fieldStyles'

export interface SelectOption<T extends string | number> {
  value: T
  label: string
  disabled?: boolean
}

export interface SelectProps<T extends string | number> {
  value: T
  onChange: (value: T) => void
  options: readonly SelectOption<T>[]
  label?: ReactNode
  hint?: ReactNode
  error?: ReactNode
  id?: string
  name?: string
  disabled?: boolean
  required?: boolean
  'aria-label'?: string
  ref?: Ref<HTMLSelectElement>
  className?: string
  fieldClassName?: string
}

/**
 * Native Auswahlliste (beste Bedienung auf dem Handy) im Theme-Look.
 * Werte dürfen Strings oder Zahlen sein – `onChange` liefert den Original-Typ zurück.
 */
export function Select<T extends string | number>({
  value,
  onChange,
  options,
  label,
  hint,
  error,
  id: idProp,
  name,
  disabled,
  required,
  'aria-label': ariaLabel,
  ref,
  className,
  fieldClassName,
}: SelectProps<T>) {
  const autoId = useId()
  const id = idProp ?? autoId

  return (
    <Field id={id} label={label} hint={hint} error={error} required={required} className={fieldClassName}>
      <div className="relative">
        <select
          ref={ref}
          id={id}
          name={name}
          value={String(value)}
          disabled={disabled}
          required={required}
          aria-label={ariaLabel}
          aria-invalid={hasContent(error) || undefined}
          aria-describedby={describedBy(id, hint, error)}
          onChange={(event) => {
            const option = options.find((o) => String(o.value) === event.target.value)
            if (option) onChange(option.value)
          }}
          className={cn(INPUT_CLASS, 'h-11 appearance-none pr-10 [&>option]:bg-surface [&>option]:text-parchment', className)}
        >
          {options.map((option) => (
            <option key={String(option.value)} value={String(option.value)} disabled={option.disabled}>
              {option.label}
            </option>
          ))}
        </select>
        <ChevronDown
          aria-hidden
          className="pointer-events-none absolute top-1/2 right-3.5 size-4 -translate-y-1/2 text-gold"
        />
      </div>
    </Field>
  )
}
