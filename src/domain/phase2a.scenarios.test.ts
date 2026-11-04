/**
 * Phase 2a – unabhängige Prüfung (Review): Szenarien mit von Hand gerechneten XP- und Gold-Werten sowie ein
 * Referenzmodell des Streak-Bonus, das – anders als `streakRunsBefore` – vom Tag aus **rückwärts** läuft.
 *
 * Kalender: 2026-10-05, 10-12, 10-19, 10-26, 11-02 sind Montage.
 */
import { describe, expect, it } from 'vitest'
import { ATTRIBUTE_IDS } from './attributes'
import { BALANCING, DIFFICULTIES } from './balancing'
import { addDays, compareDays, dayRange, isoWeekday, startOfWeek } from './dates'
import { deriveGameState, getDayState } from './engine'
import { isPausedOn, isScheduledWeekday, questXp, scheduleOn } from './schedule'
import { streakBonusesOn, xpWithStreakBonus } from './streakBonus'
import {
  completeRange,
  makeAchievement,
  makeChapter,
  makeCompletion,
  makeGameData,
  makeHabit,
  makeMainQuest,
  makePurchase,
  makeSideQuest,
  seededRandom,
} from './testing'
import type { AchievementStats, Completion, DayKey, DeletedHabit, GameData, Habit, Schedule } from './types'

function sum(values: readonly number[]): number {
  return values.reduce((a, b) => a + b, 0)
}

/** Perfekter-Tag-Bonus von Hand: round(25 % der Quest-XP des Tages). */
function perfect(xp: number): number {
  return Math.round(0.25 * xp)
}

