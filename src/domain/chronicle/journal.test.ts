import { describe, expect, it, vi } from 'vitest'

// Der Satz des Wochenrückblicks kommt aus dem Inhalt (`reviewLines.ts`) – hier fest, damit die Tests nur die Chronik prüfen.
vi.mock('./reviewLines', () => ({ reviewLine: (_facts: unknown, seed: string) => `Satz ${seed}` }))

import { BOSSES } from '../combat/bosses'
import { CLASS_DEFINITIONS } from '../combat/classDefinitions'
import { addDays, compareDays, dayRange, startOfWeek } from '../dates'
import { deriveGameState } from '../engine'
import { dayHistory, xpTimeline } from '../statistics'
import {
  completeRange,
  makeAchievement,
  makeBossVictory,
  makeChapter,
  makeChest,
  makeCompanionDefinitions,
  makeCompletion,
  makeEndBoss,
  makeGameData,
  makeHabit,
  makeItemPurchase,
  makeLedgerEntry,
  makeMainQuest,
  makePurchase,
  makeReward,
} from '../testing'
import type { CharacterProfile, DayKey, GameData, GameState, JournalEvent, JournalEventKind } from '../types'
import { journalEvents } from './journal'

const W1 = '2026-10-05'
const TODAY = '2026-11-04'
const HERO_SEED = `${W1}Aria`

const FIRST_FLAME = makeAchievement('first-flame', (stats) => stats.questsCompleted, 1, {
  title: 'Erste Flamme',
  icon: '🔥',
  description: 'Deine erste Quest ist erledigt.',
})
const NO_ACHIEVEMENTS = { achievements: [] }
const BOSS = BOSSES[0]
const OTHER_BOSS = BOSSES[1]

const PROFILE: CharacterProfile = {
  name: 'Aria',
  avatar: '🧙',
  createdDay: W1,
  companion: { species: 'fox', name: 'Flink', chosenDay: '2026-10-10' },
}

/** Mittags am Tag `day` in lokaler Zeit (der Spieltag des Öffnens hängt am lokalen Tageswechsel). */
function localNoon(day: DayKey, hour = 12): number {
  const [year, month, date] = day.split('-').map(Number)
  return new Date(year, month - 1, date, hour, 0).getTime()
}

/**
 * Eine Heldin mit allem: tägliche schwere Stärke-Quest seit dem 05.10. (Level-Ups, Klasse ab der zweiten Woche),
 * eine gemeisterte Kampagne mit Endgegner, eine archivierte, zwei Boss-Siege, ein Erfolg, eine Niederlage, Einlösungen,
 * geöffnete Truhen und der Fuchs „Flink“.
 */
function richHero(): GameData {
  const quest = makeHabit({ id: 'h1', title: 'Training', difficulty: 'hard', attribute: 'strength', createdDay: W1 })
  const pizza = makeReward({ id: 'r1', title: 'Pizza bestellen', icon: '🍕', price: 400 })
  return makeGameData({
    profile: PROFILE,
    habits: [quest],
    completions: completeRange(quest, W1, '2026-11-03'),
    mainQuests: [
      makeMainQuest({
        id: 'm1',
        title: 'Der Weg der Kraft',
        icon: '💪',
        why: 'Weil ich stärker werden will.',
        reward: 'Neue Laufschuhe',
        startDay: W1,
        chapters: [
          makeChapter({ id: 'c1', title: 'Der erste Funke', criterion: { type: 'habit', habitId: 'h1', metric: 'completions', target: 5 } }),
          makeChapter({ id: 'c2', title: 'Durchhalten', criterion: { type: 'manual' }, manualDone: true, completedDay: '2026-10-20' }),
          makeChapter({ id: 'c3', title: 'Der Riese', criterion: { type: 'manual' }, manualDone: true, completedDay: '2026-10-28' }),
        ],
      }),
      makeMainQuest({ id: 'm2', title: 'Alte Pläne', icon: '🗺️', why: '  ', startDay: '2026-10-15', archived: true, createdAt: 1 }),
    ],
    bossVictories: [
      makeBossVictory('2026-10-12', { bossId: BOSS.id, day: '2026-10-16' }),
      makeBossVictory('2026-10-12', { bossId: OTHER_BOSS.id, day: '2026-10-17' }), // doppelt (kaputte Daten)
      makeBossVictory('2026-10-19', { bossId: OTHER_BOSS.id, day: '2026-10-22' }),
    ],
    achievementUnlocks: [{ id: 'first-flame', day: W1 }],
    hpLedger: [makeLedgerEntry('2026-10-14', { score: 'missed', defeat: { goldLost: 37 } })],
    rewards: [pizza],
    purchases: [
      makePurchase({ id: 'p1', day: '2026-10-25', createdAt: 1 }, pizza),
      makePurchase({ id: 'p2', day: '2026-10-25', createdAt: 2 }, pizza),
      makePurchase({ id: 'p1', day: '2026-10-25', createdAt: 1 }, pizza), // doppelt gespeichert
      makePurchase({ id: 'p3', day: '2026-10-30', createdAt: 3, title: 'Kinoabend', icon: '🎬', price: 250 }),
      makeItemPurchase('i1', 'streakFreeze', '2026-10-26'),
    ],
    chests: [
      makeChest('boss:2026-10-12', {
        foundDay: '2026-10-16',
        rarity: 'uncommon',
        content: { kind: 'gold', amount: 25 },
        openedAt: localNoon('2026-10-17'),
      }),
      // Kurz nach Mitternacht geöffnet: gehört (Tageswechsel 4 Uhr) noch zum 18.10.
      makeChest('quest:h1:2026-10-18', {
        foundDay: '2026-10-18',
        rarity: 'rare',
        content: { kind: 'item', itemId: 'streakFreeze' },
        openedAt: localNoon('2026-10-19', 2),
      }),
      makeChest('chapter:m1:c2', { foundDay: '2026-10-20' }), // ungeöffnet → kein Eintrag
    ],
  })
}

