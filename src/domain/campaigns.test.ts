import { describe, expect, it } from 'vitest'
import { BALANCING } from './balancing'
import {
  activeCampaigns,
  CAMPAIGN_LIMIT_MESSAGE,
  campaignSlotsLeft,
  countActiveCampaigns,
  isBlueprintActive,
  isCampaignActive,
} from './campaigns'
import { deriveGameState, evaluateMainQuests } from './engine'
import { makeChapter, makeCompletion, makeGameData, makeHabit, makeMainQuest } from './testing'
import type { GameData, MainQuest } from './types'

const TODAY = '2026-11-04'

const reading = makeHabit({ id: 'reading', createdDay: '2026-11-01' })

/** Kampagne mit einem offenen manuellen Kapitel (aktiv, solange nicht archiviert). */
function open(id: string, extra: Partial<MainQuest> = {}): MainQuest {
  return makeMainQuest({ id, chapters: [makeChapter({ id: `${id}-c`, criterion: { type: 'manual' } })], ...extra })
}

/** Kampagne, deren einziges Kapitel abgeschlossen ist. */
function done(id: string, extra: Partial<MainQuest> = {}): MainQuest {
  return makeMainQuest({
    id,
    chapters: [makeChapter({ id: `${id}-c`, criterion: { type: 'manual' }, manualDone: true, completedDay: '2026-11-02' })],
    ...extra,
  })
}

function data(mainQuests: MainQuest[], extra: Partial<GameData> = {}): GameData {
  return makeGameData({ habits: [reading], mainQuests, ...extra })
}

describe('isCampaignActive', () => {
  it('aktiv = nicht archiviert und nicht abgeschlossen', () => {
    const states = evaluateMainQuests(
      data([open('a'), done('b'), open('c', { archived: true }), done('d', { archived: true }), makeMainQuest({ id: 'leer' })]),
      TODAY,
    )
    expect(states.map((state) => [state.quest.id, isCampaignActive(state)])).toEqual([
      ['a', true],
      ['b', false],
      ['c', false],
      ['d', false],
      // Ohne Kapitel ist eine Kampagne nie abgeschlossen – also aktiv.
      ['leer', true],
    ])
  })
})

describe('evaluateMainQuests', () => {
  it('liefert dieselbe Auswertung wie deriveGameState (aktive und archivierte, gespeicherte Reihenfolge)', () => {
    const habitChapter = makeMainQuest({
      id: 'h',
      startDay: '2026-11-01',
      chapters: [makeChapter({ id: 'h1', criterion: { type: 'habit', habitId: 'reading', metric: 'completions', target: 2 } })],
    })
    const input = data([open('a', { archived: true }), habitChapter, done('b')], {
      completions: [makeCompletion(reading, '2026-11-02'), makeCompletion(reading, '2026-11-04'), makeCompletion(reading, '2026-11-05')],
    })
    const state = deriveGameState(input, TODAY)
    expect(evaluateMainQuests(input, TODAY)).toEqual([state.archivedMainQuests[0], ...state.mainQuests])
    // Completions nach today zählen nicht – wie in deriveGameState.
    expect(evaluateMainQuests(input, '2026-11-03')[1]).toMatchObject({ complete: false })
    expect(evaluateMainQuests(input, TODAY)[1]).toMatchObject({ complete: true })
  })
})

describe('countActiveCampaigns / campaignSlotsLeft', () => {
  it('zählt nur aktive Kampagnen', () => {
    const input = data([open('a'), done('b'), open('c', { archived: true }), open('d')])
    expect(countActiveCampaigns(input, TODAY)).toBe(2)
    expect(activeCampaigns(input, TODAY).map((state) => state.quest.id)).toEqual(['a', 'd'])
    expect(campaignSlotsLeft(input, TODAY)).toBe(BALANCING.maxActiveCampaigns - 2)
  })

  it('leerer Spielstand: alle Plätze frei', () => {
    expect(countActiveCampaigns(makeGameData(), TODAY)).toBe(0)
    expect(campaignSlotsLeft(makeGameData(), TODAY)).toBe(BALANCING.maxActiveCampaigns)
  })

  it('nie negativ, auch wenn (z. B. nach einem Import) mehr Kampagnen aktiv sind als erlaubt', () => {
    const many = Array.from({ length: BALANCING.maxActiveCampaigns + 2 }, (_, i) => open(`k${i}`))
    expect(countActiveCampaigns(data(many), TODAY)).toBe(BALANCING.maxActiveCampaigns + 2)
    expect(campaignSlotsLeft(data(many), TODAY)).toBe(0)
  })

  it('„abgeschlossen“ hängt vom Stichtag ab – genau wie in der Anzeige', () => {
    const quest = makeMainQuest({
      id: 'h',
      startDay: '2026-11-01',
      chapters: [makeChapter({ id: 'h1', criterion: { type: 'habit', habitId: 'reading', metric: 'completions', target: 1 } })],
    })
    const input = data([quest], { completions: [makeCompletion(reading, '2026-11-04')] })
    expect(countActiveCampaigns(input, '2026-11-03')).toBe(1)
    expect(countActiveCampaigns(input, '2026-11-04')).toBe(0)
    expect(deriveGameState(input, '2026-11-04').mainQuests[0].complete).toBe(true)
  })

  it('Limit-Meldung nennt die Zahl aus dem Balancing', () => {
    expect(CAMPAIGN_LIMIT_MESSAGE).toBe(
      `Du hast schon ${BALANCING.maxActiveCampaigns} aktive Kampagnen. Schließe eine ab oder beende sie, um eine neue zu beginnen.`,
    )
  })
})

describe('isBlueprintActive', () => {
  it('nur aktive Kampagnen aus dieser Vorlage zählen', () => {
    const input = data([
      open('a', { blueprint: { id: 'scholar', level: 'beginner' } }),
      done('b', { blueprint: { id: 'body', level: 'advanced', pathId: 'strength' } }),
      open('c', { archived: true, blueprint: { id: 'monk', level: 'beginner' } }),
      open('d'),
    ])
    expect(isBlueprintActive(input, TODAY, 'scholar')).toBe(true)
    expect(isBlueprintActive(input, TODAY, 'body')).toBe(false)
    expect(isBlueprintActive(input, TODAY, 'monk')).toBe(false)
    expect(isBlueprintActive(input, TODAY, 'polyglot')).toBe(false)
  })
})