describe('Streak-Bonus – von Hand gerechnete Szenarien', () => {
  it('täglich, leicht (10 XP), 12 Tage am Stück: 10, 11, 11, 12, 12, 13, 13, 14, 14, 15, 15, 15', () => {
    const habit = makeHabit({ id: 'read', difficulty: 'easy', attribute: 'intellect', createdDay: '2026-10-05' })
    const data = makeGameData({ habits: [habit], completions: completeRange(habit, '2026-10-05', '2026-10-16') })
    const perDay = [10, 11, 11, 12, 12, 13, 13, 14, 14, 15, 15, 15]
    // 10,5 → 11 · 11,5 → 12 · 12,5 → 13 · 13,5 → 14 · 14,5 → 15 (kaufmännisch gerundet)
    const state = deriveGameState(data, '2026-10-16')
    expect(state.totals.xpFromQuests).toBe(155)
    expect(state.totals.xpFromStreakBonus).toBe(155 - 120)
    // Perfekte Tage: 3,3,3,3,3,3,3,4,4,4,4,4 = 41 (2,5 → 3; 3,5 → 4)
    expect(state.totals.xpFromPerfectDays).toBe(sum(perDay.map(perfect)))
    expect(state.totals.xpFromPerfectDays).toBe(41)
    expect(state.level.totalXp).toBe(196)
    expect(state.attributes.intellect.totalXp).toBe(155)
    expect(state.gold).toMatchObject({ fromXp: 98, spent: 0 })
    // Jeder Tag einzeln
    expect(dayRange('2026-10-05', '2026-10-16').map((day) => getDayState(data, day).questXp)).toEqual(perDay)
    // Morgen (noch offen): 12 Tage Serie davor → +50 %
    expect(getDayState(data, '2026-10-17').habits[0]).toMatchObject({ done: false, baseXp: 10, streakBonus: 0.5, xp: 15 })
  })

  it('täglich, episch (80 XP), mit Lücke: 80, 84, 88, –, 80, 84 → 416 + 104 Perfekte-Tage-Bonus', () => {
    const habit = makeHabit({ id: 'epic', difficulty: 'epic', attribute: 'strength', createdDay: '2026-10-05' })
    const days = ['2026-10-05', '2026-10-06', '2026-10-07', '2026-10-09', '2026-10-10']
    const data = makeGameData({ habits: [habit], completions: days.map((day) => makeCompletion(habit, day)) })
    const state = deriveGameState(data, '2026-10-10')
    expect(state.totals).toMatchObject({ xpFromQuests: 416, xpFromStreakBonus: 16, perfectDays: 5, xpFromPerfectDays: 104 })
    // 520 XP: Level 1→2 kostet 100, 2→3 kostet 283 → Level 3 mit 137 XP ins Level
    expect(state.level).toMatchObject({ totalXp: 520, level: 3, xpIntoLevel: 137 })
    expect(state.gold.fromXp).toBe(260)
    expect(getDayState(data, '2026-10-08')).toMatchObject({ perfect: false, requiredCount: 1, requiredDone: 0 })
  })

  it('Wochenquest 2× pro Woche (40 XP): Bonus nach erfüllten Wochen davor, unerfüllte Woche bricht', () => {
    const habit = makeHabit({ id: 'gym', difficulty: 'hard', schedule: { type: 'weekly', times: 2 }, createdDay: '2026-10-05' })
    const days = [
      '2026-10-06', '2026-10-08', // KW 1: erfüllt → je 40
      '2026-10-12', '2026-10-14', '2026-10-16', // KW 2: 1 Woche davor → je 42 (auch die dritte)
      '2026-10-24', // KW 3: 2 Wochen davor → 44, aber nur 1× → Woche nicht erfüllt
      '2026-10-26', // KW 4: Serie gebrochen → 40
    ]
    const data = makeGameData({ habits: [habit], completions: days.map((day) => makeCompletion(habit, day)) })
    expect(days.map((day) => getDayState(data, day).questXp)).toEqual([40, 40, 42, 42, 42, 44, 40])
    const state = deriveGameState(data, '2026-10-28')
    expect(state.totals).toMatchObject({ xpFromQuests: 290, perfectDays: 0, xpFromPerfectDays: 0 })
    expect(state.todayState.habits[0]).toMatchObject({ streakBonus: 0, xp: 40, week: { done: 1, target: 2 } })
  })

  it('Mo/Mi/Fr mit Urlaubs-Pause: Pause bricht nichts, ein verpasster Plantag schon', () => {
    const habit = makeHabit({
      id: 'mwf',
      schedule: { type: 'weekdays', days: [1, 3, 5] },
      createdDay: '2026-10-05',
      pauses: [{ from: '2026-10-12', until: '2026-10-19' }],
    })
    // Mo 05., Mi 07., Fr 09. → 20, 21, 22 · Pause KW 2 · Mo 19. → 23 · Mi 21. verpasst · Fr 23. → 20
    const days = ['2026-10-05', '2026-10-07', '2026-10-09', '2026-10-19', '2026-10-23']
    const data = makeGameData({ habits: [habit], completions: days.map((day) => makeCompletion(habit, day)) })
    expect(days.map((day) => getDayState(data, day).questXp)).toEqual([20, 21, 22, 23, 20])
    const state = deriveGameState(data, '2026-10-23')
    // Perfekt: 5 + 5 + 6 + 6 + 5 = 27 (21 → 5,25; 22 → 5,5; 23 → 5,75)
    expect(state.totals).toMatchObject({ xpFromQuests: 106, perfectDays: 5, xpFromPerfectDays: 27 })
    expect(state.gold.fromXp).toBe(66) // floor(133 / 2)
  })

  it('Umstellung täglich → 1× pro Woche mitten in der Woche: Wochen-Serie startet erst mit der ersten vollen Wochenquest-Woche', () => {
    const habit = makeHabit({
      id: 'switch',
      createdDay: '2026-10-05',
      scheduleHistory: [{ until: '2026-10-08', schedule: { type: 'daily' } }],
      schedule: { type: 'weekly', times: 1 },
    })
    const days = [
      '2026-10-05', '2026-10-06', '2026-10-07', // täglich: 20, 21, 22
      '2026-10-08', // Do, jetzt Wochenquest – Montag der Woche war täglich → Woche zählt nicht: 20
      '2026-10-13', // KW 2: davor keine gezählte Woche → 20
      '2026-10-21', // KW 3: 1 Woche → 21
      '2026-10-26', // KW 4: 2 Wochen → 22
    ]
    const data = makeGameData({ habits: [habit], completions: days.map((day) => makeCompletion(habit, day)) })
    expect(days.map((day) => getDayState(data, day).questXp)).toEqual([20, 21, 22, 20, 20, 21, 22])
    const state = deriveGameState(data, '2026-10-26')
    // Perfekt nur an den drei Tagen als Tagesquest: 5 + 5 + 6
    expect(state.totals).toMatchObject({ xpFromQuests: 146, perfectDays: 3, xpFromPerfectDays: 16 })
  })

  it('zwei Quests an einem Tag: der Perfekter-Tag-Bonus nimmt die Summe inklusive beider Boni', () => {
    const a = makeHabit({ id: 'a', difficulty: 'easy', createdDay: '2026-10-05' })
    const b = makeHabit({ id: 'b', difficulty: 'hard', createdDay: '2026-10-06', order: 1 })
    const data = makeGameData({
      habits: [a, b],
      completions: [...completeRange(a, '2026-10-05', '2026-10-07'), ...completeRange(b, '2026-10-06', '2026-10-07')],
    })
    // 05.: 10 → 3 · 06.: 11 + 40 = 51 → 13 · 07.: 11 + 42 = 53 → 13
    expect(['2026-10-05', '2026-10-06', '2026-10-07'].map((day) => getDayState(data, day))).toMatchObject([
      { questXp: 10, perfectBonusXp: 3 },
      { questXp: 51, perfectBonusXp: 13 },
      { questXp: 53, perfectBonusXp: 13 },
    ])
    expect(deriveGameState(data, '2026-10-07').level.totalXp).toBe(114 + 29)
  })

  it('Teilfortschritt bricht die Serie und gibt 0 XP; messbare Quests nutzen den Ziel-Snapshot', () => {
    const habit = makeHabit({ id: 'pages', measure: { target: 10, unit: 'Seiten' }, createdDay: '2026-10-05' })
    const completions = [
      makeCompletion(habit, '2026-10-05'),
      makeCompletion(habit, '2026-10-06'),
      makeCompletion(habit, '2026-10-07', { value: 4 }), // Teilfortschritt
      makeCompletion(habit, '2026-10-08'),
    ]
    const data = makeGameData({ habits: [habit], completions })
    expect(['2026-10-05', '2026-10-06', '2026-10-07', '2026-10-08'].map((d) => getDayState(data, d).questXp)).toEqual([
      20, 21, 0, 20,
    ])
  })
})

