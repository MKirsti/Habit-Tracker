import { describe, expect, it } from 'vitest'
import { BALANCING } from '../../domain/balancing'
import { deriveGameState } from '../../domain/engine'
import {
  makeAchievement,
  makeChapter,
  makeCompletion,
  makeGameData,
  makeHabit,
  makeMainQuest,
  makeSideQuest,
} from '../../domain/testing'
import type {
  AchievementDefinition,
  CharacterProfile,
  Completion,
  DayKey,
  GameData,
  GameState,
  Habit,
  SideQuest,
} from '../../domain/types'
import {
  BULK_CHANGE_LIMIT,
  creditedCompletions,
  creditedSideQuests,
  diffGameStates,
  feedbackStillHolds,
  goldForTotalXp,
  isBulkChange,
} from './feedbackEvents'
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

/**
 * Schritt wie in `GameFeedback`: Zustände plus die Zuordnung der XP über die geänderten Erledigungen.
 */
function step(
  before: Partial<GameData>,
  after: Partial<GameData>,
  today: DayKey = TODAY,
): { prev: GameState; next: GameState; events: FeedbackEvent[] } {
  const prevData = makeGameData({ profile: PROFILE, habits: [reading, meditation, training], ...before })
  const nextData = makeGameData({ profile: PROFILE, habits: [reading, meditation, training], ...after })
  const prev = deriveGameState(prevData, today)
  const next = deriveGameState(nextData, today)
  const credits = creditedCompletions(prevData.completions, nextData.completions, nextData.habits, today)
  return { prev, next, events: diffGameStates(prev, next, credits) }
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
        gold: 10,
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

  it('nennt beim Nachtragen für gestern die nachgetragene Quest', () => {
    const { events } = step({}, { completions: [makeCompletion(training, YESTERDAY)] })
    expect(ofType(events, 'xp-gained')).toEqual([
      {
        type: 'xp-gained',
        amount: 80,
        questXp: 80,
        gold: 40,
        bonusXp: 0,
        quests: [{ id: 'train', title: 'Krafttraining', icon: '🏋️', xp: 80 }],
        backfill: true,
      },
    ])
  })

  it('meldet nachgetragene XP auch ohne erkennbare Quest (nur Zustände, keine Erledigungen bekannt)', () => {
    // Montag: Der Sonntag gehört zur Vorwoche. Ohne die geänderten Erledigungen lässt sich die Quest nicht bestimmen.
    const monday = '2026-11-02'
    const habits = [running]
    const before = game({ habits }, monday)
    const after = game({ habits, completions: [makeCompletion(running, '2026-11-01')] }, monday)
    expect(ofType(diffGameStates(before, after), 'xp-gained')).toEqual([
      { type: 'xp-gained', amount: 40, questXp: 40, gold: 20, bonusXp: 0, quests: [], backfill: true },
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
    // Training an Einzeltagen (kein Streak-Bonus): 4 × 80, Lesen 20 + 21 (Tag 2 der Serie: +5 %) = 361 XP
    // (Level 2), an keinem Tag alle Pflicht-Quests erledigt.
    const past: Completion[] = [
      ...['2026-10-25', '2026-10-27', '2026-10-29', '2026-10-31'].map((day) => makeCompletion(training, day)),
      makeCompletion(reading, '2026-11-01'),
      makeCompletion(reading, YESTERDAY),
    ]
    const before = game({ completions: past })
    const after = game({ completions: [...past, makeCompletion(training, TODAY)] }) // 441 XP → Level 3
    expect(before.level.totalXp).toBe(361)
    const [levelUp] = ofType(diffGameStates(before, after), 'level-up')
    expect(levelUp).toMatchObject({ from: 2, to: 3, rank: 'Lehrling', previousRank: 'Novize', rankChanged: true })
  })

  it('erkennt den Aufstieg eines Attributs', () => {
    const before = game({ completions: [makeCompletion(reading, YESTERDAY)] }) // Intelligenz 20 XP
    // Heute: 21 XP (Tag 2 der Serie, +5 %) → 41 XP, Attribut-Level 2 braucht 40.
    const after = game({ completions: [makeCompletion(reading, YESTERDAY), makeCompletion(reading, TODAY)] })
    expect(ofType(diffGameStates(before, after), 'attribute-level-up')).toEqual([
      {
        type: 'attribute-level-up',
        attribute: 'intellect',
        from: 1,
        to: 2,
        xpIntoLevel: 1,
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
        // 20 → 30 XP: 10 → 15 Gold (der Bonus des Perfekten Tages kommt danach).
        gold: 5,
        bonusXp: 0,
        quests: [{ id: 'meditate', title: 'Meditieren', icon: '🧘', xp: 10 }],
        backfill: false,
      },
      { type: 'perfect-day', bonusXp: bonus, addedXp: bonus, today: true },
      // Der erste Perfekte Tag schaltet den Erfolg „Makellos“ frei.
      {
        type: 'achievement-unlocked',
        id: 'perfect-days-1',
        title: 'Makellos',
        icon: '✨',
        tier: 'bronze',
        gold: BALANCING.achievementGold.bronze,
      },
    ])
  })

  it('erkennt einen nachgetragenen Perfekten Tag (gestern)', () => {
    const habits = [reading, meditation]
    const { events } = step(
      { habits, completions: [makeCompletion(reading, YESTERDAY)] },
      { habits, completions: [makeCompletion(reading, YESTERDAY), makeCompletion(meditation, YESTERDAY)] },
    )
    const bonus = Math.round(BALANCING.perfectDayBonus * 30)
    expect(ofType(events, 'perfect-day')).toEqual([{ type: 'perfect-day', bonusXp: bonus, addedXp: bonus, today: false }])
    expect(ofType(events, 'xp-gained')).toMatchObject([
      { amount: 10, backfill: true, quests: [{ id: 'meditate', title: 'Meditieren' }] },
    ])
  })

  it('meldet den wachsenden Bonus eines schon perfekten Tages als neue Tagessumme – nicht im XP-Gewinn', () => {
    const habits = [reading, running]
    const before = game({ habits, completions: [makeCompletion(reading, TODAY)] }) // perfekt, Bonus 5
    const after = game({ habits, completions: [makeCompletion(reading, TODAY), makeCompletion(running, TODAY)] })
    expect(before.todayState.perfect).toBe(true)
    expect(after.todayState.perfectBonusXp).toBe(15)
    const events = diffGameStates(before, after)
    expect(ofType(events, 'perfect-day')).toEqual([
      { type: 'perfect-day', bonusXp: 15, addedXp: 10, today: true, update: true },
    ])
    expect(ofType(events, 'xp-gained')).toEqual([
      {
        type: 'xp-gained',
        amount: 40,
        questXp: 40,
        // 25 → 65 XP: 12 → 32 Gold.
        gold: 20,
        bonusXp: 0,
        quests: [{ id: 'run', title: 'Laufen', icon: '🏃', xp: 40 }],
        backfill: false,
      },
    ])
  })

  it('zeigt im Ablauf jede Perfekter-Tag-Zahl als Tagessumme; die XP-Gewinne enthalten den Bonus nie', () => {
    // Wie im Browser-Ablauf: drei Tagesquests, dann zwei Wochenquests an einem schon perfekten Tag.
    const candle = makeHabit({ id: 'candle', title: 'Kerze', icon: '🕯️', attribute: 'wisdom', difficulty: 'medium', createdDay: '2026-10-01', order: 2 })
    const thought = makeHabit({ id: 'thought', title: 'Gedanke', icon: '✍️', attribute: 'wisdom', difficulty: 'easy', createdDay: '2026-10-01', order: 3 })
    const deep = makeHabit({ ...running, id: 'deep', title: 'Tiefe', order: 4 })
    const talk = makeHabit({ ...running, id: 'talk', title: 'Gespräch', difficulty: 'medium', schedule: { type: 'weekly', times: 1 }, order: 5 })
    const habits = [reading, candle, thought, deep, talk]
    const completions: Completion[] = []
    let state = game({ habits, completions })
    let shownBonus = 0
    let xpSum = 0
    for (const habit of habits) {
      completions.push(makeCompletion(habit, TODAY))
      const next = game({ habits, completions: [...completions] })
      const events = diffGameStates(state, next)
      for (const event of ofType(events, 'perfect-day')) {
        expect(event.today).toBe(true)
        expect(event.bonusXp).toBe(next.todayState.perfectBonusXp)
        shownBonus = event.bonusXp
      }
      for (const event of ofType(events, 'xp-gained')) {
        expect(event.bonusXp).toBe(0)
        expect(event.amount).toBe(event.questXp)
        xpSum += event.amount
      }
      state = next
    }
    // 20 + 20 + 10 + 40 + 20 = 110 Quest-XP, Bonus round(27,5) = 28 – wie in der Tagesbilanz.
    expect(shownBonus).toBe(28)
    expect(state.todayState.perfectBonusXp).toBe(28)
    expect(xpSum + shownBonus).toBe(state.todayState.questXp + state.todayState.perfectBonusXp)
  })

  it('lässt den Perfekten Tag (auch den gewachsenen Bonus) fallen, sobald eine Tagesquest wieder offen ist', () => {
    const habits = [reading, running]
    const almost = game({ habits })
    const perfect = game({ habits, completions: [makeCompletion(reading, TODAY)] })
    const grown = game({ habits, completions: [makeCompletion(reading, TODAY), makeCompletion(running, TODAY)] })
    const undone = game({ habits, completions: [makeCompletion(running, TODAY)] })
    const [first] = ofType(diffGameStates(almost, perfect), 'perfect-day')
    const [update] = ofType(diffGameStates(perfect, grown), 'perfect-day')
    const [xp] = ofType(diffGameStates(perfect, grown), 'xp-gained')
    expect(update).toMatchObject({ update: true })
    expect(feedbackStillHolds(first, grown)).toBe(true)
    expect(feedbackStillHolds(update, grown)).toBe(true)
    expect(feedbackStillHolds(first, undone)).toBe(false)
    expect(feedbackStillHolds(update, undone)).toBe(false)
    // Der XP-Gewinn von „Laufen“ stimmt weiter – und erwähnt keinen Bonus.
    expect(feedbackStillHolds(xp, undone)).toBe(true)
    expect(xp.bonusXp).toBe(0)
  })

  describe('Zuordnung über die geänderten Erledigungen', () => {
    it('nennt eine nachgetragene Quest, die heute nicht ansteht (Mo/Mi/Fr, nachgetragen am Dienstag)', () => {
      const monWedFri = makeHabit({ ...reading, id: 'mwf', title: 'Laufen', icon: '🏃', schedule: { type: 'weekdays', days: [1, 3, 5] } })
      const habits = [monWedFri]
      const { events } = step({ habits }, { habits, completions: [makeCompletion(monWedFri, YESTERDAY)] })
      expect(ofType(events, 'xp-gained')).toEqual([
        {
          type: 'xp-gained',
          amount: 20,
          questXp: 20,
          gold: 10,
          bonusXp: 0,
          quests: [{ id: 'mwf', title: 'Laufen', icon: '🏃', xp: 20 }],
          backfill: true,
        },
      ])
    })

    it('nennt eine Wochenquest, die am Montag für den Sonntag der Vorwoche nachgetragen wird', () => {
      const monday = '2026-11-02'
      const habits = [running]
      const { events } = step({ habits }, { habits, completions: [makeCompletion(running, '2026-11-01')] }, monday)
      expect(ofType(events, 'xp-gained')).toEqual([
        {
          type: 'xp-gained',
          amount: 40,
          questXp: 40,
          gold: 20,
          bonusXp: 0,
          quests: [{ id: 'run', title: 'Laufen', icon: '🏃', xp: 40 }],
          backfill: true,
        },
      ])
    })

    it('nennt die Quest, wenn eine erledigte Quest heute schwerer wird (Leicht → Episch)', () => {
      const easy = makeCompletion(meditation, TODAY)
      const { events } = step({ completions: [easy] }, { completions: [{ ...easy, difficulty: 'epic', updatedAt: 1 }] })
      expect(ofType(events, 'xp-gained')).toEqual([
        {
          type: 'xp-gained',
          amount: 70,
          questXp: 70,
          // 10 → 80 XP: 5 → 40 Gold.
          gold: 35,
          bonusXp: 0,
          quests: [{ id: 'meditate', title: 'Meditieren', icon: '🧘', xp: 80 }],
          backfill: false,
        },
      ])
    })

    it('rechnet nur neu erledigte oder höher bewertete Erledigungen bis heute an', () => {
      const habits: Habit[] = [reading, meditation, training]
      const done = makeCompletion(reading, YESTERDAY)
      const partial = makeCompletion(meditation, TODAY, { value: 0 })
      const before = [done, partial, makeCompletion(training, YESTERDAY)]
      expect(creditedCompletions(before, before, habits, TODAY)).toEqual([])
      expect(
        creditedCompletions(
          before,
          [
            { ...done, updatedAt: 5 }, // unverändert erledigt
            { ...partial, value: 0.5, target: 1 }, // noch Teilfortschritt
            { ...makeCompletion(training, YESTERDAY), difficulty: 'easy' }, // leichter → keine neuen XP
            makeCompletion(reading, '2026-11-04'), // Zukunft
            { ...makeCompletion(reading, TODAY), habitId: 'gelöscht', id: 'gelöscht:2026-11-03' }, // Quest gibt es nicht
          ],
          habits,
          TODAY,
        ),
      ).toEqual([])
      expect(creditedCompletions(before, [...before, makeCompletion(training, TODAY)], habits, TODAY)).toEqual([
        { id: 'train', title: 'Krafttraining', icon: '🏋️', xp: 80, day: TODAY },
      ])
    })
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
      // Die erste gemeisterte Kampagne schaltet auch den Erfolg „Erster Triumph“ frei.
      expect(events.map((event) => event.type)).toEqual([
        'chapter-completed',
        'campaign-completed',
        'achievement-unlocked',
        'level-up',
      ])
      expect(ofType(events, 'achievement-unlocked').map((event) => event.id)).toEqual(['campaigns-1'])
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
      const events = diffGameStates(before, after)
      expect(events.map((event) => event.type)).toEqual([
        'xp-gained',
        'chapter-completed',
        'campaign-completed',
        'attribute-level-up',
        'achievement-unlocked',
        'achievement-unlocked',
        'level-up',
      ])
      // Erstes Kapitel und erste gemeisterte Kampagne – in Definitions-Reihenfolge.
      expect(ofType(events, 'achievement-unlocked').map((event) => event.id)).toEqual(['chapters-1', 'campaigns-1'])
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

  describe('Gold im XP-Gewinn', () => {
    it('nennt genau den Zuwachs des Golds aus XP – abgerundet auf den Gesamtstand, nicht auf den Gewinn', () => {
      // Lesen an drei Tagen in Folge: 20 + 21 + 22 = 63 XP (31 Gold). Heute Tag 4 der Serie: +15 % → 23 XP.
      const past = ['2026-10-31', '2026-11-01', YESTERDAY].map((day) => makeCompletion(reading, day))
      const { prev, next, events } = step({ completions: past }, { completions: [...past, makeCompletion(reading, TODAY)] })
      expect(prev.level.totalXp).toBe(63)
      const [xp] = ofType(events, 'xp-gained')
      expect(xp).toMatchObject({ amount: 23, gold: 12 }) // 86 XP → 43 Gold (nicht ⌊23 / 2⌋ = 11)
      expect(xp.gold).toBe(next.gold.fromXp - prev.gold.fromXp)
    })

    it('zählt das Gold des Perfekter-Tag-Bonus nicht in den XP-Gewinn', () => {
      const habits = [reading, meditation]
      const { next, prev, events } = step(
        { habits, completions: [makeCompletion(reading, TODAY)] },
        { habits, completions: [makeCompletion(reading, TODAY), makeCompletion(meditation, TODAY)] },
      )
      const [xp] = ofType(events, 'xp-gained')
      // 20 → 30 XP (Meditieren): 10 → 15 Gold. Der Bonus (+8 → 38 XP) bringt die restlichen 4 Gold.
      expect(xp.gold).toBe(5)
      expect(next.gold.fromXp - prev.gold.fromXp).toBe(9)
    })

    it('rechnet wie die Engine', () => {
      for (const total of [0, 1, 2, 63, 86, 12_345]) {
        const state = game({ completions: [] })
        expect(goldForTotalXp(total)).toBe(Math.floor(total * BALANCING.goldPerXp))
        expect(goldForTotalXp(state.level.totalXp)).toBe(state.gold.fromXp)
      }
    })
  })

  describe('Nebenquests', () => {
    const taxes = makeSideQuest({
      id: 'taxes',
      title: 'Steuererklärung',
      icon: '🧾',
      attribute: 'discipline',
      difficulty: 'hard',
      createdDay: '2026-10-20',
    })
    const dentist = makeSideQuest({ id: 'dentist', title: 'Zahnarzt', icon: '🦷', difficulty: 'easy', order: 1 })

    /** Wie `step`, aber mit Nebenquests und deren Zuordnung (wie in `GameFeedback`). */
    function sideStep(before: SideQuest[], after: SideQuest[], extra: Partial<GameData> = {}) {
      const prevData = makeGameData({ profile: PROFILE, habits: [reading, meditation, training], ...extra, sideQuests: before })
      const nextData = makeGameData({ profile: PROFILE, habits: [reading, meditation, training], ...extra, sideQuests: after })
      const prev = deriveGameState(prevData, TODAY)
      const next = deriveGameState(nextData, TODAY)
      const credits = [
        ...creditedCompletions(prevData.completions, nextData.completions, nextData.habits, TODAY),
        ...creditedSideQuests(prevData.sideQuests, nextData.sideQuests, TODAY),
      ]
      return { prev, next, events: diffGameStates(prev, next, credits) }
    }

    it('meldet eine erledigte Nebenquest als XP-Gewinn mit ihrem Titel', () => {
      const { events } = sideStep([taxes], [{ ...taxes, doneDay: TODAY }])
      expect(ofType(events, 'xp-gained')).toEqual([
        {
          type: 'xp-gained',
          amount: 40,
          questXp: 40,
          gold: 20,
          bonusXp: 0,
          quests: [{ id: 'taxes', title: 'Steuererklärung', icon: '🧾', xp: 40, sideQuest: true }],
          backfill: false,
        },
      ])
    })

    it('erkennt die Nebenquest auch ohne Daten (nur Zustände)', () => {
      const { prev, next } = sideStep([taxes], [{ ...taxes, doneDay: TODAY }])
      expect(ofType(diffGameStates(prev, next), 'xp-gained')).toMatchObject([
        { amount: 40, backfill: false, quests: [{ id: 'taxes', title: 'Steuererklärung', sideQuest: true }] },
      ])
    })

    it('meldet Quest und Nebenquest gemeinsam, wenn beide im selben Schritt erledigt werden', () => {
      const prevData = makeGameData({ profile: PROFILE, habits: [reading, meditation, training], sideQuests: [taxes] })
      const nextData: GameData = {
        ...prevData,
        completions: [makeCompletion(reading, TODAY)],
        sideQuests: [{ ...taxes, doneDay: TODAY }],
      }
      const prev = deriveGameState(prevData, TODAY)
      const next = deriveGameState(nextData, TODAY)
      const credits = [
        ...creditedCompletions(prevData.completions, nextData.completions, nextData.habits, TODAY),
        ...creditedSideQuests(prevData.sideQuests, nextData.sideQuests, TODAY),
      ]
      const [xp] = ofType(diffGameStates(prev, next, credits), 'xp-gained')
      expect(xp).toMatchObject({ amount: 60, questXp: 60, gold: 30 })
      expect(xp.quests.map((quest) => quest.title)).toEqual(['Lesen', 'Steuererklärung'])
    })

    it('meldet nichts beim Wiedereröffnen oder Löschen – und nimmt den XP-Toast zurück', () => {
      const done = { ...taxes, doneDay: TODAY }
      const completed = sideStep([taxes], [done])
      const [xp] = ofType(completed.events, 'xp-gained')
      expect(feedbackStillHolds(xp, completed.next)).toBe(true)

      const reopened = sideStep([done], [taxes])
      expect(reopened.events).toEqual([])
      expect(feedbackStillHolds(xp, reopened.next)).toBe(false)

      const deleted = sideStep([done], [])
      expect(deleted.events).toEqual([])
      expect(feedbackStillHolds(xp, deleted.next)).toBe(false)
    })

    it('verwechselt eine Nebenquest nicht mit einer gleichnamigen ID einer Quest', () => {
      const twin = makeSideQuest({ id: 'read', title: 'Buch zurückgeben', icon: '📕', difficulty: 'easy' })
      const done = sideStep([twin], [{ ...twin, doneDay: TODAY }])
      const [xp] = ofType(done.events, 'xp-gained')
      expect(xp.quests).toEqual([{ id: 'read', title: 'Buch zurückgeben', icon: '📕', xp: 10, sideQuest: true }])
      // Die Quest „Lesen“ (gleiche ID) ist heute nicht erledigt – der Toast stimmt trotzdem.
      expect(feedbackStillHolds(xp, done.next)).toBe(true)
    })

    it('meldet die zusätzlichen XP, wenn eine erledigte Nebenquest schwerer wird', () => {
      const done = { ...dentist, doneDay: TODAY }
      const { events } = sideStep([done], [{ ...done, difficulty: 'hard' }])
      expect(ofType(events, 'xp-gained')).toMatchObject([
        { amount: 30, quests: [{ id: 'dentist', title: 'Zahnarzt', xp: 40, sideQuest: true }] },
      ])
    })

    it('ignoriert Nebenquests, die erst nach heute erledigt sind (zurückgestellte Uhr)', () => {
      expect(creditedSideQuests([taxes], [{ ...taxes, doneDay: '2026-11-04' }], TODAY)).toEqual([])
      expect(creditedSideQuests(undefined, undefined, TODAY)).toEqual([])
    })

    it(`bleibt bei mehr als ${BULK_CHANGE_LIMIT} erledigten Nebenquests auf einmal stumm`, () => {
      const quests = ['a', 'b', 'c', 'd'].map((id, order) => makeSideQuest({ id, order }))
      const many = sideStep(quests, quests.map((quest) => ({ ...quest, doneDay: YESTERDAY })))
      expect(isBulkChange(many.prev, many.next)).toBe(true)
      expect(many.events).toEqual([])
      const three = sideStep(quests, quests.map((quest, index) => (index < 3 ? { ...quest, doneDay: TODAY } : quest)))
      expect(isBulkChange(three.prev, three.next)).toBe(false)
      expect(ofType(three.events, 'xp-gained')).toHaveLength(1)
    })
  })

  describe('Erfolge', () => {
    const firstSideQuest = makeSideQuest({ id: 'taxes', title: 'Steuererklärung', icon: '🧾', difficulty: 'hard' })

    function withAchievements(
      definitions: readonly AchievementDefinition[],
      overrides: Partial<GameData> = {},
      today: DayKey = TODAY,
    ): GameState {
      return deriveGameState(
        makeGameData({ profile: PROFILE, habits: [reading, meditation, training], ...overrides }),
        today,
        { achievements: definitions },
      )
    }

    it('meldet einen neu freigeschalteten Erfolg mit Stufe und Gold-Belohnung', () => {
      const before = game({ sideQuests: [firstSideQuest] })
      const after = game({ sideQuests: [{ ...firstSideQuest, doneDay: TODAY }] })
      const achievements = ofType(diffGameStates(before, after), 'achievement-unlocked')
      expect(achievements).toEqual([
        {
          type: 'achievement-unlocked',
          id: 'side-quests-1',
          title: 'Abseits des Weges',
          icon: '🧭',
          tier: 'bronze',
          gold: BALANCING.achievementGold.bronze,
        },
      ])
      expect(feedbackStillHolds(achievements[0], after)).toBe(true)
      // Wieder geöffnet, bevor die Freischaltung gespeichert wurde: Der Toast stimmt nicht mehr.
      expect(feedbackStillHolds(achievements[0], before)).toBe(false)
    })

    it('meldet einen schon freigeschalteten Erfolg nicht erneut', () => {
      const second = makeSideQuest({ id: 'second', order: 1 })
      const before = game({ sideQuests: [{ ...firstSideQuest, doneDay: YESTERDAY }, second] })
      const after = game({ sideQuests: [{ ...firstSideQuest, doneDay: YESTERDAY }, { ...second, doneDay: TODAY }] })
      expect(ofType(diffGameStates(before, after), 'achievement-unlocked')).toEqual([])
    })

    it('bleibt still, wenn eine gespeicherte Freischaltung nur nachgetragen wird (AchievementRecorder)', () => {
      const definitions = [makeAchievement('first', (stats) => stats.sideQuestsCompleted, 1)]
      const done = [{ ...firstSideQuest, doneDay: TODAY }]
      const unlocked = withAchievements(definitions, { sideQuests: done })
      const recorded = withAchievements(definitions, { sideQuests: done, achievementUnlocks: [{ id: 'first', day: TODAY }] })
      expect(diffGameStates(unlocked, recorded)).toEqual([])
      // Gespeichert bleibt er freigeschaltet – auch wenn der Wert wieder sinkt; ein erneutes Erreichen feiert nichts.
      const reopened = withAchievements(definitions, {
        sideQuests: [firstSideQuest],
        achievementUnlocks: [{ id: 'first', day: TODAY }],
      })
      const again = diffGameStates(reopened, recorded)
      expect(ofType(again, 'xp-gained')).toHaveLength(1)
      expect(ofType(again, 'achievement-unlocked')).toEqual([])
    })

    it(`gilt bei mehr als ${BULK_CHANGE_LIMIT} neuen Erfolgen auf einmal als Massenänderung`, () => {
      const read = (stats: { sideQuestsCompleted: number }) => stats.sideQuestsCompleted
      const four = ['a', 'b', 'c', 'd'].map((id) => makeAchievement(id, read, 1))
      const before = withAchievements(four, { sideQuests: [firstSideQuest] })
      const after = withAchievements(four, { sideQuests: [{ ...firstSideQuest, doneDay: TODAY }] })
      expect(diffGameStates(before, after)).toEqual([])

      const three = four.slice(0, 3)
      const events = diffGameStates(
        withAchievements(three, { sideQuests: [firstSideQuest] }),
        withAchievements(three, { sideQuests: [{ ...firstSideQuest, doneDay: TODAY }] }),
      )
      expect(ofType(events, 'xp-gained')).toHaveLength(1)
      expect(ofType(events, 'achievement-unlocked').map((event) => event.id)).toEqual(['a', 'b', 'c'])
    })

    it('bleibt beim Tageswechsel und beim ersetzten Profil still (wie alle Massenänderungen)', () => {
      const definitions = [makeAchievement('days', (stats) => stats.adventureDay, 34)]
      const before = withAchievements(definitions, {}, TODAY) // Tag 34 (seit 1.10.)
      expect(before.achievements[0].unlocked).toBe(true)
      const yesterday = withAchievements(definitions, {}, YESTERDAY)
      expect(yesterday.achievements[0].unlocked).toBe(false)
      expect(diffGameStates(yesterday, before)).toEqual([])
    })

    it('ignoriert Erfolge, die es vorher nicht gab (neue Definition nach einem Update)', () => {
      const old = [makeAchievement('a', () => 1, 1)]
      const updated = [...old, makeAchievement('b', () => 1, 1)]
      expect(diffGameStates(withAchievements(old), withAchievements(updated))).toEqual([])
    })
  })
})
