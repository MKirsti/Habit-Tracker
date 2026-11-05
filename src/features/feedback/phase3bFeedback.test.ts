import { describe, expect, it, vi } from 'vitest'
import { COMPANIONS } from '../../domain/companionDefinitions'
import { deriveGameState } from '../../domain/engine'
import { makeChapter, makeChest, makeCompanionChoice, makeGameData, makeMainQuest } from '../../domain/testing'
import type { CompanionState, GameData, GameState, MainQuest } from '../../domain/types'
import { celebrationMemoryOf, enqueueCelebrations, reconcileCelebrations, rememberCelebration, withoutCelebrated } from './celebrations'
import { endBossVictorySceneText, evolutionSceneText } from './combatSceneText'
import { companionEvolution, companionEvolutionStillHolds } from './companionFeedback'
import type { CompanionEvolvedEvent } from './companionFeedback'
import { clampStage, companionGlow, companionGlowStyle, stageLabel, stageLine } from './companionTheme'
import { campaignChestId, endBossVictories, endBossVictoryStillHolds } from './endBossFeedback'
import type { EndBossDefeatedEvent } from './endBossFeedback'
import { feedbackStillHolds } from './feedbackEvents'
import type { FeedbackEvent } from './feedbackEvents'
import { FEEDBACK_CUES, sceneCue, toastCue } from './feedbackSounds'

// Das Sound-Modul (Web Audio) braucht hier niemand – die reinen Funktionen werden geprüft.
vi.mock('../sound', () => ({ useGameSounds: () => ({ play: () => {}, vibrate: () => {} }) }))

const TODAY = '2026-11-04'
const PROFILE = { name: 'Aria', avatar: '🧙', createdDay: '2026-10-01' }
const base = deriveGameState(makeGameData({ profile: PROFILE }), TODAY)

function companion(stage: number, overrides: Partial<CompanionState> = {}): CompanionState {
  return {
    choice: makeCompanionChoice('raccoon', { name: 'Krümel' }),
    definition: COMPANIONS.raccoon,
    stage,
    sleeping: false,
    ...overrides,
  }
}

function withCompanion(value: CompanionState | undefined): GameState {
  const state: GameState = { ...base }
  if (value === undefined) delete state.companion
  else state.companion = value
  return state
}

// ---------------------------------------------------------------------------
// Gefährte: Entwicklung
// ---------------------------------------------------------------------------

