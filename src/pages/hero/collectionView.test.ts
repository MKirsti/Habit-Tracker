import { describe, expect, it } from 'vitest'
import { ATTRIBUTE_IDS } from '../../domain/attributes'
import { BOSSES } from '../../domain/combat/bosses'
import { FRAMES, TITLES } from '../../domain/combat/cosmeticDefinitions'
import type { BossDefinition, BossVictory, Chest, WeeklyBossState } from '../../domain/types'
import { CHEST_THEMES } from '../../features/combat/chestTheme'
import {
  RARITY_COLORS,
  allVictories,
  bestiary,
  bestiarySummary,
  bossThemeTitle,
  bossThemeOf,
  chestContentInfo,
  chestOpenButtonId,
  chestSource,
  cosmeticOptions,
  isKnownBoss,
  openedChests,
  unopenedChests,
  unopenedCountText,
} from './collectionView'

function boss(id: string): BossDefinition {
  const found = BOSSES.find((entry) => entry.id === id)
  if (!found) throw new Error(`Unbekannter Boss ${id}`)
  return found
}

function weeklyBoss(id: string, weekStart: string, defeated: boolean, defeatedDay?: string): WeeklyBossState {
  return {
    boss: boss(id),
    weekStart,
    weekEnd: '2026-11-08',
    weakness: 'vitality',
    maxHp: 120,
    damage: defeated ? 120 : 40,
    hp: defeated ? 0 : 80,
    defeated,
    ...(defeatedDay ? { defeatedDay } : {}),
    daysLeft: 6,
    attacks: [],
  }
}

const VICTORIES: BossVictory[] = [
  { weekStart: '2026-10-12', bossId: 'bookworm-golem', day: '2026-10-15', maxHp: 90 },
  { weekStart: '2026-10-19', bossId: 'couch-golem', day: '2026-10-23', maxHp: 100 },
  { weekStart: '2026-10-26', bossId: 'couch-golem', day: '2026-10-30', maxHp: 110 },
]

describe('Bestiarium', () => {
  it('gruppiert alle 18 Bosse nach Thema und zählt Siege samt letztem Siegtag', () => {
    const groups = bestiary(VICTORIES)
    expect(groups.map((group) => group.theme)).toEqual(['strength', 'intellect', 'wisdom', 'charisma', 'vitality', 'discipline'])
    expect(groups.every((group) => group.entries.length === 3)).toBe(true)
    const couch = groups[0].entries.find((entry) => entry.boss.id === 'couch-golem')
    expect(couch).toMatchObject({ defeats: 2, lastDefeatedDay: '2026-10-30', facing: false })
    expect(groups[0].defeated).toBe(1)
    expect(groups[1].entries.find((entry) => entry.boss.id === 'bookworm-golem')?.defeats).toBe(1)
    expect(bestiarySummary(groups)).toEqual({ defeated: 2, total: 18, victories: 3 })
  })

  it('kennt den Gegner, dem du gerade gegenüberstehst – alle anderen bleiben unbekannt', () => {
    const groups = bestiary([], [weeklyBoss('lazy-hound', '2026-11-02', false), undefined])
    const hound = groups[0].entries.find((entry) => entry.boss.id === 'lazy-hound')
    expect(hound).toMatchObject({ defeats: 0, facing: true })
    expect(isKnownBoss(hound!)).toBe(true)
    const couch = groups[0].entries.find((entry) => entry.boss.id === 'couch-golem')
    expect(isKnownBoss(couch!)).toBe(false)
    // Ein besiegter Gegner ist kein „Im Kampf“ mehr.
    const won = bestiary([], [weeklyBoss('lazy-hound', '2026-11-02', true, '2026-11-03')])
    expect(won[0].entries.find((entry) => entry.boss.id === 'lazy-hound')?.facing).toBe(false)
  })

  it('zählt gerade errungene, noch nicht gespeicherte Siege mit (je Woche einer)', () => {
    const current = weeklyBoss('lazy-hound', '2026-11-02', true, '2026-11-03')
    const victories = allVictories(VICTORIES, { current })
    expect(victories).toHaveLength(4)
    expect(victories[3]).toEqual({ weekStart: '2026-11-02', bossId: 'lazy-hound', day: '2026-11-03', maxHp: 120 })
    // Schon gespeichert → nicht doppelt.
    expect(allVictories([...VICTORIES, victories[3]], { current })).toHaveLength(4)
    expect(allVictories(undefined, {})).toEqual([])
  })
})

