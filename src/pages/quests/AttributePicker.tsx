import { Check } from 'lucide-react'
import { useId } from 'react'
import type { CSSProperties } from 'react'
import { ATTRIBUTE_IDS, ATTRIBUTES } from '../../domain/attributes'
import type { AttributeId } from '../../domain/types'
import { Field, cn } from '../../ui'

export interface AttributePickerProps {
  value: AttributeId
  onChange: (attribute: AttributeId) => void
  label?: string
  hint?: string
}

/**
 * Auswahl des Attributs als Radiogruppe (native Radios → Pfeiltasten, Screenreader und Formular-
 * verhalten „gratis“): Raster aus sechs Karten mit Icon, Name und Beschreibung in Attributfarbe.
 */
export function AttributePicker({ value, onChange, label = 'Attribut', hint }: AttributePickerProps) {
  const id = useId()
  const name = `${id}-attribute`

  return (
    <Field id={id} label={label} hint={hint} group>
      <div
        role="radiogroup"
        aria-labelledby={`${id}-label`}
        aria-describedby={hint !== undefined ? `${id}-hint` : undefined}
        className="grid grid-cols-2 gap-2 sm:grid-cols-3"
      >
        {ATTRIBUTE_IDS.map((attributeId) => {
          const meta = ATTRIBUTES[attributeId]
          const checked = attributeId === value
          const nameId = `${id}-${attributeId}-name`
          const descriptionId = `${id}-${attributeId}-description`
          return (
            <label
              key={attributeId}
              className={cn(
                'relative flex min-h-[4.75rem] cursor-pointer flex-col gap-1 rounded-xl border px-3 py-2.5 transition-[background-color,border-color,box-shadow] duration-150',
                'has-focus-visible:outline-2 has-focus-visible:outline-offset-2 has-focus-visible:outline-gold-bright',
                !checked && 'border-border bg-bg-deep/50 hover:border-border-strong hover:bg-surface-hover/60',
              )}
              style={checked ? selectedStyle(meta.color) : undefined}
            >
              <input
                type="radio"
                name={name}
                value={attributeId}
                checked={checked}
                onChange={() => onChange(attributeId)}
                aria-labelledby={nameId}
                aria-describedby={descriptionId}
                className="sr-only"
              />
              <span className="flex items-center gap-2 pr-5">
                <span aria-hidden="true" className="text-lg leading-none">
                  {meta.icon}
                </span>
                <span id={nameId} className="text-[0.9375rem] font-semibold" style={{ color: meta.color }}>
                  {meta.name}
                </span>
              </span>
              <span id={descriptionId} className="text-xs leading-snug text-muted">
                {meta.description}
              </span>
              {checked && (
                <span
                  aria-hidden="true"
                  className="absolute top-2 right-2 grid size-5 place-items-center rounded-full text-bg-deep"
                  style={{ backgroundColor: meta.color }}
                >
                  <Check className="size-3.5" strokeWidth={3} />
                </span>
              )}
            </label>
          )
        })}
      </div>
    </Field>
  )
}

/** Gewählte Karte: Hintergrund, Rahmen und innerer Schein in der Attributfarbe. */
function selectedStyle(color: string): CSSProperties {
  return {
    backgroundColor: `color-mix(in srgb, ${color} 12%, transparent)`,
    borderColor: `color-mix(in srgb, ${color} 70%, transparent)`,
    boxShadow: `inset 0 0 18px color-mix(in srgb, ${color} 14%, transparent)`,
  }
}
