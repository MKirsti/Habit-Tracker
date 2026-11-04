/**
 * Akzentfarbe der Bibliothek: Jede Vorlage (bzw. jede Klasse) trägt die Farbe ihres Haupt-Attributs – dieselbe
 * Farbe, die die installierte Kampagne bekommt (jede Vorlage trainiert ihr Haupt-Attribut am stärksten, geprüft in
 * `src/data/blueprints/blueprints.test.ts`; siehe docs/ARCHITECTURE.md „Kampagnenfarben“).
 *
 * Die CSS-Variablen (`--accent`, `--accent-5/10/20/35/60`, `--accent-text`) kommen aus `features/campaignTheme`.
 * Gold bleibt für XP, Belohnung, „Gemeistert“ und Primär-Buttons.
 */
import type { BlueprintOptions, CampaignBlueprint } from '../../data/blueprints'
import type { AttributeId } from '../../domain/types'

/**
 * Haupt-Attribut, das die Farbe der Vorlage bestimmt: das des gewählten Pfads, sonst das der Vorlage
 * (ohne Pfad-Wahl, z. B. vor der Klassenwahl, also das typische).
 */
export function blueprintAccentAttribute(blueprint: CampaignBlueprint, pathId?: BlueprintOptions['pathId']): AttributeId {
  const path = pathId === undefined ? undefined : blueprint.paths?.find((candidate) => candidate.id === pathId)
  return path?.primaryAttribute ?? blueprint.primaryAttribute
}
