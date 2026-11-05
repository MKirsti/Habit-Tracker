/**
 * Texte rund um den Gefährten auf der Tagesübersicht (Phase 3b): das kleine Abzeichen an der Boss-Karte und die
 * einmalige Einführung „Neu: Gefährten“ mit der schnellen Auswahl. Rein (ohne React), damit einzeln testbar.
 *
 * Ton: warm und verspielt. Texte über den Gefährten kommen ohne Pronomen der dritten Person aus – der Name ist frei
 * gewählt (wie in `companionDefinitions.ts`). Schlafen ist nie ein Vorwurf: Eine Quest weckt ihn einfach wieder.
 */
import { BALANCING } from '../../domain/balancing'
import { companionStage, companionStageName } from '../../domain/companion'
import type { CompanionDefinition, CompanionSpecies, CompanionState } from '../../domain/types'
import { currentStageName, stageLabel } from '../../features/feedback/companionTheme'
import { formatNumber } from '../../ui'

/** Ziel des Abzeichens: die Gefährten-Karte auf der Übersicht der Heldenseite. */
export const COMPANION_PATH = '/held#gefaehrte'

/** Namensvorschläge je Art – stehen im Namensfeld, solange der Spieler nichts Eigenes eintippt. */
export const COMPANION_NAME_SUGGESTIONS: Record<CompanionSpecies, string> = {
  dragon: 'Funke',
  raccoon: 'Krümel',
  snake: 'Jade',
  owl: 'Nox',
  fox: 'Flink',
}

/** Kurzer Hinweis unter dem Namen im Abzeichen-Tooltip: Stufe bzw. „schläft“. */
export function companionStatus(companion: Pick<CompanionState, 'definition' | 'stage' | 'sleeping'>): string {
  return companion.sleeping
    ? `${currentStageName(companion)} · schläft`
    : `${currentStageName(companion)} · ${stageLabel(companion.stage)}`
}

/**
 * Vorgelesen und als Tooltip: „Dein Gefährte Flink, Spitzohr (Gefährte) – zur Gefährten-Karte“ bzw. schlafend
 * „… schläft gerade. Eine erledigte Quest weckt Flink. – zur Gefährten-Karte“.
 */
export function companionBadgeLabel(companion: Pick<CompanionState, 'choice' | 'definition' | 'stage' | 'sleeping'>): string {
  const { name } = companion.choice
  const who = `Dein Gefährte ${name}, ${currentStageName(companion)} (${stageLabel(companion.stage)})`
  return companion.sleeping
    ? `${who} – schläft gerade. Eine erledigte Quest weckt ${name}. Zur Gefährten-Karte`
    : `${who} – zur Gefährten-Karte`
}

// ---------------------------------------------------------------------------
// Einführung „Neu: Gefährten“
// ---------------------------------------------------------------------------

/** Punkte der Einführungskarte – kurz, mit den echten Zahlen aus `BALANCING`. */
export function companionIntroPoints(): { title: string; text: string }[] {
  const { stageDays, perfectDayHitShare } = BALANCING.companion
  const percent = `${Math.round(perfectDayHitShare * 100).toLocaleString('de-DE')} %`
  const [, second, third, fourth] = stageDays
  return [
    {
      title: 'Wächst mit dir:',
      text: `Mit jedem aktiven Tag – neue Stufen nach ${formatNumber(second)}, ${formatNumber(third)} und ${formatNumber(fourth)} Tagen.`,
    },
    {
      title: 'Kämpft mit:',
      text: `An jedem Perfekten Tag springt dein Gefährte mit an und trifft den Boss mit ${percent} deines Tagesschadens.`,
    },
    {
      title: 'Bleibt immer:',
      text: 'Nach ein paar ruhigen Tagen gibt’s ein Nickerchen – verloren geht dein Gefährte nie.',
    },
  ]
}

/**
 * Mit welcher Stufe der Gefährte startet: Die Stufe hängt an den aktiven Tagen des Helden (nicht am Tag der Wahl) – wer
 * schon länger dabei ist, bekommt gleich die passende („Startet dank deiner 30 aktiven Tage gleich als Spitzohr.“).
 */
export function companionStartText(definition: CompanionDefinition, activeDays: number): string {
  const stage = companionStage(activeDays)
  const name = companionStageName(definition, stage)
  return stage > 0
    ? `Startet dank deiner ${formatNumber(Math.floor(activeDays))} aktiven Tage gleich als ${name}.`
    : `Startet als ${name}.`
}

/** Hinweis unter der Auswahl. */
export const COMPANION_INTRO_HINT = 'Name und Art kannst du jederzeit auf deiner Heldenseite ändern.'
