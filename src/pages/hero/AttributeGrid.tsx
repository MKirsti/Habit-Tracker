import { useId } from 'react'
import { ATTRIBUTE_IDS, ATTRIBUTES } from '../../domain/attributes'
import type { AttributeId, AttributeState } from '../../domain/types'
import { ProgressBar, SectionTitle, formatNumber, tintStyle } from '../../ui'

export interface AttributeGridProps {
  attributes: Record<AttributeId, AttributeState>
}

/** Die sechs Attribute als Karten: Icon, Name, Beschreibung, Level und Fortschritt in Attributfarbe. */
export function AttributeGrid({ attributes }: AttributeGridProps) {
  const titleId = useId()
  return (
    <section aria-labelledby={titleId}>
      <SectionTitle id={titleId}>Attribute</SectionTitle>
      <ul className="grid gap-3 sm:grid-cols-2">
        {ATTRIBUTE_IDS.map((id) => {
          const meta = ATTRIBUTES[id]
          const attribute = attributes[id]
          const current = formatNumber(Math.floor(attribute.xpIntoLevel))
          const needed = formatNumber(attribute.xpForNextLevel)
          return (
            <li
              key={id}
              className="relative flex min-w-0 flex-col rounded-2xl border border-border bg-linear-to-b from-surface-raised/80 to-surface/85 p-4 shadow-card"
            >
              <div className="flex items-start gap-3">
                <span
                  aria-hidden="true"
                  className="grid size-11 shrink-0 place-items-center rounded-xl border text-[1.375rem] leading-none"
                  style={tintStyle(meta.color, 12, 35)}
                >
                  {meta.icon}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline justify-between gap-3">
                    <h3 className="font-display text-base font-semibold tracking-wide text-parchment">{meta.name}</h3>
                    <p className="shrink-0 font-display text-lg leading-none font-bold tabular-nums" style={{ color: meta.color }}>
                      <span className="mr-1 font-sans text-[0.625rem] font-semibold tracking-wider text-muted uppercase">
                        Level
                      </span>
                      {formatNumber(attribute.level)}
                    </p>
                  </div>
                  <p className="mt-0.5 text-[0.8125rem] leading-snug text-muted">{meta.description}</p>
                </div>
              </div>
              <ProgressBar
                value={attribute.progress}
                color={meta.color}
                size="sm"
                glow
                className="mt-auto pt-3.5"
                aria-label={`${meta.name}: Fortschritt zu Level ${formatNumber(attribute.level + 1)}`}
                valueText={`${current} von ${needed} XP`}
              />
              <p className="mt-1.5 flex justify-between gap-3 text-xs text-muted tabular-nums">
                <span>bis Level {formatNumber(attribute.level + 1)}</span>
                <span>
                  <span className="font-medium text-parchment">{current}</span> / {needed} XP
                </span>
              </p>
            </li>
          )
        })}
      </ul>
    </section>
  )
}
