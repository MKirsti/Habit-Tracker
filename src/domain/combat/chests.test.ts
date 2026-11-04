import { describe, expect, it } from 'vitest'
import { BALANCING } from '../balancing'
import { makeChest, makeCompletion, makeFrame, makeHabit, makeTitle } from '../testing'
import type { Chest, ChestRarity, Completion, DayKey } from '../types'
import {
  LEGENDARY_FALLBACK_GOLD,
  RARE_FALLBACK_GOLD,
  bossChestId,
  chapterChestId,
  chestContent,
  chestGold,
  chestGoldAmount,
  chestRarity,
  chestRollKey,
  chestWindowStart,
  contentOnOpen,
  findChests,
  isQuestDrop,
  openedChestCosmetics,
  openedFreezeChests,
  questChestId,
  unopenedChestCount,
  unrecordedChests,
} from './chests'
import type { FindChestsInput } from './chests'
import { FRAMES, TITLES } from './cosmeticDefinitions'

const SEED = '2026-01-01Aria'
// 2026-11-02 ist ein Montag.
const TODAY: DayKey = '2026-11-04' // Mittwoch

const NO_TITLES = [] as const
const RARE_FRAMES = [
  makeFrame('ember', { type: 'chest' }, { rarity: 'rare' }),
  makeFrame('frost', { type: 'chest' }, { rarity: 'rare' }),
  makeFrame('gilded', { type: 'level', level: 10 }, { rarity: 'rare' }), // keine Truhen-Bedingung
]
const LEGENDARY_TITLES = [makeTitle('dragonheart', { type: 'chest' }, { rarity: 'legendary' })]
const LEGENDARY_FRAMES = [makeFrame('starfall', { type: 'chest' }, { rarity: 'legendary' })]

/** Eine Quest-ID, deren Erledigung an `day` eine Truhe fallen lässt (bzw. nicht). */
function habitIdWithDrop(day: DayKey, drops: boolean, start = 0): string {
  for (let i = start; i < 10_000; i++) {
    const id = `h${i}`
    if (isQuestDrop(SEED, `${id}:${day}`) === drops) return id
  }
  throw new Error('keine passende Quest-ID gefunden')
}

/** IDs der Form `<prefix><n>`, die für den Helden `SEED` die gewünschte Seltenheit haben. */
function idsWithRarity(prefix: string, rarity: ChestRarity, count: number): string[] {
  const ids: string[] = []
  for (let i = 0; ids.length < count && i < 100_000; i++) {
    if (chestRarity(chestRollKey(SEED, `${prefix}${i}`)) === rarity) ids.push(`${prefix}${i}`)
  }
  return ids
}

function done(habitId: string, day: DayKey, overrides: Partial<Completion> = {}): Completion {
  return makeCompletion(makeHabit({ id: habitId }), day, overrides)
}

function find(overrides: Partial<FindChestsInput> = {}): Chest[] {
  return findChests({
    heroSeed: SEED,
    today: TODAY,
    completions: [],
    victories: [],
    chapters: [],
    stored: undefined,
    unlocked: { titles: [], frames: [] },
    titles: [...NO_TITLES],
    frames: RARE_FRAMES,
    ...overrides,
  })
}

describe('IDs & Fenster', () => {
  it('deterministische IDs', () => {
    expect(bossChestId('2026-11-02')).toBe('boss:2026-11-02')
    expect(questChestId('h1:2026-11-04')).toBe('quest:h1:2026-11-04')
    expect(chapterChestId('q1', 'c2')).toBe('chapter:q1:c2')
  })

  it('Fenster: Montag der Woche von gestern (montags also die Vorwoche)', () => {
    expect(chestWindowStart('2026-11-04')).toBe('2026-11-02')
    expect(chestWindowStart('2026-11-03')).toBe('2026-11-02')
    expect(chestWindowStart('2026-11-02')).toBe('2026-10-26')
  })
})

