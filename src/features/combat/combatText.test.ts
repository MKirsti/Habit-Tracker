import { describe, expect, it } from 'vitest'
import { CLASS_DEFINITIONS } from '../../domain/combat/classDefinitions'
import { HYBRID_CLASSES } from '../../domain/combat/classes'
import { TITLES } from '../../domain/combat/cosmeticDefinitions'
import type { GrammaticalForm, HeroClassId } from '../../domain/types'
import {
  CLASS_DATIVES,
  attackNameOf,
  chestName,
  chestsFoundTitle,
  classBonusLines,
  classChangeKind,
  classDativeIn,
  classLabelIn,
  classNameIn,
  damageText,
  formatAttack,
  heroWithTitle,
  titleNameIn,
} from './combatText'

const FORMS: GrammaticalForm[] = ['female', 'male', 'neutral']

describe('Klasse & Titel in der Sprachform', () => {
  it('nennt Klassen in der Form des Helden, ohne Angabe neutral', () => {
    expect(classNameIn(CLASS_DEFINITIONS.mage, 'female')).toBe('Magierin')
    expect(classNameIn(CLASS_DEFINITIONS.mage, 'male')).toBe('Magier')
    expect(classNameIn(CLASS_DEFINITIONS.mage)).toBe('Arkane Seele')
    expect(classLabelIn(CLASS_DEFINITIONS.archmage, 'female')).toEqual({ icon: '🌌', name: 'Erzmagierin' })
  })

  it('stellt den Titel hinter den Namen', () => {
    const fearless = TITLES.find((title) => title.id === 'fearless')
    expect(fearless).toBeDefined()
    if (!fearless) return
    expect(titleNameIn(fearless, 'female')).toBe('die Furchtlose')
    expect(heroWithTitle('Aria', fearless, 'female')).toBe('Aria, die Furchtlose')
    expect(heroWithTitle('Bran', fearless, 'male')).toBe('Bran, der Furchtlose')
    expect(heroWithTitle('Sam', fearless)).toBe('Sam, ohne Furcht')
  })
})

describe('Klassennamen im Dativ', () => {
  it('passt für jede Hybridklasse zu den aktuellen Namen (sonst lieber kein Eintrag)', () => {
    for (const [id, forms] of Object.entries(CLASS_DATIVES) as [HeroClassId, (typeof CLASS_DATIVES)[HeroClassId]][]) {
      for (const form of FORMS) {
        const entry = forms?.[form]
        if (entry === undefined) continue
        expect(entry.name, `${id}/${form}`).toBe(classNameIn(CLASS_DEFINITIONS[id], form))
        expect(entry.dative, `${id}/${form}`).toMatch(/^(zur|zum) \S/)
      }
    }
  })

  it('deckt die weibliche und männliche Form aller Hybridklassen ab', () => {
    for (const { id } of HYBRID_CLASSES) {
      expect(classDativeIn(CLASS_DEFINITIONS[id], 'female'), id).toMatch(/^zur /)
      expect(classDativeIn(CLASS_DEFINITIONS[id], 'male'), id).toMatch(/^zum /)
    }
  })

  it('beugt richtig – auch schwache Nomen und Adjektive', () => {
    expect(classDativeIn(CLASS_DEFINITIONS.archmage, 'female')).toBe('zur Erzmagierin')
    expect(classDativeIn(CLASS_DEFINITIONS.archmage, 'neutral')).toBe('zum Sternengeist')
    expect(classDativeIn(CLASS_DEFINITIONS.illusionist, 'male')).toBe('zum Illusionisten')
    expect(classDativeIn(CLASS_DEFINITIONS.warlord, 'male')).toBe('zum Feldherrn')
    expect(classDativeIn(CLASS_DEFINITIONS.healer, 'female')).toBe('zur Heilkundigen')
    expect(classDativeIn(CLASS_DEFINITIONS.battlemage, 'neutral')).toBe('zur Arkanen Klinge')
  })

  it('weicht aus, wenn es keinen passenden Eintrag gibt', () => {
    expect(classDativeIn(CLASS_DEFINITIONS.shaman, 'neutral')).toBeUndefined()
    expect(classDativeIn(CLASS_DEFINITIONS.mage, 'female')).toBeUndefined()
    const renamed = { ...CLASS_DEFINITIONS.archmage, names: { ...CLASS_DEFINITIONS.archmage.names, female: 'Sternmagierin' } }
    expect(classDativeIn(renamed, 'female')).toBeUndefined()
  })

  it('erkennt Erwachen, Aufstieg und Wandel', () => {
    expect(classChangeKind(CLASS_DEFINITIONS.adventurer, CLASS_DEFINITIONS.mage)).toBe('awakened')
    expect(classChangeKind(CLASS_DEFINITIONS.adventurer, CLASS_DEFINITIONS.archmage)).toBe('awakened')
    expect(classChangeKind(CLASS_DEFINITIONS.mage, CLASS_DEFINITIONS.archmage)).toBe('ascended')
    expect(classChangeKind(CLASS_DEFINITIONS.druid, CLASS_DEFINITIONS.archmage)).toBe('ascended')
    expect(classChangeKind(CLASS_DEFINITIONS.warrior, CLASS_DEFINITIONS.archmage)).toBe('changed')
    expect(classChangeKind(CLASS_DEFINITIONS.archmage, CLASS_DEFINITIONS.mage)).toBe('changed')
    expect(classChangeKind(CLASS_DEFINITIONS.archmage, CLASS_DEFINITIONS.seer)).toBe('changed')
  })
})

