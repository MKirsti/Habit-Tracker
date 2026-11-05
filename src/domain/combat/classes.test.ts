import { describe, expect, it } from 'vitest'
import { ATTRIBUTE_IDS } from '../attributes'
import { BALANCING } from '../balancing'
import { addDays } from '../dates'
import { xpToNextAttributeLevel } from '../leveling'
import { makeClassDefinitions, seededRandom } from '../testing'
import type { AttributeId, DayKey, HeroClassId } from '../types'
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
  classTimeline,
  classWeekStart,
  heroClassIdFor,
  heroClassIdWithInertia,
  heroClassState,
  hybridClassId,
  keepsClass,
  topAttributes,
} from './classes'
import type { AttributeXpEntry } from './classes'

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

// ---------------------------------------------------------------------------
// Nachbesserung 3a: Klassen-Trägheit
// ---------------------------------------------------------------------------

/** 2026-01-05 ist ein Montag. */
const FIRST_MONDAY: DayKey = '2026-01-05'

/**
 * Attribut-XP so, dass am Ende von Woche i (Sonntag) genau die Level `weeks[i]` erreicht sind (fehlende Attribute: 1).
 * Die Klasse von Woche i + 1 hängt dann an `weeks[i]`.
 */
function weeklyLevelEntries(weeks: Partial<Record<AttributeId, number>>[]): AttributeXpEntry[] {
  const entries: AttributeXpEntry[] = []
  const reached = levels()
  weeks.forEach((week, i) => {
    const day = addDays(FIRST_MONDAY, 7 * i + 2)
    for (const id of ATTRIBUTE_IDS) {
      const target = week[id] ?? 1
      const xp = xpForAttributeLevel(target) - xpForAttributeLevel(reached[id])
      if (xp > 0) entries.push({ day, attribute: id, xp })
      reached[id] = Math.max(reached[id], target)
    }
  })
  return entries
}

/** Klassen der Wochen 2 … n + 1 (also nach den Leveln von Woche 1 … n), mit Trägheit. */
function classesAfter(weeks: Partial<Record<AttributeId, number>>[]): HeroClassId[] {
  const until = addDays(FIRST_MONDAY, 7 * weeks.length)
  return classTimeline(weeklyLevelEntries(weeks), until)
    .slice(1)
    .map((week) => week.id)
}

function changes(ids: readonly HeroClassId[]): number {
  return ids.reduce((count, id, i) => count + (i > 0 && id !== ids[i - 1] ? 1 : 0), 0)
}

