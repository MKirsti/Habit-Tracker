import { describe, expect, it } from 'vitest'
import { ACHIEVEMENTS } from './achievements/definitions'
import { ATTRIBUTE_IDS } from './attributes'
import { BALANCING, DIFFICULTIES } from './balancing'
import { addDays, dayRange } from './dates'
import { deriveGameState, getDayState } from './engine'
import {
  completeRange,
  makeAchievement,
  makeChapter,
  makeCompletion,
  makeGameData,
  makeHabit,
  makeMainQuest,
  makePurchase,
  makeReward,
  makeSideQuest,
  seededRandom,
} from './testing'
import type { AchievementStats, AttributeId, Completion, DayKey, Difficulty, GameData, Habit, Schedule } from './types'

// Kalender-Referenz: 2026-11-02 ist ein Montag.
const TODAY: DayKey = '2026-11-12' // Donnerstag

/** Tägliche, mittlere Quest (20 XP) für Stärke. */
const workout = makeHabit({ id: 'workout', title: 'Training', attribute: 'strength', difficulty: 'medium', createdDay: '2026-11-01' })

function statusOf(data: GameData, id: string, day: DayKey = TODAY) {
  const status = getDayState(data, day).habits.find((s) => s.habit.id === id)
  if (!status) throw new Error(`Quest ${id} ist am ${day} nicht sichtbar`)
  return status
}

