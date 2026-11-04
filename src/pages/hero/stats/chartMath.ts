/**
 * Reine Geometrie- und Achsen-Helfer für die handgemachten SVG-Diagramme der Statistik (ohne React).
 * Alle Koordinaten sind Pixel: Die Diagramme messen ihre Breite und zeichnen 1 : 1 (keine skalierte Schrift).
 */
import { addDays, compareDays } from '../../../domain/dates'
import type { DayKey } from '../../../domain/types'
import { formatNumber } from '../../../ui'

export interface Point {
  x: number
  y: number
}

/** „Schöne“ Schrittweite (1, 2, 2,5, 5 × 10ⁿ) für etwa `rough`. */
export function niceStep(rough: number): number {
  if (!Number.isFinite(rough) || rough <= 0) return 1
  const magnitude = 10 ** Math.floor(Math.log10(rough))
  const fraction = rough / magnitude
  const nice = fraction <= 1 ? 1 : fraction <= 2 ? 2 : fraction <= 2.5 ? 2.5 : fraction <= 5 ? 5 : 10
  return nice * magnitude
}

/**
 * Achsenwerte von 0 bis mindestens `max` in schönen, ganzzahligen Schritten – etwa `target` Intervalle.
 * `max ≤ 0` (noch keine Daten) → [0, minTop] mit `minTop` (Standard 10), damit die Achse nicht leer ist.
 */
export function niceTicks(max: number, target = 4, minTop = 10): number[] {
  const top = Number.isFinite(max) && max > 0 ? max : minTop
  // XP sind ganze Zahlen: 2,5 wird zu 2 (25, 250 … bleiben), alles unter 1 zu 1.
  const raw = niceStep(top / Math.max(1, target))
  const step = raw < 1 ? 1 : Number.isInteger(raw) ? raw : Math.floor(raw)
  const ticks: number[] = []
  for (let value = 0; value < top + step; value += step) {
    ticks.push(value)
    if (value >= top) break
  }
  return ticks
}

/**
 * Zahl für eine Achse: unter 10.000 ausgeschrieben („1.500“), darüber kompakt („12 Tsd.“, „1,2 Mio.“).
 * `Intl` kürzt im Deutschen erst ab einer Million – die Tausender kürzen wir selbst.
 */
export function formatAxisNumber(value: number): string {
  const abs = Math.abs(value)
  if (abs >= 1_000_000) return `${formatNumber(value / 1_000_000, { maximumFractionDigits: 1 })} Mio.`
  if (abs >= 10_000) return `${formatNumber(value / 1_000, { maximumFractionDigits: 1 })} Tsd.`
  return formatNumber(value)
}

/**
 * Pfad eines Balkens, der von der Grundlinie `baseline` nach oben wächst: oben abgerundet (`radius`), unten eckig.
 * Höhe 0 → leerer Pfad (kein Strich auf der Grundlinie).
 */
export function columnPath(x: number, width: number, baseline: number, height: number, radius = 4): string {
  if (!(height > 0) || !(width > 0)) return ''
  const r = Math.max(0, Math.min(radius, width / 2, height))
  const top = baseline - height
  const right = x + width
  return [
    `M${round(x)} ${round(baseline)}`,
    `V${round(top + r)}`,
    `Q${round(x)} ${round(top)} ${round(x + r)} ${round(top)}`,
    `H${round(right - r)}`,
    `Q${round(right)} ${round(top)} ${round(right)} ${round(top + r)}`,
    `V${round(baseline)}`,
    'Z',
  ].join('')
}

/** Polylinie durch die Punkte („M x y L x y …“); leer ohne Punkte. */
export function linePath(points: readonly Point[]): string {
  return points.map((p, i) => `${i === 0 ? 'M' : 'L'}${round(p.x)} ${round(p.y)}`).join('')
}

/** Fläche unter der Linie bis zur Grundlinie (für den zarten Schleier unter einem Linien-Diagramm). */
export function areaPath(points: readonly Point[], baseline: number): string {
  if (points.length === 0) return ''
  const first = points[0]
  const last = points[points.length - 1]
  return `${linePath(points)}L${round(last.x)} ${round(baseline)}L${round(first.x)} ${round(baseline)}Z`
}

