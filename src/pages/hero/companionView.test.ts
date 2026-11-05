import { describe, expect, it } from 'vitest'
import { COMPANION_SPECIES } from '../../domain/companion'
import { COMPANIONS } from '../../domain/companionDefinitions'
import {
  COMPANION_NAME_SUGGESTIONS,
  activeDaysText,
  companionCombatText,
  companionGrowth,
  companionSleepText,
  companionStageSteps,
  companionSwitchText,
  stageThresholdText,
} from './companionView'

const dragon = COMPANIONS.dragon

describe('companionGrowth', () => {
  it('zeigt den Weg zur nächsten Stufe mit ihrem Namen', () => {
    // 8 aktive Tage: Stufe 0 (ab 0), nächste ab 14 → noch 6.
    const growth = companionGrowth({ definition: dragon, stage: 0, daysToNextStage: 6 })
    expect(growth).toMatchObject({
      stage: 0,
      stageName: 'Drachenei-Schlüpfling',
      nextStageName: 'Jungdrache',
      daysToNext: 6,
      text: 'noch 6 aktive Tage bis Jungdrache',
    })
    expect(growth.progress).toBeCloseTo(8 / 14)
    expect(growth.spoken).toBe('8 von 14 aktiven Tagen – noch 6 aktive Tage bis Jungdrache')
  })

  it('rechnet den Abschnitt der aktuellen Stufe (14 → 60) und kennt die Einzahl', () => {
    const growth = companionGrowth({ definition: dragon, stage: 1, daysToNextStage: 1 })
    expect(growth.text).toBe('noch 1 aktiver Tag bis Flammendrache')
    expect(growth.progress).toBeCloseTo(45 / 46)
  })

  it('feiert die höchste Stufe', () => {
    const growth = companionGrowth({ definition: dragon, stage: 3 })
    expect(growth).toMatchObject({ stage: 3, stageName: 'Uralter Drache', progress: 1, text: 'Höchste Stufe erreicht – legendär!' })
    expect(growth.nextStageName).toBeUndefined()
  })

  it('begrenzt unsinnige Stufen', () => {
    expect(companionGrowth({ definition: dragon, stage: 9 }).stage).toBe(3)
    expect(companionGrowth({ definition: dragon, stage: -2, daysToNextStage: 14 }).progress).toBe(0)
  })
})

describe('companionStageSteps', () => {
  it('liefert vier Stufen mit Namen der Art, Schwelle und Zustand', () => {
    const steps = companionStageSteps(COMPANIONS.raccoon, 2)
    expect(steps.map((step) => [step.label, step.name, step.fromDays, step.status])).toEqual([
      ['Jungtier', 'Wuselwicht', 0, 'reached'],
      ['Gefährte', 'Glitzerpfote', 14, 'reached'],
      ['Erwachsen', 'Silbermaske', 60, 'current'],
      ['Legendär', 'Waschbär der tausend Schätze', 180, 'upcoming'],
    ])
    expect(stageThresholdText(0)).toBe('von Anfang an')
    expect(stageThresholdText(180)).toBe('ab 180 aktiven Tagen')
  })
})

describe('Texte', () => {
  it('sind warm, nennen den echten Anteil und kommen ohne Pronomen aus', () => {
    expect(companionCombatText('Flink')).toBe(
      'An jedem Perfekten Tag springt Flink mit an und trifft den Wochen-Boss mit 10 % deines Tagesschadens.',
    )
    const sleep = companionSleepText('Nox')
    expect(sleep).toContain('eine erledigte Quest weckt Nox wieder')
    expect(sleep).toContain('Verloren geht dein Gefährte nie.')
    expect(sleep).not.toMatch(/\b(er|sie|ihn|ihm|ihr)\b/)
    expect(companionSwitchText('Flink', dragon, 2)).toBe('Flink begleitet dich jetzt als Flammendrache.')
    expect(activeDaysText(1)).toBe('1 aktiver Tag')
    expect(activeDaysText(1200)).toBe('1.200 aktive Tage')
  })

  it('hat für jede Art einen Namensvorschlag in der Länge, die das Repository erlaubt', () => {
    for (const species of COMPANION_SPECIES) {
      const name = COMPANION_NAME_SUGGESTIONS[species]
      expect(name.length).toBeGreaterThan(0)
      expect(name.length).toBeLessThanOrEqual(20)
    }
  })
})
