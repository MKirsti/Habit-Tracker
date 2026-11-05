/**
 * Phase 3b in der Engine – plus die Nachbesserungen 3a, soweit sie über `deriveGameState` wirken:
 * Gefährte (Stufe, Schlaf, Treffer gegen den Wochen-Boss), Kampagnen-Endgegner, Endgegner-Truhe, Klassen-Trägheit über
 * die Wochenfolge, Boss-Vielfalt über ein Jahr, Laufzeit.
 */
import { describe, expect, it } from 'vitest'
import { BALANCING, DEFAULT_SETTINGS } from './balancing'
import { unrecordedVictories } from './combat/boss'
import { unrecordedChests } from './combat/chests'
import { addDays, dayRange } from './dates'
import { deriveGameState, evaluateMainQuests } from './engine'
import type { DeriveOptions } from './engine'
import { xpToNextAttributeLevel } from './leveling'
import {
  completeRange,
  makeBossRoster,
  makeChapter,
  makeCompanionChoice,
  makeCompanionDefinitions,
  makeCompletion,
  makeEndBossRoster,
  makeGameData,
  makeHabit,
  makeLedgerEntry,
  makeMainQuest,
  makeRestPeriod,
  makeSideQuest,
} from './testing'
import type { AttributeId, CompanionChoice, DayKey, GameData, SideQuest } from './types'

// Kalender-Referenz: 2026-10-26 und 2026-11-02 sind Montage.
const START: DayKey = '2026-10-26'
const WEEK: DayKey = '2026-11-02'
const PROFILE = { name: 'Aria', avatar: '🧝', createdDay: START }
const OPTIONS: DeriveOptions = {
  companions: makeCompanionDefinitions(),
  combat: { bosses: makeBossRoster(), endBosses: makeEndBossRoster() },
}

/** Tägliche mittlere Stärke-Quest (20 XP). */
const workout = makeHabit({ id: 'workout', attribute: 'strength', difficulty: 'medium', createdDay: START })
/** Tägliche leichte Weisheits-Quest (10 XP). */
const meditate = makeHabit({ id: 'meditate', attribute: 'wisdom', difficulty: 'easy', createdDay: START, order: 1 })

function hero(overrides: Partial<GameData> = {}, companion?: CompanionChoice): GameData {
  return makeGameData({ profile: { ...PROFILE, ...(companion !== undefined ? { companion } : {}) }, ...overrides })
}

const fox = makeCompanionChoice('fox', { name: 'Flink', chosenDay: START })

