import { describe, expect, it } from 'vitest'
import { ATTRIBUTE_IDS } from './attributes'
import { addDays, dayRange } from './dates'
import { dayFactsOf, deriveGameState, getDayState, totalXpTimeline } from './engine'
import { hpCalendar, restDaySet } from './hp'
import { levelFromXp } from './leveling'
import {
  COMPLETION_RATE_DAYS,
  MAX_HISTORY_DAYS,
  RADAR_MIN_SCALE,
  attributeRadar,
  completionRates,
  creditedCompletions,
  dayHistory,
  habitHeatmap,
  heatmap,
  scoreCounts,
  statOn,
  weeklyXp,
  xpTimeline,
} from './statistics'
import { makeChapter, makeCompletion, makeGameData, makeHabit, makeMainQuest, makeSideQuest, seededRandom } from './testing'
import type {
  AttributeId,
  Chapter,
  Completion,
  DayKey,
  DeletedHabit,
  GameData,
  Habit,
  HpLedgerEntry,
  LevelInfo,
  MainQuest,
  Schedule,
  SideQuest,
} from './types'

/** Ein Mittwoch. */
const TODAY: DayKey = '2026-11-04'
const D = (offset: number): DayKey => addDays(TODAY, offset)

function profile(createdDay: DayKey) {
  return { name: 'Testheld', avatar: '🧙', createdDay }
}

function ledger(day: DayKey, overrides: Partial<HpLedgerEntry> = {}): HpLedgerEntry {
  return { day, score: 'missed', frozen: false, hpDelta: 0, hpAfter: 50, maxHp: 50, penalties: true, ...overrides }
}

// ---------------------------------------------------------------------------
// Tages-Historie
// ---------------------------------------------------------------------------

describe('dayHistory', () => {
  // So 01.11. Start · zwei Tagesquests und eine Wochenquest
  const a = makeHabit({ id: 'a', order: 0, createdDay: '2026-11-01', difficulty: 'medium' })
  const b = makeHabit({ id: 'b', order: 1, createdDay: '2026-11-01', difficulty: 'easy' })
  const w = makeHabit({ id: 'w', order: 2, createdDay: '2026-11-01', difficulty: 'hard', schedule: { type: 'weekly', times: 2 } })
  const data = makeGameData({
    profile: profile('2026-11-01'),
    habits: [a, b, w],
    completions: [
      makeCompletion(a, '2026-11-01'),
      makeCompletion(b, '2026-11-01'),
      makeCompletion(a, '2026-11-02'),
      makeCompletion(w, '2026-11-03'),
      makeCompletion(b, '2026-11-03', { value: 0.5 }), // Teilfortschritt: zählt nicht
      makeCompletion(a, '2026-11-05'), // Zukunft (zurückgestellte Uhr): zählt nicht
    ],
  })
  const history = dayHistory(data, TODAY)

  it('läuft lückenlos vom Abenteuerbeginn bis heute', () => {
    expect(history.from).toBe('2026-11-01')
    expect(history.to).toBe(TODAY)
    expect(history.carriedXp).toBe(0)
    expect(history.days.map((stat) => stat.day)).toEqual(dayRange('2026-11-01', TODAY))
  })

  it('pro Tag: Pflicht, erledigt, XP (inkl. Streak- und Perfekter-Tag-Bonus), Wertung', () => {
    const [sun, mon, tue, wed] = history.days
    // So: beide Tagesquests → perfekt; 20 + 10 XP, Bonus round(7,5) = 8
    expect(sun).toMatchObject({ required: 2, requiredDone: 2, done: 2, questXp: 30, perfectBonusXp: 8, xp: 38, totalXp: 38, perfect: true, score: 'perfect' })
    // Mo: 1 von 2 → gut; a hat eine Serie von 1 → +5 % → 21 XP
    expect(mon).toMatchObject({ required: 2, requiredDone: 1, done: 1, questXp: 21, perfectBonusXp: 0, xp: 21, totalXp: 59, perfect: false, score: 'good' })
    // Di: nur die Wochenquest (zählt nie für die Wertung) → verpasst, aber 40 XP
    expect(tue).toMatchObject({ required: 2, requiredDone: 0, done: 1, questXp: 40, totalXp: 99, score: 'missed' })
    // Mi (heute): noch nichts
    expect(wed).toMatchObject({ required: 2, requiredDone: 0, done: 0, xp: 0, totalXp: 99, score: 'missed' })
    for (const stat of history.days) {
      expect(stat).toMatchObject({ rest: false, settled: false, frozen: false, level: levelFromXp(stat.totalXp).level })
      expect(stat).not.toHaveProperty('hp')
    }
  })

  it('heute und der noch nachtragbare Vortag sind offen, ältere Tage nicht', () => {
    expect(history.days.map((stat) => stat.open)).toEqual([false, false, true, true])
  })

  it('stimmt mit der Engine überein (Gesamt-XP, Tageszustände)', () => {
    const state = deriveGameState(data, TODAY)
    expect(history.days.at(-1)?.totalXp).toBe(state.level.totalXp)
    for (const stat of history.days) {
      const day = getDayState(data, stat.day)
      expect(stat, stat.day).toMatchObject({
        required: day.requiredCount,
        requiredDone: day.requiredDone,
        questXp: day.questXp,
        perfectBonusXp: day.perfectBonusXp,
        perfect: day.perfect,
      })
    }
  })

  it('statOn findet Tage in O(1), außerhalb undefined', () => {
    expect(statOn(history, '2026-11-02')).toBe(history.days[1])
    expect(statOn(history, '2026-10-31')).toBeUndefined()
    expect(statOn(history, '2026-11-05')).toBeUndefined()
    expect(statOn(history, 'kaputt')).toBeUndefined()
  })

  it('ohne Held und ohne Daten: nur heute', () => {
    const empty = dayHistory(makeGameData(), TODAY)
    expect(empty.from).toBe(TODAY)
    expect(empty.days).toEqual([
      expect.objectContaining({ day: TODAY, required: 0, done: 0, xp: 0, totalXp: 0, level: 1, score: 'none' }),
    ])
  })
})