describe('deriveGameState – Streak-Bonus', () => {
  it('Tag 1 +0 %, Tag 2 +5 %, …, ab Tag 11 +50 % – für Charakter- und Attribut-XP', () => {
    // 01.–12.11. jeden Tag erledigt: 20, 21, 22, …, 29, 30, 30
    const data = makeGameData({ habits: [workout], completions: completeRange(workout, '2026-11-01', TODAY) })
    const state = deriveGameState(data, TODAY)
    const expected = [20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 30]
    const questXp = expected.reduce((a, b) => a + b, 0)
    expect(state.totals).toMatchObject({ questsCompleted: 12, xpFromQuests: questXp, xpFromStreakBonus: questXp - 12 * 20 })
    expect(state.attributes.strength.totalXp).toBe(questXp)
    expect(state.todayState.habits[0]).toMatchObject({ done: true, xp: 30, baseXp: 20, streakBonus: 0.5 })
    // Jeder frühere Tag zeigt den damals gutgeschriebenen Bonus
    dayRange('2026-11-01', TODAY).forEach((day, i) => {
      expect(statusOf(data, 'workout', day), day).toMatchObject({ xp: expected[i], baseXp: 20 })
    })
  })

  it('der Perfekter-Tag-Bonus rechnet mit den Quest-XP inklusive Streak-Bonus', () => {
    // 02.: 20 XP → Bonus 5 · 03.: 21 XP → round(5,25) = 5 · 04.: 22 XP → round(5,5) = 6
    const data = makeGameData({ habits: [workout], completions: completeRange(workout, '2026-11-02', '2026-11-04') })
    const state = deriveGameState(data, '2026-11-04')
    expect(state.totals).toMatchObject({ perfectDays: 3, xpFromQuests: 63, xpFromPerfectDays: 5 + 5 + 6 })
    expect(state.todayState).toMatchObject({ perfect: true, questXp: 22, perfectBonusXp: 6 })
    expect(state.level.totalXp).toBe(63 + 16)
  })

  it('ein verpasster Tag setzt den Bonus zurück; offene Quests zeigen, was eine Erledigung jetzt brächte', () => {
    const completions = [...completeRange(workout, '2026-11-01', '2026-11-05'), ...completeRange(workout, '2026-11-07', '2026-11-08')]
    const data = makeGameData({ habits: [workout], completions })
    expect(statusOf(data, 'workout', '2026-11-06')).toMatchObject({ done: false, xp: 25, streakBonus: 0.25 })
    expect(statusOf(data, 'workout', '2026-11-07')).toMatchObject({ done: true, xp: 20, streakBonus: 0 })
    expect(statusOf(data, 'workout', '2026-11-09')).toMatchObject({ done: false, xp: 22, streakBonus: 0.1 })
    expect(deriveGameState(data, '2026-11-09').todayState.habits[0]).toEqual(statusOf(data, 'workout', '2026-11-09'))
  })

  it('Wochentage: Nicht-Plantage brechen nichts, Erledigungen dort bekommen den Bonus der laufenden Serie', () => {
    const mwf = makeHabit({ ...workout, id: 'mwf', schedule: { type: 'weekdays', days: [1, 3, 5] }, createdDay: '2026-11-02' })
    // Mo 02., Mi 04., Fr 06., Sa 07. (kein Plantag), Mo 09.
    const days = ['2026-11-02', '2026-11-04', '2026-11-06', '2026-11-07', '2026-11-09']
    const data = makeGameData({ habits: [mwf], completions: days.map((day) => makeCompletion(mwf, day)) })
    expect(days.map((day) => getDayState(data, day).questXp)).toEqual([20, 21, 22, 23, 23])
  })

  it('Wochenquests: Bonus nach erfüllten Wochen davor; alle Erledigungen einer Woche gleich', () => {
    const weekly = makeHabit({ ...workout, id: 'weekly', schedule: { type: 'weekly', times: 1 }, createdDay: '2026-11-02', difficulty: 'hard' })
    // KW 45: Mo · KW 46: Di · KW 47: Mo, Mi, Fr – Woche 3 → +10 % für alle drei (44 XP)
    const days = ['2026-11-02', '2026-11-10', '2026-11-16', '2026-11-18', '2026-11-20']
    const data = makeGameData({ habits: [weekly], completions: days.map((day) => makeCompletion(weekly, day)) })
    const state = deriveGameState(data, '2026-11-20')
    expect(days.map((day) => getDayState(data, day).questXp)).toEqual([40, 42, 44, 44, 44])
    expect(state.totals).toMatchObject({ xpFromQuests: 40 + 42 + 3 * 44, xpFromStreakBonus: 2 + 3 * 4 })
    expect(state.todayState.habits[0]).toMatchObject({ streakBonus: 0.1, week: { done: 3, target: 1 } })
    // Eine verpasste Woche (KW 48) setzt zurück
    expect(statusOf(data, 'weekly', '2026-11-30')).toMatchObject({ done: false, streakBonus: 0, xp: 40 })
    expect(statusOf(data, 'weekly', '2026-11-27')).toMatchObject({ streakBonus: 0.15, xp: 46 })
  })

  it('pausierte Tage werden übersprungen (zurückgeholte Quest behält ihre Serie und den Bonus)', () => {
    const paused: Habit = { ...workout, pauses: [{ from: '2026-11-04', until: '2026-11-08' }] }
    const completions = [...completeRange(paused, '2026-11-01', '2026-11-03'), ...completeRange(paused, '2026-11-08', '2026-11-09')]
    const data = makeGameData({ habits: [paused], completions })
    expect(statusOf(data, 'workout', '2026-11-08')).toMatchObject({ xp: 23, streakBonus: 0.15 })
    expect(deriveGameState(data, '2026-11-09').totals.xpFromQuests).toBe(20 + 21 + 22 + 23 + 24)
  })

  it('nutzt die Schwierigkeit der Erledigung (Snapshot) als Basis', () => {
    const completions = [makeCompletion(workout, '2026-11-01'), makeCompletion(workout, '2026-11-02', { difficulty: 'epic' })]
    const data = makeGameData({ habits: [workout], completions })
    expect(deriveGameState(data, '2026-11-02').totals.xpFromQuests).toBe(20 + 84)
    expect(statusOf(data, 'workout', '2026-11-02')).toMatchObject({ xp: 84, baseXp: 80, streakBonus: 0.05 })
    // Unbekannte Schwierigkeit: 0 XP, auch mit Bonus
    const broken = makeGameData({
      habits: [workout],
      completions: [...completions, makeCompletion(workout, '2026-11-03', { difficulty: 'legendary' as Difficulty })],
    })
    expect(deriveGameState(broken, '2026-11-03').totals).toMatchObject({ questsCompleted: 3, xpFromQuests: 104, xpFromStreakBonus: 4 })
  })

  it('Erledigungen vor dem Anlegen oder nach dem Archivieren geben XP ohne neue Serie', () => {
    const archived: Habit = { ...workout, archivedDay: '2026-11-04' }
    const completions = [
      makeCompletion(archived, '2026-10-30'), // vor dem Anlegen: kein Bonus
      ...completeRange(archived, '2026-11-01', '2026-11-04'), // 04. = Archivierungstag: Serie ruht bei 3
      makeCompletion(archived, '2026-11-06'),
    ]
    const state = deriveGameState(makeGameData({ habits: [archived], completions }), '2026-11-06')
    expect(state.totals.xpFromQuests).toBe(20 + 20 + 21 + 22 + 23 + 23)
  })
})

