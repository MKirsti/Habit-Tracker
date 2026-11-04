import { describe, expect, it } from 'vitest'
import { makeChest, makeCosmeticUnlock, makeFrame, makeTitle } from '../testing'
import type { CosmeticCondition } from '../types'
import {
  activeFrame,
  activeTitle,
  cosmeticConditionProgress,
  isCosmeticConditionMet,
  titleNameFor,
  unlockedCosmetics,
} from './cosmetics'
import type { CosmeticFacts } from './cosmetics'

function facts(overrides: Partial<CosmeticFacts> = {}): CosmeticFacts {
  return { achievements: [], victories: [], campaignsMastered: 0, level: 1, unlocks: undefined, ...overrides }
}

describe('Bedingungen', () => {
  const cases: [string, CosmeticCondition, CosmeticFacts, boolean][] = [
    ['Erfolg freigeschaltet', { type: 'achievement', achievementId: 'streak-7' }, facts({ achievements: ['streak-7'] }), true],
    ['Erfolg fehlt', { type: 'achievement', achievementId: 'streak-7' }, facts({ achievements: ['streak-3'] }), false],
    ['3 Boss-Siege erreicht', { type: 'bossVictories', count: 3 }, facts({ victories: [{ bossId: 'a' }, { bossId: 'a' }, { bossId: 'b' }] }), true],
    ['2 von 3 Boss-Siegen', { type: 'bossVictories', count: 3 }, facts({ victories: [{ bossId: 'a' }, { bossId: 'b' }] }), false],
    ['bestimmter Boss besiegt', { type: 'bossDefeated', bossId: 'hydra' }, facts({ victories: [{ bossId: 'hydra' }] }), true],
    ['anderer Boss besiegt', { type: 'bossDefeated', bossId: 'hydra' }, facts({ victories: [{ bossId: 'golem' }] }), false],
    ['Kampagnen gemeistert', { type: 'campaignsMastered', count: 1 }, facts({ campaignsMastered: 1 }), true],
    ['keine Kampagne gemeistert', { type: 'campaignsMastered', count: 1 }, facts(), false],
    ['Level erreicht', { type: 'level', level: 10 }, facts({ level: 12 }), true],
    ['Level zu niedrig', { type: 'level', level: 10 }, facts({ level: 9 }), false],
    ['immer', { type: 'always' }, facts(), true],
    ['Truhe nie über die Bedingung', { type: 'chest' }, facts({ level: 99 }), false],
  ]

  for (const [label, condition, input, expected] of cases) {
    it(label, () => {
      expect(isCosmeticConditionMet(condition, input)).toBe(expected)
    })
  }

  it('Fortschritt für gesperrte Titel, auf das Ziel begrenzt', () => {
    expect(cosmeticConditionProgress({ type: 'bossVictories', count: 5 }, facts({ victories: [{ bossId: 'a' }, { bossId: 'b' }] }))).toEqual({
      current: 2,
      target: 5,
    })
    expect(cosmeticConditionProgress({ type: 'level', level: 10 }, facts({ level: 30 }))).toEqual({ current: 10, target: 10 })
    expect(cosmeticConditionProgress({ type: 'level', level: 10 }, facts({ level: Number.NaN }))).toEqual({ current: 0, target: 10 })
  })
})

describe('unlockedCosmetics', () => {
  const titles = [
    makeTitle('wanderer', { type: 'always' }),
    makeTitle('slayer', { type: 'bossVictories', count: 1 }),
    makeTitle('dragonheart', { type: 'chest' }, { rarity: 'legendary' }),
  ]
  const frames = [
    makeFrame('bronze', { type: 'level', level: 5 }),
    makeFrame('ember', { type: 'chest' }, { rarity: 'rare' }),
    makeFrame('ivy', { type: 'campaignsMastered', count: 1 }),
  ]

  it('Bedingung erfüllt oder per Truhe freigeschaltet – in Definitionsreihenfolge', () => {
    const result = unlockedCosmetics(
      facts({
        level: 5,
        unlocks: [makeCosmeticUnlock('dragonheart', 'title'), makeCosmeticUnlock('unknown', 'frame')],
      }),
      titles,
      frames,
    )
    expect(result).toEqual({ titles: ['wanderer', 'dragonheart'], frames: ['bronze'] })
  })

  it('die Art zählt: ein Titel-Unlock schaltet keinen gleichnamigen Rahmen frei', () => {
    const result = unlockedCosmetics(facts({ unlocks: [makeCosmeticUnlock('ember', 'title')] }), titles, frames)
    expect(result.frames).not.toContain('ember')
  })

  it('Kosmetik aus geöffneten Truhen zählt, auch wenn der CosmeticUnlock fehlt; ungeöffnete nicht', () => {
    const result = unlockedCosmetics(
      facts({
        chests: [
          makeChest('a', { content: { kind: 'cosmetic', cosmeticKind: 'frame', cosmeticId: 'ember' }, openedAt: 1 }),
          makeChest('b', { content: { kind: 'cosmetic', cosmeticKind: 'title', cosmeticId: 'dragonheart' } }),
        ],
      }),
      titles,
      frames,
    )
    expect(result).toEqual({ titles: ['wanderer'], frames: ['ember'] })
  })

  it('Boss-Siege und Kampagnen schalten frei', () => {
    const result = unlockedCosmetics(facts({ victories: [{ bossId: 'x' }], campaignsMastered: 2 }), titles, frames)
    expect(result).toEqual({ titles: ['wanderer', 'slayer'], frames: ['ivy'] })
  })
})

describe('gewählter Titel & Rahmen', () => {
  const titles = [makeTitle('wanderer', { type: 'always' }), makeTitle('slayer', { type: 'bossVictories', count: 1 })]
  const frames = [makeFrame('bronze', { type: 'level', level: 5 })]

  it('nur angezeigt, solange freigeschaltet', () => {
    expect(activeTitle({ titleId: 'slayer' }, { titles: ['wanderer', 'slayer'] }, titles)?.id).toBe('slayer')
    expect(activeTitle({ titleId: 'slayer' }, { titles: ['wanderer'] }, titles)).toBeUndefined()
    expect(activeTitle({}, { titles: ['wanderer'] }, titles)).toBeUndefined()
    expect(activeTitle(undefined, { titles: ['wanderer'] }, titles)).toBeUndefined()
    expect(activeFrame({ frameId: 'bronze' }, { frames: ['bronze'] }, frames)?.id).toBe('bronze')
    expect(activeFrame({ frameId: 'bronze' }, { frames: [] }, frames)).toBeUndefined()
    expect(activeFrame({ frameId: 'gone' }, { frames: ['gone'] }, frames)).toBeUndefined()
  })

  it('Titel in der Sprachform des Helden, ohne Angabe neutral', () => {
    expect(titleNameFor(titles[0], 'female')).toBe('die wanderer')
    expect(titleNameFor(titles[0], 'male')).toBe('der wanderer')
    expect(titleNameFor(titles[0])).toBe('wanderer')
  })
})
