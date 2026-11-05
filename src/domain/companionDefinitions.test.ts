import { describe, expect, it } from 'vitest'
import { BALANCING } from './balancing'
import { COMPANION_SPECIES, companionStageName } from './companion'
import { COMPANIONS } from './companionDefinitions'
import type { CompanionDefinition, CompanionSpecies } from './types'

/** Art → Bezeichnung und Emoji laut Vertrag (ARCHITECTURE.md „Gefährte“). */
const EXPECTED: Record<CompanionSpecies, { label: string; icon: string }> = {
  dragon: { label: 'Drache', icon: '🐉' },
  raccoon: { label: 'Waschbär', icon: '🦝' },
  snake: { label: 'Schlange', icon: '🐍' },
  owl: { label: 'Eule', icon: '🦉' },
  fox: { label: 'Fuchs', icon: '🦊' },
}

const DEFINITIONS: CompanionDefinition[] = COMPANION_SPECIES.map((species) => COMPANIONS[species])
const ALL_STAGES = DEFINITIONS.flatMap((definition) => definition.stages)

/** Sprachformen gibt es hier nicht: keine Gender-Zeichen, keine -in-Formen, keine Binnen-I. */
const GENDER_MARKERS = /[*_/]|\w:innen?\b|[a-zäöü]In(nen)?\b|\p{L}+erin(nen)?\b/u
const GENDERED_NOUNS = /\b(Held|Heldin|Helden|Siegerin|Sieger|Kämpferin|Kämpfer|Kriegerin|Krieger|Meisterin|Meister)\b/
/**
 * Keine Pronomen der dritten Person: Der Gefährte trägt einen eigenen Namen, und die Stufen wechseln das grammatische
 * Geschlecht – „er“ oder „sie“ passten nie zu allen.
 */
const THIRD_PERSON = /(^|[^\p{L}])(er|sie|ihn|ihm|ihr|ihre[mnrs]?|sein|seine[mnrs]?)(?=[^\p{L}]|$)/iu
/** Nie beschämend oder drohend. */
const SHAMING = /versag|schande|schäm|enttäusch|faul|verloren|verlier|schuld|peinlich|leider|strafe|bereu/i
const SINGLE_EMOJI = /^\p{Extended_Pictographic}️?$/u

/** Sätze zählen wie in `bosses.test.ts`: . ! ? vor einem Großbuchstaben oder am Ende; Zitate („…“) zählen nicht mit. */
function sentenceCount(text: string): number {
  const outside = text.replace(/„[^“]*“/g, (quote) => (/[.!?]“$/.test(quote) ? '„…“.' : '„…“'))
  return (outside.match(/[.!?](?=\s+[A-ZÄÖÜ„]|$)/g) ?? []).length
}

function textsOf(definition: CompanionDefinition): string[] {
  return [definition.personality, ...definition.stages.map((stage) => stage.description)]
}

