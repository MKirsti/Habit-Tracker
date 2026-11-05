import { describe, expect, it } from 'vitest'
import { COMPANION_SPECIES } from '../../domain/companion'
import { COMPANIONS } from '../../domain/companionDefinitions'
import type { AttackEvent, CompanionState, WeeklyReview } from '../../domain/types'
import { hitIcon, hitSpoken, hitText, isCompanionHit } from './combatText'
import {
  COMPANION_NAME_SUGGESTIONS,
  COMPANION_PATH,
  companionBadgeLabel,
  companionIntroPoints,
  companionStartText,
  companionStatus,
} from './companionText'
import { JOURNAL_MOODS, moodLabel, notePreview } from './journalText'
import { REVIEW_TITLE, reviewStats, reviewWeekLabel, reviewXpChange, reviewXpLabel, xpChange } from './reviewText'

/** Pronomen der dritten Person – Texte über den frei benannten Gefährten kommen ohne aus. */
const PRONOUNS = /\b(er|sie|ihn|ihm|sein|seine|seinen|ihre|ihren)\b/

function companionHit(overrides: Partial<AttackEvent> = {}): AttackEvent {
  return {
    day: '2026-11-03',
    source: 'companion',
    sourceId: 'fox',
    attribute: 'intellect',
    attackName: 'Flink',
    damage: 8,
    weakness: false,
    ...overrides,
  }
}

describe('Treffer des Gefährten', () => {
  it('zeigt Art, Name und Schaden: „🦊 Flink springt mit an −8“', () => {
    const attack = companionHit()
    expect(isCompanionHit(attack)).toBe(true)
    expect(hitIcon(attack)).toBe('🦊')
    expect(hitText(attack)).toBe('🦊 Flink springt mit an −8')
    expect(hitSpoken(attack, 'Sofagolem')).toBe('Flink springt mit an: 8 Schaden gegen Sofagolem.')
    expect(hitSpoken(attack, 'Sofagolem', true)).toBe('Flink springt mit an: 8 Schaden gegen Sofagolem. Sofagolem ist besiegt!')
  })

  it('Quest-Treffer bleiben, wie sie waren; eine unbekannte Art bekommt eine Pfote', () => {
    const quest = companionHit({ source: 'quest', sourceId: 'habit-1', attackName: 'Arkaner Blitz', damage: 36 })
    expect(hitText(quest)).toBe('🧠 Arkaner Blitz −36')
    expect(hitIcon(companionHit({ sourceId: 'unicorn' }))).toBe('🐾')
  })
})

function companion(overrides: Partial<CompanionState> = {}): CompanionState {
  return {
    choice: { species: 'fox', name: 'Flink', chosenDay: '2026-10-01' },
    definition: COMPANIONS.fox,
    stage: 1,
    sleeping: false,
    ...overrides,
  }
}

describe('Gefährten-Abzeichen', () => {
  it('nennt Name, Stufen-Namen und Stufe – schlafend mit einer freundlichen Einladung', () => {
    expect(companionBadgeLabel(companion())).toBe('Dein Gefährte Flink, Spitzohr (Gefährte) – zur Gefährten-Karte')
    expect(companionBadgeLabel(companion({ sleeping: true }))).toBe(
      'Dein Gefährte Flink, Spitzohr (Gefährte) – schläft gerade. Eine erledigte Quest weckt Flink. Zur Gefährten-Karte',
    )
    expect(companionStatus(companion({ stage: 3 }))).toBe('Neunschwänziger Fuchs · Legendär')
    expect(companionStatus(companion({ sleeping: true }))).toBe('Spitzohr · schläft')
    expect(COMPANION_PATH).toBe('/held#gefaehrte')
  })
})