describe('dayHistory – Tageswertung', () => {
  it('perfekt / gut / schwach / verpasst nach Anteil der Tagesquests; ohne Tagesquest „none“', () => {
    const habits = [0, 1, 2, 3].map((i) => makeHabit({ id: `h${i}`, order: i, createdDay: D(-10) }))
    const weekly = makeHabit({ id: 'w', order: 9, createdDay: D(-10), schedule: { type: 'weekly', times: 1 } })
    const doneOn = (day: DayKey, count: number) => habits.slice(0, count).map((habit) => makeCompletion(habit, day))
    const data = makeGameData({
      profile: profile(D(-10)),
      habits: [...habits, weekly],
      completions: [...doneOn(D(-10), 4), ...doneOn(D(-9), 2), ...doneOn(D(-8), 1), makeCompletion(weekly, D(-7))],
    })
    const scores = dayHistory(data, TODAY).days.slice(0, 4).map((stat) => stat.score)
    expect(scores).toEqual(['perfect', 'good', 'weak', 'missed'])
    // 3 von 4 ist gut (≥ 50 %), 1 von 3 schwach.
    const onlyWeekly = makeGameData({ profile: profile(D(-3)), habits: [{ ...weekly, createdDay: D(-3) }], completions: [] })
    expect(dayHistory(onlyWeekly, TODAY).days.map((stat) => stat.score)).toEqual(['none', 'none', 'none', 'none'])
  })

  it('Abwesenheit: ab dem 8. Tag in Folge ohne jede erledigte Quest – Ruhetage zählen nicht mit', () => {
    const habit = makeHabit({ id: 'h', createdDay: D(-12) })
    const base = makeGameData({ profile: profile(D(-12)), habits: [habit], completions: [makeCompletion(habit, D(-2))] })
    const scores = dayHistory(base, TODAY).days.map((stat) => stat.score)
    // D(-12) … D(-6): 7 Tage verpasst, D(-5) … D(-3) abwesend, D(-2) perfekt, danach wieder verpasst
    expect(scores).toEqual([...Array(7).fill('missed'), 'absent', 'absent', 'absent', 'perfect', 'missed', 'missed'])

    const withRest = { ...base, restPeriods: [{ id: 'r', from: D(-9), until: D(-8), createdAt: 0 }] }
    const restScores = dayHistory(withRest, TODAY).days.map((stat) => stat.score)
    expect(restScores).toEqual([
      'missed', 'missed', 'missed', // D(-12) … D(-10)
      'rest', 'rest', // D(-9), D(-8) zählen nicht mit
      'missed', 'missed', 'missed', 'missed', // D(-7) … D(-4): Tage 4–7
      'absent', // D(-3): Tag 8
      'perfect', 'missed', 'missed',
    ])
  })

  it('Ruhetage: keine Pflicht, kein Perfekter Tag, Wertung „rest“ – Erledigtes bringt trotzdem XP', () => {
    const habit = makeHabit({ id: 'h', createdDay: D(-6), difficulty: 'medium' })
    const data = makeGameData({
      profile: profile(D(-6)),
      habits: [habit],
      completions: [makeCompletion(habit, D(-6)), makeCompletion(habit, D(-5)), makeCompletion(habit, D(-4))],
      restPeriods: [{ id: 'r', from: D(-4), until: D(-4), createdAt: 0 }],
    })
    const stat = statOn(dayHistory(data, TODAY), D(-4))
    expect(stat).toMatchObject({ rest: true, required: 0, requiredDone: 0, done: 1, perfect: false, perfectBonusXp: 0, score: 'rest' })
    // Serie von 2 vor dem Ruhetag → +10 %
    expect(stat?.questXp).toBe(22)
  })

  it('Ruhetage und aufgefangene Tage gelten für den Streak-Bonus als Pause', () => {
    const habit = makeHabit({ id: 'h', createdDay: D(-10), difficulty: 'medium' })
    const completions = [D(-10), D(-9), D(-7)].map((day) => makeCompletion(habit, day))
    const plain = makeGameData({ profile: profile(D(-10)), habits: [habit], completions })
    // Ohne Schutz bricht der verpasste 08. die Serie: 20 XP.
    expect(statOn(dayHistory(plain, TODAY), D(-7))?.questXp).toBe(20)
    // Ruhetag am 08.: Serie läuft weiter (2 → +10 %).
    const rest = { ...plain, restPeriods: [{ id: 'r', from: D(-8), until: D(-8), createdAt: 0 }] }
    expect(statOn(dayHistory(rest, TODAY), D(-7))?.questXp).toBe(22)
    // Streak-Schutz am 08. (abgerechnet, frozen): ebenso.
    const frozen = { ...plain, hpLedger: [ledger(D(-8), { frozen: true })] }
    const history = dayHistory(frozen, TODAY)
    expect(statOn(history, D(-7))?.questXp).toBe(22)
    expect(creditedCompletions(frozen, TODAY).get('h')?.map((credit) => credit.xp)).toEqual([20, 21, 22])
  })

  it('abgerechnete Tage: Wertung, Streak-Schutz, Lebenspunkte und Niederlage aus dem Ledger', () => {
    const habit = makeHabit({ id: 'h', createdDay: D(-10) })
    const data = makeGameData({
      profile: profile(D(-10)),
      habits: [habit],
      completions: [D(-10), D(-9), D(-7)].map((day) => makeCompletion(habit, day)),
      hpLedger: [
        // Einmal abgerechnet, gilt die gespeicherte Wertung – auch wenn später etwas nachgetragen wurde.
        ledger(D(-9), { score: 'good', hpDelta: 2, hpAfter: 50 }),
        ledger(D(-8), { score: 'missed', frozen: true }),
        ledger(D(-6), { score: 'missed', hpDelta: -6, hpAfter: 50, defeat: { goldLost: 12 } }),
        ledger(D(-5), { score: 'missed', penalties: false }),
      ],
    })
    const history = dayHistory(data, TODAY)
    expect(statOn(history, D(-10))).toMatchObject({ score: 'perfect', settled: false, frozen: false })
    expect(statOn(history, D(-9))).toMatchObject({ score: 'good', settled: true, hp: { delta: 2, after: 50, max: 50 } })
    expect(statOn(history, D(-8))).toMatchObject({ score: 'missed', settled: true, frozen: true, open: false })
    expect(statOn(history, D(-6))).toMatchObject({ settled: true, defeat: { goldLost: 12 }, hp: { delta: -6 } })
    // Sanfter Modus: Wertung ja, Lebenspunkte nicht.
    expect(statOn(history, D(-5))).toMatchObject({ settled: true, score: 'missed' })
    expect(statOn(history, D(-5))).not.toHaveProperty('hp')
  })
})

