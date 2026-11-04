import { ChartColumn } from 'lucide-react'
import { useMemo } from 'react'
import { weeklyXp } from '../../../domain/statistics'
import type { DayHistory } from '../../../domain/statistics'
import { Card, formatNumber } from '../../../ui'
import { ChartSurface, ChartTooltip, DataTable, TooltipLabel, TooltipValue } from './ChartParts'
import { columnPath, formatAxisNumber, niceTicks } from './chartMath'
import { AXIS, GOLD, GOLD_BRIGHT, GRID } from './chartTheme'
import { weekRangeLabel, weekTickLabel, weekXpSources, weeklySubtitle, weeklySummary, weeklyXpSummary } from './statsText'
import { useChartCursor } from './useChartCursor'
import { useChartWidth } from './useChartWidth'

export const WEEKLY_XP_WEEKS = 12

const PLOT_HEIGHT = 168
const TOP = 20
const AXIS_BAND = 26
const RIGHT = 4

/** XP pro Woche der letzten 12 Wochen als Säulen; die laufende Woche heller, weil sie noch wächst. */
export function WeeklyXpChart({ history }: { history: DayHistory }) {
  const [measureRef, width] = useChartWidth<HTMLDivElement>()
  const weeks = useMemo(() => weeklyXp(history, WEEKLY_XP_WEEKS), [history])
  const { best } = weeklySummary(weeks)
  const max = Math.max(0, ...weeks.map((week) => week.xp))
  const ticks = niceTicks(max, 4, 100)
  const top = ticks[ticks.length - 1]

  // Linker Rand passend zur längsten Achsenbeschriftung (ca. 6,5 px je Zeichen bei 11 px).
  const left = Math.max(...ticks.map((tick) => formatAxisNumber(tick).length)) * 6.5 + 10
  const plotWidth = Math.max(120, width - left - RIGHT)
  const band = plotWidth / weeks.length
  const barWidth = Math.min(24, Math.max(6, band * 0.62))
  const baseline = TOP + PLOT_HEIGHT
  const height = baseline + AXIS_BAND
  const y = (value: number) => baseline - (value / top) * PLOT_HEIGHT
  const barX = (index: number) => left + index * band + (band - barWidth) / 2
  // Jede zweite Woche beschriften, wenn es eng wird – die laufende (rechts) immer.
  const labelEvery = band >= 38 ? 1 : 2

  const cursor = useChartCursor({ count: weeks.length, initial: weeks.length - 1 })
  const active = cursor.active === null ? undefined : weeks[cursor.active]
  const activeLabel = active
    ? `${active.current ? 'Diese Woche' : `Woche ${weekRangeLabel(active.weekStart)}`}: ${formatNumber(active.xp)} XP${
        active.xp > 0 ? ` (${weekXpSources(active)})` : ''
      }${active.current ? ', läuft noch' : ''}`
    : undefined

  return (
    <Card
      title="XP pro Woche"
      icon={<ChartColumn />}
      subtitle={weeklySubtitle(weeks, history.from)}
      className="min-w-0"
    >
      <div ref={measureRef} className="min-w-0">
        <ChartSurface
          cursor={cursor}
          label="XP pro Woche – mit den Pfeiltasten Wochen wählen"
          summary={weeklyXpSummary(weeks, history.from)}
          activeLabel={activeLabel}
          width={Math.max(width, left + plotWidth + RIGHT)}
          height={height}
          hitTest={(x) => {
            const index = Math.floor((x - left) / band)
            return index >= 0 && index < weeks.length ? index : undefined
          }}
          tooltip={
            active &&
            cursor.active !== null && (
              <ChartTooltip x={barX(cursor.active) + barWidth / 2} y={Math.min(y(active.xp), baseline - 8)} width={width}>
                <TooltipValue>{formatNumber(active.xp)} XP</TooltipValue>
                {active.xp > 0 && <TooltipLabel>{weekXpSources(active)}</TooltipLabel>}
                <TooltipLabel>
                  {active.current ? `Diese Woche (${weekRangeLabel(active.weekStart)}) – läuft noch` : weekRangeLabel(active.weekStart)}
                </TooltipLabel>
              </ChartTooltip>
            )
          }
        >
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

          {weeks.map((week, index) => {
            const isActive = cursor.active === index
            const barHeight = (week.xp / top) * PLOT_HEIGHT
            const showValue = week.xp > 0 && (week === best || week.current)
            const showTick = (weeks.length - 1 - index) % labelEvery === 0
            return (
              <g key={week.weekStart} data-week={week.weekStart}>
                <path
                  d={columnPath(barX(index), barWidth, baseline, barHeight)}
                  style={{ fill: isActive ? GOLD_BRIGHT : GOLD, opacity: week.current && !isActive ? 0.55 : 1 }}
                />
                {showValue && (
                  <text
                    x={barX(index) + barWidth / 2}
                    y={baseline - barHeight - 6}
                    textAnchor="middle"
                    className="fill-parchment text-[11px] font-medium tabular-nums"
                  >
                    {formatAxisNumber(week.xp)}
                  </text>
                )}
                {showTick && (
                  <text
                    x={barX(index) + barWidth / 2}
                    y={baseline + 17}
                    textAnchor="middle"
                    className={week.current ? 'fill-parchment text-[11px] font-medium' : 'fill-muted text-[11px]'}
                  >
                    {week.current ? 'jetzt' : weekTickLabel(week.weekStart)}
                  </text>
                )}
              </g>
            )
          })}
        </ChartSurface>
      </div>

      <DataTable
        caption="XP pro Woche, neueste zuerst"
        columns={[{ label: 'Woche' }, { label: 'XP', numeric: true }, { label: 'Herkunft' }]}
        rows={[...weeks].reverse().map((week) => ({
          key: week.weekStart,
          cells: [
            `${weekRangeLabel(week.weekStart)}${week.current ? ' (läuft)' : ''}`,
            formatNumber(week.xp),
            weekXpSources(week) || '–',
          ],
        }))}
      />
    </Card>
  )
}