describe('companionEvolution', () => {
  it('meldet die neue Stufe mit alter und neuer Stufen-Bezeichnung der Art', () => {
    const event = companionEvolution(withCompanion(companion(0)), withCompanion(companion(1, { daysToNextStage: 46 })))
    expect(event).toEqual({
      type: 'companion-evolved',
      species: 'raccoon',
      icon: '🦝',
      name: 'Krümel',
      from: 0,
      to: 1,
      fromName: 'Wuselwicht',
      toName: 'Glitzerpfote',
      description: COMPANIONS.raccoon.stages[1].description,
      daysToNextStage: 46,
    })
  })

  it('meldet nichts ohne Aufstieg, bei der ersten Wahl und bei einem Rückgang', () => {
    expect(companionEvolution(withCompanion(companion(1)), withCompanion(companion(1)))).toBeUndefined()
    expect(companionEvolution(withCompanion(undefined), withCompanion(companion(2)))).toBeUndefined()
    expect(companionEvolution(withCompanion(companion(2)), withCompanion(companion(1)))).toBeUndefined()
    expect(companionEvolution(withCompanion(companion(1)), withCompanion(undefined))).toBeUndefined()
  })

  it('gilt, solange die neue Stufe erreicht ist – nach dem Zurücknehmen nicht mehr', () => {
    const event = companionEvolution(withCompanion(companion(0)), withCompanion(companion(1))) as CompanionEvolvedEvent
    expect(companionEvolutionStillHolds(event, withCompanion(companion(1)))).toBe(true)
    expect(feedbackStillHolds(event, withCompanion(companion(2)))).toBe(true)
    expect(feedbackStillHolds(event, withCompanion(companion(0)))).toBe(false)
    expect(feedbackStillHolds(event, withCompanion(undefined))).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// Endgegner
// ---------------------------------------------------------------------------

/** Kampagne mit zwei manuellen Kapiteln – das zweite (letzte) ist der Endgegner. */
function campaign(firstDone: boolean, lastDone: boolean, overrides: Partial<MainQuest> = {}): MainQuest {
  return makeMainQuest({
    id: 'scholar-1',
    title: 'Der Weg des Gelehrten',
    icon: '📚',
    blueprint: { id: 'scholar', level: 'beginner' },
    startDay: '2026-10-01',
    chapters: [
      makeChapter({ id: 'c1', criterion: { type: 'manual' }, manualDone: firstDone, ...(firstDone ? { completedDay: TODAY } : {}) }),
      makeChapter({ id: 'c2', criterion: { type: 'manual' }, manualDone: lastDone, ...(lastDone ? { completedDay: TODAY } : {}) }),
    ],
    ...overrides,
  })
}

function stateWith(quest: MainQuest, extra: Partial<GameData> = {}): GameState {
  return deriveGameState(makeGameData({ profile: PROFILE, mainQuests: [quest], ...extra }), TODAY)
}

describe('endBossVictories', () => {
  it('meldet den Endgegner, sobald das letzte Kapitel fällt – mit der Truhe der gemeisterten Kampagne', () => {
    const before = stateWith(campaign(true, false))
    const after = stateWith(campaign(true, true))
    const events = endBossVictories(before, after)
    expect(events).toHaveLength(1)
    const [event] = events
    expect(event).toMatchObject({
      type: 'end-boss-defeated',
      campaignId: 'scholar-1',
      campaignTitle: 'Der Weg des Gelehrten',
      campaignIcon: '📚',
      bossId: 'end-scholar',
      name: 'Der Bibliothekar der Ewigkeit',
      campaignComplete: true,
    })
    expect(event.defeatLine).toMatch(/Bibliothekar/)
    // Die Endgegner-Truhe steht im Zustand (gerade gefunden) – sie gehört in die Szene.
    if (after.chests.some((chest) => chest.id === campaignChestId('scholar-1'))) {
      expect(event.chestId).toBe('campaign:scholar-1')
    }
  })

  it('verweist auf die Endgegner-Truhe, wenn sie im Zustand liegt', () => {
    const before = stateWith(campaign(true, false))
    const after: GameState = {
      ...stateWith(campaign(true, true)),
      chests: [makeChest('campaign:scholar-1', { source: 'campaign', rarity: 'rare' })],
    }
    expect(endBossVictories(before, after)[0].chestId).toBe('campaign:scholar-1')
  })

  it('meldet auch einen Endgegner vor den übrigen Kapiteln – dann ohne Truhe und nicht gemeistert', () => {
    const [event] = endBossVictories(stateWith(campaign(false, false)), stateWith(campaign(false, true)))
    expect(event.campaignComplete).toBe(false)
    expect(event.chestId).toBeUndefined()
  })

  it('meldet nichts für neue Kampagnen, schon besiegte Endgegner oder ein anderes letztes Kapitel', () => {
    expect(endBossVictories(base, stateWith(campaign(true, true)))).toEqual([])
    expect(endBossVictories(stateWith(campaign(true, true)), stateWith(campaign(true, true)))).toEqual([])
    // Vorher war das offene c2 der Endgegner; jetzt ist ein neues, schon erledigtes c3 das letzte Kapitel – kein Sieg.
    const extended = campaign(true, false)
    extended.chapters = [
      ...extended.chapters,
      makeChapter({ id: 'c3', criterion: { type: 'manual' }, manualDone: true, completedDay: TODAY }),
    ]
    expect(endBossVictories(stateWith(campaign(true, false)), stateWith(extended))).toEqual([])
  })

  it('gilt, solange das letzte Kapitel erledigt ist', () => {
    const [event] = endBossVictories(stateWith(campaign(true, false)), stateWith(campaign(true, true)))
    expect(endBossVictoryStillHolds(event, stateWith(campaign(true, true)))).toBe(true)
    expect(feedbackStillHolds(event, stateWith(campaign(true, false)))).toBe(false)
    expect(feedbackStillHolds(event, base)).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// Warteschlange der Szenen
// ---------------------------------------------------------------------------

const END_BOSS: EndBossDefeatedEvent = {
  type: 'end-boss-defeated',
  campaignId: 'scholar-1',
  campaignTitle: 'Der Weg des Gelehrten',
  campaignIcon: '📚',
  bossId: 'end-scholar',
  name: 'Der Bibliothekar der Ewigkeit',
  icon: '🕰️',
  defeatLine: 'Der Bibliothekar verneigt sich.',
  campaignComplete: true,
}

const EVOLVED: CompanionEvolvedEvent = {
  type: 'companion-evolved',
  species: 'fox',
  icon: '🦊',
  name: 'Flink',
  from: 0,
  to: 1,
  fromName: 'Fuchswelpe',
  toName: 'Spitzohr',
  description: 'Text.',
  daysToNextStage: 46,
}

describe('Szenen-Warteschlange (Phase 3b)', () => {
  it('zeigt den Endgegner vor seiner Kampagne, die Entwicklung vor dem Level-Up', () => {
    let id = 0
    const events: FeedbackEvent[] = [
      { type: 'level-up', from: 4, to: 5, level: base.level, rank: 'Wanderer', previousRank: 'Lehrling', rankChanged: true },
      EVOLVED,
      { type: 'campaign-completed', campaignId: 'scholar-1', title: 'Der Weg des Gelehrten', icon: '📚', reward: 'Buch', chapterCount: 2, xp: 500 },
      END_BOSS,
    ]
    const queue = enqueueCelebrations([], events, () => ++id)
    expect(queue.map((celebration) => celebration.kind)).toEqual(['end-boss', 'campaign', 'evolve', 'level-up'])
  })

  it('merkt sich gefeierte Endgegner und Stufen – sie kommen nicht noch einmal', () => {
    let memory = celebrationMemoryOf(base)
    expect(memory.companionStage).toBe(0)
    expect(withoutCelebrated([END_BOSS, EVOLVED], memory)).toEqual([END_BOSS, EVOLVED])
    memory = rememberCelebration(memory, { id: 1, kind: 'end-boss', event: END_BOSS })
    memory = rememberCelebration(memory, { id: 2, kind: 'evolve', event: EVOLVED })
    expect(withoutCelebrated([END_BOSS, EVOLVED], memory)).toEqual([])
    expect(withoutCelebrated([{ ...EVOLVED, from: 1, to: 2 }], memory)).toHaveLength(1)
  })

  it('beim Start schon erreichte Stufe und besiegte Endgegner gelten als gefeiert', () => {
    const start = { ...stateWith(campaign(true, true)), companion: companion(2) }
    const memory = celebrationMemoryOf(start)
    expect(memory.companionStage).toBe(2)
    expect(memory.endBosses.has('scholar-1')).toBe(true)
    expect(withoutCelebrated([END_BOSS, { ...EVOLVED, to: 2 }], memory)).toEqual([])
  })

  it('entfernt eine wartende Entwicklung, wenn die Stufe wieder sinkt', () => {
    const queue = enqueueCelebrations([], [EVOLVED], () => 1)
    expect(reconcileCelebrations(queue, withCompanion(companion(1)))).toBe(queue)
    expect(reconcileCelebrations(queue, withCompanion(companion(0)))).toEqual([])
  })
})

// ---------------------------------------------------------------------------
// Texte
// ---------------------------------------------------------------------------

describe('Szenen-Texte (Phase 3b)', () => {
  it('Endgegner: Titel, Kampagne, Siegessatz und der Blick nach vorn', () => {
    expect(endBossVictorySceneText(END_BOSS)).toEqual({
      eyebrow: 'Endgegner besiegt',
      title: 'Der Bibliothekar der Ewigkeit ist besiegt!',
      line: 'Der Bibliothekar verneigt sich.',
      campaign: '📚 Der Weg des Gelehrten',
      note: 'Das letzte Kapitel ist geschafft – deine Kampagne ist gemeistert!',
    })
    expect(endBossVictorySceneText({ ...END_BOSS, campaignComplete: false }).note).toBe(
      'Ein paar Kapitel warten noch – dann ist deine Kampagne gemeistert.',
    )
  })

  it('Entwicklung: Name ohne Pronomen, alte → neue Stufe, Stufe und Weg zur nächsten', () => {
    const text = evolutionSceneText(EVOLVED)
    expect(text).toMatchObject({
      eyebrow: 'Dein Gefährte wächst',
      title: 'Flink ist gewachsen!',
      from: 'Fuchswelpe',
      to: 'Spitzohr',
      changeSpoken: 'Bisher Fuchswelpe, jetzt Spitzohr.',
      stage: 'Stufe 2 von 4 · Gefährte',
      next: 'Nächste Stufe in 46 aktiven Tagen.',
    })
    expect(evolutionSceneText({ ...EVOLVED, daysToNextStage: 1 }).next).toBe('Noch ein aktiver Tag bis zur nächsten Stufe.')
    const top = evolutionSceneText({ ...EVOLVED, to: 3, daysToNextStage: undefined })
    expect(top.title).toBe('Flink ist legendär!')
    expect(top.eyebrow).toBe('Legendärer Gefährte')
    expect(top.stage).toBe('Stufe 4 von 4 · Legendär')
    for (const value of Object.values(text)) expect(value).not.toMatch(/\b(er|sie|ihn|ihm|ihr|sein|seine)\b/)
  })

  it('Stufen-Glanz: wärmer und heller je Stufe, Unsinn wird begrenzt', () => {
    expect([0, 1, 2, 3].map(stageLabel)).toEqual(['Jungtier', 'Gefährte', 'Erwachsen', 'Legendär'])
    expect(stageLine(0)).toBe('Stufe 1 von 4 · Jungtier')
    expect(clampStage(9)).toBe(3)
    expect(clampStage(Number.NaN)).toBe(0)
    const glows = [0, 1, 2, 3].map((stage) => companionGlow(stage).glow)
    expect([...glows].sort((a, b) => a - b)).toEqual(glows)
    expect(companionGlow(3).shimmer).toBe(true)
    expect(companionGlowStyle(2, true).boxShadow).not.toBe(companionGlowStyle(2).boxShadow)
  })
})

// ---------------------------------------------------------------------------
// Klang & Vibration
// ---------------------------------------------------------------------------

describe('feedbackSounds', () => {
  it('ordnet jeder Szene ihren Klang zu – die Niederlage bleibt still', () => {
    expect(sceneCue('level-up')).toBe(FEEDBACK_CUES.levelUp)
    expect(sceneCue('boss')).toBe(FEEDBACK_CUES.victory)
    expect(sceneCue('end-boss')).toBe(FEEDBACK_CUES.victory)
    expect(sceneCue('evolve')).toBe(FEEDBACK_CUES.evolve)
    expect(sceneCue('campaign')).toBe(FEEDBACK_CUES.achievement)
    expect(sceneCue('class')).toBe(FEEDBACK_CUES.levelUp)
    expect(sceneCue('defeat')).toBeUndefined()
  })

  it('wählt zu den Meldungen höchstens einen Klang: Erfolg vor Truhe, XP allein still', () => {
    const chest: FeedbackEvent = { type: 'chest-found', chests: [{ id: 'quest:x', source: 'quest', rarity: 'common' }] }
    const achievement: FeedbackEvent = { type: 'achievement-unlocked', id: 'a', title: 'A', icon: '🏅', tier: 'bronze', gold: 25 }
    const xp: FeedbackEvent = { type: 'xp-gained', amount: 20, questXp: 20, gold: 10, bonusXp: 0, quests: [], backfill: false }
    expect(toastCue([xp])).toBeUndefined()
    expect(toastCue([xp, chest])).toBe(FEEDBACK_CUES.chest)
    expect(toastCue([chest, achievement])).toBe(FEEDBACK_CUES.achievement)
  })

  it('nennt nur Klänge aus dem Vertrag des Sound-Moduls', () => {
    const allowed = ['check', 'uncheck', 'levelUp', 'chest', 'bossHit', 'victory', 'achievement', 'evolve']
    for (const cue of Object.values(FEEDBACK_CUES)) expect(allowed).toContain(cue.sound)
  })
})
