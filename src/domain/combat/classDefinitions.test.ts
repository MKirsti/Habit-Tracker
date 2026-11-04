import { describe, expect, it } from 'vitest'
import { ATTRIBUTE_IDS } from '../attributes'
import { BALANCING } from '../balancing'
import type { AttributeId, GrammaticalForm, HeroClassId } from '../types'
import { ATTACK_NAMES, CLASS_DEFINITIONS, GRAMMATICAL_FORMS, GRAMMATICAL_FORM_LABELS } from './classDefinitions'
import { BASE_CLASS_BY_ATTRIBUTE, HERO_CLASS_IDS, HYBRID_CLASSES, classNameFor } from './classes'

/** Tabelle aus docs/ARCHITECTURE.md „Phase 3a → Klasse“: männliche Form und Attribute je Klasse. */
const CONTRACT: Record<HeroClassId, { male: string; attributes: AttributeId[] }> = {
  adventurer: { male: 'Abenteurer', attributes: [] },
  warrior: { male: 'Krieger', attributes: ['strength'] },
  mage: { male: 'Magier', attributes: ['intellect'] },
  druid: { male: 'Druide', attributes: ['wisdom'] },
  bard: { male: 'Barde', attributes: ['charisma'] },
  paladin: { male: 'Paladin', attributes: ['vitality'] },
  warden: { male: 'Wächter', attributes: ['discipline'] },
  battlemage: { male: 'Kampfmagier', attributes: ['strength', 'intellect'] },
  monk: { male: 'Mönch', attributes: ['strength', 'wisdom'] },
  bannerbearer: { male: 'Bannerträger', attributes: ['strength', 'charisma'] },
  berserker: { male: 'Berserker', attributes: ['strength', 'vitality'] },
  knight: { male: 'Ritter', attributes: ['strength', 'discipline'] },
  archmage: { male: 'Erzmagier', attributes: ['intellect', 'wisdom'] },
  illusionist: { male: 'Illusionist', attributes: ['intellect', 'charisma'] },
  healer: { male: 'Heilkundiger', attributes: ['intellect', 'vitality'] },
  runesmith: { male: 'Runenschmied', attributes: ['intellect', 'discipline'] },
  seer: { male: 'Seher', attributes: ['wisdom', 'charisma'] },
  shaman: { male: 'Schamane', attributes: ['wisdom', 'vitality'] },
  templar: { male: 'Templer', attributes: ['wisdom', 'discipline'] },
  troubadour: { male: 'Troubadour', attributes: ['charisma', 'vitality'] },
  warlord: { male: 'Feldherr', attributes: ['charisma', 'discipline'] },
  sentinel: { male: 'Grenzwächter', attributes: ['vitality', 'discipline'] },
}

const IDS = Object.keys(CONTRACT) as HeroClassId[]
const DEFINITIONS = Object.values(CLASS_DEFINITIONS)
const FORMS: GrammaticalForm[] = ['female', 'male', 'neutral']

/** Ein einzelnes Emoji (optional mit Varianten-Selektor), ohne Personen-/Geschlechts-Sequenzen. */
const SINGLE_EMOJI = /^\p{Extended_Pictographic}️?$/u
/** Gendersternchen, Doppelpunkt, Schrägstrich, Unterstrich oder Binnen-I gehören nicht in einen Namen. */
const GENDER_MARKERS = /[*:/_]|[a-zäöü]In(nen)?\b/
/** Personen-Bezeichnungen mit Geschlecht – in Texten, die alle Sprachformen teilen, verboten. */
const GENDERED_NOUNS = /\b(Held|Heldin|Helden|Kriegerin|Krieger|Magierin|Magier|Siegerin|Sieger|Kämpferin|Kämpfer|Meisterin|Meister)\b/
/** Du-Form: Der Text spricht den Helden direkt an. */
const ADDRESSES_YOU = /(^|[^\p{L}])(du|dich|dir|dein\p{L}*)(?=[^\p{L}]|$)/iu

/**
 * Sätze zählen: Ein Satz endet mit . ! ? vor einem Großbuchstaben oder am Textende. Satzzeichen in Zitaten („…“)
 * zählen nur, wenn das Zitat den Satz beendet („Sein Lieblingssatz: „Morgen …“ Dann …“).
 */
function sentenceCount(text: string): number {
  const outside = text.replace(/„[^“]*“/g, (quote) => (/[.!?]“$/.test(quote) ? '„…“.' : '„…“'))
  return (outside.match(/[.!?](?=\s+[A-ZÄÖÜ„]|$)/g) ?? []).length
}

