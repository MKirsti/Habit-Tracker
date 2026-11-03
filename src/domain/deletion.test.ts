import { describe, expect, it } from 'vitest'
import { addDays, dayRange } from './dates'
import { applyHabitDeletion, deletionImpact, habitTombstone } from './deletion'
import { deriveGameState, getDayState } from './engine'
import { isArchivedOn } from './schedule'
import { makeChapter, makeCompletion, makeGameData, makeHabit, makeMainQuest, seededRandom } from './testing'
import type { Chapter, Completion, DayKey, GameData, Habit, Schedule } from './types'

const TODAY: DayKey = '2026-11-03'
const D = (offset: number) => addDays(TODAY, offset)

/** Laufen (Mittel, 20 XP) an D-3…D-1 erledigt, Vokabeln (Leicht, 10 XP) heute archiviert. */
function scenario(vocabularyDoneOn: DayKey[] = []) {
  const running = makeHabit({ id: 'laufen', title: 'Laufen', difficulty: 'medium', attribute: 'strength', createdDay: D(-3) })
  const vocabulary = makeHabit({
    id: 'vokabeln',
    title: 'Vokabeln',
    difficulty: 'easy',
    attribute: 'intellect',
    createdDay: D(-3),
    order: 1,
    archivedDay: TODAY,
  })
  const completions = [
    ...[D(-3), D(-2), D(-1)].map((day) => makeCompletion(running, day)),
    ...vocabularyDoneOn.map((day) => makeCompletion(vocabulary, day)),
  ]
  return makeGameData({
    profile: { name: 'Testheld', avatar: '🧙', createdDay: D(-3) },
    habits: [running, vocabulary],
    completions,
  })
}

describe('applyHabitDeletion', () => {
  it('macht keinen vergangenen Tag nachträglich perfekt (nie erledigte Pflicht-Quest)', () => {
    const data = scenario()
    const before = deriveGameState(data, TODAY)
    expect(before.level.totalXp).toBe(60)
    expect(before.totals.perfectDays).toBe(0)

    const after = deriveGameState(applyHabitDeletion(data, 'vokabeln', TODAY), TODAY)
    expect(after.level.totalXp).toBe(60)
    expect(after.totals.perfectDays).toBe(0)
    expect(after.totals.xpFromPerfectDays).toBe(0)
    // Auch die Tagesansicht von gestern (Nachtragen) bleibt nicht perfekt.
    expect(getDayState(applyHabitDeletion(data, 'vokabeln', TODAY), D(-1))).toMatchObject({
      requiredCount: 2,
      requiredDone: 1,
      perfect: false,
    })
  })

  it('kostet nur: eigene XP und den Perfekten Tag, an dem die Quest erledigt war', () => {
    const data = scenario([D(-3)])
    const before = deriveGameState(data, TODAY)
    // 3 × 20 + 10 Quest-XP, D-3 perfekt: round(0,25 × 30) = 8
    expect(before.level.totalXp).toBe(78)
    expect(before.totals.perfectDays).toBe(1)

    const after = deriveGameState(applyHabitDeletion(data, 'vokabeln', TODAY), TODAY)
    expect(after.level.totalXp).toBe(60)
    expect(after.totals.perfectDays).toBe(0)
    expect(after.attributes.intellect.totalXp).toBe(0)
    expect(after.attributes.strength.totalXp).toBe(60)
  })

  it('entfernt Quest und Erledigungen, hinterlässt einen Grabstein und lässt die Eingabe unverändert', () => {
    const data = scenario([D(-3)])
    const snapshot = structuredClone(data)
    const next = applyHabitDeletion(data, 'vokabeln', TODAY)
    expect(data).toStrictEqual(snapshot)
    expect(next.habits.map((h) => h.id)).toEqual(['laufen'])
    expect(next.completions.every((c) => c.habitId === 'laufen')).toBe(true)
    expect(next.deletedHabits).toStrictEqual([
      { id: 'vokabeln', createdDay: D(-3), archivedDay: TODAY, schedule: { type: 'daily' } },
    ])
    // Grabsteine tauchen in keiner Liste auf.
    const state = deriveGameState(next, TODAY)
    expect(state.todayState.habits.map((s) => s.habit.id)).toEqual(['laufen'])
    expect(getDayState(next, D(-1)).habits.map((s) => s.habit.id)).toEqual(['laufen'])
  })

  it('eine unbekannte Quest ändert nichts', () => {
    const data = scenario()
    expect(applyHabitDeletion(data, 'gibt-es-nicht', TODAY)).toBe(data)
  })

  it('ein Kapitel auf die gelöschte Quest verliert seinen Abschluss (Kapitel- und Kampagnen-XP)', () => {
    const data = scenario([D(-3)])
    data.mainQuests = [
      makeMainQuest({
        id: 'k',
        startDay: D(-3),
        chapters: [makeChapter({ id: 'c', criterion: { type: 'habit', habitId: 'vokabeln', metric: 'completions', target: 1 } })],
      }),
    ]
    const before = deriveGameState(data, TODAY)
    expect(before.totals.xpFromChapters).toBe(600)
    const after = deriveGameState(applyHabitDeletion(data, 'vokabeln', TODAY), TODAY)
    expect(after.totals.xpFromChapters).toBe(0)
    expect(after.mainQuests[0].chapters[0].brokenReference).toBe(true)
    expect(before.level.totalXp - after.level.totalXp).toBe(10 + 8 + 600)
  })
})

