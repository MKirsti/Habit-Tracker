import { describe, expect, it } from 'vitest'
import { seededRandom } from '../../domain/testing'
import type { LevelInfo } from '../../domain/types'
import { enqueueCelebrations, hasCelebration } from './celebrations'
import type { Celebration } from './celebrations'
import { CONFETTI_COLORS, confettiLifetime, createConfettiParticles } from './confetti'
import { XP_MERGE_WINDOW_MS, isXpSessionOpen, nextXpSession } from './xpSession'
import type { CampaignCompletedEvent, LevelUpEvent, XpGainedEvent, XpQuest } from './feedbackEvents'
import { ACHIEVEMENT_TIER_COLORS, achievementConfetti } from './achievementTier'
import {
  achievementToastText,
  attributeToastText,
  bonusGrowthToastText,
  chapterToastText,
  goldLabel,
  joinTitles,
  nextRank,
  perfectDayToastText,
  rankHint,
  xpToastText,
} from './feedbackText'

const quest = (title: string): XpQuest => ({ id: title, title, icon: '⭐', xp: 20 })

describe('Texte', () => {
  it('fasst Titel knapp zusammen', () => {
    expect(joinTitles([])).toBe('')
    expect(joinTitles(['Lesen'])).toBe('Lesen')
    expect(joinTitles(['Lesen', 'Meditieren'])).toBe('Lesen und Meditieren')
    expect(joinTitles(['A', 'B', 'C'])).toBe('A, B und C')
    expect(joinTitles(['A', 'B', 'C', 'D', 'E'])).toBe('A, B und 3 weitere')
  })

  it('XP-Toast: Betrag, Quests und Bonus', () => {
    expect(xpToastText(20, [quest('Lesen')], 0)).toEqual({ title: '+20 XP', description: 'Lesen' })
    expect(xpToastText(1250, [quest('Lesen'), quest('Laufen')], 10)).toEqual({
      title: '+1.250 XP',
      description: 'Lesen und Laufen · inkl. 10 Bonus-XP',
    })
    expect(xpToastText(60, [quest('A'), quest('B'), quest('C')], 0).description).toBe('A und 2 weitere')
    expect(xpToastText(80, [], 0)).toEqual({ title: '+80 XP', description: 'Nachgetragene Quest' })
    expect(xpToastText(80, [quest('Lesen')], 0, true).description).toBe('Nachgetragen: Lesen')
  })

  it('XP-Toast nennt das Gold dieser XP – ohne Gold nur die XP', () => {
    expect(xpToastText(24, [quest('Lesen')], 0, false, 12)).toEqual({ title: '+24 XP · +12 Gold', description: 'Lesen' })
    expect(xpToastText(2500, [quest('Lesen')], 0, false, 1250).title).toBe('+2.500 XP · +1.250 Gold')
    expect(xpToastText(1, [quest('Lesen')], 0, false, 0).title).toBe('+1 XP')
    expect(goldLabel(75)).toBe('+75 Gold')
  })

  it('XP-Toast benennt reine Nebenquests als solche', () => {
    const side = (title: string): XpQuest => ({ ...quest(title), sideQuest: true })
    expect(xpToastText(40, [side('Steuererklärung')], 0, false, 20).description).toBe('Nebenquest: Steuererklärung')
    expect(xpToastText(50, [side('Steuer'), side('Zahnarzt')], 0).description).toBe('Nebenquests: Steuer und Zahnarzt')
    // Gemischt: nur die Titel (die Quest steht ohnehin in der Tagesliste).
    expect(xpToastText(60, [quest('Lesen'), side('Steuer')], 0).description).toBe('Lesen und Steuer')
    expect(xpToastText(40, [side('Steuer')], 0, true).description).toBe('Nachgetragen: Steuer')
  })

  it('Erfolg: Titel, Gold-Belohnung und Stufe', () => {
    expect(achievementToastText({ title: 'Ein ganzer Mond', tier: 'silver', gold: 75 })).toEqual({
      title: 'Ein ganzer Mond · +75 Gold',
      description: 'Silber-Erfolg freigeschaltet',
    })
    expect(achievementToastText({ title: 'Makellos', tier: 'bronze', gold: 25 }).description).toBe(
      'Bronze-Erfolg freigeschaltet',
    )
    expect(achievementToastText({ title: 'Unsterblich', tier: 'gold', gold: 0 })).toEqual({
      title: 'Unsterblich',
      description: 'Gold-Erfolg freigeschaltet',
    })
  })

  it('Erfolg: Konfetti in der Farbe der Stufe, Gold-Erfolge voll', () => {
    expect(achievementConfetti('bronze')).toEqual({ intensity: 'light', accent: ACHIEVEMENT_TIER_COLORS.bronze })
    expect(achievementConfetti('silver')).toEqual({ intensity: 'light', accent: ACHIEVEMENT_TIER_COLORS.silver })
    expect(achievementConfetti('gold')).toEqual({ intensity: 'full', accent: ACHIEVEMENT_TIER_COLORS.gold })
    // Drei deutlich verschiedene Metalle, Gold = App-Gold.
    expect(new Set(Object.values(ACHIEVEMENT_TIER_COLORS)).size).toBe(3)
    expect(ACHIEVEMENT_TIER_COLORS.gold).toBe('#d4a548')
  })

  it('Perfekter Tag, Kapitel, Attribut', () => {
    expect(perfectDayToastText({ bonusXp: 15, today: true })).toEqual({
      title: 'Perfekter Tag! +15 Bonus-XP',
      description: 'Alle heutigen Tagesquests erfüllt.',
    })
    expect(bonusGrowthToastText(1250)).toEqual({
      title: 'Tagesbonus steigt auf +1.250 Bonus-XP',
      description: 'Perfekter Tag – jede weitere Quest erhöht ihn.',
    })
    expect(perfectDayToastText({ bonusXp: 8, today: false })).toEqual({
      title: 'Perfekter Tag! +8 Bonus-XP',
      description: 'Nachgetragen – ein vergangener Tag ist jetzt makellos.',
    })
    expect(
      chapterToastText({
        type: 'chapter-completed',
        campaignId: 'c',
        campaignTitle: 'Der Weg des Gelehrten',
        campaignIcon: '📚',
        chapterId: 'k',
        chapterTitle: 'Der erste Funke',
        xp: 100,
      }),
    ).toEqual({ title: 'Kapitel abgeschlossen: Der erste Funke · +100 XP', description: 'Der Weg des Gelehrten' })
    expect(
      attributeToastText({
        type: 'attribute-level-up',
        attribute: 'intellect',
        from: 2,
        to: 3,
        xpIntoLevel: 10,
        xpForNextLevel: 158,
      }),
    ).toEqual({ title: 'Intelligenz steigt auf Level 3', description: 'Noch 148 XP bis Level 4' })
  })

  it('Rang-Hinweise', () => {
    expect(nextRank(1)).toEqual({ minLevel: 3, title: 'Lehrling' })
    expect(nextRank(40)).toBeUndefined()
    expect(rankHint(4, 'Lehrling')).toBe('Nur noch 1 Level bis zum Rang Wanderer')
    expect(rankHint(5, 'Wanderer')).toBe('Noch 3 Level bis zum Rang Abenteurer')
    expect(rankHint(45, 'Mythos')).toBe('Dein Rang: Mythos')
  })
})

