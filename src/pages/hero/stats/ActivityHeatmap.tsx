import { CalendarDays } from 'lucide-react'
import { useMemo, useState } from 'react'
import { ATTRIBUTES } from '../../../domain/attributes'
import { formatDay, isoWeekday } from '../../../domain/dates'
import { isArchivedOn } from '../../../domain/schedule'
import { habitHeatmap, heatmap } from '../../../domain/statistics'
import type { DayHistory, HabitHeatmapCell, HeatmapCell } from '../../../domain/statistics'
import type { DayKey, GameData, Habit } from '../../../domain/types'
import { Card, Select, formatNumber } from '../../../ui'
import type { SelectOption } from '../../../ui'
import { ChartSurface, ChartTooltip, DataTable, LegendSwatch, TooltipLabel, TooltipValue } from './ChartParts'
import { monthLabels } from './chartMath'
import { FREEZE_RING, GOLD_BRIGHT, HEAT_EMPTY, HEAT_FAINT, REST_RING, TODAY_RING, heatFill } from './chartTheme'
import {
  SCORE_LABELS,
  dayStatDetails,
  habitCellLabel,
  habitDayDetails,
  habitHeatmapSummary,
  heatCellLabel,
  heatmapSummary,
  shortDayLabel,
} from './statsText'
import { useChartCursor } from './useChartCursor'
import { useChartWidth } from './useChartWidth'

export interface ActivityHeatmapProps {
  history: DayHistory
  data: GameData
  today: DayKey
}

const ALL = 'all'
/** Platz für die Wochentage links und die Monate oben. */
const LABEL_WIDTH = 24
const TOP_HEIGHT = 18
/** Ab dieser Breite (Pixel) zeigt die Heatmap ein ganzes Jahr, sonst ein halbes. */
const WIDE_FROM = 600
const HEATMAP_WEEKS = { narrow: 26, wide: 52 } as const
const DAY_LABELS: { row: number; label: string }[] = [
  { row: 0, label: 'Mo' },
  { row: 2, label: 'Mi' },
  { row: 4, label: 'Fr' },
  { row: 6, label: 'So' },
]

/** Was eine Zelle zeigt – gleich für die Heatmap aller Quests und die einer Quest. */
interface CellView {
  day: DayKey
  /** `undefined` = nicht gezeichnet (Zukunft). */
  fill?: string
  ring?: string
  selectable: boolean
  /** Tooltip: Wert-Zeile. */
  details: string
  /** Vollständige Beschriftung (Vorlesen). */
  label: string
}

function allCellView(cell: HeatmapCell, today: DayKey): CellView {
  if (cell.kind === 'future') return { day: cell.day, selectable: false, details: '', label: '' }
  if (cell.kind === 'outside' || !cell.stat) {
    return { day: cell.day, fill: HEAT_FAINT, selectable: false, details: '', label: heatCellLabel(cell, today) }
  }
  const { stat } = cell
  const ring = cell.day === today ? TODAY_RING : stat.frozen ? FREEZE_RING : stat.rest ? REST_RING : undefined
  return {
    day: cell.day,
    fill: heatFill(cell.level),
    ring,
    selectable: true,
    details: dayStatDetails(stat, today),
    label: heatCellLabel(cell, today),
  }
}

function habitCellView(cell: HabitHeatmapCell, habit: Habit, accent: string, today: DayKey): CellView {
  if (cell.state === 'future') return { day: cell.day, selectable: false, details: '', label: '' }
  let fill: string
  switch (cell.state) {
    case 'done':
    case 'partial':
      fill = heatFill(cell.level, accent)
      break
    case 'missed':
    case 'open':
      fill = HEAT_EMPTY
      break
    default:
      fill = HEAT_FAINT
  }
  const ring = cell.day === today ? TODAY_RING : cell.state === 'rest' ? REST_RING : undefined
  return {
    day: cell.day,
    fill,
    ring,
    selectable: true,
    details: habitDayDetails(cell, habit, today),
    label: habitCellLabel(cell, habit, today),
  }
}

/** Quests für die Auswahl: laufende in Listen-Reihenfolge, danach archivierte. */
function habitOptions(habits: readonly Habit[], today: DayKey): SelectOption<string>[] {
  const sorted = [...habits].sort(
    (a, b) =>
      Number(isArchivedOn(a, today)) - Number(isArchivedOn(b, today)) ||
      a.order - b.order ||
      a.title.localeCompare(b.title, 'de'),
  )
  return [
    { value: ALL, label: 'Alle Quests' },
    ...sorted.map((habit) => ({
      value: habit.id,
      label: `${habit.icon} ${habit.title}${isArchivedOn(habit, today) ? ' (archiviert)' : ''}`,
    })),
  ]
}

/**
 * Heatmap „Aktivität“: ein Feld pro Tag, Wochen als Spalten (Mo oben), auf dem Handy 26, ab genug Breite 52
 * Wochen. Alle Quests: Gold nach Tageswertung (perfekt leuchtet am hellsten). Eine Quest: ihre Attributfarbe.
 */
