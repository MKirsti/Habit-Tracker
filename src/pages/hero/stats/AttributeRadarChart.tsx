import { Hexagon } from 'lucide-react'
import { ATTRIBUTES } from '../../../domain/attributes'
import type { AttributeRadar } from '../../../domain/statistics'
import { Card, formatNumber } from '../../../ui'
import { ChartSurface, ChartTooltip, DataTable, TooltipLabel, TooltipValue } from './ChartParts'
import { polygonPoints, polygonVertex } from './chartMath'
import type { Point } from './chartMath'
import { GOLD, GRID, SURFACE } from './chartTheme'
import { radarSummary } from './statsText'
import { useChartCursor } from './useChartCursor'
import { useChartWidth } from './useChartWidth'

/** Platz für die Beschriftung neben den seitlichen Ecken (Icon + Name, z. B. „🛡️ Disziplin“). */
const SIDE_LABEL = 84
/** Platz über der oberen und unter der unteren Ecke (zwei Zeilen). */
const CAP_LABEL = 40
const RINGS = [0.25, 0.5, 0.75, 1] as const

/**
 * Attribut-Radar: ein Sechseck, je Attribut eine Achse (Level + Fortschritt im Level, Rand = `radar.scale`).
 * Die Fläche in Gold, die Ecken als Punkte in der Attributfarbe; Namen und Level stehen direkt daneben.
 */
export function AttributeRadarChart({ radar }: { radar: AttributeRadar }) {
  const [measureRef, width] = useChartWidth<HTMLDivElement>()
  const { axes, scale } = radar
  const count = axes.length
  const radius = Math.max(56, Math.min(118, (width / 2 - 8 - SIDE_LABEL) / Math.cos(Math.PI / 6)))
  const chartWidth = Math.max(width, 2 * (radius * Math.cos(Math.PI / 6) + 8 + SIDE_LABEL))
  const height = 2 * radius + 2 * CAP_LABEL
  const center: Point = { x: chartWidth / 2, y: CAP_LABEL + radius }
  const vertex = (index: number, fraction: number) => polygonVertex(index, count, center, radius * fraction)
  const values = axes.map((axis, index) => vertex(index, Math.max(0.03, axis.value)))

  const cursor = useChartCursor({ count, initial: 0 })
  const active = cursor.active === null ? undefined : axes[cursor.active]
  const activeLabel = active
    ? `${ATTRIBUTES[active.id].name}: Level ${formatNumber(active.level)}, ${formatNumber(active.totalXp)} XP, ${formatNumber(
        Math.round(active.progress * 100),
      )} % bis Level ${formatNumber(active.level + 1)}`
    : undefined

  return (
    <Card
      title="Attribut-Radar"
      icon={<Hexagon />}
      subtitle={`Wie ausgewogen dein Held wächst – der Rand steht für Level ${formatNumber(scale)}.`}
      className="min-w-0"
    >
      <div ref={measureRef} className="flex min-w-0 justify-center">
        <ChartSurface
          cursor={cursor}
          label="Attribut-Radar – mit den Pfeiltasten Attribute wählen"
          summary={radarSummary(axes)}
          activeLabel={activeLabel}
          width={chartWidth}
          height={height}
          hitTest={(px, py) => {
            // Das Attribut, dessen Achse in Richtung des Zeigers zeigt (Sektoren um die Mitte).
            const dx = px - center.x
            const dy = py - center.y
            if (Math.hypot(dx, dy) < radius * 0.15) return undefined
            const angle = (Math.atan2(dy, dx) + Math.PI / 2 + 2 * Math.PI) % (2 * Math.PI)
            return Math.round(angle / ((2 * Math.PI) / count)) % count
          }}
          tooltip={
            active &&
            cursor.active !== null && (
              <ChartTooltip
                x={values[cursor.active].x}
                y={values[cursor.active].y}
                width={chartWidth}
                below={values[cursor.active].y < center.y - radius * 0.4}
              >
                <TooltipValue>
                  {ATTRIBUTES[active.id].name} · Level {formatNumber(active.level)}
                </TooltipValue>
                <TooltipLabel>{formatNumber(active.totalXp)} XP gesamt</TooltipLabel>
                <TooltipLabel>
                  {formatNumber(Math.round(active.progress * 100))} % bis Level {formatNumber(active.level + 1)}
                </TooltipLabel>
              </ChartTooltip>
            )
          }
        >
          {RINGS.map((ring) => (
            <polygon
              key={ring}
              points={polygonPoints(axes.map((_, index) => vertex(index, ring)))}
              fill="none"
              strokeWidth={1}
              style={{ stroke: GRID }}
            />
          ))}
          {axes.map((axis, index) => {
            const end = vertex(index, 1)
            return (
              <line
                key={axis.id}
                x1={center.x}
                y1={center.y}
                x2={end.x}
                y2={end.y}
                strokeWidth={1}
                style={{ stroke: GRID }}
              />
            )
          })}

          <polygon
            points={polygonPoints(values)}
            strokeWidth={2}
            strokeLinejoin="round"
            style={{ fill: 'color-mix(in srgb, var(--color-gold) 14%, transparent)', stroke: GOLD }}
          />

          {axes.map((axis, index) => {
            const meta = ATTRIBUTES[axis.id]
            const point = values[index]
            const isActive = cursor.active === index
            return (
              <circle
                key={axis.id}
                data-attribute={axis.id}
                cx={point.x}
                cy={point.y}
                r={isActive ? 6 : 4.5}
                strokeWidth={2}
                style={{ fill: meta.color, stroke: isActive ? 'var(--color-parchment)' : SURFACE }}
              />
            )
          })}

          {axes.map((axis, index) => {
            const meta = ATTRIBUTES[axis.id]
            const label = vertex(index, 1)
            const dx = label.x - center.x
            const anchor = Math.abs(dx) < 1 ? 'middle' : dx > 0 ? 'start' : 'end'
            const offsetX = anchor === 'middle' ? 0 : dx > 0 ? 10 : -10
            const isTop = label.y < center.y - radius * 0.9
            const isBottom = label.y > center.y + radius * 0.9
            const y = isTop ? label.y - 24 : isBottom ? label.y + 18 : label.y - 3
            return (
              <text
                key={axis.id}
                x={label.x + offsetX}
                y={y}
                textAnchor={anchor}
                className={cursor.active === index ? 'fill-parchment' : 'fill-parchment/90'}
              >
                <tspan className="text-[12px] font-semibold">
                  {meta.icon} {meta.name}
                </tspan>
                <tspan x={label.x + offsetX} dy={15} className="fill-muted text-[11px] tabular-nums">
                  Level {formatNumber(axis.level)}
                </tspan>
              </text>
            )
          })}
        </ChartSurface>
      </div>

      <DataTable
        caption="Attribute mit Level und XP"
        columns={[{ label: 'Attribut' }, { label: 'Level', numeric: true }, { label: 'XP', numeric: true }, { label: 'Fortschritt', numeric: true }]}
        rows={axes.map((axis) => ({
          key: axis.id,
          cells: [
            `${ATTRIBUTES[axis.id].icon} ${ATTRIBUTES[axis.id].name}`,
            formatNumber(axis.level),
            formatNumber(axis.totalXp),
            `${formatNumber(Math.round(axis.progress * 100))} %`,
          ],
        }))}
      />
    </Card>
  )
}