describe('Feier-Warteschlange', () => {
  const level = (from: number, to: number, rank = 'Novize', previousRank = 'Novize'): LevelUpEvent => ({
    type: 'level-up',
    from,
    to,
    level: { level: to } as LevelInfo,
    rank,
    previousRank,
    rankChanged: rank !== previousRank,
  })
  const campaign: CampaignCompletedEvent = {
    type: 'campaign-completed',
    campaignId: 'c',
    title: 'Der Weg des Gelehrten',
    icon: '📚',
    reward: 'Buch',
    chapterCount: 5,
    xp: 500,
  }
  const ids = () => {
    let id = 0
    return () => ++id
  }

  it('zeigt erst die Kampagne, dann den Level-Up', () => {
    const queue = enqueueCelebrations([], [level(4, 5), campaign], ids())
    expect(queue.map((c) => c.kind)).toEqual(['campaign', 'level-up'])
    expect(new Set(queue.map((c) => c.id)).size).toBe(2)
  })

  it('fasst wartende Level-Ups zusammen, lässt den sichtbaren aber unverändert', () => {
    const next = ids()
    let queue: Celebration[] = enqueueCelebrations([], [level(2, 3, 'Lehrling', 'Novize')], next)
    queue = enqueueCelebrations(queue, [level(3, 4, 'Lehrling', 'Lehrling')], next)
    expect(queue).toHaveLength(2) // der sichtbare bleibt, der neue wartet
    queue = enqueueCelebrations(queue, [level(4, 5, 'Wanderer', 'Lehrling')], next)
    expect(queue).toHaveLength(2)
    expect(queue[0].event).toMatchObject({ from: 2, to: 3 })
    expect(queue[1].event).toMatchObject({ from: 3, to: 5, rank: 'Wanderer', previousRank: 'Lehrling', rankChanged: true })
  })

  it('erkennt, ob Ereignisse eine Szene auslösen', () => {
    expect(hasCelebration([level(1, 2)])).toBe(true)
    expect(hasCelebration([{ type: 'perfect-day', bonusXp: 5, addedXp: 5, today: true }])).toBe(false)
  })
})