// ---------------------------------------------------------------------------
// Übereinstimmung mit der Engine (Zufallsdaten)
// ---------------------------------------------------------------------------

function randomData(random: () => number): GameData {
  const int = (max: number) => Math.floor(random() * (max + 1))
  const pick = <T,>(items: readonly T[]): T => items[int(items.length - 1)]
  const start = D(-70)
  const randomSchedule = (): Schedule => {
    const kind = random()
    if (kind < 0.4) return { type: 'daily' }
    if (kind < 0.7) return { type: 'weekdays', days: [pick([1, 2, 3] as const), pick([4, 5, 6, 7] as const)] }
    return { type: 'weekly', times: 1 + int(3) }
  }
  const habits: Habit[] = []
  const count = 2 + int(4)
  for (let i = 0; i < count; i++) {
    const createdDay = addDays(start, int(30))
    const habit = makeHabit({
      id: `h${i}`,
      order: i,
      createdDay,
      schedule: randomSchedule(),
      difficulty: pick(['easy', 'medium', 'hard', 'epic'] as const),
      attribute: pick(ATTRIBUTE_IDS),
      ...(random() < 0.4 ? { measure: { target: 10, unit: 'Minuten' } } : {}),
    })
    if (random() < 0.4) habit.scheduleHistory = [{ until: addDays(createdDay, 5 + int(20)), schedule: randomSchedule() }]
    if (random() < 0.3) {
      const from = addDays(createdDay, 3 + int(10))
      habit.pauses = [{ from, until: addDays(from, 1 + int(6)) }]
    }
    if (random() < 0.25) habit.archivedDay = addDays(TODAY, -int(20))
    habits.push(habit)
  }
  const completions: Completion[] = []
  for (const day of dayRange(start, TODAY)) {
    for (const habit of habits) {
      if (random() < 0.65) {
        const target = habit.measure?.target ?? 1
        completions.push(makeCompletion(habit, day, random() < 0.1 ? { value: target / 2 } : random() < 0.1 ? { value: target * 3 } : {}))
      }
    }
  }
  const deletedHabits: DeletedHabit[] =
    random() < 0.5 ? [{ id: 'gone', createdDay: start, archivedDay: addDays(start, 20 + int(20)), schedule: { type: 'daily' } }] : []
  const sideQuests: SideQuest[] = Array.from({ length: int(4) }, (_, i) =>
    makeSideQuest({
      id: `s${i}`,
      difficulty: pick(['easy', 'medium', 'hard'] as const),
      createdDay: start,
      ...(random() < 0.7 ? { doneDay: addDays(start, int(75)) } : {}), // auch nach heute (zählt nicht)
    }),
  )
  const chapterFor = (habit: Habit, i: number): Chapter =>
    makeChapter({
      id: `c${i}`,
      criterion: {
        type: 'habit',
        habitId: habit.id,
        metric: habit.measure ? pick(['completions', 'streak', 'total', 'best'] as const) : pick(['completions', 'streak', 'total'] as const),
        target: habit.measure ? 10 + int(25) : 1 + int(12),
      },
    })
  const mainQuests: MainQuest[] = [
    makeMainQuest({ id: 'k1', startDay: start, chapters: habits.map(chapterFor) }),
    makeMainQuest({
      id: 'k2',
      startDay: addDays(start, 10),
      archived: random() < 0.5,
      chapters: [
        makeChapter({ id: 'm', criterion: { type: 'manual' }, manualDone: true, completedDay: addDays(start, int(60)) }),
        makeChapter({ id: 'z', criterion: { type: 'counter', target: 2, label: 'Dinge' }, counter: int(3), completedDay: addDays(start, int(60)) }),
        makeChapter({ id: 'x', criterion: { type: 'habit', habitId: habits[0].id, metric: 'completions', target: 3 } }),
      ],
    }),
  ]
  return makeGameData({ profile: profile(addDays(start, 5)), habits, completions, deletedHabits, sideQuests, mainQuests })
}

