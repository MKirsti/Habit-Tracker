import { describe, expect, it } from 'vitest'
import { getAchievement } from '../achievements/definitions'
import { ATTRIBUTES } from '../attributes'
import { BALANCING } from '../balancing'
import type { ChestRarity, CosmeticCondition, FrameDefinition, GrammaticalForm, TitleDefinition } from '../types'
import { BOSSES } from './bosses'
import { FRAMES, RARITY_LABELS, TITLES } from './cosmeticDefinitions'

const FORMS: GrammaticalForm[] = ['female', 'male', 'neutral']
const RARITIES: ChestRarity[] = ['common', 'uncommon', 'rare', 'legendary']
const CONDITION_TYPES: CosmeticCondition['type'][] = [
  'achievement',
  'bossVictories',
  'bossDefeated',
  'campaignsMastered',
  'level',
  'chest',
  'always',
]
const GENDER_MARKERS = /[*:/_]|[a-zäöü]In(nen)?\b/
const GENDERED_NOUNS = /\b(Held|Heldin|Helden|Siegerin|Sieger|Kämpferin|Kämpfer|Meisterin|Meister)\b/

/**
 * Stabile IDs (stehen in `CharacterProfile.titleId`/`frameId` und `CosmeticUnlock`). Wer hier etwas ändern muss,
 * benennt einen Titel/Rahmen um – gewählte und aus Truhen freigeschaltete gingen verloren.
 */
const EXPECTED_TITLE_IDS = [
  'daring',
  'fearless', 'monster-hunter', 'beast-bane', 'scourge-of-darkness',
  'cushion-breaker', 'well-read', 'wolf-whisperer', 'sociable', 'dragon-tamer', 'go-getter',
  'balanced', 'flawless', 'flame-keeper', 'thousand-deeds', 'indomitable', 'phoenix',
  'seasoned', 'living-legend',
  'summit-seeker', 'hall-of-fame',
  'chosen-one', 'star-born', 'timeless',
]
const EXPECTED_FRAME_IDS = [
  'wanderwood', 'bronze', 'silver', 'gold',
  'ember-wreath', 'laurel',
  'beast-fang', 'limelight',
  'dragon-scale', 'moon-silver', 'aurora', 'stardust',
]

type Cosmetic = TitleDefinition | FrameDefinition
const ALL: { kind: 'title' | 'frame'; cosmetic: Cosmetic }[] = [
  ...TITLES.map((cosmetic) => ({ kind: 'title' as const, cosmetic })),
  ...FRAMES.map((cosmetic) => ({ kind: 'frame' as const, cosmetic })),
]

function hex(color: string): [number, number, number] {
  const value = color.slice(1)
  return [0, 2, 4].map((i) => parseInt(value.slice(i, i + 2), 16) / 255) as [number, number, number]
}

/** WCAG-Leuchtdichte. */
function luminance(color: string): number {
  const [r, g, b] = hex(color).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4))
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

function contrast(a: string, b: string): number {
  const [light, dark] = [luminance(a), luminance(b)].sort((x, y) => y - x)
  return (light + 0.05) / (dark + 0.05)
}

/** Fläche, auf der Avatare stehen (`--color-surface` in src/index.css). */
const SURFACE = '#17120d'

describe('Titel & Rahmen – IDs und Seltenheit', () => {
  it('haben stabile, eindeutige IDs in kebab-case', () => {
    expect(TITLES.map((title) => title.id)).toEqual(EXPECTED_TITLE_IDS)
    expect(FRAMES.map((frame) => frame.id)).toEqual(EXPECTED_FRAME_IDS)
    for (const list of [TITLES, FRAMES]) {
      const ids = list.map((cosmetic) => cosmetic.id)
      expect(new Set(ids).size).toBe(ids.length)
      for (const id of ids) expect(id).toMatch(/^[a-z]+(-[a-z]+)*$/)
    }
  })

  it('etwa 20 Titel und etwa 10 Rahmen', () => {
    expect(TITLES.length).toBeGreaterThanOrEqual(18)
    expect(TITLES.length).toBeLessThanOrEqual(26)
    expect(FRAMES.length).toBeGreaterThanOrEqual(8)
    expect(FRAMES.length).toBeLessThanOrEqual(14)
  })

  it('jede Seltenheit ist gültig und hat eine Beschriftung', () => {
    for (const { cosmetic } of ALL) expect(RARITIES, cosmetic.id).toContain(cosmetic.rarity)
    expect(Object.keys(RARITY_LABELS).sort()).toEqual([...RARITIES].sort())
    expect(RARITY_LABELS).toEqual({ common: 'Gewöhnlich', uncommon: 'Ungewöhnlich', rare: 'Selten', legendary: 'Legendär' })
  })
})

