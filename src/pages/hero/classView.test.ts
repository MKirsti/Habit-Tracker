import { describe, expect, it } from 'vitest'
import { ATTRIBUTE_IDS } from '../../domain/attributes'
import { CLASS_DEFINITIONS } from '../../domain/combat/classDefinitions'
import { classNameFor, heroClassState } from '../../domain/combat/classes'
import { xpToNextAttributeLevel } from '../../domain/leveling'
import type { AttributeId, HeroClassId } from '../../domain/types'
import {
  attackPowers,
  classBonusText,
  classPathText,
  classReason,
  formatMultiplier,
  nextClassPaths,
  upcomingClass,
  xpNeededText,
} from './classView'
import type { AttributeProgress } from './classView'

const MONDAY = '2026-11-02'

function stateFor(levels: Partial<Record<AttributeId, number>>, previousClassId?: HeroClassId) {
  return heroClassState({ weekStart: MONDAY, attributeLevels: levels, ...(previousClassId ? { previousClassId } : {}) })
}

/** Aktueller Stand der Attribute: Level wie angegeben, jeweils am Anfang des Levels (oder mit `into` XP). */
function attributes(
  levels: Partial<Record<AttributeId, number>>,
  into: Partial<Record<AttributeId, number>> = {},
): Record<AttributeId, AttributeProgress> {
  const result = {} as Record<AttributeId, AttributeProgress>
  for (const id of ATTRIBUTE_IDS) {
    const level = levels[id] ?? 1
    result[id] = { level, xpIntoLevel: into[id] ?? 0, xpForNextLevel: xpToNextAttributeLevel(level) }
  }
  return result
}

describe('classReason', () => {
  it('erklärt den Abenteurer – mit und ohne erstes gewachsenes Attribut', () => {
    expect(classReason(stateFor({})).text).toBe('Noch hat kein Attribut Level 3 erreicht – alle stehen am Anfang.')
    const reason = classReason(stateFor({ strength: 2 }))
    expect(reason.text).toBe('Noch hat kein Attribut Level 3 erreicht – am weitesten ist Stärke mit Level 2.')
    expect(reason.top).toEqual([
      { id: 'strength', level: 2 },
      { id: 'intellect', level: 1 },
    ])
  })

  it('erklärt eine Grundklasse: einziges Attribut ab Level 3 oder klarer Vorsprung', () => {
    expect(classReason(stateFor({ intellect: 3, wisdom: 2 })).text).toBe(
      'Intelligenz hat als einziges Attribut Level 3 erreicht.',
    )
    const reason = classReason(stateFor({ intellect: 6, wisdom: 3 }))
    expect(reason.text).toBe(
      'Intelligenz führt mit 3 Level Vorsprung vor Weisheit – für eine Hybridklasse dürften es höchstens ein Level sein.',
    )
    expect(reason.top).toEqual([
      { id: 'intellect', level: 6 },
      { id: 'wisdom', level: 3 },
    ])
  })

  it('erklärt eine Hybridklasse: gleich stark oder ein Level auseinander', () => {
    expect(classReason(stateFor({ intellect: 6, wisdom: 5 })).text).toBe(
      'Intelligenz und Weisheit liegen nur ein Level auseinander – zusammen ergeben sie diese Hybridklasse.',
    )
    expect(classReason(stateFor({ intellect: 5, wisdom: 5 })).text).toBe(
      'Intelligenz und Weisheit sind gleich stark – beide auf Level 5.',
    )
  })
})

