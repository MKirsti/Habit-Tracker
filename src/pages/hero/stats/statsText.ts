/**
 * Deutsche Texte der Statistik (Du-Form, warm, nie beschämend): Beschriftungen für Heatmap-Zellen, Tooltips und
 * die vorgelesenen Zusammenfassungen der Diagramme. Rein, ohne React.
 */
import { ATTRIBUTES } from '../../../domain/attributes'
import { addDays, compareDays, formatDay } from '../../../domain/dates'
import type { DayStat, HabitHeatmapCell, HeatmapCell, RadarAxis, WeekXp, XpTimelineSeries } from '../../../domain/statistics'
import type { DayKey, DayScore, Habit } from '../../../domain/types'
import { formatNumber } from '../../../ui'

/** „1 Tag“ / „3 Tage“ – Zahl de-DE formatiert, Singular nur bei genau 1. */
export function plural(n: number, one: string, many: string): string {
  return `${formatNumber(n)} ${n === 1 ? one : many}`
}

/** Messwert: höchstens zwei Nachkommastellen ("2,5"). */
function formatValue(value: number): string {
  return formatNumber(value, { maximumFractionDigits: 2 })
}

/** Name der Tageswertung (Heatmap, Tabelle). */
export const SCORE_LABELS: Record<DayScore, string> = {
  perfect: 'Perfekter Tag',
  good: 'Gut geschafft',
  weak: 'Ein Anfang',
  missed: 'Nichts erledigt',
  rest: 'Ruhetag',
  none: 'Keine Tagesquests',
  absent: 'Pause',
}

/**
 * Wertungen, bei denen die Anzahl erledigter Tagesquests etwas aussagt. Ein Tag in der Durchhänger-Pause (`absent`)
 * zeigt sie nur, wenn etwas erledigt war – ein ganz leerer Pausentag bleibt einfach „Pause“.
 */
const COUNTED_SCORES: ReadonlySet<DayScore> = new Set(['perfect', 'good', 'weak', 'missed'])

/** Kurzer Tag für Tabellen: "Di, 3. Nov." */
export function shortDayLabel(day: DayKey): string {
  const weekday = formatDay(day, 'long').split(',')[0].slice(0, 2)
  return `${weekday}, ${formatDay(day, 'short')}`
}

/**
 * Was an einem Tag los war – für Tooltip und Tabelle (ohne Datum), z. B.
 * "Perfekter Tag · 4 von 4 Tagesquests · +85 XP", "Ein Anfang · 0 von 3 Tagesquests, dafür 1 andere Quest · +10 XP"
 * (nur eine Wochenquest), "Pause · 1 von 3 Tagesquests · +10 XP · der Schaden ruht" (Durchhänger-Pause) oder
 * "Heute · 1 von 3 Tagesquests · läuft noch".
 */
export function dayStatDetails(stat: DayStat, today: DayKey): string {
  const isToday = stat.day === today
  // Heute ist noch nichts entschieden – außer, er ist schon perfekt.
  const parts: string[] = [isToday && stat.score !== 'perfect' && stat.score !== 'rest' ? 'Heute' : SCORE_LABELS[stat.score]]
  const counted = COUNTED_SCORES.has(stat.score) || (stat.score === 'absent' && stat.done > 0)
  if (counted && stat.required > 0) {
    const daily = `${formatNumber(stat.requiredDone)} von ${plural(stat.required, 'Tagesquest', 'Tagesquests')}`
    // Keine Tagesquest, aber eine andere Quest (etwa eine Wochenquest) – deshalb „Ein Anfang“ statt „Nichts erledigt“.
    const others = stat.requiredDone === 0 && stat.done > 0 ? `, dafür ${plural(stat.done, 'andere Quest', 'andere Quests')}` : ''
    parts.push(`${daily}${others}`)
  } else if (stat.done > 0) {
    parts.push(`${plural(stat.done, 'Quest', 'Quests')} erledigt`)
  }
  if (stat.xp > 0) parts.push(`+${formatNumber(stat.xp)} XP`)
  if (stat.frozen) parts.push('❄️ vom Streak-Schutz aufgefangen')
  if (stat.score === 'absent' && !isToday) parts.push('der Schaden ruht')
  if (stat.defeat) parts.push('Niederlage – und wieder aufgestanden')
  if (isToday && stat.score !== 'perfect') parts.push('läuft noch')
  else if (stat.open && !isToday && stat.score !== 'perfect' && stat.score !== 'rest' && stat.score !== 'none') {
    parts.push('noch nachtragbar')
  }
  return parts.join(' · ')
}

/** Vollständige Beschriftung einer Zelle der Heatmap aller Quests (Tooltip, Vorlesen). */
export function heatCellLabel(cell: HeatmapCell, today: DayKey): string {
  const date = formatDay(cell.day, 'long')
  if (cell.kind === 'outside' || !cell.stat) return `${date} – vor Beginn deines Abenteuers`
  return `${date} – ${dayStatDetails(cell.stat, today)}`
}

