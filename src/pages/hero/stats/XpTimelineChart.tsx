import { TrendingUp } from 'lucide-react'
import { useMemo } from 'react'
import { compareDays, diffDays, formatDay } from '../../../domain/dates'
import { statOn, xpTimeline } from '../../../domain/statistics'
import type { DayHistory, XpPoint } from '../../../domain/statistics'
import { Card, formatNumber, useSvgId } from '../../../ui'
import { ChartSurface, ChartTooltip, DataTable, TooltipLabel, TooltipValue } from './ChartParts'
import { MONTH_SHORT, areaPath, formatAxisNumber, linePath, niceTicks, spreadIndexes } from './chartMath'
import { AXIS, GOLD, GOLD_BRIGHT, GRID, SURFACE } from './chartTheme'
import { plural, xpTimelineSummary } from './statsText'
import { useChartCursor } from './useChartCursor'
import { useChartWidth } from './useChartWidth'

const PLOT_HEIGHT = 168
const TOP = 30
const AXIS_BAND = 26
const RIGHT = 6

interface TimelinePoint extends XpPoint {
  /** An diesem Tag ging es ein Level hinauf. */
  levelUp: boolean
}

/** Achsen-Datum: kurz ("3. Okt."), bei mehr als elf Monaten Verlauf Monat und Jahr ("Okt. 26"). */
function tickLabel(day: string, longRange: boolean): string {
  if (!longRange) return formatDay(day, 'short')
  return `${MONTH_SHORT[Number(day.slice(5, 7)) - 1]} ${day.slice(2, 4)}`
}

/**
 * XP-/Level-Verlauf: Gesamt-XP am Ende jedes Tages als Linie mit zartem Schleier, Level-Aufstiege als Punkte,
 * am Ende direkt beschriftet (XP und Level). Eine Achse – das Level steht an den Punkten und im Tooltip.
 */