describe('deriveGameState – Nebenquests', () => {
  const taxes = makeSideQuest({ id: 'taxes', title: 'Steuererklärung', difficulty: 'epic', attribute: 'discipline', dueDay: '2026-11-10', order: 3 })
  const dentist = makeSideQuest({ id: 'dentist', title: 'Zahnarzt anrufen', difficulty: 'easy', attribute: 'vitality', dueDay: TODAY, order: 9 })
  const bike = makeSideQuest({ id: 'bike', title: 'Fahrrad reparieren', difficulty: 'hard', attribute: 'strength', dueDay: '2026-11-20', order: 1 })
  const books = makeSideQuest({ id: 'books', title: 'Bücher sortieren', difficulty: 'medium', attribute: 'intellect', order: 2 })
  const attic = makeSideQuest({ id: 'attic', title: 'Dachboden', difficulty: 'medium', attribute: 'wisdom', order: 2 })
  const doneToday = makeSideQuest({ id: 'mail', title: 'Brief', difficulty: 'medium', attribute: 'charisma', doneDay: TODAY, order: 0 })
  const doneEarlier = makeSideQuest({ id: 'old', title: 'Alt', difficulty: 'hard', attribute: 'charisma', doneDay: '2026-11-05', dueDay: '2026-11-01' })
  const doneLater = makeSideQuest({ id: 'future', title: 'Zukunft', difficulty: 'epic', attribute: 'charisma', doneDay: '2026-11-13' })

  it('erledigte Nebenquests geben questXp (ohne Streak-Bonus) an Charakter und Attribut', () => {
    const data = makeGameData({ sideQuests: [taxes, doneToday, doneEarlier, doneLater] })
    const state = deriveGameState(data, TODAY)
    expect(state.totals).toMatchObject({ sideQuestsCompleted: 2, xpFromSideQuests: 20 + 40, xpFromQuests: 0, xpFromStreakBonus: 0 })
    expect(state.attributes.charisma.totalXp).toBe(60)
    expect(state.level.totalXp).toBe(60)
    // Erledigt nach today (zurückgestellte Uhr) zählt noch nicht – und steht als offen in der Liste
    expect(state.sideQuests.find((s) => s.quest.id === 'future')).toMatchObject({ done: false, xp: 80 })
  })

  it('zählen nie für den Perfekten Tag – weder als Pflicht noch für den Bonus', () => {
    const habit = makeHabit({ id: 'h', difficulty: 'easy', createdDay: TODAY })
    const onlySide = deriveGameState(makeGameData({ habits: [habit], sideQuests: [doneToday] }), TODAY)
    expect(onlySide.todayState).toMatchObject({ perfect: false, questXp: 0, perfectBonusXp: 0 })
    const both = deriveGameState(makeGameData({ habits: [habit], completions: [makeCompletion(habit, TODAY)], sideQuests: [doneToday] }), TODAY)
    expect(both.todayState).toMatchObject({ perfect: true, questXp: 10, perfectBonusXp: 3 })
    expect(both.totals).toMatchObject({ perfectDays: 1, xpFromPerfectDays: 3, activeDays: 1 })
  })

  it('Liste: offene (mit Termin nach Termin, dann ohne, jeweils nach order) und danach die heute erledigten', () => {
    const data = makeGameData({ sideQuests: [books, doneToday, bike, doneEarlier, dentist, attic, taxes] })
    const state = deriveGameState(data, TODAY)
    expect(state.sideQuests.map((s) => s.quest.id)).toEqual(['taxes', 'dentist', 'bike', 'books', 'attic', 'mail'])
    // Gleiche order → nach Titel (deutsch): „Bücher“ vor „Dachboden“
    expect(state.sideQuests.map((s) => [s.overdue, s.dueToday, s.done, s.xp])).toEqual([
      [true, false, false, 80],
      [false, true, false, 10],
      [false, false, false, 40],
      [false, false, false, 20],
      [false, false, false, 20],
      [false, false, true, 20],
    ])
  })

  it('kaputte Daten: unbekannte Schwierigkeit 0 XP, unbekanntes Attribut nur Charakter-XP, ungültige Tage offen', () => {
    const odd = [
      makeSideQuest({ id: 'a', difficulty: 'legendary' as Difficulty, doneDay: TODAY }),
      makeSideQuest({ id: 'b', attribute: 'mystery' as AttributeId, doneDay: TODAY }),
      makeSideQuest({ id: 'c', doneDay: 'gestern', dueDay: 'irgendwann' }),
    ]
    const state = deriveGameState(makeGameData({ sideQuests: odd }), TODAY)
    expect(state.totals).toMatchObject({ sideQuestsCompleted: 2, xpFromSideQuests: 20 })
    expect(ATTRIBUTE_IDS.reduce((sum, id) => sum + state.attributes[id].totalXp, 0)).toBe(0)
    expect(state.sideQuests.find((s) => s.quest.id === 'c')).toMatchObject({ done: false, overdue: false, dueToday: false })
  })
})