describe('Seltenheit & Inhalt', () => {
  it('Seltenheit ist deterministisch und folgt grob 70/22/7/1', () => {
    const n = 100_000
    const counts: Record<ChestRarity, number> = { common: 0, uncommon: 0, rare: 0, legendary: 0 }
    for (let i = 0; i < n; i++) counts[chestRarity(`quest:h${i % 97}:2026-${i}`)]++
    expect(chestRarity('boss:2026-11-02')).toBe(chestRarity('boss:2026-11-02'))
    const share = (rarity: ChestRarity) => counts[rarity] / n
    expect(share('common')).toBeGreaterThan(0.68)
    expect(share('common')).toBeLessThan(0.72)
    expect(share('uncommon')).toBeGreaterThan(0.2)
    expect(share('uncommon')).toBeLessThan(0.24)
    expect(share('rare')).toBeGreaterThan(0.06)
    expect(share('rare')).toBeLessThan(0.08)
    expect(share('legendary')).toBeGreaterThan(0.007)
    expect(share('legendary')).toBeLessThan(0.013)
  })

  it('Gold gleichverteilt im Bereich, beide Enden erreichbar', () => {
    for (const rarity of ['common', 'uncommon'] as const) {
      const [min, max] = BALANCING.chests.gold[rarity]
      const amounts = new Set<number>()
      for (let i = 0; i < 5000; i++) {
        const amount = chestGoldAmount(`id${i}`, rarity)
        expect(Number.isInteger(amount)).toBe(true)
        expect(amount).toBeGreaterThanOrEqual(min)
        expect(amount).toBeLessThanOrEqual(max)
        amounts.add(amount)
      }
      expect(amounts.has(min)).toBe(true)
      expect(amounts.has(max)).toBe(true)
      expect(amounts.size).toBe(max - min + 1)
    }
  })

  it('common/uncommon: Gold aus dem Bereich der Seltenheit', () => {
    const context = { taken: new Set<string>(), titles: [], frames: RARE_FRAMES }
    expect(chestContent('x', 'common', context)).toEqual({ kind: 'gold', amount: chestGoldAmount('x', 'common') })
    expect(chestContent('x', 'uncommon', context)).toEqual({ kind: 'gold', amount: chestGoldAmount('x', 'uncommon') })
  })

  it('rare: etwa halb Streak-Schutz, halb Truhen-Rahmen der Seltenheit rare', () => {
    const context = { taken: new Set<string>(), titles: [], frames: RARE_FRAMES }
    let freezes = 0
    const frames = new Set<string>()
    const n = 2000
    for (let i = 0; i < n; i++) {
      const content = chestContent(`rare${i}`, 'rare', context)
      if (content.kind === 'item') {
        expect(content.itemId).toBe('streakFreeze')
        freezes++
      } else {
        expect(content.kind).toBe('cosmetic')
        if (content.kind === 'cosmetic') {
          expect(content.cosmeticKind).toBe('frame')
          frames.add(content.cosmeticId)
        }
      }
    }
    expect(freezes / n).toBeGreaterThan(0.45)
    expect(freezes / n).toBeLessThan(0.55)
    // Nur Truhen-Rahmen; der Rahmen mit Level-Bedingung liegt nie in einer Truhe.
    expect([...frames].sort()).toEqual(['ember', 'frost'])
  })

  it('rare ohne freien Truhen-Rahmen → 100 Gold (der Streak-Schutz-Anteil bleibt)', () => {
    const taken = new Set(['frame:ember', 'frame:frost'])
    const kinds = new Set<string>()
    for (let i = 0; i < 200; i++) {
      const content = chestContent(`rare${i}`, 'rare', { taken, titles: [], frames: RARE_FRAMES })
      kinds.add(content.kind === 'gold' ? `gold:${content.amount}` : content.kind)
    }
    expect([...kinds].sort()).toEqual([`gold:${RARE_FALLBACK_GOLD}`, 'item'])
  })

  it('legendary: Truhen-Titel oder -Rahmen der Seltenheit legendary, sonst 150 Gold', () => {
    const context = { taken: new Set<string>(), titles: LEGENDARY_TITLES, frames: [...RARE_FRAMES, ...LEGENDARY_FRAMES] }
    const picks = new Set<string>()
    for (let i = 0; i < 200; i++) {
      const content = chestContent(`leg${i}`, 'legendary', context)
      expect(content.kind).toBe('cosmetic')
      if (content.kind === 'cosmetic') picks.add(`${content.cosmeticKind}:${content.cosmeticId}`)
    }
    expect([...picks].sort()).toEqual(['frame:starfall', 'title:dragonheart'])

    const allTaken = { ...context, taken: new Set(['title:dragonheart', 'frame:starfall']) }
    expect(chestContent('leg1', 'legendary', allTaken)).toEqual({ kind: 'gold', amount: LEGENDARY_FALLBACK_GOLD })
    expect(chestContent('leg1', 'legendary', { taken: new Set(), titles: [], frames: [] })).toEqual({
      kind: 'gold',
      amount: LEGENDARY_FALLBACK_GOLD,
    })
  })
})

