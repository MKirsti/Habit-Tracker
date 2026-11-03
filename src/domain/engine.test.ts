import { describe, expect, it } from 'vitest'
import { ATTRIBUTE_IDS } from './attributes'
import { BALANCING, DIFFICULTIES } from './balancing'
import { addDays, dayRange, isoWeekday } from './dates'
import { deriveGameState, getDayState } from './engine'
import {
  completeRange,
  makeChapter,
  makeCompletion,
  makeGameData,
  makeHabit,
  makeMainQuest,
  seededRandom,
} from './testing'
import type { AttributeId, Completion, DayKey, Difficulty, GameData, Habit } from './types'

// Kalender-Referenz: 2026-11-02 ist ein Montag, 2026-11-04 ein Mittwoch.

const pushups = makeHabit({
  id: 'pushups',
  title: 'Liegestütze',
  attribute: 'strength',
  difficulty: 'easy', // 10 XP
  order: 1,
  createdDay: '2026-11-02',
})
const reading = makeHabit({
  id: 'reading',
  title: '10 Seiten lesen',
  attribute: 'intellect',
  difficulty: 'medium', // 20 XP
  order: 2,
  createdDay: '2026-11-02',
  schedule: { type: 'weekdays', days: [1, 3, 5] },
  measure: { target: 10, unit: 'Seiten' },
})
const library = makeHabit({
  id: 'library',
  title: 'Bibliothek besuchen',
  attribute: 'wisdom',
  difficulty: 'hard', // 40 XP
  order: 0,
  createdDay: '2026-11-02',
  schedule: { type: 'weekly', times: 2 },
})

/**
 * Basisszenario (today = Mi 2026-11-04):
 * - Mo 02.: Liegestütze ✓, Lesen ✓, Bibliothek ✓ → perfekt, Quest-XP 70, Bonus round(17.5) = 18
 * - Di 03.: Liegestütze ✓ (Lesen nicht fällig)    → perfekt, Quest-XP 10, Bonus round(2.5) = 3
 * - Mi 04.: Liegestütze ✓, Lesen 5/10             → nicht perfekt, Quest-XP 10
 */
function baseData(extra: Partial<GameData> = {}): GameData {
  return makeGameData({
    profile: { name: 'Lena', avatar: '🧙', createdDay: '2026-11-02' },
    habits: [pushups, reading, library],
    completions: [
      makeCompletion(pushups, '2026-11-02'),
      makeCompletion(reading, '2026-11-02'),
      makeCompletion(library, '2026-11-02'),
      makeCompletion(pushups, '2026-11-03'),
      makeCompletion(pushups, '2026-11-04'),
      makeCompletion(reading, '2026-11-04', { value: 5 }),
    ],
    ...extra,
  })
}

describe('deriveGameState – leerer Spielstand', () => {
  it('startet auf Level 1 mit allen Attributen auf Level 1', () => {
    const state = deriveGameState(makeGameData(), '2026-11-03')
    expect(state.today).toBe('2026-11-03')
    expect(state.adventureDay).toBe(1)
    expect(state.level).toEqual({ level: 1, totalXp: 0, xpIntoLevel: 0, xpForNextLevel: 100, progress: 0 })
    expect(state.rank).toBe('Novize')
    expect(Object.keys(state.attributes).sort()).toEqual([...ATTRIBUTE_IDS].sort())
    for (const id of ATTRIBUTE_IDS) {
      expect(state.attributes[id]).toEqual({
        id,
        level: 1,
        totalXp: 0,
        xpIntoLevel: 0,
        xpForNextLevel: 40,
        progress: 0,
      })
    }
    expect(state.totals).toEqual({
      questsCompleted: 0,
      perfectDays: 0,
      bestDayStreak: 0,
      bestWeekStreak: 0,
      activeDays: 0,
      xpFromQuests: 0,
      xpFromPerfectDays: 0,
      xpFromChapters: 0,
    })
    expect(state.todayState).toEqual({
      day: '2026-11-03',
      habits: [],
      requiredCount: 0,
      requiredDone: 0,
      perfect: false,
      questXp: 0,
      perfectBonusXp: 0,
    })
    expect(state.mainQuests).toEqual([])
  })
})

