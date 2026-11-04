import { describe, expect, it } from 'vitest'
import { ATTRIBUTE_IDS } from './attributes'
import { BALANCING, DIFFICULTIES } from './balancing'
import { addDays, dayRange, isoWeekday } from './dates'
import { deriveGameState, evaluateMainQuests, getDayState } from './engine'
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
 * - Di 03.: Liegestütze ✓ (Lesen nicht fällig)    → perfekt, Quest-XP 11 (10 + 5 % Streak-Bonus), Bonus round(2.75) = 3
 * - Mi 04.: Liegestütze ✓, Lesen 5/10             → nicht perfekt, Quest-XP 11 (10 + 10 % → round(11) = 11)
 * Quest-XP gesamt 10 + 11 + 11 + 20 + 40 = 92, davon 2 Streak-Bonus.
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
      xpFromStreakBonus: 0,
      xpFromPerfectDays: 0,
      xpFromChapters: 0,
      xpFromSideQuests: 0,
      sideQuestsCompleted: 0,
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
    expect(state.gold).toEqual({ fromXp: 0, fromAchievements: 0, earned: 0, spent: 0, lostToDefeats: 0, balance: 0 })
    expect(state.sideQuests).toEqual([])
    expect(state.achievements.length).toBeGreaterThan(0)
    expect(state.achievements.every((achievement) => !achievement.unlocked)).toBe(true)
  })
})

