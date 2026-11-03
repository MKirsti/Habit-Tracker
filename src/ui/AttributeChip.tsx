import { ATTRIBUTES } from '../domain/attributes'
import type { AttributeId } from '../domain/types'
import { cn } from './cn'
import { tintStyle } from './tint'

export interface AttributeChipProps {
  attribute: AttributeId
  size?: 'sm' | 'md'
  /** Namen anzeigen (Standard). Ohne Namen bleibt er für Screenreader und als Tooltip erhalten. */
  showName?: boolean
  /** Kürzel (z. B. "INT") statt des vollen Namens anzeigen. */
  short?: boolean
  className?: string
}

/** Zeigt ein Attribut mit Icon und Namen in seiner Farbe (aus `src/domain/attributes.ts`). */
export function AttributeChip({ attribute, size = 'sm', showName = true, short = false, className }: AttributeChipProps) {
  const meta = ATTRIBUTES[attribute]
  return (
    <span
      title={showName && !short ? undefined : meta.name}
      className={cn(
        'inline-flex shrink-0 items-center gap-1 rounded-full border font-medium whitespace-nowrap',
        size === 'sm' ? 'h-6 px-2 text-xs' : 'h-7 px-2.5 text-[0.8125rem]',
        !showName && (size === 'sm' ? 'w-6 justify-center px-0' : 'w-7 justify-center px-0'),
        className,
      )}
      style={tintStyle(meta.color, 12, 38)}
    >
      <span aria-hidden="true" className="leading-none">
        {meta.icon}
      </span>
      {showName ? (
        short ? (
          <>
            <span aria-hidden="true" className="tracking-wider">
              {meta.short}
            </span>
            <span className="sr-only">{meta.name}</span>
          </>
        ) : (
          <span>{meta.name}</span>
        )
      ) : (
        <span className="sr-only">{meta.name}</span>
      )}
    </span>
  )
}
