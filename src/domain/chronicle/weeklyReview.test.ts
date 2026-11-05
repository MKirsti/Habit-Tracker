import { beforeEach, describe, expect, it, vi } from 'vitest'

// Der ermutigende Satz kommt aus dem Inhalt (`reviewLines.ts`) – hier ersetzt, damit sich prüfen lässt, mit welchen
// Fakten und welchem Seed er gewählt wird.
const reviewLineMock = vi.hoisted(() =>
  vi.fn((facts: Record<string, unknown>, seed: string) => `Satz für ${seed} (${Object.keys(facts).sort().join(',')})`),
)
vi.mock('./reviewLines', () => ({ reviewLine: reviewLineMock }))

import { BOSSES } from '../combat/bosses'
import { addDays } from '../dates'
import { deriveGameState } from '../engine'
import { dayHistory, weeklyXp } from '../statistics'
import {
  completeRange,
  makeBossVictory,
  makeChapter,
  makeCompletion,
  makeGameData,
  makeHabit,
  makeMainQuest,
  makeRestPeriod,
  makeSideQuest,
} from '../testing'
import type { CharacterProfile, DayKey, GameData } from '../types'
import {
  pendingReviewWeek,
  reviewableWeeks,
  weeklyReview,
  weeklyReviewForState,
  weeklyReviews,
  xpChangePercent,
} from './weeklyReview'

// Wochen (Mo–So): W1 05.–11.10. · W2 12.–18.10. · W3 19.–25.10. · W4 26.10.–01.11. · laufend ab 02.11.
const W1 = '2026-10-05'
const W2 = '2026-10-12'
const W3 = '2026-10-19'
const W4 = '2026-10-26'
const MONDAY = '2026-11-02'
const WEDNESDAY = '2026-11-04'

const PROFILE: CharacterProfile = { name: 'Aria', avatar: '🧙', createdDay: W1 }
const HERO_SEED = `${W1}Aria`

function stateOf(data: GameData, today: DayKey) {
  return deriveGameState(data, today)
}

function reviewOf(data: GameData, today: DayKey, week: DayKey) {
  return weeklyReview(data, stateOf(data, today), week)
}

/**
 * Zwei Tagesquests ab W3: A (leicht, Stärke) jeden Tag, B (mittel, Intelligenz) in W3 nur Mo–Fr, in W4 jeden Tag.
 * Von Hand gerechnet (Streak-Bonus +5 % je Serientag davor, Perfekter Tag +25 % der Quest-XP):
 * - W3: A 10+11+11+12+12+13+13 = 82 · B 20+21+22+23+24 = 110 · Perfekt Mo–Fr: 8+8+8+9+9 = 42 → 234 XP
 * - W4: A (Serie 7 davor) 14+14+15+15+15+15+15 = 103 · B (Serie gebrochen) 20+…+26 = 161 · Perfekt jeden Tag:
 *   9+9+9+10+10+10+10 = 67 → 331 XP (+41 % gegenüber W3)
 */
function twoQuestHero(): GameData {
  const a = makeHabit({ id: 'a', difficulty: 'easy', attribute: 'strength', createdDay: W3 })
  const b = makeHabit({ id: 'b', difficulty: 'medium', attribute: 'intellect', createdDay: W3, order: 1 })
  return makeGameData({
    profile: PROFILE,
    habits: [a, b],
    completions: [
      ...completeRange(a, W3, '2026-11-01'),
      ...completeRange(b, W3, '2026-10-23'),
      ...completeRange(b, W4, '2026-11-01'),
    ],
  })
}

beforeEach(() => {
  reviewLineMock.mockClear()
})

