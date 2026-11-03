import { useId } from 'react'
import type { ComponentPropsWithRef, ReactNode } from 'react'
import { cn } from './cn'
import { Field } from './Field'
import { INPUT_CLASS, describedBy, hasContent } from './fieldStyles'

interface SharedFieldProps {
  label?: ReactNode
  hint?: ReactNode
  error?: ReactNode
  /** Zeichenzähler neben dem Label (nur zusammen mit `maxLength`). */
  showCount?: boolean
  /** Klassen für den äußeren Feld-Rahmen (Label + Eingabe + Hinweis). */
  fieldClassName?: string
}

export interface TextFieldProps
  extends SharedFieldProps,
    Omit<ComponentPropsWithRef<'input'>, 'value' | 'onChange' | 'size' | 'type'> {
  value: string
  onChange: (value: string) => void
  type?: 'text' | 'email' | 'search' | 'url' | 'password' | 'tel' | 'date' | 'time'
  /** Element links im Feld (Icon, Emoji). */
  leading?: ReactNode
  /** Element rechts im Feld (z. B. Einheit). */
  trailing?: ReactNode
}

/** Einzeiliges Textfeld mit Label, Hinweis und Fehlermeldung. */
export function TextField({
  value,
  onChange,
  label,
  hint,
  error,
  showCount = false,
  fieldClassName,
  leading,
  trailing,
  id: idProp,
  type = 'text',
  className,
  maxLength,
  required,
  ...rest
}: TextFieldProps) {
  const autoId = useId()
  const id = idProp ?? autoId

  return (
    <Field
      id={id}
      label={label}
      hint={hint}
      error={error}
      required={required}
      className={fieldClassName}
      labelAside={showCount && maxLength !== undefined ? <CharCount value={value} max={maxLength} /> : undefined}
    >
      <div className="relative">
        {leading !== undefined && (
          <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-muted [&_svg]:size-[1.125rem]">
            {leading}
          </span>
        )}
        <input
          id={id}
          type={type}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          maxLength={maxLength}
          required={required}
          aria-invalid={hasContent(error) || undefined}
          aria-describedby={describedBy(id, hint, error)}
          className={cn(
            INPUT_CLASS,
            'h-11',
            leading !== undefined && 'pl-10',
            trailing !== undefined && 'pr-14',
            type === 'date' || type === 'time' ? 'scheme-dark' : '',
            className,
          )}
          {...rest}
        />
        {trailing !== undefined && (
          <span className="pointer-events-none absolute inset-y-0 right-3.5 flex items-center text-sm text-muted">
            {trailing}
          </span>
        )}
      </div>
    </Field>
  )
}

export interface TextAreaProps
  extends SharedFieldProps,
    Omit<ComponentPropsWithRef<'textarea'>, 'value' | 'onChange'> {
  value: string
  onChange: (value: string) => void
}

/** Mehrzeiliges Textfeld (vertikal vergrößerbar). */
export function TextArea({
  value,
  onChange,
  label,
  hint,
  error,
  showCount = false,
  fieldClassName,
  id: idProp,
  rows = 3,
  className,
  maxLength,
  required,
  ...rest
}: TextAreaProps) {
  const autoId = useId()
  const id = idProp ?? autoId

  return (
    <Field
      id={id}
      label={label}
      hint={hint}
      error={error}
      required={required}
      className={fieldClassName}
      labelAside={showCount && maxLength !== undefined ? <CharCount value={value} max={maxLength} /> : undefined}
    >
      <textarea
        id={id}
        rows={rows}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        maxLength={maxLength}
        required={required}
        aria-invalid={hasContent(error) || undefined}
        aria-describedby={describedBy(id, hint, error)}
        className={cn(INPUT_CLASS, 'min-h-20 resize-y py-2.5 leading-relaxed', className)}
        {...rest}
      />
    </Field>
  )
}

function CharCount({ value, max }: { value: string; max: number }) {
  // Wie das maxLength-Attribut in UTF-16-Einheiten zählen (ein Emoji zählt meist doppelt) – sonst
  // zeigt der Zähler "7/8", während der Browser schon keine weitere Eingabe mehr zulässt.
  const length = value.length
  return (
    <span aria-hidden="true" className={cn('text-xs tabular-nums', length >= max ? 'text-warning' : 'text-muted')}>
      {length}/{max}
    </span>
  )
}