describe('dayHistory – Übereinstimmung mit der Engine', () => {
  it('Summen und Tageszustände wie deriveGameState / getDayState (Zufallsdaten)', () => {
    const random = seededRandom(20261104)
    for (let run = 0; run < 25; run++) {
      const data = randomData(random)
      const history = dayHistory(data, TODAY)
      const state = deriveGameState(data, TODAY)
      const sum = (pick: (stat: (typeof history.days)[number]) => number) => history.days.reduce((total, stat) => total + pick(stat), 0)
      const where = `Lauf ${run}`
      expect(history.days.at(-1)?.totalXp, where).toBe(state.level.totalXp)
      expect(history.days.at(-1)?.level, where).toBe(state.level.level)
      expect(sum((stat) => stat.questXp), where).toBe(state.totals.xpFromQuests)
      expect(sum((stat) => stat.perfectBonusXp), where).toBe(state.totals.xpFromPerfectDays)
      expect(sum((stat) => stat.chapterXp), where).toBe(state.totals.xpFromChapters)
      expect(sum((stat) => stat.sideQuestXp), where).toBe(state.totals.xpFromSideQuests)
      expect(sum((stat) => stat.done), where).toBe(state.totals.questsCompleted)
      expect(sum((stat) => (stat.perfect ? 1 : 0)), where).toBe(state.totals.perfectDays)
      expect(sum((stat) => (stat.done > 0 ? 1 : 0)), where).toBe(state.totals.activeDays)
      for (const stat of history.days.filter((_, i) => i % 9 === 0)) {
        const day = getDayState(data, stat.day)
        expect([stat.required, stat.requiredDone, stat.questXp, stat.perfectBonusXp], `${where} ${stat.day}`).toEqual([
          day.requiredCount,
          day.requiredDone,
          day.questXp,
          day.perfectBonusXp,
        ])
      }
    }
  })

  it('Phase 2b: mit Ruhetagen, Abrechnung, Streak-Schutz und Vorschau für gestern wie deriveGameState', () => {
    const random = seededRandom(2026_2_2)
    const scores = ['perfect', 'good', 'weak', 'missed', 'none'] as const
    for (let run = 0; run < 25; run++) {
      const base = randomData(random)
      const int = (max: number) => Math.floor(random() * (max + 1))
      const restFrom = D(-40 + int(30))
      const since = D(-12 + int(6))
      const hpLedger: HpLedgerEntry[] = dayRange(since, D(-3 - int(2))).map((day) =>
        ledger(day, { score: scores[int(scores.length - 1)], frozen: random() < 0.3 }),
      )
      const data: GameData = {
        ...base,
        settings: { ...base.settings, penalties: { enabled: random() < 0.8, since } },
        restPeriods: [{ id: 'r', from: restFrom, until: addDays(restFrom, int(5)), createdAt: 0 }],
        hpLedger,
        purchases: Array.from({ length: int(3) }, (_, i) => ({
          id: `p${i}`,
          kind: 'item' as const,
          itemId: 'streakFreeze' as const,
          title: 'Streak-Schutz',
          icon: '❄️',
          price: 150,
          day: D(-20 + int(18)),
          createdAt: i,
        })),
      }
      const history = dayHistory(data, TODAY)
      const state = deriveGameState(data, TODAY)
      const sum = (pick: (stat: (typeof history.days)[number]) => number) => history.days.reduce((total, stat) => total + pick(stat), 0)
      const where = `Lauf ${run}`
      expect(history.days.at(-1)?.totalXp, where).toBe(state.level.totalXp)
      expect(sum((stat) => stat.questXp), where).toBe(state.totals.xpFromQuests)
      expect(sum((stat) => stat.perfectBonusXp), where).toBe(state.totals.xpFromPerfectDays)
      expect(sum((stat) => stat.chapterXp), where).toBe(state.totals.xpFromChapters)
      expect(sum((stat) => (stat.perfect ? 1 : 0)), where).toBe(state.totals.perfectDays)
      // Ruhetage: nie Pflicht; abgerechnete Tage tragen ihre Wertung; die Vorschau für gestern passt zu GameState.hp.
      for (const stat of history.days) if (stat.rest) expect(stat, `${where} ${stat.day}`).toMatchObject({ required: 0, score: 'rest' })
      for (const entry of hpLedger) expect(statOn(history, entry.day), `${where} ${entry.day}`).toMatchObject({ settled: true, score: entry.score, frozen: entry.frozen })
      // Tag für Tag wie der XP-Verlauf der Engine (Grundlage der Level-Up-Heilung).
      const restDays = restDaySet(data.restPeriods)
      const { freeDays } = hpCalendar(data, TODAY, restDays, dayFactsOf(data, TODAY, restDays))
      const timeline = totalXpTimeline(data, TODAY, { restDays, freeDays })
      for (const stat of history.days) expect(stat.totalXp, `${where} ${stat.day}`).toBe(timeline.totalXpAt(stat.day))
      const yesterday = statOn(history, D(-1))
      if (state.hp.yesterday) {
        expect(yesterday, where).toMatchObject({ settled: false, score: state.hp.yesterday.score, frozen: state.hp.yesterday.savedByFreeze })
      }
    }
  })

  it('sehr lange Verläufe: höchstens MAX_HISTORY_DAYS Tage, ältere XP als Übertrag', () => {
    const habit = makeHabit({ id: 'old', createdDay: '2014-01-01', difficulty: 'hard', schedule: { type: 'weekly', times: 1 } })
    const data = makeGameData({
      profile: profile('2014-01-01'),
      habits: [habit],
      completions: [makeCompletion(habit, '2014-01-06'), makeCompletion(habit, TODAY)],
    })
    const history = dayHistory(data, TODAY)
    expect(history.days).toHaveLength(MAX_HISTORY_DAYS)
    expect(history.from).toBe(addDays(TODAY, -(MAX_HISTORY_DAYS - 1)))
    expect(history.carriedXp).toBe(40)
    expect(history.days[0].totalXp).toBe(40)
    expect(history.days.at(-1)?.totalXp).toBe(deriveGameState(data, TODAY).level.totalXp)
  })

  it('ist schnell: drei Jahre mit 12 Quests', () => {
    const start = addDays(TODAY, -3 * 365)
    const habits = Array.from({ length: 12 }, (_, i) =>
      makeHabit({ id: `q${i}`, order: i, createdDay: start, schedule: i % 4 === 3 ? { type: 'weekly', times: 3 } : { type: 'daily' } }),
    )
    const random = seededRandom(3)
    const completions = dayRange(start, TODAY).flatMap((day) =>
      habits.filter(() => random() < 0.8).map((habit) => makeCompletion(habit, day)),
    )
    const data = makeGameData({ profile: profile(start), habits, completions, restPeriods: [{ id: 'r', from: D(-30), until: D(-20), createdAt: 0 }] })
    const began = performance.now()
    const history = dayHistory(data, TODAY)
    weeklyXp(history, 26)
    xpTimeline(history)
    heatmap(history, 52)
    completionRates(data, TODAY)
    const elapsed = performance.now() - began
    expect(history.days.length).toBe(3 * 365 + 1)
    expect(elapsed).toBeLessThan(500)
  })
})