describe('deriveGameState – Basisszenario', () => {
  const state = deriveGameState(baseData(), '2026-11-04')

  it('vergibt Quest-XP nur für erledigte Completions (Teilfortschritt = 0 XP)', () => {
    expect(state.totals.questsCompleted).toBe(5)
    expect(state.totals.xpFromQuests).toBe(3 * 10 + 20 + 40)
  })

  it('vergibt den Perfekter-Tag-Bonus nach Regel 2 (Wochenquests zählen zur Tages-XP)', () => {
    expect(state.totals.perfectDays).toBe(2)
    expect(state.totals.xpFromPerfectDays).toBe(18 + 3)
  })

  it('berechnet Level und Rang aus allen Charakter-XP', () => {
    expect(state.level).toMatchObject({ level: 2, totalXp: 111, xpIntoLevel: 11, xpForNextLevel: 283 })
    expect(state.rank).toBe('Novize')
  })

  it('gibt Attribut-XP ohne Perfekter-Tag-Bonus', () => {
    expect(state.attributes.strength).toMatchObject({ level: 1, totalXp: 30, xpIntoLevel: 30 })
    expect(state.attributes.intellect).toMatchObject({ level: 1, totalXp: 20 })
    expect(state.attributes.wisdom).toMatchObject({ level: 2, totalXp: 40, xpIntoLevel: 0 })
    expect(state.attributes.charisma).toMatchObject({ level: 1, totalXp: 0 })
  })

  it('zählt aktive Tage und beste Streaks getrennt nach Einheit', () => {
    expect(state.totals.activeDays).toBe(3)
    expect(state.totals.bestDayStreak).toBe(3)
    expect(state.totals.bestWeekStreak).toBe(0)
  })

  it('berechnet den Abenteuertag', () => {
    expect(state.adventureDay).toBe(3)
  })

  it('liefert den heutigen Tageszustand', () => {
    const today = state.todayState
    expect(today.day).toBe('2026-11-04')
    expect(today.habits.map((s) => s.habit.id)).toEqual(['library', 'pushups', 'reading'])
    expect(today.requiredCount).toBe(2)
    expect(today.requiredDone).toBe(1)
    expect(today.perfect).toBe(false)
    expect(today.questXp).toBe(10)
    expect(today.perfectBonusXp).toBe(0)

    const [lib, push, read] = today.habits
    expect(lib).toEqual({
      habit: library,
      required: false,
      value: 0,
      target: 1,
      done: false,
      streak: { current: 0, best: 0, unit: 'week' },
      week: { done: 1, target: 2 },
      xp: 40,
    })
    expect(push).toMatchObject({ required: true, value: 1, target: 1, done: true, xp: 10 })
    expect(push.streak).toEqual({ current: 3, best: 3, unit: 'day' })
    expect(push.week).toBeUndefined()
    expect(read).toMatchObject({ required: true, value: 5, target: 10, done: false, xp: 20 })
    expect(read.completion).toMatchObject({ habitId: 'reading', day: '2026-11-04', value: 5 })
    // Offener Mittwoch bricht den Montag-Streak nicht
    expect(read.streak).toEqual({ current: 1, best: 1, unit: 'day' })
  })

  it('todayState entspricht getDayState(data, today)', () => {
    expect(state.todayState).toEqual(getDayState(baseData(), '2026-11-04'))
  })
})