export function ActivityHeatmap({ history, data, today }: ActivityHeatmapProps) {
  const [measureRef, width] = useChartWidth<HTMLDivElement>()
  const weeks = width >= WIDE_FROM ? HEATMAP_WEEKS.wide : HEATMAP_WEEKS.narrow
  const [selected, setSelected] = useState<string>(ALL)
  const habit = selected === ALL ? undefined : data.habits.find((candidate) => candidate.id === selected)
  const accent = habit ? ATTRIBUTES[habit.attribute]?.color ?? GOLD_BRIGHT : GOLD_BRIGHT

  const allCells = useMemo(() => heatmap(history, weeks), [history, weeks])
  const habitCells = useMemo(
    () => (habit ? habitHeatmap(data, habit.id, today, weeks) : undefined),
    [data, habit, today, weeks],
  )
  const columns: CellView[][] = useMemo(
    () =>
      habit && habitCells
        ? habitCells.map((week) => week.map((cell) => habitCellView(cell, habit, accent, today)))
        : allCells.map((week) => week.map((cell) => allCellView(cell, today))),
    [habit, habitCells, allCells, accent, today],
  )
  const flat = useMemo(() => columns.flat(), [columns])
  const summary = habit && habitCells ? habitHeatmapSummary(habitCells, habit, weeks) : heatmapSummary(allCells, weeks)

  // Geometrie in Pixeln: Spaltenbreite aus der gemessenen Breite, gedeckelt (große Bildschirme) und mit Mindestmaß.
  const column = Math.max(8, Math.min(18, Math.floor((width - LABEL_WIDTH) / weeks)))
  const gap = column >= 13 ? 3 : 2
  const size = column - gap
  const svgWidth = LABEL_WIDTH + weeks * column - gap
  const svgHeight = TOP_HEIGHT + 7 * column - gap
  const months = monthLabels(columns.map((week) => week[0]?.day ?? today))

  const todayIndex = (columns.length - 1) * 7 + (isoWeekday(today) - 1)
  const cursor = useChartCursor({
    count: flat.length,
    initial: todayIndex,
    selectable: (index) => flat[index]?.selectable === true,
    move: (index, key) => {
      switch (key) {
        case 'ArrowLeft':
          return index - 7
        case 'ArrowRight':
          return index + 7
        case 'ArrowUp':
          return index - 1
        case 'ArrowDown':
          return index + 1
        case 'Home':
          return Math.max(0, flat.findIndex((cell) => cell.selectable))
        case 'End':
          return todayIndex
        default:
          return undefined
      }
    },
  })
  const active = cursor.active === null ? undefined : flat[cursor.active]
  const activeColumn = cursor.active === null ? 0 : Math.floor(cursor.active / 7)
  const activeRow = cursor.active === null ? 0 : cursor.active % 7

  const tableRows = useMemo(
    () =>
      [...flat]
        .filter((cell) => cell.selectable)
        .reverse()
        .map((cell) => ({ key: cell.day, cells: [shortDayLabel(cell.day), cell.details] })),
    [flat],
  )
  const allTableRows = useMemo(
    () =>
      allCells
        .flat()
        .flatMap(({ day, stat }) =>
          stat
            ? [
                {
                  key: day,
                  cells: [
                    shortDayLabel(day),
                    `${SCORE_LABELS[stat.score]}${stat.frozen ? ' · ❄️ Streak-Schutz' : ''}${day === today ? ' (heute)' : ''}`,
                    stat.required > 0 ? `${formatNumber(stat.requiredDone)} / ${formatNumber(stat.required)}` : '–',
                    formatNumber(stat.xp),
                  ],
                },
              ]
            : [],
        )
        .reverse(),
    [allCells, today],
  )

  return (
    <Card
      title="Aktivität"
      icon={<CalendarDays />}
      subtitle="Ein Feld pro Tag – je heller, desto mehr geschafft. Perfekte Tage leuchten golden."
      className="min-w-0"
    >
      <Select
        label="Zeigen"
        value={habit ? habit.id : ALL}
        onChange={setSelected}
        options={habitOptions(data.habits, today)}
        fieldClassName="mb-4 sm:max-w-xs"
      />

      <div ref={measureRef} className="min-w-0">
        <ChartSurface
          cursor={cursor}
          label={`Aktivität ${habit ? `„${habit.title}“` : 'aller Quests'} – mit den Pfeiltasten Tage wählen`}
          summary={summary}
          activeLabel={active?.label}
          width={svgWidth}
          height={svgHeight}
          hitTest={(x, y) => {
            const c = Math.floor((x - LABEL_WIDTH) / column)
            const r = Math.floor((y - TOP_HEIGHT) / column)
            if (c < 0 || c >= columns.length || r < 0 || r > 6) return undefined
            return c * 7 + r
          }}
          tooltip={
            active && (
              <ChartTooltip
                x={LABEL_WIDTH + activeColumn * column + size / 2}
                y={TOP_HEIGHT + activeRow * column}
                width={svgWidth}
              >
                <TooltipValue>{active.details}</TooltipValue>
                <TooltipLabel>{formatDay(active.day, 'long')}</TooltipLabel>
              </ChartTooltip>
            )
          }
        >
          {months.map(({ index, label }) => (
            <text
              key={`${index}-${label}`}
              x={LABEL_WIDTH + index * column}
              y={11}
              className="fill-muted text-[11px]"
            >
              {label}
            </text>
          ))}
          {DAY_LABELS.map(({ row, label }) => (
            <text
              key={label}
              x={0}
              y={TOP_HEIGHT + row * column + size / 2}
              dominantBaseline="central"
              className="fill-muted text-[10px]"
            >
              {label}
            </text>
          ))}
          {columns.map((week, c) =>
            week.map((cell, r) =>
              cell.fill === undefined ? null : (
                <rect
                  key={cell.day}
                  data-day={cell.day}
                  x={LABEL_WIDTH + c * column}
                  y={TOP_HEIGHT + r * column}
                  width={size}
                  height={size}
                  rx={size >= 10 ? 2.5 : 2}
                  style={{ fill: cell.fill }}
                />
              ),
            ),
          )}
          {/* Ringe (Ruhetag, Streak-Schutz, heute) innen in der Zelle – sie verdecken die Füllung nicht. */}
          {columns.map((week, c) =>
            week.map((cell, r) =>
              cell.ring === undefined || cell.fill === undefined ? null : (
                <rect
                  key={`ring-${cell.day}`}
                  x={LABEL_WIDTH + c * column + 0.75}
                  y={TOP_HEIGHT + r * column + 0.75}
                  width={size - 1.5}
                  height={size - 1.5}
                  rx={size >= 10 ? 2 : 1.5}
                  fill="none"
                  strokeWidth={1.5}
                  style={{ stroke: cell.ring }}
                />
              ),
            ),
          )}
          {active && (
            <rect
              x={LABEL_WIDTH + activeColumn * column - 1.5}
              y={TOP_HEIGHT + activeRow * column - 1.5}
              width={size + 3}
              height={size + 3}
              rx={3.5}
              fill="none"
              strokeWidth={1.5}
              className="stroke-parchment"
            />
          )}
        </ChartSurface>
      </div>

      <HeatmapLegend accent={habit ? accent : undefined} />

      {habit ? (
        <DataTable
          caption={`Tage von „${habit.title}“, neueste zuerst`}
          columns={[{ label: 'Tag' }, { label: 'Stand' }]}
          rows={tableRows}
        />
      ) : (
        <DataTable
          caption="Deine Tage, neueste zuerst"
          columns={[{ label: 'Tag' }, { label: 'Wertung' }, { label: 'Tagesquests', numeric: true }, { label: 'XP', numeric: true }]}
          rows={allTableRows}
        />
      )}
    </Card>
  )
}