describe('Gold & Nebenquests – von Hand gerechnet', () => {
  const habit = makeHabit({ id: 'read', difficulty: 'easy', attribute: 'intellect', createdDay: '2026-10-05' })
  const completions = completeRange(habit, '2026-10-05', '2026-10-16') // 155 Quest-XP + 41 Perfekt = 196

  it('Nebenquests: questXp ohne Bonus an Charakter und Attribut, nur bis heute, nie im Perfekten Tag', () => {
    const data = makeGameData({
      habits: [habit],
      completions,
      sideQuests: [
        makeSideQuest({ id: 'tax', difficulty: 'hard', attribute: 'strength', createdDay: '2026-10-01', doneDay: '2026-10-10' }),
        makeSideQuest({ id: 'later', difficulty: 'easy', attribute: 'strength', doneDay: '2026-10-20' }),
      ],
    })
    const state = deriveGameState(data, '2026-10-16')
    expect(state.totals).toMatchObject({ xpFromSideQuests: 40, sideQuestsCompleted: 1, xpFromPerfectDays: 41 })
    expect(state.level.totalXp).toBe(236)
    expect(state.attributes.strength.totalXp).toBe(40)
    expect(state.gold.fromXp).toBe(118)
    expect(getDayState(data, '2026-10-10').questXp).toBe(13) // Tag 6 der Serie, ohne die 40 der Nebenquest
    // „später erledigt“ (Uhr zurückgestellt) zählt noch nicht und steht als offen in der Liste
    expect(state.sideQuests.map((s) => [s.quest.id, s.done])).toEqual([['later', false]])
  })

  it('Guthaben = floor(XP / 2) + Erfolgs-Gold − Ausgaben; Erfolgs-Gold nicht in goldFromXp', () => {
    const data = makeGameData({
      habits: [habit],
      completions,
      purchases: [makePurchase({ id: 'p', price: 50, day: '2026-10-16' })],
    })
    const achievements = [
      makeAchievement('twelve', (s) => s.questsCompleted, 12, { goldReward: 25 }),
      makeAchievement('gold', (s) => s.goldFromXp, 99, { goldReward: 75 }), // 98 < 99: Erfolgs-Gold zählt nicht
    ]
    const state = deriveGameState(data, '2026-10-16', { achievements })
    expect(state.gold).toEqual({ fromXp: 98, fromAchievements: 25, fromChests: 0, earned: 123, spent: 50, lostToDefeats: 0, balance: 73 })
    expect(state.achievements.map((a) => a.unlocked)).toEqual([true, false])
  })

  it('Sortierung der Nebenquests: überfällig/mit Termin nach Termin, dann ohne Termin nach order, dann heute erledigte', () => {
    const today = '2026-10-16'
    const data = makeGameData({
      sideQuests: [
        makeSideQuest({ id: 'none-b', order: 1 }),
        makeSideQuest({ id: 'none-a', order: 0 }),
        makeSideQuest({ id: 'due-later', order: 5, dueDay: '2026-10-30' }),
        makeSideQuest({ id: 'overdue', order: 9, dueDay: '2026-10-10' }),
        makeSideQuest({ id: 'due-today', order: 2, dueDay: today }),
        makeSideQuest({ id: 'done-today-2', order: 7, doneDay: today }),
        makeSideQuest({ id: 'done-today-1', order: 3, doneDay: today, dueDay: '2026-10-01' }),
        makeSideQuest({ id: 'done-yesterday', order: 0, doneDay: '2026-10-15' }),
      ],
    })
    const state = deriveGameState(data, today)
    expect(state.sideQuests.map((s) => s.quest.id)).toEqual([
      'overdue',
      'due-today',
      'due-later',
      'none-a',
      'none-b',
      'done-today-1',
      'done-today-2',
    ])
    expect(state.sideQuests.map((s) => [s.overdue, s.dueToday])).toEqual([
      [true, false],
      [false, true],
      [false, false],
      [false, false],
      [false, false],
      [false, false], // erledigt → nie überfällig
      [false, false],
    ])
    // Tagesgrenze: am nächsten Tag fallen die heute erledigten aus der Liste, ihre XP bleiben
    const tomorrow = deriveGameState(data, addDays(today, 1))
    expect(tomorrow.sideQuests.map((s) => s.quest.id)).not.toContain('done-today-1')
    expect(tomorrow.totals.sideQuestsCompleted).toBe(3)
  })
})