describe('deriveGameState – XP-Regeln im Detail', () => {
  it('nutzt die Snapshots der Completion (Schwierigkeit, Attribut, Ziel)', () => {
    const habit = makeHabit({
      id: 'h',
      difficulty: 'easy',
      attribute: 'strength',
      createdDay: '2026-11-01',
      schedule: { type: 'weekly', times: 1 },
      measure: { target: 10, unit: 'Min' },
    })
    const data = makeGameData({
      habits: [habit],
      completions: [
        makeCompletion(habit, '2026-11-03', { difficulty: 'epic', attribute: 'charisma', value: 5, target: 5 }),
      ],
    })
    const state = deriveGameState(data, '2026-11-03')
    expect(state.totals.xpFromQuests).toBe(80)
    expect(state.attributes.charisma.totalXp).toBe(80)
    expect(state.attributes.strength.totalXp).toBe(0)
    // Status zeigt Snapshot-Ziel und die XP der *aktuellen* Schwierigkeit
    expect(state.todayState.habits[0]).toMatchObject({ value: 5, target: 5, done: true, xp: 10 })
  })

  it('ignoriert Completions gelöschter Quests überall', () => {
    const ghost = makeHabit({ id: 'ghost', difficulty: 'epic', createdDay: '2026-11-01' })
    const data = baseData()
    data.completions.push(...completeRange(ghost, '2026-11-01', '2026-11-04'))
    const state = deriveGameState(data, '2026-11-04')
    expect(state.totals).toMatchObject({
      questsCompleted: 5,
      xpFromQuests: 90,
      activeDays: 3,
      perfectDays: 2,
      xpFromPerfectDays: 21,
    })
  })

  it('ignoriert Completions nach today überall', () => {
    const data = baseData()
    data.completions.push(
      makeCompletion(library, '2026-11-05'),
      makeCompletion(pushups, '2026-11-05'),
      makeCompletion(reading, '2026-11-06'),
      makeCompletion(pushups, '2026-11-06'),
    )
    const state = deriveGameState(data, '2026-11-04')
    expect(state.totals).toMatchObject({ questsCompleted: 5, xpFromQuests: 90, activeDays: 3, perfectDays: 2 })
    expect(state.totals.bestDayStreak).toBe(3)
    // Die Bibliothek wurde "morgen" ein zweites Mal besucht – zählt heute noch nicht zur Woche
    const lib = state.todayState.habits.find((s) => s.habit.id === 'library')
    expect(lib?.week).toEqual({ done: 1, target: 2 })
    expect(state.todayState).toEqual(deriveGameState(baseData(), '2026-11-04').todayState)
  })

  it('ein Tag nur mit Wochenquests ist nie perfekt (keine Pflicht-Quest)', () => {
    const data = makeGameData({ habits: [library], completions: [makeCompletion(library, '2026-11-03')] })
    const state = deriveGameState(data, '2026-11-03')
    expect(state.totals.perfectDays).toBe(0)
    expect(state.todayState.requiredCount).toBe(0)
    expect(state.todayState.perfect).toBe(false)
  })

  it('eine nicht erledigte Wochenquest verhindert den Perfekten Tag nicht', () => {
    const data = makeGameData({ habits: [pushups, library], completions: [makeCompletion(pushups, '2026-11-03')] })
    const state = deriveGameState(data, '2026-11-03')
    expect(state.todayState).toMatchObject({ requiredCount: 1, requiredDone: 1, perfect: true, perfectBonusXp: 3 })
    expect(state.totals.perfectDays).toBe(1)
  })

  it('Quests an Nicht-Plantagen sind keine Pflicht, geben aber XP', () => {
    // Lesen ist am Dienstag nicht fällig – trotzdem erledigt
    const data = makeGameData({
      habits: [pushups, reading],
      completions: [makeCompletion(pushups, '2026-11-03'), makeCompletion(reading, '2026-11-03')],
    })
    const state = deriveGameState(data, '2026-11-03')
    expect(state.todayState.habits.map((s) => s.habit.id)).toEqual(['pushups'])
    expect(state.todayState).toMatchObject({ requiredCount: 1, perfect: true, questXp: 30, perfectBonusXp: 8 })
  })

  it('archivierte Quests behalten ihre XP, sind ab archivedDay aber keine Pflicht mehr', () => {
    const old = makeHabit({ id: 'old', difficulty: 'hard', createdDay: '2026-11-01', archivedDay: '2026-11-03' })
    const data = makeGameData({
      habits: [pushups, old],
      completions: [
        makeCompletion(old, '2026-11-02'),
        makeCompletion(pushups, '2026-11-02'),
        makeCompletion(pushups, '2026-11-03'),
      ],
    })
    const state = deriveGameState(data, '2026-11-03')
    expect(state.totals.xpFromQuests).toBe(40 + 10 + 10)
    // 02.: beide fällig & erledigt (Bonus round(12.5) = 13) · 03.: nur Liegestütze fällig (Bonus 3)
    expect(state.totals.perfectDays).toBe(2)
    expect(state.totals.xpFromPerfectDays).toBe(13 + 3)
    expect(state.todayState.habits.map((s) => s.habit.id)).toEqual(['pushups'])
    expect(state.totals.bestDayStreak).toBe(2)
  })

  it('findet Perfekte Tage auch vor profile.createdDay (früheste Completion zählt)', () => {
    const data = makeGameData({
      profile: { name: 'Lena', avatar: '🧙', createdDay: '2026-11-04' },
      habits: [pushups],
      completions: [makeCompletion(pushups, '2026-11-02')],
    })
    expect(deriveGameState(data, '2026-11-04').totals.perfectDays).toBe(1)
  })

  it('ein fehlender Pflicht-Haken verhindert den Perfekten Tag', () => {
    const data = makeGameData({
      habits: [pushups, reading],
      completions: [makeCompletion(pushups, '2026-11-02'), makeCompletion(reading, '2026-11-02', { value: 9 })],
    })
    const state = deriveGameState(data, '2026-11-02')
    expect(state.todayState).toMatchObject({ requiredCount: 2, requiredDone: 1, perfect: false, perfectBonusXp: 0 })
    expect(state.totals.perfectDays).toBe(0)
  })

  it('steigt bei genau 100 XP auf Level 2', () => {
    const habit = makeHabit({ id: 'w', createdDay: '2026-11-01', schedule: { type: 'weekly', times: 7 } })
    const data = makeGameData({ habits: [habit], completions: completeRange(habit, '2026-11-01', '2026-11-05') })
    const state = deriveGameState(data, '2026-11-05')
    expect(state.totals.xpFromQuests).toBe(100)
    expect(state.totals.xpFromPerfectDays).toBe(0)
    expect(state.level).toMatchObject({ level: 2, xpIntoLevel: 0, progress: 0 })
  })

  it('wertet doppelte Completions eines Tages nur einmal (die zuletzt geänderte gewinnt)', () => {
    const data = makeGameData({
      habits: [reading],
      completions: [
        makeCompletion(reading, '2026-11-02', { value: 3, updatedAt: 2 }),
        makeCompletion(reading, '2026-11-02', { value: 10, updatedAt: 1 }),
      ],
    })
    const state = deriveGameState(data, '2026-11-02')
    expect(state.totals.questsCompleted).toBe(0)
    expect(state.todayState.habits[0]).toMatchObject({ value: 3, done: false })
  })

  it('eine Completion mit unbekannter Schwierigkeit vergiftet den Spielstand nicht (kein NaN)', () => {
    // Z. B. Daten einer neueren App-Version oder eine von Hand bearbeitete Datenbank
    const data = baseData()
    data.completions.push(makeCompletion(library, '2026-11-03', { difficulty: 'legendary' as Difficulty }))
    const state = deriveGameState(data, '2026-11-04')
    // Zählt als erledigt, gibt aber 0 XP – alle anderen Werte bleiben wie im Basisszenario
    expect(state.totals).toMatchObject({ questsCompleted: 6, xpFromQuests: 90, xpFromPerfectDays: 21 })
    expect(state.level).toMatchObject({ level: 2, totalXp: 111 })
    expect(state.attributes.wisdom.totalXp).toBe(40)
    expect(getDayState(data, '2026-11-03')).toMatchObject({ questXp: 10, perfectBonusXp: 3 })
  })

  it('wertet aufaddierte Kommawerte als erledigt (10 × 0,2 L bei Ziel 2 L)', () => {
    const water = makeHabit({
      id: 'water',
      difficulty: 'easy',
      attribute: 'vitality',
      createdDay: '2026-11-03',
      measure: { target: 2, unit: 'L' },
    })
    let liters = 0
    for (let i = 0; i < 10; i++) liters += 0.2
    const data = makeGameData({ habits: [water], completions: [makeCompletion(water, '2026-11-03', { value: liters })] })
    const state = deriveGameState(data, '2026-11-03')
    expect(state.todayState.habits[0]).toMatchObject({ done: true, streak: { current: 1, best: 1, unit: 'day' } })
    expect(state.todayState).toMatchObject({ perfect: true, questXp: 10, perfectBonusXp: 3 })
    expect(state.attributes.vitality.totalXp).toBe(10)
  })

  it('der Abenteuertag ist nie kleiner als 1', () => {
    const data = makeGameData({ profile: { name: 'Lena', avatar: '🧙', createdDay: '2026-11-10' } })
    expect(deriveGameState(data, '2026-11-10').adventureDay).toBe(1)
    expect(deriveGameState(data, '2026-11-08').adventureDay).toBe(1)
    expect(deriveGameState(data, '2027-11-10').adventureDay).toBe(366)
  })

  it('beste Wochen-Streaks fließen in bestWeekStreak', () => {
    const weekly = makeHabit({ id: 'w', createdDay: '2026-11-02', schedule: { type: 'weekly', times: 1 } })
    const data = makeGameData({
      habits: [weekly],
      completions: ['2026-11-02', '2026-11-09', '2026-11-16'].map((day) => makeCompletion(weekly, day)),
    })
    expect(deriveGameState(data, '2026-11-18').totals).toMatchObject({ bestWeekStreak: 3, bestDayStreak: 0 })
  })
})

