import { describe, expect, it } from 'vitest'
import { deriveGameState } from '../../domain/engine'
import { makeChapter, makeCompletion, makeGameData, makeHabit, makeMainQuest } from '../../domain/testing'
import type { Completion, DayKey, GameState, MainQuest } from '../../domain/types'
import {
  celebrationMemoryOf,
  enqueueCelebrations,
  reconcileCelebrations,
  rememberCelebration,
  withoutCelebrated,
} from './celebrations'
import type { Celebration } from './celebrations'
import { diffGameStates, feedbackStillHolds } from './feedbackEvents'
import type { FeedbackEvent } from './feedbackEvents'

const TODAY: DayKey = '2026-11-03'
const YESTERDAY: DayKey = '2026-11-02'

const training = makeHabit({ id: 'train', title: 'Krafttraining', attribute: 'strength', difficulty: 'epic', createdDay: '2026-10-01' })
const reading = makeHabit({ id: 'read', title: 'Lesen', attribute: 'intellect', difficulty: 'easy', createdDay: '2026-10-01', order: 1 })
const campaign = makeMainQuest({
  id: 'scholar',
  title: 'Der Weg des Gelehrten',
  chapters: [makeChapter({ id: 'club', title: 'Lesekreis', criterion: { type: 'manual' } })],
})
const doneCampaign: MainQuest = { ...campaign, chapters: [{ ...campaign.chapters[0], manualDone: true, completedDay: TODAY }] }

function game(completions: Completion[], mainQuests: MainQuest[] = [campaign]): GameState {
  return deriveGameState(
    makeGameData({
      profile: { name: 'Aria', avatar: '🧙', createdDay: '2026-10-01' },
      habits: [training, reading],
      completions,
      mainQuests,
    }),
    TODAY,
  )
}

const level1 = game([])
/** 80 XP, gestern nicht perfekt (Lesen fehlte). */
const yesterdayOnly = game([makeCompletion(training, YESTERDAY)])
/** 160 XP → Level 2, Stärke Level 3. Heute nicht perfekt (Lesen fehlt). */
const level2 = game([makeCompletion(training, YESTERDAY), makeCompletion(training, TODAY)])
// Kampagne (+600 XP) → Level 3.
const withCampaign = game([], [doneCampaign])

function ids() {
  let id = 0
  return () => ++id
}

function queueFor(prev: GameState, next: GameState): Celebration[] {
  return enqueueCelebrations([], diffGameStates(prev, next), ids())
}

describe('Feier-Gedächtnis', () => {
  it('feiert einen schon gesehenen Level nicht noch einmal', () => {
    const events = diffGameStates(level1, level2)
    expect(events.map((event) => event.type)).toContain('level-up')

    const fresh = celebrationMemoryOf(level1)
    expect(withoutCelebrated(events, fresh)).toEqual(events)

    const [levelUp] = queueFor(level1, level2)
    const seen = rememberCelebration(fresh, levelUp)
    expect(seen.level).toBe(2)
    // Haken entfernt und wieder gesetzt: derselbe Level-Up – ohne Szene, die Toasts bleiben.
    const again = withoutCelebrated(events, seen)
    expect(again.map((event) => event.type)).not.toContain('level-up')
    expect(again.map((event) => event.type)).toContain('xp-gained')
  })

  it('feiert einen höheren Level trotzdem', () => {
    const seen = { ...celebrationMemoryOf(level1), level: 2 }
    const events = diffGameStates(level1, withCampaign)
    expect(withoutCelebrated(events, seen).filter((event) => event.type === 'level-up')).toMatchObject([
      { from: 1, to: 3 },
    ])
  })

  it('feiert eine schon gefeierte (oder beim Start abgeschlossene) Kampagne nicht noch einmal', () => {
    const events = diffGameStates(level1, withCampaign)
    const [campaignScene] = queueFor(level1, withCampaign)
    expect(campaignScene.kind).toBe('campaign')
    const seen = rememberCelebration(celebrationMemoryOf(level1), campaignScene)
    expect(withoutCelebrated(events, seen).map((event) => event.type)).not.toContain('campaign-completed')

    expect(celebrationMemoryOf(withCampaign).campaigns.has('scholar')).toBe(true)
    expect(celebrationMemoryOf(level1).campaigns.has('scholar')).toBe(false)
  })
})