describe('weeklyReview – Kennzahlen einer Woche', () => {
  it('rechnet XP, Quests, Perfekte Tage, Streak und stärkstes Attribut wie von Hand', () => {
    const review = reviewOf(twoQuestHero(), MONDAY, W3)
    expect(review).toMatchObject({
      weekStart: W3,
      weekEnd: '2026-10-25',
      xp: 234,
      questsCompleted: 12,
      perfectDays: 5,
      bestStreak: 7,
      topAttribute: 'intellect',
      restDays: 0,
    })
    // Die Vorwoche (W2) hatte keine XP → kein Vergleich.
    expect(review.xpChangePercent).toBeUndefined()
  })

  it('vergleicht mit der Vorwoche in Prozent (gerundet)', () => {
    const review = reviewOf(twoQuestHero(), MONDAY, W4)
    expect(review).toMatchObject({ xp: 331, questsCompleted: 14, perfectDays: 7, bestStreak: 14, xpChangePercent: 41 })
    expect(xpChangePercent(331, 234, W3, W1)).toBe(41)
    expect(xpChangePercent(100, 200, W3, W1)).toBe(-50)
    expect(xpChangePercent(200, 200, W3, W1)).toBe(0)
    expect(Object.is(xpChangePercent(1000, 1001, W3, W1), 0)).toBe(true) // kein „−0 %“
  })

  it('zählt dieselben XP wie die Wochen-Statistik und die Engine', () => {
    const data = twoQuestHero()
    const weeks = weeklyXp(dayHistory(data, MONDAY), 3)
    expect(weeks.map((week) => week.weekStart)).toEqual([W3, W4, MONDAY])
    const [w3, w4] = weeklyReviews(data, stateOf(data, MONDAY), [W3, W4])
    expect(w3.xp).toBe(weeks[0].xp)
    expect(w4.xp).toBe(weeks[1].xp)
    expect(deriveGameState(data, '2026-11-01').level.totalXp).toBe(234 + 331)
  })

  it('nimmt Nebenquests, Kapitel und Kampagnen am Abschlusstag mit', () => {
    const data = twoQuestHero()
    data.sideQuests = [makeSideQuest({ id: 's', attribute: 'charisma', difficulty: 'epic', doneDay: '2026-10-21' })]
    data.mainQuests = [
      makeMainQuest({
        id: 'm',
        startDay: W1,
        chapters: [
          makeChapter({ id: 'c1', criterion: { type: 'manual' }, manualDone: true, completedDay: '2026-10-22' }),
          makeChapter({ id: 'c2', criterion: { type: 'manual' } }),
        ],
      }),
    ]
    const review = reviewOf(data, MONDAY, W3)
    expect(review.xp).toBe(234 + 80 + 100)
    // Kapitel-XP sind keine Attribut-XP; 80 Charisma bleiben unter 110 Intelligenz.
    expect(review.topAttribute).toBe('intellect')

    data.mainQuests[0].chapters[1] = { ...data.mainQuests[0].chapters[1], manualDone: true, completedDay: '2026-10-24' }
    expect(reviewOf(data, MONDAY, W3).xp).toBe(234 + 80 + 200 + 500)
  })

  it('wählt das Attribut mit den meisten XP der Woche (Gleichstand → feste Reihenfolge)', () => {
    const a = makeHabit({ id: 'a', difficulty: 'medium', attribute: 'wisdom', createdDay: W3 })
    const data = makeGameData({
      profile: PROFILE,
      habits: [a],
      completions: [makeCompletion(a, W3)],
      sideQuests: [makeSideQuest({ id: 's', attribute: 'strength', difficulty: 'medium', doneDay: W3 })],
    })
    // Je 20 XP: Stärke steht in ATTRIBUTE_IDS vor Weisheit.
    expect(reviewOf(data, MONDAY, W3).topAttribute).toBe('strength')
  })

  it('bleibt nach einer leeren Woche bei null – ohne Vergleich, Attribut oder erfundenen Boss', () => {
    const a = makeHabit({ id: 'a', createdDay: W1 })
    const data = makeGameData({ profile: PROFILE, habits: [a], completions: completeRange(a, W3, '2026-10-25') })
    const review = reviewOf(data, WEDNESDAY, W2)
    expect(review).toEqual({
      weekStart: W2,
      weekEnd: '2026-10-18',
      xp: 0,
      questsCompleted: 0,
      perfectDays: 0,
      bestStreak: 0,
      restDays: 0,
      line: `Satz für ${HERO_SEED}:${W2} (perfectDays,questsCompleted,restDays,xp)`,
    })
    expect(reviewLineMock).toHaveBeenCalledWith(
      { xp: 0, perfectDays: 0, questsCompleted: 0, restDays: 0 },
      `${HERO_SEED}:${W2}`,
    )
  })

  it('zählt eine Urlaubswoche als Ruhe: keine Perfekten Tage, die Serie hält und wächst mit freiwilligen Quests', () => {
    const a = makeHabit({ id: 'a', difficulty: 'easy', attribute: 'strength', createdDay: W1 })
    const data = makeGameData({
      profile: PROFILE,
      habits: [a],
      completions: [...completeRange(a, W1, '2026-10-18'), makeCompletion(a, '2026-10-20')],
      restPeriods: [makeRestPeriod('urlaub', W3, '2026-10-25')],
    })
    const review = reviewOf(data, W4, W3)
    // 14 Tage Serie davor → +50 %: 15 XP am Dienstag, kein Perfekter Tag am Ruhetag.
    expect(review).toMatchObject({ xp: 15, questsCompleted: 1, perfectDays: 0, restDays: 7, bestStreak: 15 })
    // W2: 14+14+15+15+15+15+15 = 103 Quest-XP, Perfekt-Bonus 7 × 4 = 28 → 131 XP.
    expect(review.xpChangePercent).toBe(-89)
    expect(reviewLineMock).toHaveBeenLastCalledWith(
      expect.objectContaining({ xp: 15, xpChangePercent: -89, restDays: 7 }),
      `${HERO_SEED}:${W3}`,
    )
  })

  it('vergleicht nicht mit einer Woche, die nur halb zum Abenteuer gehört', () => {
    const a = makeHabit({ id: 'a', difficulty: 'easy', createdDay: '2026-10-08' })
    const data = makeGameData({
      profile: { ...PROFILE, createdDay: '2026-10-08' },
      habits: [a],
      completions: completeRange(a, '2026-10-08', '2026-10-18'),
    })
    const review = reviewOf(data, W3, W2)
    expect(review.xp).toBeGreaterThan(0)
    expect(review.xpChangePercent).toBeUndefined()
  })

  it('zieht einen beliebigen Tag auf den Montag seiner Woche', () => {
    const data = twoQuestHero()
    expect(reviewOf(data, MONDAY, '2026-10-22')).toEqual(reviewOf(data, MONDAY, W3))
  })

  it('ignoriert Erledigungen gelöschter Quests, Teilfortschritte und Tage nach dem Stichtag', () => {
    const data = twoQuestHero()
    const a = data.habits[0]
    data.completions.push(makeCompletion(makeHabit({ id: 'deleted' }), '2026-10-20'), makeCompletion(a, '2026-11-05'))
    data.completions = data.completions.map((c) => (c.habitId === 'b' && c.day === '2026-10-19' ? { ...c, value: 0 } : c))
    const review = reviewOf(data, MONDAY, W3)
    expect(review.questsCompleted).toBe(11)
  })
})