describe('deriveGameState – Gold', () => {
  const noAchievements = { achievements: [] }

  it('½ Gold pro XP aus allen Quellen, abgerundet – rückwirkend aus dem ganzen Verlauf', () => {
    // 3 Tage täglich (20 + 21 + 22 = 63) + Perfekte Tage (5 + 5 + 6 = 16) + Nebenquest (40) = 119 XP
    const data = makeGameData({
      habits: [workout],
      completions: completeRange(workout, '2026-11-02', '2026-11-04'),
      sideQuests: [makeSideQuest({ id: 's', difficulty: 'hard', doneDay: '2026-11-03' })],
    })
    const state = deriveGameState(data, '2026-11-04', noAchievements)
    expect(BALANCING.goldPerXp).toBe(0.5)
    expect(state.level.totalXp).toBe(119)
    expect(state.gold).toEqual({ fromXp: 59, fromAchievements: 0, earned: 59, spent: 0, lostToDefeats: 0, balance: 59 })
  })

  it('Kapitel- und Kampagnen-XP zählen mit', () => {
    const campaign = makeMainQuest({ id: 'c', chapters: [makeChapter({ id: 'k', criterion: { type: 'manual' }, manualDone: true })] })
    const state = deriveGameState(makeGameData({ mainQuests: [campaign] }), TODAY, noAchievements)
    expect(state.gold.fromXp).toBe((BALANCING.chapterXp + BALANCING.mainQuestXp) / 2)
  })

  it('Ausgaben werden abgezogen; das Guthaben kann nach nachträglichen Änderungen negativ werden', () => {
    const pizza = makeReward({ id: 'pizza', price: 40 })
    const data = makeGameData({
      habits: [workout],
      completions: completeRange(workout, '2026-11-02', '2026-11-04'),
      purchases: [makePurchase({ id: 'p1', day: '2026-11-03' }, pizza), makePurchase({ id: 'p2', day: '2026-11-04' }, pizza)],
    })
    const state = deriveGameState(data, '2026-11-04', noAchievements)
    expect(state.gold).toEqual({ fromXp: 39, fromAchievements: 0, earned: 39, spent: 80, lostToDefeats: 0, balance: -41 })
  })

  it('ungültige Preise zählen nicht; Käufe „nach heute“ bleiben ausgegeben', () => {
    const purchases = [
      makePurchase({ id: 'nan', price: Number.NaN }),
      makePurchase({ id: 'neg', price: -500 }),
      makePurchase({ id: 'later', price: 30, day: '2026-11-20' }),
    ]
    expect(deriveGameState(makeGameData({ purchases }), TODAY, noAchievements).gold).toMatchObject({ spent: 30, balance: -30 })
  })

  it('Gold aus freigeschalteten Erfolgen – nicht in goldFromXp der Kennzahlen (keine Kreisbezüge)', () => {
    const data = makeGameData({ habits: [workout], completions: completeRange(workout, '2026-11-02', '2026-11-04') })
    const achievements = [
      makeAchievement('first', (s) => s.questsCompleted, 1, { goldReward: 25 }),
      makeAchievement('rich', (s) => s.goldFromXp, 39, { goldReward: 75 }),
      makeAchievement('richer', (s) => s.goldFromXp, 40, { goldReward: 200 }),
    ]
    const state = deriveGameState(data, '2026-11-04', { achievements })
    expect(state.achievements.map((a) => [a.definition.id, a.unlocked, a.current])).toEqual([
      ['first', true, 3],
      ['rich', true, 39],
      ['richer', false, 39],
    ])
    expect(state.gold).toEqual({ fromXp: 39, fromAchievements: 100, earned: 139, spent: 0, lostToDefeats: 0, balance: 139 })
  })
})

