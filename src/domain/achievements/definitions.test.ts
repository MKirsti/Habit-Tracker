import { describe, expect, it } from 'vitest'
import { ATTRIBUTE_IDS } from '../attributes'
import { BALANCING } from '../balancing'
import { rankForLevel } from '../leveling'
import type { AchievementDefinition, AchievementStats, AchievementTier, AttributeId } from '../types'
import {
  ACHIEVEMENTS,
  ACHIEVEMENT_CATEGORY_LABELS,
  ACHIEVEMENT_CATEGORY_ORDER,
  ACHIEVEMENT_TIER_LABELS,
  getAchievement,
} from './definitions'

const TIER_RANK: Record<AchievementTier, number> = { bronze: 0, silver: 1, gold: 2 }

/** Startwerte eines frischen Helden (Level und Attribute beginnen bei 1, Tag 1 des Abenteuers). */
function freshStats(): AchievementStats {
  return {
    questsCompleted: 0,
    perfectDays: 0,
    bestDayStreak: 0,
    bestWeekStreak: 0,
    activeDays: 0,
    adventureDay: 1,
    level: 1,
    totalXp: 0,
    attributeLevels: { strength: 1, intellect: 1, wisdom: 1, charisma: 1, vitality: 1, discipline: 1 },
    chaptersCompleted: 0,
    campaignsCompleted: 0,
    activeCampaigns: 0,
    sideQuestsCompleted: 0,
    purchases: 0,
    goldFromXp: 0,
    comebacks: 0,
  }
}

type ScalarKey = Exclude<keyof AchievementStats, 'attributeLevels'>
const SCALAR_KEYS = (Object.keys(freshStats()) as (keyof AchievementStats)[]).filter(
  (key): key is ScalarKey => key !== 'attributeLevels',
)

function withScalar(stats: AchievementStats, key: ScalarKey, value: number): AchievementStats {
  return { ...stats, attributeLevels: { ...stats.attributeLevels }, [key]: value }
}

function withAttribute(stats: AchievementStats, id: AttributeId, level: number): AchievementStats {
  return { ...stats, attributeLevels: { ...stats.attributeLevels, [id]: level } }
}

/** Kleiner deterministischer Zufallsgenerator (LCG), damit der Test reproduzierbar bleibt. */
function rng(seed: number) {
  let state = seed >>> 0
  return (max: number) => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0
    return state % (max + 1)
  }
}

/** Realistische, gestreute Spielstände rund um die Schwellen. */
function sampleStats(count: number): AchievementStats[] {
  const next = rng(20261104)
  return Array.from({ length: count }, () => {
    const stats = freshStats()
    for (const key of SCALAR_KEYS) stats[key] = next(key === 'goldFromXp' || key === 'totalXp' ? 12_000 : 400)
    stats.level = 1 + next(25)
    stats.adventureDay = 1 + next(400)
    stats.activeCampaigns = next(3)
    for (const id of ATTRIBUTE_IDS) stats.attributeLevels[id] = 1 + next(12)
    return stats
  })
}

function deepFreeze(stats: AchievementStats): AchievementStats {
  Object.freeze(stats.attributeLevels)
  return Object.freeze(stats)
}

/** Ruft progress mit einem Proxy auf, der gelesene Felder mitschreibt und bei unbekannten Feldern wirft. */
function readKeys(definition: AchievementDefinition, stats: AchievementStats): Set<string> {
  const keys = new Set<string>()
  const levels = new Proxy(stats.attributeLevels, {
    get(target, prop, receiver) {
      if (typeof prop === 'string') {
        if (!(ATTRIBUTE_IDS as string[]).includes(prop)) throw new Error(`unbekanntes Attribut ${prop}`)
        keys.add(`attributeLevels.${prop}`)
      }
      return Reflect.get(target, prop, receiver)
    },
  })
  const proxy = new Proxy(stats, {
    get(target, prop, receiver) {
      if (typeof prop === 'string') {
        if (!(prop in target)) throw new Error(`unbekanntes Feld ${prop}`)
        keys.add(prop)
        if (prop === 'attributeLevels') return levels
      }
      return Reflect.get(target, prop, receiver)
    },
  })
  definition.progress(proxy)
  return keys
}

