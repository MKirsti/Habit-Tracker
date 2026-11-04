import { Table2 } from 'lucide-react'
import { useLayoutEffect, useRef } from 'react'
import type { PointerEvent, ReactNode } from 'react'
import { cn } from '../../../ui'
import { tooltipLeft } from './chartMath'
import type { ChartCursor } from './useChartCursor'

export interface ChartSurfaceProps {
  cursor: ChartCursor
  /** Zugänglicher Name der fokussierbaren Fläche inkl. Bedienhinweis. */
  label: string
  /** Zusammenfassung des Diagramms (`role="img"`). */
  summary: string
  /** Text der gewählten Position – wird bei Tastaturbedienung vorgelesen. */
  activeLabel?: string
  width: number
  height: number
  /** Position (Pixel im Diagramm) → Index, für Zeiger über bzw. Antippen der Fläche. */
  hitTest?: (x: number, y: number) => number | undefined
  tooltip?: ReactNode
  children: ReactNode
  className?: string
}

/**
 * Fläche eines Diagramms: ein SVG mit `role="img"` und Zusammenfassung, fokussierbar für die Tastatur, mit
 * Tooltip (nur visuell) und einer Live-Region, die die gewählte Position vorliest.
 */
export function ChartSurface({
  cursor,
  label,
  summary,
  activeLabel,
  width,
  height,
  hitTest,
  tooltip,
  children,
  className,
}: ChartSurfaceProps) {
  function locate(event: PointerEvent<SVGSVGElement>) {
    if (!hitTest) return
    const box = event.currentTarget.getBoundingClientRect()
    const index = hitTest(event.clientX - box.left, event.clientY - box.top)
    if (index !== undefined) cursor.point(index)
  }

  return (
    <div className={cn('relative', className)}>
      <div
        {...cursor.surfaceProps}
        role="group"
        aria-label={label}
        className="relative w-fit max-w-full rounded-lg focus-visible:outline-offset-4"
      >
        <svg
          role="img"
          aria-label={summary}
          width={width}
          height={height}
          viewBox={`0 0 ${width} ${height}`}
          className="block max-w-full touch-pan-y overflow-visible select-none"
          onPointerMove={locate}
          onPointerDown={locate}
        >
          {children}
        </svg>
        {tooltip}
      </div>
      <p aria-live="polite" className="sr-only">
        {cursor.keyboard && activeLabel ? activeLabel : ''}
      </p>
    </div>
  )
}

export interface ChartTooltipProps {
  /** Ankerpunkt in Pixeln innerhalb der Fläche. */
  x: number
  y: number
  /** Breite der Fläche – der Tooltip ragt höchstens `TOOLTIP_OVERHANG` Pixel darüber hinaus. */
  width: number
  /** Unter statt über dem Anker (für Punkte nah am oberen Rand). */
  below?: boolean
  children: ReactNode
}

/**
 * Kleiner Tooltip am Anker: Wert vorn und kräftig, Beschriftung danach (`TooltipValue`, `TooltipLabel`). Mittig über
 * dem Anker, aber nie weiter als ein paar Pixel über den Rand der Fläche hinaus (gemessen vor dem Zeichnen).
 */
export function ChartTooltip({ x, y, width, below = false, children }: ChartTooltipProps) {
  const ref = useRef<HTMLDivElement>(null)
  // Die linke Kante hängt von der eigenen Breite ab: vor dem Zeichnen messen und direkt setzen (kein Flackern,
  // kein zweites Rendern). React verwaltet `left` deshalb bewusst nicht.
  useLayoutEffect(() => {
    const element = ref.current
    if (element) element.style.left = `${tooltipLeft(x, element.offsetWidth, width)}px`
  })
  const translateY = below ? '14px' : 'calc(-100% - 10px)'
  return (
    <div
      ref={ref}
      aria-hidden="true"
      className="pointer-events-none absolute z-10 w-max max-w-60 rounded-lg border border-border-strong bg-surface-raised/95 px-2.5 py-1.5 text-xs leading-snug shadow-raised backdrop-blur-sm"
      style={{ top: y, transform: `translateY(${translateY})` }}
    >
      {children}
    </div>
  )
}

export function TooltipValue({ children }: { children: ReactNode }) {
  return <p className="text-[0.8125rem] font-semibold text-parchment tabular-nums">{children}</p>
}

export function TooltipLabel({ children }: { children: ReactNode }) {
  return <p className="text-muted">{children}</p>
}

export interface DataTableColumn {
  label: string
  /** Zahlen rechtsbündig. */
  numeric?: boolean
}

export interface DataTableProps {
  caption: string
  columns: readonly DataTableColumn[]
  rows: readonly { key: string; cells: readonly ReactNode[] }[]
  /** Beschriftung des Aufklappers. */
  toggleLabel?: string
}

/** Die Daten eines Diagramms als Tabelle zum Aufklappen – der barrierefreie Zwilling jedes Diagramms. */
export function DataTable({ caption, columns, rows, toggleLabel = 'Als Tabelle anzeigen' }: DataTableProps) {
  return (
    <details className="group mt-4">
      <summary className="inline-flex cursor-pointer items-center gap-1.5 rounded-md text-sm font-medium text-muted transition-colors select-none hover:text-parchment [&::-webkit-details-marker]:hidden">
        <Table2 aria-hidden className="size-4 text-gold" />
        <span className="group-open:hidden">{toggleLabel}</span>
        <span className="hidden group-open:inline">Tabelle ausblenden</span>
      </summary>
      <div
        role="region"
        aria-label={caption}
        tabIndex={0}
        className="mt-3 max-h-80 overflow-auto rounded-xl border border-border bg-bg-deep/40"
      >
        <table className="w-full border-collapse text-left text-sm">
          <caption className="sr-only">{caption}</caption>
          <thead className="sticky top-0 bg-surface-raised text-xs tracking-wide text-muted uppercase">
            <tr>
              {columns.map((column) => (
                <th
                  key={column.label}
                  scope="col"
                  className={cn('px-3 py-2 font-semibold whitespace-nowrap', column.numeric && 'text-right')}
                >
                  {column.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.key} className="border-t border-border/70">
                {row.cells.map((cell, index) => {
                  const column = columns[index]
                  const Cell = index === 0 ? 'th' : 'td'
                  return (
                    <Cell
                      key={column?.label ?? index}
                      scope={index === 0 ? 'row' : undefined}
                      className={cn(
                        'px-3 py-1.5 align-top',
                        index === 0 ? 'font-medium whitespace-nowrap text-parchment' : 'text-parchment/90',
                        column?.numeric && 'text-right whitespace-nowrap tabular-nums',
                      )}
                    >
                      {cell}
                    </Cell>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </details>
  )
}

export interface LegendSwatchProps {
  fill: string
  /** Ring statt Füllung (z. B. Ruhetag). */
  ring?: string
  label: ReactNode
}

/** Eintrag einer Legende: kleines Kästchen in der Farbe der Markierung, Text in Textfarbe. */
export function LegendSwatch({ fill, ring, label }: LegendSwatchProps) {
  return (
    <li className="inline-flex items-center gap-1.5">
      <span
        aria-hidden="true"
        className="inline-block size-2.5 shrink-0 rounded-[3px]"
        style={{ backgroundColor: fill, boxShadow: ring ? `inset 0 0 0 1.5px ${ring}` : undefined }}
      />
      <span>{label}</span>
    </li>
  )
}