describe('classReason mit Klassen-Trägheit', () => {
  it('erklärt eine Grundklasse, die bleibt, obwohl ein anderes Attribut knapp vorn liegt – ohne „-1 Level Vorsprung“', () => {
    // Kriegerin der Vorwoche; Intelligenz und Weisheit sind auf 6 gestiegen, Stärke steht auf 5 → sie bleibt Kriegerin.
    const warrior = stateFor({ strength: 5, intellect: 6, wisdom: 6 }, 'warrior')
    expect(warrior.definition.id).toBe('warrior')
    const text = classReason(warrior).text
    expect(text).toBe(
      'Stärke liegt nur ein Level hinter Intelligenz – nah genug, dass deine Klasse bleibt. So springt sie nicht bei jedem Level hin und her.',
    )
    expect(text).not.toMatch(/-\d/)
    // Gleichauf mit dem stärksten Attribut (die normale Regel ergäbe eine Hybridklasse ohne Weisheit).
    const druid = stateFor({ strength: 6, intellect: 6, wisdom: 6 }, 'druid')
    expect(druid.definition.id).toBe('druid')
    expect(classReason(druid).text).toBe(
      'Weisheit liegt gleichauf mit Stärke – nah genug, dass deine Klasse bleibt. So springt sie nicht bei jedem Level hin und her.',
    )
  })

  it('erklärt eine Hybridklasse, die mit zwei Level Abstand bleibt, statt zu behaupten, das ergäbe sie', () => {
    const archmage = stateFor({ intellect: 6, wisdom: 4 }, 'archmage')
    expect(archmage.definition.id).toBe('archmage')
    expect(classReason(archmage).text).toBe(
      'Intelligenz und Weisheit liegen 2 Level auseinander – nah genug, dass deine Klasse bleibt. So springt sie nicht bei jedem Level hin und her.',
    )
  })

  it('erklärt Klassen ohne Trägheit wie bisher', () => {
    expect(classReason(stateFor({ intellect: 6, wisdom: 5 }, 'archmage')).text).toBe(
      'Intelligenz und Weisheit liegen nur ein Level auseinander – zusammen ergeben sie diese Hybridklasse.',
    )
  })
})

describe('Klassen-Bonus und Angriffskraft', () => {
  it('nennt den Bonus je Klassenart', () => {
    expect(classBonusText(stateFor({}))).toBe('Noch kein Klassenbonus – mit deiner ersten Klasse triffst du härter: +20 % mit einer Grundklasse, je +10 % mit einer Hybridklasse.')
    expect(classBonusText(stateFor({ intellect: 6 }))).toBe('+20 % Schaden mit Intelligenz')
    expect(classBonusText(stateFor({ intellect: 6, wisdom: 5 }))).toBe('+10 % Schaden mit Intelligenz und Weisheit')
  })

  it('rechnet den Faktor wie der Schaden: +10 % je Level über 1, mal Klassen-Bonus', () => {
    const mage = attackPowers(stateFor({ intellect: 6, wisdom: 3 }))
    expect(mage.map((power) => power.attribute)).toEqual(ATTRIBUTE_IDS)
    const intellect = mage.find((power) => power.attribute === 'intellect')
    expect(intellect).toMatchObject({ attackName: 'Arkaner Blitz', level: 6, multiplier: 1.8, boosted: true })
    expect(mage.find((power) => power.attribute === 'wisdom')).toMatchObject({ multiplier: 1.2, boosted: false })
    expect(mage.find((power) => power.attribute === 'strength')).toMatchObject({ multiplier: 1, boosted: false })

    const archmage = attackPowers(stateFor({ intellect: 6, wisdom: 5 }))
    expect(archmage.find((power) => power.attribute === 'intellect')?.multiplier).toBe(1.65)
    expect(formatMultiplier(1.65)).toBe('×1,65')
    expect(formatMultiplier(1.8)).toBe('×1,8')
    expect(formatMultiplier(1)).toBe('×1')
  })
})