describe('Quest-Truhen', () => {
  it('etwa 10 % der Erledigungen lassen eine Truhe fallen', () => {
    let drops = 0
    const n = 20_000
    for (let i = 0; i < n; i++) if (isQuestDrop(SEED, `h${i}:2026-11-04`)) drops++
    expect(drops / n).toBeGreaterThan(0.09)
    expect(drops / n).toBeLessThan(0.11)
  })

  it('eine Erledigung mit Fund → Truhe quest:<completionId> am Tag der Erledigung', () => {
    const habitId = habitIdWithDrop('2026-11-03', true)
    const chests = find({ completions: [done(habitId, '2026-11-03')] })
    expect(chests).toHaveLength(1)
    expect(chests[0]).toMatchObject({ id: `quest:${habitId}:2026-11-03`, source: 'quest', foundDay: '2026-11-03' })
    expect(chests[0].openedAt).toBeUndefined()
    expect(chests[0].rarity).toBe(chestRarity(chestRollKey(SEED, chests[0].id)))
  })

  it('Teilfortschritt und Erledigungen ohne Fund bringen nichts', () => {
    const lucky = habitIdWithDrop(TODAY, true)
    const unlucky = habitIdWithDrop(TODAY, false)
    expect(find({ completions: [done(lucky, TODAY, { value: 0.5 }), done(unlucky, TODAY)] })).toEqual([])
  })

  it('höchstens eine Quest-Truhe pro Tag – die erste nach ID', () => {
    const first = habitIdWithDrop(TODAY, true)
    const second = habitIdWithDrop(TODAY, true, Number(first.slice(1)) + 1)
    const ids = [first, second].map((id) => `${id}:${TODAY}`).sort()
    const chests = find({ completions: [done(second, TODAY), done(first, TODAY)] })
    expect(chests.map((chest) => chest.id)).toEqual([`quest:${ids[0]}`])
  })

  it('an verschiedenen Tagen je eine', () => {
    const a = habitIdWithDrop('2026-11-02', true)
    const b = habitIdWithDrop('2026-11-03', true)
    expect(find({ completions: [done(a, '2026-11-02'), done(b, '2026-11-03')] })).toHaveLength(2)
  })

  it('gespeicherte Quest-Truhen des Tages zählen mit: Zurücknehmen und eine andere abhaken bringt keine zweite', () => {
    const first = habitIdWithDrop(TODAY, true)
    const second = habitIdWithDrop(TODAY, true, Number(first.slice(1)) + 1)
    const stored = find({ completions: [done(first, TODAY)] })
    expect(stored).toHaveLength(1)
    // Die erste Quest wird zurückgenommen, die zweite (auch mit Fund) erledigt.
    const after = find({ completions: [done(second, TODAY)], stored })
    expect(after).toEqual(stored)
  })

  it('Abhaken → Zurücknehmen → wieder Abhaken ergibt dieselbe Truhe (gespeichert oder nicht)', () => {
    const habitId = habitIdWithDrop(TODAY, true)
    const once = find({ completions: [done(habitId, TODAY)] })
    expect(find({ completions: [] })).toEqual([])
    const again = find({ completions: [done(habitId, TODAY, { updatedAt: 99 })] })
    expect(again).toEqual(once)
    // Gespeichert bleibt sie auch ohne die Erledigung – und kommt nicht doppelt.
    expect(find({ completions: [], stored: once })).toEqual(once)
    expect(find({ completions: [done(habitId, TODAY)], stored: once })).toEqual(once)
  })

  it('nur Tage im Fenster (diese Woche bzw. montags auch die Vorwoche) und bis heute', () => {
    const before = habitIdWithDrop('2026-11-01', true)
    const future = habitIdWithDrop('2026-11-05', true)
    expect(find({ completions: [done(before, '2026-11-01'), done(future, '2026-11-05')] })).toEqual([])
    // Montags gehört der Sonntag (Nachtragen) noch dazu.
    expect(find({ today: '2026-11-02', completions: [done(before, '2026-11-01')] })).toHaveLength(1)
  })
})

