import { describe, expect, it } from 'vitest'
import { BALANCING } from './balancing'
import { addDays, dayRange } from './dates'
import { deriveGameState } from './engine'
import { hallOfFame } from './hallOfFame'
import { creditedCompletions } from './statistics'
import { makeChapter, makeCompletion, makeGameData, makeHabit, makeMainQuest } from './testing'
import type { DayKey, GameData } from './types'

const TODAY: DayKey = '2026-11-04'
const D = (offset: number): DayKey => addDays(TODAY, offset)

// Kampagne A (archiviert, in der Ruhmeshalle): Lesen + Wasser · Kampagne B (gemeistert, noch nicht abgelegt):
// Nachdenken + Wasser (mitbenutzt) · Kampagne C: läuft noch.
const read = makeHabit({ id: 'read', order: 0, title: 'Lesen', mainQuestId: 'A', createdDay: D(-20), measure: { target: 10, unit: 'Seiten' } })
const water = makeHabit({ id: 'water', order: 1, title: 'Wasser', mainQuestId: 'A', createdDay: D(-20), difficulty: 'easy' })
const think = makeHabit({ id: 'think', order: 2, title: 'Nachdenken', mainQuestId: 'B', createdDay: D(-10), difficulty: 'easy' })
const walk = makeHabit({ id: 'walk', order: 3, title: 'Spazieren', mainQuestId: 'C', createdDay: D(-10) })

const campaignA = makeMainQuest({
  id: 'A',
  title: 'Der Weg des Gelehrten',
  reward: 'Ein neues Buch',
  startDay: D(-20),
  deadline: D(-5),
  archived: true,
  createdAt: 1,
  chapters: [
    makeChapter({ id: 'a1', title: 'Fünf Tage', criterion: { type: 'habit', habitId: 'read', metric: 'completions', target: 5 } }),
    makeChapter({ id: 'a2', title: 'Drei am Stück', criterion: { type: 'habit', habitId: 'read', metric: 'streak', target: 3 } }),
    makeChapter({ id: 'a3', title: 'Das erste Buch', criterion: { type: 'manual' }, manualDone: true, completedDay: D(-8) }),
  ],
})
const campaignB = makeMainQuest({
  id: 'B',
  title: 'Der stille Mönch',
  reward: 'Ein Tag am See',
  startDay: D(-10),
  deadline: D(-12),
  sharedHabitIds: ['water'],
  createdAt: 2,
  chapters: [makeChapter({ id: 'b1', title: 'Zwei Gedanken', criterion: { type: 'habit', habitId: 'think', metric: 'completions', target: 2 } })],
})
const campaignC = makeMainQuest({
  id: 'C',
  startDay: D(-10),
  createdAt: 3,
  chapters: [makeChapter({ id: 'c1', criterion: { type: 'habit', habitId: 'walk', metric: 'completions', target: 50 } })],
})

const data: GameData = makeGameData({
  profile: { name: 'Held', avatar: '🧙', createdDay: D(-20) },
  habits: [read, water, think, walk],
  completions: [
    ...dayRange(D(-20), D(-12)).map((day) => makeCompletion(read, day)),
    ...dayRange(D(-20), TODAY).map((day) => makeCompletion(water, day)),
    makeCompletion(think, D(-10)),
    makeCompletion(think, D(-9)),
    makeCompletion(think, D(-3)), // nach dem Abschluss von B: zählt nicht mehr für B
    makeCompletion(read, D(-11), { value: 4 }), // Teilfortschritt: kein Quest-Tag
    makeCompletion(walk, D(-2)),
  ],
  mainQuests: [campaignA, campaignB, campaignC],
})

