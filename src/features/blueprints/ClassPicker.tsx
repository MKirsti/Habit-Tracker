import { Check, CircleAlert } from 'lucide-react'
import { useId } from 'react'
import type { Ref } from 'react'
import type { BlueprintPath } from '../../data/blueprints'
import { ATTRIBUTES } from '../../domain/attributes'
import { AttributeChip, cn, tintStyle } from '../../ui'

export interface ClassPickerProps {
  paths: readonly BlueprintPath[]
  /** Gewählter Pfad; `undefined` = noch keiner (es ist nichts vorausgewählt). */
  value: string | undefined
  onChange: (pathId: string) => void
  /** Zeigt den Pflicht-Hinweis als Fehler (nach einem Bestätigen ohne Wahl). */
  error?: boolean
  /** Bekommt das erste Radio – zum Fokussieren, wenn die Wahl fehlt. */
  firstInputRef?: Ref<HTMLInputElement>
  /** ID der Überschrift, die die Gruppe benennt. */
  labelledBy: string
  disabled?: boolean
}

/**
 * Klassenwahl: drei große Radio-Karten (Icon, Klasse, Art, Beschreibung, Attribute). Echte Radio-Buttons
 * (Pfeiltasten, Screenreader); der Klassenname ist das Label und spannt sich unsichtbar über die Karte.
 */
export function ClassPicker({ paths, value, onChange, error = false, firstInputRef, labelledBy, disabled = false }: ClassPickerProps) {
  const name = useId()
  const errorId = `${name}-error`
  return (
    <div>
      {/* Über den Karten: Auf dem Handy wäre ein Hinweis darunter außerhalb des sichtbaren Bereichs. */}
      {error && (
        <p
          id={errorId}
          role="alert"
          className="mb-3 flex items-start gap-2 rounded-xl border border-danger/40 bg-danger/10 px-3 py-2.5 text-sm text-danger"
        >
          <CircleAlert aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
          <span>Bitte wähle deine Klasse – sie bestimmt deine Quests und Kapitel.</span>
        </p>
      )}
      <div
        role="radiogroup"
        aria-labelledby={labelledBy}
        aria-required="true"
        aria-invalid={error || undefined}
        aria-describedby={error ? errorId : undefined}
        className="grid gap-3 sm:grid-cols-3"
      >
        {paths.map((path, index) => (
          <ClassCard
            key={path.id}
            name={name}
            path={path}
            checked={value === path.id}
            onSelect={() => onChange(path.id)}
            inputRef={index === 0 ? firstInputRef : undefined}
            disabled={disabled}
            invalid={error}
          />
        ))}
      </div>
    </div>
  )
}

interface ClassCardProps {
  name: string
  path: BlueprintPath
  checked: boolean
  onSelect: () => void
  inputRef?: Ref<HTMLInputElement>
  disabled: boolean
  invalid: boolean
}

function ClassCard({ name, path, checked, onSelect, inputRef, disabled, invalid }: ClassCardProps) {
  const id = useId()
  const inputId = `${id}-input`
  const descriptionId = `${id}-description`
  const color = ATTRIBUTES[path.primaryAttribute].color
  return (
    <div
      data-checked={checked || undefined}
      className={cn(
        'relative isolate flex flex-col rounded-2xl border p-3.5 transition-[border-color,background-color,box-shadow] duration-200 sm:p-4',
        'has-focus-visible:outline-2 has-focus-visible:outline-offset-2 has-focus-visible:outline-gold-bright',
        checked
          ? 'border-gold/75 bg-linear-to-b from-[#2a2010]/95 to-surface/95 shadow-[inset_0_1px_0_rgb(240_201_106/0.16),0_0_0_1px_rgb(212_165_72/0.22),0_14px_34px_-18px_rgb(212_165_72/0.55)]'
          : invalid
            ? 'border-danger/60 bg-surface/70 hover:border-danger'
            : 'border-border bg-surface/70 hover:border-border-strong hover:bg-surface-raised/70',
        disabled && 'pointer-events-none opacity-60',
      )}
    >
      <input
        ref={inputRef}
        id={inputId}
        type="radio"
        name={name}
        value={path.id}
        checked={checked}
        onChange={onSelect}
        disabled={disabled}
        aria-describedby={descriptionId}
        className="sr-only"
      />
      <div className="flex items-start gap-3 sm:flex-1 sm:flex-col sm:items-center sm:text-center">
        <span
          aria-hidden="true"
          className={cn(
            'grid size-12 shrink-0 place-items-center rounded-xl border text-[1.75rem] leading-none transition-transform duration-300 sm:size-14 sm:text-[2rem]',
            checked && 'scale-105',
          )}
          style={tintStyle(color, checked ? 20 : 11, checked ? 55 : 30)}
        >
          {path.icon}
        </span>
        <div className="min-w-0 flex-1 pr-7 sm:flex sm:w-full sm:flex-col sm:pr-0">
          <label
            htmlFor={inputId}
            className="block cursor-pointer after:absolute after:inset-0 after:z-10 after:rounded-2xl after:content-['']"
          >
            <span className="block font-display text-[1.0625rem] leading-snug font-semibold tracking-wide text-parchment">
              {path.className}
            </span>{' '}
            <span className="sr-only">–</span>{' '}
            <span className="mt-0.5 block text-[0.6875rem] font-semibold tracking-[0.14em] text-gold uppercase">
              {path.label}
            </span>
          </label>
          <p id={descriptionId} className="mt-1.5 text-[0.8125rem] leading-relaxed text-muted">
            {path.description}
          </p>
          <div className="mt-2.5 flex flex-wrap items-center gap-1 sm:mt-auto sm:justify-center sm:pt-2.5">
            <AttributeChip attribute={path.primaryAttribute} />
            {path.secondaryAttributes.map((attribute) => (
              <AttributeChip key={attribute} attribute={attribute} showName={false} />
            ))}
          </div>
        </div>
      </div>
      {/* Radio-Anzeige oben rechts */}
      <span
        aria-hidden="true"
        className={cn(
          'absolute top-3.5 right-3.5 grid size-6 place-items-center rounded-full border-2 transition-colors duration-200 sm:top-3 sm:right-3',
          checked ? 'border-gold-bright bg-gold-bright text-on-gold' : 'border-border-strong bg-bg-deep/60',
        )}
      >
        {checked && <Check className="size-3.5" strokeWidth={3.5} />}
      </span>
    </div>
  )
}