describe('Boss- und Kapitel-Truhen', () => {
  it('je Boss-Sieg eine Truhe am Tag des Siegs – auch für gespeicherte Siege außerhalb des Fensters', () => {
    const chests = find({
      victories: [
        { weekStart: '2026-11-02', day: '2026-11-04' },
        { weekStart: '2026-10-05', day: '2026-10-09' },
        { weekStart: '2026-11-02', day: '2026-11-04' }, // doppelt
      ],
    })
    expect(chests.map((chest) => [chest.id, chest.source, chest.foundDay])).toEqual([
      ['boss:2026-10-05', 'boss', '2026-10-09'],
      ['boss:2026-11-02', 'boss', '2026-11-04'],
    ])
  })

  it('Kapitel-Truhe je abgeschlossenem Kapitel mit Abschlusstag im Fenster', () => {
    const chests = find({
      chapters: [
        { questId: 'q1', chapterId: 'c1', doneDay: '2026-11-03' },
        { questId: 'q1', chapterId: 'c0', doneDay: '2026-10-20' }, // früher – längst gespeichert
        { questId: 'q2', chapterId: 'c9' }, // ohne bekannten Tag
      ],
    })
    expect(chests.map((chest) => [chest.id, chest.source, chest.foundDay])).toEqual([
      ['chapter:q1:c1', 'chapter', '2026-11-03'],
    ])
  })
})

describe('gespeicherte Truhen & Kosmetik', () => {
  it('gespeicherte Truhen ändern sich nie – Inhalt, Seltenheit und Öffnen bleiben', () => {
    const stored = [
      makeChest('boss:2026-11-02', { foundDay: '2026-11-03', rarity: 'legendary', content: { kind: 'gold', amount: 7 } }),
      makeChest('quest:x:2026-10-01', { foundDay: '2026-10-01', openedAt: 123 }),
    ]
    const chests = find({ stored, victories: [{ weekStart: '2026-11-02', day: '2026-11-04' }] })
    expect(chests).toEqual([stored[1], stored[0]])
  })

  it('doppelte gespeicherte IDs: die erste gilt', () => {
    const stored = [makeChest('boss:2026-11-02', { foundDay: '2026-11-03' }), makeChest('boss:2026-11-02', { rarity: 'rare' })]
    expect(find({ stored })).toEqual([stored[0]])
  })

  it('eine neue Truhe bringt nie eine schon freigeschaltete oder versprochene Kosmetik', () => {
    const [a, b, c] = idsWithRarity('chapter:q:', 'legendary', 3)
    const frames = [...LEGENDARY_FRAMES]
    const titles = [...LEGENDARY_TITLES]
    const chapters = [a, b, c].map((id) => ({ questId: 'q', chapterId: id.slice('chapter:q:'.length), doneDay: TODAY }))
    const chests = find({ chapters, titles, frames })
    const contents = chests.map((chest) => chest.content)
    const cosmetics = contents.filter((content) => content.kind === 'cosmetic')
    expect(cosmetics).toHaveLength(2)
    expect(new Set(cosmetics.map((content) => (content.kind === 'cosmetic' ? content.cosmeticId : ''))).size).toBe(2)
    expect(contents.filter((content) => content.kind === 'gold')).toEqual([{ kind: 'gold', amount: LEGENDARY_FALLBACK_GOLD }])

    // Freigeschaltet oder schon in einer (ungeöffneten) Truhe → nicht noch einmal.
    const unlocked = find({ chapters: chapters.slice(0, 1), titles, frames, unlocked: { titles: ['dragonheart'], frames: [] } })
    expect(unlocked[0].content).toEqual({ kind: 'cosmetic', cosmeticKind: 'frame', cosmeticId: 'starfall' })
    const promised = find({
      chapters: chapters.slice(0, 1),
      titles,
      frames,
      stored: [makeChest('quest:x:2026-10-01', { content: { kind: 'cosmetic', cosmeticKind: 'frame', cosmeticId: 'starfall' } })],
    })
    expect(promised.find((chest) => chest.source === 'chapter')?.content).toEqual({
      kind: 'cosmetic',
      cosmeticKind: 'title',
      cosmeticId: 'dragonheart',
    })
  })
})

