import { describe, expect, it } from 'vitest'
import { BLUEPRINTS, getBlueprint } from '../../data/blueprints'
import { ATTRIBUTES } from '../../domain/attributes'
import { ACCENT_TEXT_PERCENT, accentVars, attributeAccentVars, CAMPAIGN_FALLBACK_COLOR } from '../campaignTheme'
import { blueprintAccentAttribute } from './blueprintAccent'

/** Wert einer CSS-Variablen aus einem React-Stilobjekt. */
function cssVar(style: object, name: string): unknown {
  return (style as Record<string, unknown>)[name]
}

describe('blueprintAccent', () => {
  it('liefert die Akzent-Variablen der Attributfarbe – plus aufgehellte Schriftfarbe', () => {
    const red = ATTRIBUTES.strength.color
    const style = attributeAccentVars('strength')
    expect(cssVar(style, '--accent')).toBe(red)
    expect(cssVar(style, '--accent-10')).toBe(`color-mix(in srgb, ${red} 10%, transparent)`)
    expect(cssVar(style, '--accent-35')).toBe(`color-mix(in srgb, ${red} 35%, transparent)`)
    expect(cssVar(style, '--accent-60')).toBe(`color-mix(in srgb, ${red} 60%, transparent)`)
    expect(cssVar(style, '--accent-text')).toBe(
      `color-mix(in srgb, ${red} ${ACCENT_TEXT_PERCENT}%, var(--color-parchment))`,
    )
  })

  it('ohne Attribut: Gold, die Grundfarbe der App', () => {
    expect(cssVar(attributeAccentVars(undefined), '--accent')).toBe(CAMPAIGN_FALLBACK_COLOR)
    expect(accentVars(CAMPAIGN_FALLBACK_COLOR)).toEqual(attributeAccentVars(undefined))
  })

  it('Vorlage ohne Pfade: ihr Haupt-Attribut (z. B. Mönch → Weisheit/Silber)', () => {
    const monk = getBlueprint('monk')
    expect(monk).toBeDefined()
    if (!monk) return
    expect(blueprintAccentAttribute(monk)).toBe('wisdom')
    // Eine Pfad-ID ist bei Vorlagen ohne Pfade bedeutungslos.
    expect(blueprintAccentAttribute(monk, 'strength')).toBe('wisdom')
  })

  it('Sport-Vorlage: vor der Klassenwahl Stärke, danach das Haupt-Attribut der gewählten Klasse', () => {
    const body = getBlueprint('body')
    expect(body).toBeDefined()
    if (!body) return
    expect(blueprintAccentAttribute(body)).toBe('strength')
    expect(blueprintAccentAttribute(body, 'strength')).toBe('strength')
    expect(blueprintAccentAttribute(body, 'endurance')).toBe('vitality')
    expect(blueprintAccentAttribute(body, 'sports')).toBe('strength')
    expect(blueprintAccentAttribute(body, 'gibt-es-nicht')).toBe('strength')
  })

  it('jede Vorlage der Bibliothek bekommt die Farbe ihres Haupt-Attributs', () => {
    for (const blueprint of BLUEPRINTS) {
      expect(cssVar(attributeAccentVars(blueprintAccentAttribute(blueprint)), '--accent'), blueprint.id).toBe(
        ATTRIBUTES[blueprint.primaryAttribute].color,
      )
    }
  })
})