function richState(data: GameData, today: DayKey = TODAY): GameState {
  const state = deriveGameState(data, today, { achievements: [FIRST_FLAME] })
  const definitions = makeCompanionDefinitions()
  return {
    ...state,
    companion: { choice: PROFILE.companion!, definition: definitions.fox, stage: 1, daysToNextStage: 31, sleeping: false },
    mainQuests: state.mainQuests.map((campaign) =>
      campaign.quest.id === 'm1'
        ? {
            ...campaign,
            endBoss: {
              definition: makeEndBoss('custom', { name: 'Riese Grimmbart', icon: '🗿' }),
              chapterId: 'c3',
              awakened: true,
              maxHp: 1,
              hp: 0,
              defeated: true,
            },
          }
        : campaign,
    ),
  }
}

function eventsOn(events: JournalEvent[], day: DayKey): JournalEvent[] {
  return events.filter((event) => event.day === day)
}

function only(events: JournalEvent[], kind: JournalEventKind): JournalEvent[] {
  return events.filter((event) => event.kind === kind)
}

describe('journalEvents – alle Arten', () => {
  const data = richHero()
  const state = richState(data)
  const events = journalEvents(data, state, TODAY)

  it('kennt jede Ereignis-Art', () => {
    const kinds = new Set(events.map((event) => event.kind))
    const all: JournalEventKind[] = [
      'adventureStart', 'levelUp', 'classChange', 'chapter', 'campaignStart', 'campaignComplete', 'bossVictory',
      'endBossVictory', 'achievement', 'defeat', 'reward', 'chestOpened', 'companionChosen', 'companionStage',
      'weeklyReview',
    ]
    expect([...kinds].sort()).toEqual([...all].sort())
  })

  it('beginnt das Abenteuer ganz unten', () => {
    expect(events.at(-1)).toEqual({ day: W1, kind: 'adventureStart', icon: '🌅', text: 'Dein Abenteuer beginnt', detail: 'Aria bricht auf.' })
  })

  it('nimmt die Level-Ups aus der XP-Zeitleiste', () => {
    const expected = xpTimeline(dayHistory(data, TODAY)).levelUps
    expect(expected.length).toBeGreaterThan(3)
    expect(only(events, 'levelUp').map((event) => [event.day, event.text]).reverse()).toEqual(
      expected.map((up) => [up.day, `Level ${up.level} erreicht`]),
    )
    // Das letzte erreichte Level ist das heutige (vergangene Stichtage der Engine zählen manuelle Kapitel schon vor
    // ihrem Abschlusstag – die Zeitleiste ordnet sie ihrem Tag zu).
    expect(expected.at(-1)?.level).toBe(state.level.level)
    const rankUp = only(events, 'levelUp').find((event) => event.text === 'Level 3 erreicht')
    expect(rankUp?.detail).toBe('Neuer Rang: Lehrling')
  })

  it('meldet Klassenwechsel am Montag – genau wie die Engine sie zeigt', () => {
    const changes: [DayKey, string][] = []
    let previous = 'adventurer'
    for (let monday = W1; compareDays(monday, TODAY) <= 0; monday = addDays(monday, 7)) {
      const id = deriveGameState(data, monday).heroClass.definition.id
      if (id !== previous) changes.push([monday, `Neue Klasse: ${CLASS_DEFINITIONS[id].names.neutral}`])
      previous = id
    }
    expect(changes.length).toBeGreaterThan(0)
    expect(only(events, 'classChange').map((event) => [event.day, event.text]).reverse()).toEqual(changes)
    expect(changes[0][0]).toBe('2026-10-12')
  })

  it('erzählt Kampagnen: begonnen, Kapitel, Endgegner, gemeistert – auch archivierte', () => {
    expect(only(events, 'campaignStart')).toEqual([
      { day: '2026-10-15', kind: 'campaignStart', icon: '🗺️', text: 'Kampagne „Alte Pläne“ begonnen' },
      { day: W1, kind: 'campaignStart', icon: '💪', text: 'Kampagne „Der Weg der Kraft“ begonnen', detail: 'Weil ich stärker werden will.' },
    ])
    expect(only(events, 'chapter')).toEqual([
      { day: '2026-10-20', kind: 'chapter', icon: '📖', text: 'Kapitel „Durchhalten“ abgeschlossen', detail: '💪 Der Weg der Kraft' },
      { day: '2026-10-09', kind: 'chapter', icon: '📖', text: 'Kapitel „Der erste Funke“ abgeschlossen', detail: '💪 Der Weg der Kraft' },
    ])
    expect(only(events, 'endBossVictory')).toEqual([
      { day: '2026-10-28', kind: 'endBossVictory', icon: '🗿', text: 'Riese Grimmbart besiegt', detail: 'Endgegner von „Der Weg der Kraft“' },
    ])
    expect(only(events, 'campaignComplete')).toEqual([
      { day: '2026-10-28', kind: 'campaignComplete', icon: '🏆', text: 'Kampagne „Der Weg der Kraft“ gemeistert', detail: 'Deine Belohnung: Neue Laufschuhe' },
    ])
  })

  it('nennt gespeicherte Boss-Siege, Erfolge und Niederlagen freundlich', () => {
    expect(only(events, 'bossVictory')).toEqual([
      { day: '2026-10-22', kind: 'bossVictory', icon: OTHER_BOSS.icon, text: `${OTHER_BOSS.name} besiegt`, detail: OTHER_BOSS.defeatLine },
      { day: '2026-10-16', kind: 'bossVictory', icon: BOSS.icon, text: `${BOSS.name} besiegt`, detail: BOSS.defeatLine },
    ])
    expect(only(events, 'achievement')).toEqual([
      { day: W1, kind: 'achievement', icon: '🔥', text: 'Erfolg „Erste Flamme“ freigeschaltet', detail: 'Deine erste Quest ist erledigt.' },
    ])
    expect(only(events, 'defeat')).toEqual([
      { day: '2026-10-14', kind: 'defeat', icon: '🩹', text: 'Gefallen – und wieder aufgestanden', detail: 'Lohn des Heilers: 37 Gold' },
    ])
  })

  it('fasst Einlösungen je Tag und Belohnung zusammen – Gegenstände zählen nicht', () => {
    expect(only(events, 'reward')).toEqual([
      { day: '2026-10-30', kind: 'reward', icon: '🎬', text: 'Kinoabend eingelöst', detail: '250 Gold' },
      { day: '2026-10-25', kind: 'reward', icon: '🍕', text: 'Pizza bestellen eingelöst (2×)', detail: '800 Gold' },
    ])
  })

  it('zeigt geöffnete Truhen am Spieltag des Öffnens', () => {
    expect(only(events, 'chestOpened')).toEqual([
      { day: '2026-10-18', kind: 'chestOpened', icon: '🎁', text: 'Truhe geöffnet: Streak-Schutz', detail: 'Selten · Quest-Truhe' },
      { day: '2026-10-17', kind: 'chestOpened', icon: '🎁', text: 'Truhe geöffnet: 25 Gold', detail: 'Ungewöhnlich · Boss-Truhe' },
    ])
  })

  it('begleitet den Gefährten von der Wahl bis zur neuen Stufe (14. aktiver Tag)', () => {
    expect(only(events, 'companionChosen')).toEqual([
      { day: '2026-10-10', kind: 'companionChosen', icon: '🐾', text: 'Flink schließt sich dir an', detail: 'Art fox' },
    ])
    expect(only(events, 'companionStage')).toEqual([
      { day: '2026-10-18', kind: 'companionStage', icon: '🐾', text: 'Neue Stufe für Flink: fox-1', detail: 'Stufe 1.' },
    ])
  })

  it('hängt die Wochenrückblicke an den Sonntag der Woche', () => {
    const reviews = only(events, 'weeklyReview')
    expect(reviews.map((event) => event.day)).toEqual(['2026-11-01', '2026-10-25', '2026-10-18', '2026-10-11'])
    expect(reviews[0].text).toMatch(/^Wochenrückblick: [\d.]+ XP · 7 Perfekte Tage$/)
    expect(reviews[0].detail).toBe(`Satz ${HERO_SEED}:2026-10-26`)
    expect(reviews[0].icon).toBe('📜')
  })
})

