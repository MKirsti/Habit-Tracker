/**
 * Gefährte (Phase 3b, ARCHITECTURE.md „Gefährte“) – rein.
 *
 * - Wahl und Name stehen im Profil (`CharacterProfile.companion`); Art und Name lassen sich jederzeit ändern – das
 *   Wachstum hängt nicht an der Art, nur an den aktiven Tagen des Helden.
 * - **Stufe** nach `totals.activeDays` (gesamt, Tage mit ≥ 1 erledigten Quest): ab 0 / 14 / 60 / 180 aktiven Tagen
 *   Stufe 0–3 (`BALANCING.companion.stageDays`). Geht nie verloren (aktive Tage werden nicht weniger – höchstens durch
 *   Löschen einer Quest).
 * - **Schläft** (nur Darstellung): in einer laufenden Durchhänger-Pause (laut Ledger und Vorschau – bis heute ein guter
 *   oder perfekter Tag gelingt) oder nach ≥ `sleepAfterInactiveDays` (3) vollen Tagen ohne erledigte Quest seit der
 *   letzten (bzw. seit der Wahl des Gefährten). Eine heute erledigte Quest weckt ihn.
 * - **Kampf:** An jedem Perfekten Tag der Boss-Woche trifft er mit – `companionHitDamage` = round(10 % des
 *   Quest-Schadens des Tages); eingerechnet in `combat/boss.ts` (`withCompanionHits`), nicht in die geplanten Boss-HP.
 *
 * Inhalte (Namen der Stufen, Texte, Persönlichkeit): `companionDefinitions.ts` (`COMPANIONS`).
 */
import { BALANCING } from './balancing'
import { COMPANIONS } from './companionDefinitions'
import { addDays, compareDays, diffDays, isValidDayKey } from './dates'
import type { CompanionChoice, CompanionDefinition, CompanionSpecies, CompanionState, DayKey } from './types'

/** Alle Arten in fester Reihenfolge (Auswahl, Prüfungen). */
export const COMPANION_SPECIES: readonly CompanionSpecies[] = ['dragon', 'raccoon', 'snake', 'owl', 'fox']

/** Höchste Stufe (0-basiert): 3 = Legendär. */
export const MAX_COMPANION_STAGE = BALANCING.companion.stageDays.length - 1

export function isCompanionSpecies(value: unknown): value is CompanionSpecies {
  return typeof value === 'string' && (COMPANION_SPECIES as readonly string[]).includes(value)
}

/** Gültige Anzahl aktiver Tage (ganzzahlig ≥ 0; Unsinn zählt als 0). */
function validDays(activeDays: number): number {
  return Number.isFinite(activeDays) && activeDays > 0 ? Math.floor(activeDays) : 0
}

/** Stufe 0–3 nach den aktiven Tagen insgesamt (ab 0 / 14 / 60 / 180). */
export function companionStage(activeDays: number): number {
  const days = validDays(activeDays)
  const thresholds = BALANCING.companion.stageDays
  let stage = 0
  for (let i = 0; i < thresholds.length; i++) {
    if (days >= thresholds[i]) stage = i
  }
  return stage
}

/** Aktive Tage bis zur nächsten Stufe; auf der höchsten Stufe `undefined`. */
export function daysToNextCompanionStage(activeDays: number): number | undefined {
  const stage = companionStage(activeDays)
  if (stage >= MAX_COMPANION_STAGE) return undefined
  return BALANCING.companion.stageDays[stage + 1] - validDays(activeDays)
}

/** Bonus-Treffer an einem Perfekten Tag: `round(perfectDayHitShare × Quest-Schaden des Tages)` (≥ 0). */
export function companionHitDamage(questDamage: number): number {
  if (!Number.isFinite(questDamage) || questDamage <= 0) return 0
  // In Basispunkten gerechnet (wie der Schaden), damit z. B. 45 × 0,1 = 4,5 stabil zu 5 rundet.
  const share = Math.round(BALANCING.companion.perfectDayHitShare * 10_000)
  return Math.floor((2 * questDamage * share + 10_000) / 20_000)
}