describe('hallOfFame', () => {
  const entries = hallOfFame(data, TODAY)

  it('enthält nur gemeisterte Kampagnen – archivierte und abgelegte – die zuletzt gemeisterte zuerst', () => {
    expect(entries.map((entry) => [entry.quest.id, entry.archived])).toEqual([
      ['A', true],
      ['B', false],
    ])
  })

  it('Bilanz: Start, Abschlusstag (letztes Kapitel), Dauer, Kapitel, Belohnung, Frist', () => {
    const [a, b] = entries
    expect(a).toMatchObject({
      startDay: D(-20),
      completedDay: D(-8), // „Das erste Buch“ nach „Fünf Tage“ (D(-16)) und „Drei am Stück“ (D(-18))
      durationDays: 13,
      reward: 'Ein neues Buch',
      deadline: D(-5),
      onTime: true,
      chapters: [
        { id: 'a1', title: 'Fünf Tage', doneDay: D(-16) },
        { id: 'a2', title: 'Drei am Stück', doneDay: D(-18) },
        { id: 'a3', title: 'Das erste Buch', doneDay: D(-8) },
      ],
    })
    expect(b).toMatchObject({ startDay: D(-10), completedDay: D(-9), durationDays: 2, deadline: D(-12), onTime: false })
  })

  it('erledigte Quest-Tage der zugehörigen Quests im Zeitraum und die XP daraus (inkl. Streak-Bonus)', () => {
    const [a, b] = entries
    // Lesen: 9 Tage (20 … 28 XP, Serie +5 % je Tag) · Wasser: 13 Tage (10 … 15 XP)
    expect(a.quests.map((quest) => [quest.habit.id, quest.days, quest.xp])).toEqual([
      ['read', 9, 216],
      ['water', 13, 170],
    ])
    expect(a).toMatchObject({ questDays: 22, questXp: 386 })
    // Geteilte Quest zählt auch für B – nur im Zeitraum von B (D(-10) … D(-9)).
    expect(b.quests.map((quest) => [quest.habit.id, quest.days])).toEqual([
      ['water', 2],
      ['think', 2],
    ])
    expect(b.questDays).toBe(4)
    // Die XP stammen genau aus den gutgeschriebenen Erledigungen.
    const credited = creditedCompletions(data, TODAY)
    const xpOf = (habitId: string, from: DayKey, to: DayKey) =>
      (credited.get(habitId) ?? []).filter(({ completion }) => completion.day >= from && completion.day <= to).reduce((sum, { xp }) => sum + xp, 0)
    expect(b.questXp).toBe(xpOf('water', D(-10), D(-9)) + xpOf('think', D(-10), D(-9)))
  })

  it('Kapitel- und Kampagnen-XP, Gesamtsumme und Hauptfarbe', () => {
    const [a, b] = entries
    expect(a.campaignXp).toBe(3 * BALANCING.chapterXp + BALANCING.mainQuestXp)
    expect(a.totalXp).toBe(a.questXp + a.campaignXp)
    expect(b.campaignXp).toBe(BALANCING.chapterXp + BALANCING.mainQuestXp)
    expect(a.dominantAttribute).toBeDefined()
    expect(a.campaign.complete).toBe(true)
  })

  it('nutzt auf Wunsch die Kampagnen aus dem Spielzustand – mit demselben Ergebnis', () => {
    const state = deriveGameState(data, TODAY)
    expect(hallOfFame(data, TODAY, [...state.mainQuests, ...state.archivedMainQuests])).toEqual(entries)
  })

  it('ohne gemeisterte Kampagne leer; gelöschte Quests fehlen in der Bilanz', () => {
    expect(hallOfFame({ ...data, mainQuests: [campaignC] }, TODAY)).toEqual([])
    const withoutWater = { ...data, habits: data.habits.filter((habit) => habit.id !== 'water') }
    const [a] = hallOfFame(withoutWater, TODAY)
    expect(a.quests.map((quest) => quest.habit.id)).toEqual(['read'])
    expect(a.questDays).toBe(9)
  })

  it('ohne bekannten Abschlusstag (alte Daten) zählt heute; ohne Frist kein onTime', () => {
    const legacy = makeMainQuest({
      id: 'L',
      startDay: D(-3),
      chapters: [makeChapter({ id: 'l1', criterion: { type: 'manual' }, manualDone: true })],
    })
    const [entry] = hallOfFame({ ...data, mainQuests: [legacy] }, TODAY)
    expect(entry).toMatchObject({ completedDay: TODAY, durationDays: 4, questDays: 0, questXp: 0 })
    expect(entry).not.toHaveProperty('onTime')
    expect(entry).not.toHaveProperty('deadline')
    expect(entry.chapters).toEqual([{ id: 'l1', title: 'Kapitel l1' }])
  })
})