describe('Nachbesserung 3a: keepsClass – die Klasse der Vorwoche bleibt, solange sie annähernd passt', () => {
  it('Hybrid bleibt bei einem Abstand bis 2 (statt 1) – erst bei 3 wechselt es zur Grundklasse', () => {
    expect(keepsClass('battlemage', levels({ strength: 6, intellect: 4 }))).toBe(true) // normal: Krieger
    expect(heroClassIdWithInertia(levels({ strength: 6, intellect: 4 }), 'battlemage')).toBe('battlemage')
    expect(keepsClass('battlemage', levels({ strength: 7, intellect: 4 }))).toBe(false)
    expect(heroClassIdWithInertia(levels({ strength: 7, intellect: 4 }), 'battlemage')).toBe('warrior')
  })

  it('Hybrid bleibt bei Gleichstand mit einem dritten Attribut – nicht, wenn eins über dem niedrigeren liegt', () => {
    // Mönch (Stärke + Weisheit): Intelligenz 5 = Weisheit 5 – normal gewönne Intelligenz (Reihenfolge) → Kampfmagier.
    expect(heroClassIdFor(levels({ strength: 6, intellect: 5, wisdom: 5 }))).toBe('battlemage')
    expect(heroClassIdWithInertia(levels({ strength: 6, intellect: 5, wisdom: 5 }), 'monk')).toBe('monk')
    // Intelligenz 6 > Weisheit 5 → normal: Kampfmagier.
    expect(heroClassIdWithInertia(levels({ strength: 6, intellect: 6, wisdom: 5 }), 'monk')).toBe('battlemage')
  })

  it('Hybrid braucht beide Attribute ≥ 3', () => {
    expect(keepsClass('battlemage', levels({ strength: 3, intellect: 2 }))).toBe(false)
    expect(heroClassIdWithInertia(levels({ strength: 3, intellect: 2 }), 'battlemage')).toBe('warrior')
  })

  it('Grundklasse: der Hybrid mit ihrem Attribut entsteht wie ohne Trägheit – die Trägheit hält nur das Verlassen auf', () => {
    // Review 3b: Weisheit holt bis auf 1 auf → die Erzmagierin entsteht (sonst würde ein Hybrid nur durch Überholen frei).
    expect(heroClassIdFor(levels({ intellect: 4, wisdom: 3 }))).toBe('archmage')
    expect(keepsClass('mage', levels({ intellect: 4, wisdom: 3 }))).toBe(false)
    expect(heroClassIdWithInertia(levels({ intellect: 4, wisdom: 3 }), 'mage')).toBe('archmage')
    expect(heroClassIdWithInertia(levels({ intellect: 5, wisdom: 5 }), 'mage')).toBe('archmage') // Gleichstand
    // Solange die normale Ermittlung die Grundklasse selbst ergibt, bleibt sie natürlich.
    expect(keepsClass('mage', levels({ intellect: 5, wisdom: 3 }))).toBe(true)
    // Dreier-Gleichstand oben (Reihenfolge entschiede für Kampfmagier – ohne Weisheit): die Druidin bleibt.
    expect(heroClassIdFor(levels({ strength: 5, intellect: 5, wisdom: 5 }))).toBe('battlemage')
    expect(heroClassIdWithInertia(levels({ strength: 5, intellect: 5, wisdom: 5 }), 'druid')).toBe('druid')
  })

  it('Grundklasse: 1 Level hinter dem höchsten bleibt sie – außer genau der Hybrid aus beiden entstünde neu', () => {
    // Weisheit zieht an Intelligenz vorbei: normal Erzmagier (Intelligenz + Weisheit) → der Hybrid entsteht.
    expect(heroClassIdWithInertia(levels({ intellect: 5, wisdom: 6 }), 'mage')).toBe('archmage')
    // Zwei andere ziehen vorbei (normal: Hybrid ohne Intelligenz) → die Magierin bleibt.
    expect(heroClassIdFor(levels({ strength: 6, intellect: 5, wisdom: 6 }))).toBe('monk')
    expect(heroClassIdWithInertia(levels({ strength: 6, intellect: 5, wisdom: 6 }), 'mage')).toBe('mage')
    // Gleichstand auf Platz 2 (Reihenfolge entschiede gegen Weisheit): Druide bleibt, statt zum Kampfmagier zu kippen.
    expect(heroClassIdFor(levels({ strength: 6, intellect: 5, wisdom: 5 }))).toBe('battlemage')
    expect(heroClassIdWithInertia(levels({ strength: 6, intellect: 5, wisdom: 5 }), 'druid')).toBe('druid')
  })

  it('Grundklasse: 2 Level hinter dem höchsten oder unter Level 3 → normale Ermittlung', () => {
    expect(heroClassIdWithInertia(levels({ strength: 4, intellect: 6 }), 'warrior')).toBe('mage')
    expect(heroClassIdWithInertia(levels({ strength: 2, wisdom: 2 }), 'warrior')).toBe('adventurer')
  })

  it('der Abenteurer hat keine Trägheit; ohne Vorwoche gilt die normale Ermittlung', () => {
    expect(keepsClass('adventurer', levels({ strength: 3 }))).toBe(false)
    expect(heroClassIdWithInertia(levels({ strength: 3 }), 'adventurer')).toBe('warrior')
    expect(heroClassIdWithInertia(levels({ intellect: 4, wisdom: 3 }), undefined)).toBe('archmage')
  })

  it('heroClassState: mit previousClassId gilt die Trägheit, previousId nur bei echtem Wechsel', () => {
    // Erzmagierin bei 5/3 (normal Magierin): bleibt – ohne Wechsel-Szene.
    const kept = heroClassState({ weekStart: '2026-11-02', attributeLevels: levels({ intellect: 5, wisdom: 3 }), previousClassId: 'archmage' })
    expect(kept.definition.id).toBe('archmage')
    expect(kept.classBonus).toEqual({ intellect: 0.1, wisdom: 0.1 })
    expect(kept.previousId).toBeUndefined()
    const switched = heroClassState({ weekStart: '2026-11-02', attributeLevels: levels({ intellect: 4, wisdom: 3 }), previousClassId: 'mage' })
    expect(switched.definition.id).toBe('archmage')
    expect(switched.previousId).toBe('mage')
  })
})