describe('Klasse ab Montag', () => {
  it('zeigt eine andere Klasse nur, wenn der aktuelle Stand sie schon ergibt', () => {
    const mage = stateFor({ intellect: 6, wisdom: 3 })
    expect(upcomingClass(mage, attributes({ intellect: 6, wisdom: 3 }))).toBeUndefined()
    // Mitten in der Woche ist Weisheit auf Level 5 gestiegen – ab Montag Erzmagierin.
    expect(upcomingClass(mage, attributes({ intellect: 6, wisdom: 5 }))?.id).toBe('archmage')
    expect(upcomingClass(stateFor({}), attributes({ strength: 3 }))?.id).toBe('warrior')
  })

  it('rechnet mit der Trägheit: Eine Klasse, die knapp noch passt, bleibt auch ab Montag', () => {
    const archmage = stateFor({ intellect: 6, wisdom: 5 })
    expect(archmage.definition.id).toBe('archmage')
    // Intelligenz 7, Weisheit 5: Neu ermittelt wäre das Magierin – die Erzmagierin bleibt aber (Abstand 2).
    expect(upcomingClass(archmage, attributes({ intellect: 7, wisdom: 5 }))).toBeUndefined()
    // Erst bei 3 Level Abstand wechselt sie.
    expect(upcomingClass(archmage, attributes({ intellect: 8, wisdom: 5 }))?.id).toBe('mage')
  })
})

describe('nextClassPaths', () => {
  it('findet den kürzesten Weg je Zielklasse – Beispiel: Weisheit auf Level 5 für Erzmagierin', () => {
    const paths = nextClassPaths(attributes({ intellect: 6, wisdom: 3 }))
    expect(paths.map((path) => [path.attribute, path.targetLevel, path.definition.id])).toEqual([
      ['wisdom', 5, 'archmage'],
      ['strength', 5, 'battlemage'],
    ])
    // Weisheit 3 → 5: 158 + 226 XP; Stärke 1 → 5: 40 + 95 + 158 + 226 XP.
    expect(paths[0].xpNeeded).toBe(158 + 226)
    expect(paths[1].xpNeeded).toBe(40 + 95 + 158 + 226)
    const name = classNameFor(paths[0].definition, 'female')
    expect(classPathText(paths[0], name)).toBe('Bring Weisheit auf Level 5 für Erzmagierin')
    expect(classPathText(paths[0], classNameFor(paths[0].definition, 'neutral'))).toBe(
      'Bring Weisheit auf Level 5 für Sternengeist',
    )
  })

  it('rechnet schon gesammelte XP im laufenden Level ein und sortiert nach den fehlenden XP', () => {
    const paths = nextClassPaths(attributes({ strength: 2 }, { strength: 10 }), 3)
    expect(paths.map((path) => path.definition.id)).toEqual(['warrior', 'mage', 'druid'])
    expect(paths[0]).toMatchObject({ attribute: 'strength', targetLevel: 3, xpNeeded: 95 - 10 })
    expect(paths[1]).toMatchObject({ attribute: 'intellect', targetLevel: 3, xpNeeded: 40 + 95 })
    expect(xpNeededText(paths[0].xpNeeded)).toBe('noch 85 XP')
  })

  it('zeigt bei einer Hybridklasse auch den Weg zur Grundklasse', () => {
    const paths = nextClassPaths(attributes({ intellect: 6, wisdom: 5 }, { intellect: 300 }))
    // Intelligenz 6 → 7 (noch 76 XP) macht den Vorsprung zu groß → Magierin.
    expect(paths[0]).toMatchObject({ attribute: 'intellect', targetLevel: 7, xpNeeded: 376 - 300 })
    expect(paths[0].definition).toBe(CLASS_DEFINITIONS.mage)
    expect(nextClassPaths(attributes({ intellect: 6, wisdom: 5 }), 0)).toEqual([])
  })

  it('rechnet mit der Trägheit der aktuellen Klasse: der Weg zur Grundklasse ist ein Level länger', () => {
    const paths = nextClassPaths(attributes({ intellect: 6, wisdom: 5 }, { intellect: 300 }), 3, undefined, 'archmage')
    const mage = paths.find((path) => path.definition.id === 'mage')
    // Die Erzmagierin bleibt bis zu 2 Level Abstand – Magierin erst mit Intelligenz 8.
    expect(mage).toMatchObject({ attribute: 'intellect', targetLevel: 8, xpNeeded: 376 - 300 + xpToNextAttributeLevel(7) })
    expect(paths.every((path) => path.definition.id !== 'archmage')).toBe(true)
  })
})