describe('Angriffe', () => {
  it('benennt den Angriff je Attribut', () => {
    expect(attackNameOf('intellect')).toBe('Arkaner Blitz')
    expect(attackNameOf('discipline')).toBe('Schildstoß')
  })

  it('formatiert Schaden mit echtem Minuszeichen, gerundet und nie negativ', () => {
    expect(damageText(36)).toBe('−36')
    expect(damageText(1234.4)).toBe('−1.234')
    expect(damageText(-5)).toBe('−0')
    expect(damageText(Number.NaN)).toBe('−0')
  })

  it('beschreibt einen Treffer sichtbar und vorgelesen', () => {
    const label = formatAttack({ attribute: 'intellect', damage: 36, weakness: false })
    expect(label).toMatchObject({ icon: '🧠', name: 'Arkaner Blitz', damage: '−36', text: '🧠 Arkaner Blitz −36' })
    expect(label.spoken).toBe('Arkaner Blitz, 36 Schaden')
    const weak = formatAttack({ attribute: 'vitality', attackName: 'Lebensfunke', damage: 45, weakness: true })
    expect(weak.text).toBe('❤️ Lebensfunke −45 · Schwachstelle!')
    expect(weak.spoken).toBe('Lebensfunke, 45 Schaden, Schwachstelle')
  })

  it('nennt den Klassen-Bonus je Angriff', () => {
    expect(classBonusLines(CLASS_DEFINITIONS.mage, { intellect: 0.2 })).toEqual(['+20\u00a0% Arkaner Blitz'])
    expect(classBonusLines(CLASS_DEFINITIONS.archmage, { intellect: 0.1, wisdom: 0.1 })).toEqual([
      '+10\u00a0% Arkaner Blitz',
      '+10\u00a0% Mondlicht',
    ])
    expect(classBonusLines(CLASS_DEFINITIONS.adventurer, {})).toEqual([])
  })
})

describe('Truhen', () => {
  it('nennt die Seltenheit als Adjektiv', () => {
    expect(chestName('common')).toBe('Gewöhnliche Truhe')
    expect(chestName('uncommon')).toBe('Ungewöhnliche Truhe')
    expect(chestName('rare')).toBe('Seltene Truhe')
    expect(chestName('legendary')).toBe('Legendäre Truhe')
    expect(chestName('rare', 'Boss-Truhe')).toBe('Seltene Boss-Truhe')
    expect(chestName(undefined)).toBe('Gewöhnliche Truhe')
  })

  it('zählt gefundene Truhen', () => {
    expect(chestsFoundTitle(1)).toBe('Truhe gefunden!')
    expect(chestsFoundTitle(3)).toBe('3 Truhen gefunden!')
  })
})
