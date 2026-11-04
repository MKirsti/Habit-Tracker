import { describe, expect, it } from 'vitest'
import { ATTRIBUTE_IDS } from '../attributes'
import { BALANCING } from '../balancing'
import { xpToNextAttributeLevel } from '../leveling'
import { makeClassDefinitions } from '../testing'
import type { AttributeId, HeroClassId } from '../types'
import { CLASS_DEFINITIONS } from './classDefinitions'
import {
  BASE_CLASS_BY_ATTRIBUTE,
  HERO_CLASS_IDS,
  HYBRID_CLASSES,
  attributeLevelsFromXp,
  attributeXpThrough,
  classAttributes,
  classBonusFor,
  classDefinition,
  classLevelsDay,
  classNameFor,
  classWeekStart,
  heroClassIdFor,
  heroClassState,
  hybridClassId,
  topAttributes,
} from './classes'

/** Level-Datensatz: alles 1, einzelne Werte überschrieben. */
function levels(overrides: Partial<Record<AttributeId, number>> = {}): Record<AttributeId, number> {
  const result = {} as Record<AttributeId, number>
  for (const id of ATTRIBUTE_IDS) result[id] = overrides[id] ?? 1
  return result
}

/** Gesamt-XP, um genau Level `level` zu erreichen (Attribut-Kurve). */
function xpForAttributeLevel(level: number): number {
  let xp = 0
  for (let l = 1; l < level; l++) xp += xpToNextAttributeLevel(l)
  return xp
}

describe('heroClassIdFor – Schwellen', () => {
  it('alles unter Level 3 → Abenteurer', () => {
    expect(heroClassIdFor(levels())).toBe('adventurer')
    expect(heroClassIdFor(levels({ strength: 2, intellect: 2, wisdom: 2 }))).toBe('adventurer')
  })

  it('genau Level 3 in einem Attribut → dessen Grundklasse', () => {
    expect(heroClassIdFor(levels({ strength: 3 }))).toBe('warrior')
    expect(heroClassIdFor(levels({ intellect: 3, wisdom: 2 }))).toBe('mage')
  })

  it('alle sechs Grundklassen', () => {
    const expected: Record<AttributeId, HeroClassId> = {
      strength: 'warrior',
      intellect: 'mage',
      wisdom: 'druid',
      charisma: 'bard',
      vitality: 'paladin',
      discipline: 'warden',
    }
    for (const id of ATTRIBUTE_IDS) expect(heroClassIdFor(levels({ [id]: 5 }))).toBe(expected[id])
    expect(BASE_CLASS_BY_ATTRIBUTE).toEqual(expected)
  })

  it('zwei Attribute ≥ 3 mit höchstens 1 Level Abstand → Hybrid', () => {
    expect(heroClassIdFor(levels({ strength: 3, intellect: 3 }))).toBe('battlemage')
    expect(heroClassIdFor(levels({ strength: 4, intellect: 3 }))).toBe('battlemage')
    expect(heroClassIdFor(levels({ strength: 3, intellect: 4 }))).toBe('battlemage')
  })

  it('Abstand 2 → Grundklasse des stärksten', () => {
    expect(heroClassIdFor(levels({ strength: 5, intellect: 3 }))).toBe('warrior')
    expect(heroClassIdFor(levels({ strength: 3, intellect: 5 }))).toBe('mage')
  })

  it('zweites Attribut unter 3 → kein Hybrid, auch bei Abstand 1', () => {
    expect(heroClassIdFor(levels({ vitality: 3, discipline: 2 }))).toBe('paladin')
  })

  it('Gleichstand: die zwei zuerst in ATTRIBUTE_IDS stehenden gewinnen', () => {
    // Drei gleich starke Attribute → Stärke + Intelligenz
    expect(heroClassIdFor(levels({ strength: 5, intellect: 5, wisdom: 5 }))).toBe('battlemage')
    // Zweiter Platz geteilt → das zuerst genannte (Weisheit vor Disziplin)
    expect(heroClassIdFor(levels({ charisma: 6, wisdom: 5, discipline: 5 }))).toBe('seer')
    expect(topAttributes(levels({ charisma: 6, wisdom: 5, discipline: 5 }))).toEqual(['charisma', 'wisdom'])
    // Alles gleich (Level 4) → Stärke + Intelligenz
    expect(heroClassIdFor(levels({ strength: 4, intellect: 4, wisdom: 4, charisma: 4, vitality: 4, discipline: 4 }))).toBe(
      'battlemage',
    )
  })

  it('ein drittes Attribut zählt nicht: 6/5/5 → Hybrid der beiden ersten', () => {
    expect(heroClassIdFor(levels({ vitality: 6, discipline: 5, strength: 5 }))).toBe('berserker')
  })

  it('kaputte Level zählen als 1', () => {
    expect(heroClassIdFor({ strength: Number.NaN, intellect: 3 } as Record<AttributeId, number>)).toBe('mage')
    expect(heroClassIdFor({})).toBe('adventurer')
  })
})

