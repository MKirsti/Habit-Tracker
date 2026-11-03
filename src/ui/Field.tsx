import { CircleAlert } from 'lucide-react'
import type { ReactNode } from 'react'
import { cn } from './cn'
import { fieldIds, hasContent } from './fieldStyles'

export interface FieldProps {
  /** ID des Eingabeelements. Hinweis/Fehler erhalten daraus abgeleitete IDs (siehe `fieldIds`). */
  id: string
  label?: ReactNode
  /** Hilfetext unter dem Feld. */
  hint?: ReactNode
  /** Fehlermeldung – ersetzt optisch den Hinweis und wird vorgelesen. */
  error?: ReactNode
  /** Markiert das Feld als Pflichtfeld (nur optisch; `required` am Input setzen). */
  required?: boolean
  /** Element rechts neben dem Label (z. B. Zeichenzähler). */
  labelAside?: ReactNode
  /**
   * Für zusammengesetzte Steuerelemente (Radiogruppe, Emoji-Auswahl): Das Label wird dann als
   * `<div id="{id}-label">` gerendert und das Steuerelement verweist per aria-labelledby darauf.
   */
  group?: boolean
  className?: string
  children: ReactNode
}

/** Rahmen für Formularfelder: Label, Steuerelement, Hinweis bzw. Fehlermeldung. */
export function Field({ id, label, hint, error, required, labelAside, group = false, className, children }: FieldProps) {
  const { labelId, hintId, errorId } = fieldIds(id)
  const labelClass = 'text-sm font-medium text-parchment'
  const hasError = hasContent(error)

  return (
    <div className={cn('flex flex-col gap-1.5', className)}>
      {(hasContent(label) || hasContent(labelAside)) && (
        <div className="flex items-baseline justify-between gap-3">
          {hasContent(label) &&
            (group ? (
              <div id={labelId} className={labelClass}>
                {label}
                {required && <RequiredMark />}
              </div>
            ) : (
              <label id={labelId} htmlFor={id} className={labelClass}>
                {label}
                {required && <RequiredMark />}
              </label>
            ))}
          {labelAside}
        </div>
      )}
      {children}
      {hasError ? (
        <p id={errorId} className="flex items-start gap-1.5 text-sm text-danger">
          <CircleAlert aria-hidden className="mt-0.5 size-4 shrink-0" />
          <span>{error}</span>
        </p>
      ) : (
        hasContent(hint) && (
          <p id={hintId} className="text-[0.8125rem] text-muted">
            {hint}
          </p>
        )
      )}
    </div>
  )
}

function RequiredMark() {
  return (
    <span className="ml-0.5 text-gold" aria-hidden="true">
      *
    </span>
  )
}