describe('deriveGameState – Kampagnen', () => {
  const campaign = makeMainQuest({
    id: 'scholar',
    title: 'Der Weg des Gelehrten',
    startDay: '2026-11-02',
    deadline: '2026-12-31',
    chapters: [
      makeChapter({ id: 'c1', criterion: { type: 'manual' }, manualDone: true, completedDay: '2026-11-02' }),
      makeChapter({
        id: 'c2',
        criterion: { type: 'habit', habitId: 'pushups', metric: 'completions', target: 3 },
      }),
      makeChapter({ id: 'c3', criterion: { type: 'counter', target: 4, label: 'Bücher' }, counter: 1 }),
    ],
  })
  const linkedReading: Habit = { ...reading, mainQuestId: 'scholar' }

  it('wertet Kapitel aus und vergibt chapterXp je abgeschlossenem Kapitel', () => {
    const state = deriveGameState(baseData({ habits: [pushups, linkedReading, library], mainQuests: [campaign] }), '2026-11-04')
    expect(state.mainQuests).toHaveLength(1)
    const [quest] = state.mainQuests
    expect(quest.quest).toBe(campaign)
    expect(quest.chapters.map((c) => c.done)).toEqual([true, true, false])
    expect(quest.chapters[1].doneDay).toBe('2026-11-04')
    expect(quest.progress).toBeCloseTo((1 + 1 + 0.25) / 3, 10)
    expect(quest.currentChapterIndex).toBe(2)
    expect(quest.complete).toBe(false)
    expect(quest.daysLeft).toBe(57)
    expect(quest.linkedHabitIds).toEqual(['reading'])
    expect(state.totals.xpFromChapters).toBe(2 * BALANCING.chapterXp)
    expect(state.level.totalXp).toBe(90 + 21 + 200)
  })

  it('vergibt mainQuestXp für eine komplett abgeschlossene Kampagne', () => {
    const done = {
      ...campaign,
      chapters: campaign.chapters.map((c) => (c.id === 'c3' ? { ...c, counter: 4 } : c)),
    }
    const state = deriveGameState(baseData({ mainQuests: [done] }), '2026-11-04')
    expect(state.mainQuests[0]).toMatchObject({ complete: true, currentChapterIndex: -1, progress: 1 })
    expect(state.totals.xpFromChapters).toBe(3 * BALANCING.chapterXp + BALANCING.mainQuestXp)
  })

  it('archivierte Kampagnen zählen für XP, erscheinen aber nicht in mainQuests', () => {
    const archived = makeMainQuest({
      id: 'old',
      archived: true,
      chapters: [makeChapter({ id: 'a', criterion: { type: 'manual' }, manualDone: true })],
    })
    const empty = makeMainQuest({ id: 'empty', title: 'Leer' })
    const state = deriveGameState(baseData({ mainQuests: [empty, archived, campaign] }), '2026-11-04')
    expect(state.mainQuests.map((q) => q.quest.id)).toEqual(['empty', 'scholar'])
    expect(state.totals.xpFromChapters).toBe(
      BALANCING.chapterXp + BALANCING.mainQuestXp + 2 * BALANCING.chapterXp,
    )
  })

  it('eine Kampagne ohne Kapitel ist nie abgeschlossen und hat keinen Fortschritt', () => {
    const empty = makeMainQuest({ id: 'empty' })
    const [state] = deriveGameState(baseData({ mainQuests: [empty] }), '2026-11-04').mainQuests
    expect(state).toMatchObject({ progress: 0, complete: false, currentChapterIndex: -1, linkedHabitIds: [] })
    expect(state.daysLeft).toBeUndefined()
  })

  it('negative daysLeft bei überschrittener Deadline', () => {
    const late = makeMainQuest({ id: 'late', deadline: '2026-11-01' })
    expect(deriveGameState(baseData({ mainQuests: [late] }), '2026-11-04').mainQuests[0].daysLeft).toBe(-3)
  })

  it('Kapitel einer gelöschten Quest sind kaputte Referenzen und geben keine XP', () => {
    const broken = makeMainQuest({
      id: 'b',
      chapters: [makeChapter({ id: 'x', criterion: { type: 'habit', habitId: 'weg', metric: 'total', target: 1 } })],
    })
    const state = deriveGameState(baseData({ mainQuests: [broken] }), '2026-11-04')
    expect(state.mainQuests[0].chapters[0]).toMatchObject({ brokenReference: true, done: false })
    expect(state.totals.xpFromChapters).toBe(0)
  })

  it('Habit-Kapitel ignorieren Completions nach today', () => {
    const quest = makeMainQuest({
      id: 'q',
      startDay: '2026-11-01',
      chapters: [
        makeChapter({ id: 'c', criterion: { type: 'habit', habitId: 'pushups', metric: 'completions', target: 4 } }),
      ],
    })
    const data = baseData({ mainQuests: [quest] })
    data.completions.push(makeCompletion(pushups, '2026-11-05'))
    const state = deriveGameState(data, '2026-11-04')
    expect(state.mainQuests[0].chapters[0]).toMatchObject({ current: 3, done: false })
  })
})