describe('Hybridklassen', () => {
  const table: [AttributeId, AttributeId, HeroClassId][] = [
    ['strength', 'intellect', 'battlemage'],
    ['strength', 'wisdom', 'monk'],
    ['strength', 'charisma', 'bannerbearer'],
    ['strength', 'vitality', 'berserker'],
    ['strength', 'discipline', 'knight'],
    ['intellect', 'wisdom', 'archmage'],
    ['intellect', 'charisma', 'illusionist'],
    ['intellect', 'vitality', 'healer'],
    ['intellect', 'discipline', 'runesmith'],
    ['wisdom', 'charisma', 'seer'],
    ['wisdom', 'vitality', 'shaman'],
    ['wisdom', 'discipline', 'templar'],
    ['charisma', 'vitality', 'troubadour'],
    ['charisma', 'discipline', 'warlord'],
    ['vitality', 'discipline', 'sentinel'],
  ]

  it('alle 15 Paare – in beiden Reihenfolgen und über die Level-Regel', () => {
    for (const [a, b, id] of table) {
      expect(hybridClassId(a, b)).toBe(id)
      expect(hybridClassId(b, a)).toBe(id)
      expect(heroClassIdFor(levels({ [a]: 4, [b]: 4 }))).toBe(id)
      expect(heroClassIdFor(levels({ [a]: 3, [b]: 4 }))).toBe(id)
      expect(classAttributes(id)).toEqual([a, b])
    }
    expect(HYBRID_CLASSES).toHaveLength(15)
    expect(new Set(HYBRID_CLASSES.map((hybrid) => hybrid.id)).size).toBe(15)
  })

  it('gleiches Attribut zweimal → keine Hybridklasse', () => {
    expect(hybridClassId('strength', 'strength')).toBeUndefined()
  })

  it('22 Klassen insgesamt, jede genau einmal', () => {
    expect(HERO_CLASS_IDS).toHaveLength(22)
    expect(new Set(HERO_CLASS_IDS).size).toBe(22)
  })
})

describe('classBonusFor', () => {
  it('Grundklasse +20 % auf ihr Attribut, Hybrid +10 % auf beide, Abenteurer nichts', () => {
    expect(classBonusFor('warrior')).toEqual({ strength: BALANCING.combat.classBonus })
    expect(classBonusFor('warrior')).toEqual({ strength: 0.2 })
    expect(classBonusFor('sentinel')).toEqual({ vitality: 0.1, discipline: 0.1 })
    expect(classBonusFor('adventurer')).toEqual({})
  })
})

describe('Woche & Stichtag', () => {
  it('die Klasse gilt ab Montag; die Level stammen vom Sonntag davor', () => {
    expect(classWeekStart('2026-11-04')).toBe('2026-11-02') // Mi → Mo
    expect(classWeekStart('2026-11-08')).toBe('2026-11-02') // So → Mo
    expect(classWeekStart('2026-11-09')).toBe('2026-11-09') // Mo
    expect(classLevelsDay('2026-11-02')).toBe('2026-11-01')
    // Auch ein Tag mitten in der Woche wird auf den Montag gezogen.
    expect(classLevelsDay('2026-11-05')).toBe('2026-11-01')
  })

  it('über den Jahreswechsel (ISO-Woche 53)', () => {
    expect(classWeekStart('2027-01-01')).toBe('2026-12-28')
    expect(classLevelsDay('2026-12-28')).toBe('2026-12-27')
  })
})

