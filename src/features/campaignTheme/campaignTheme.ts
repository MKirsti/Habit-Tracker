/**
 * Hauptfarbe einer Kampagne: die Farbe des Attributs, das sie am stärksten trainiert.
 *
 * Reihenfolge: berechnetes `dominantAttribute` (aus dem Plan ihrer Quests) → Haupt-Attribut des gewählten Pfads
 * der Vorlage → Haupt-Attribut der Vorlage → keine (dann Gold, die Grundfarbe der App).
 *
 * Gold bleibt außerdem immer für XP, Belohnungen und „Gemeistert“ reserviert – die Kampagnenfarbe färbt
 * Rahmen, Leuchten, Fortschritt und Kapitel-Knoten. Alle Seiten (Kampagne, Dashboard, Bibliothek, Rückmeldungen)
 * nutzen dieselben Variablen aus `accentVars` – keine eigenen Ableitungen.
 */
import type { CSSProperties } from 'react'
import { getBlueprint } from '../../data/blueprints'
import { ATTRIBUTES } from '../../domain/attributes'
import type { AttributeId, MainQuest, MainQuestState } from '../../domain/types'
import { TINT_TEXT_PERCENT, tintTextColor } from '../../ui/tint'

/** Gold der App (entspricht --color-gold in src/index.css) – Rückfallfarbe ohne Attribut. */
export const CAMPAIGN_FALLBACK_COLOR = '#d4a548'

/**
 * Anteil der Akzentfarbe in `--accent-text` (Rest: Pergament) – dieselbe Mischung wie getönte Schrift im
 * Design-System (`TINT_TEXT_PERCENT`, Attribut-Chips und farbige Abzeichen). Reines Rot (Stärke) oder Blau
 * (Intelligenz) läge als kleine Schrift auf getönten Flächen und Abzeichen unter 4.5:1; leicht aufgehellt bleiben
 * alle Attributfarben und Gold auf allen Kampagnen-Flächen lesbar (geprüft in campaignTheme.test.ts).
 */
export const ACCENT_TEXT_PERCENT = TINT_TEXT_PERCENT

/** Was die Farbe einer Kampagne bestimmt. */
export type CampaignColorSource = Pick<MainQuestState, 'quest' | 'dominantAttribute'>

/** Haupt-Attribut laut Vorlage (Pfad vor Vorlage), falls die Kampagne aus einer Vorlage stammt. */
export function blueprintAttribute(quest: Pick<MainQuest, 'blueprint'>): AttributeId | undefined {
  if (!quest.blueprint) return undefined
  const blueprint = getBlueprint(quest.blueprint.id)
  if (!blueprint) return undefined
  const path = blueprint.paths?.find((candidate) => candidate.id === quest.blueprint?.pathId)
  return path?.primaryAttribute ?? blueprint.primaryAttribute
}

/** Das Attribut, das die Farbe der Kampagne bestimmt (siehe Dateikommentar). */
export function campaignAttribute(campaign: CampaignColorSource): AttributeId | undefined {
  return campaign.dominantAttribute ?? blueprintAttribute(campaign.quest)
}

/** Hex-Farbe eines Attributs (ohne Attribut: Gold). */
export function attributeColor(attribute: AttributeId | undefined): string {
  return attribute === undefined ? CAMPAIGN_FALLBACK_COLOR : ATTRIBUTES[attribute].color
}

/** Hex-Farbe der Kampagne (Gold ohne Attribut). */
export function campaignColor(campaign: CampaignColorSource): string {
  return attributeColor(campaignAttribute(campaign))
}

/**
 * CSS-Variablen für eine Akzentfarbe – auf einem Container setzen, darin per Tailwind nutzen, z. B.
 * `border-(--accent-35)`, `bg-(--accent-10)`, `shadow-[0_0_24px_var(--accent-20)]`, `text-(--accent-text)`.
 * - `--accent`, `--accent-5/10/20/35/60`: die Farbe pur bzw. mit Transparenz (Linien, Leuchten, Füllungen).
 * - `--accent-text`: für **Schrift** in der Akzentfarbe – leicht mit Pergament aufgehellt (`ACCENT_TEXT_PERCENT`).
 *   Reines `text-(--accent)` nur für Symbole.
 */
export function accentVars(color: string): CSSProperties {
  const mix = (percent: number) => `color-mix(in srgb, ${color} ${percent}%, transparent)`
  return {
    '--accent': color,
    '--accent-5': mix(5),
    '--accent-10': mix(10),
    '--accent-20': mix(20),
    '--accent-35': mix(35),
    '--accent-60': mix(60),
    '--accent-text': tintTextColor(color),
  } as CSSProperties
}

/** Kurzform: CSS-Variablen in der Farbe eines Attributs (ohne Attribut: Gold). */
export function attributeAccentVars(attribute: AttributeId | undefined): CSSProperties {
  return accentVars(attributeColor(attribute))
}

/** Kurzform: CSS-Variablen in der Farbe der Kampagne. */
export function campaignAccentVars(campaign: CampaignColorSource): CSSProperties {
  return accentVars(campaignColor(campaign))
}

/**
 * Hervorgehobene Fläche in der Akzentfarbe (Kampagnen-Rahmen, gemeisterte Karte, gewählte Vorlage bzw. Klasse):
 * oben ein Hauch der Farbe (6 %) über `surface-raised`, unten die normale Fläche. Überall dieselbe Stärke, damit
 * Abzeichen und Attribut-Chips darauf lesbar bleiben (siehe campaignTheme.test.ts).
 */
export const ACCENT_SURFACE =
  'bg-linear-to-b from-[color-mix(in_srgb,var(--accent)_6%,var(--color-surface-raised))] to-surface/95'

/**
 * Deckende, dunkle Abzeichen-Fläche in der Akzentfarbe (z. B. Klasse im Kampagnen-Banner): unabhängig von Leuchten
 * und Tönungen darunter – `--accent-text` darauf ≥ 4.5:1.
 */
export const ACCENT_BADGE_BACKGROUND = 'color-mix(in srgb, var(--accent) 12%, var(--color-surface))'