describe('getDayState', () => {
  it('sortiert nach order, dann nach Titel (deutsch)', () => {
    const habits = [
      makeHabit({ id: 'z', title: 'Zähne putzen', order: 2 }),
      makeHabit({ id: 'b', title: 'Bett machen', order: 1 }),
      makeHabit({ id: 'a', title: 'Äpfel essen', order: 1 }),
      makeHabit({ id: 'first', title: 'Wasser', order: 0 }),
    ]
    const state = getDayState(makeGameData({ habits }), '2026-11-03')
    expect(state.habits.map((s) => s.habit.id)).toEqual(['first', 'a', 'b', 'z'])
  })

  it('zeigt nur an diesem Tag sichtbare Quests', () => {
    const later = makeHabit({ id: 'later', createdDay: '2026-11-05' })
    const gone = makeHabit({ id: 'gone', createdDay: '2026-10-01', archivedDay: '2026-11-03' })
    const data = makeGameData({ habits: [pushups, reading, library, later, gone] })
    expect(getDayState(data, '2026-11-03').habits.map((s) => s.habit.id)).toEqual(['library', 'pushups'])
    // Montag: alles Fällige inkl. der erst ab 03.11. archivierten Quest ('gone' hat order 0, Titel "Quest gone")
    expect(getDayState(data, '2026-11-02').habits.map((s) => s.habit.id)).toEqual([
      'library',
      'gone',
      'pushups',
      'reading',
    ])
    expect(getDayState(data, '2026-11-01').habits.map((s) => s.habit.id)).toEqual(['gone'])
  })

  it('berechnet Streaks zum Stichtag des angefragten Tages', () => {
    const data = makeGameData({ habits: [pushups], completions: completeRange(pushups, '2026-11-02', '2026-11-08') })
    expect(getDayState(data, '2026-11-04').habits[0].streak).toEqual({ current: 3, best: 3, unit: 'day' })
    expect(getDayState(data, '2026-11-08').habits[0].streak).toEqual({ current: 7, best: 7, unit: 'day' })
  })

  it('nutzt ohne Completion das aktuelle Ziel der Quest', () => {
    const state = getDayState(makeGameData({ habits: [reading] }), '2026-11-02')
    expect(state.habits[0]).toMatchObject({ value: 0, target: 10, done: false, required: true })
    expect(state.habits[0].completion).toBeUndefined()
  })

  it('zählt den Wochenfortschritt über die ISO-Woche des Tages (inkl. Jahreswechsel)', () => {
    const weekly = makeHabit({ id: 'w', createdDay: '2026-12-01', schedule: { type: 'weekly', times: 3 } })
    const data = makeGameData({
      habits: [weekly],
      completions: ['2026-12-27', '2026-12-29', '2027-01-01', '2027-01-04'].map((day) => makeCompletion(weekly, day)),
    })
    expect(getDayState(data, '2026-12-30').habits[0].week).toEqual({ done: 2, target: 3 })
  })

  it('perfekter Tag inkl. Bonus über getDayState', () => {
    const state = getDayState(baseData(), '2026-11-02')
    expect(state).toMatchObject({ requiredCount: 2, requiredDone: 2, perfect: true, questXp: 70, perfectBonusXp: 18 })
  })

  it('ignoriert Completions gelöschter Quests', () => {
    const ghost = makeHabit({ id: 'ghost', difficulty: 'epic' })
    const data = makeGameData({ habits: [pushups], completions: [makeCompletion(ghost, '2026-11-03')] })
    expect(getDayState(data, '2026-11-03')).toMatchObject({ questXp: 0, requiredDone: 0, perfect: false })
  })
})

