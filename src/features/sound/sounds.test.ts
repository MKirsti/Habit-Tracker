import { describe, expect, it } from 'vitest'
import { SOUND_NAMES, SOUND_RECIPES, isSoundName, recipeDuration, toneEnd } from './sounds'
import type { SoundName } from './sounds'

describe('Klang-Rezepte', () => {
  it('gibt es für genau die acht Klänge des Vertrags', () => {
    expect([...SOUND_NAMES].sort()).toEqual(
      ['achievement', 'bossHit', 'chest', 'check', 'evolve', 'levelUp', 'uncheck', 'victory'].sort(),
    )
    expect(Object.keys(SOUND_RECIPES).sort()).toEqual([...SOUND_NAMES].sort())
  })

  it('erkennt Klangnamen', () => {
    expect(isSoundName('check')).toBe(true)
    expect(isSoundName('boom')).toBe(false)
    expect(isSoundName(undefined)).toBe(false)
  })

  it.each(SOUND_NAMES)('„%s“ bleibt leise, hörbar und kurz', (name) => {
    const recipe = SOUND_RECIPES[name]
    expect(recipe.tones.length).toBeGreaterThan(0)
    expect(recipe.echo).toBeGreaterThanOrEqual(0)
    expect(recipe.echo).toBeLessThanOrEqual(0.6)
    for (const tone of recipe.tones) {
      expect(tone.at).toBeGreaterThanOrEqual(0)
      expect(tone.dur).toBeGreaterThan(0)
      expect(tone.gain).toBeGreaterThan(0)
      expect(tone.gain).toBeLessThanOrEqual(1)
      for (const freq of [tone.freq, tone.glideTo ?? tone.freq]) {
        expect(freq).toBeGreaterThanOrEqual(40)
        expect(freq).toBeLessThanOrEqual(4_000)
      }
      for (const overtone of tone.overtones ?? []) {
        expect(overtone.ratio).toBeGreaterThan(1)
        expect(overtone.gain).toBeLessThan(1)
      }
    }
    for (const burst of recipe.noise ?? []) expect(burst.gain).toBeLessThanOrEqual(0.5)
    // Kein Klang dauert länger als zwei Sekunden – Rückmeldung, keine Musik.
    expect(recipeDuration(recipe)).toBeLessThanOrEqual(2)
  })

  it('hält Abhaken und Zurücknehmen ganz kurz, das Zurücknehmen tiefer und ohne Hall', () => {
    expect(recipeDuration(SOUND_RECIPES.check)).toBeLessThan(0.6)
    expect(recipeDuration(SOUND_RECIPES.uncheck)).toBeLessThan(0.3)
    const lowest = (name: SoundName) => Math.min(...SOUND_RECIPES[name].tones.map((tone) => tone.glideTo ?? tone.freq))
    expect(lowest('uncheck')).toBeLessThan(lowest('check'))
    expect(SOUND_RECIPES.uncheck.echo).toBe(0)
  })

  it('Abhaken und Boss-Treffer klingen zusammen: hörbare Töne nur aus dem C-Dur-Dreiklang, der Treffer sanfter', () => {
    // Fast jedes Abhaken zieht einen Boss-Treffer nach sich – mitten ins Ausklingen. Ein A über dem G würde reiben.
    const pitchClass = (freq: number) => ((Math.round(12 * Math.log2(freq / 261.63)) % 12) + 12) % 12
    const triad = new Set([0, 4, 7]) // C, E, G
    for (const name of ['check', 'bossHit'] as const) {
      for (const tone of SOUND_RECIPES[name].tones.filter((candidate) => candidate.freq >= 500)) {
        expect(triad.has(pitchClass(tone.freq)), `${name} ${tone.freq} Hz`).toBe(true)
      }
    }
    const loudest = (name: SoundName) => Math.max(...SOUND_RECIPES[name].tones.filter((tone) => tone.freq >= 500).map((tone) => tone.gain))
    expect(loudest('bossHit')).toBeLessThan(loudest('check'))
  })

  it('lässt das Level-Up-Arpeggio steigen', () => {
    const steps = SOUND_RECIPES.levelUp.tones.filter((tone) => tone.wave === 'triangle').map((tone) => [tone.at, tone.freq])
    expect(steps.length).toBeGreaterThanOrEqual(4)
    for (let index = 1; index < steps.length; index += 1) {
      expect(steps[index][0]).toBeGreaterThan(steps[index - 1][0])
      expect(steps[index][1]).toBeGreaterThan(steps[index - 1][1])
    }
  })

  it('lässt die Entwicklung aufsteigend schimmern', () => {
    const [swell] = SOUND_RECIPES.evolve.tones
    expect(swell.glideTo).toBeGreaterThan(swell.freq)
    expect(swell.attack).toBeGreaterThan(0.2)
  })

  it('misst Töne mit Einschwingen und Abklingen', () => {
    expect(toneEnd({ at: 0.1, freq: 440, dur: 0.5, gain: 0.3 })).toBeCloseTo(0.605)
    expect(toneEnd({ at: 0, freq: 440, dur: 0.5, gain: 0.3, attack: 0.2 })).toBeCloseTo(0.7)
    expect(recipeDuration({ echo: 0, tones: [], noise: [{ at: 0.1, dur: 0.2, gain: 0.1, cutoff: 800 }] })).toBeCloseTo(0.3)
  })
})