describe('deriveGameState – Erfolge', () => {
  /** Jede Kennzahl als „Erfolg“ mit unerreichbarem Ziel – so lassen sich die Werte der Engine ablesen. */
  const STAT_KEYS = [
    'questsCompleted',
    'perfectDays',
    'bestDayStreak',
    'bestWeekStreak',
    'activeDays',
    'adventureDay',
    'level',
    'totalXp',
    'chaptersCompleted',
    'campaignsCompleted',
    'activeCampaigns',
    'sideQuestsCompleted',
    'purchases',
    'goldFromXp',
    'comebacks',
  ] as const satisfies readonly (keyof AchievementStats)[]

  function statsOf(data: GameData, today: DayKey) {
    const probes = [
      ...STAT_KEYS.map((key) => makeAchievement(key, (s) => s[key], Number.MAX_SAFE_INTEGER)),
      ...ATTRIBUTE_IDS.map((id) => makeAchievement(`attr-${id}`, (s) => s.attributeLevels[id], Number.MAX_SAFE_INTEGER)),
    ]
    const state = deriveGameState(data, today, { achievements: probes })
    const values = Object.fromEntries(state.achievements.map((a) => [a.definition.id, a.current]))
    return { state, values }
  }

  it('nutzt standardmäßig die Definitionen aus definitions.ts', () => {
    const state = deriveGameState(makeGameData(), TODAY)
    expect(state.achievements.map((a) => a.definition.id)).toEqual(ACHIEVEMENTS.map((a) => a.id))
  })

  it('stellt die Kennzahlen bis einschließlich heute bereit', () => {
    const weekly = makeHabit({ id: 'w', attribute: 'wisdom', schedule: { type: 'weekly', times: 1 }, createdDay: '2026-10-19' })
    const live = makeMainQuest({ id: 'live', chapters: [makeChapter({ id: 'a', criterion: { type: 'manual' }, manualDone: true }), makeChapter({ id: 'b', criterion: { type: 'manual' } })] })
    const mastered = makeMainQuest({ id: 'mastered', chapters: [makeChapter({ id: 'a', criterion: { type: 'manual' }, manualDone: true })] })
    const archived = makeMainQuest({
      id: 'archived',
      archived: true,
      chapters: [makeChapter({ id: 'a', criterion: { type: 'manual' }, manualDone: true }), makeChapter({ id: 'b', criterion: { type: 'manual' }, manualDone: true })],
    })
    const archivedOpen = makeMainQuest({ id: 'archived-open', archived: true, chapters: [makeChapter({ id: 'a', criterion: { type: 'manual' } })] })
    const data = makeGameData({
      profile: { name: 'Lena', avatar: '🧙', createdDay: '2026-10-19' },
      habits: [workout, weekly],
      completions: [
        ...completeRange(workout, '2026-11-02', TODAY), // 11 Tage
        ...['2026-10-19', '2026-10-26', '2026-11-02', '2026-11-09'].map((day) => makeCompletion(weekly, day)),
        makeCompletion(workout, '2026-11-13'), // nach heute
      ],
      mainQuests: [live, mastered, archived, archivedOpen],
      sideQuests: [makeSideQuest({ id: 's', doneDay: '2026-11-01' }), makeSideQuest({ id: 'o' })],
      purchases: [makePurchase({ id: 'p', day: '2026-11-05' }), makePurchase({ id: 'later', day: '2026-11-13' })],
    })
    const { state, values } = statsOf(data, TODAY)
    expect(values).toMatchObject({
      questsCompleted: 15,
      perfectDays: 11,
      bestDayStreak: 11,
      bestWeekStreak: 4,
      activeDays: 13, // 19.10., 26.10., 02.–12.11.
      adventureDay: 25,
      level: state.level.level,
      totalXp: state.level.totalXp,
      chaptersCompleted: 4, // live 1, mastered 1, archived 2 (archivierte zählen mit)
      campaignsCompleted: 2, // mastered, archived
      activeCampaigns: 1, // live (archived-open ist archiviert)
      sideQuestsCompleted: 1,
      purchases: 1, // der Kauf „nach heute“ zählt noch nicht
      goldFromXp: state.gold.fromXp,
      comebacks: 0, // 26.10. → 02.11.: nur 6 Tage Pause
    })
    for (const id of ATTRIBUTE_IDS) expect(values[`attr-${id}`], id).toBe(state.attributes[id].level)
  })

  it('zählt Rückkehren nach ≥ 7 Tagen ohne erledigte Quest (ab dem ersten aktiven Tag)', () => {
    const completions = ['2026-10-01', '2026-10-09', '2026-10-15', '2026-10-30', '2026-11-06'].map((day) => makeCompletion(workout, day))
    // 01. → 09.: 7 Tage Pause ✓ · 09. → 15.: 5 ✗ · 15. → 30.: 14 ✓ · 30. → 06.11.: 6 ✗
    const data = makeGameData({ habits: [{ ...workout, createdDay: '2026-09-01' }], completions })
    expect(statsOf(data, TODAY).values.comebacks).toBe(2)
    // Teilfortschritt ist keine Erledigung
    const partial = makeGameData({
      habits: [{ ...workout, createdDay: '2026-09-01', measure: { target: 10, unit: 'Min' } }],
      completions: [makeCompletion(workout, '2026-10-01', { target: 10, value: 10 }), makeCompletion(workout, '2026-10-05', { target: 10, value: 3 }), makeCompletion(workout, '2026-10-09', { target: 10, value: 10 })],
    })
    expect(statsOf(partial, TODAY).values.comebacks).toBe(1)
  })

  it('einmal freigeschaltet bleibt freigeschaltet – mit dem gespeicherten Tag', () => {
    const achievements = [makeAchievement('three-campaigns', (s) => s.activeCampaigns, 3), makeAchievement('first-quest', (s) => s.questsCompleted, 1)]
    const data = makeGameData({
      habits: [workout],
      completions: [makeCompletion(workout, TODAY)],
      achievementUnlocks: [{ id: 'three-campaigns', day: '2026-10-01' }],
    })
    const state = deriveGameState(data, TODAY, { achievements })
    expect(state.achievements.map((a) => [a.unlocked, a.unlockedDay, a.current])).toEqual([
      [true, '2026-10-01', 0],
      [true, TODAY, 1], // neu erreicht, noch nicht gespeichert → heute
    ])
    expect(state.gold.fromAchievements).toBe(50)
    // Wird die Erledigung wieder entfernt, ist der ungespeicherte Erfolg wieder offen (die App speichert ihn vorher)
    const undone = deriveGameState({ ...data, completions: [] }, TODAY, { achievements })
    expect(undone.achievements.map((a) => a.unlocked)).toEqual([true, false])
  })
})