describe('Einführung „Neu: Gefährten“', () => {
  it('hat für jede Art einen kurzen Namensvorschlag', () => {
    for (const species of COMPANION_SPECIES) {
      const name = COMPANION_NAME_SUGGESTIONS[species]
      expect(name.length).toBeGreaterThan(0)
      expect(name.length).toBeLessThanOrEqual(20)
    }
    expect(COMPANION_NAME_SUGGESTIONS.fox).toBe('Flink')
  })

  it('nennt die echten Zahlen und kommt ohne Pronomen aus', () => {
    const points = companionIntroPoints()
    expect(points.map((point) => point.title)).toEqual(['Wächst mit dir:', 'Kämpft mit:', 'Bleibt immer:'])
    expect(points[0].text).toContain('14, 60 und 180 Tagen')
    expect(points[1].text).toContain('10 %')
    for (const point of points) expect(point.text).not.toMatch(PRONOUNS)
  })

  it('nennt die Stufe, mit der der Gefährte wirklich startet – die aktiven Tage zählen schon mit', () => {
    // Ein neuer Held startet beim Jungtier …
    expect(companionStartText(COMPANIONS.owl, 0)).toBe('Startet als Flaumkäuzchen.')
    expect(companionStartText(COMPANIONS.owl, 13)).toBe('Startet als Flaumkäuzchen.')
    // … wer schon länger dabei ist, bekommt gleich die passende Stufe (wie `GameState.companion` danach).
    expect(companionStartText(COMPANIONS.fox, 30)).toBe('Startet dank deiner 30 aktiven Tage gleich als Spitzohr.')
    expect(companionStartText(COMPANIONS.dragon, 1200)).toBe(
      'Startet dank deiner 1.200 aktiven Tage gleich als Uralter Drache.',
    )
    expect(companionStartText(COMPANIONS.fox, 30)).not.toMatch(PRONOUNS)
  })
})

const REVIEW: WeeklyReview = {
  weekStart: '2026-10-26',
  weekEnd: '2026-11-01',
  xp: 1240,
  xpChangePercent: 12,
  questsCompleted: 23,
  perfectDays: 4,
  bestStreak: 12,
  topAttribute: 'intellect',
  boss: { name: 'Sofagolem', icon: '🛋️', defeated: true },
  restDays: 0,
  line: 'Eine starke Woche!',
}