/** Serie einer ID: `streak-30` → `streak` (Zahl 30); ohne Zahl am Ende ist die ID ihre eigene Serie. */
function seriesOf(id: string): { series: string; number?: number } {
  const match = /^(.*)-(\d+)$/.exec(id)
  return match ? { series: match[1], number: Number(match[2]) } : { series: id }
}

function containsNumber(text: string, value: number): boolean {
  const formatted = value.toLocaleString('de-DE').replace(/\./g, '\\.')
  return new RegExp(`(^|[^\\d.])${formatted}(?!\\d|\\.\\d)`).test(text)
}

/** Typografie & Ton wie bei den Kampagnen-Vorlagen: Du-Form, deutsche Zeichen, saubere Leerzeichen. */
function expectCleanGermanText(text: string, where: string) {
  expect(text.trim(), where).toBe(text)
  expect(text.length, where).toBeGreaterThan(0)
  expect(text, `${where}: Du-Form`).not.toMatch(/\b(Sie|Ihnen|Ihr|Ihre|Ihren|Ihrem|Ihrer|Ihres)\b/)
  expect(text, `${where}: deutsche Anführungszeichen „…“ und ’`).not.toMatch(/["']/)
  expect(text, `${where}: Auslassungszeichen …`).not.toMatch(/\.\.\./)
  expect(text, `${where}: Gedankenstrich – statt Bindestrich`).not.toMatch(/\s-\s/)
  expect(text, `${where}: doppelte Leerzeichen`).not.toMatch(/ {2}/)
  expect(text, `${where}: Leerzeichen vor Satzzeichen`).not.toMatch(/\s[,.;:!?)]/)
  expect(text, `${where}: Tausenderpunkt wie in der UI (1.000)`).not.toMatch(/\d{4,}/)
  expect(text, `${where}: Platzhalter`).not.toMatch(/TODO|XXX|lorem/i)
}

describe('ACHIEVEMENTS – Inhalt', () => {
  it('enthält rund 30 Erfolge mit eindeutigen, stabilen kebab-case-IDs', () => {
    expect(ACHIEVEMENTS.length).toBeGreaterThanOrEqual(28)
    expect(ACHIEVEMENTS.length).toBeLessThanOrEqual(40)
    const ids = ACHIEVEMENTS.map((a) => a.id)
    expect(new Set(ids).size).toBe(ids.length)
    for (const id of ids) expect(id).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/)
  })

  it('hat gültige Felder: Stufe, Kategorie, Emoji-Icon, Gold 10–300, secret nur als true', () => {
    for (const a of ACHIEVEMENTS) {
      expect(Object.keys(TIER_RANK), a.id).toContain(a.tier)
      expect(ACHIEVEMENT_CATEGORY_ORDER, a.id).toContain(a.category)
      expect(a.icon, a.id).toMatch(/^\p{Extended_Pictographic}/u)
      expect(a.icon, a.id).not.toMatch(/\s|[A-Za-z0-9]/)
      expect(Number.isInteger(a.goldReward), a.id).toBe(true)
      expect(a.goldReward, a.id).toBeGreaterThanOrEqual(10)
      expect(a.goldReward, a.id).toBeLessThanOrEqual(300)
      expect([undefined, true], a.id).toContain(a.secret)
      expect(typeof a.progress, a.id).toBe('function')
    }
  })

  it('Titel und Icons sind eindeutig (jeder Erfolg ist auf einen Blick unterscheidbar)', () => {
    expect(new Set(ACHIEVEMENTS.map((a) => a.title)).size).toBe(ACHIEVEMENTS.length)
    expect(new Set(ACHIEVEMENTS.map((a) => a.icon)).size).toBe(ACHIEVEMENTS.length)
  })

  it('Gold folgt der Stufe (BALANCING.achievementGold); höhere Stufe gibt immer mehr', () => {
    for (const a of ACHIEVEMENTS) {
      const base = BALANCING.achievementGold[a.tier]
      expect(a.goldReward, a.id).toBeGreaterThanOrEqual(base)
      expect(a.goldReward, a.id).toBeLessThanOrEqual(Math.round(base * 1.5))
    }
    const maxOf = (tier: AchievementTier) => Math.max(...ACHIEVEMENTS.filter((a) => a.tier === tier).map((a) => a.goldReward))
    const minOf = (tier: AchievementTier) => Math.min(...ACHIEVEMENTS.filter((a) => a.tier === tier).map((a) => a.goldReward))
    expect(maxOf('bronze')).toBeLessThan(minOf('silver'))
    expect(maxOf('silver')).toBeLessThan(minOf('gold'))
  })

  it('nutzt jede Kategorie und jede Stufe; Kategorien und Stufen haben deutsche Namen', () => {
    expect([...ACHIEVEMENT_CATEGORY_ORDER].sort()).toEqual(Object.keys(ACHIEVEMENT_CATEGORY_LABELS).sort())
    expect(new Set(ACHIEVEMENT_CATEGORY_ORDER).size).toBe(ACHIEVEMENT_CATEGORY_ORDER.length)
    for (const category of ACHIEVEMENT_CATEGORY_ORDER) {
      expect(ACHIEVEMENTS.some((a) => a.category === category), category).toBe(true)
      expectCleanGermanText(ACHIEVEMENT_CATEGORY_LABELS[category], category)
    }
    for (const tier of Object.keys(TIER_RANK) as AchievementTier[]) {
      expect(ACHIEVEMENTS.some((a) => a.tier === tier), tier).toBe(true)
      expectCleanGermanText(ACHIEVEMENT_TIER_LABELS[tier], tier)
    }
  })

  it('ist nach Kategorie und darin nach Schwierigkeit (Bronze → Silber → Gold) sortiert', () => {
    for (let i = 1; i < ACHIEVEMENTS.length; i++) {
      const prev = ACHIEVEMENTS[i - 1]
      const curr = ACHIEVEMENTS[i]
      const prevCategory = ACHIEVEMENT_CATEGORY_ORDER.indexOf(prev.category)
      const currCategory = ACHIEVEMENT_CATEGORY_ORDER.indexOf(curr.category)
      expect(currCategory, `${prev.id} → ${curr.id}`).toBeGreaterThanOrEqual(prevCategory)
      if (currCategory === prevCategory) {
        expect(TIER_RANK[curr.tier], `${prev.id} → ${curr.id}`).toBeGreaterThanOrEqual(TIER_RANK[prev.tier])
      }
    }
  })

  it('Reihen (`<reihe>-<zahl>`) steigen in Zahl, Ziel und Stufe – dieselbe Kategorie, dieselben Werte', () => {
    const bySeries = new Map<string, AchievementDefinition[]>()
    for (const a of ACHIEVEMENTS) {
      const { series } = seriesOf(a.id)
      bySeries.set(series, [...(bySeries.get(series) ?? []), a])
    }
    const fresh = freshStats()
    for (const [series, members] of bySeries) {
      for (let i = 1; i < members.length; i++) {
        const prev = members[i - 1]
        const curr = members[i]
        const where = `${series}: ${prev.id} → ${curr.id}`
        expect(seriesOf(curr.id).number!, where).toBeGreaterThan(seriesOf(prev.id).number!)
        expect(curr.progress(fresh).target, where).toBeGreaterThan(prev.progress(fresh).target)
        expect(TIER_RANK[curr.tier], where).toBeGreaterThanOrEqual(TIER_RANK[prev.tier])
        expect(curr.category, where).toBe(prev.category)
        expect([...readKeys(curr, fresh)], where).toEqual([...readKeys(prev, fresh)])
      }
    }
  })

  it('mindestens 2 geheime Erfolge, darunter der Phönix', () => {
    const secret = ACHIEVEMENTS.filter((a) => a.secret)
    expect(secret.length).toBeGreaterThanOrEqual(2)
    expect(getAchievement('phoenix')?.secret).toBe(true)
    // Nicht alles verstecken: Ziele, auf die man hinarbeiten kann, bleiben sichtbar.
    expect(secret.length).toBeLessThanOrEqual(ACHIEVEMENTS.length / 4)
  })

  it('Texte: Du-Form, deutsche Typografie, kurze Titel, Beschreibung nennt das Ziel', () => {
    const fresh = freshStats()
    for (const a of ACHIEVEMENTS) {
      expectCleanGermanText(a.title, `${a.id}.title`)
      expectCleanGermanText(a.description, `${a.id}.description`)
      expect(a.title.length, `${a.id}.title`).toBeLessThanOrEqual(24)
      expect(a.description.length, `${a.id}.description`).toBeLessThanOrEqual(110)
      expect(a.description, `${a.id}.description: ganzer Satz`).toMatch(/[.!]$/)
      const { target } = a.progress(fresh)
      if (target > 1) expect(containsNumber(a.description, target), `${a.id}: nennt ${target}`).toBe(true)
    }
  })

  it('getAchievement findet Definitionen per ID', () => {
    expect(getAchievement('streak-7')).toBe(ACHIEVEMENTS[0])
    for (const a of ACHIEVEMENTS) expect(getAchievement(a.id)).toBe(a)
    expect(getAchievement('xp-trank')).toBeUndefined()
  })
})