describe('Erfolgs-Kennzahlen – von Hand gerechnet', () => {
  const stat = (data: GameData, today: DayKey) => {
    let captured: AchievementStats | undefined
    deriveGameState(data, today, {
      achievements: [makeAchievement('probe', (s) => ((captured = s), 0), 1)],
    })
    if (!captured) throw new Error('Kennzahlen nicht gelesen')
    return captured
  }

  it('Rückkehren: Lücke ≥ 7 Tage zählt, 6 nicht; Nebenquests und Teilfortschritte füllen keine Lücke', () => {
    const habit = makeHabit({ id: 'h', measure: { target: 2, unit: 'x' }, createdDay: '2026-10-01' })
    const done = ['2026-10-01', '2026-10-09', '2026-10-16', '2026-10-24'] // Lücken 7, 6, 7
    const data = makeGameData({
      habits: [habit],
      completions: [
        ...done.map((day) => makeCompletion(habit, day)),
        makeCompletion(habit, '2026-10-20', { value: 1 }), // Teilfortschritt mitten in der letzten Lücke
      ],
      sideQuests: [makeSideQuest({ id: 's', doneDay: '2026-10-05' })], // Nebenquest in der ersten Lücke
    })
    expect(stat(data, '2026-10-24')).toMatchObject({ comebacks: 2, activeDays: 4, questsCompleted: 4 })
    // Zukunft zählt nicht
    expect(stat(data, '2026-10-23').comebacks).toBe(1)
  })

  it('Kapitel und Kampagnen zählen archivierte mit; aktive = nicht archiviert und nicht abgeschlossen', () => {
    const habit = makeHabit({ id: 'h', createdDay: '2026-10-01' })
    const doneChapter = (id: string) => makeChapter({ id, criterion: { type: 'manual' }, manualDone: true, completedDay: '2026-10-02' })
    const openChapter = (id: string) => makeChapter({ id, criterion: { type: 'manual' } })
    const data = makeGameData({
      habits: [habit],
      mainQuests: [
        makeMainQuest({ id: 'running', chapters: [doneChapter('r1'), openChapter('r2')] }),
        makeMainQuest({ id: 'won', chapters: [doneChapter('w1'), doneChapter('w2')] }),
        makeMainQuest({ id: 'won-archived', archived: true, chapters: [doneChapter('a1')] }),
        makeMainQuest({ id: 'ended', archived: true, chapters: [doneChapter('e1'), openChapter('e2')] }),
        makeMainQuest({
          id: 'broken',
          chapters: [makeChapter({ id: 'b1', criterion: { type: 'habit', habitId: 'gone', metric: 'completions', target: 1 } })],
        }),
      ],
    })
    expect(stat(data, '2026-10-05')).toMatchObject({ chaptersCompleted: 5, campaignsCompleted: 2, activeCampaigns: 2 })
  })

  it('Einlösungen zählen bis heute; ein gespeicherter Erfolg bleibt, auch wenn der Wert wieder sinkt', () => {
    const habit = makeHabit({ id: 'h', createdDay: '2026-10-01' })
    const data = makeGameData({
      habits: [habit],
      completions: [makeCompletion(habit, '2026-10-01')],
      purchases: [makePurchase({ id: 'p1', day: '2026-10-01' }), makePurchase({ id: 'p2', day: '2026-10-09' })],
      achievementUnlocks: [
        { id: 'ten', day: '2026-10-03' },
        { id: 'ten', day: '2026-10-02' }, // doppelt (kaputte Daten): der früheste gilt
        { id: 'removed-definition', day: '2026-10-01' },
      ],
    })
    expect(stat(data, '2026-10-05').purchases).toBe(1)
    const achievements = [makeAchievement('ten', (s) => s.questsCompleted, 10, { goldReward: 75 })]
    const state = deriveGameState(data, '2026-10-05', { achievements })
    expect(state.achievements[0]).toMatchObject({ unlocked: true, unlockedDay: '2026-10-02', current: 1, target: 10 })
    expect(state.gold.fromAchievements).toBe(75)
  })
})