export interface CompanionSleepInput {
  today: DayKey
  /** Letzter Tag ≤ heute mit mindestens einer erledigten Quest (fehlt = noch keiner). */
  lastActiveDay?: DayKey
  /** Ab diesem Tag zählen Tage ohne Quest (Tag der Wahl des Gefährten); fehlt = ab dem letzten aktiven Tag. */
  since?: DayKey
  /** Läuft die Durchhänger-Pause (laut Ledger und Vorschau bis gestern)? */
  slumpPause: boolean
  /** Ist heute schon ein guter oder perfekter Tag (beendet die Pause)? */
  todayGood: boolean
}

/**
 * Volle Tage ohne erledigte Quest vor heute: die Tage nach dem letzten aktiven Tag (bzw. ab `since`) bis gestern.
 * Heute aktiv → 0. Ohne letzten aktiven Tag und ohne `since` → 0 (nichts, wovon man ausgehen könnte).
 */
export function inactiveDaysBefore(input: Pick<CompanionSleepInput, 'today' | 'lastActiveDay' | 'since'>): number {
  const { today } = input
  const last = input.lastActiveDay !== undefined && isValidDayKey(input.lastActiveDay) ? input.lastActiveDay : undefined
  if (last !== undefined && compareDays(last, today) >= 0) return 0
  let reference = last
  if (input.since !== undefined && isValidDayKey(input.since)) {
    const beforeSince = addDays(input.since, -1)
    if (reference === undefined || compareDays(beforeSince, reference) > 0) reference = beforeSince
  }
  if (reference === undefined) return 0
  return Math.max(0, diffDays(reference, today) - 1)
}

/** Schläft der Gefährte? Laufende Durchhänger-Pause (ohne guten Tag heute) oder ≥ 3 volle Tage ohne Quest. */
export function isCompanionSleeping(input: CompanionSleepInput): boolean {
  if (input.slumpPause && !input.todayGood) return true
  return inactiveDaysBefore(input) >= BALANCING.companion.sleepAfterInactiveDays
}

/** Notfall-Definition, falls der Inhalt eine Art (noch) nicht kennt – die App stürzt so nie ab. */
function fallbackDefinition(species: CompanionSpecies): CompanionDefinition {
  return {
    species,
    label: 'Gefährte',
    icon: '🐾',
    stages: BALANCING.companion.stageDays.map(() => ({ name: 'Gefährte', description: '' })),
    personality: '',
  }
}

/** Definition einer Art (aus `COMPANIONS` bzw. den übergebenen Definitionen). */
export function companionDefinition(
  species: CompanionSpecies,
  definitions: Readonly<Partial<Record<CompanionSpecies, CompanionDefinition>>> = COMPANIONS,
): CompanionDefinition {
  return definitions[species] ?? fallbackDefinition(species)
}

/** Name der Stufe laut Definition (fehlt die Stufe im Inhalt → die höchste vorhandene, sonst die Art). */
export function companionStageName(definition: CompanionDefinition, stage: number): string {
  const stages = definition.stages
  if (stages.length === 0) return definition.label
  return stages[Math.max(0, Math.min(stages.length - 1, Math.floor(stage)))].name
}

export interface CompanionStateInput {
  choice: CompanionChoice
  /** `totals.activeDays`. */
  activeDays: number
  sleeping: boolean
  definitions?: Readonly<Partial<Record<CompanionSpecies, CompanionDefinition>>>
}

/** `GameState.companion`: Wahl, Definition, Stufe, Tage bis zur nächsten Stufe, Schlaf. */
export function companionState(input: CompanionStateInput): CompanionState {
  const stage = companionStage(input.activeDays)
  const state: CompanionState = {
    choice: input.choice,
    definition: companionDefinition(input.choice.species, input.definitions),
    stage,
    sleeping: input.sleeping,
  }
  const next = daysToNextCompanionStage(input.activeDays)
  if (next !== undefined) state.daysToNextStage = next
  return state
}