/** Kleiner Zufallsspielstand: Quests mit Verlauf, Pausen, Archivierungen und Lücken. */
function randomData(random: () => number) {
  const int = (max: number) => Math.floor(random() * (max + 1))
  const pick = <T>(items: readonly T[]): T => items[int(items.length - 1)]
  const schedule = (): Schedule =>
    random() < 0.4 ? { type: 'daily' } : random() < 0.6 ? { type: 'weekdays', days: [pick([1, 2, 3] as const), pick([4, 5, 6] as const)] } : { type: 'weekly', times: 1 + int(2) }
  const base = '2026-09-01'
  const today = addDays(base, 40 + int(40))
  const habits = Array.from({ length: 2 + int(3) }, (_, i) => {
    const createdDay = addDays(base, int(20))
    const habit = makeHabit({ id: `h${i}`, order: i, createdDay, difficulty: pick(DIFFICULTIES), attribute: pick(ATTRIBUTE_IDS), schedule: schedule() })
    // Wie vom Repository gespeichert: Verlaufseinträge entstehen beim Bearbeiten, liegen also nie nach heute.
    const until = addDays(createdDay, 5 + int(30))
    if (random() < 0.5 && until < today) habit.scheduleHistory = [{ until, schedule: schedule() }]
    if (random() < 0.4) {
      const from = addDays(createdDay, int(40))
      habit.pauses = [{ from, until: addDays(from, 1 + int(10)) }]
    }
    return habit
  })
  const completions: Completion[] = []
  for (const habit of habits) {
    const rate = 0.6 + random() * 0.4
    for (const day of dayRange(habit.createdDay, today)) if (random() < rate) completions.push(makeCompletion(habit, day))
  }
  return { data: makeGameData({ habits, completions }), today }
}