// ---------------------------------------------------------------------------
// Referenzmodell: Serie unmittelbar vor einem Tag, rückwärts gezählt
// ---------------------------------------------------------------------------

/** Ist die Quest an diesem Tag „verfügbar“ (angelegt, nicht archiviert, nicht pausiert)? */
function available(habit: Habit, day: DayKey): boolean {
  if (compareDays(day, habit.createdDay) < 0) return false
  if (habit.archivedDay !== undefined && compareDays(day, habit.archivedDay) >= 0) return false
  return !isPausedOn(habit, day)
}

/** Tages-Einheit: rückwärts über die Plantage vor `day`; Pausen/Archiv/Nicht-Plantage überspringen. */
function referenceDayRun(habit: Habit, done: ReadonlySet<DayKey>, day: DayKey): number {
  let run = 0
  for (let d = addDays(day, -1); compareDays(d, habit.createdDay) >= 0; d = addDays(d, -1)) {
    if (!available(habit, d)) continue
    const schedule = scheduleOn(habit, d)
    if (!isScheduledWeekday(schedule, isoWeekday(d))) continue
    if (!done.has(d)) break
    run++
  }
  return run
}

/** Wochen-Einheit: rückwärts über die Wochen vor der Woche von `day`. */
function referenceWeekRun(habit: Habit, done: ReadonlySet<DayKey>, day: DayKey): number {
  let run = 0
  const firstMonday = startOfWeek(habit.createdDay)
  for (let monday = addDays(startOfWeek(day), -7); compareDays(monday, firstMonday) >= 0; monday = addDays(monday, -7)) {
    const schedule = scheduleOn(habit, monday)
    if (schedule.type !== 'weekly') continue // Woche zählt nicht, bricht nichts
    const times = Math.max(1, schedule.times)
    let count = 0
    let interrupted = false
    for (const d of dayRange(monday, addDays(monday, 6))) {
      if (compareDays(d, habit.createdDay) < 0) continue
      if (!available(habit, d)) {
        interrupted = true
        continue
      }
      if (done.has(d)) count++
    }
    if (count >= times) run++
    else if (!interrupted) break
  }
  return run
}