export function XpTimelineChart({ history }: { history: DayHistory }) {
  const [measureRef, width] = useChartWidth<HTMLDivElement>()
  const gradientId = useSvgId('xp-area')
  const maxPoints = Math.max(20, Math.min(120, Math.floor(width / 4)))
  const series = useMemo(() => xpTimeline(history, maxPoints), [history, maxPoints])

  // Ausgedünnte Punkte plus alle Level-Aufstiege – so liegen die Aufstiegs-Punkte genau auf der Linie.
  const points: TimelinePoint[] = useMemo(() => {
    const upDays = new Set(series.levelUps.map((up) => up.day))
    const byDay = new Map<string, TimelinePoint>()
    for (const point of series.points) byDay.set(point.day, { ...point, levelUp: upDays.has(point.day) })
    for (const up of series.levelUps) {
      if (byDay.has(up.day)) continue
      const stat = statOn(history, up.day)
      if (stat) byDay.set(up.day, { day: up.day, totalXp: stat.totalXp, level: stat.level, levelUp: true })
    }
    return [...byDay.values()].sort((a, b) => compareDays(a.day, b.day))
  }, [series, history])

  const first = points[0]
  const last = points[points.length - 1]
  const span = first && last ? Math.max(1, diffDays(first.day, last.day)) : 1
  const ticks = niceTicks(last?.totalXp ?? 0, 4, 100)
  const top = ticks[ticks.length - 1]
  const left = Math.max(...ticks.map((tick) => formatAxisNumber(tick).length)) * 6.5 + 10
  const plotWidth = Math.max(120, width - left - RIGHT)
  const baseline = TOP + PLOT_HEIGHT
  const height = baseline + AXIS_BAND
  const x = (day: string) => left + (first ? (diffDays(first.day, day) / span) * plotWidth : 0)
  const y = (xp: number) => baseline - (xp / top) * PLOT_HEIGHT
  const coords = points.map((point) => ({ x: x(point.day), y: y(point.totalXp) }))
  const longRange = span > 330
  const tickIndexes = spreadIndexes(points.length, width >= 480 ? 5 : 3)

  const cursor = useChartCursor({ count: points.length, initial: points.length - 1 })
  const active = cursor.active === null ? undefined : points[cursor.active]
  const activeCoord = cursor.active === null ? undefined : coords[cursor.active]
  const activeLabel = active
    ? `${formatDay(active.day, 'long')}: ${formatNumber(active.totalXp)} XP, Level ${formatNumber(active.level)}${
        active.levelUp ? ' – Level-Aufstieg' : ''
      }`
    : undefined

  const enough = points.length >= 2
  const ups = series.levelUps.length

  return (
    <Card
      title="XP- & Level-Verlauf"
      icon={<TrendingUp />}
      subtitle={
        enough && last
          ? `${formatNumber(last.totalXp)} XP · Level ${formatNumber(last.level)}${ups > 0 ? ` · ${plural(ups, 'Aufstieg', 'Aufstiege')}` : ''}`
          : 'Dein Verlauf beginnt heute.'
      }
      className="min-w-0"
    >
      <div ref={measureRef} className="min-w-0">
        {!enough || !first || !last ? (
          <p className="rounded-xl border border-dashed border-border px-4 py-8 text-center text-sm text-muted">
            Ab morgen zeichnet sich hier die Linie deines Aufstiegs ab.
          </p>
        ) : (
          <ChartSurface
            cursor={cursor}
            label="XP- und Level-Verlauf – mit den Pfeiltasten Tage wählen"
            summary={xpTimelineSummary(series)}
            activeLabel={activeLabel}
            width={Math.max(width, left + plotWidth + RIGHT)}
            height={height}
            hitTest={(px) => {
              // Fadenkreuz: der Punkt, dessen Tag dem Zeiger am nächsten liegt.
              let nearest = 0
              for (let i = 1; i < coords.length; i++) {
                if (Math.abs(coords[i].x - px) < Math.abs(coords[nearest].x - px)) nearest = i
              }
              return nearest
            }}
            tooltip={
              active &&
              activeCoord && (
                <ChartTooltip x={activeCoord.x} y={activeCoord.y} width={width} below={activeCoord.y < TOP + 50}>
                  <TooltipValue>{formatNumber(active.totalXp)} XP</TooltipValue>
                  <TooltipLabel>
                    Level {formatNumber(active.level)}
                    {active.levelUp ? ' – Aufstieg!' : ''}
                  </TooltipLabel>
                  <TooltipLabel>{formatDay(active.day, 'long')}</TooltipLabel>
                </ChartTooltip>
              )
            }
          >
            <defs>
              <linearGradient id={gradientId} x1="0" x2="0" y1="0" y2="1">
                <stop offset="0%" stopColor="var(--color-gold)" stopOpacity={0.16} />
                <stop offset="100%" stopColor="var(--color-gold)" stopOpacity={0.02} />
              </linearGradient>
            </defs>
            {ticks.map((tick) => (
              <g key={tick}>
                <line
                  x1={left}
                  x2={left + plotWidth}
                  y1={y(tick)}
                  y2={y(tick)}
                  strokeWidth={1}
                  style={{ stroke: tick === 0 ? AXIS : GRID }}
                  shapeRendering="crispEdges"
                />
                <text
                  x={left - 8}
                  y={y(tick)}
                  textAnchor="end"
                  dominantBaseline="central"
                  className="fill-muted text-[11px] tabular-nums"
                >
                  {formatAxisNumber(tick)}
                </text>
              </g>
            ))}
            {tickIndexes.map((index, position) => {
              const point = points[index]
              const anchor = position === 0 ? 'start' : position === tickIndexes.length - 1 ? 'end' : 'middle'
              return (
                <text
                  key={point.day}
                  x={coords[index].x}
                  y={baseline + 17}
                  textAnchor={anchor}
                  className="fill-muted text-[11px]"
                >
                  {tickLabel(point.day, longRange)}
                </text>
              )
            })}

            <path d={areaPath(coords, baseline)} fill={`url(#${gradientId})`} />
            <path
              d={linePath(coords)}
              fill="none"
              strokeWidth={2}
              strokeLinejoin="round"
              strokeLinecap="round"
              style={{ stroke: GOLD }}
            />

            {activeCoord && (
              <line
                x1={activeCoord.x}
                x2={activeCoord.x}
                y1={TOP - 6}
                y2={baseline}
                strokeWidth={1}
                className="stroke-parchment/40"
                shapeRendering="crispEdges"
              />
            )}

            {points.map((point, index) =>
              point.levelUp ? (
                <circle
                  key={point.day}
                  data-level-up={point.level}
                  cx={coords[index].x}
                  cy={coords[index].y}
                  r={3.5}
                  strokeWidth={2}
                  style={{ fill: GOLD_BRIGHT, stroke: SURFACE }}
                />
              ) : null,
            )}

            {/* Ende: Punkt und direkte Beschriftung (XP · Level). */}
            <circle
              cx={coords[coords.length - 1].x}
              cy={coords[coords.length - 1].y}
              r={4.5}
              strokeWidth={2}
              style={{ fill: GOLD_BRIGHT, stroke: SURFACE }}
            />
            <text
              x={coords[coords.length - 1].x - 8}
              y={coords[coords.length - 1].y - 12}
              textAnchor="end"
              className="fill-parchment text-[12px] font-semibold tabular-nums"
            >
              {formatNumber(last.totalXp)} XP · Level {formatNumber(last.level)}
            </text>

            {activeCoord && (
              <circle cx={activeCoord.x} cy={activeCoord.y} r={5} strokeWidth={2} className="fill-gold-bright stroke-parchment" />
            )}
          </ChartSurface>
        )}
      </div>

      {enough && (
        <DataTable
          caption="Gesamt-XP und Level im Verlauf, neueste zuerst"
          columns={[{ label: 'Tag' }, { label: 'Gesamt-XP', numeric: true }, { label: 'Level', numeric: true }]}
          rows={[...points].reverse().map((point) => ({
            key: point.day,
            cells: [
              formatDay(point.day, 'short') + (point.day.slice(0, 4) !== last?.day.slice(0, 4) ? ` ${point.day.slice(0, 4)}` : ''),
              formatNumber(point.totalXp),
              `${formatNumber(point.level)}${point.levelUp ? ' ⬆' : ''}`,
            ],
          }))}
        />
      )}
    </Card>
  )
}