describe('Phase 3b – Gefährte im Spielzustand', () => {
  it('fehlt, solange keiner gewählt ist (auch bei kaputter Art)', () => {
    expect(deriveGameState(hero({ habits: [workout] }), WEEK, OPTIONS).companion).toBeUndefined()
    const broken = { ...fox, species: 'cat' } as unknown as CompanionChoice
    expect(deriveGameState(hero({ habits: [workout] }, broken), WEEK, OPTIONS).companion).toBeUndefined()
  })

  it('Stufe nach den aktiven Tagen insgesamt, Tage bis zur nächsten Stufe', () => {
    const completions = completeRange(workout, START, addDays(START, 19)) // 20 aktive Tage
    const state = deriveGameState(hero({ habits: [workout], completions }, fox), addDays(START, 19), OPTIONS)
    expect(state.totals.activeDays).toBe(20)
    expect(state.companion).toMatchObject({ choice: fox, stage: 1, daysToNextStage: 40, sleeping: false })
    expect(state.companion?.definition).toEqual(OPTIONS.companions?.fox)
  })

  it('Standard-Inhalt ohne Optionen: die Definition der gewählten Art', () => {
    const state = deriveGameState(hero({ habits: [workout] }, fox), WEEK)
    expect(state.companion?.definition.species).toBe('fox')
    expect(state.companion?.stage).toBe(0)
    expect(state.companion?.daysToNextStage).toBe(14)
  })

  it('schläft nach 3 vollen Tagen ohne Quest – eine heute erledigte weckt ihn', () => {
    const data = hero({ habits: [workout], completions: completeRange(workout, START, '2026-11-01') }, fox)
    expect(deriveGameState(data, '2026-11-04', OPTIONS).companion?.sleeping).toBe(false) // Mo, Di
    expect(deriveGameState(data, '2026-11-05', OPTIONS).companion?.sleeping).toBe(true) // Mo, Di, Mi
    const woke = { ...data, completions: [...data.completions, makeCompletion(workout, '2026-11-05')] }
    expect(deriveGameState(woke, '2026-11-05', OPTIONS).companion?.sleeping).toBe(false)
    // Er geht nie verloren: Stufe und Wahl bleiben.
    expect(deriveGameState(data, '2026-12-24', OPTIONS).companion).toMatchObject({ choice: fox, stage: 0, sleeping: true })
  })

  it('ein frisch gewählter Gefährte schläft nicht sofort, auch nach langer Pause', () => {
    const data = hero({ habits: [workout], completions: completeRange(workout, START, '2026-10-28') }, { ...fox, chosenDay: '2026-11-20' })
    expect(deriveGameState(data, '2026-11-20', OPTIONS).companion?.sleeping).toBe(false)
    expect(deriveGameState(data, '2026-11-24', OPTIONS).companion?.sleeping).toBe(true)
  })

  it('schläft in einer laufenden Durchhänger-Pause (laut Ledger) – bis heute ein guter Tag gelingt', () => {
    const since: DayKey = '2026-10-29'
    const ledger = [
      makeLedgerEntry('2026-10-29', { score: 'perfect' }),
      makeLedgerEntry('2026-10-30', { score: 'weak', hpDelta: -1 }),
      makeLedgerEntry('2026-10-31', { score: 'weak', hpDelta: -1 }),
      makeLedgerEntry('2026-11-01', { score: 'weak', hpDelta: -1 }),
    ]
    const completions = [
      ...completeRange(workout, START, '2026-11-01'), // jeden Tag etwas erledigt – „3 Tage ohne Quest“ greift nicht
      ...completeRange(meditate, START, '2026-10-29'),
    ]
    const data = hero(
      { habits: [workout, meditate], completions, hpLedger: ledger, settings: { ...DEFAULT_SETTINGS, penalties: { enabled: true, since } } },
      fox,
    )
    expect(deriveGameState(data, '2026-11-02', OPTIONS).companion?.sleeping).toBe(true)
    // Heute 1 von 2 Tagesquests (50 % → guter Tag): die Pause endet, er wacht auf.
    const good = { ...data, completions: [...data.completions, makeCompletion(workout, '2026-11-02')] }
    expect(deriveGameState(good, '2026-11-02', OPTIONS).companion?.sleeping).toBe(false)
    // Ein guter Tag im Ledger beendet die Pause ebenfalls.
    const ended = { ...data, hpLedger: [...ledger, makeLedgerEntry('2026-11-02', { score: 'good', hpDelta: 2 })] }
    expect(deriveGameState(ended, '2026-11-03', OPTIONS).companion?.sleeping).toBe(false)
  })
})