describe('deriveGameState – Basisszenario', () => {
  const state = deriveGameState(baseData(), '2026-11-04')

  it('vergibt Quest-XP nur für erledigte Completions (Teilfortschritt = 0 XP)', () => {
    expect(state.totals.questsCompleted).toBe(5)
    // Liegestütze mit Streak-Bonus: 10 (Tag 1) + 11 (Tag 2, +5 %) + 11 (Tag 3, +10 %)
    expect(state.totals.xpFromQuests).toBe(10 + 11 + 11 + 20 + 40)
    expect(state.totals.xpFromStreakBonus).toBe(2)
  })

  it('vergibt den Perfekter-Tag-Bonus nach Regel 2 (Wochenquests zählen zur Tages-XP)', () => {
    expect(state.totals.perfectDays).toBe(2)
    expect(state.totals.xpFromPerfectDays).toBe(18 + 3)
  })

  it('berechnet Level und Rang aus allen Charakter-XP', () => {
    expect(state.level).toMatchObject({ level: 2, totalXp: 113, xpIntoLevel: 13, xpForNextLevel: 283 })
    expect(state.rank).toBe('Novize')
  })

  it('gibt Attribut-XP ohne Perfekter-Tag-Bonus (aber mit Streak-Bonus)', () => {
    expect(state.attributes.strength).toMatchObject({ level: 1, totalXp: 32, xpIntoLevel: 32 })
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
    expect(today.questXp).toBe(11)
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
      // Erste Woche: noch keine erfüllte Woche davor → kein Bonus
      xp: 40,
      baseXp: 40,
      streakBonus: 0,
    })
    // Zwei erledigte Tage davor → +10 %
    expect(push).toMatchObject({ required: true, value: 1, target: 1, done: true, xp: 11, baseXp: 10, streakBonus: 0.1 })
    expect(push.streak).toEqual({ current: 3, best: 3, unit: 'day' })
    expect(push.week).toBeUndefined()
    // Offen: Eine Erledigung brächte jetzt 20 + 5 % (Mo erledigt, Di kein Plantag) = 21 XP
    expect(read).toMatchObject({ required: true, value: 5, target: 10, done: false, xp: 21, baseXp: 20, streakBonus: 0.05 })
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
    // Heute offen: eine Erledigung brächte jetzt 40 XP (+5 % Streak-Bonus = 42). Gestern erledigt: gutgeschrieben
    // wurden 10 XP (Snapshot-Schwierigkeit, erster Tag der Serie).
    expect(deriveGameState(data, '2026-11-03').todayState.habits[0]).toMatchObject({
      done: false,
      xp: 42,
      baseXp: 40,
      streakBonus: 0.05,
    })
    expect(getDayState(data, '2026-11-02').habits[0]).toMatchObject({ done: true, xp: 10, baseXp: 10, streakBonus: 0 })
  })

  it('ignoriert Completions gelöschter Quests überall', () => {
    const ghost = makeHabit({ id: 'ghost', difficulty: 'epic', createdDay: '2026-11-01' })
    const data = baseData()
    data.completions.push(...completeRange(ghost, '2026-11-01', '2026-11-04'))
    const state = deriveGameState(data, '2026-11-04')
    expect(state.totals).toMatchObject({
      questsCompleted: 5,
      xpFromQuests: 92,
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
    expect(state.totals).toMatchObject({ questsCompleted: 5, xpFromQuests: 92, activeDays: 3, perfectDays: 2 })
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
    expect(state.totals.xpFromQuests).toBe(40 + 10 + 11)
    // 02.: beide fällig & erledigt (Bonus round(12.5) = 13) · 03.: nur Liegestütze fällig (11 XP, Bonus 3)
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
    expect(state.totals).toMatchObject({ questsCompleted: 6, xpFromQuests: 92, xpFromPerfectDays: 21 })
    expect(state.level).toMatchObject({ level: 2, totalXp: 113 })
    expect(state.attributes.wisdom.totalXp).toBe(40)
    expect(getDayState(data, '2026-11-03')).toMatchObject({ questXp: 11, perfectBonusXp: 3 })
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
    expect(state.level.totalXp).toBe(92 + 21 + 200)
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

describe('deriveGameState – Hauptfarbe der Kampagne (dominantAttribute)', () => {
  // Gewicht = questXp × Termine pro Woche: easy 10, medium 20, hard 40, epic 80; täglich 7×, Wochentage
  // deren Anzahl, Wochenquest `times`.
  const TODAY = '2026-11-04'
  const quest = (
    id: string,
    attribute: AttributeId,
    difficulty: Difficulty,
    schedule: Schedule,
    order: number,
    extra: Partial<Habit> = {},
  ) => makeHabit({ id, attribute, difficulty, schedule, order, mainQuestId: 'c', ...extra })
  const campaign = makeMainQuest({ id: 'c' })

  function dominant(habits: Habit[], mainQuests = [campaign], today: DayKey = TODAY) {
    const state = deriveGameState(makeGameData({ habits, mainQuests }), today)
    return [...state.mainQuests, ...state.archivedMainQuests].map((q) => [q.quest.id, q.dominantAttribute])
  }

  it('eine Kampagne mit nur einem Attribut bekommt dieses', () => {
    const habits = [
      quest('a', 'strength', 'easy', { type: 'daily' }, 0),
      quest('b', 'strength', 'hard', { type: 'weekly', times: 2 }, 1),
    ]
    expect(dominant(habits)).toEqual([['c', 'strength']])
  })

  it('gewichtet nach XP pro Woche: 3 leichte tägliche (210) schlagen 1 schwere 3×/Woche (120)', () => {
    const hard = quest('hard', 'strength', 'hard', { type: 'weekly', times: 3 }, 0) // 40 × 3 = 120
    const easy = [1, 2, 3].map((i) => quest(`easy${i}`, 'intellect', 'easy', { type: 'daily' }, i)) // 3 × 10 × 7 = 210
    expect(dominant([hard, ...easy])).toEqual([['c', 'intellect']])
    // Mit nur einer leichten täglichen (70) gewinnt die schwere Wochenquest (120).
    expect(dominant([hard, easy[0]])).toEqual([['c', 'strength']])
  })

  it('zählt bei Wochentagen die Anzahl der Tage (Mo/Mi/Fr mittel = 60 < täglich leicht = 70)', () => {
    const weekdays = quest('w', 'wisdom', 'medium', { type: 'weekdays', days: [1, 3, 5] }, 0) // 20 × 3 = 60
    const daily = quest('d', 'vitality', 'easy', { type: 'daily' }, 1) // 10 × 7 = 70
    expect(dominant([weekdays, daily])).toEqual([['c', 'vitality']])
    const epicWeekdays = quest('w', 'wisdom', 'epic', { type: 'weekdays', days: [6, 7] }, 0) // 80 × 2 = 160
    expect(dominant([epicWeekdays, daily])).toEqual([['c', 'wisdom']])
  })

  it('Gleichstand → das Attribut der zuerst sortierten beteiligten Quest (nach order)', () => {
    const strength = quest('s', 'strength', 'easy', { type: 'daily' }, 5) // 70
    const vitality = quest('v', 'vitality', 'medium', { type: 'weekly', times: 2 }, 1) // 40
    const vitality2 = quest('v2', 'vitality', 'easy', { type: 'weekly', times: 3 }, 9) // 30 → zusammen 70
    expect(dominant([strength, vitality, vitality2])).toEqual([['c', 'vitality']])
    // Umgekehrte Reihenfolge: Jetzt steht die Stärke-Quest vorn.
    expect(dominant([{ ...strength, order: 0 }, vitality, vitality2])).toEqual([['c', 'strength']])
    // Gleiche order → wie in linkedHabitIds nach Titel.
    const a = quest('x', 'charisma', 'easy', { type: 'daily' }, 3, { title: 'B' })
    const b = quest('y', 'discipline', 'easy', { type: 'daily' }, 3, { title: 'A' })
    expect(dominant([a, b])).toEqual([['c', 'discipline']])
  })

  it('zählt nur heute aktive Quests: archivierte, pausierte und noch nicht begonnene nicht', () => {
    const small = quest('small', 'intellect', 'easy', { type: 'weekly', times: 1 }, 0) // 10
    /** Mit einer großen Stärke-Quest (episch, täglich = 560), die `extra` bekommt. */
    const withBig = (extra: Partial<Habit>) => dominant([small, quest('big', 'strength', 'epic', { type: 'daily' }, 1, extra)])
    expect(withBig({})).toEqual([['c', 'strength']])
    expect(withBig({ archivedDay: TODAY })).toEqual([['c', 'intellect']])
    expect(withBig({ archivedDay: '2026-10-01' })).toEqual([['c', 'intellect']])
    expect(withBig({ pauses: [{ from: '2026-11-01', until: '2026-11-10' }] })).toEqual([['c', 'intellect']])
    expect(withBig({ createdDay: '2026-11-05' })).toEqual([['c', 'intellect']])
    // Ein Archivierungstag nach heute zählt noch nicht (isArchivedOn) – die Quest ist noch aktiv.
    expect(withBig({ archivedDay: '2026-11-05' })).toEqual([['c', 'strength']])
  })

  it('ohne Quest gibt es kein dominantAttribute (die UI nutzt dann die Vorlage bzw. Gold)', () => {
    expect(dominant([])).toEqual([['c', undefined]])
    const [state] = deriveGameState(makeGameData({ mainQuests: [campaign] }), TODAY).mainQuests
    expect(state).not.toHaveProperty('dominantAttribute')
    // Noch nicht angelegte Quests zählen auch ersatzweise nicht.
    const future = quest('f', 'strength', 'hard', { type: 'daily' }, 0, { createdDay: '2026-11-05' })
    expect(dominant([future])).toEqual([['c', undefined]])
  })

  it('ist keine Quest aktiv, behält die Kampagne die Farbe ihres zuletzt gültigen Plans (archiviert/pausiert)', () => {
    // „Kampagne beenden“ mit ihren Quests: Die Farbe springt nicht auf Vorlage oder Gold.
    const lift = quest('lift', 'strength', 'hard', { type: 'weekly', times: 2 }, 0, { archivedDay: '2026-11-01' }) // 80
    const walk = quest('walk', 'vitality', 'easy', { type: 'daily' }, 1, { archivedDay: '2026-11-01' }) // 70
    expect(dominant([lift, walk])).toEqual([['c', 'strength']])
    // Urlaub (alle pausiert): ebenso.
    const pause = { pauses: [{ from: '2026-11-01', until: '2026-11-20' }] }
    expect(dominant([{ ...lift, archivedDay: undefined, ...pause }, { ...walk, archivedDay: undefined, ...pause }])).toEqual([
      ['c', 'strength'],
    ])
    // Rhythmus laut letztem Stand (scheduleOn): früher täglich, zuletzt 1× pro Woche → 40 < 70.
    const changed: Habit = {
      ...lift,
      schedule: { type: 'weekly', times: 1 },
      scheduleHistory: [{ until: '2026-10-20', schedule: { type: 'daily' } }],
    }
    expect(dominant([changed, walk])).toEqual([['c', 'vitality']])
    // Sobald wieder eine Quest aktiv ist, zählt nur sie.
    const read = quest('read', 'intellect', 'easy', { type: 'weekly', times: 1 }, 2) // 10
    expect(dominant([lift, walk, read])).toEqual([['c', 'intellect']])
  })

  it('nutzt den heute gültigen Rhythmus und die aktuelle Schwierigkeit', () => {
    // Früher täglich (70), seit 03.11. nur noch 1× pro Woche (10).
    const changed = quest('ch', 'strength', 'easy', { type: 'weekly', times: 1 }, 0, {
      scheduleHistory: [{ until: '2026-11-03', schedule: { type: 'daily' } }],
    })
    const other = quest('o', 'wisdom', 'easy', { type: 'weekly', times: 2 }, 1) // 20
    expect(dominant([changed, other])).toEqual([['c', 'wisdom']])
    // Zum Stichtag vor der Umstellung galt noch „täglich“.
    expect(dominant([changed, other], [campaign], '2026-11-02')).toEqual([['c', 'strength']])
    // Erledigungen (und deren Schnappschüsse) spielen keine Rolle – nur der Plan.
    const completions = completeRange(other, '2026-10-01', TODAY)
    const data = makeGameData({ habits: [changed, other], mainQuests: [campaign], completions })
    expect(deriveGameState(data, TODAY).mainQuests[0].dominantAttribute).toBe('wisdom')
    expect(dominant([{ ...changed, difficulty: 'epic' }, other])).toEqual([['c', 'strength']]) // 80 > 20
  })

  it('geteilte Quests zählen für jede Kampagne, die sie führt (mainQuestId, sharedHabitIds, Kapitel-Verweis)', () => {
    // Gehört „owner“, wird von „sharer“ mitbenutzt und von einem Kapitel in „referrer“ referenziert. 20 × 7 = 140.
    const water = quest('water', 'vitality', 'medium', { type: 'daily' }, 0, { mainQuestId: 'owner' })
    const owner = makeMainQuest({ id: 'owner' })
    const sharer = makeMainQuest({ id: 'sharer', sharedHabitIds: ['water'] })
    const referrer = makeMainQuest({
      id: 'referrer',
      chapters: [makeChapter({ id: 'k', criterion: { type: 'habit', habitId: 'water', metric: 'completions', target: 5 } })],
    })
    const stranger = makeMainQuest({ id: 'stranger' })
    const lift = quest('lift', 'strength', 'hard', { type: 'weekly', times: 3 }, 1, { mainQuestId: 'sharer' }) // 120
    const read = quest('read', 'intellect', 'epic', { type: 'weekly', times: 2 }, 2, { mainQuestId: 'referrer' }) // 160
    const data = makeGameData({ habits: [water, lift, read], mainQuests: [owner, sharer, referrer, stranger] })
    const state = deriveGameState(data, TODAY)
    expect(state.mainQuests.map((q) => [q.quest.id, q.dominantAttribute])).toEqual([
      ['owner', 'vitality'],
      ['sharer', 'vitality'], // 140 > 120
      ['referrer', 'intellect'], // 160 > 140
      ['stranger', undefined],
    ])
  })

  it('archivierte Kampagnen werden genauso (zum heutigen Tag) ausgewertet', () => {
    const archived = makeMainQuest({ id: 'old', archived: true })
    const habits = [
      quest('a', 'charisma', 'medium', { type: 'daily' }, 0, { mainQuestId: 'old' }),
      quest('b', 'strength', 'easy', { type: 'daily' }, 1),
      quest('gone', 'discipline', 'epic', { type: 'daily' }, 2, { mainQuestId: 'old', archivedDay: '2026-11-01' }),
    ]
    expect(dominant(habits, [archived, campaign])).toEqual([
      ['c', 'strength'],
      ['old', 'charisma'],
    ])
    const data = makeGameData({ habits, mainQuests: [archived, campaign] })
    expect(evaluateMainQuests(data, TODAY).map((q) => q.dominantAttribute)).toEqual(['charisma', 'strength'])
  })

  it('ignoriert Quests mit kaputten Daten (unbekanntes Attribut oder Schwierigkeit)', () => {
    const broken = quest('x', 'mystery' as AttributeId, 'epic', { type: 'daily' }, 0)
    const odd = quest('y', 'strength', 'legendary' as Difficulty, { type: 'daily' }, 1)
    const fine = quest('z', 'wisdom', 'easy', { type: 'weekly', times: 1 }, 2)
    expect(dominant([broken, odd, fine])).toEqual([['c', 'wisdom']])
    expect(dominant([broken, odd])).toEqual([['c', undefined]])
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
  const YESTERDAY = addDays(TODAY, -1)

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

  function xpTotals(data: GameData, day: DayKey = TODAY) {
    const { totals, level, attributes } = deriveGameState(data, day)
    return {
      questsCompleted: totals.questsCompleted,
      perfectDays: totals.perfectDays,
      xpFromQuests: totals.xpFromQuests,
      xpFromPerfectDays: totals.xpFromPerfectDays,
      level,
      attributes,
    }
  }

  const statusToday = (data: GameData, id: string) =>
    deriveGameState(data, TODAY).todayState.habits.find((status) => status.habit.id === id)

  it.each<[string, Schedule, number]>([
    // Als Tagesquest beginnt die Serie neu: Die Tage davor waren keine Plantage (damals Wochenquest).
    ['Wochenquest → täglich', { type: 'daily' }, 40],
    ['Wochenquest → Mo/Mi/Fr', { type: 'weekdays', days: [1, 3, 5] }, 40],
    // Gleiche Einheit: Die beiden erfüllten Wochen davor zählen weiter (+10 %).
    ['Wochenquest → 3× pro Woche', { type: 'weekly', times: 3 }, 44],
  ])('%s: Perfekte Tage, XP und Level bleiben erhalten', (_label, schedule, libraryXpToday) => {
    const edited = editSchedule(twoWeeks, 'library', schedule)
    const before = xpTotals(twoWeeks)
    expect(before.perfectDays).toBe(15)
    // Bis gestern ändert sich nichts – nur der laufende Tag darf sich ändern (ARCHITECTURE.md, Regel 5 ff.).
    expect(xpTotals(edited, YESTERDAY)).toEqual(xpTotals(twoWeeks, YESTERDAY))
    const after = xpTotals(edited)
    expect(after).toMatchObject({ perfectDays: before.perfectDays, questsCompleted: before.questsCompleted })
    // Heute folgt nur der Streak-Bonus der heutigen Erledigung der Einheit des neuen Rhythmus.
    expect(statusToday(twoWeeks, 'library')).toMatchObject({ done: true, xp: 44, streakBonus: 0.1 })
    expect(statusToday(edited, 'library')).toMatchObject({ done: true, xp: libraryXpToday })
    if (libraryXpToday === 44) expect(after).toEqual(before)
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
    expect(xpTotals(loosened, YESTERDAY)).toEqual(xpTotals(missed, YESTERDAY))
    expect(xpTotals(loosened)).toMatchObject({ perfectDays: 14, questsCompleted: before.questsCompleted })
    // Heute: Die Tages-Serie (12.–15.11., +20 %) zählt für die neue Wochenquest nicht – sie beginnt neu.
    expect(statusToday(missed, 'pushups')).toMatchObject({ xp: 12, streakBonus: 0.2 })
    expect(statusToday(loosened, 'pushups')).toMatchObject({ xp: 10, streakBonus: 0 })
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

/** Rhythmus eines Tages, wörtlich: Verlaufseintrag mit dem kleinsten until > day (bei Gleichstand der erste), sonst aktuell. */
function referenceScheduleOn(h: Habit, day: DayKey): Schedule {
  const historic = (h.scheduleHistory ?? [])
    .filter((entry) => day < entry.until)
    .sort((a, b) => (a.until < b.until ? -1 : a.until > b.until ? 1 : 0))[0]
  return historic?.schedule ?? h.schedule
}

/**
 * Streak-Bonus-Schritte vor einem Tag, wörtlich nach ARCHITECTURE.md „Streak-Bonus“ – von jedem Tag aus
 * **rückwärts** gezählt (die Engine rechnet in einem Vorwärts-Durchlauf). Liefert eine Funktion Kalender-Index → n.
 * - Tages-Einheit: erledigte Plantage direkt davor; Nicht-Plantage, Pausen und archivierte Tage überspringen,
 *   ein verpasster Plantag beendet die Zählung.
 * - Wochen-Einheit: erfüllte Wochen direkt vor der Woche des Tages (Ziel vom Montag); Wochen, deren Montag
 *   keine Wochenquest war, und unvollständige Wochen (Pause, vor dem Anlegen, archiviert) brechen nichts.
 */
function referenceRunsBefore(h: Habit, done: ReadonlySet<DayKey>, calendar: readonly DayKey[]): (i: number) => number {
  const scheduleAt = calendar.map((day) => referenceScheduleOn(h, day))
  const active = calendar.map(
    (day) =>
      h.createdDay <= day &&
      (h.archivedDay === undefined || day < h.archivedDay) &&
      !(h.pauses ?? []).some((pause) => pause.from <= day && day < pause.until),
  )
  const plan = calendar.map((day, i) => {
    const schedule = scheduleAt[i]
    return active[i] && (schedule.type === 'daily' || (schedule.type === 'weekdays' && schedule.days.includes(isoWeekday(day))))
  })
  const doneAt = calendar.map((day) => done.has(day))
  return (i) => {
    const day = calendar[i]
    if (day < h.createdDay) return 0
    let n = 0
    if (scheduleAt[i].type !== 'weekly') {
      for (let j = i - 1; j >= 0 && calendar[j] >= h.createdDay; j--) {
        if (!plan[j]) continue
        if (!doneAt[j]) break
        n++
      }
      return n
    }
    const monday = i - (isoWeekday(day) - 1)
    for (let m = monday - 7; m >= 0 && calendar[m + 6] >= h.createdDay; m -= 7) {
      const schedule = scheduleAt[m]
      if (schedule.type !== 'weekly') continue
      let count = 0
      let interrupted = false
      for (let j = m; j < m + 7; j++) {
        if (!active[j]) interrupted = true
        else if (doneAt[j]) count++
      }
      if (count >= Math.max(1, schedule.times)) n++
      else if (!interrupted) break
    }
    return n
  }
}

/** round(XP × (1 + min(5 % × n, 50 %))) in ganzen Prozent. */
function referenceBonusXp(baseXp: number, run: number): number {
  const percent = Math.min(Math.round(BALANCING.streakBonusPerStep * 100) * run, Math.round(BALANCING.streakBonusMax * 100))
  return Math.round((baseXp * (100 + percent)) / 100)
}

/**
 * Referenzmodell der XP-Regeln 1 + 2 samt Streak-Bonus, wörtlich nach docs/ARCHITECTURE.md: Perfekte Tage werden
 * Tag für Tag über den *gesamten* Zeitraum (frühester Completion-Tag bzw. profile.createdDay bis today) gesucht –
 * unabhängig von der Optimierung der Engine, die nur Tage mit Completions betrachtet.
 */
function referenceXp(data: GameData, today: DayKey) {
  const habitIds = new Set(data.habits.map((h) => h.id))
  const relevant = data.completions.filter((c) => habitIds.has(c.habitId) && c.day <= today)
  const doneOn = new Map<DayKey, Completion[]>()
  for (const c of relevant) if (c.value >= c.target) doneOn.set(c.day, [...(doneOn.get(c.day) ?? []), c])

  // Kalender ab einem Montag weit vor allen Quests (Zufallsdaten beginnen frühestens 2026-08-27).
  const calendar = dayRange('2026-08-17', addDays(today, 7))
  const calendarIndex = new Map(calendar.map((day, i) => [day, i]))
  const xpOf = new Map<Completion, number>()
  for (const h of data.habits) {
    const done = relevant.filter((c) => c.habitId === h.id && c.value >= c.target)
    const runBefore = referenceRunsBefore(h, new Set(done.map((c) => c.day)), calendar)
    for (const c of done) xpOf.set(c, referenceBonusXp(BALANCING.questXp[c.difficulty], runBefore(calendarIndex.get(c.day)!)))
  }

  const attributeXp = Object.fromEntries(ATTRIBUTE_IDS.map((id) => [id, 0])) as Record<AttributeId, number>
  let xpFromQuests = 0
  let xpFromStreakBonus = 0
  for (const [c, xp] of xpOf) {
    xpFromQuests += xp
    xpFromStreakBonus += xp - BALANCING.questXp[c.difficulty]
    attributeXp[c.attribute] += xp
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
      xpFromPerfectDays += Math.round(BALANCING.perfectDayBonus * done.reduce((sum, c) => sum + xpOf.get(c)!, 0))
    }
  }
  return {
    questsCompleted: [...doneOn.values()].reduce((sum, list) => sum + list.length, 0),
    activeDays: doneOn.size,
    xpFromQuests,
    xpFromStreakBonus,
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
        xpFromStreakBonus: expected.xpFromStreakBonus,
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
      const state = deriveGameState(data, today)
      expect(state.totals, label).toMatchObject({
        xpFromQuests: expected.xpFromQuests,
        xpFromStreakBonus: expected.xpFromStreakBonus,
        perfectDays: expected.perfectDays,
        xpFromPerfectDays: expected.xpFromPerfectDays,
      })
      for (const id of ATTRIBUTE_IDS) expect(state.attributes[id].totalXp, `${label}, ${id}`).toBe(expected.attributeXp[id])
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

describe('getDayState – Streak-Bonus je Quest (Zufallstests)', () => {
  it.each([false, true])('zeigt an jedem Tag – offen oder erledigt – den Bonus der wörtlichen Regel (Verlauf & Pausen: %s)', (timeline) => {
    const random = seededRandom(31)
    for (let i = 0; i < 5; i++) {
      const { data, today } = randomGameData(random, timeline)
      const calendar = dayRange('2026-08-17', addDays(today, 7))
      const calendarIndex = new Map(calendar.map((day, k) => [day, k]))
      const runsOf = new Map(
        data.habits.map((h) => {
          const done = new Set(data.completions.filter((c) => c.habitId === h.id && c.value >= c.target).map((c) => c.day))
          return [h.id, referenceRunsBefore(h, done, calendar)]
        }),
      )
      for (const day of dayRange('2026-09-01', today)) {
        for (const status of getDayState(data, day).habits) {
          const run = runsOf.get(status.habit.id)!(calendarIndex.get(day)!)
          const label = `Fall #${i}, ${day}, ${status.habit.id}`
          expect(status.streakBonus, label).toBe(Math.min(5 * run, 50) / 100)
          expect(status.xp, label).toBe(referenceBonusXp(status.baseXp, run))
        }
      }
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