describe('reconcileCelebrations', () => {
  it('lässt die Warteschlange unverändert, solange alles stimmt', () => {
    const queue = queueFor(level1, withCampaign)
    expect(reconcileCelebrations(queue, withCampaign)).toBe(queue)
  })

  it('entfernt Szenen, deren Erfolg rückgängig gemacht wurde', () => {
    const queue = queueFor(level1, withCampaign)
    expect(queue.map((celebration) => celebration.kind)).toEqual(['campaign', 'level-up'])
    expect(reconcileCelebrations(queue, level1)).toEqual([])
  })

  it('kürzt einen Mehrfach-Level-Up, wenn nur ein Teil verloren ging', () => {
    const [, levelUp] = queueFor(level1, withCampaign) // 1 → 3
    const [reconciled] = reconcileCelebrations([levelUp], level2)
    expect(reconciled.id).toBe(levelUp.id)
    expect(reconciled.event).toMatchObject({ from: 1, to: 2, level: level2.level, rank: 'Novize', rankChanged: false })
  })
})

describe('feedbackStillHolds', () => {
  const holds = (prev: GameState, next: GameState, now: GameState) =>
    Object.fromEntries(diffGameStates(prev, next).map((event: FeedbackEvent) => [event.type, feedbackStillHolds(event, now)]))

  it('stimmt, solange die Erledigung besteht', () => {
    expect(holds(yesterdayOnly, level2, level2)).toEqual({
      'xp-gained': true,
      'attribute-level-up': true,
      'level-up': true,
    })
  })

  it('stimmt nicht mehr, wenn der Haken wieder entfernt wurde', () => {
    expect(holds(yesterdayOnly, level2, yesterdayOnly)).toEqual({
      'xp-gained': false,
      'attribute-level-up': false,
      'level-up': false,
    })
  })

  it('prüft Perfekten Tag, Kapitel und Kampagne', () => {
    const almost = game([makeCompletion(reading, TODAY)])
    const perfect = game([makeCompletion(reading, TODAY), makeCompletion(training, TODAY)])
    const [, perfectDay] = diffGameStates(almost, perfect)
    expect(perfectDay).toMatchObject({ type: 'perfect-day', today: true })
    expect(feedbackStillHolds(perfectDay, perfect)).toBe(true)
    expect(feedbackStillHolds(perfectDay, almost)).toBe(false)

    const events = diffGameStates(level1, withCampaign)
    const chapter = events.find((event) => event.type === 'chapter-completed')
    const done = events.find((event) => event.type === 'campaign-completed')
    expect(chapter && feedbackStillHolds(chapter, withCampaign)).toBe(true)
    expect(done && feedbackStillHolds(done, withCampaign)).toBe(true)
    expect(chapter && feedbackStillHolds(chapter, level1)).toBe(false)
    expect(done && feedbackStillHolds(done, level1)).toBe(false)
    // Kampagne gelöscht
    expect(chapter && feedbackStillHolds(chapter, game([], []))).toBe(false)
  })

  it('lässt nachgetragene XP stehen (die Quest lässt sich nicht sicher zuordnen)', () => {
    const backfilled = game([makeCompletion(training, YESTERDAY)])
    const [xp] = diffGameStates(level1, backfilled)
    expect(xp).toMatchObject({ type: 'xp-gained', backfill: true })
    expect(feedbackStillHolds(xp, level1)).toBe(true)
  })
})

describe('Niederlage-Szene', () => {
  const defeat = (day: DayKey): FeedbackEvent => ({ type: 'defeat', day, goldLost: 120, count: 1, hp: 55, max: 55 })

  it('steht vor Kampagnen und Level-Up in der Warteschlange und gilt weiter als gültig', () => {
    const events = [...diffGameStates(level1, level2), defeat(YESTERDAY)]
    const queue = enqueueCelebrations([], events, ids())
    expect(queue.map((celebration) => celebration.kind)).toEqual(['defeat', 'level-up'])
    // Abgerechnete Tage ändern sich nie: Die Szene bleibt, auch wenn sonst etwas zurückgenommen wird.
    expect(reconcileCelebrations(queue, level1).map((celebration) => celebration.kind)).toEqual(['defeat'])
    expect(feedbackStillHolds(defeat(YESTERDAY), level1)).toBe(true)
  })

  it('zeigt eine schon gesehene (oder beim Start bekannte) Niederlage nicht noch einmal', () => {
    const memory = celebrationMemoryOf(level1)
    expect(withoutCelebrated([defeat(YESTERDAY)], memory)).toHaveLength(1)
    const [scene] = enqueueCelebrations([], [defeat(YESTERDAY)], ids())
    const seen = rememberCelebration(memory, scene)
    expect(seen.lastDefeatDay).toBe(YESTERDAY)
    expect(withoutCelebrated([defeat(YESTERDAY), defeat('2026-11-01')], seen)).toEqual([])
    expect(withoutCelebrated([defeat(TODAY)], seen)).toHaveLength(1)

    const known = celebrationMemoryOf({ ...level1, hp: { ...level1.hp, lastDefeat: { day: YESTERDAY, goldLost: 1 } } })
    expect(withoutCelebrated([defeat(YESTERDAY)], known)).toEqual([])
  })
})