// ---------------------------------------------------------------------------
// Ableitungen
// ---------------------------------------------------------------------------

describe('weeklyXp, xpTimeline, heatmap, scoreCounts', () => {
  const a = makeHabit({ id: 'a', order: 0, createdDay: '2026-11-01', difficulty: 'medium' })
  const b = makeHabit({ id: 'b', order: 1, createdDay: '2026-11-01', difficulty: 'easy' })
  const w = makeHabit({ id: 'w', order: 2, createdDay: '2026-11-01', difficulty: 'hard', schedule: { type: 'weekly', times: 2 } })
  const data = makeGameData({
    profile: profile('2026-11-01'),
    habits: [a, b, w],
    completions: [
      makeCompletion(a, '2026-11-01'),
      makeCompletion(b, '2026-11-01'),
      makeCompletion(a, '2026-11-02'),
      makeCompletion(w, '2026-11-03'),
    ],
    sideQuests: [makeSideQuest({ id: 's', difficulty: 'easy', doneDay: '2026-11-04' })],
  })
  const history = dayHistory(data, TODAY)

  it('weeklyXp: XP je ISO-Woche, älteste zuerst, die laufende als current', () => {
    expect(weeklyXp(history, 3)).toEqual([
      { weekStart: '2026-10-19', xp: 0, questXp: 0, perfectBonusXp: 0, sideQuestXp: 0, chapterXp: 0, current: false },
      { weekStart: '2026-10-26', xp: 38, questXp: 30, perfectBonusXp: 8, sideQuestXp: 0, chapterXp: 0, current: false },
      { weekStart: '2026-11-02', xp: 71, questXp: 61, perfectBonusXp: 0, sideQuestXp: 10, chapterXp: 0, current: true },
    ])
    expect(weeklyXp(history, 0)).toEqual([])
  })

  it('xpTimeline: kurze Historie Tag für Tag, Level-Aufstiege vollständig', () => {
    const timeline = xpTimeline(history)
    expect(timeline.points).toEqual([
      { day: '2026-11-01', totalXp: 38, level: 1 },
      { day: '2026-11-02', totalXp: 59, level: 1 },
      { day: '2026-11-03', totalXp: 99, level: 1 },
      { day: '2026-11-04', totalXp: 109, level: 2 },
    ])
    expect(timeline.levelUps).toEqual([{ day: '2026-11-04', from: 1, level: 2 }])
  })

  it('xpTimeline: lange Historie ausgedünnt – erster und letzter Tag immer dabei', () => {
    const habit = makeHabit({ id: 'h', createdDay: D(-400), difficulty: 'hard' })
    const long = makeGameData({ profile: profile(D(-400)), habits: [habit], completions: dayRange(D(-400), TODAY).map((day) => makeCompletion(habit, day)) })
    const longHistory = dayHistory(long, TODAY)
    const timeline = xpTimeline(longHistory, 50)
    expect(timeline.points.length).toBeLessThanOrEqual(50)
    expect(timeline.points.length).toBeGreaterThan(40)
    expect(timeline.points[0].day).toBe(D(-400))
    expect(timeline.points.at(-1)).toEqual({ day: TODAY, totalXp: longHistory.days.at(-1)?.totalXp, level: longHistory.days.at(-1)?.level })
    for (let i = 1; i < timeline.points.length; i++) {
      expect(timeline.points[i].day > timeline.points[i - 1].day).toBe(true)
      expect(timeline.points[i].totalXp).toBeGreaterThanOrEqual(timeline.points[i - 1].totalXp)
    }
    expect(timeline.levelUps.length).toBe((longHistory.days.at(-1)?.level ?? 1) - 1)
    for (const up of timeline.levelUps) {
      expect(statOn(longHistory, up.day)?.level).toBe(up.level)
      expect(statOn(longHistory, addDays(up.day, -1))?.level ?? 1).toBe(up.from)
    }
  })

  it('heatmap: Wochen × Wochentage, außerhalb und Zukunft markiert, Intensität nach Wertung', () => {
    const grid = heatmap(history, 2)
    expect(grid).toHaveLength(2)
    for (const week of grid) expect(week).toHaveLength(7)
    expect(grid[0][0].day).toBe('2026-10-26')
    expect(grid[1][6].day).toBe('2026-11-08')
    expect(grid[0].slice(0, 6).map((cell) => cell.kind)).toEqual(Array(6).fill('outside'))
    expect(grid[0][6]).toMatchObject({ day: '2026-11-01', kind: 'tracked', level: 4, stat: { score: 'perfect' } })
    // Mo: 1 von 2 (gut) → 2 · Di: nur die Wochenquest → 1 · Mi (heute): nichts → 0
    expect(grid[1].slice(0, 3).map((cell) => [cell.kind, cell.level])).toEqual([
      ['tracked', 2],
      ['tracked', 1],
      ['tracked', 0],
    ])
    expect(grid[1].slice(3).map((cell) => cell.kind)).toEqual(Array(4).fill('future'))
    for (const cell of grid[1].slice(3)) expect(cell).not.toHaveProperty('stat')
  })

  it('scoreCounts: zählt die Wertungen (optional ab einem Tag)', () => {
    expect(scoreCounts(history)).toEqual({ perfect: 1, good: 1, weak: 0, missed: 2, rest: 0, none: 0, absent: 0 })
    expect(scoreCounts(history, '2026-11-03')).toEqual({ perfect: 0, good: 0, weak: 0, missed: 2, rest: 0, none: 0, absent: 0 })
  })
})

