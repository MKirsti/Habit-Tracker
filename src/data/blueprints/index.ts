/**
 * Die Kampagnen-Bibliothek: alle Vorlagen in der Reihenfolge, in der sie angeboten werden.
 */
import { alchemistBlueprint } from './alchemist'
import { bodyBlueprint } from './body'
import { earlyRiserBlueprint } from './earlyRiser'
import { fellowshipBlueprint } from './fellowship'
import { fortressBlueprint } from './fortress'
import { monkBlueprint } from './monk'
import { polyglotBlueprint } from './polyglot'
import { scholarBlueprint } from './scholar'
import type { CampaignBlueprint } from './types'

export * from './types'

export const BLUEPRINTS: readonly CampaignBlueprint[] = [
  scholarBlueprint,
  bodyBlueprint,
  alchemistBlueprint,
  monkBlueprint,
  earlyRiserBlueprint,
  fortressBlueprint,
  fellowshipBlueprint,
  polyglotBlueprint,
]

export function getBlueprint(id: string): CampaignBlueprint | undefined {
  return BLUEPRINTS.find((blueprint) => blueprint.id === id)
}
