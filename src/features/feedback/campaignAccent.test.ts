import { describe, expect, it } from 'vitest'
import { ATTRIBUTES } from '../../domain/attributes'
import { seededRandom } from '../../domain/testing'
import type { AttributeId, MainQuest, MainQuestState } from '../../domain/types'
import { campaignAccentById } from './campaignAccent'
import { CONFETTI_COLORS, confettiColors, createConfettiParticles } from './confetti'

function campaign(id: string, patch: Partial<MainQuest> = {}, dominantAttribute?: AttributeId): MainQuestState {
  const state: MainQuestState = {
    quest: { id, title: id, icon: '📜', why: '', reward: '', startDay: '2026-11-01', chapters: [], createdAt: 1, ...patch },
    chapters: [],
    progress: 0,
    currentChapterIndex: -1,
    complete: false,
    linkedHabitIds: [],
  }
  if (dominantAttribute !== undefined) state.dominantAttribute = dominantAttribute
  return state
}

describe('campaignAccentById', () => {
  it('nimmt das am stärksten trainierte Attribut der Kampagne – vor dem der Vorlage', () => {
    const state = { mainQuests: [campaign('a', { blueprint: { id: 'scholar', level: 'beginner' } }, 'vitality')], archivedMainQuests: [] }
    expect(campaignAccentById(state, 'a')).toBe(ATTRIBUTES.vitality.color)
  })

  it('ohne aktive Quests: Haupt-Attribut der Vorlage bzw. der gewählten Klasse', () => {
    const state = {
      mainQuests: [
        campaign('monk', { blueprint: { id: 'monk', level: 'beginner' } }),
        campaign('ranger', { blueprint: { id: 'body', level: 'beginner', pathId: 'endurance' } }),
      ],
      archivedMainQuests: [],
    }
    expect(campaignAccentById(state, 'monk')).toBe(ATTRIBUTES.wisdom.color)
    expect(campaignAccentById(state, 'ranger')).toBe(ATTRIBUTES.vitality.color)
  })

  it('findet auch archivierte Kampagnen', () => {
    const state = { mainQuests: [], archivedMainQuests: [campaign('old', {}, 'discipline')] }
    expect(campaignAccentById(state, 'old')).toBe(ATTRIBUTES.discipline.color)
  })

  it('ohne Attribut oder unbekannte Kampagne: keine Farbe (die Rückmeldung bleibt golden)', () => {
    const state = { mainQuests: [campaign('own')], archivedMainQuests: [] }
    expect(campaignAccentById(state, 'own')).toBeUndefined()
    expect(campaignAccentById(state, 'gibt-es-nicht')).toBeUndefined()
  })
})

describe('confettiColors', () => {
  it('ohne Kampagnenfarbe: Gold, Pergament und alle Attributfarben', () => {
    expect(confettiColors()).toBe(CONFETTI_COLORS)
  })

  it('mit Kampagnenfarbe: Gold und Pergament, dazu etwa zur Hälfte die Kampagnenfarbe – keine anderen Attributfarben', () => {
    const red = ATTRIBUTES.strength.color
    const colors = confettiColors(red)
    expect(colors).toContain('var(--color-gold-bright)')
    expect(colors).toContain('var(--color-parchment)')
    const accented = colors.filter((color) => color.includes(red))
    expect(accented.length / colors.length).toBeGreaterThanOrEqual(0.4)
    expect(accented.length / colors.length).toBeLessThanOrEqual(0.6)
    expect(colors.some((color) => color.startsWith('var(--color-attr-'))).toBe(false)
  })

  it('die Partikel nehmen nur Farben aus der übergebenen Mischung', () => {
    const blue = ATTRIBUTES.intellect.color
    const colors = confettiColors(blue)
    const particles = createConfettiParticles({ count: 80, mode: 'burst', distance: 300, colors }, seededRandom(11))
    for (const particle of particles) expect(colors).toContain(particle.color)
    expect(particles.some((particle) => particle.color === blue)).toBe(true)
    expect(particles.some((particle) => particle.color.startsWith('var(--color-gold'))).toBe(true)
    // Standard bleibt die volle Mischung.
    for (const particle of createConfettiParticles({ count: 20, mode: 'burst', distance: 300 }, seededRandom(11))) {
      expect(CONFETTI_COLORS).toContain(particle.color)
    }
  })
})