describe('Titel – Namen in drei Sprachformen', () => {
  it('jede Form ist gesetzt, ohne Leerraum am Rand, höchstens 40 Zeichen', () => {
    for (const title of TITLES) {
      for (const form of FORMS) {
        const name = title.names[form]
        expect(name.trim(), `${title.id} ${form}`).toBe(name)
        expect(name.length, `${title.id} ${form}`).toBeGreaterThan(0)
        expect(name.length, `${title.id} ${form}: ${name}`).toBeLessThanOrEqual(40)
        expect(name, `${title.id} ${form}`).not.toMatch(GENDER_MARKERS)
      }
    }
  })

  it('„die …“ und „der …“ gehen Hand in Hand; die neutrale Form trägt nie einen Artikel', () => {
    for (const { id, names } of TITLES) {
      if (names.female.startsWith('die ')) expect(names.male, id).toBe(`der ${names.female.slice(4)}`)
      if (names.male.startsWith('der ')) expect(names.female, id).toBe(`die ${names.male.slice(4)}`)
      expect(names.neutral, id).not.toMatch(/^(die|der|das|Die|Der|Das) /)
    }
  })

  it('die neutrale Form ist nie die männliche (kein generisches Maskulinum)', () => {
    for (const { id, names } of TITLES) {
      expect(names.neutral, id).not.toBe(names.male)
      expect(names.neutral, id).not.toBe(names.female)
    }
  })

  it('jeder Titel ist je Sprachform eindeutig', () => {
    for (const form of FORMS) {
      const names = TITLES.map((title) => title.names[form])
      expect(new Set(names).size, form).toBe(names.length)
    }
  })

  it('liest sich natürlich hinter dem Namen („Aria, …“)', () => {
    const byId = (id: string) => TITLES.find((title) => title.id === id)!
    const after = (id: string, form: GrammaticalForm) => `Aria, ${byId(id).names[form]}`
    expect(after('indomitable', 'female')).toBe('Aria, die Unbeugsame')
    expect(after('indomitable', 'male')).toBe('Aria, der Unbeugsame')
    expect(after('indomitable', 'neutral')).toBe('Aria, unbeugsamen Herzens')
    expect(after('fearless', 'neutral')).toBe('Aria, ohne Furcht')
    expect(after('phoenix', 'neutral')).toBe('Aria, Kind des Phönix')
    expect(after('dragon-tamer', 'neutral')).toBe('Aria, von Drachen gefürchtet')
  })
})

describe('Bedingungen', () => {
  it('verweisen nur auf vorhandene Erfolge und Bosse und haben sinnvolle Zahlen', () => {
    const bossIds = new Set(BOSSES.map((boss) => boss.id))
    for (const { cosmetic } of ALL) {
      const condition = cosmetic.condition
      expect(CONDITION_TYPES, cosmetic.id).toContain(condition.type)
      switch (condition.type) {
        case 'achievement':
          expect(getAchievement(condition.achievementId), `${cosmetic.id} → ${condition.achievementId}`).toBeDefined()
          break
        case 'bossDefeated':
          expect(bossIds.has(condition.bossId), `${cosmetic.id} → ${condition.bossId}`).toBe(true)
          break
        case 'bossVictories':
        case 'campaignsMastered':
          expect(Number.isInteger(condition.count) && condition.count >= 1, cosmetic.id).toBe(true)
          break
        case 'level':
          expect(Number.isInteger(condition.level), cosmetic.id).toBe(true)
          expect(condition.level, cosmetic.id).toBeGreaterThanOrEqual(2)
          expect(condition.level, cosmetic.id).toBeLessThanOrEqual(BALANCING.maxLevel)
          break
        default:
          break
      }
    }
  })

  it('Titel nutzen jede Art von Bedingung, Rahmen fast jede', () => {
    expect(new Set(TITLES.map((title) => title.condition.type))).toEqual(new Set(CONDITION_TYPES))
    const frameTypes = new Set(FRAMES.map((frame) => frame.condition.type))
    for (const type of ['always', 'level', 'achievement', 'campaignsMastered', 'chest'] as const) expect(frameTypes, type).toContain(type)
    expect(frameTypes.has('bossVictories') || frameTypes.has('bossDefeated')).toBe(true)
  })

  it('keine zwei Titel (bzw. Rahmen) mit derselben Bedingung – außer Truhen-Kosmetik', () => {
    for (const list of [TITLES, FRAMES] as Cosmetic[][]) {
      const keys = list.filter((cosmetic) => cosmetic.condition.type !== 'chest').map((cosmetic) => JSON.stringify(cosmetic.condition))
      expect(new Set(keys).size).toBe(keys.length)
    }
  })

  it('genau ein Start-Titel (immer frei) und ein Start-Rahmen, beide gewöhnlich', () => {
    const titles = TITLES.filter((title) => title.condition.type === 'always')
    const frames = FRAMES.filter((frame) => frame.condition.type === 'always')
    expect(titles).toHaveLength(1)
    expect(frames).toHaveLength(1)
    expect([...titles, ...frames].every((cosmetic) => cosmetic.rarity === 'common')).toBe(true)
  })

  it('Titel für 1, 5, 10 und 25 Boss-Siege', () => {
    const counts = TITLES.flatMap((title) => (title.condition.type === 'bossVictories' ? [title.condition.count] : []))
    expect(counts).toEqual([1, 5, 10, 25])
  })

  it('je Boss-Thema ein Titel für einen bestimmten Boss', () => {
    const themes = TITLES.flatMap((title) =>
      title.condition.type === 'bossDefeated' ? [BOSSES.find((boss) => boss.id === (title.condition as { bossId: string }).bossId)!.theme] : [],
    )
    expect([...themes].sort()).toEqual(Object.keys(ATTRIBUTES).sort())
  })
})