describe('Konfetti-Partikel', () => {
  it('sind reproduzierbar und nutzen die Theme-Farben', () => {
    const a = createConfettiParticles({ count: 30, mode: 'burst', distance: 300 }, seededRandom(7))
    const b = createConfettiParticles({ count: 30, mode: 'burst', distance: 300 }, seededRandom(7))
    expect(a).toEqual(b)
    expect(a).toHaveLength(30)
    for (const particle of a) {
      expect(CONFETTI_COLORS).toContain(particle.color)
      expect(particle.x[0]).toBe(0)
      expect(particle.y[0]).toBe(0)
      // fällt am Ende tiefer als am höchsten Punkt („Schwerkraft“)
      expect(particle.y[2]).toBeGreaterThan(particle.y[1])
    }
  })

  it('Fächer fliegt nach unten (Toast oben am Handy) und bleibt so im Bild', () => {
    const particles = createConfettiParticles({ count: 50, mode: 'spray', distance: 300 }, seededRandom(5))
    for (const particle of particles) {
      expect(particle.y[1]).toBeGreaterThan(0)
      expect(particle.y[2]).toBeGreaterThan(particle.y[1])
    }
    // Breit gefächert: nach links und nach rechts.
    expect(particles.some((particle) => particle.x[1] < -50)).toBe(true)
    expect(particles.some((particle) => particle.x[1] > 50)).toBe(true)
  })

  it('Fontäne fliegt nach oben, Lebensdauer ist begrenzt', () => {
    const particles = createConfettiParticles({ count: 50, mode: 'cannon', distance: 300 }, seededRandom(3))
    for (const particle of particles) expect(particle.y[1]).toBeLessThan(0)
    const lifetime = confettiLifetime(particles)
    expect(lifetime).toBeGreaterThan(1)
    expect(lifetime).toBeLessThanOrEqual(2.7)
  })
})

describe('XP-Zusammenfassung', () => {
  const gain = (amount: number, titles: string[], backfill = false, bonusXp = 0): XpGainedEvent => ({
    type: 'xp-gained',
    amount,
    questXp: amount - bonusXp,
    gold: Math.floor(amount / 2),
    bonusXp,
    quests: titles.map(quest),
    backfill,
  })

  it('fasst Gewinne innerhalb des Zeitfensters zusammen (ohne doppelte Quests)', () => {
    const first = nextXpSession(null, gain(20, ['Lesen']), 1000)
    expect(first.merged).toBe(false)
    const second = nextXpSession(first.session, gain(15, ['Meditieren'], false, 5), 1000 + XP_MERGE_WINDOW_MS)
    expect(second.merged).toBe(true)
    expect(second.session).toMatchObject({ amount: 35, gold: 17, bonusXp: 5, backfill: false })
    expect(second.session.quests.map((q) => q.title)).toEqual(['Lesen', 'Meditieren'])
    // Das Fenster zählt ab dem letzten Gewinn.
    const third = nextXpSession(second.session, gain(20, ['Lesen']), 1000 + 2 * XP_MERGE_WINDOW_MS)
    expect(third.session.quests.map((q) => q.title)).toEqual(['Lesen', 'Meditieren'])
    expect(third.session.amount).toBe(55)
  })

  it('hält Quest und gleich-identische Nebenquest auseinander', () => {
    const first = nextXpSession(null, gain(20, ['Lesen']), 0)
    const side: XpGainedEvent = { ...gain(10, []), quests: [{ ...quest('Lesen'), title: 'Buch zurückgeben', sideQuest: true }] }
    const merged = nextXpSession(first.session, side, 10)
    expect(merged.session.quests.map((q) => q.title)).toEqual(['Lesen', 'Buch zurückgeben'])
    expect(merged.session.gold).toBe(15)
  })

  it('beginnt nach dem Zeitfenster neu', () => {
    const first = nextXpSession(null, gain(20, ['Lesen'], true), 0)
    expect(isXpSessionOpen(first.session, XP_MERGE_WINDOW_MS)).toBe(true)
    expect(isXpSessionOpen(first.session, XP_MERGE_WINDOW_MS + 1)).toBe(false)
    const later = nextXpSession(first.session, gain(10, ['Meditieren']), XP_MERGE_WINDOW_MS + 1)
    expect(later).toMatchObject({ merged: false, session: { amount: 10, backfill: false } })
  })

  it('bleibt nur nachgetragen, wenn alle Gewinne nachgetragen sind', () => {
    const first = nextXpSession(null, gain(20, ['Lesen'], true), 0)
    expect(nextXpSession(first.session, gain(10, ['Meditieren'], true), 10).session.backfill).toBe(true)
    expect(nextXpSession(first.session, gain(10, ['Meditieren'], false), 10).session.backfill).toBe(false)
  })
})