describe('ACHIEVEMENTS – progress(stats)', () => {
  const bases = [freshStats(), ...sampleStats(30)]

  it('liest nur AchievementStats-Felder und hängt von mindestens einem ab', () => {
    for (const a of ACHIEVEMENTS) {
      const keys = readKeys(a, freshStats())
      expect(keys.size, a.id).toBeGreaterThan(0)
    }
  })

  it('ist rein: gleiche Eingabe → gleiches Ergebnis, Eingabe bleibt unverändert', () => {
    for (const a of ACHIEVEMENTS) {
      for (const base of bases.slice(0, 5)) {
        const stats = deepFreeze(structuredClone(base))
        const first = a.progress(stats)
        const second = a.progress(stats)
        expect(second, a.id).toEqual(first)
        expect(stats, a.id).toEqual(base)
      }
    }
  })

  it('Ziel ist eine feste ganze Zahl > 0; current liegt in 0 … Ziel', () => {
    for (const a of ACHIEVEMENTS) {
      const { target } = a.progress(freshStats())
      expect(Number.isInteger(target), a.id).toBe(true)
      expect(target, a.id).toBeGreaterThan(0)
      for (const stats of bases) {
        const result = a.progress(stats)
        expect(result.target, a.id).toBe(target)
        expect(Number.isFinite(result.current), a.id).toBe(true)
        expect(result.current, a.id).toBeGreaterThanOrEqual(0)
        expect(result.current, a.id).toBeLessThanOrEqual(target)
      }
    }
  })

  it('ist monoton: steigt ein beliebiger Wert, sinkt der Fortschritt nie', () => {
    const steps = [1, 2, 5, 25, 300, 5000]
    for (const a of ACHIEVEMENTS) {
      for (const base of bases) {
        const before = a.progress(base).current
        for (const step of steps) {
          for (const key of SCALAR_KEYS) {
            const after = a.progress(withScalar(base, key, base[key] + step)).current
            expect(after, `${a.id}: ${key} +${step}`).toBeGreaterThanOrEqual(before)
          }
          for (const id of ATTRIBUTE_IDS) {
            const after = a.progress(withAttribute(base, id, base.attributeLevels[id] + step)).current
            expect(after, `${a.id}: attributeLevels.${id} +${step}`).toBeGreaterThanOrEqual(before)
          }
        }
      }
    }
  })

  it('ein frischer Held hat noch nichts freigeschaltet, ein Veteran alles', () => {
    const fresh = freshStats()
    for (const a of ACHIEVEMENTS) {
      const { current, target } = a.progress(fresh)
      expect(current, a.id).toBeLessThan(target)
    }
    const veteran = freshStats()
    for (const key of SCALAR_KEYS) veteran[key] = 1_000_000
    veteran.activeCampaigns = BALANCING.maxActiveCampaigns
    for (const id of ATTRIBUTE_IDS) veteran.attributeLevels[id] = 99
    for (const a of ACHIEVEMENTS) {
      const { current, target } = a.progress(veteran)
      expect(current, a.id).toBe(target)
    }
  })

  it('ungültige Werte (NaN, negativ) zählen als 0', () => {
    const nan = freshStats()
    const negative = freshStats()
    for (const key of SCALAR_KEYS) {
      nan[key] = Number.NaN
      negative[key] = -5
    }
    for (const id of ATTRIBUTE_IDS) {
      nan.attributeLevels[id] = Number.NaN
      negative.attributeLevels[id] = -5
    }
    for (const a of ACHIEVEMENTS) {
      expect(a.progress(nan).current, a.id).toBe(0)
      expect(a.progress(negative).current, a.id).toBe(0)
    }
  })

  it('schaltet genau an der Schwelle frei', () => {
    const at = (id: string, stats: AchievementStats) => {
      const { current, target } = getAchievement(id)!.progress(stats)
      return current >= target
    }
    const fresh = freshStats()
    expect(at('streak-7', withScalar(fresh, 'bestDayStreak', 6))).toBe(false)
    expect(at('streak-7', withScalar(fresh, 'bestDayStreak', 7))).toBe(true)
    expect(at('week-streak-4', withScalar(fresh, 'bestDayStreak', 50))).toBe(false)
    expect(at('week-streak-4', withScalar(fresh, 'bestWeekStreak', 4))).toBe(true)
    expect(at('quests-1000', withScalar(fresh, 'questsCompleted', 999))).toBe(false)
    expect(at('quests-1000', withScalar(fresh, 'questsCompleted', 1000))).toBe(true)
    expect(at('gold-10000', withScalar(fresh, 'goldFromXp', 9999))).toBe(false)
    expect(at('gold-10000', withScalar(fresh, 'goldFromXp', 10000))).toBe(true)
    expect(at('week-streak-26', withScalar(fresh, 'bestWeekStreak', 25))).toBe(false)
    expect(at('week-streak-26', withScalar(fresh, 'bestWeekStreak', 26))).toBe(true)
    expect(at('phoenix', withScalar(fresh, 'comebacks', 1))).toBe(true)
    expect(at('lucky-7777', withScalar(fresh, 'totalXp', 7776))).toBe(false)
    expect(at('lucky-7777', withScalar(fresh, 'totalXp', 7777))).toBe(true)
    expect(at('adventure-days-365', withScalar(fresh, 'adventureDay', 364))).toBe(false)
    expect(at('adventure-days-365', withScalar(fresh, 'adventureDay', 365))).toBe(true)
  })

  it('Attribut-Erfolge: höchstes Attribut zählt; „Im Gleichgewicht“ zählt Attribute ab Level 3', () => {
    const fresh = freshStats()
    const attr5 = getAchievement('attribute-level-5')!
    expect(attr5.progress(withAttribute(fresh, 'wisdom', 4))).toEqual({ current: 4, target: 5 })
    expect(attr5.progress(withAttribute(fresh, 'discipline', 7))).toEqual({ current: 5, target: 5 })

    const allrounder = getAchievement('all-attributes-3')!
    let stats = fresh
    expect(allrounder.progress(stats)).toEqual({ current: 0, target: 6 })
    for (const [i, id] of ATTRIBUTE_IDS.entries()) {
      stats = withAttribute(stats, id, 3 + i)
      expect(allrounder.progress(stats).current).toBe(i + 1)
    }
    expect(allrounder.progress(withAttribute(stats, 'charisma', 2)).current).toBe(5)
  })

  it('belohnt keine parallelen Kampagnen; Level-Erfolge passen zu den Rängen', () => {
    for (const achievement of ACHIEVEMENTS) {
      expect(achievement.progress({ ...freshStats(), activeCampaigns: 99 }).current, achievement.id).toBe(
        achievement.progress(freshStats()).current,
      )
    }
    const champion = getAchievement('level-20')!
    expect(rankForLevel(champion.progress(freshStats()).target)).toBe(champion.title)
    // „Auf Wanderschaft“ nennt den Rang, den Level 5 bringt.
    const wanderer = getAchievement('level-5')!
    expect(wanderer.description).toContain(`Rang ${rankForLevel(wanderer.progress(freshStats()).target)}`)
  })
})