describe('journalEvents – Reihenfolge', () => {
  const data = richHero()
  const events = journalEvents(data, richState(data), TODAY)

  it('neueste zuerst, nichts nach heute', () => {
    for (let i = 1; i < events.length; i++) expect(compareDays(events[i - 1].day, events[i].day)).toBeGreaterThanOrEqual(0)
    expect(events.every((event) => compareDays(event.day, TODAY) <= 0)).toBe(true)
  })

  it('an einem Tag in umgekehrter Erzählfolge (der Abschluss oben)', () => {
    const kinds = eventsOn(events, '2026-10-28').map((event) => event.kind)
    expect(kinds.filter((kind) => kind !== 'levelUp')).toEqual(['campaignComplete', 'endBossVictory'])
    if (kinds.includes('levelUp')) expect(kinds[0]).toBe('levelUp')
    const start = eventsOn(events, W1).map((event) => event.kind)
    expect(start[0]).toBe('achievement')
    expect(start.at(-1)).toBe('adventureStart')
    expect(start.indexOf('campaignStart')).toBeLessThan(start.indexOf('adventureStart'))
    // Sonntag: Der Wochenrückblick schließt den Tag ab.
    expect(eventsOn(events, '2026-10-18')[0].kind).toBe('weeklyReview')
  })

  it('ist unabhängig von der Reihenfolge der gespeicherten Listen', () => {
    const shuffled: GameData = {
      ...data,
      completions: [...data.completions].reverse(),
      purchases: [...(data.purchases ?? [])].reverse(),
      chests: [...(data.chests ?? [])].reverse(),
      hpLedger: [...(data.hpLedger ?? [])].reverse(),
    }
    expect(journalEvents(shuffled, richState(shuffled), TODAY)).toEqual(events)
  })
})