describe('CLASS_DEFINITIONS – Vollständigkeit', () => {
  it('enthält genau die 22 Klassen des Vertrags, jede unter ihrer eigenen ID', () => {
    expect(Object.keys(CLASS_DEFINITIONS).sort()).toEqual([...IDS].sort())
    expect(DEFINITIONS).toHaveLength(22)
    for (const id of IDS) expect(CLASS_DEFINITIONS[id].id).toBe(id)
  })

  it('stimmt mit den Klassen-IDs der Engine überein (classes.ts)', () => {
    expect([...HERO_CLASS_IDS].sort()).toEqual([...IDS].sort())
  })

  it('hat die Attribute laut Vertrag, in der Reihenfolge von ATTRIBUTE_IDS', () => {
    for (const id of IDS) {
      const { attributes } = CLASS_DEFINITIONS[id]
      expect(attributes, id).toEqual(CONTRACT[id].attributes)
      expect(attributes, id).toEqual(ATTRIBUTE_IDS.filter((attribute) => attributes.includes(attribute)))
    }
  })

  it('ein Abenteurer, je Attribut genau eine Grundklasse, je Attribut-Paar genau eine Hybridklasse', () => {
    expect(DEFINITIONS.filter((definition) => definition.attributes.length === 0).map((definition) => definition.id)).toEqual([
      'adventurer',
    ])
    for (const attribute of ATTRIBUTE_IDS) {
      const base = DEFINITIONS.filter((definition) => definition.attributes.length === 1 && definition.attributes[0] === attribute)
      expect(base, attribute).toHaveLength(1)
    }
    const pairs = DEFINITIONS.filter((definition) => definition.attributes.length === 2).map((definition) =>
      definition.attributes.join('+'),
    )
    expect(pairs).toHaveLength(15)
    expect(new Set(pairs).size).toBe(15)
    expect(DEFINITIONS.every((definition) => definition.attributes.length <= 2)).toBe(true)
  })

  it('passt zur Zuordnung der Engine (BASE_CLASS_BY_ATTRIBUTE, HYBRID_CLASSES)', () => {
    for (const attribute of ATTRIBUTE_IDS) {
      expect(CLASS_DEFINITIONS[BASE_CLASS_BY_ATTRIBUTE[attribute]].attributes, attribute).toEqual([attribute])
    }
    expect(HYBRID_CLASSES).toHaveLength(15)
    for (const hybrid of HYBRID_CLASSES) {
      expect([...CLASS_DEFINITIONS[hybrid.id].attributes].sort(), hybrid.id).toEqual([...hybrid.attributes].sort())
    }
  })
})

describe('CLASS_DEFINITIONS – Namen in drei Sprachformen', () => {
  it('die männliche Form ist der Name aus dem Vertrag', () => {
    for (const id of IDS) expect(CLASS_DEFINITIONS[id].names.male, id).toBe(CONTRACT[id].male)
  })

  it('jede Form ist gesetzt, ohne Leerraum am Rand und kurz genug für den Helden-Kopf (≤ 20 Zeichen)', () => {
    for (const definition of DEFINITIONS) {
      for (const form of FORMS) {
        const name = definition.names[form]
        expect(name.trim(), `${definition.id} ${form}`).toBe(name)
        expect(name.length, `${definition.id} ${form}`).toBeGreaterThan(0)
        expect(name.length, `${definition.id} ${form}: ${name}`).toBeLessThanOrEqual(20)
      }
    }
  })

  it('weiblich, männlich und neutral sind verschiedene Namen', () => {
    for (const { id, names } of DEFINITIONS) {
      expect(new Set([names.female, names.male, names.neutral]).size, id).toBe(3)
    }
  })

  it('jeder Name ist je Sprachform eindeutig', () => {
    for (const form of FORMS) {
      const names = DEFINITIONS.map((definition) => definition.names[form])
      expect(new Set(names).size, form).toBe(names.length)
    }
  })

  it('die neutrale Form ist ein eigener Name – ohne Gendersternchen, Binnen-I oder weibliche Endung', () => {
    for (const { id, names } of DEFINITIONS) {
      expect(names.neutral, id).not.toMatch(GENDER_MARKERS)
      expect(names.neutral, id).not.toMatch(/in(nen)?$/)
      expect(names.neutral, id).not.toMatch(/\bPerson\b/)
      // Keine bloße Abwandlung der männlichen Form („Magier-Seele“).
      expect(names.neutral.toLowerCase(), id).not.toContain(names.male.toLowerCase())
    }
  })

  it('die weibliche Form ist die weibliche Ableitung (Endung -in bzw. -e beim substantivierten Adjektiv)', () => {
    for (const { id, names } of DEFINITIONS) {
      expect(names.female, id).toMatch(/(in|e)$/)
      expect(names.female, id).not.toMatch(GENDER_MARKERS)
    }
  })

  it('liest sich natürlich im Helden-Kopf („Aria · Lvl 7 · …“)', () => {
    const header = (id: HeroClassId, form?: GrammaticalForm) => `Aria · Lvl 7 · ${classNameFor(CLASS_DEFINITIONS[id], form)}`
    expect(header('mage', 'female')).toBe('Aria · Lvl 7 · Magierin')
    expect(header('mage', 'male')).toBe('Aria · Lvl 7 · Magier')
    expect(header('mage', 'neutral')).toBe('Aria · Lvl 7 · Arkane Seele')
    expect(header('mage')).toBe('Aria · Lvl 7 · Arkane Seele')
    expect(header('seer', 'neutral')).toBe('Aria · Lvl 7 · Orakel')
  })
})