describe('weeklyReview – Boss', () => {
  const boss = BOSSES[0]

  it('nennt einen gespeicherten Sieg', () => {
    const data = twoQuestHero()
    data.bossVictories = [makeBossVictory(W3, { bossId: boss.id, day: '2026-10-23' })]
    expect(reviewOf(data, WEDNESDAY, W3).boss).toEqual({ name: boss.name, icon: boss.icon, defeated: true })
    expect(reviewLineMock).toHaveBeenLastCalledWith(expect.objectContaining({ bossDefeated: true }), `${HERO_SEED}:${W3}`)
  })

  it('nimmt am Montag den Vorwochen-Boss aus dem Spielzustand', () => {
    const data = twoQuestHero()
    const state = stateOf(data, MONDAY)
    expect(state.bosses.previous?.weekStart).toBe(W4)
    const review = weeklyReview(data, state, W4)
    expect(review.boss).toEqual({
      name: state.bosses.previous?.boss.name,
      icon: state.bosses.previous?.boss.icon,
      defeated: state.bosses.previous?.defeated,
    })
  })

  it('leitet den entkommenen Boss der Vorwoche an den übrigen Tagen ab – derselbe wie in der Woche selbst', () => {
    const a = makeHabit({ id: 'a', difficulty: 'easy', attribute: 'strength', createdDay: W1 })
    const b = makeHabit({ id: 'b', difficulty: 'hard', attribute: 'wisdom', createdDay: W1, order: 1 })
    // Ein paar Erledigungen über die Wochen (Klassen, Attribut-Level), in W4 nur eine – der Boss entkommt.
    const data = makeGameData({
      profile: PROFILE,
      habits: [a, b],
      completions: [...completeRange(a, W1, '2026-10-25'), ...completeRange(b, W2, '2026-10-20'), makeCompletion(a, W4)],
    })
    const sunday = deriveGameState(data, '2026-11-01').bosses.current
    expect(sunday?.defeated).toBe(false)
    const state = stateOf(data, WEDNESDAY)
    expect(state.bosses.previous).toBeUndefined()
    expect(weeklyReview(data, state, W4).boss).toEqual({ name: sunday?.boss.name, icon: sunday?.boss.icon, defeated: false })
    expect(reviewLineMock).toHaveBeenLastCalledWith(expect.objectContaining({ bossDefeated: false }), `${HERO_SEED}:${W4}`)
    // Ältere Wochen: ein entkommener Boss ist nirgends festgehalten – kein Boss statt eines erfundenen.
    expect(weeklyReview(data, state, W3).boss).toBeUndefined()
  })
})

