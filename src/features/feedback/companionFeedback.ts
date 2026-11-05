/**
 * Rückmeldung zum Gefährten (Phase 3b) – rein und ohne React, die Darstellung übernimmt `GameFeedback`.
 *
 * **Entwicklung:** Erreicht der Gefährte in einem Schritt eine höhere Stufe (die aktiven Tage sind gewachsen – also
 * gerade die erste Quest des Tages abgehakt), zeigt `GameFeedback` die Entwicklungs-Szene: alte → neue Stufe, das Emoji
 * wächst. Nur, wenn es den Gefährten vorher schon gab (die Wahl selbst ist keine Entwicklung; ein Wechsel der Art ändert
 * die Stufe nicht). Rückgänge (Haken wieder entfernt) melden nichts – eine noch wartende Szene verschwindet dann.
 * Massenänderungen und das erste Laden filtert `GameFeedback` vorher heraus.
 */
import { companionStageName } from '../../domain/companion'
import type { CompanionSpecies, GameState } from '../../domain/types'

export interface CompanionEvolvedEvent {
  type: 'companion-evolved'
  species: CompanionSpecies
  /** Emoji der Art. */
  icon: string
  /** Name des Gefährten (vom Spieler vergeben). */
  name: string
  from: number
  to: number
  /** Name der bisherigen Stufe („Wuselwicht“). */
  fromName: string
  /** Name der neuen Stufe („Glitzerpfote“). */
  toName: string
  /** Text der neuen Stufe. */
  description: string
  /** Aktive Tage bis zur nächsten Stufe (fehlt auf der höchsten). */
  daysToNextStage?: number
}

/** Die Entwicklung im Schritt `prev` → `next`, falls der Gefährte eine Stufe aufgestiegen ist. */
export function companionEvolution(
  prev: Pick<GameState, 'companion'>,
  next: Pick<GameState, 'companion'>,
): CompanionEvolvedEvent | undefined {
  const before = prev.companion
  const after = next.companion
  if (before === undefined || after === undefined || after.stage <= before.stage) return undefined
  const { definition } = after
  const event: CompanionEvolvedEvent = {
    type: 'companion-evolved',
    species: after.choice.species,
    icon: definition.icon,
    name: after.choice.name,
    from: before.stage,
    to: after.stage,
    fromName: companionStageName(definition, before.stage),
    toName: companionStageName(definition, after.stage),
    description: definition.stages[after.stage]?.description ?? '',
  }
  if (after.daysToNextStage !== undefined) event.daysToNextStage = after.daysToNextStage
  return event
}

/** Gilt die Entwicklung im (späteren) Zustand noch? Der Gefährte steht mindestens auf der neuen Stufe. */
export function companionEvolutionStillHolds(event: CompanionEvolvedEvent, state: Pick<GameState, 'companion'>): boolean {
  return state.companion !== undefined && state.companion.stage >= event.to
}