describe('Phase 3b – der Gefährte trifft an Perfekten Tagen mit', () => {
  // Woche 02.11.: nur Training (täglich, mittel). Ohne XP davor: Level 1, Schwäche = Stärke (einziges Attribut)
  // → 20 × 1,5 = 30 je Erledigung; geplant 7 × 20 = 140 → 98 HP.
  const week = (days: DayKey[], companion?: CompanionChoice, extra: Partial<GameData> = {}) =>
    hero({ habits: [workout], completions: days.map((day) => makeCompletion(workout, day)), ...extra }, companion)

  it('je Perfektem Tag der Woche (bis heute) ein Treffer: round(10 % des Quest-Schadens), sourceId = Art', () => {
    const state = deriveGameState(week([WEEK, '2026-11-03'], fox), '2026-11-03', OPTIONS)
    const boss = state.bosses.current
    expect(boss?.attacks.map((hit) => [hit.day, hit.source, hit.sourceId, hit.damage])).toEqual([
      [WEEK, 'quest', 'workout', 30],
      [WEEK, 'companion', 'fox', 3],
      ['2026-11-03', 'quest', 'workout', 30],
      ['2026-11-03', 'companion', 'fox', 3],
    ])
    expect(boss?.attacks[1]).toMatchObject({ attackName: 'Flink', attribute: 'strength', weakness: false })
    expect(boss).toMatchObject({ maxHp: 98, damage: 66, hp: 32 })
  })

  it('zählt nicht in die geplanten Boss-HP – und kann den Sieg bringen', () => {
    const days = dayRange(WEEK, '2026-11-05') // 4 × 30 = 120 ≥ 98 auch ohne Gefährten
    const without = deriveGameState(week(days.slice(0, 3)), '2026-11-04', OPTIONS).bosses.current
    const withFox = deriveGameState(week(days.slice(0, 3), fox), '2026-11-04', OPTIONS).bosses.current
    expect(withFox?.maxHp).toBe(without?.maxHp)
    expect(without).toMatchObject({ damage: 90, defeated: false })
    expect(withFox).toMatchObject({ damage: 99, defeated: true, defeatedDay: '2026-11-04' })
    expect(unrecordedVictories([withFox], undefined)).toEqual([
      { weekStart: WEEK, bossId: withFox?.boss.id, day: '2026-11-04', maxHp: 98 },
    ])
  })

  it('kein Treffer an Tagen, die nicht perfekt sind (auch an Ruhetagen) – und erst ab dem Tag der Wahl', () => {
    const notPerfect = hero(
      {
        habits: [workout, meditate],
        completions: [makeCompletion(workout, WEEK), makeCompletion(meditate, WEEK), makeCompletion(workout, '2026-11-03')],
      },
      fox,
    )
    const hits = (data: GameData, today: DayKey) =>
      (deriveGameState(data, today, OPTIONS).bosses.current?.attacks ?? []).filter((hit) => hit.source === 'companion').map((hit) => hit.day)
    expect(hits(notPerfect, '2026-11-03')).toEqual([WEEK]) // Dienstag: Meditieren fehlt
    const rest = week([WEEK, '2026-11-03'], fox, { restPeriods: [makeRestPeriod('r', '2026-11-03')] })
    expect(hits(rest, '2026-11-03')).toEqual([WEEK]) // Ruhetag: kein Perfekter Tag
    expect(hits(week([WEEK, '2026-11-03'], { ...fox, chosenDay: '2026-11-03' }), '2026-11-03')).toEqual(['2026-11-03'])
    expect(hits(week([WEEK, '2026-11-03']), '2026-11-03')).toEqual([]) // ohne Gefährten
  })

  it('trifft auch gegen den Vorwochen-Boss: ein am Montag nachgetragener Sonntag wird ein Perfekter Tag', () => {
    const data = week(dayRange(WEEK, '2026-11-07'), fox)
    const companionDays = () =>
      (deriveGameState(data, '2026-11-09', OPTIONS).bosses.previous?.attacks ?? [])
        .filter((hit) => hit.source === 'companion')
        .map((hit) => hit.day)
    expect(companionDays()).toEqual(dayRange(WEEK, '2026-11-07'))
    data.completions.push(makeCompletion(workout, '2026-11-08')) // Sonntag nachgetragen
    expect(companionDays()).toEqual(dayRange(WEEK, '2026-11-08'))
  })
})

describe('Phase 3b – Kampagnen-Endgegner', () => {
  const counter = (id: string, counterValue: number, target: number) =>
    makeChapter({ id, criterion: { type: 'counter', target, label: 'Bücher' }, counter: counterValue })

  it('das letzte Kapitel – erwacht, wenn alle anderen erledigt sind; HP = Ziel − Fortschritt', () => {
    const quest = makeMainQuest({
      id: 'q1',
      blueprint: { id: 'body', level: 'beginner', pathId: 'strength' },
      chapters: [
        makeChapter({ id: 'c1', criterion: { type: 'manual' }, manualDone: true, completedDay: WEEK }),
        counter('c2', 3, 10),
      ],
    })
    const state = deriveGameState(hero({ mainQuests: [quest] }), '2026-11-04', OPTIONS)
    expect(state.mainQuests[0].endBoss).toEqual({
      definition: makeEndBossRoster()['body:strength'],
      chapterId: 'c2',
      awakened: true,
      maxHp: 10,
      hp: 7,
      defeated: false,
    })
  })

  it('auch für archivierte Kampagnen; ohne Kapitel keiner; evaluateMainQuests gleich', () => {
    const archived = makeMainQuest({ id: 'old', archived: true, chapters: [counter('a', 1, 5), counter('b', 5, 5)] })
    const empty = makeMainQuest({ id: 'empty' })
    const data = hero({ mainQuests: [archived, empty] })
    const state = deriveGameState(data, '2026-11-04', OPTIONS)
    expect(state.archivedMainQuests[0].endBoss).toMatchObject({
      definition: makeEndBossRoster().custom,
      chapterId: 'b',
      awakened: false,
      hp: 0,
      defeated: true,
    })
    expect(state.mainQuests[0].endBoss).toBeUndefined()
    const evaluated = evaluateMainQuests(data, '2026-11-04')
    expect(evaluated[0].endBoss).toMatchObject({ chapterId: 'b', defeated: true })
    expect(evaluated[1].endBoss).toBeUndefined()
  })
})

