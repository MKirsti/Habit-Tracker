/**
 * Herkunft einer Kampagne aus der Bibliothek: Vorlage, Stufe und (beim Sport) Klasse – für Abzeichen im
 * Banner, in der Liste der beendeten Kampagnen und auf dem Dashboard. Rein, ohne React.
 */
import { BLUEPRINT_LEVEL_LABELS, getBlueprint } from '../../data/blueprints'
import type { BlueprintPath, CampaignBlueprint } from '../../data/blueprints'
import type { BlueprintLevel, MainQuest } from '../../domain/types'

export interface CampaignOrigin {
  blueprint: CampaignBlueprint
  level: BlueprintLevel
  /** "Einsteiger" / "Fortgeschritten". */
  levelLabel: string
  /** Gewählte Klasse (nur bei Vorlagen mit Pfaden). */
  path?: BlueprintPath
}

/** Vorlage, Stufe und Klasse einer Kampagne – `undefined` für eigene Kampagnen (oder eine unbekannte Vorlage). */
export function campaignOrigin(quest: Pick<MainQuest, 'blueprint'>): CampaignOrigin | undefined {
  const ref = quest.blueprint
  if (ref === undefined) return undefined
  const blueprint = getBlueprint(ref.id)
  if (blueprint === undefined) return undefined
  const path = ref.pathId === undefined ? undefined : blueprint.paths?.find((candidate) => candidate.id === ref.pathId)
  const origin: CampaignOrigin = { blueprint, level: ref.level, levelLabel: BLUEPRINT_LEVEL_LABELS[ref.level] ?? ref.level }
  if (path !== undefined) origin.path = path
  return origin
}

/** Klasse mit Art: "🗡️ Krieger · Kraftsport". */
export function pathLabel(path: Pick<BlueprintPath, 'icon' | 'className' | 'label'>): string {
  return `${path.icon} ${path.className} · ${path.label}`
}

/** Kurzfassung für Listen: "🗡️ Krieger · Einsteiger" bzw. "Fortgeschritten". */
export function originSummary(origin: CampaignOrigin): string {
  return origin.path ? `${origin.path.icon} ${origin.path.className} · ${origin.levelLabel}` : origin.levelLabel
}