describe('Wochenrückblick', () => {
  it('Überschrift, Woche und XP', () => {
    expect(REVIEW_TITLE).toBe('Bericht des Gildenmeisters')
    expect(reviewWeekLabel('2026-11-02')).toBe('Woche vom 2. Nov.')
    expect(reviewXpLabel(1240)).toBe('+1.240 XP')
  })

  it('Vergleich zur Vorwoche: ▲ mehr, ▼ weniger (ruhig), = gleich, ohne Vergleich nichts', () => {
    expect(xpChange(12)).toEqual({ arrow: '▲', text: '12 %', spoken: '12 % mehr als in der Vorwoche', trend: 'up' })
    expect(xpChange(-8.4)).toEqual({ arrow: '▼', text: '8 %', spoken: '8 % weniger als in der Vorwoche', trend: 'down' })
    expect(xpChange(0)?.trend).toBe('same')
    expect(xpChange(undefined)).toBeUndefined()
  })

  it('zeigt nach einer leeren Woche kein „▼ 100 %“ – dort zählt nur der ermutigende Satz', () => {
    expect(reviewXpChange({ xp: 0, xpChangePercent: -100 })).toBeUndefined()
    expect(reviewXpChange({ xp: 120, xpChangePercent: -40 })?.arrow).toBe('▼')
    expect(reviewXpChange({ xp: 120, xpChangePercent: 25 })?.text).toMatch(/^25\s%$/)
    expect(reviewXpChange({ xp: 120 })).toBeUndefined()
  })

  it('Kacheln: Quests, Perfekte Tage, Streak, Attribut, Boss – Ruhetage nur, wenn es welche gab', () => {
    const stats = reviewStats(REVIEW)
    expect(stats.map((stat) => stat.key)).toEqual(['quests', 'perfect', 'streak', 'attribute', 'boss'])
    expect(stats.map((stat) => `${stat.value} ${stat.label}`)).toEqual([
      '23 Quests erledigt',
      '4 Perfekte Tage',
      '12 Tage Bester Streak',
      'Intelligenz Stärkstes Attribut',
      'Sofagolem besiegt – stark!',
    ])
    expect(stats.find((stat) => stat.key === 'boss')?.highlight).toBe(true)

    const quiet = reviewStats({
      ...REVIEW,
      questsCompleted: 1,
      perfectDays: 1,
      bestStreak: 1,
      topAttribute: undefined,
      boss: { name: 'Sofagolem', icon: '🛋️', defeated: false },
      restDays: 2,
    })
    expect(quiet.map((stat) => `${stat.value} ${stat.label}`)).toEqual([
      '1 Quest erledigt',
      '1 Perfekter Tag',
      '1 Tag Bester Streak',
      'Sofagolem ist entwischt',
      '2 Ruhetage',
    ])
    expect(reviewStats({ ...REVIEW, boss: undefined }).some((stat) => stat.key === 'boss')).toBe(false)
  })

  it('eine ganz leere Woche zeigt keine Nullen und keinen entwischten Boss – nur Ruhetage bzw. einen Ausblick', () => {
    const empty = {
      ...REVIEW,
      xp: 0,
      xpChangePercent: -100,
      questsCompleted: 0,
      perfectDays: 0,
      bestStreak: 0,
      topAttribute: undefined,
      boss: { name: 'Sofagolem', icon: '🛋️', defeated: false },
    }
    expect(reviewStats(empty).map((stat) => `${stat.icon} ${stat.value} ${stat.label}`)).toEqual(['🌱 Neue Woche neues Abenteuer'])
    expect(reviewStats({ ...empty, restDays: 7 }).map((stat) => `${stat.value} ${stat.label}`)).toEqual(['7 Ruhetage'])
    expect(reviewStats({ ...empty, restDays: 1 }).map((stat) => `${stat.value} ${stat.label}`)).toEqual(['1 Ruhetag'])
    // Nur Nebenquests (XP, Boss-Treffer) – das ist keine leere Woche: Attribut und Boss stehen da, die Nullen nicht.
    const sideQuestsOnly = reviewStats({ ...empty, xp: 40, topAttribute: 'vitality', boss: { ...empty.boss, defeated: true } })
    expect(sideQuestsOnly.map((stat) => stat.key)).toEqual(['attribute', 'boss'])
  })

  it('Kacheln zeigen, was war: ohne Perfekte Tage (z. B. nur Wochenquests) keine „0 Perfekte Tage“', () => {
    const weeklyOnly = reviewStats({ ...REVIEW, questsCompleted: 3, perfectDays: 0, bestStreak: 0, boss: undefined })
    expect(weeklyOnly.map((stat) => `${stat.value} ${stat.label}`)).toEqual(['3 Quests erledigt', 'Intelligenz Stärkstes Attribut'])
    for (const stat of reviewStats({ ...REVIEW, perfectDays: 0 })) expect(stat.value).not.toMatch(/^0\b/)
  })
})

describe('Notiz zu heute', () => {
  it('bietet einzelne Emojis mit Namen an', () => {
    expect(JOURNAL_MOODS.length).toBeGreaterThanOrEqual(5)
    for (const mood of JOURNAL_MOODS) expect(mood.emoji.length).toBeLessThanOrEqual(16)
    expect(moodLabel('🙂')).toBe('Gut')
    expect(moodLabel('🦄')).toBe('Stimmung')
    expect(moodLabel(undefined)).toBeUndefined()
  })

  it('kürzt die Vorschau auf eine Zeile', () => {
    expect(notePreview('  Ein   guter\nTag  ')).toBe('Ein guter Tag')
    const long = 'a'.repeat(100)
    expect(notePreview(long, 20)).toBe(`${'a'.repeat(19)}…`)
  })
})