/** Was eine Quest an einem Tag gemacht hat – ohne Datum, z. B. "erledigt · 12 / 10 Seiten". */
export function habitDayDetails(cell: HabitHeatmapCell, habit: Habit, today: DayKey): string {
  const amount = habit.measure ? ` · ${formatValue(cell.value)} / ${formatValue(cell.target)} ${habit.measure.unit}` : ''
  switch (cell.state) {
    case 'done':
      return `erledigt${amount}`
    case 'partial':
      return `Teilfortschritt${amount}`
    case 'missed':
      return 'nicht erledigt'
    case 'open':
      return cell.day === today ? 'heute noch offen' : 'noch nachtragbar'
    case 'free':
      return 'kein Plantag'
    case 'rest':
      return 'Ruhetag'
    case 'inactive':
      return 'Quest nicht aktiv'
    case 'future':
      return 'noch nicht erreicht'
  }
}

/** Vollständige Beschriftung einer Zelle der Heatmap einer Quest. */
export function habitCellLabel(cell: HabitHeatmapCell, habit: Habit, today: DayKey): string {
  return `${formatDay(cell.day, 'long')} – ${habitDayDetails(cell, habit, today)}`
}

/** "letzte 26 Wochen" */
export function weeksLabel(weeks: number): string {
  return `letzte ${formatNumber(weeks)} Wochen`
}

function capitalize(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1)
}

/** Zusammenfassung der Heatmap aller Quests für Screenreader – zählt, was geschafft wurde. */
export function heatmapSummary(cells: readonly (readonly HeatmapCell[])[], weeks: number): string {
  let perfect = 0
  let good = 0
  let weak = 0
  let rest = 0
  let frozen = 0
  for (const cell of cells.flat()) {
    if (!cell.stat) continue
    const { score } = cell.stat
    if (score === 'perfect') perfect++
    else if (score === 'good') good++
    else if (score === 'weak') weak++
    else if (score === 'rest') rest++
    if (cell.stat.frozen) frozen++
  }
  const parts = [
    perfect > 0 ? plural(perfect, 'perfekter Tag', 'perfekte Tage') : '',
    good > 0 ? plural(good, 'guter Tag', 'gute Tage') : '',
    weak > 0 ? `${plural(weak, 'Tag', 'Tage')} mit ersten Schritten` : '',
    rest > 0 ? plural(rest, 'Ruhetag', 'Ruhetage') : '',
    frozen > 0 ? `${plural(frozen, 'Tag', 'Tage')} vom Streak-Schutz aufgefangen` : '',
  ].filter((part) => part !== '')
  const range = capitalize(weeksLabel(weeks))
  return parts.length === 0 ? `${range}: noch keine Erledigungen.` : `${range}: ${parts.join(', ')}.`
}

/** Zusammenfassung der Heatmap einer Quest. */
export function habitHeatmapSummary(cells: readonly (readonly HabitHeatmapCell[])[], habit: Habit, weeks: number): string {
  let done = 0
  let partial = 0
  for (const cell of cells.flat()) {
    if (cell.state === 'done') done++
    else if (cell.state === 'partial') partial++
  }
  const parts = [
    done > 0 ? `${formatNumber(done)}-mal erledigt` : 'noch nicht erledigt',
    partial > 0 ? `${plural(partial, 'Tag', 'Tage')} mit Teilfortschritt` : '',
  ].filter((part) => part !== '')
  return `${habit.icon} ${habit.title}, ${weeksLabel(weeks)}: ${parts.join(', ')}.`
}

/** Zeitraum einer Woche: "27. Okt. – 2. Nov." */
export function weekRangeLabel(weekStart: DayKey): string {
  return `${formatDay(weekStart, 'short')} – ${formatDay(addDays(weekStart, 6), 'short')}`
}

/** Achsen-Beschriftung einer Woche: Montag als "27.10." */
export function weekTickLabel(weekStart: DayKey): string {
  return `${Number(weekStart.slice(8, 10))}.${Number(weekStart.slice(5, 7))}.`
}

/** Herkunft der XP einer Woche für den Tooltip ("Quests 320 · Perfekte Tage 80 · …"), nur Quellen > 0. */
export function weekXpSources(week: WeekXp): string {
  return [
    week.questXp > 0 ? `Quests ${formatNumber(week.questXp)}` : '',
    week.perfectBonusXp > 0 ? `Perfekte Tage ${formatNumber(week.perfectBonusXp)}` : '',
    week.chapterXp > 0 ? `Kapitel ${formatNumber(week.chapterXp)}` : '',
    week.sideQuestXp > 0 ? `Nebenquests ${formatNumber(week.sideQuestXp)}` : '',
  ]
    .filter((part) => part !== '')
    .join(' · ')
}

