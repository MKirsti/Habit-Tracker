import { describe, expect, it } from 'vitest'
import { BALANCING } from '../../domain/balancing'
import { deriveGameState } from '../../domain/engine'
import { makeChapter, makeCompletion, makeGameData, makeHabit, makeMainQuest } from '../../domain/testing'
import type { CharacterProfile, Completion, DayKey, GameData, GameState } from '../../domain/types'
import { BULK_CHANGE_LIMIT, diffGameStates, isBulkChange } from './feedbackEvents'
import type { FeedbackEvent } from './feedbackEvents'

const TODAY: DayKey = '2026-11-03'
const YESTERDAY: DayKey = '2026-11-02'
const PROFILE: CharacterProfile = { name: 'Aria', avatar: '🧙', createdDay: '2026-10-01' }

const reading = makeHabit({
  id: 'read',
  title: 'Lesen',
  icon: '📖',
  attribute: 'intellect',
  difficulty: 'medium',
  createdDay: '2026-10-01',
  order: 1,
})
const meditation = makeHabit({
  id: 'meditate',
  title: 'Meditieren',
  icon: '🧘',
  attribute: 'wisdom',
  difficulty: 'easy',
  createdDay: '2026-10-01',
  order: 2,
})
const training = makeHabit({
  id: 'train',
  title: 'Krafttraining',
  icon: '🏋️',
  attribute: 'strength',
  difficulty: 'epic',
  createdDay: '2026-10-01',
  order: 3,
})
const running = makeHabit({
  id: 'run',
  title: 'Laufen',
  icon: '🏃',
  attribute: 'strength',
  difficulty: 'hard',
  schedule: { type: 'weekly', times: 3 },
  createdDay: '2026-10-01',
  order: 4,
})

function game(overrides: Partial<GameData> = {}, today: DayKey = TODAY): GameState {
  return deriveGameState(
    makeGameData({ profile: PROFILE, habits: [reading, meditation, training], ...overrides }),
    today,
  )
}

function ofType<T extends FeedbackEvent['type']>(events: FeedbackEvent[], type: T) {
  return events.filter((event): event is Extract<FeedbackEvent, { type: T }> => event.type === type)
}