describe('CLASS_DEFINITIONS – Symbol und Beschreibung', () => {
  it('jede Klasse hat ein eigenes, einzelnes Emoji (ohne Personen-Emoji mit Geschlecht)', () => {
    for (const { id, icon } of DEFINITIONS) expect(icon, id).toMatch(SINGLE_EMOJI)
    expect(new Set(DEFINITIONS.map((definition) => definition.icon)).size).toBe(DEFINITIONS.length)
  })

  it('die Beschreibung hat 1–2 Sätze in Du-Form und endet mit einem Satzzeichen', () => {
    for (const { id, description } of DEFINITIONS) {
      expect(description.trim(), id).toBe(description)
      expect(description, id).toMatch(ADDRESSES_YOU)
      expect(sentenceCount(description), `${id}: ${description}`).toBeGreaterThanOrEqual(1)
      expect(sentenceCount(description), `${id}: ${description}`).toBeLessThanOrEqual(2)
      expect(description, id).toMatch(/[.!]$/)
      expect(description.length, id).toBeLessThanOrEqual(160)
    }
  })

  it('die Beschreibung passt zu jeder Sprachform (keine Personen-Bezeichnung mit Geschlecht)', () => {
    for (const { id, description } of DEFINITIONS) expect(description, id).not.toMatch(GENDERED_NOUNS)
  })

  it('Texte nutzen deutsche Typografie (keine geraden Anführungszeichen, Gedankenstrich statt Bindestrich)', () => {
    for (const { id, description, names } of DEFINITIONS) {
      for (const text of [description, ...Object.values(names)]) {
        expect(text, id).not.toMatch(/["']/)
        expect(text, id).not.toMatch(/ - /)
      }
    }
  })

  it('der Abenteurer erklärt, ab wann die Klasse erwacht (classMinLevel)', () => {
    expect(CLASS_DEFINITIONS.adventurer.description).toContain(`Level ${BALANCING.combat.classMinLevel}`)
    expect(CLASS_DEFINITIONS.adventurer.description).toMatch(/Woche/)
  })
})

describe('ATTACK_NAMES', () => {
  it('nennt je Attribut den Angriff laut Vertrag', () => {
    expect(ATTACK_NAMES).toEqual({
      strength: 'Schwerthieb',
      intellect: 'Arkaner Blitz',
      wisdom: 'Mondlicht',
      charisma: 'Schlachtruf',
      vitality: 'Lebensfunke',
      discipline: 'Schildstoß',
    })
    expect(Object.keys(ATTACK_NAMES).sort()).toEqual([...ATTRIBUTE_IDS].sort())
  })
})

describe('Sprachformen', () => {
  it('bietet alle drei Formen mit Beschriftung an', () => {
    expect([...GRAMMATICAL_FORMS].sort()).toEqual([...FORMS].sort())
    for (const form of FORMS) expect(GRAMMATICAL_FORM_LABELS[form].length, form).toBeGreaterThan(0)
    expect(GRAMMATICAL_FORM_LABELS).toEqual({ female: 'Heldin', male: 'Held', neutral: 'Neutral' })
  })
})