describe('Phase 3b – Endgegner-Truhe je gemeisterter Kampagne', () => {
  const mastered = (id: string, days: [DayKey, DayKey], archived = false) =>
    makeMainQuest({
      id,
      archived,
      chapters: [
        makeChapter({ id: 'c1', criterion: { type: 'manual' }, manualDone: true, completedDay: days[0] }),
        makeChapter({ id: 'c2', criterion: { type: 'manual' }, manualDone: true, completedDay: days[1] }),
      ],
    })

  it('Fundtag = Abschlusstag (spätestes Kapitel), Seltenheit mindestens selten – auch archiviert', () => {
    const data = hero({ mainQuests: [mastered('q1', ['2026-11-03', WEEK]), mastered('q2', [WEEK, '2026-11-04'], true)] })
    const chests = deriveGameState(data, '2026-11-04', OPTIONS).chests.filter((chest) => chest.source === 'campaign')
    expect(chests.map((chest) => [chest.id, chest.foundDay])).toEqual([
      ['campaign:q1', '2026-11-03'],
      ['campaign:q2', '2026-11-04'],
    ])
    for (const chest of chests) expect(['rare', 'legendary']).toContain(chest.rarity)
  })

  it('nicht gemeistert oder außerhalb des Fensters: keine; gespeichert bleibt sie, wie sie ist', () => {
    const open = makeMainQuest({ id: 'open', chapters: [makeChapter({ id: 'c', criterion: { type: 'manual' } })] })
    const old = mastered('old', ['2026-10-01', '2026-10-05'])
    const data = hero({ mainQuests: [open, old, mastered('q1', [WEEK, WEEK])] })
    const state = deriveGameState(data, '2026-11-04', OPTIONS)
    expect(state.chests.filter((chest) => chest.source === 'campaign').map((chest) => chest.id)).toEqual(['campaign:q1'])
    const recorded = { ...data, chests: unrecordedChests(state.chests, undefined) }
    const later = deriveGameState(recorded, '2026-12-01', OPTIONS)
    expect(later.chests).toEqual(state.chests) // dauerhaft, auch außerhalb des Fensters
  })
})

// ---------------------------------------------------------------------------
// Nachbesserungen 3a über die Engine
// ---------------------------------------------------------------------------

/** Gesamt-XP für genau Level `level` (Attribut-Kurve), auf volle 10 aufgerundet (so passt es in Nebenquests). */
function xpForLevel(level: number): number {
  let xp = 0
  for (let l = 1; l < level; l++) xp += xpToNextAttributeLevel(l)
  return Math.ceil(xp / 10) * 10
}

/** Nebenquests (exakte XP ohne Streak-Bonus), damit am Ende jeder Woche genau diese Level erreicht sind. */
function levelSideQuests(weeks: Partial<Record<AttributeId, number>>[], from: DayKey): SideQuest[] {
  const quests: SideQuest[] = []
  const reached: Partial<Record<AttributeId, number>> = {}
  weeks.forEach((week, i) => {
    const day = addDays(from, 7 * i + 2)
    for (const [attribute, level] of Object.entries(week) as [AttributeId, number][]) {
      let missing = xpForLevel(level) - (reached[attribute] ?? 0)
      reached[attribute] = (reached[attribute] ?? 0) + Math.max(0, missing)
      for (let n = 0; missing > 0; n++) {
        quests.push(makeSideQuest({ id: `${attribute}-${i}-${n}`, attribute, difficulty: 'easy', doneDay: day }))
        missing -= 10
      }
    }
  })
  return quests
}