describe('attributeXpThrough / attributeLevelsFromXp', () => {
  it('summiert je Stichtag alle Beiträge bis einschließlich zu diesem Tag', () => {
    const entries = [
      { day: '2026-10-25', attribute: 'strength' as const, xp: 20 },
      { day: '2026-11-01', attribute: 'strength' as const, xp: 21 },
      { day: '2026-11-02', attribute: 'strength' as const, xp: 22 },
      { day: '2026-10-30', attribute: 'wisdom' as const, xp: 10 },
    ]
    const [sunday, weekBefore] = attributeXpThrough(entries, ['2026-11-01', '2026-10-25'])
    expect(sunday.strength).toBe(41)
    expect(sunday.wisdom).toBe(10)
    expect(weekBefore.strength).toBe(20)
    expect(weekBefore.wisdom).toBe(0)
  })

  it('ignoriert unbekannte Attribute und ungültige XP', () => {
    const [xp] = attributeXpThrough(
      [
        { day: '2026-11-01', attribute: 'luck' as AttributeId, xp: 50 },
        { day: '2026-11-01', attribute: 'strength', xp: Number.NaN },
        { day: '2026-11-01', attribute: 'strength', xp: -5 },
      ],
      ['2026-11-01'],
    )
    expect(Object.values(xp).every((value) => value === 0)).toBe(true)
    expect(Object.keys(xp).sort()).toEqual([...ATTRIBUTE_IDS].sort())
  })

  it('Level aus XP wie bei den Attributen', () => {
    const result = attributeLevelsFromXp({ strength: xpForAttributeLevel(3), intellect: xpForAttributeLevel(3) - 1 })
    expect(result.strength).toBe(3)
    expect(result.intellect).toBe(2)
    expect(result.wisdom).toBe(1)
  })
})

describe('heroClassState', () => {
  const definitions = makeClassDefinitions()

  it('Klasse, Woche, Kampf-Level und Bonus', () => {
    const state = heroClassState({ weekStart: '2026-11-04', attributeLevels: levels({ intellect: 4 }), definitions })
    expect(state.definition.id).toBe('mage')
    expect(state.definition.names.neutral).toBe('mage-n')
    expect(state.weekStart).toBe('2026-11-02')
    expect(state.attributeLevels.intellect).toBe(4)
    expect(state.attributeLevels.strength).toBe(1)
    expect(state.classBonus).toEqual({ intellect: 0.2 })
    expect(state.previousId).toBeUndefined()
  })

  it('previousId nur, wenn die Vorwoche eine andere Klasse hatte', () => {
    const changed = heroClassState({
      weekStart: '2026-11-02',
      attributeLevels: levels({ strength: 3 }),
      previousLevels: levels({ strength: 2 }),
      definitions,
    })
    expect(changed.definition.id).toBe('warrior')
    expect(changed.previousId).toBe('adventurer')

    const same = heroClassState({
      weekStart: '2026-11-02',
      attributeLevels: levels({ strength: 5 }),
      previousLevels: levels({ strength: 4 }),
      definitions,
    })
    expect(same.previousId).toBeUndefined()
  })

  it('fehlt eine Definition im Inhalt, gibt es eine Notfall-Definition statt eines Absturzes', () => {
    const definition = classDefinition('knight', {})
    expect(definition.id).toBe('knight')
    expect(definition.attributes).toEqual(['strength', 'discipline'])
    expect(classNameFor(definition, 'female')).toBe('knight')
  })

  it('classNameFor nutzt die Sprachform, ohne Angabe neutral', () => {
    expect(classNameFor(definitions.bard, 'female')).toBe('bard-f')
    expect(classNameFor(definitions.bard, 'male')).toBe('bard-m')
    expect(classNameFor(definitions.bard)).toBe('bard-n')
  })
})

describe('CLASS_DEFINITIONS (Inhalt) passt zum Vertrag', () => {
  it('jede Klasse hat eine Definition mit passender ID, passenden Attributen und drei Sprachformen', () => {
    for (const id of HERO_CLASS_IDS) {
      const definition = CLASS_DEFINITIONS[id]
      expect(definition, id).toBeDefined()
      expect(definition.id).toBe(id)
      expect([...definition.attributes].sort()).toEqual([...classAttributes(id)].sort())
      for (const form of ['female', 'male', 'neutral'] as const) expect(definition.names[form].trim(), `${id} ${form}`).not.toBe('')
    }
  })
})