describe('deriveGameState – Eingabereihenfolge', () => {
  it('liefert für beliebig sortierte Completions dasselbe Ergebnis', () => {
    const quest = makeMainQuest({
      id: 'q',
      startDay: '2026-11-02',
      chapters: [
        makeChapter({ id: 'c', criterion: { type: 'habit', habitId: 'pushups', metric: 'completions', target: 2 } }),
      ],
    })
    const sorted = baseData({ mainQuests: [quest] })
    const reversed = { ...sorted, completions: [...sorted.completions].reverse() }
    const expected = deriveGameState(sorted, '2026-11-04')
    expect(deriveGameState(reversed, '2026-11-04')).toEqual(expected)
    expect(expected.mainQuests[0].chapters[0].doneDay).toBe('2026-11-03')
  })
})

/**
 * Referenzmodell der XP-Regeln 1 + 2, wörtlich nach docs/ARCHITECTURE.md: Perfekte Tage werden Tag für
 * Tag über den *gesamten* Zeitraum (frühester Completion-Tag bzw. profile.createdDay bis today) gesucht –
 * unabhängig von der Optimierung der Engine, die nur Tage mit Completions betrachtet.
 */
function referenceXp(data: GameData, today: DayKey) {
  const habitIds = new Set(data.habits.map((h) => h.id))
  const relevant = data.completions.filter((c) => habitIds.has(c.habitId) && c.day <= today)
  const doneOn = new Map<DayKey, Completion[]>()
  for (const c of relevant) if (c.value >= c.target) doneOn.set(c.day, [...(doneOn.get(c.day) ?? []), c])

  const attributeXp = Object.fromEntries(ATTRIBUTE_IDS.map((id) => [id, 0])) as Record<AttributeId, number>
  let xpFromQuests = 0
  for (const c of relevant.filter((c) => c.value >= c.target)) {
    xpFromQuests += BALANCING.questXp[c.difficulty]
    attributeXp[c.attribute] += BALANCING.questXp[c.difficulty]
  }

  const starts = [...relevant.map((c) => c.day), ...(data.profile ? [data.profile.createdDay] : [])].sort()
  let perfectDays = 0
  let xpFromPerfectDays = 0
  for (const day of starts.length > 0 ? dayRange(starts[0], today) : []) {
    const done = doneOn.get(day) ?? []
    const required = data.habits.filter(
      (h) =>
        h.createdDay <= day &&
        (h.archivedDay === undefined || day < h.archivedDay) &&
        (h.schedule.type === 'daily' || (h.schedule.type === 'weekdays' && h.schedule.days.includes(isoWeekday(day)))),
    )
    if (required.length > 0 && required.every((h) => done.some((c) => c.habitId === h.id))) {
      perfectDays++
      xpFromPerfectDays += Math.round(
        BALANCING.perfectDayBonus * done.reduce((sum, c) => sum + BALANCING.questXp[c.difficulty], 0),
      )
    }
  }
  return {
    questsCompleted: [...doneOn.values()].reduce((sum, list) => sum + list.length, 0),
    activeDays: doneOn.size,
    xpFromQuests,
    perfectDays,
    xpFromPerfectDays,
    attributeXp,
  }
}