describe('diffGameStates', () => {
  it('liefert nichts ohne Änderung', () => {
    const state = game({ completions: [makeCompletion(reading, YESTERDAY)] })
    expect(diffGameStates(state, state)).toEqual([])
    expect(diffGameStates(state, game({ completions: [makeCompletion(reading, YESTERDAY)] }))).toEqual([])
  })

  it('meldet gewonnene XP mit dem Titel der heute erledigten Quest', () => {
    const before = game()
    const after = game({ completions: [makeCompletion(reading, TODAY)] })
    expect(diffGameStates(before, after)).toEqual([
      {
        type: 'xp-gained',
        amount: 20,
        questXp: 20,
        bonusXp: 0,
        quests: [{ id: 'read', title: 'Lesen', icon: '📖', xp: 20 }],
        backfill: false,
      },
    ])
  })

  it('nutzt die Schwierigkeit der Erledigung (Snapshot), nicht die aktuelle der Quest', () => {
    const harder = { ...reading, difficulty: 'epic' as const }
    const before = game({ habits: [harder, meditation, training] })
    const after = game({ habits: [harder, meditation, training], completions: [makeCompletion(reading, TODAY)] })
    const [xp] = ofType(diffGameStates(before, after), 'xp-gained')
    expect(xp.quests).toEqual([{ id: 'read', title: 'Lesen', icon: '📖', xp: 20 }])
  })

  it('erkennt beim Nachtragen für gestern die Quest an ihrer gewachsenen Serie', () => {
    const before = game()
    const after = game({ completions: [makeCompletion(training, YESTERDAY)] })
    expect(ofType(diffGameStates(before, after), 'xp-gained')).toEqual([
      {
        type: 'xp-gained',
        amount: 80,
        questXp: 80,
        bonusXp: 0,
        quests: [{ id: 'train', title: 'Krafttraining', icon: '🏋️', xp: 80 }],
        backfill: true,
      },
    ])
  })

  it('meldet nachgetragene XP auch ohne erkennbare Quest', () => {
    // Montag: Der Sonntag gehört zur Vorwoche – Wochenfortschritt und Serie (noch < 3×) bleiben gleich.
    const monday = '2026-11-02'
    const habits = [running]
    const before = game({ habits }, monday)
    const after = game({ habits, completions: [makeCompletion(running, '2026-11-01')] }, monday)
    expect(ofType(diffGameStates(before, after), 'xp-gained')).toEqual([
      { type: 'xp-gained', amount: 40, questXp: 40, bonusXp: 0, quests: [], backfill: true },
    ])
  })

  it('ignoriert Rückgänge (Haken entfernt, Quest gelöscht)', () => {
    const before = game({ completions: [makeCompletion(reading, TODAY), makeCompletion(training, YESTERDAY)] })
    expect(diffGameStates(before, game({ completions: [makeCompletion(training, YESTERDAY)] }))).toEqual([])
    expect(diffGameStates(before, game({ habits: [meditation, training] }))).toEqual([])
  })

  it('ignoriert Teilfortschritt messbarer Quests (noch keine XP)', () => {
    const pages = makeHabit({ ...reading, measure: { target: 10, unit: 'Seiten' } })
    const before = game({ habits: [pages, meditation, training] })
    const after = game({ habits: [pages, meditation, training], completions: [makeCompletion(pages, TODAY, { value: 4 })] })
    expect(diffGameStates(before, after)).toEqual([])
  })

  it('erkennt einen Level-Up ohne Rangwechsel', () => {
    const past = [makeCompletion(training, YESTERDAY)] // 80 XP, kein perfekter Tag
    const before = game({ completions: past })
    const after = game({ completions: [...past, makeCompletion(reading, TODAY)] }) // 100 XP → Level 2
    expect(before.level.level).toBe(1)
    const [levelUp] = ofType(diffGameStates(before, after), 'level-up')
    expect(levelUp).toEqual({
      type: 'level-up',
      from: 1,
      to: 2,
      level: after.level,
      rank: 'Novize',
      previousRank: 'Novize',
      rankChanged: false,
    })
  })

  it('erkennt einen Level-Up mit neuem Rang', () => {
    // 4 × 80 + 2 × 20 = 360 XP (Level 2), an keinem Tag alle Pflicht-Quests erledigt.
    const past: Completion[] = [
      ...['2026-10-28', '2026-10-29', '2026-10-30', '2026-10-31'].map((day) => makeCompletion(training, day)),
      makeCompletion(reading, '2026-11-01'),
      makeCompletion(reading, YESTERDAY),
    ]
    const before = game({ completions: past })
    const after = game({ completions: [...past, makeCompletion(training, TODAY)] }) // 440 XP → Level 3
    expect(before.level.totalXp).toBe(360)
    const [levelUp] = ofType(diffGameStates(before, after), 'level-up')
    expect(levelUp).toMatchObject({ from: 2, to: 3, rank: 'Lehrling', previousRank: 'Novize', rankChanged: true })
  })

  it('erkennt den Aufstieg eines Attributs', () => {
    const before = game({ completions: [makeCompletion(reading, YESTERDAY)] }) // Intelligenz 20 XP
    const after = game({ completions: [makeCompletion(reading, YESTERDAY), makeCompletion(reading, TODAY)] })
    expect(ofType(diffGameStates(before, after), 'attribute-level-up')).toEqual([
      {
        type: 'attribute-level-up',
        attribute: 'intellect',
        from: 1,
        to: 2,
        xpIntoLevel: 0,
        xpForNextLevel: after.attributes.intellect.xpForNextLevel,
      },
    ])
  })

  it('erkennt den heute erreichten Perfekten Tag und meldet den Bonus separat', () => {
    const habits = [reading, meditation]
    const before = game({ habits, completions: [makeCompletion(reading, TODAY)] })
    const after = game({ habits, completions: [makeCompletion(reading, TODAY), makeCompletion(meditation, TODAY)] })
    const bonus = Math.round(BALANCING.perfectDayBonus * 30)
    expect(diffGameStates(before, after)).toEqual([
      {
        type: 'xp-gained',
        amount: 10,
        questXp: 10,
        bonusXp: 0,
        quests: [{ id: 'meditate', title: 'Meditieren', icon: '🧘', xp: 10 }],
        backfill: false,
      },
      { type: 'perfect-day', bonusXp: bonus, today: true },
    ])
  })

  it('erkennt einen nachgetragenen Perfekten Tag (gestern)', () => {
    const habits = [reading, meditation]
    const before = game({ habits, completions: [makeCompletion(reading, YESTERDAY)] })
    const after = game({
      habits,
      completions: [makeCompletion(reading, YESTERDAY), makeCompletion(meditation, YESTERDAY)],
    })
    expect(ofType(diffGameStates(before, after), 'perfect-day')).toEqual([
      { type: 'perfect-day', bonusXp: Math.round(BALANCING.perfectDayBonus * 30), today: false },
    ])
    expect(ofType(diffGameStates(before, after), 'xp-gained')).toMatchObject([
      { amount: 10, backfill: true, quests: [{ id: 'meditate', title: 'Meditieren' }] },
    ])
  })

  it('rechnet den wachsenden Bonus eines bereits perfekten Tages in den XP-Gewinn ein', () => {
    const habits = [reading, running]
    const before = game({ habits, completions: [makeCompletion(reading, TODAY)] }) // perfekt, Bonus 5
    const after = game({ habits, completions: [makeCompletion(reading, TODAY), makeCompletion(running, TODAY)] })
    expect(before.todayState.perfect).toBe(true)
    const events = diffGameStates(before, after)
    expect(ofType(events, 'perfect-day')).toEqual([])
    expect(ofType(events, 'xp-gained')).toEqual([
      {
        type: 'xp-gained',
        amount: 50,
        questXp: 40,
        bonusXp: 10,
        quests: [{ id: 'run', title: 'Laufen', icon: '🏃', xp: 40 }],
        backfill: false,
      },
    ])
  })

  describe('Kapitel & Kampagnen', () => {
    const counter = makeChapter({
      id: 'books',
      title: 'Der erste Funke',
      criterion: { type: 'counter', target: 3, label: 'Bücher' },
      counter: 2,
    })
    const manual = makeChapter({ id: 'club', title: 'Lesekreis', criterion: { type: 'manual' } })
    const campaign = makeMainQuest({
      id: 'scholar',
      title: 'Der Weg des Gelehrten',
      icon: '📚',
      reward: 'Ein Wochenende im Antiquariat',
      chapters: [counter, manual],
    })
    const withChapters = (...chapters: (typeof counter)[]) => ({ mainQuests: [{ ...campaign, chapters }] })

    it('meldet ein abgeschlossenes Kapitel mit Kampagne und Bonus-XP', () => {
      const before = game(withChapters(counter, manual))
      const after = game(withChapters({ ...counter, counter: 3, completedDay: TODAY }, manual))
      const events = diffGameStates(before, after)
      expect(ofType(events, 'chapter-completed')).toEqual([
        {
          type: 'chapter-completed',
          campaignId: 'scholar',
          campaignTitle: 'Der Weg des Gelehrten',
          campaignIcon: '📚',
          chapterId: 'books',
          chapterTitle: 'Der erste Funke',
          xp: BALANCING.chapterXp,
        },
      ])
      expect(ofType(events, 'campaign-completed')).toEqual([])
      // Die Kapitel-XP zählen für den Level, aber nicht als Quest-XP-Toast.
      expect(ofType(events, 'xp-gained')).toEqual([])
      expect(ofType(events, 'level-up')).toMatchObject([{ from: 1, to: 2 }])
    })

    it('meldet die gemeisterte Kampagne mit Belohnung', () => {
      const doneManual = { ...manual, manualDone: true, completedDay: YESTERDAY }
      const before = game(withChapters(counter, doneManual))
      const after = game(withChapters({ ...counter, counter: 3, completedDay: TODAY }, doneManual))
      const events = diffGameStates(before, after)
      expect(ofType(events, 'chapter-completed')).toHaveLength(1)
      expect(ofType(events, 'campaign-completed')).toEqual([
        {
          type: 'campaign-completed',
          campaignId: 'scholar',
          title: 'Der Weg des Gelehrten',
          icon: '📚',
          reward: 'Ein Wochenende im Antiquariat',
          chapterCount: 2,
          xp: BALANCING.mainQuestXp,
        },
      ])
      expect(events.map((event) => event.type)).toEqual(['chapter-completed', 'campaign-completed', 'level-up'])
    })

    it('erkennt automatische Kapitel, die eine Quest-Erledigung abschließt', () => {
      const streakQuest = makeMainQuest({
        id: 'habitual',
        startDay: '2026-10-01',
        chapters: [
          makeChapter({ id: 'two', title: 'Zwei Tage', criterion: { type: 'habit', habitId: 'read', metric: 'completions', target: 2 } }),
        ],
      })
      const before = game({ mainQuests: [streakQuest], completions: [makeCompletion(reading, YESTERDAY)] })
      const after = game({
        mainQuests: [streakQuest],
        completions: [makeCompletion(reading, YESTERDAY), makeCompletion(reading, TODAY)],
      })
      expect(diffGameStates(before, after).map((event) => event.type)).toEqual([
        'xp-gained',
        'chapter-completed',
        'campaign-completed',
        'attribute-level-up',
        'level-up',
      ])
    })

    it('feiert neu angelegte oder wieder hervorgeholte Kampagnen nicht', () => {
      const complete = withChapters({ ...counter, counter: 3 }, { ...manual, manualDone: true })
      const before = game()
      const events = diffGameStates(before, game(complete))
      expect(ofType(events, 'chapter-completed')).toEqual([])
      expect(ofType(events, 'campaign-completed')).toEqual([])
    })
  })

  describe('Massenänderungen', () => {
    it('bleibt beim Tageswechsel stumm', () => {
      const before = game({ completions: [makeCompletion(training, YESTERDAY)] })
      const after = game({ completions: [makeCompletion(training, YESTERDAY), makeCompletion(reading, '2026-11-04')] }, '2026-11-04')
      expect(isBulkChange(before, after)).toBe(true)
      expect(diffGameStates(before, after)).toEqual([])
    })

    it(`bleibt bei mehr als ${BULK_CHANGE_LIMIT} neuen Erledigungen auf einmal stumm (Backup, Demo-Daten)`, () => {
      const days = ['2026-10-28', '2026-10-29', '2026-10-30', '2026-10-31']
      const before = game()
      const many = game({ completions: days.map((day) => makeCompletion(training, day)) }) // 320 XP → Level-Up
      expect(diffGameStates(before, many)).toEqual([])

      const three = game({ completions: days.slice(1).map((day) => makeCompletion(training, day)) })
      expect(isBulkChange(before, three)).toBe(false)
      expect(diffGameStates(before, three).map((event) => event.type)).toContain('level-up')
    })

    it('bleibt stumm, wenn das Profil ersetzt wurde', () => {
      const before = game()
      const after = deriveGameState(
        makeGameData({
          profile: { ...PROFILE, createdDay: '2026-09-01' },
          habits: [reading, meditation, training],
          completions: [makeCompletion(training, YESTERDAY), makeCompletion(reading, YESTERDAY)],
        }),
        TODAY,
      )
      expect(isBulkChange(before, after)).toBe(true)
      expect(diffGameStates(before, after)).toEqual([])
    })

    it('bleibt stumm, wenn sich viele perfekte Tage auf einmal ändern', () => {
      // Nur eine Pflicht-Quest: jeder erledigte Tag ist perfekt. Die Erledigungen gab es schon;
      // erst das Entfernen der anderen Quests (z. B. per Wiederherstellung) macht die Tage perfekt.
      const days = ['2026-10-27', '2026-10-28', '2026-10-29', '2026-10-30']
      const completions = days.map((day) => makeCompletion(reading, day))
      const before = game({ completions })
      const after = game({ habits: [reading], completions })
      expect(after.totals.perfectDays - before.totals.perfectDays).toBe(4)
      expect(diffGameStates(before, after)).toEqual([])
    })
  })
})