// ---------------------------------------------------------------------------
// Pro Quest
// ---------------------------------------------------------------------------

describe('completionRates', () => {
  it('Tagesquest: Plantage der letzten 30 Tage – ohne Ruhetage und ohne noch offene Tage', () => {
    const habit = makeHabit({ id: 'd', createdDay: D(-40) })
    const misses = new Set([D(-20), D(-10), D(-5)])
    const rest = new Set([D(-15), D(-14)])
    const completions = dayRange(D(-40), D(-2))
      .filter((day) => !misses.has(day) && !rest.has(day))
      .map((day) => makeCompletion(habit, day))
    const data = makeGameData({ habits: [habit], completions, restPeriods: [{ id: 'r', from: D(-15), until: D(-14), createdAt: 0 }] })
    // D(-29) … D(-2) = 28 Tage, minus 2 Ruhetage = 26 fällig; gestern und heute laufen noch.
    expect(completionRates(data, TODAY)).toEqual([{ habit, unit: 'day', due: 26, done: 23, rate: 23 / 26 }])
    expect(COMPLETION_RATE_DAYS).toBe(30)
    // Schon heute erledigt → zählt mit.
    const withToday = { ...data, completions: [...completions, makeCompletion(habit, TODAY)] }
    expect(completionRates(withToday, TODAY)[0]).toMatchObject({ due: 27, done: 24 })
  })

  it('Wochenquest: abgeschlossene Wochen plus die laufende, sobald sie erfüllt ist', () => {
    const habit = makeHabit({ id: 'w', createdDay: D(-60), schedule: { type: 'weekly', times: 2 } })
    // Wochen ab Mo 05.10., 12.10., 19.10. (mit Ruhetagen), 26.10. – laufende Woche ab 02.11.
    const days = ['2026-10-05', '2026-10-07', '2026-10-13', '2026-10-19', '2026-10-23', '2026-10-26', '2026-10-27', '2026-10-28', '2026-11-03']
    const data = makeGameData({
      habits: [habit],
      completions: days.map((day) => makeCompletion(habit, day)),
      restPeriods: [{ id: 'r', from: '2026-10-20', until: '2026-10-21', createdAt: 0 }],
    })
    expect(completionRates(data, TODAY)).toEqual([{ habit, unit: 'week', due: 4, done: 3, rate: 0.75 }])
    const fulfilled = { ...data, completions: [...data.completions, makeCompletion(habit, TODAY)] }
    expect(completionRates(fulfilled, TODAY)[0]).toMatchObject({ due: 5, done: 4, rate: 0.8 })
    // Eine unerfüllte Woche mit Ruhetag zählt nicht gegen dich.
    const restWeek = { ...data, completions: data.completions.filter((c) => c.day !== '2026-10-23') }
    expect(completionRates(restWeek, TODAY)[0]).toMatchObject({ due: 3, done: 2 })
  })

  it('nur angelegte, nicht archivierte Quests, sortiert wie die Listen; ohne Fälliges keine Quote', () => {
    const later = makeHabit({ id: 'b', order: 2, title: 'Später', createdDay: D(1) })
    const archived = makeHabit({ id: 'c', order: 0, archivedDay: D(-1), createdDay: D(-10) })
    const fresh = makeHabit({ id: 'd', order: 1, title: 'Neu', createdDay: TODAY })
    const first = makeHabit({ id: 'a', order: 1, title: 'Alt', createdDay: D(-3) })
    const data = makeGameData({ habits: [later, archived, fresh, first], completions: [makeCompletion(first, D(-3))] })
    const rates = completionRates(data, TODAY)
    expect(rates.map((rate) => rate.habit.id)).toEqual(['a', 'd'])
    expect(rates[0]).toMatchObject({ due: 2, done: 1, rate: 0.5 })
    expect(rates[1]).toEqual({ habit: fresh, unit: 'day', due: 0, done: 0 })
  })

  it('pausierte Tage und Tage vor dem Anlegen zählen nicht', () => {
    const habit = makeHabit({ id: 'p', createdDay: D(-9), pauses: [{ from: D(-6), until: D(-3) }] })
    const data = makeGameData({ habits: [habit], completions: [makeCompletion(habit, D(-9)), makeCompletion(habit, D(-2))] })
    // fällig: D(-9) … D(-7) und D(-3), D(-2) = 5 (D(-6) … D(-4) pausiert)
    expect(completionRates(data, TODAY)[0]).toMatchObject({ due: 5, done: 2 })
  })
})