/** Ecke `index` eines regelmäßigen Vielecks mit `count` Ecken: die erste oben, dann im Uhrzeigersinn. */
export function polygonVertex(index: number, count: number, center: Point, radius: number): Point {
  const angle = -Math.PI / 2 + (index * 2 * Math.PI) / Math.max(1, count)
  return { x: center.x + radius * Math.cos(angle), y: center.y + radius * Math.sin(angle) }
}

/** `points`-Attribut eines SVG-Polygons. */
export function polygonPoints(points: readonly Point[]): string {
  return points.map((p) => `${round(p.x)},${round(p.y)}`).join(' ')
}

/**
 * `n` möglichst gleichmäßig verteilte Indizes aus 0 … count−1, erster und letzter immer dabei (Achsen-Beschriftung).
 */
export function spreadIndexes(count: number, n: number): number[] {
  if (count <= 0) return []
  if (count === 1 || n <= 1) return [count - 1]
  const wanted = Math.min(count, Math.max(2, Math.floor(n)))
  const result: number[] = []
  for (let i = 0; i < wanted; i++) {
    const index = Math.round((i * (count - 1)) / (wanted - 1))
    if (result[result.length - 1] !== index) result.push(index)
  }
  return result
}

/** Kurze, gleich lange Monatsnamen für Achsen. */
export const MONTH_SHORT = ['Jan', 'Feb', 'Mär', 'Apr', 'Mai', 'Jun', 'Jul', 'Aug', 'Sep', 'Okt', 'Nov', 'Dez'] as const

function monthOf(day: DayKey): number {
  return Number(day.slice(5, 7)) - 1
}

/**
 * Monatsbeschriftungen über den Wochen-Spalten einer Heatmap: an der ersten Spalte, deren Woche (Mo–So) den
 * Monatsersten enthält. Steht eine Beschriftung näher als `minGap` Spalten an der vorigen (bzw. am linken Rand
 * eine angebrochene), entfällt die frühere – die jüngere ist wichtiger. Im Januar steht die Jahreszahl dabei.
 */
export function monthLabels(weekStarts: readonly DayKey[], minGap = 3): { index: number; label: string }[] {
  const labels: { index: number; label: string }[] = []
  weekStarts.forEach((monday, index) => {
    const sunday = addDays(monday, 6)
    // Enthält die Woche einen Monatsersten? (Montag im alten, Sonntag im neuen Monat – oder Montag selbst der 1.)
    const firstInWeek = monday.endsWith('-01') ? monday : monthOf(sunday) !== monthOf(monday) ? `${sunday.slice(0, 8)}01` : undefined
    if (firstInWeek === undefined && index !== 0) return
    const month = monthOf(firstInWeek ?? monday)
    const year = (firstInWeek ?? monday).slice(0, 4)
    const label = month === 0 ? `${MONTH_SHORT[0]} ${year}` : MONTH_SHORT[month]
    const previous = labels[labels.length - 1]
    if (previous && index - previous.index < minGap) labels.pop()
    labels.push({ index, label })
  })
  return labels
}

/** So weit (Pixel) darf ein Tooltip seitlich über die Diagrammfläche hinausragen – bis in den Kartenrand. */
export const TOOLTIP_OVERHANG = 8

/**
 * Linke Kante eines Tooltips der Breite `tooltipWidth`: mittig über dem Anker `x`, aber innerhalb der Fläche
 * (0 … `areaWidth`, plus `overhang` je Seite). Ist der Tooltip breiter als das, beginnt er am linken Rand.
 */
export function tooltipLeft(x: number, tooltipWidth: number, areaWidth: number, overhang = TOOLTIP_OVERHANG): number {
  const centered = x - tooltipWidth / 2
  const min = -overhang
  const max = areaWidth + overhang - tooltipWidth
  if (max < min) return min
  return Math.min(max, Math.max(min, centered))
}

/** Liegt `day` im Bereich [from, to] (beide inklusive)? */
export function dayWithin(day: DayKey, from: DayKey, to: DayKey): boolean {
  return compareDays(day, from) >= 0 && compareDays(day, to) <= 0
}

/** Auf Zehntelpixel gerundet – kürzere Pfade, keine Gleitkomma-Schwänze im DOM. */
function round(value: number): number {
  return Math.round(value * 10) / 10
}