describe('journalEvents – keine Doppelten', () => {
  const data = richHero()
  const events = journalEvents(data, richState(data), TODAY)

  it('jedes Ereignis genau einmal', () => {
    const keys = events.map((event) => `${event.day}|${event.kind}|${event.text}`)
    expect(new Set(keys).size).toBe(keys.length)
  })

  it('doppelte Boss-Siege einer Woche: der erste gilt', () => {
    expect(eventsOn(events, '2026-10-17').some((event) => event.kind === 'bossVictory')).toBe(false)
  })

  it('das Endgegner-Kapitel erscheint als Endgegner, nicht zusätzlich als Kapitel', () => {
    expect(events.some((event) => event.text === 'Kapitel „Der Riese“ abgeschlossen')).toBe(false)
  })

  it('ohne Endgegner im Spielzustand bleibt das letzte Kapitel ein Kapitel', () => {
    const plain = deriveGameState(data, TODAY, { achievements: [FIRST_FLAME] })
    const withoutBoss = {
      ...plain,
      mainQuests: plain.mainQuests.map((campaign) => {
        const copy = { ...campaign }
        delete copy.endBoss
        return copy
      }),
    }
    const list = journalEvents(data, withoutBoss, TODAY)
    expect(list.some((event) => event.kind === 'endBossVictory')).toBe(false)
    expect(list.some((event) => event.text === 'Kapitel „Der Riese“ abgeschlossen')).toBe(true)
  })
})