describe('Truhen', () => {
  const chests: Chest[] = [
    { id: 'quest:h1:2026-11-01', source: 'quest', foundDay: '2026-11-01', rarity: 'common', content: { kind: 'gold', amount: 30 } },
    { id: 'chapter:q1:c2', source: 'chapter', foundDay: '2026-11-03', rarity: 'uncommon', content: { kind: 'gold', amount: 70 } },
    { id: 'boss:2026-10-26', source: 'boss', foundDay: '2026-11-03', rarity: 'rare', content: { kind: 'item', itemId: 'streakFreeze' } },
    {
      id: 'quest:h1:2026-10-28',
      source: 'quest',
      foundDay: '2026-10-28',
      rarity: 'legendary',
      content: { kind: 'cosmetic', cosmeticKind: 'title', cosmeticId: 'chosen-one' },
      openedAt: 2000,
    },
    { id: 'quest:h2:2026-10-27', source: 'quest', foundDay: '2026-10-27', rarity: 'common', content: { kind: 'gold', amount: 25 }, openedAt: 3000 },
  ]

  it('sortiert ungeöffnete (neueste, dann seltenere zuerst) und die Chronik (zuletzt geöffnete zuerst)', () => {
    expect(unopenedChests(chests).map((chest) => chest.id)).toEqual(['boss:2026-10-26', 'chapter:q1:c2', 'quest:h1:2026-11-01'])
    expect(openedChests(chests).map((chest) => chest.id)).toEqual(['quest:h2:2026-10-27', 'quest:h1:2026-10-28'])
    expect(unopenedCountText(1)).toBe('1 ungeöffnete Truhe')
    expect(unopenedCountText(3)).toBe('3 ungeöffnete Truhen')
  })

  it('nennt den Fundort aus der deterministischen ID', () => {
    const context = {
      habits: [
        { id: 'h1', title: 'Lesen', icon: '📖' },
        { id: 'h10', title: 'Laufen', icon: '🏃' },
      ],
      mainQuests: [
        {
          id: 'q1',
          title: 'Der Weg des Gelehrten',
          icon: '📚',
          chapters: [{ id: 'c2', title: 'Erste Seiten', criterion: { type: 'manual' as const } }],
        },
      ],
      victories: VICTORIES,
    }
    expect(chestSource(chests[2], context)).toEqual({ kind: 'boss', label: 'Boss-Truhe', detail: '🛋️ Sofagolem besiegt' })
    expect(chestSource(chests[0], context)).toEqual({ kind: 'quest', label: 'Quest-Truhe', detail: '📖 Lesen' })
    expect(chestSource({ id: 'quest:h10:2026-11-02', source: 'quest' }, context).detail).toBe('🏃 Laufen')
    expect(chestSource(chests[1], context)).toEqual({
      kind: 'chapter',
      label: 'Kapitel-Truhe',
      detail: '📚 Kapitel „Erste Seiten“',
    })
    // Gelöschte Quest, unbekanntes Kapitel, Sieg ohne Eintrag: neutrale Beschreibung.
    expect(chestSource({ id: 'quest:weg:2026-11-02', source: 'quest' }, context).detail).toBe('Eine erledigte Quest')
    expect(chestSource({ id: 'chapter:dev-123', source: 'chapter' }, context).detail).toBe('Ein abgeschlossenes Kapitel')
    expect(chestSource({ id: 'boss:2026-09-07', source: 'boss' }, context).detail).toBe('Wochen-Boss besiegt')
  })

  it('beschreibt den Inhalt – Titel in der Sprachform des Helden', () => {
    expect(chestContentInfo({ kind: 'gold', amount: 1250 })).toEqual({ icon: '🪙', label: '1.250 Gold' })
    expect(chestContentInfo({ kind: 'item', itemId: 'streakFreeze' })).toEqual({ icon: '❄️', label: 'Streak-Schutz' })
    const title = { kind: 'cosmetic' as const, cosmeticKind: 'title' as const, cosmeticId: 'chosen-one' }
    expect(chestContentInfo(title, 'female').label).toBe('Titel „die Auserwählte“')
    expect(chestContentInfo(title, 'male').label).toBe('Titel „der Auserwählte“')
    expect(chestContentInfo(title).label).toBe('Titel „vom Schicksal erwählt“')
    expect(chestContentInfo({ kind: 'cosmetic', cosmeticKind: 'frame', cosmeticId: 'stardust' })).toEqual({
      icon: '🖼️',
      label: 'Rahmen „Sternenstaub“',
    })
  })

  it('baut gültige DOM-IDs für die Öffnen-Knöpfe', () => {
    expect(chestOpenButtonId('boss:2026-10-26')).toBe('chest-open-boss_2026-10-26')
    expect(chestOpenButtonId('quest:a b:2026-11-01')).toMatch(/^[\w-]+$/)
  })
})

