import { ArrowRight } from 'lucide-react'
import { useId } from 'react'
import { Link } from 'react-router'
import { ATTRIBUTE_IDS, ATTRIBUTES } from '../../domain/attributes'
import type { AttributeId, AttributeState } from '../../domain/types'
import { Card, ProgressBar, SectionTitle, formatNumber } from '../../ui'

export interface AttributesCardProps {
  attributes: Record<AttributeId, AttributeState>
}

/** Kompakte Übersicht der sechs Attribute mit Level und Fortschritt zum nächsten Level. */
export function AttributesCard({ attributes }: AttributesCardProps) {
  const titleId = useId()
  return (
    <section aria-labelledby={titleId}>
      <SectionTitle
        id={titleId}
        action={
          <Link
            to="/held"
            className="-my-2 inline-flex h-10 shrink-0 scroll-mb-[calc(var(--bottom-nav-height)+env(safe-area-inset-bottom)+1rem)] items-center gap-1 rounded-lg text-sm font-medium whitespace-nowrap text-gold transition-colors hover:text-gold-bright md:scroll-mb-6"
          >
            Zum Helden
            <ArrowRight aria-hidden className="size-4" />
          </Link>
        }
      >
        Attribute
      </SectionTitle>
      <Card padding="sm" className="sm:p-4">
        <ul className="grid grid-cols-2 gap-x-3 gap-y-3.5 sm:grid-cols-3 lg:grid-cols-2 xl:grid-cols-3">
          {ATTRIBUTE_IDS.map((id) => {
            const meta = ATTRIBUTES[id]
            const attribute = attributes[id]
            return (
              <li key={id} className="min-w-0 rounded-xl bg-black/15 px-2.5 py-2 ring-1 ring-white/[0.03] ring-inset">
                {/* Eine Zeile (Icon · Name · Level); in der schmalen Desktop-Spalte zweizeilig (Icon · Level / Name). */}
                <div className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-x-2 lg:grid-cols-[auto_minmax(0,1fr)] lg:gap-y-1">
                  <span aria-hidden="true" className="text-lg leading-none lg:col-start-1 lg:row-start-1">
                    {meta.icon}
                  </span>
                  <span className="truncate text-xs font-medium text-muted lg:col-span-2 lg:row-start-2">{meta.name}</span>
                  <span
                    className="justify-self-end font-display text-sm font-bold tabular-nums lg:col-start-2 lg:row-start-1"
                    style={{ color: meta.color }}
                  >
                    <span className="sr-only">Level </span>
                    <span
                      aria-hidden="true"
                      className="mr-1 font-sans text-[0.625rem] font-semibold tracking-wider text-muted uppercase"
                    >
                      Lv
                    </span>
                    {formatNumber(attribute.level)}
                  </span>
                </div>
                <ProgressBar
                  value={attribute.progress}
                  color={meta.color}
                  size="xs"
                  className="mt-2"
                  aria-label={`${meta.name}: Fortschritt zu Level ${formatNumber(attribute.level + 1)}`}
                  valueText={`${formatNumber(Math.floor(attribute.xpIntoLevel))} von ${formatNumber(attribute.xpForNextLevel)} XP`}
                />
              </li>
            )
          })}
        </ul>
      </Card>
    </section>
  )
}