describe('deletionImpact', () => {
  function withCampaign(data: GameData, archived = false): GameData {
    data.mainQuests = [
      makeMainQuest({
        id: 'k',
        title: 'Sprachreise',
        startDay: D(-3),
        archived,
        chapters: [
          makeChapter({ id: 'erste', title: 'Erste Vokabeln', criterion: { type: 'habit', habitId: 'vokabeln', metric: 'completions', target: 1 } }),
          makeChapter({ id: 'viele', title: 'Viele Vokabeln', criterion: { type: 'habit', habitId: 'vokabeln', metric: 'completions', target: 30 } }),
          makeChapter({ id: 'lauf', title: 'Läufer', criterion: { type: 'habit', habitId: 'laufen', metric: 'completions', target: 1 } }),
        ],
      }),
    ]
    return data
  }

  it('nennt die exakten XP-Verluste samt Level und betroffenen Kapiteln', () => {
    const data = withCampaign(scenario([D(-3)]))
    data.mainQuests[0].chapters.splice(1, 1) // ohne das offene Kapitel → Kampagne komplett
    const impact = deletionImpact(data, 'vokabeln', TODAY)
    const before = deriveGameState(data, TODAY)
    const after = deriveGameState(applyHabitDeletion(data, 'vokabeln', TODAY), TODAY)
    expect(impact.xpLost).toBe(before.level.totalXp - after.level.totalXp)
    expect(impact.xpLost).toBe(10 + 8 + 100 + 500)
    expect(impact).toMatchObject({ levelBefore: before.level.level, levelAfter: after.level.level })
    expect(impact.levelBefore).toBeGreaterThan(impact.levelAfter)
    expect(impact.campaigns).toHaveLength(1)
    expect(impact.campaigns[0]).toMatchObject({ losesCompletion: true, openChapters: [] })
    expect(impact.campaigns[0].lostChapters.map((c) => c.title)).toEqual(['Erste Vokabeln'])
  })

  it('nennt offene Kapitel, die ihren Fortschritt verlieren, und zählt archivierte Kampagnen mit', () => {
    const impact = deletionImpact(withCampaign(scenario([D(-3)]), true), 'vokabeln', TODAY)
    expect(impact.xpLost).toBe(10 + 8 + 100)
    expect(impact.campaigns).toHaveLength(1)
    expect(impact.campaigns[0]).toMatchObject({ losesCompletion: false, quest: { id: 'k', archived: true } })
    expect(impact.campaigns[0].lostChapters.map((c) => c.id)).toEqual(['erste'])
    expect(impact.campaigns[0].openChapters.map((c) => c.id)).toEqual(['viele'])
  })

  it('ohne Wirkung: 0 XP, gleiches Level, keine Kampagnen', () => {
    expect(deletionImpact(scenario(), 'vokabeln', TODAY)).toStrictEqual({
      xpLost: 0,
      levelBefore: 1,
      levelAfter: 1,
      campaigns: [],
    })
  })
})

