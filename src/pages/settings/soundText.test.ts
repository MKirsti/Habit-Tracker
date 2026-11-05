import { describe, expect, it } from 'vitest'
import { SOUND_NAMES } from '../../features/sound'
import { SOUND_SAMPLES, nextSample } from './soundText'

describe('soundText', () => {
  it('spielt die Klänge des Sound-Moduls der Reihe nach vor (im Kreis) – jeden höchstens einmal', () => {
    expect(SOUND_SAMPLES.map((sample) => sample.sound)).toEqual([
      'check',
      'bossHit',
      'chest',
      'achievement',
      'levelUp',
      'victory',
      'evolve',
    ])
    for (const sample of SOUND_SAMPLES) expect(SOUND_NAMES).toContain(sample.sound)
    expect(new Set(SOUND_SAMPLES.map((sample) => sample.sound)).size).toBe(SOUND_SAMPLES.length)
    expect(nextSample(0)).toBe(1)
    expect(nextSample(SOUND_SAMPLES.length - 1)).toBe(0)
    expect(nextSample(-3)).toBe(1)
  })
})
