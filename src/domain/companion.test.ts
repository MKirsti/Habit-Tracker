import { describe, expect, it } from 'vitest'
import { BALANCING } from './balancing'
import {
  COMPANION_SPECIES,
  MAX_COMPANION_STAGE,
  companionDefinition,
  companionHitDamage,
  companionStage,
  companionStageName,
  companionState,
  daysToNextCompanionStage,
  inactiveDaysBefore,
  isCompanionSleeping,
  isCompanionSpecies,
} from './companion'
import { COMPANIONS } from './companionDefinitions'
import { makeCompanionChoice, makeCompanionDefinitions } from './testing'
import type { CompanionSpecies } from './types'

const TODAY = '2026-11-04'

describe('Stufen nach aktiven Tagen (0 / 14 / 60 / 180)', () => {
  it('Schwellen laut BALANCING', () => {
    expect(BALANCING.companion.stageDays).toEqual([0, 14, 60, 180])
    expect(MAX_COMPANION_STAGE).toBe(3)
  })

  it('Stufe genau an den Schwellen, nie darüber hinaus', () => {
    const cases: [number, number][] = [
      [0, 0],
      [13, 0],
      [14, 1],
      [59, 1],
      [60, 2],
      [179, 2],
      [180, 3],
      [10_000, 3],
    ]
    for (const [days, stage] of cases) expect(companionStage(days), `${days} Tage`).toBe(stage)
  })

  it('Tage bis zur nächsten Stufe; auf der höchsten Stufe keine', () => {
    expect(daysToNextCompanionStage(0)).toBe(14)
    expect(daysToNextCompanionStage(13)).toBe(1)
    expect(daysToNextCompanionStage(14)).toBe(46)
    expect(daysToNextCompanionStage(100)).toBe(80)
    expect(daysToNextCompanionStage(180)).toBeUndefined()
    expect(daysToNextCompanionStage(999)).toBeUndefined()
  })

  it('kaputte Werte zählen als 0, Bruchteile werden abgerundet', () => {
    expect(companionStage(Number.NaN)).toBe(0)
    expect(companionStage(-5)).toBe(0)
    expect(companionStage(13.9)).toBe(0)
    expect(daysToNextCompanionStage(Number.POSITIVE_INFINITY)).toBe(14)
  })

  it('wächst nur – mehr aktive Tage heißt nie eine niedrigere Stufe', () => {
    let previous = 0
    for (let days = 0; days <= 400; days++) {
      const stage = companionStage(days)
      expect(stage).toBeGreaterThanOrEqual(previous)
      previous = stage
    }
  })
})

describe('Bonus-Treffer an Perfekten Tagen', () => {
  it('round(10 % des Quest-Schadens), kaufmännisch gerundet; nie negativ', () => {
    expect(companionHitDamage(80)).toBe(8)
    expect(companionHitDamage(45)).toBe(5) // 4,5 → 5
    expect(companionHitDamage(44)).toBe(4)
    expect(companionHitDamage(4)).toBe(0)
    expect(companionHitDamage(5)).toBe(1)
    expect(companionHitDamage(0)).toBe(0)
    expect(companionHitDamage(-10)).toBe(0)
    expect(companionHitDamage(Number.NaN)).toBe(0)
  })
})