describe('COMPANIONS – Vollständigkeit', () => {
  it('genau die fünf Arten, Schlüssel = species, in der Reihenfolge von COMPANION_SPECIES', () => {
    expect(Object.keys(COMPANIONS)).toEqual([...COMPANION_SPECIES])
    expect(Object.keys(EXPECTED).sort()).toEqual([...COMPANION_SPECIES].sort())
    for (const species of COMPANION_SPECIES) expect(COMPANIONS[species].species, species).toBe(species)
  })

  it('Bezeichnung und Emoji je Art wie im Vertrag', () => {
    for (const species of COMPANION_SPECIES) {
      expect(COMPANIONS[species].label, species).toBe(EXPECTED[species].label)
      expect(COMPANIONS[species].icon, species).toBe(EXPECTED[species].icon)
      expect(COMPANIONS[species].icon, species).toMatch(SINGLE_EMOJI)
    }
  })

  it('je Art so viele Stufen wie Schwellen in BALANCING (4), jede mit Name und Text', () => {
    expect(BALANCING.companion.stageDays).toHaveLength(4)
    for (const definition of DEFINITIONS) {
      expect(definition.stages, definition.species).toHaveLength(BALANCING.companion.stageDays.length)
      for (const stage of definition.stages) {
        expect(stage.name.trim(), definition.species).not.toBe('')
        expect(stage.description.trim(), stage.name).not.toBe('')
      }
    }
  })

  it('Stufen-Namen sind über alle Arten eindeutig und keiner heißt wie eine Art', () => {
    const names = ALL_STAGES.map((stage) => stage.name)
    expect(new Set(names).size).toBe(names.length)
    const labels = DEFINITIONS.map((definition) => definition.label)
    for (const name of names) expect(labels, name).not.toContain(name)
  })

  it('companionStageName liefert für jede Stufe den Namen aus dem Inhalt', () => {
    for (const definition of DEFINITIONS) {
      definition.stages.forEach((stage, index) => expect(companionStageName(definition, index)).toBe(stage.name))
    }
  })

  it('Drache, Waschbär & Co.: die Namen der ersten und letzten Stufe stehen fest', () => {
    expect(COMPANIONS.dragon.stages.map((stage) => stage.name)).toEqual([
      'Drachenei-Schlüpfling',
      'Jungdrache',
      'Flammendrache',
      'Uralter Drache',
    ])
    expect(COMPANIONS.raccoon.stages[0].name).toBe('Wuselwicht')
  })
})

describe('COMPANIONS – Texte', () => {
  it('Stufen-Namen: ohne Artikel, ohne Leerraum am Rand, höchstens 28 Zeichen', () => {
    for (const stage of ALL_STAGES) {
      expect(stage.name.trim()).toBe(stage.name)
      expect(stage.name.length, stage.name).toBeLessThanOrEqual(28)
      expect(stage.name, stage.name).not.toMatch(/^(Der|Die|Das|Ein|Eine) /)
    }
  })

  it('Stufen-Texte: 1–2 Sätze, höchstens 150 Zeichen; Persönlichkeit: ein Satz, höchstens 120 Zeichen', () => {
    for (const definition of DEFINITIONS) {
      expect(sentenceCount(definition.personality), definition.species).toBe(1)
      expect(definition.personality.length, definition.species).toBeLessThanOrEqual(120)
      for (const stage of definition.stages) {
        const sentences = sentenceCount(stage.description)
        expect(sentences, stage.name).toBeGreaterThanOrEqual(1)
        expect(sentences, stage.name).toBeLessThanOrEqual(2)
        expect(stage.description.length, stage.name).toBeLessThanOrEqual(150)
      }
    }
  })

  it('jeder Text beginnt groß, endet mit einem Satzzeichen und ist einmalig', () => {
    const texts = DEFINITIONS.flatMap(textsOf)
    expect(new Set(texts).size).toBe(texts.length)
    for (const text of texts) {
      expect(text.trim(), text).toBe(text)
      expect(text, text).toMatch(/^[A-ZÄÖÜ„]/)
      expect(text, text).toMatch(/[.!?…“]$/)
    }
  })

  it('keine Sprachformen und keine Personen-Bezeichnungen – Tiernamen sind für alle gleich', () => {
    for (const definition of DEFINITIONS) {
      for (const text of [definition.label, ...definition.stages.map((stage) => stage.name), ...textsOf(definition)]) {
        expect(text, text).not.toMatch(GENDER_MARKERS)
        expect(text, text).not.toMatch(GENDERED_NOUNS)
      }
    }
  })

  it('kein „er“ oder „sie“ für den Gefährten – passt zu jedem selbst gewählten Namen', () => {
    for (const text of DEFINITIONS.flatMap(textsOf)) expect(text, text).not.toMatch(THIRD_PERSON)
  })

  it('freundlich: nichts Beschämendes, deutsche Anführungszeichen, Gedankenstrich statt Bindestrich', () => {
    for (const text of DEFINITIONS.flatMap(textsOf)) {
      expect(text, text).not.toMatch(SHAMING)
      expect(text, text).not.toMatch(/["']/)
      expect(text, text).not.toMatch(/ - /)
    }
  })
})