describe('habitHeatmap', () => {
  it('Zustände einer Quest Tag für Tag', () => {
    // Mo, Mi, Fr · messbar (10 Seiten) · angelegt Mi 28.10.
    const habit = makeHabit({ id: 'r', createdDay: '2026-10-28', schedule: { type: 'weekdays', days: [1, 3, 5] }, measure: { target: 10, unit: 'Seiten' } })
    const data = makeGameData({
      habits: [habit],
      completions: [
        makeCompletion(habit, '2026-10-28'),
        makeCompletion(habit, '2026-10-30', { value: 6 }),
        makeCompletion(habit, '2026-10-31', { value: 3 }), // Teilfortschritt an einem freien Tag
      ],
      restPeriods: [{ id: 'r', from: '2026-11-02', until: '2026-11-02', createdAt: 0 }],
    })
    const grid = habitHeatmap(data, 'r', TODAY, 2)
    expect(grid.flat().map((cell) => [cell.day.slice(5), cell.state, cell.level])).toEqual([
      ['10-26', 'inactive', 0],
      ['10-27', 'inactive', 0],
      ['10-28', 'done', 4],
      ['10-29', 'free', 0],
      ['10-30', 'partial', 2],
      ['10-31', 'partial', 1],
      ['11-01', 'free', 0],
      ['11-02', 'rest', 0],
      ['11-03', 'free', 0],
      ['11-04', 'open', 0],
      ['11-05', 'future', 0],
      ['11-06', 'future', 0],
      ['11-07', 'future', 0],
      ['11-08', 'future', 0],
    ])
    expect(grid[0][4]).toMatchObject({ value: 6, target: 10 })
    expect(grid[1][2]).toMatchObject({ value: 0, target: 10 })
  })

  it('verpasst erst nach der Nachtrag-Frist; unbekannte Quest → leer', () => {
    const habit = makeHabit({ id: 'h', createdDay: D(-3) })
    const grid = habitHeatmap(makeGameData({ habits: [habit] }), 'h', TODAY, 1)
    // Mo 02.11. verpasst, Di 03.11. (gestern) noch offen, heute offen
    expect(grid[0].slice(0, 3).map((cell) => cell.state)).toEqual(['missed', 'open', 'open'])
    expect(habitHeatmap(makeGameData({ habits: [habit] }), 'gibt-es-nicht', TODAY, 4)).toEqual([])
  })
})

