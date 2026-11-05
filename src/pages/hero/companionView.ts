/**
 * Gefährten-Karte der Heldenseite (Phase 3b): Wachstum, Stufen-Leiter und Texte – rein (ohne React), einzeln testbar.
 *
 * Die Stufe hängt nur an den aktiven Tagen des Helden (`totals.activeDays`, ab 0 / 14 / 60 / 180 →
 * `BALANCING.companion.stageDays`), nicht an der Art: Wer die Art wechselt, behält die Stufe. Texte über den Gefährten
 * kommen ohne Pronomen der dritten Person aus (der Name ist frei gewählt) – wie in `companionDefinitions.ts`.
 * Schlafen ist nie ein Vorwurf: Eine erledigte Quest weckt den Gefährten einfach wieder.
 */
import { BALANCING } from '../../domain/balancing'
import { companionStageName } from '../../domain/companion'
import type { CompanionDefinition, CompanionState } from '../../domain/types'
import { COMPANION_STAGE_LABELS, clampStage } from '../../features/feedback/companionTheme'
import { formatNumber } from '../../ui'

/** Anker der Gefährten-Karte auf der Übersicht (`/held#gefaehrte`, z. B. vom Abzeichen der Tagesübersicht). */
export const COMPANION_ANCHOR = 'gefaehrte'

/**
 * Namensvorschläge je Art – stehen im Namensfeld der ersten Wahl, solange nichts Eigenes eingetippt ist. Dieselben
 * wie in der Einführung „Neu: Gefährten“ der Tagesübersicht.
 */
export { COMPANION_NAME_SUGGESTIONS } from '../dashboard/companionText'

/** „1 aktiver Tag“ / „6 aktive Tage“. */
export function activeDaysText(days: number): string {
  return days === 1 ? '1 aktiver Tag' : `${formatNumber(days)} aktive Tage`
}

export interface CompanionGrowth {
  /** Stufe 0–3. */
  stage: number
  /** Name der aktuellen Stufe laut Art („Jungdrache“). */
  stageName: string
  /** Name der nächsten Stufe – fehlt auf der höchsten. */
  nextStageName?: string
  /** Aktive Tage bis zur nächsten Stufe – fehlt auf der höchsten. */
  daysToNext?: number
  /** Fortschritt innerhalb der aktuellen Stufe (0..1; auf der höchsten 1). */
  progress: number
  /** Sichtbarer Text unter dem Balken: „noch 6 aktive Tage bis Flammendrache“. */
  text: string
  /** Vorgelesen am Balken. */
  spoken: string
}

/**
 * Wachstum zur nächsten Stufe: Fortschritt im Abschnitt der aktuellen Stufe (z. B. 8 von 14 aktiven Tagen) und der
 * Name, der als Nächstes wartet – aus `stage` und `daysToNextStage` des Spielzustands.
 */
export function companionGrowth(companion: Pick<CompanionState, 'definition' | 'stage' | 'daysToNextStage'>): CompanionGrowth {
  const stage = clampStage(companion.stage)
  const stageName = companionStageName(companion.definition, stage)
  const thresholds = BALANCING.companion.stageDays
  const next = thresholds[stage + 1] as number | undefined
  if (next === undefined || companion.daysToNextStage === undefined) {
    return {
      stage,
      stageName,
      progress: 1,
      text: 'Höchste Stufe erreicht – legendär!',
      spoken: `Höchste Stufe erreicht: ${stageName}`,
    }
  }
  const from = thresholds[stage]
  const span = Math.max(1, next - from)
  const daysToNext = Number.isFinite(companion.daysToNextStage) ? Math.max(0, Math.round(companion.daysToNextStage)) : span
  const done = Math.min(span, Math.max(0, span - daysToNext))
  const nextStageName = companionStageName(companion.definition, stage + 1)
  const remaining = daysToNext === 1 ? 'noch 1 aktiver Tag' : `noch ${formatNumber(daysToNext)} aktive Tage`
  return {
    stage,
    stageName,
    nextStageName,
    daysToNext,
    progress: done / span,
    text: `${remaining} bis ${nextStageName}`,
    spoken: `${formatNumber(done)} von ${formatNumber(span)} aktiven Tagen – ${remaining} bis ${nextStageName}`,
  }
}

export interface CompanionStageStep {
  stage: number
  /** „Jungtier“, „Gefährte“, „Erwachsen“, „Legendär“. */
  label: string
  /** Name der Stufe laut Art. */
  name: string
  /** Ab so vielen aktiven Tagen. */
  fromDays: number
  status: 'reached' | 'current' | 'upcoming'
}

/** Die vier Stufen als Leiter – erreichte, aktuelle und kommende (mit den Namen der Art). */
export function companionStageSteps(definition: CompanionDefinition, stage: number): CompanionStageStep[] {
  const current = clampStage(stage)
  return BALANCING.companion.stageDays.map((fromDays, index) => ({
    stage: index,
    label: COMPANION_STAGE_LABELS[index] ?? `Stufe ${index + 1}`,
    name: companionStageName(definition, index),
    fromDays,
    status: index < current ? 'reached' : index === current ? 'current' : 'upcoming',
  }))
}

/** „ab Tag 1“ für die erste Stufe, sonst „ab 14 aktiven Tagen“. */
export function stageThresholdText(fromDays: number): string {
  return fromDays <= 0 ? 'von Anfang an' : `ab ${formatNumber(fromDays)} aktiven Tagen`
}

/** Hinweis zum Mitkämpfen – mit dem echten Anteil aus `BALANCING`. */
export function companionCombatText(name: string): string {
  const percent = `${Math.round(BALANCING.companion.perfectDayHitShare * 100).toLocaleString('de-DE')} %`
  return `An jedem Perfekten Tag springt ${name} mit an und trifft den Wochen-Boss mit ${percent} deines Tagesschadens.`
}

/** Sanfter Satz, solange der Gefährte schläft. */
export function companionSleepText(name: string): string {
  return `${name} hält gerade ein Nickerchen – eine erledigte Quest weckt ${name} wieder. Verloren geht dein Gefährte nie.`
}

/** Bestätigung nach einem Wechsel der Art: „Flink begleitet dich jetzt als Flammendrache.“ */
export function companionSwitchText(name: string, definition: CompanionDefinition, stage: number): string {
  return `${name} begleitet dich jetzt als ${companionStageName(definition, stage)}.`
}

/** Hinweis im Wechsel-Dialog: Die Stufe bleibt, sie wächst mit den aktiven Tagen. */
export const COMPANION_SWITCH_HINT = 'Die Stufe bleibt beim Wechsel erhalten – sie wächst mit deinen aktiven Tagen, nicht mit der Art.'