/**
 * Kennzahlen der Wochen: Summe, Schnitt der abgeschlossenen Wochen und die stärkste Woche. Mit `since` (Beginn der
 * Historie, `DayHistory.from`) zählen für den Schnitt nur Wochen ab dem Abenteuerbeginn – die leeren Wochen davor
 * würden ihn sonst drücken („im Schnitt 0 XP“ in der ersten Woche). Ohne abgeschlossene Woche gibt es keinen Schnitt.
 */
export function weeklySummary(
  weeks: readonly WeekXp[],
  since?: DayKey,
): { total: number; average?: number; best?: WeekXp } {
  const total = weeks.reduce((sum, week) => sum + week.xp, 0)
  const finished = weeks.filter(
    (week) => !week.current && (since === undefined || compareDays(addDays(week.weekStart, 6), since) >= 0),
  )
  const average =
    finished.length > 0 ? Math.round(finished.reduce((sum, week) => sum + week.xp, 0) / finished.length) : undefined
  let best: WeekXp | undefined
  for (const week of weeks) if (week.xp > 0 && (best === undefined || week.xp > best.xp)) best = week
  return {
    total,
    ...(average === undefined ? {} : { average }),
    ...(best === undefined ? {} : { best }),
  }
}

/** Vorgelesene Zusammenfassung des Wochen-Diagramms. */
export function weeklyXpSummary(weeks: readonly WeekXp[], since?: DayKey): string {
  const { total, average, best } = weeklySummary(weeks, since)
  const range = capitalize(weeksLabel(weeks.length))
  if (!best) return `${range}: noch keine XP – deine erste Quest füllt die erste Säule.`
  const mean = average === undefined ? '' : `, im Schnitt ${formatNumber(average)} XP pro Woche`
  return `${range}: ${formatNumber(total)} XP${mean}. Stärkste Woche ${weekRangeLabel(best.weekStart)} mit ${formatNumber(best.xp)} XP.`
}

/** Untertitel des Wochen-Diagramms: Schnitt und Rekord – bzw. ermutigend, solange noch keine Woche voll ist. */
export function weeklySubtitle(weeks: readonly WeekXp[], since?: DayKey): string {
  const { average, best } = weeklySummary(weeks, since)
  if (!best) return 'Deine erste Quest füllt die erste Säule.'
  if (average === undefined) {
    const current = weeks.find((week) => week.current)
    return `Diese Woche bisher ${formatNumber(current?.xp ?? best.xp)} XP – den Schnitt gibt es nach deiner ersten ganzen Woche.`
  }
  return `Im Schnitt ${formatNumber(average)} XP pro Woche · Rekord ${formatNumber(best.xp)} XP`
}

/** Vorgelesene Zusammenfassung des XP-/Level-Verlaufs. */
export function xpTimelineSummary(series: XpTimelineSeries): string {
  const first = series.points[0]
  const last = series.points[series.points.length - 1]
  if (!first || !last) return 'Noch kein Verlauf.'
  const ups = series.levelUps.length
  const latest = series.levelUps[ups - 1]
  const growth = `Gesamt-XP von ${formatNumber(first.totalXp)} am ${formatDay(first.day, 'short')} auf ${formatNumber(last.totalXp)} am ${formatDay(last.day, 'short')}, jetzt Level ${formatNumber(last.level)}`
  if (!latest) return `${growth}.`
  return `${growth}. ${sentence(`${plural(ups, 'Level-Aufstieg', 'Level-Aufstiege')}, zuletzt auf Level ${formatNumber(latest.level)} am ${formatDay(latest.day, 'short')}`)}`
}

/** Satzende – ohne doppelten Punkt nach einer Abkürzung ("am 1. Nov."). */
function sentence(text: string): string {
  return text.endsWith('.') ? text : `${text}.`
}

/** Vorgelesene Zusammenfassung des Attribut-Radars. */
export function radarSummary(axes: readonly RadarAxis[]): string {
  const list = axes.map((axis) => `${ATTRIBUTES[axis.id].name} Level ${formatNumber(axis.level)}`).join(', ')
  let strongest: RadarAxis | undefined
  for (const axis of axes) if (axis.totalXp > 0 && (strongest === undefined || axis.value > strongest.value)) strongest = axis
  return strongest ? `${list}. Am stärksten: ${ATTRIBUTES[strongest.id].name}.` : `${list}.`
}

/** Erfüllungsquote als Text: "86 %" (gerundet), ohne fällige Termine "–". */
export function rateLabel(rate: number | undefined): string {
  return rate === undefined ? '–' : `${formatNumber(Math.round(rate * 100))} %`
}

/** "26 von 30 Tagen" bzw. "3 von 4 Wochen"; ohne fällige Termine ein freundlicher Hinweis. */
export function rateDetail(done: number, due: number, unit: 'day' | 'week'): string {
  if (due === 0) return unit === 'week' ? 'noch keine Woche abgeschlossen' : 'noch nichts fällig'
  const units = unit === 'week' ? (due === 1 ? 'Woche' : 'Wochen') : due === 1 ? 'Tag' : 'Tagen'
  return `${formatNumber(done)} von ${formatNumber(due)} ${units}`
}