describe('Titel & Rahmen', () => {
  const facts = { achievements: ['streak-30'], victories: VICTORIES.slice(0, 1), campaignsMastered: 0, level: 4 }

  it('stellt freigeschaltete vor gesperrte (sonst Definitions-Reihenfolge)', () => {
    const options = cosmeticOptions(TITLES, ['fearless', 'daring'], facts)
    expect(options).toHaveLength(TITLES.length)
    expect(options.slice(0, 2).map((option) => [option.definition.id, option.unlocked])).toEqual([
      ['daring', true],
      ['fearless', true],
    ])
    expect(options.slice(2).every((option) => !option.unlocked)).toBe(true)
  })

  it('zeigt Fortschritt nur bei zählbaren Bedingungen', () => {
    const options = cosmeticOptions(TITLES, ['daring'], facts)
    const byId = (id: string) => options.find((option) => option.definition.id === id)
    expect(byId('monster-hunter')?.progress).toEqual({ current: 1, target: 5, text: '1 / 5 Boss-Siege' })
    expect(byId('seasoned')?.progress?.text).toBe('Level 4 / 10')
    expect(byId('summit-seeker')?.progress?.text).toBe('0 / 1 Kampagne')
    expect(byId('hall-of-fame')?.progress?.text).toBe('0 / 3 Kampagnen')
    expect(byId('balanced')?.progress).toBeUndefined()
    expect(byId('chosen-one')?.progress).toBeUndefined()
    expect(byId('daring')?.progress).toBeUndefined()

    const frames = cosmeticOptions(FRAMES, ['wanderwood', 'ember-wreath'], facts)
    expect(frames.find((option) => option.definition.id === 'bronze')?.progress?.text).toBe('Level 4 / 5')
    expect(frames.find((option) => option.definition.id === 'beast-fang')?.progress?.text).toBe('1 / 3 Boss-Siege')
  })
})

describe('Bestiarium: Themen im Genitiv', () => {
  it('„Bosse der Stärke“ – aber „Bosse des Charismas“ (Charisma ist sächlich)', () => {
    expect(bossThemeTitle('strength')).toBe('Bosse der Stärke')
    expect(bossThemeTitle('intellect')).toBe('Bosse der Intelligenz')
    expect(bossThemeTitle('wisdom')).toBe('Bosse der Weisheit')
    expect(bossThemeTitle('charisma')).toBe('Bosse des Charismas')
    expect(bossThemeTitle('vitality')).toBe('Bosse der Vitalität')
    expect(bossThemeTitle('discipline')).toBe('Bosse der Disziplin')
  })

  it('„ein Boss des Charismas“ – für die Silhouetten unbekannter Bosse', () => {
    expect(bossThemeOf('charisma')).toBe('des Charismas')
    expect(bossThemeOf('discipline')).toBe('der Disziplin')
    for (const id of ATTRIBUTE_IDS) expect(bossThemeTitle(id)).toBe(`Bosse ${bossThemeOf(id)}`)
  })
})

describe('Seltenheitsfarben', () => {
  it('sind überall dieselben wie bei Truhen-Dialog, Siegesszene und Meldung (Bronze, Silber, Blau-Violett, Gold)', () => {
    for (const rarity of ['common', 'uncommon', 'rare', 'legendary'] as const) {
      expect(RARITY_COLORS[rarity]).toBe(CHEST_THEMES[rarity].color)
    }
  })
})