describe('Gold, Streak-Schutz und Kosmetik aus geöffneten Truhen', () => {
  const chests = [
    makeChest('a', { content: { kind: 'gold', amount: 40 }, openedAt: 1 }),
    makeChest('b', { content: { kind: 'gold', amount: 60 } }), // ungeöffnet
    makeChest('c', { content: { kind: 'item', itemId: 'streakFreeze' }, openedAt: 2 }),
    makeChest('d', { content: { kind: 'item', itemId: 'streakFreeze' } }), // ungeöffnet
    makeChest('e', { content: { kind: 'cosmetic', cosmeticKind: 'title', cosmeticId: 't1' }, openedAt: 3 }),
    makeChest('f', { content: { kind: 'gold', amount: Number.NaN }, openedAt: 4 }),
    // Ersatz-Gold für einen Streak-Schutz bei vollem Vorrat: beim Öffnen als Gold gespeichert
    makeChest('g', { rarity: 'rare', content: { kind: 'gold', amount: BALANCING.chests.freezeFallbackGold }, openedAt: 5 }),
  ]

  it('chestGold zählt nur geöffnete Truhen mit gültigem Gold', () => {
    expect(chestGold(chests)).toBe(40 + BALANCING.chests.freezeFallbackGold)
    expect(chestGold(undefined)).toBe(0)
  })

  it('Streak-Schutz nur aus geöffneten Truhen; ungeöffnete zählen', () => {
    expect(openedFreezeChests(chests).map((chest) => chest.id)).toEqual(['c'])
    expect(unopenedChestCount(chests)).toBe(2)
    expect(openedChestCosmetics(chests)).toEqual([{ kind: 'title', id: 't1' }])
  })
})

describe('Recorder & Öffnen', () => {
  it('unrecordedChests: nur die noch nicht gespeicherten', () => {
    const stored = [makeChest('boss:2026-10-26')]
    const all = [...stored, makeChest('boss:2026-11-02')]
    expect(unrecordedChests(all, stored).map((chest) => chest.id)).toEqual(['boss:2026-11-02'])
    expect(unrecordedChests(all, undefined)).toHaveLength(2)
  })

  it('contentOnOpen: Streak-Schutz bei vollem Vorrat → Ersatz-Gold, sonst unverändert', () => {
    const freeze = { kind: 'item', itemId: 'streakFreeze' } as const
    const max = BALANCING.items.streakFreeze.max
    expect(contentOnOpen(freeze, max - 1)).toEqual(freeze)
    expect(contentOnOpen(freeze, max)).toEqual({ kind: 'gold', amount: BALANCING.chests.freezeFallbackGold })
    expect(contentOnOpen({ kind: 'gold', amount: 30 }, max)).toEqual({ kind: 'gold', amount: 30 })
    const cosmetic = { kind: 'cosmetic', cosmeticKind: 'frame', cosmeticId: 'aurora' } as const
    expect(contentOnOpen(cosmetic, max)).toEqual(cosmetic)
  })
})

describe('mit dem echten Inhalt', () => {
  it('Truhen-Kosmetik stammt nur aus dem Truhen-Pool der passenden Seltenheit; jede ist erreichbar', () => {
    const pool = new Map<string, string>()
    for (const title of TITLES) if (title.condition.type === 'chest') pool.set(`title:${title.id}`, title.rarity)
    for (const frame of FRAMES) if (frame.condition.type === 'chest') pool.set(`frame:${frame.id}`, frame.rarity)
    const seen = new Set<string>()
    for (const rarity of ['rare', 'legendary'] as const) {
      for (let i = 0; i < 3000; i++) {
        const content = chestContent(`real${i}`, rarity, { taken: new Set() })
        if (content.kind !== 'cosmetic') continue
        const key = `${content.cosmeticKind}:${content.cosmeticId}`
        expect(pool.get(key), key).toBe(rarity)
        seen.add(key)
      }
    }
    expect([...seen].sort()).toEqual([...pool.keys()].sort())
  })
})
