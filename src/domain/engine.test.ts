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
import type { AttributeId, Completion, DayKey, Difficulty, GameData, Habit, Schedule } from './types'

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
    // Status zeigt Snapshot-Ziel und – erledigt – die tatsächlich gutgeschriebenen XP (Snapshot-Schwierigkeit)
    expect(state.todayState.habits[0]).toMatchObject({ value: 5, target: 5, done: true, xp: 80 })
  })

  it('zeigt für offene Quests die XP der aktuellen Schwierigkeit (auch bei Teilfortschritt)', () => {
    const habit = makeHabit({ id: 'h', difficulty: 'hard', createdDay: '2026-11-01', measure: { target: 10, unit: 'Min' } })
    const data = makeGameData({
      habits: [habit],
      completions: [
        makeCompletion(habit, '2026-11-02', { difficulty: 'easy' }),
        makeCompletion(habit, '2026-11-03', { difficulty: 'easy', value: 4 }),
      ],
    })
    // Heute offen: eine Erledigung brächte jetzt 40 XP. Gestern erledigt: gutgeschrieben wurden 10 XP.
    expect(deriveGameState(data, '2026-11-03').todayState.habits[0]).toMatchObject({ done: false, xp: 40 })
    expect(getDayState(data, '2026-11-02').habits[0]).toMatchObject({ done: true, xp: 10 })
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
    // Verknüpft (reading) plus von einem Kapitel referenziert (pushups), sortiert nach order.
    expect(quest.linkedHabitIds).toEqual(['pushups', 'reading'])
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

  it('archivierte Kampagnen stehen (gleich ausgewertet) in archivedMainQuests', () => {
    const archivedScholar = { ...campaign, id: 'scholar-old', archived: true }
    const second = makeMainQuest({ id: 'old-2', archived: true })
    const data = baseData({
      habits: [pushups, { ...reading, mainQuestId: 'scholar-old' }, library],
      mainQuests: [second, campaign, archivedScholar],
    })
    const state = deriveGameState(data, '2026-11-04')
    expect(state.mainQuests.map((q) => q.quest.id)).toEqual(['scholar'])
    expect(state.archivedMainQuests.map((q) => q.quest.id)).toEqual(['old-2', 'scholar-old'])
    const [, archivedState] = state.archivedMainQuests
    const [activeState] = state.mainQuests
    // Gleiche Kapitel → gleiche Auswertung wie eine aktive Kampagne.
    expect(archivedState.chapters.map((c) => [c.done, c.current, c.doneDay])).toEqual(
      activeState.chapters.map((c) => [c.done, c.current, c.doneDay]),
    )
    expect(archivedState).toMatchObject({ progress: activeState.progress, complete: false, daysLeft: 57 })
    expect(archivedState.linkedHabitIds).toEqual(['pushups', 'reading'])
    // Ohne archivierte Kampagnen ist die Liste leer.
    expect(deriveGameState(baseData(), '2026-11-04').archivedMainQuests).toEqual([])
  })

  it('linkedHabitIds: verknüpfte plus von Kapiteln referenzierte Quests, ohne Doppelte und fehlende, nach order', () => {
    const shared = makeMainQuest({
      id: 'shared',
      chapters: [
        // library (order 0) gehört einer anderen Kampagne, wird hier aber von Kapiteln genutzt – zweimal.
        makeChapter({ id: 'k1', criterion: { type: 'habit', habitId: 'library', metric: 'completions', target: 3 } }),
        makeChapter({ id: 'k2', criterion: { type: 'habit', habitId: 'library', metric: 'streak', target: 2 } }),
        // reading ist verknüpft UND referenziert → nur einmal.
        makeChapter({ id: 'k3', criterion: { type: 'habit', habitId: 'reading', metric: 'total', target: 30 } }),
        // gelöschte Quest → nicht enthalten.
        makeChapter({ id: 'k4', criterion: { type: 'habit', habitId: 'weg', metric: 'total', target: 1 } }),
        makeChapter({ id: 'k5', criterion: { type: 'manual' } }),
      ],
    })
    const archivedPushups = { ...pushups, mainQuestId: 'shared', archivedDay: '2026-11-03' }
    const data = baseData({
      habits: [{ ...reading, mainQuestId: 'shared' }, archivedPushups, { ...library, mainQuestId: 'other' }],
      mainQuests: [shared, makeMainQuest({ id: 'other' })],
    })
    const state = deriveGameState(data, '2026-11-04')
    expect(state.mainQuests[0].linkedHabitIds).toEqual(['library', 'pushups', 'reading'])
    expect(state.mainQuests[1].linkedHabitIds).toEqual(['library'])
  })

  it('linkedHabitIds: mitbenutzte Quests (sharedHabitIds) zählen dazu, fehlende nicht', () => {
    const user = makeMainQuest({ id: 'user', sharedHabitIds: ['library', 'weg', 'library'] })
    const owner = makeMainQuest({ id: 'owner' })
    const data = baseData({
      habits: [pushups, { ...library, mainQuestId: 'owner' }, { ...reading, mainQuestId: 'user' }],
      mainQuests: [owner, user],
    })
    const state = deriveGameState(data, '2026-11-04')
    expect(state.mainQuests.map((q) => q.linkedHabitIds)).toEqual([['library'], ['library', 'reading']])
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

describe('deriveGameState – Bearbeiten ändert die Vergangenheit nicht', () => {
  // Zwei Wochen: Liegestütze (täglich, easy) jeden Tag, Bibliothek (2× pro Woche, hard) Di + Do.
  // Heute (Mo 16.11.) ist beides erledigt.
  const library2 = makeHabit({ ...library, schedule: { type: 'weekly', times: 2 } })
  const twoWeeks = makeGameData({
    profile: { name: 'Lena', avatar: '🧙', createdDay: '2026-11-02' },
    habits: [pushups, library2],
    completions: [
      ...completeRange(pushups, '2026-11-02', '2026-11-16'),
      ...['2026-11-03', '2026-11-05', '2026-11-10', '2026-11-12', '2026-11-16'].map((day) => makeCompletion(library2, day)),
    ],
  })
  const TODAY = '2026-11-16'

  /** Die Quest `id` bekommt heute den Rhythmus `schedule` – so, wie das Repository es speichert. */
  function editSchedule(data: GameData, id: string, schedule: Schedule, withHistory = true): GameData {
    return {
      ...data,
      habits: data.habits.map((habit) =>
        habit.id !== id
          ? habit
          : { ...habit, schedule, ...(withHistory ? { scheduleHistory: [{ until: TODAY, schedule: habit.schedule }] } : {}) },
      ),
    }
  }

  function xpTotals(data: GameData) {
    const { totals, level, attributes } = deriveGameState(data, TODAY)
    return {
      questsCompleted: totals.questsCompleted,
      perfectDays: totals.perfectDays,
      xpFromQuests: totals.xpFromQuests,
      xpFromPerfectDays: totals.xpFromPerfectDays,
      level,
      attributes,
    }
  }

  it.each<[string, Schedule]>([
    ['Wochenquest → täglich', { type: 'daily' }],
    ['Wochenquest → Mo/Mi/Fr', { type: 'weekdays', days: [1, 3, 5] }],
    ['Wochenquest → 3× pro Woche', { type: 'weekly', times: 3 }],
  ])('%s: Perfekte Tage, XP und Level bleiben erhalten', (_label, schedule) => {
    const before = xpTotals(twoWeeks)
    expect(before.perfectDays).toBe(15)
    expect(xpTotals(editSchedule(twoWeeks, 'library', schedule))).toEqual(before)
  })

  it('ohne Verlauf gingen Perfekte Tage und XP verloren (Gegenprobe)', () => {
    const before = xpTotals(twoWeeks)
    const naive = xpTotals(editSchedule(twoWeeks, 'library', { type: 'daily' }, false))
    expect(naive.perfectDays).toBe(5) // nur noch die Tage mit Bibliothek
    expect(naive.level.totalXp).toBeLessThan(before.level.totalXp)
  })

  it('auch eine Lockerung (täglich → Wochenquest) schreibt die Vergangenheit nicht um', () => {
    // Zusätzlich täglich Wasser (immer erledigt); Liegestütze am Mi 11.11. vergessen → der Tag war nicht
    // perfekt und bleibt es auch, obwohl Liegestütze ab heute nur noch 3× pro Woche fällig sind.
    const water = makeHabit({ id: 'water', difficulty: 'easy', createdDay: '2026-11-02', order: 3 })
    const missed: GameData = {
      ...twoWeeks,
      habits: [...twoWeeks.habits, water],
      completions: [
        ...twoWeeks.completions.filter((c) => c.id !== 'pushups:2026-11-11'),
        ...completeRange(water, '2026-11-02', TODAY),
      ],
    }
    const before = xpTotals(missed)
    expect(before.perfectDays).toBe(14)
    const loosened = editSchedule(missed, 'pushups', { type: 'weekly', times: 3 })
    expect(xpTotals(loosened)).toEqual(before)
    expect(getDayState(loosened, '2026-11-11')).toMatchObject({ requiredCount: 2, requiredDone: 1, perfect: false })
    // Ohne Verlauf wäre der 11.11. nachträglich perfekt (Liegestütze keine Pflicht mehr)
    expect(xpTotals(editSchedule(missed, 'pushups', { type: 'weekly', times: 3 }, false)).perfectDays).toBe(15)
  })

  it('hinzugefügte Wochentage machen frühere Tage nicht zur offenen Pflicht', () => {
    // Lesen Mo/Mi/Fr (nur Mo 02. und Mi 04. erledigt), ab heute Mo–Fr.
    const data = makeGameData({
      habits: [pushups, reading],
      completions: [...completeRange(pushups, '2026-11-02', '2026-11-08'), makeCompletion(reading, '2026-11-02'), makeCompletion(reading, '2026-11-04'), makeCompletion(reading, '2026-11-06')],
    })
    const today = '2026-11-09'
    const edited: GameData = {
      ...data,
      habits: [
        pushups,
        {
          ...reading,
          schedule: { type: 'weekdays', days: [1, 2, 3, 4, 5] },
          scheduleHistory: [{ until: today, schedule: reading.schedule }],
        },
      ],
    }
    expect(deriveGameState(edited, today).totals).toEqual(deriveGameState(data, today).totals)
    expect(getDayState(edited, '2026-11-03').habits.map((s) => s.habit.id)).toEqual(['pushups'])
    expect(getDayState(edited, '2026-11-10').habits.map((s) => s.habit.id)).toEqual(['pushups', 'reading'])
  })

  it.each<[string, Schedule, Schedule]>([
    ['täglich → Wochenquest', { type: 'daily' }, { type: 'weekly', times: 5 }],
    ['Wochenquest → täglich', { type: 'weekly', times: 1 }, { type: 'daily' }],
  ])(
    '%s: Streak-Kapitel, Kampagnen-XP und Bestwerte bleiben erhalten',
    (_label, before, after) => {
      // Lesen ab Mo 02.11. drei Wochen lang täglich erledigt; Kampagne mit einem Streak-Kapitel (Ziel 3).
      // Bei einer Wochenquest sind das 3 Wochen, sonst 3 Tage – erreicht ist es in beiden Fällen.
      const quest = makeMainQuest({
        id: 'scholar',
        startDay: '2026-11-02',
        chapters: [makeChapter({ id: 'streak', criterion: { type: 'habit', habitId: 'reading', metric: 'streak', target: 3 } })],
      })
      const habit = makeHabit({ ...reading, measure: undefined, schedule: before })
      const data = makeGameData({
        profile: { name: 'Lena', avatar: '🧙', createdDay: '2026-11-02' },
        habits: [habit],
        completions: completeRange(habit, '2026-11-02', '2026-11-22'),
        mainQuests: [quest],
      })
      const today = '2026-11-23'
      const original = deriveGameState(data, today)
      expect(original.mainQuests[0].complete).toBe(true)

      const edited: GameData = {
        ...data,
        habits: [{ ...habit, schedule: after, scheduleHistory: [{ until: today, schedule: before }] }],
      }
      const state = deriveGameState(edited, today)
      expect(state.mainQuests[0].chapters[0]).toMatchObject({ done: true, doneDay: original.mainQuests[0].chapters[0].doneDay })
      expect(state.totals.xpFromChapters).toBe(BALANCING.chapterXp + BALANCING.mainQuestXp)
      expect(state.level).toStrictEqual(original.level)
      // Bestwerte der früheren Einheit bleiben in den Gesamtwerten (Heldenseite) erhalten.
      expect(state.totals.bestDayStreak).toBe(original.totals.bestDayStreak)
      expect(state.totals.bestWeekStreak).toBe(original.totals.bestWeekStreak)
    },
  )

  it('getDayState zeigt an früheren Tagen den damals gültigen Rhythmus', () => {
    const edited = editSchedule(twoWeeks, 'library', { type: 'daily' })
    const past = getDayState(edited, '2026-11-11').habits.find((s) => s.habit.id === 'library')
    expect(past).toMatchObject({ required: false, week: { done: 2, target: 2 } })
    const now = getDayState(edited, '2026-11-17').habits.find((s) => s.habit.id === 'library')
    expect(now?.required).toBe(true)
    expect(now?.week).toBeUndefined()
  })

  it('Wochenfortschritt nutzt dasselbe Wochenziel wie die Wochen-Serie (Rhythmus am Montag)', () => {
    // 3× pro Woche, am Mi 18.11. auf 2× gesenkt. Erledigt: drei volle Wochen, dann Mo 16. + Mi 18.
    const lowered = makeHabit({
      ...library,
      createdDay: '2026-10-26',
      schedule: { type: 'weekly', times: 2 },
      scheduleHistory: [{ until: '2026-11-18', schedule: { type: 'weekly', times: 3 } }],
    })
    const days = ['2026-10-26', '2026-10-27', '2026-10-28', '2026-11-02', '2026-11-03', '2026-11-04']
    const data = makeGameData({
      habits: [lowered],
      completions: [...days, '2026-11-09', '2026-11-10', '2026-11-11', '2026-11-16', '2026-11-18'].map((day) => makeCompletion(lowered, day)),
    })
    // Für diese Woche gilt noch das Ziel vom Montag (3) – „erreicht“ darf nicht angezeigt werden, solange die
    // Woche für die Serie nicht zählt.
    const sunday = getDayState(data, '2026-11-22').habits[0]
    expect(sunday.week).toEqual({ done: 2, target: 3 })
    expect(sunday.streak).toEqual({ current: 3, best: 3, unit: 'week' })
    expect(getDayState(data, '2026-11-23').habits[0].streak.current).toBe(0) // Woche nicht erfüllt → gebrochen
    // Ab dem nächsten Montag gilt das neue Ziel.
    expect(getDayState(data, '2026-11-23').habits[0].week).toEqual({ done: 0, target: 2 })
    // Umstellung auf Wochenquest mitten in der Woche: die Woche zählt nicht für die Serie, angezeigt wird das Ziel des Tages.
    const switched = makeHabit({
      ...library,
      createdDay: '2026-11-02',
      schedule: { type: 'weekly', times: 2 },
      scheduleHistory: [{ until: '2026-11-18', schedule: { type: 'daily' } }],
    })
    expect(getDayState(makeGameData({ habits: [switched] }), '2026-11-18').habits[0].week).toEqual({ done: 0, target: 2 })
  })

  it('eine zurückgeholte Quest behält die Perfekten Tage ihrer archivierten Zeit', () => {
    // Meditieren: täglich ab 02.11., archiviert am Do 05.11., am Do 12.11. zurückgeholt.
    const meditation = makeHabit({ id: 'meditation', difficulty: 'easy', createdDay: '2026-11-02', order: 5 })
    const completions = [
      ...completeRange(pushups, '2026-11-02', '2026-11-16'),
      ...completeRange(meditation, '2026-11-02', '2026-11-04'),
      ...completeRange(meditation, '2026-11-12', '2026-11-16'),
    ]
    const archived = makeGameData({ habits: [pushups, { ...meditation, archivedDay: '2026-11-05' }], completions })
    const restored = makeGameData({
      habits: [pushups, { ...meditation, pauses: [{ from: '2026-11-05', until: '2026-11-12' }] }],
      completions,
    })
    const naive = makeGameData({ habits: [pushups, meditation], completions })

    // Vor dem Zurückholen: alle Tage bis gestern perfekt
    expect(deriveGameState(archived, '2026-11-11').totals.perfectDays).toBe(10)
    const state = deriveGameState(restored, TODAY)
    expect(state.totals.perfectDays).toBe(15)
    expect(state.level.totalXp).toBeGreaterThan(deriveGameState(archived, '2026-11-11').level.totalXp)
    expect(getDayState(restored, '2026-11-08')).toMatchObject({ requiredCount: 1, perfect: true })
    expect(getDayState(restored, '2026-11-08').habits.map((s) => s.habit.id)).toEqual(['pushups'])
    // Die Serie läuft über die Pause hinweg weiter (3 + 5 Tage)
    expect(state.todayState.habits.find((s) => s.habit.id === 'meditation')?.streak).toEqual({
      current: 8,
      best: 8,
      unit: 'day',
    })
    // Ohne Pause wären 05.–11.11. rückwirkend nicht mehr perfekt
    expect(deriveGameState(naive, TODAY).totals.perfectDays).toBe(8)
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
    const required = data.habits.filter((h) => {
      // Rhythmus des Tages: Verlaufseintrag mit dem kleinsten until > day (bei Gleichstand der erste), sonst aktuell
      const historic = (h.scheduleHistory ?? [])
        .filter((entry) => day < entry.until)
        .sort((a, b) => (a.until < b.until ? -1 : a.until > b.until ? 1 : 0))[0]
      const schedule = historic?.schedule ?? h.schedule
      const paused = (h.pauses ?? []).some((pause) => pause.from <= day && day < pause.until)
      return (
        h.createdDay <= day &&
        (h.archivedDay === undefined || day < h.archivedDay) &&
        !paused &&
        (schedule.type === 'daily' || (schedule.type === 'weekdays' && schedule.days.includes(isoWeekday(day))))
      )
    })
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

/**
 * Zufälliger Spielstand: verschiedene Rhythmen, Archivierungen, Teilfortschritte, gelöschte Quests, Zukunft.
 * Mit `timeline` haben viele Quests zusätzlich einen Rhythmus-Verlauf und Pausen.
 */
function randomGameData(random: () => number, timeline = false): { data: GameData; today: DayKey } {
  const int = (max: number) => Math.floor(random() * (max + 1))
  const pick = <T>(items: readonly T[]): T => items[int(items.length - 1)]
  const randomSchedule = (kind: number): Schedule =>
    kind < 0.4
      ? { type: 'daily' }
      : kind < 0.75
        ? { type: 'weekdays', days: [pick([1, 2, 3] as const), pick([4, 5, 6, 7] as const)] }
        : { type: 'weekly', times: 1 + int(3) }
  const base = '2026-09-01'
  const today = addDays(base, 40 + int(60))
  const habits: Habit[] = Array.from({ length: 2 + int(5) }, (_, i) => {
    const createdDay = addDays(base, int(50))
    const kind = random()
    const habit = makeHabit({
      id: `h${i}`,
      order: int(3),
      difficulty: pick(DIFFICULTIES),
      attribute: pick(ATTRIBUTE_IDS),
      createdDay,
      archivedDay: random() < 0.25 ? addDays(createdDay, 1 + int(60)) : undefined,
      measure: random() < 0.3 ? { target: 1 + int(9), unit: 'Seiten' } : undefined,
      schedule: randomSchedule(kind),
    })
    if (timeline && random() < 0.7) {
      const first = addDays(createdDay, 1 + int(30))
      habit.scheduleHistory = [{ until: first, schedule: randomSchedule(random()) }]
      if (random() < 0.5) habit.scheduleHistory.push({ until: addDays(first, 1 + int(30)), schedule: randomSchedule(random()) })
    }
    if (timeline && random() < 0.5) {
      const from = addDays(createdDay, int(40))
      habit.pauses = [{ from, until: addDays(from, 1 + int(15)) }]
    }
    return habit
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

  it('stimmt auch mit Rhythmus-Verlauf und Pausen mit der wörtlichen Regelumsetzung überein', () => {
    const random = seededRandom(1117)
    for (let i = 0; i < 40; i++) {
      const { data, today } = randomGameData(random, true)
      const expected = referenceXp(data, today)
      const label = `Fall #${i}, today ${today}`
      expect(deriveGameState(data, today).totals, label).toMatchObject({
        xpFromQuests: expected.xpFromQuests,
        perfectDays: expected.perfectDays,
        xpFromPerfectDays: expected.xpFromPerfectDays,
      })
    }
  })

  it.each([false, true])('getDayState zeigt für jeden Tag dieselben Pflicht-, Perfekt- und XP-Werte wie die Gesamtrechnung (Verlauf & Pausen: %s)', (timeline) => {
    const random = seededRandom(77)
    for (let i = 0; i < 5; i++) {
      const { data, today } = randomGameData(random, timeline)
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
