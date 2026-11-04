/**
 * „Rast & Urlaub“ in den Einstellungen (Phase 2b) – rein: Formular prüfen (dieselben Regeln wie `addRestPeriod`,
 * mit deutschen Meldungen direkt am Feld), schnelle Vorschläge, Texte und die Einteilung der Rasttage in „geplant &
 * laufend“ und „vergangen“ samt der jeweils möglichen Aktion.
 */
import { MAX_REST_PERIOD_DAYS } from '../../data/repository'
import type { RestPeriodDraft } from '../../data/repository'
import { addDays, compareDays, diffDays, formatDay, isValidDayKey, isoWeekday } from '../../domain/dates'
import type { DayKey, RestPeriod } from '../../domain/types'
import { formatNumber } from '../../ui/format'
import { formatWeekdayDay } from './settingsText'

/** Längste Notiz. */
export const REST_NOTE_MAX = 60

export interface RestFormValues {
  /** Erster Tag ('YYYY-MM-DD' aus dem Datumsfeld, leer = noch nicht gewählt). */
  from: string
  /** Letzter Tag – leer = nur ein Tag (Ruhetag). */
  until: string
  note: string
}

export interface RestFormErrors {
  from?: string
  until?: string
}

export interface RestFormContext {
  today: DayKey
  /** Frühester erlaubter Tag (`firstEditableRestDay`). */
  earliest: DayKey
  periods: readonly RestPeriod[]
}

export const EMPTY_REST_FORM: RestFormValues = { from: '', until: '', note: '' }

/** Letzter Tag laut Formular: „bis“, sonst derselbe Tag wie „von“. */
export function effectiveUntil(values: Pick<RestFormValues, 'from' | 'until'>): string {
  return values.until.trim() === '' ? values.from.trim() : values.until.trim()
}

/** „heute“, „gestern“, „morgen“ bzw. „dem 3. Nov.“ (für Meldungen). */
function relativeDayText(day: DayKey, today: DayKey): string {
  if (day === today) return 'heute'
  if (day === addDays(today, -1)) return 'gestern'
  if (day === addDays(today, 1)) return 'morgen'
  return `dem ${formatDay(day, 'short')}`
}

/** „9. Nov.“ bzw. „9. Nov. – 15. Nov.“ (wie die Meldung des Repositorys). */
function shortRange(from: DayKey, until: DayKey): string {
  return from === until ? formatDay(from, 'short') : `${formatDay(from, 'short')} – ${formatDay(until, 'short')}`
}

/** Meldung, wenn eine Rast zu früh beginnt. */
export function restStartError(earliest: DayKey, today: DayKey): string {
  return earliest === addDays(today, -1)
    ? 'Eine Rast kannst du höchstens ab gestern rückwirkend eintragen.'
    : `Eine Rast kannst du frühestens ab ${relativeDayText(earliest, today)} eintragen.`
}

/**
 * Prüft das Formular wie `addRestPeriod`: Beginn Pflicht und gültig, Ende (optional) gültig und nicht davor,
 * höchstens `MAX_REST_PERIOD_DAYS` Tage, Beginn frühestens `earliest`, keine Überschneidung mit einer anderen Rast.
 */
export function validateRestForm(values: RestFormValues, context: RestFormContext): RestFormErrors {
  const errors: RestFormErrors = {}
  const from = values.from.trim()
  const until = effectiveUntil(values)
  if (from === '') errors.from = 'Wähle den ersten Tag deiner Rast.'
  else if (!isValidDayKey(from)) errors.from = 'Bitte gib ein gültiges Datum ein.'
  if (values.until.trim() !== '' && !isValidDayKey(until)) errors.until = 'Bitte gib ein gültiges Datum ein.'
  if (errors.from !== undefined || errors.until !== undefined) return errors

  if (compareDays(until, from) < 0) errors.until = 'Eine Rast kann nicht enden, bevor sie beginnt.'
  else if (diffDays(from, until) + 1 > MAX_REST_PERIOD_DAYS) {
    errors.until = `Eine Rast dauert höchstens ${formatNumber(MAX_REST_PERIOD_DAYS)} Tage am Stück.`
  }
  if (compareDays(from, context.earliest) < 0) errors.from = restStartError(context.earliest, context.today)
  else if (errors.until === undefined) {
    const clash = context.periods
      .filter((period) => compareDays(period.from, until) <= 0 && compareDays(from, period.until) <= 0)
      .sort((a, b) => compareDays(a.from, b.from))[0]
    if (clash !== undefined) errors.from = `An diesen Tagen rastest du schon (${shortRange(clash.from, clash.until)}).`
  }
  return errors
}

export function hasRestErrors(errors: RestFormErrors): boolean {
  return errors.from !== undefined || errors.until !== undefined
}

/** Entwurf für `addRestPeriod` (nur nach erfolgreicher Prüfung aufrufen). */
export function restDraftFromValues(values: RestFormValues): RestPeriodDraft {
  const draft: RestPeriodDraft = { from: values.from.trim(), until: effectiveUntil(values) }
  const note = values.note.trim()
  if (note !== '') draft.note = note
  return draft
}

/** Anzahl Tage (inklusive beider Enden). */
export function restLength(period: Pick<RestPeriod, 'from' | 'until'>): number {
  return diffDays(period.from, period.until) + 1
}

/** „1 Tag“, „7 Tage“. */
export function restDurationText(days: number): string {
  return days === 1 ? '1 Tag' : `${formatNumber(days)} Tage`
}