describe('Truhen-Kosmetik passt zu den Truhen-Regeln', () => {
  const chestTitles = TITLES.filter((title) => title.condition.type === 'chest')
  const chestFrames = FRAMES.filter((frame) => frame.condition.type === 'chest')

  it('mindestens 3 Titel nur aus Truhen – alle legendär, denn nur legendäre Truhen geben Titel', () => {
    expect(chestTitles.length).toBeGreaterThanOrEqual(3)
    for (const title of chestTitles) expect(title.rarity, title.id).toBe('legendary')
  })

  it('Truhen-Rahmen sind selten (aus seltenen Truhen) oder legendär – nie unerreichbar', () => {
    for (const frame of chestFrames) expect(['rare', 'legendary'], frame.id).toContain(frame.rarity)
  })

  it('seltene Truhen haben mehrere Rahmen zur Auswahl, legendäre Truhen Titel und Rahmen', () => {
    expect(chestFrames.filter((frame) => frame.rarity === 'rare').length).toBeGreaterThanOrEqual(2)
    expect(chestFrames.filter((frame) => frame.rarity === 'legendary').length).toBeGreaterThanOrEqual(1)
    expect(chestTitles.length + chestFrames.filter((frame) => frame.rarity === 'legendary').length).toBeGreaterThanOrEqual(4)
  })

  it('„Drachenschuppe“ (selten) und „Sternenstaub“ (legendär) gibt es nur in Truhen', () => {
    expect(FRAMES.find((frame) => frame.name === 'Drachenschuppe')).toMatchObject({ condition: { type: 'chest' }, rarity: 'rare' })
    expect(FRAMES.find((frame) => frame.name === 'Sternenstaub')).toMatchObject({ condition: { type: 'chest' }, rarity: 'legendary' })
  })
})