describe('Schlaf (nur Darstellung)', () => {
  const awake = { today: TODAY, slumpPause: false, todayGood: false }

  it('nach ≥ 3 vollen Tagen ohne Quest schläft er – heute zählt noch nicht mit', () => {
    expect(inactiveDaysBefore({ today: TODAY, lastActiveDay: '2026-11-03' })).toBe(0)
    expect(inactiveDaysBefore({ today: TODAY, lastActiveDay: '2026-11-02' })).toBe(1)
    expect(isCompanionSleeping({ ...awake, lastActiveDay: '2026-11-02' })).toBe(false) // Di, Mi
    expect(isCompanionSleeping({ ...awake, lastActiveDay: '2026-11-01' })).toBe(false) // Mo, Di
    expect(isCompanionSleeping({ ...awake, lastActiveDay: '2026-10-31' })).toBe(true) // So, Mo, Di
  })

  it('eine heute erledigte Quest weckt ihn', () => {
    expect(inactiveDaysBefore({ today: TODAY, lastActiveDay: TODAY })).toBe(0)
    expect(isCompanionSleeping({ ...awake, lastActiveDay: TODAY })).toBe(false)
  })

  it('gezählt wird erst ab dem Tag der Wahl – ein frisch gewählter Gefährte schläft nicht sofort', () => {
    expect(isCompanionSleeping({ ...awake, lastActiveDay: '2026-10-01', since: TODAY })).toBe(false)
    expect(isCompanionSleeping({ ...awake, since: TODAY })).toBe(false)
    expect(isCompanionSleeping({ ...awake, since: '2026-11-01' })).toBe(true) // So, Mo, Di ohne Quest
    expect(isCompanionSleeping({ ...awake })).toBe(false) // ohne jeden Anhaltspunkt: wach
    expect(isCompanionSleeping({ ...awake, since: '2026-12-01' })).toBe(false) // Uhr zurückgestellt
  })

  it('in einer laufenden Durchhänger-Pause schläft er – bis heute ein guter oder perfekter Tag gelingt', () => {
    expect(isCompanionSleeping({ ...awake, lastActiveDay: TODAY, slumpPause: true })).toBe(true)
    expect(isCompanionSleeping({ ...awake, lastActiveDay: TODAY, slumpPause: true, todayGood: true })).toBe(false)
    // Ein guter Tag heute hilft nicht gegen „3 Tage ohne Quest“ – geht aber auch nicht ohne Quest heute.
    expect(isCompanionSleeping({ ...awake, lastActiveDay: '2026-10-20', todayGood: true })).toBe(true)
  })
})

describe('Definitionen & Zustand', () => {
  const definitions = makeCompanionDefinitions()

  it('fünf Arten', () => {
    expect(COMPANION_SPECIES).toEqual(['dragon', 'raccoon', 'snake', 'owl', 'fox'])
    expect(isCompanionSpecies('fox')).toBe(true)
    expect(isCompanionSpecies('cat')).toBe(false)
    expect(isCompanionSpecies(undefined)).toBe(false)
  })

  it('companionState: Wahl, Definition, Stufe, Tage bis zur nächsten Stufe, Schlaf', () => {
    const choice = makeCompanionChoice('owl', { name: 'Eulalia' })
    expect(companionState({ choice, activeDays: 20, sleeping: false, definitions })).toEqual({
      choice,
      definition: definitions.owl,
      stage: 1,
      daysToNextStage: 40,
      sleeping: false,
    })
    const legendary = companionState({ choice, activeDays: 200, sleeping: true, definitions })
    expect(legendary.stage).toBe(3)
    expect(legendary.daysToNextStage).toBeUndefined()
    expect(legendary.sleeping).toBe(true)
    expect(companionStageName(legendary.definition, legendary.stage)).toBe('owl-3')
  })

  it('das Wachstum hängt nicht an der Art: wechseln oder umbenennen ändert die Stufe nicht', () => {
    const stages = COMPANION_SPECIES.map((species) => companionState({ choice: makeCompanionChoice(species), activeDays: 75, sleeping: false, definitions }).stage)
    expect(new Set(stages)).toEqual(new Set([2]))
  })

  it('fehlt eine Art im Inhalt, gibt es eine Notfall-Definition statt eines Absturzes', () => {
    const definition = companionDefinition('dragon', {})
    expect(definition.species).toBe('dragon')
    expect(definition.stages).toHaveLength(4)
    expect(companionStageName({ ...definition, stages: [] }, 2)).toBe(definition.label)
    expect(companionStageName(definitions.fox, 9)).toBe('fox-3')
  })
})

describe('COMPANIONS (Inhalt) passt zum Vertrag', () => {
  it('jede Art mit passender species, Icon, Bezeichnung, Persönlichkeit und vier Stufen', () => {
    for (const species of COMPANION_SPECIES) {
      const definition = COMPANIONS[species as CompanionSpecies]
      expect(definition, species).toBeDefined()
      expect(definition.species).toBe(species)
      expect(definition.icon.trim()).not.toBe('')
      expect(definition.label.trim()).not.toBe('')
      expect(definition.stages).toHaveLength(BALANCING.companion.stageDays.length)
      for (const stage of definition.stages) expect(stage.name.trim(), species).not.toBe('')
    }
  })
})