describe('habitTombstone', () => {
  const habit = makeHabit({
    id: 'h',
    createdDay: '2026-10-01',
    schedule: { type: 'weekly', times: 2 },
    scheduleHistory: [{ until: '2026-10-10', schedule: { type: 'daily' } }],
    pauses: [{ from: '2026-10-12', until: '2026-10-15' }],
  })

  it('übernimmt den Zeitplan; endet am Archivierungstag (≤ heute), sonst heute', () => {
    expect(habitTombstone(habit, TODAY)).toStrictEqual({
      id: 'h',
      createdDay: '2026-10-01',
      archivedDay: TODAY,
      schedule: { type: 'weekly', times: 2 },
      scheduleHistory: [{ until: '2026-10-10', schedule: { type: 'daily' } }],
      pauses: [{ from: '2026-10-12', until: '2026-10-15' }],
    })
    expect(habitTombstone({ ...habit, archivedDay: '2026-10-20' }, TODAY).archivedDay).toBe('2026-10-20')
    expect(habitTombstone({ ...habit, archivedDay: TODAY }, TODAY).archivedDay).toBe(TODAY)
    // Archivierungstag nach heute (Tageswechsel später gelegt): zählt erst ab heute nicht mehr.
    expect(habitTombstone({ ...habit, archivedDay: D(1) }, TODAY).archivedDay).toBe(TODAY)
  })

  it('lässt leere Verläufe weg', () => {
    const plain = habitTombstone(makeHabit({ id: 'p', scheduleHistory: [], pauses: [] }), TODAY)
    expect(Object.keys(plain).sort()).toEqual(['archivedDay', 'createdDay', 'id', 'schedule'])
  })
})

// ---------------------------------------------------------------------------
// Zufallstest: Löschen bringt nie XP
// ---------------------------------------------------------------------------

function randomData(random: () => number): GameData {
  const int = (max: number) => Math.floor(random() * (max + 1))
  const pick = <T,>(items: readonly T[]): T => items[int(items.length - 1)]
  const start = D(-40)
  const randomSchedule = (): Schedule => {
    const kind = random()
    if (kind < 0.4) return { type: 'daily' }
    if (kind < 0.7) return { type: 'weekdays', days: [pick([1, 2, 3] as const), pick([4, 5, 6, 7] as const)] }
    return { type: 'weekly', times: 1 + int(3) }
  }
  const habits: Habit[] = []
  const count = 2 + int(3)
  for (let i = 0; i < count; i++) {
    const createdDay = addDays(start, int(20))
    const habit = makeHabit({
      id: `h${i}`,
      order: i,
      createdDay,
      schedule: randomSchedule(),
      difficulty: pick(['easy', 'medium', 'hard', 'epic'] as const),
      attribute: pick(['strength', 'intellect', 'wisdom'] as const),
    })
    if (random() < 0.4) habit.scheduleHistory = [{ until: addDays(createdDay, 5 + int(10)), schedule: randomSchedule() }]
    if (random() < 0.3) {
      const from = addDays(createdDay, 3 + int(10))
      habit.pauses = [{ from, until: addDays(from, 1 + int(4)) }]
    }
    const archive = random()
    // heute oder früher archiviert, in der Zukunft archiviert (Tageswechsel verlegt) oder aktiv
    if (archive < 0.35) habit.archivedDay = addDays(TODAY, -int(15))
    else if (archive < 0.45) habit.archivedDay = D(1)
    habits.push(habit)
  }
  const completions: Completion[] = []
  for (const day of dayRange(start, TODAY)) {
    for (const habit of habits) {
      if (random() < 0.7) completions.push(makeCompletion(habit, day, random() < 0.1 ? { value: 0.5 } : {}))
    }
  }
  const chapters: Chapter[] = habits.map((habit, i) =>
    makeChapter({
      id: `c${i}`,
      criterion: { type: 'habit', habitId: habit.id, metric: pick(['completions', 'streak', 'total'] as const), target: 1 + int(8) },
    }),
  )
  return makeGameData({
    profile: { name: 'Zufall', avatar: '🎲', createdDay: start },
    habits,
    completions,
    mainQuests: [makeMainQuest({ id: 'k', startDay: start, chapters })],
  })
}