/** Zufälliger Spielstand: verschiedene Rhythmen, Archivierungen, Teilfortschritte, gelöschte Quests, Zukunft. */
function randomGameData(random: () => number): { data: GameData; today: DayKey } {
  const int = (max: number) => Math.floor(random() * (max + 1))
  const pick = <T>(items: readonly T[]): T => items[int(items.length - 1)]
  const base = '2026-09-01'
  const today = addDays(base, 40 + int(60))
  const habits: Habit[] = Array.from({ length: 2 + int(5) }, (_, i) => {
    const createdDay = addDays(base, int(50))
    const kind = random()
    return makeHabit({
      id: `h${i}`,
      order: int(3),
      difficulty: pick(DIFFICULTIES),
      attribute: pick(ATTRIBUTE_IDS),
      createdDay,
      archivedDay: random() < 0.25 ? addDays(createdDay, 1 + int(60)) : undefined,
      measure: random() < 0.3 ? { target: 1 + int(9), unit: 'Seiten' } : undefined,
      schedule:
        kind < 0.4
          ? { type: 'daily' }
          : kind < 0.75
            ? { type: 'weekdays', days: [pick([1, 2, 3] as const), pick([4, 5, 6, 7] as const)] }
            : { type: 'weekly', times: 1 + int(3) },
    })
  })
  const ghost = makeHabit({ id: 'geloescht', difficulty: 'epic' })
  const completions: Completion[] = []
  for (const habit of [...habits, ghost]) {
    const rate = 0.6 + random() * 0.4
    for (const day of dayRange(addDays(base, -5), addDays(today, 5))) {
      if (random() > rate) continue
      const target = habit.measure?.target ?? 1
      const partial = habit.measure !== undefined && random() < 0.2
      completions.push(
        makeCompletion(habit, day, {
          value: partial ? target - 1 : target + int(2) * (habit.measure ? 1 : 0),
          // Gelegentlich bearbeitete Quests: Snapshot weicht von der aktuellen Quest ab
          ...(random() < 0.1 ? { difficulty: pick(DIFFICULTIES), attribute: pick(ATTRIBUTE_IDS) } : {}),
        }),
      )
    }
  }
  // Reihenfolge der Completions zufällig (wie aus einem Import)
  completions.sort(() => random() - 0.5)
  const profile = random() < 0.8 ? { name: 'Lena', avatar: '🧙', createdDay: addDays(base, int(30)) } : undefined
  return { data: makeGameData({ profile, habits, completions }), today }
}