describe('journalEvents – Randfälle', () => {
  it('ein frischer Held: nur der Abenteuerbeginn', () => {
    const data = makeGameData({ profile: { name: 'Bo', avatar: '🦊', createdDay: TODAY } })
    expect(journalEvents(data, deriveGameState(data, TODAY, NO_ACHIEVEMENTS), TODAY)).toEqual([
      { day: TODAY, kind: 'adventureStart', icon: '🌅', text: 'Dein Abenteuer beginnt', detail: 'Bo bricht auf.' },
    ])
  })

  it('ohne Helden und ohne Daten: nichts', () => {
    const data = makeGameData()
    expect(journalEvents(data, deriveGameState(data, TODAY, NO_ACHIEVEMENTS), TODAY)).toEqual([])
  })

  it('ohne Gefährten keine Gefährten-Einträge; Stufen vor der Wahl zählen nicht', () => {
    const data = richHero()
    const state = richState(data)
    const without = journalEvents(data, { ...state, companion: undefined }, TODAY)
    expect(without.some((event) => event.kind === 'companionChosen' || event.kind === 'companionStage')).toBe(false)

    const late = { ...state.companion!, choice: { ...state.companion!.choice, chosenDay: '2026-10-20' } }
    const list = journalEvents(data, { ...state, companion: late }, TODAY)
    expect(only(list, 'companionChosen').map((event) => event.day)).toEqual(['2026-10-20'])
    expect(only(list, 'companionStage')).toEqual([])
  })

  it('zählt Wochen ohne XP nicht als Rückblick', () => {
    const quest = makeHabit({ id: 'h', createdDay: W1 })
    const data = makeGameData({
      profile: { name: 'Bo', avatar: '🦊', createdDay: W1 },
      habits: [quest],
      completions: [makeCompletion(quest, '2026-10-21')],
    })
    const reviews = only(journalEvents(data, deriveGameState(data, TODAY, NO_ACHIEVEMENTS), TODAY), 'weeklyReview')
    // 20 XP plus 5 für den Perfekten Tag.
    expect(reviews).toEqual([
      {
        day: '2026-10-25',
        kind: 'weeklyReview',
        icon: '📜',
        text: 'Wochenrückblick: 25 XP · 1 Perfekter Tag',
        detail: `Satz ${W1}Bo:2026-10-19`,
      },
    ])
  })

  it('verschiebt nichts in die Zukunft und übergeht ungültige Tage', () => {
    const data = richHero()
    data.purchases = [makePurchase({ id: 'x', day: '2026-13-01' }), makePurchase({ id: 'y', day: '2026-11-10' })]
    data.bossVictories = [makeBossVictory('2026-11-02', { bossId: BOSS.id, day: '2026-11-06' })]
    const list = journalEvents(data, richState(data), TODAY)
    expect(only(list, 'reward')).toEqual([])
    expect(only(list, 'bossVictory')).toEqual([])
  })

  it('kennt Titel und Rahmen aus Truhen beim Namen', () => {
    const data = richHero()
    data.chests = [
      makeChest('boss:2026-10-19', {
        foundDay: '2026-10-22',
        rarity: 'legendary',
        content: { kind: 'cosmetic', cosmeticKind: 'frame', cosmeticId: 'unbekannt' },
        openedAt: localNoon('2026-10-23'),
      }),
    ]
    const [chest] = only(journalEvents(data, richState(data), TODAY), 'chestOpened')
    expect(chest).toEqual({
      day: '2026-10-23',
      kind: 'chestOpened',
      icon: '🎁',
      text: 'Truhe geöffnet: ein neuer Rahmen',
      detail: 'Legendär · Boss-Truhe',
    })
  })

  it('bleibt bei drei Jahren Verlauf schnell', () => {
    const habits = ['strength', 'intellect', 'wisdom'].map((attribute, i) =>
      makeHabit({ id: `h${i}`, attribute: attribute as 'strength', createdDay: '2024-01-01', order: i }),
    )
    const today = '2026-12-30'
    const completions = habits.flatMap((habit, i) =>
      dayRange('2024-01-01', addDays(today, -1))
        .filter((_, day) => (day + i) % 3 !== 0)
        .map((day) => makeCompletion(habit, day)),
    )
    const data = makeGameData({ profile: { name: 'Bo', avatar: '🦊', createdDay: '2024-01-01' }, habits, completions })
    const state = deriveGameState(data, today, NO_ACHIEVEMENTS)
    const started = performance.now()
    const list = journalEvents(data, state, today)
    const elapsed = performance.now() - started
    expect(only(list, 'weeklyReview').length).toBeGreaterThan(150)
    expect(only(list, 'weeklyReview')[0].day).toBe(addDays(startOfWeek(today), -1))
    expect(elapsed).toBeLessThan(1500)
  })
})