/** Legende: Skala (weniger → mehr) bzw. die Zustände einer Quest, dazu die Ringe. */
function HeatmapLegend({ accent }: { accent?: string }) {
  if (accent !== undefined) {
    return (
      <ul aria-label="Legende" className="mt-3 flex flex-wrap gap-x-4 gap-y-1.5 text-xs text-muted">
        <LegendSwatch fill={heatFill(4, accent)} label="Erledigt" />
        <LegendSwatch fill={heatFill(2, accent)} label="Teilfortschritt" />
        <LegendSwatch fill={HEAT_EMPTY} label="Fällig, nicht erledigt" />
        <LegendSwatch fill={HEAT_FAINT} label="Kein Plantag" />
        <LegendSwatch fill={HEAT_FAINT} ring={REST_RING} label="Ruhetag" />
        <LegendSwatch fill={HEAT_EMPTY} ring={TODAY_RING} label="Heute" />
      </ul>
    )
  }
  return (
    <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-1.5 text-xs text-muted">
      <div className="inline-flex items-center gap-1.5">
        <span>Weniger</span>
        <ul aria-label="Skala von wenig bis alles geschafft" className="inline-flex gap-[3px]">
          {([0, 1, 2, 3, 4] as const).map((level) => (
            <li key={level} aria-label={LEVEL_NAMES[level]} className="inline-flex">
              <span aria-hidden="true" className="size-2.5 rounded-[3px]" style={{ backgroundColor: heatFill(level) }} />
            </li>
          ))}
        </ul>
        <span>Mehr</span>
      </div>
      <ul aria-label="Markierungen" className="flex flex-wrap gap-x-4 gap-y-1.5">
        <LegendSwatch fill={HEAT_EMPTY} ring={REST_RING} label="Ruhetag" />
        <LegendSwatch fill={HEAT_EMPTY} ring={FREEZE_RING} label="Streak-Schutz" />
        <LegendSwatch fill={HEAT_EMPTY} ring={TODAY_RING} label="Heute" />
      </ul>
    </div>
  )
}

const LEVEL_NAMES = [
  'Nichts erledigt',
  'Ein Anfang',
  'Gut geschafft',
  'Gut geschafft, fast alles',
  'Perfekter Tag',
] as const