describe('deriveGameState – Referenzmodell (Zufallstests)', () => {
  it('stimmt bei XP, Attributen und Perfekten Tagen mit der wörtlichen Regelumsetzung überein', () => {
    const random = seededRandom(1103)
    for (let i = 0; i < 40; i++) {
      const { data, today } = randomGameData(random)
      const expected = referenceXp(data, today)
      const state = deriveGameState(data, today)
      const label = `Fall #${i}, today ${today}`
      expect(state.totals, label).toMatchObject({
        questsCompleted: expected.questsCompleted,
        activeDays: expected.activeDays,
        xpFromQuests: expected.xpFromQuests,
        perfectDays: expected.perfectDays,
        xpFromPerfectDays: expected.xpFromPerfectDays,
        xpFromChapters: 0,
      })
      expect(state.level.totalXp, label).toBe(expected.xpFromQuests + expected.xpFromPerfectDays)
      for (const id of ATTRIBUTE_IDS) expect(state.attributes[id].totalXp, `${label}, ${id}`).toBe(expected.attributeXp[id])
    }
  })

  it('getDayState zeigt für jeden Tag dieselben Pflicht-, Perfekt- und XP-Werte wie die Gesamtrechnung', () => {
    const random = seededRandom(77)
    for (let i = 0; i < 5; i++) {
      const { data, today } = randomGameData(random)
      let perfectDays = 0
      let bonus = 0
      for (const day of dayRange('2026-08-01', today)) {
        const dayState = getDayState(data, day)
        expect(dayState.requiredCount, day).toBe(dayState.habits.filter((s) => s.required).length)
        expect(dayState.requiredDone, day).toBe(dayState.habits.filter((s) => s.required && s.done).length)
        if (dayState.perfect) perfectDays++
        bonus += dayState.perfectBonusXp
      }
      expect(deriveGameState(data, today).totals, `Fall #${i}`).toMatchObject({
        perfectDays,
        xpFromPerfectDays: bonus,
      })
    }
  })
})

describe('deriveGameState – große Datenmengen', () => {
  it('wertet drei Jahre mit zwölf Quests zügig und korrekt aus', () => {
    const habits: Habit[] = Array.from({ length: 12 }, (_, i) =>
      makeHabit({
        id: `h${i}`,
        order: i,
        createdDay: '2024-01-01',
        difficulty: i % 2 === 0 ? 'easy' : 'medium',
        schedule: i % 3 === 0 ? { type: 'weekly', times: 3 } : i % 3 === 1 ? { type: 'weekdays', days: [1, 3, 5] } : { type: 'daily' },
      }),
    )
    const days = dayRange('2024-01-01', '2026-12-31')
    const completions: Completion[] = []
    for (const habit of habits) {
      for (const day of days) completions.push(makeCompletion(habit, day))
    }
    const state = deriveGameState(makeGameData({ habits, completions }), '2026-12-31')
    expect(state.totals.questsCompleted).toBe(12 * days.length)
    expect(state.totals.activeDays).toBe(days.length)
    expect(state.totals.perfectDays).toBe(days.length)
    expect(state.totals.bestDayStreak).toBe(days.length) // daily quests
    expect(state.totals.bestWeekStreak).toBeGreaterThan(150)
  })
})