function referenceBonus(habit: Habit, done: ReadonlySet<DayKey>, day: DayKey): number {
  if (compareDays(day, habit.createdDay) < 0) return 0
  const run = scheduleOn(habit, day).type === 'weekly' ? referenceWeekRun(habit, done, day) : referenceDayRun(habit, done, day)
  return Math.min(run * BALANCING.streakBonusPerStep, BALANCING.streakBonusMax)
}

/** Zufällige Quest mit Rhythmus-Verlauf, Pausen und evtl. Archivierung im Zeitraum ab `start`. */
function randomHabit(rnd: () => number, id: string, start: DayKey, span: number): Habit {
  const int = (max: number) => Math.floor(rnd() * (max + 1))
  const schedule = (): Schedule => {
    const r = rnd()
    if (r < 0.4) return { type: 'daily' }
    if (r < 0.7) {
      const days = [1, 2, 3, 4, 5, 6, 7].filter(() => rnd() < 0.5) as (1 | 2 | 3 | 4 | 5 | 6 | 7)[]
      return { type: 'weekdays', days: days.length > 0 ? days : [3] }
    }
    return { type: 'weekly', times: 1 + int(4) }
  }
  const createdDay = addDays(start, int(10))
  const history = Array.from({ length: int(3) }, () => addDays(createdDay, 1 + int(span - 12)))
    .sort(compareDays)
    .filter((until, i, all) => i === 0 || until !== all[i - 1])
    .map((until) => ({ until, schedule: schedule() }))
  const pauses = Array.from({ length: int(2) }, () => {
    const from = addDays(createdDay, int(span - 12))
    return { from, until: addDays(from, 1 + int(9)) }
  })
  const habit = makeHabit({
    id,
    order: int(5),
    createdDay,
    schedule: schedule(),
    difficulty: DIFFICULTIES[int(3)],
    attribute: ATTRIBUTE_IDS[int(5)],
  })
  if (history.length > 0) habit.scheduleHistory = history
  if (pauses.length > 0) habit.pauses = pauses
  if (rnd() < 0.25) habit.archivedDay = addDays(createdDay, 5 + int(span - 15))
  return habit
}