/** Archiviert eine Quest am Spieltag `today` (wie `repository.archiveHabit`). */
function archivedToday(data: GameData, habitId: string): GameData {
  return {
    ...data,
    habits: data.habits.map((habit) =>
      habit.id === habitId && !isArchivedOn(habit, TODAY) ? { ...habit, archivedDay: TODAY } : habit,
    ),
  }
}

function earned(data: GameData, day: DayKey) {
  const { level, totals } = deriveGameState(data, day)
  return { totalXp: level.totalXp, perfectDays: totals.perfectDays, xpFromPerfectDays: totals.xpFromPerfectDays }
}

function expectNoGain(after: ReturnType<typeof earned>, before: ReturnType<typeof earned>, label: string) {
  expect(after.totalXp, `${label}: XP`).toBeLessThanOrEqual(before.totalXp)
  expect(after.perfectDays, `${label}: Perfekte Tage`).toBeLessThanOrEqual(before.perfectDays)
  expect(after.xpFromPerfectDays, `${label}: Bonus-XP`).toBeLessThanOrEqual(before.xpFromPerfectDays)
}

describe('applyHabitDeletion – Zufallstest', () => {
  it('Löschen erhöht nie XP, Perfekte Tage oder Bonus-XP (heute und gestern)', () => {
    const random = seededRandom(20261103)
    let decreased = 0
    for (let round = 0; round < 40; round++) {
      const data = randomData(random)
      for (const habit of data.habits) {
        const label = `Runde ${round}, ${habit.id}`
        const after = applyHabitDeletion(data, habit.id, TODAY)
        // Bis gestern: Löschen kostet höchstens etwas – egal, ob die Quest archiviert war.
        expectNoGain(earned(after, D(-1)), earned(data, D(-1)), `${label}, gestern`)
        // Heute: Eine archivierte Quest (der Weg in der App) zählte heute schon nicht mehr. Eine noch aktive
        // endet mit dem Löschen heute – wie beim Archivieren; gegenüber diesem Stand kostet Löschen nur.
        const reference = isArchivedOn(habit, TODAY) ? data : archivedToday(data, habit.id)
        expectNoGain(earned(after, TODAY), earned(reference, TODAY), `${label}, heute`)
        if (earned(after, D(-1)).totalXp < earned(data, D(-1)).totalXp) decreased++
      }
    }
    // Der Test prüft wirklich etwas: Meist kostet Löschen XP.
    expect(decreased).toBeGreaterThan(40)
  })

  it('mehrfaches Löschen hintereinander bringt ebenfalls nie XP', () => {
    const random = seededRandom(7)
    for (let round = 0; round < 15; round++) {
      let data = randomData(random)
      for (const habit of [...data.habits]) {
        const before = earned(data, D(-1))
        data = applyHabitDeletion(data, habit.id, TODAY)
        expectNoGain(earned(data, D(-1)), before, `Runde ${round}, ${habit.id}`)
      }
      expect(data.habits).toEqual([])
      expect(data.deletedHabits).toHaveLength(new Set(data.deletedHabits?.map((t) => t.id)).size)
    }
  })
})