// ---------------------------------------------------------------------------
// Attribut-Radar
// ---------------------------------------------------------------------------

describe('attributeRadar', () => {
  function attributes(levels: Partial<Record<AttributeId, [number, number]>>): Record<AttributeId, LevelInfo> {
    const result = {} as Record<AttributeId, LevelInfo>
    for (const id of ATTRIBUTE_IDS) {
      const [level, progress] = levels[id] ?? [1, 0]
      result[id] = { level, progress, totalXp: level * 100, xpIntoLevel: 0, xpForNextLevel: 100 }
    }
    return result
  }

  it('Achsen in fester Reihenfolge; ein frischer Held füllt das Radar nicht', () => {
    const radar = attributeRadar(attributes({ intellect: [3, 0.5] }))
    expect(radar.scale).toBe(RADAR_MIN_SCALE)
    expect(radar.axes.map((axis) => axis.id)).toEqual(ATTRIBUTE_IDS)
    expect(radar.axes.find((axis) => axis.id === 'intellect')).toMatchObject({ level: 3, progress: 0.5, totalXp: 300, value: 0.7 })
    expect(radar.axes.find((axis) => axis.id === 'strength')?.value).toBe(0.2)
  })

  it('der Rand wächst mit dem höchsten Attribut', () => {
    const radar = attributeRadar(attributes({ wisdom: [7, 0.2], charisma: [2, 0] }))
    expect(radar.scale).toBe(8)
    expect(radar.axes.find((axis) => axis.id === 'wisdom')?.value).toBeCloseTo(0.9, 10)
    for (const axis of radar.axes) {
      expect(axis.value).toBeGreaterThanOrEqual(0)
      expect(axis.value).toBeLessThanOrEqual(1)
    }
  })

  it('passt zu GameState.attributes', () => {
    const habit = makeHabit({ id: 'h', createdDay: D(-20), attribute: 'vitality', difficulty: 'hard' })
    const data = makeGameData({ habits: [habit], completions: dayRange(D(-20), TODAY).map((day) => makeCompletion(habit, day)) })
    const radar = attributeRadar(deriveGameState(data, TODAY).attributes)
    const vitality = radar.axes.find((axis) => axis.id === 'vitality')
    expect(vitality?.level).toBeGreaterThan(1)
    expect(vitality?.value).toBe(Math.max(...radar.axes.map((axis) => axis.value)))
  })
})