describe('Hinweise', () => {
  it('sind kurze deutsche Sätze, für alle Sprachformen gleich', () => {
    for (const { cosmetic } of ALL) {
      expect(cosmetic.hint.trim(), cosmetic.id).toBe(cosmetic.hint)
      expect(cosmetic.hint, cosmetic.id).toMatch(/^[A-ZÄÖÜ]/)
      expect(cosmetic.hint, cosmetic.id).toMatch(/\.$/)
      expect(cosmetic.hint.length, cosmetic.id).toBeLessThanOrEqual(110)
      expect(cosmetic.hint, cosmetic.id).not.toMatch(GENDERED_NOUNS)
      expect(cosmetic.hint, cosmetic.id).not.toMatch(/["']| - /)
    }
  })

  it('nennen das Ziel: Level, Anzahl, Erfolg', () => {
    for (const { cosmetic } of ALL) {
      const { condition, hint } = cosmetic
      if (condition.type === 'level') expect(hint, cosmetic.id).toContain(`Level ${condition.level}`)
      if (condition.type === 'bossVictories') expect(hint, cosmetic.id).toMatch(condition.count === 1 ? /ersten Wochen-Boss/ : new RegExp(`${condition.count} Wochen-Bosse`))
      if (condition.type === 'campaignsMastered') expect(hint, cosmetic.id).toMatch(condition.count === 1 ? /erste Kampagne/ : new RegExp(`${condition.count} Kampagnen`))
      if (condition.type === 'chest') expect(hint, cosmetic.id).toContain(cosmetic.rarity === 'legendary' ? 'legendären Truhe' : 'seltenen Truhe')
    }
  })

  it('nennen bei offenen Erfolgen deren Namen, bei geheimen weder Namen noch Zitat', () => {
    for (const { cosmetic } of ALL) {
      if (cosmetic.condition.type !== 'achievement') continue
      const achievement = getAchievement(cosmetic.condition.achievementId)!
      if (achievement.secret) {
        expect(cosmetic.hint, cosmetic.id).toMatch(/^Geheimer Erfolg: /)
        expect(cosmetic.hint.toLowerCase(), cosmetic.id).not.toContain(achievement.title.toLowerCase())
        expect(cosmetic.hint, cosmetic.id).not.toContain('„')
      } else {
        expect(cosmetic.hint, cosmetic.id).toContain(`„${achievement.title}“`)
      }
    }
  })

  it('verraten bei bestimmten Bossen nicht den Namen (Bestiarium-Silhouette), nur ein Rätsel und das Thema', () => {
    for (const { cosmetic } of ALL) {
      if (cosmetic.condition.type !== 'bossDefeated') continue
      const boss = BOSSES.find((candidate) => candidate.id === (cosmetic.condition as { bossId: string }).bossId)!
      expect(cosmetic.hint, cosmetic.id).not.toContain(boss.name)
      expect(cosmetic.hint, cosmetic.id).toContain(ATTRIBUTES[boss.theme].name)
      expect(cosmetic.hint, cosmetic.id).toMatch(/^Besiege /)
    }
  })

  it('zeigen bei bestimmten Bossen den Weg zu ihm: Ein Boss erscheint, wenn du sein Thema am meisten trainierst', () => {
    // Thema der Woche = Attribut mit dem größten geplanten Schaden (`boss.ts`) – wer nur liest, trifft nur Bosse der
    // Intelligenz. Der Hinweis sagt deshalb, wie man den Gesuchten herauslockt, statt nur sein Thema zu nennen.
    for (const { cosmetic } of ALL) {
      if (cosmetic.condition.type !== 'bossDefeated') continue
      const boss = BOSSES.find((candidate) => candidate.id === (cosmetic.condition as { bossId: string }).bossId)!
      expect(cosmetic.hint, cosmetic.id).toMatch(new RegExp(`lauert, wenn du vor allem ${ATTRIBUTES[boss.theme].name} trainierst\\.$`))
    }
  })
})

describe('Rahmen – Darstellung', () => {
  it('haben einen eindeutigen Namen (≤ 40 Zeichen)', () => {
    expect(new Set(FRAMES.map((frame) => frame.name)).size).toBe(FRAMES.length)
    for (const frame of FRAMES) {
      expect(frame.name.trim(), frame.id).toBe(frame.name)
      expect(frame.name.length, frame.id).toBeGreaterThan(0)
      expect(frame.name.length, frame.id).toBeLessThanOrEqual(40)
    }
  })

  it('haben 2–6 verschiedene Farbstopps als Hex-Farben, jeder Rahmen eine eigene Palette', () => {
    for (const frame of FRAMES) {
      expect(frame.colors.length, frame.id).toBeGreaterThanOrEqual(2)
      expect(frame.colors.length, frame.id).toBeLessThanOrEqual(6)
      for (const color of frame.colors) expect(color, frame.id).toMatch(/^#[0-9a-f]{6}$/)
      expect(new Set(frame.colors).size, frame.id).toBe(frame.colors.length)
    }
    expect(new Set(FRAMES.map((frame) => frame.colors.join())).size).toBe(FRAMES.length)
  })

  it('leuchten auf der dunklen Fläche: ein heller Stopp (≥ 4.5:1) und Tiefe durch einen dunkleren', () => {
    for (const frame of FRAMES) {
      const contrasts = frame.colors.map((color) => contrast(color, SURFACE))
      expect(Math.max(...contrasts), frame.id).toBeGreaterThanOrEqual(4.5)
      expect(Math.max(...contrasts) - Math.min(...contrasts), frame.id).toBeGreaterThanOrEqual(2)
    }
  })
})