/**
 * Spielstände eines beständigen Helden mit einer Einsteiger-Kampagne („Der Weg des Gelehrten“, rund 85 % der Quests
 * erledigt, etwa eine Nebenquest pro Woche) – gerundet aus einer Simulation mit der echten Engine (≈ 48 Gold am Tag).
 * Sie sichern das Spieltempo der Erfolge ab: früh mehrere kleine Siege, Gold erst nach Monaten, nach einem Jahr
 * noch Ziele.
 */
function heroAfter(overrides: Partial<AchievementStats>): AchievementStats {
  return { ...freshStats(), ...overrides, attributeLevels: { ...freshStats().attributeLevels, ...overrides.attributeLevels } }
}

const DAY_1 = heroAfter({ questsCompleted: 3, perfectDays: 1, bestDayStreak: 1, activeDays: 1, totalXp: 50, goldFromXp: 25, activeCampaigns: 1 })
const WEEK_1 = heroAfter({
  questsCompleted: 23,
  perfectDays: 5,
  bestDayStreak: 7,
  bestWeekStreak: 1,
  activeDays: 7,
  adventureDay: 7,
  level: 3,
  totalXp: 640,
  attributeLevels: { ...freshStats().attributeLevels, intellect: 3, wisdom: 3, discipline: 2 },
  chaptersCompleted: 1,
  activeCampaigns: 1,
  sideQuestsCompleted: 1,
  goldFromXp: 320,
})
const MONTH_1 = heroAfter({
  questsCompleted: 94,
  perfectDays: 18,
  bestDayStreak: 11,
  bestWeekStreak: 4,
  activeDays: 30,
  adventureDay: 30,
  level: 5,
  totalXp: 2670,
  attributeLevels: { ...freshStats().attributeLevels, intellect: 6, wisdom: 6, charisma: 2, discipline: 2 },
  chaptersCompleted: 2,
  activeCampaigns: 1,
  sideQuestsCompleted: 4,
  purchases: 2,
  goldFromXp: 1335,
})
const YEAR_1 = heroAfter({
  questsCompleted: 1134,
  perfectDays: 228,
  bestDayStreak: 28,
  bestWeekStreak: 52,
  activeDays: 360,
  adventureDay: 365,
  level: 15,
  totalXp: 35400,
  attributeLevels: { ...freshStats().attributeLevels, intellect: 21, wisdom: 18, charisma: 7, discipline: 5 },
  chaptersCompleted: 6,
  campaignsCompleted: 1,
  sideQuestsCompleted: 52,
  purchases: 20,
  goldFromXp: 17700,
})