/** „Mo., 9. Nov.“ bzw. „Mo., 9. Nov. – So., 15. Nov.“ */
export function restRangeText(period: Pick<RestPeriod, 'from' | 'until'>): string {
  return period.from === period.until
    ? formatWeekdayDay(period.from)
    : `${formatWeekdayDay(period.from)} – ${formatWeekdayDay(period.until)}`
}

/** Ruhetag (ein Tag) oder Urlaub (mehrere). */
export function restKind(period: Pick<RestPeriod, 'from' | 'until'>): 'Ruhetag' | 'Urlaub' {
  return period.from === period.until ? 'Ruhetag' : 'Urlaub'
}

/** Name in der Liste: die Notiz, sonst „Ruhetag“ bzw. „Urlaub“. */
export function restTitle(period: Pick<RestPeriod, 'from' | 'until' | 'note'>): string {
  const note = period.note?.trim()
  return note !== undefined && note !== '' ? note : restKind(period)
}

/** Schneller Vorschlag für den Zeitraum. */
export interface RestPreset {
  label: string
  from: DayKey
  until: DayKey
}

/**
 * „Gestern“ (für den Krankheitstag – nur, solange gestern noch eingetragen werden darf, `earliest`), „Heute“, „Morgen“,
 * „Wochenende“ (das kommende Sa–So; samstags dieses) und „Eine Woche ab morgen“.
 */
export function restPresets(today: DayKey, earliest?: DayKey): RestPreset[] {
  const weekday = isoWeekday(today)
  const saturday = weekday <= 6 ? addDays(today, 6 - weekday) : addDays(today, 6)
  const tomorrow = addDays(today, 1)
  const yesterday = addDays(today, -1)
  const past: RestPreset[] =
    earliest !== undefined && compareDays(earliest, yesterday) <= 0
      ? [{ label: 'Gestern', from: yesterday, until: yesterday }]
      : []
  return [
    ...past,
    { label: 'Heute', from: today, until: today },
    { label: 'Morgen', from: tomorrow, until: tomorrow },
    { label: 'Wochenende', from: saturday, until: addDays(saturday, 1) },
    { label: 'Eine Woche ab morgen', from: tomorrow, until: addDays(tomorrow, 6) },
  ]
}

/** Was sich an einer Rast (noch) ändern lässt. */
export type RestRemoval =
  /** Ganz löschen (beginnt heute oder später bzw. liegt ganz in der Gnadenfrist). */
  | { kind: 'delete' }
  /** Läuft seit vor heute: ab heute beenden – sie endet dann gestern (`until`). */
  | { kind: 'end'; until: DayKey }

export type RestPhase = 'current' | 'upcoming' | 'past'

export interface RestPeriodView {
  period: RestPeriod
  phase: RestPhase
  /** Kurzer Stand, z. B. „Läuft gerade“, „Morgen“, „In 5 Tagen“, „Gestern“. */
  status: string
  /** `undefined` = nur noch zum Ansehen (vergangene, schon abgerechnete Tage). */
  removal?: RestRemoval
}

/**
 * Stand und mögliche Aktion einer Rast am Spieltag `today` (`earliest` = `firstEditableRestDay`): Beginnt sie heute
 * oder später – oder ab `earliest` (etwa der Ruhetag gestern) –, lässt sie sich löschen; läuft sie seit vor heute,
 * lässt sie sich ab heute beenden (sie endet gestern, gestern bleibt geschützt). Vergangene Tage davor sind fest.
 */
export function restPeriodView(period: RestPeriod, today: DayKey, earliest: DayKey): RestPeriodView {
  const yesterday = addDays(today, -1)
  if (compareDays(period.from, today) > 0) {
    const days = diffDays(today, period.from)
    return {
      period,
      phase: 'upcoming',
      status: days === 1 ? 'Morgen' : `In ${formatNumber(days)} Tagen`,
      removal: { kind: 'delete' },
    }
  }
  if (compareDays(period.until, today) >= 0) {
    const startedToday = period.from === today
    return {
      period,
      phase: 'current',
      status: period.from === period.until ? 'Heute' : 'Läuft gerade',
      removal: startedToday ? { kind: 'delete' } : { kind: 'end', until: yesterday },
    }
  }
  const view: RestPeriodView = { period, phase: 'past', status: period.until === yesterday ? 'Gestern' : 'Vorbei' }
  if (compareDays(period.from, earliest) >= 0) view.removal = { kind: 'delete' }
  return view
}

/**
 * Rasttage für die Liste: „geplant & laufend“ – laufende, kommende und ein noch löschbarer Ruhetag von gestern,
 * chronologisch –; alles andere unter „vergangen“ (neueste zuerst).
 */
export function restPeriodGroups(
  periods: readonly RestPeriod[],
  today: DayKey,
  earliest: DayKey,
): { active: RestPeriodView[]; past: RestPeriodView[] } {
  const views = periods
    .filter((period) => isValidDayKey(period.from) && isValidDayKey(period.until))
    .map((period) => restPeriodView(period, today, earliest))
  const active = views
    .filter((view) => view.phase !== 'past' || view.removal !== undefined)
    .sort((a, b) => compareDays(a.period.from, b.period.from) || compareDays(a.period.until, b.period.until))
  const past = views
    .filter((view) => view.phase === 'past' && view.removal === undefined)
    .sort((a, b) => compareDays(b.period.from, a.period.from))
  return { active, past }
}