describe('Nachbesserung 3a: classTimeline – Klassen über die Wochenfolge', () => {
  it('kein Flackern in einer Folge mit wechselndem Abstand 1 ↔ 2 (normal: jede Woche ein Wechsel)', () => {
    const weeks = [
      { strength: 4, intellect: 3 },
      { strength: 5, intellect: 3 },
      { strength: 5, intellect: 4 },
      { strength: 6, intellect: 4 },
      { strength: 6, intellect: 5 },
      { strength: 7, intellect: 5 },
      { strength: 7, intellect: 6 },
      { strength: 8, intellect: 6 },
    ]
    const normal = weeks.map((week) => heroClassIdFor(levels(week)))
    expect(changes(normal)).toBe(7)
    const withInertia = classesAfter(weeks)
    expect(withInertia).toEqual(Array(8).fill('battlemage'))
    expect(changes(withInertia)).toBe(0)
  })

  it('kein Flackern, wenn zwei Attribute um Platz 2 tauschen (Gleichstände)', () => {
    const weeks = [
      { strength: 6, wisdom: 5, intellect: 4 },
      { strength: 6, wisdom: 5, intellect: 5 },
      { strength: 7, wisdom: 6, intellect: 5 },
      { strength: 7, wisdom: 6, intellect: 6 },
      { strength: 7, wisdom: 6, intellect: 6 },
    ]
    expect(changes(weeks.map((week) => heroClassIdFor(levels(week))))).toBeGreaterThan(1)
    expect(classesAfter(weeks)).toEqual(Array(5).fill('monk'))
  })

  it('ein klarer Wechsel setzt sich trotzdem durch', () => {
    const ids = classesAfter([
      { strength: 3 }, // Kriegerin
      { strength: 4, intellect: 3 }, // Intelligenz bis auf 1 heran → Kampfmagier entsteht (wie ohne Trägheit)
      { strength: 5, intellect: 5 }, // Gleichstand → bleibt
      { strength: 5, intellect: 6 }, // Intelligenz zieht vorbei → bleibt
      { strength: 5, intellect: 7 }, // Abstand 2 → bleibt Hybrid
      { strength: 5, intellect: 8 }, // Abstand 3 → Magier
      { strength: 5, intellect: 9, vitality: 9 }, // Vitalität gleichauf → Heilkundiger (Hybrid mit Intelligenz)
      { strength: 5, intellect: 9, vitality: 11 }, // Vitalität 2 vorn → bleibt Hybrid
      { strength: 5, intellect: 9, vitality: 12 }, // Abstand 3 → Paladin
    ])
    expect(ids).toEqual(['warrior', 'battlemage', 'battlemage', 'battlemage', 'battlemage', 'mage', 'healer', 'healer', 'paladin'])
  })

  it('Grundlagen: beginnt mit der Woche der ersten XP (Abenteurer), endet mit untilWeek; ohne XP nur untilWeek', () => {
    const entries: AttributeXpEntry[] = [{ day: '2026-01-07', attribute: 'strength', xp: xpForAttributeLevel(3) }]
    const timeline = classTimeline(entries, '2026-01-21') // Mittwoch → Montag 19.01.
    expect(timeline.map((week) => [week.weekStart, week.id])).toEqual([
      ['2026-01-05', 'adventurer'],
      ['2026-01-12', 'warrior'],
      ['2026-01-19', 'warrior'],
    ])
    expect(timeline[1].attributeLevels).toEqual(levels({ strength: 3 }))
    expect(classTimeline([], '2026-01-21')).toEqual([{ weekStart: '2026-01-19', id: 'adventurer', attributeLevels: levels() }])
    // XP erst nach untilWeek: nur untilWeek.
    expect(classTimeline(entries, '2026-01-01').map((week) => week.weekStart)).toEqual(['2025-12-29'])
  })

  it('XP der laufenden Woche zählen erst ab der nächsten Woche; ungültige Einträge zählen nicht', () => {
    const entries: AttributeXpEntry[] = [
      { day: '2026-01-11', attribute: 'strength', xp: xpForAttributeLevel(3) }, // Sonntag → zählt ab 12.01.
      { day: '2026-01-12', attribute: 'intellect', xp: xpForAttributeLevel(3) }, // Montag → zählt erst ab 19.01.
      { day: 'kaputt', attribute: 'wisdom', xp: 9_999 },
      { day: '2026-01-06', attribute: 'nope' as AttributeId, xp: 9_999 },
      { day: '2026-01-06', attribute: 'charisma', xp: Number.NaN },
    ]
    const timeline = classTimeline(entries, '2026-01-19')
    // Woche 19.01.: 3/3 – der Hybrid mit Stärke entsteht: Kampfmagier.
    expect(timeline.map((week) => week.id)).toEqual(['adventurer', 'warrior', 'battlemage'])
    expect(timeline[2].attributeLevels).toEqual(levels({ strength: 3, intellect: 3 }))
  })

  it('deterministisch: Reihenfolge der Einträge egal', () => {
    const random = seededRandom(7)
    const entries: AttributeXpEntry[] = []
    for (let i = 0; i < 400; i++) {
      entries.push({ day: addDays(FIRST_MONDAY, Math.floor(random() * 200)), attribute: ATTRIBUTE_IDS[Math.floor(random() * 6)], xp: 10 + Math.floor(random() * 40) })
    }
    const shuffled = [...entries].sort(() => random() - 0.5)
    expect(classTimeline(shuffled, '2026-08-03')).toEqual(classTimeline(entries, '2026-08-03'))
  })

  it('effizient: drei Jahre mit täglichen Einträgen in allen Attributen', () => {
    const entries: AttributeXpEntry[] = []
    for (let day = 0; day < 3 * 365; day++) {
      for (const attribute of ATTRIBUTE_IDS) entries.push({ day: addDays(FIRST_MONDAY, day), attribute, xp: 10 })
    }
    const started = performance.now()
    const timeline = classTimeline(entries, addDays(FIRST_MONDAY, 3 * 365))
    const elapsed = performance.now() - started
    expect(timeline.length).toBe(157)
    expect(elapsed).toBeLessThan(150)
  })
})