function unlockedAt(stats: AchievementStats): AchievementDefinition[] {
  return ACHIEVEMENTS.filter((a) => {
    const { current, target } = a.progress(stats)
    return current >= target
  })
}

describe('ACHIEVEMENTS – Spieltempo', () => {
  /** Grobe Verdienst-Rate eines beständigen Helden mit einer Kampagne (½ Gold pro XP). */
  const GOLD_PER_DAY = 50

  it('der erste Tag bringt schon einen Erfolg, die erste Woche mehrere – alles Bronze', () => {
    expect(unlockedAt(DAY_1).length).toBeGreaterThanOrEqual(1)
    const week = unlockedAt(WEEK_1)
    expect(week.length).toBeGreaterThanOrEqual(4)
    for (const a of week) expect(a.tier, a.id).toBe('bronze')
    // Das Gold der ersten Woche reicht zusammen etwa für eine kleine Belohnung (ab 100 Gold).
    expect(week.reduce((sum, a) => sum + a.goldReward, 0)).toBeGreaterThanOrEqual(100)
  })

  it('nach einem Monat viele Bronze-Erfolge, aber noch kein Gold', () => {
    const month = unlockedAt(MONTH_1)
    expect(month.length).toBeGreaterThanOrEqual(8)
    expect(month.filter((a) => a.tier === 'gold')).toEqual([])
  })

  it('nach einem Jahr Gold erreicht – und noch große Ziele offen', () => {
    const year = unlockedAt(YEAR_1)
    expect(year.some((a) => a.tier === 'gold')).toBe(true)
    const open = ACHIEVEMENTS.filter((a) => !year.includes(a) && !a.secret)
    expect(open.length).toBeGreaterThanOrEqual(3)
    for (const legendary of ACHIEVEMENTS.filter((a) => a.goldReward > BALANCING.achievementGold.gold)) {
      expect(year, legendary.id).not.toContain(legendary)
    }
  })

  it('Erfolgs-Gold bleibt ein Bonus: alle Erfolge zusammen sind weniger als 100 Tage Gold', () => {
    const total = ACHIEVEMENTS.reduce((sum, a) => sum + a.goldReward, 0)
    expect(total).toBeLessThan(100 * GOLD_PER_DAY)
    // … aber spürbar: mehr als ein Monat Spiel
    expect(total).toBeGreaterThan(30 * GOLD_PER_DAY)
  })
})