describe('deriveGameState – Streak-Bonus ändert durch Bearbeiten nie die Vergangenheit', () => {
  /** Was bis gestern verdient war. */
  const earned = (data: GameData, day: DayKey) => {
    const { totals, level, attributes } = deriveGameState(data, day, { achievements: [] })
    return { totals, totalXp: level.totalXp, attributes: ATTRIBUTE_IDS.map((id) => attributes[id].totalXp) }
  }

  it('Rhythmus ändern, Archivieren und Zurückholen am Tag today lassen today − 1 unverändert (Zufallstest)', () => {
    const random = seededRandom(2_0261_112)
    for (let i = 0; i < 40; i++) {
      const { data, today } = randomData(random)
      const yesterday = addDays(today, -1)
      const before = earned(data, yesterday)
      const target = data.habits[Math.floor(random() * data.habits.length)]
      const replace = (habit: Habit) => ({ ...data, habits: data.habits.map((h) => (h.id === habit.id ? habit : h)) })
      // So, wie das Repository speichert: Verlauf mit until = today, Archivieren ab today, Zurückholen als Pause.
      const edits: [string, GameData][] = [
        ['Rhythmus', replace({ ...target, schedule: { type: 'weekly', times: 2 }, scheduleHistory: [...(target.scheduleHistory ?? []), { until: today, schedule: target.schedule }] })],
        ['Rhythmus täglich', replace({ ...target, schedule: { type: 'daily' }, scheduleHistory: [...(target.scheduleHistory ?? []), { until: today, schedule: target.schedule }] })],
        ['Archivieren', replace({ ...target, archivedDay: today })],
        ['Zurückholen', replace({ ...target, archivedDay: undefined, pauses: [...(target.pauses ?? []), { from: addDays(today, -6), until: today }] })],
      ]
      // Zurückholen setzt eine Archivierung voraus: Vergleichsbasis ist „seit today − 6 archiviert“.
      const archivedEarlier = replace({ ...target, archivedDay: addDays(today, -6) })
      for (const [label, edited] of edits) {
        const reference = label === 'Zurückholen' ? earned(archivedEarlier, yesterday) : before
        expect(earned(edited, yesterday), `Fall #${i}: ${label}`).toEqual(reference)
      }
    }
  })
})

describe('deriveGameState – Laufzeit', () => {
  it('wertet drei Jahre mit zwölf Quests, Nebenquests und Käufen zügig aus', () => {
    const habits: Habit[] = Array.from({ length: 12 }, (_, i) =>
      makeHabit({
        id: `h${i}`,
        order: i,
        createdDay: '2024-01-01',
        difficulty: i % 2 === 0 ? 'easy' : 'medium',
        schedule: i % 3 === 0 ? { type: 'weekly', times: 3 } : i % 3 === 1 ? { type: 'weekdays', days: [1, 3, 5] } : { type: 'daily' },
        // Einige Quests mit Verlauf und Pause, damit auch diese Pfade gemessen werden
        ...(i % 4 === 0
          ? { scheduleHistory: [{ until: '2025-06-01', schedule: { type: 'daily' } as Schedule }], pauses: [{ from: '2025-08-01', until: '2025-08-15' }] }
          : {}),
      }),
    )
    const days = dayRange('2024-01-01', '2026-12-31')
    const completions: Completion[] = []
    for (const habit of habits) for (const day of days) completions.push(makeCompletion(habit, day))
    const data = makeGameData({
      habits,
      completions,
      sideQuests: days.filter((_, i) => i % 3 === 0).map((day, i) => makeSideQuest({ id: `s${i}`, order: i, doneDay: day })),
      purchases: days.filter((_, i) => i % 7 === 0).map((day, i) => makePurchase({ id: `p${i}`, day })),
    })
    deriveGameState(data, '2026-12-31') // Aufwärmen (JIT)
    const started = performance.now()
    const state = deriveGameState(data, '2026-12-31')
    const elapsed = performance.now() - started
    expect(state.totals.questsCompleted).toBe(12 * days.length)
    expect(state.totals.xpFromStreakBonus).toBeGreaterThan(0)
    // Großzügige Grenze gegen quadratische Ausreißer (gemessen: deutlich unter 200 ms)
    expect(elapsed).toBeLessThan(1500)
  })
})