describe('Nachbesserung 3a – Klassen-Trägheit in der Engine', () => {
  it('kein Flackern zwischen Kampfmagier und Kriegerin, wenn der Abstand zwischen 1 und 2 pendelt', () => {
    const levels = [
      { strength: 4, intellect: 3 },
      { strength: 5, intellect: 3 },
      { strength: 5, intellect: 4 },
      { strength: 6, intellect: 4 },
      { strength: 6, intellect: 5 },
      { strength: 7, intellect: 5 },
    ]
    const data = hero({ sideQuests: levelSideQuests(levels, START) })
    const mondays = levels.map((_, i) => addDays(START, 7 * (i + 1)))
    const states = mondays.map((monday) => deriveGameState(data, monday, OPTIONS).heroClass)
    expect(states.map((state) => state.definition.id)).toEqual(Array(6).fill('battlemage'))
    expect(states.map((state) => state.previousId)).toEqual(['adventurer', undefined, undefined, undefined, undefined, undefined])
    expect(states[1].attributeLevels).toMatchObject({ strength: 5, intellect: 3 }) // normal wäre das die Kriegerin
    expect(states[1].classBonus).toEqual({ strength: 0.1, intellect: 0.1 })
  })

  it('ein klarer Wechsel bleibt ein Wechsel (mit Wechsel-Szene)', () => {
    const levels = [{ strength: 4, intellect: 3 }, { strength: 7, intellect: 4 }]
    const data = hero({ sideQuests: levelSideQuests(levels, START) })
    const state = deriveGameState(data, addDays(START, 14), OPTIONS).heroClass
    expect(state.definition.id).toBe('warrior')
    expect(state.previousId).toBe('battlemage')
  })
})

describe('Nachbesserung 3a – Boss-Vielfalt über ein Jahr', () => {
  it('52 Wochen: nie derselbe Boss in zwei Wochen nacheinander – auch mit gespeicherten Siegen', () => {
    const daily = makeHabit({ id: 'd', attribute: 'vitality', difficulty: 'easy', createdDay: START })
    let data = hero({ habits: [daily] })
    const bosses: (string | undefined)[] = []
    for (let i = 0; i < 52; i++) {
      const monday = addDays(START, 7 * i)
      // Jede dritte Woche wird der Boss besiegt (alle Tage erledigt) und vom „Recorder“ gespeichert.
      if (i % 3 === 0) data = { ...data, completions: [...data.completions, ...completeRange(daily, monday, addDays(monday, 6))] }
      const sunday = deriveGameState(data, addDays(monday, 6), OPTIONS)
      const before = sunday.bosses.current?.boss.id
      data = { ...data, bossVictories: [...(data.bossVictories ?? []), ...unrecordedVictories([sunday.bosses.current], data.bossVictories)] }
      // Speichern ändert nichts – weder an dieser Woche noch an der nächsten.
      expect(deriveGameState(data, addDays(monday, 6), OPTIONS).bosses.current?.boss.id).toBe(before)
      bosses.push(before)
    }
    expect(bosses.every((id) => id !== undefined)).toBe(true)
    for (let i = 1; i < bosses.length; i++) expect(bosses[i], `Woche ${i}`).not.toBe(bosses[i - 1])
    expect(new Set(bosses).size).toBe(3) // nur Vitalität geplant: alle drei Bosse des Themas
  })

  it('der Boss einer laufenden Woche bleibt über die Woche gleich (gleiche Daten, anderer Tag)', () => {
    const data = hero({ habits: [workout, meditate] })
    const ids = dayRange(WEEK, '2026-11-08').map((day) => deriveGameState(data, day, OPTIONS).bosses.current?.boss.id)
    expect(new Set(ids).size).toBe(1)
  })
})

describe('Laufzeit', () => {
  it('drei Jahre, ein Thema, ohne gespeicherte Siege (längste Boss-Kette), mit Gefährte: zügig', () => {
    const start: DayKey = '2024-01-01'
    const today: DayKey = '2026-12-30'
    const habits = Array.from({ length: 8 }, (_, i) =>
      makeHabit({ id: `h${i}`, order: i, attribute: 'discipline', difficulty: i % 2 ? 'medium' : 'easy', createdDay: start }),
    )
    const days = dayRange(start, addDays(today, -1))
    const completions = habits.flatMap((habit, i) => days.filter((_, n) => (n + i) % 4 !== 0).map((day) => makeCompletion(habit, day)))
    const data = makeGameData({
      profile: { ...PROFILE, createdDay: start, companion: makeCompanionChoice('dragon', { chosenDay: start }) },
      settings: { ...DEFAULT_SETTINGS, penalties: { enabled: true, since: start } },
      habits,
      completions,
    })
    deriveGameState(data, today) // Aufwärmen
    const started = performance.now()
    const state = deriveGameState(data, today)
    const elapsed = performance.now() - started
    expect(state.companion?.stage).toBe(3)
    expect(state.bosses.current).toBeDefined()
    expect(BALANCING.companion.stageDays[3]).toBeLessThan(state.totals.activeDays)
    // Großzügig gegen quadratische Ausreißer (gemessen: ≈ 40–70 ms).
    expect(elapsed).toBeLessThan(1500)
  })
})