describe('Streak-Bonus – Referenzmodell (rückwärts gezählt)', () => {
  it('streakBonusesOn stimmt an jedem Tag mit dem Rückwärts-Modell überein (300 zufällige Quests)', () => {
    const rnd = seededRandom(20261104)
    const start: DayKey = '2026-06-01'
    const span = 90
    for (let i = 0; i < 300; i++) {
      const habit = randomHabit(rnd, `h${i}`, start, span)
      const density = 0.4 + rnd() * 0.6
      const done = new Set(dayRange(addDays(start, -3), addDays(start, span)).filter(() => rnd() < density))
      const days = dayRange(start, addDays(start, span + 3))
      const actual = streakBonusesOn(habit, done, days)
      days.forEach((day, k) => {
        expect(actual[k], `${JSON.stringify(habit)} @ ${day}`).toBeCloseTo(referenceBonus(habit, done, day), 10)
      })
    }
  })

  it('Engine: jede Erledigung bringt round(questXp × (1 + Bonus)); Tagessummen = Gesamtwerte (Zufallstest)', () => {
    const rnd = seededRandom(4242)
    for (let round = 0; round < 25; round++) {
      const start: DayKey = '2026-03-02'
      const span = 70
      const today = addDays(start, span)
      const habits = Array.from({ length: 1 + Math.floor(rnd() * 5) }, (_, i) => randomHabit(rnd, `q${i}`, start, span))
      const completions: Completion[] = []
      for (const habit of habits) {
        for (const day of dayRange(addDays(start, -2), today)) {
          if (rnd() < 0.55) {
            const difficulty = rnd() < 0.2 ? DIFFICULTIES[Math.floor(rnd() * 4)] : habit.difficulty
            completions.push(makeCompletion(habit, day, { difficulty, value: rnd() < 0.1 ? 0.5 : 1 }))
          }
        }
      }
      const deletedHabits: DeletedHabit[] =
        rnd() < 0.5 ? [{ id: 'gone', createdDay: start, archivedDay: addDays(start, 20), schedule: { type: 'daily' } }] : []
      const data = makeGameData({ habits, completions, ...(deletedHabits.length > 0 ? { deletedHabits } : {}) })
      const state = deriveGameState(data, today)

      // Erwartung aus dem Referenzmodell
      let expectedQuestXp = 0
      let expectedBonus = 0
      const expectedAttr = Object.fromEntries(ATTRIBUTE_IDS.map((id) => [id, 0])) as Record<string, number>
      for (const habit of habits) {
        const done = new Set(completions.filter((c) => c.habitId === habit.id && c.value >= c.target).map((c) => c.day))
        for (const c of completions) {
          if (c.habitId !== habit.id || c.value < c.target) continue
          const xp = xpWithStreakBonus(questXp(c.difficulty), referenceBonus(habit, done, c.day))
          expectedQuestXp += xp
          expectedBonus += xp - questXp(c.difficulty)
          expectedAttr[c.attribute] += xp
        }
      }
      expect(state.totals.xpFromQuests).toBe(expectedQuestXp)
      expect(state.totals.xpFromStreakBonus).toBe(expectedBonus)
      for (const id of ATTRIBUTE_IDS) expect(state.attributes[id].totalXp, id).toBe(expectedAttr[id])

      // Tag für Tag: getDayState rechnet genau wie die Gesamtwerte
      const days = dayRange(addDays(start, -2), today).map((day) => getDayState(data, day))
      expect(sum(days.map((d) => d.questXp))).toBe(state.totals.xpFromQuests)
      expect(sum(days.map((d) => d.perfectBonusXp))).toBe(state.totals.xpFromPerfectDays)
      expect(days.filter((d) => d.perfect).length).toBe(state.totals.perfectDays)
      expect(state.gold.fromXp).toBe(Math.floor(state.level.totalXp / 2))
      // Erledigte Zeilen zeigen die gutgeschriebenen XP
      for (const dayState of days) {
        for (const status of dayState.habits) {
          const bonus = referenceBonus(status.habit, new Set(completions.filter((c) => c.habitId === status.habit.id && c.value >= c.target).map((c) => c.day)), dayState.day)
          expect(status.streakBonus).toBeCloseTo(bonus, 10)
          expect(status.xp).toBe(xpWithStreakBonus(status.baseXp, bonus))
        }
      }
    }
  })
})