describe('Sichtbarkeit (GameState.weeklyReview)', () => {
  it('zeigt montags bis sonntags den Rückblick der Vorwoche, bis er gesehen ist', () => {
    const data = twoQuestHero()
    for (const today of [MONDAY, WEDNESDAY, '2026-11-08']) {
      expect(pendingReviewWeek(data, today)).toBe(W4)
      expect(weeklyReviewForState(data, stateOf(data, today), today)?.weekStart).toBe(W4)
    }
    expect(weeklyReviewForState(data, stateOf(data, MONDAY), MONDAY)).toEqual(reviewOf(data, MONDAY, W4))
    // Nächster Montag: der Rückblick der Woche ab 02.11.
    expect(pendingReviewWeek(data, '2026-11-09')).toBe(MONDAY)
  })

  it('verschwindet, sobald die Woche (oder eine spätere) als gesehen gilt', () => {
    const data = twoQuestHero()
    data.settings = { ...data.settings, weeklyReviewSeen: W4 }
    expect(pendingReviewWeek(data, WEDNESDAY)).toBeUndefined()
    expect(weeklyReviewForState(data, stateOf(data, WEDNESDAY), WEDNESDAY)).toBeUndefined()
    data.settings = { ...data.settings, weeklyReviewSeen: MONDAY }
    expect(pendingReviewWeek(data, WEDNESDAY)).toBeUndefined()
    data.settings = { ...data.settings, weeklyReviewSeen: W3 }
    expect(pendingReviewWeek(data, WEDNESDAY)).toBe(W4)
    data.settings = { ...data.settings, weeklyReviewSeen: 'kaputt' }
    expect(pendingReviewWeek(data, WEDNESDAY)).toBe(W4)
  })

  it('erst, wenn die Vorwoche ganz zum Abenteuer gehört', () => {
    const data = twoQuestHero()
    expect(pendingReviewWeek({ ...data, profile: { ...PROFILE, createdDay: W4 } }, MONDAY)).toBe(W4)
    expect(pendingReviewWeek({ ...data, profile: { ...PROFILE, createdDay: '2026-10-27' } }, MONDAY)).toBeUndefined()
    expect(pendingReviewWeek({ ...data, profile: { ...PROFILE, createdDay: MONDAY } }, WEDNESDAY)).toBeUndefined()
    expect(pendingReviewWeek({ ...data, profile: undefined }, MONDAY)).toBeUndefined()
  })
})

describe('reviewableWeeks', () => {
  it('listet die abgeschlossenen, ganzen Abenteuerwochen, neueste zuerst', () => {
    expect(reviewableWeeks({ profile: PROFILE }, WEDNESDAY)).toEqual([W4, W3, W2, W1])
    expect(reviewableWeeks({ profile: { ...PROFILE, createdDay: '2026-10-06' } }, WEDNESDAY)).toEqual([W4, W3, W2])
    expect(reviewableWeeks({ profile: { ...PROFILE, createdDay: MONDAY } }, WEDNESDAY)).toEqual([])
    expect(reviewableWeeks({}, WEDNESDAY)).toEqual([])
  })

  it('rechnet viele Wochen in einem Durchlauf genauso wie einzeln', () => {
    const data = twoQuestHero()
    const state = stateOf(data, WEDNESDAY)
    const weeks = reviewableWeeks(data, WEDNESDAY)
    const batch = weeklyReviews(data, state, weeks)
    expect(batch).toEqual(weeks.map((week) => weeklyReview(data, state, week)))
    expect(batch.map((review) => review.xp)).toEqual([331, 234, 0, 0])
  })

  it('bleibt bei drei Jahren Verlauf schnell', () => {
    const habits = ['strength', 'intellect', 'wisdom', 'vitality', 'discipline'].map((attribute, i) =>
      makeHabit({ id: `h${i}`, attribute: attribute as 'strength', createdDay: '2024-01-01', order: i }),
    )
    const today = '2026-12-30'
    const completions = habits.flatMap((habit, i) =>
      completeRange(habit, '2024-01-01', addDays(today, -1)).filter((_, day) => (day + i) % 4 !== 0),
    )
    const data = makeGameData({ profile: { ...PROFILE, createdDay: '2024-01-01' }, habits, completions })
    const state = stateOf(data, today)
    const started = performance.now()
    const reviews = weeklyReviews(data, state, reviewableWeeks(data, today))
    const single = weeklyReviewForState(data, state, today)
    const elapsed = performance.now() - started
    expect(reviews.length).toBeGreaterThan(150)
    expect(single?.weekStart).toBe(reviews[0].weekStart)
    expect(elapsed).toBeLessThan(1500)
  })
})
