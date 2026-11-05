import { describe, expect, it } from 'vitest'
import { makeEndBoss } from '../../domain/testing'
import { END_BOSS_PHASE_LABELS, endBossHpText, endBossPhase, endBossStatusText } from './endBossText'

const definition = makeEndBoss('end-test', {
  name: 'Der Bibliothekar der Ewigkeit',
  description: 'Er hütet das letzte Regal.',
  defeatLine: 'Die Uhr bleibt stehen – du hast es geschafft.',
})

describe('endBossPhase', () => {
  it('besiegt vor erwacht vor schlafend', () => {
    expect(endBossPhase({ awakened: false, defeated: false })).toBe('asleep')
    expect(endBossPhase({ awakened: true, defeated: false })).toBe('awakened')
    // Ein vorab abgeschlossenes letztes Kapitel ist besiegt, auch wenn er nie „erwachte“.
    expect(endBossPhase({ awakened: false, defeated: true })).toBe('defeated')
    expect(END_BOSS_PHASE_LABELS).toEqual({ asleep: 'schläft noch', awakened: 'ist erwacht', defeated: 'besiegt' })
  })
})

describe('endBossStatusText', () => {
  it('erklärt sanft, wann er erwacht, und zitiert den Sieg', () => {
    expect(endBossStatusText({ awakened: false, defeated: false, definition }, 3)).toBe(
      'Schläft noch – erwacht, sobald deine übrigen 3 Kapitel geschafft sind.',
    )
    expect(endBossStatusText({ awakened: false, defeated: false, definition }, 1)).toBe(
      'Schläft noch – erwacht, sobald dein letztes übriges Kapitel geschafft ist.',
    )
    expect(endBossStatusText({ awakened: true, defeated: false, definition }, 0)).toBe('Erwacht! Er hütet das letzte Regal.')
    expect(endBossStatusText({ awakened: true, defeated: true, definition }, 0)).toBe(
      '„Die Uhr bleibt stehen – du hast es geschafft.“',
    )
  })
})

describe('endBossHpText', () => {
  it('zeigt Lebenspunkte in Zahlen – manuelle Kapitel als unbesiegt/besiegt', () => {
    expect(endBossHpText({ hp: 8, maxHp: 30, defeated: false }, false)).toEqual({
      value: '8 / 30',
      spoken: 'noch 8 von 30 Lebenspunkten',
    })
    expect(endBossHpText({ hp: 1250.5, maxHp: 5000, defeated: false }, false).value).toBe('1.250,5 / 5.000')
    expect(endBossHpText({ hp: 1, maxHp: 1, defeated: false }, true)).toEqual({
      value: 'unbesiegt',
      spoken: 'unbesiegt – ein Haken genügt',
    })
    expect(endBossHpText({ hp: 0, maxHp: 1, defeated: true }, true).value).toBe('besiegt')
  })
})
