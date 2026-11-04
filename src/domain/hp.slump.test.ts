/**
 * Unabhängige Prüfung der Durchhänger-Pause (ersetzt die frühere Abwesenheits-Regel) – jede Erwartung ist von Hand
 * gerechnet, die Rechnung steht daneben. Die Regel:
 * - Ein schadender Tag ist `weak` oder `missed`, den kein Streak-Schutz auffängt.
 * - Chronologisch läuft ein Zähler schadender Tage in Folge: schadender Tag → +1; `perfect`/`good` → 0; `rest`,
 *   `none` und aufgefangene Tage zählen nicht und brechen nichts; ein abgerechneter `absent`-Eintrag hält die Pause.
 * - Zähler unmittelbar vor einem Tag ≥ 3 und der Tag wäre `weak`/`missed` → `absent` („Pause“): 0 HP, kein
 *   Streak-Schutz. Reihenfolge: erst Pause, dann Streak-Schutz, dann Schaden.
 * HP: perfect +10, good +2, weak −1, missed −6, sonst 0.
 *
 * Kalender: 2026-11-02 ist ein Montag (D(0)). Alle Szenarien bleiben unter 100 XP → immer Level 1, Max-HP 50, keine
 * Level-Up-Heilung (die XP stehen jeweils daneben). In Klammern hinter einem Tag steht der Zähler nach dem Tag.
 */
import { describe, expect, it } from 'vitest'
import { BALANCING, DEFAULT_SETTINGS } from './balancing'
import { addDays, dayRange } from './dates'
import { deriveGameState } from './engine'
import { settleDays } from './hp'
import { dayHistory } from './statistics'
import { makeCompletion, makeGameData, makeHabit, makeItemPurchase, makeLedgerEntry, makeRestPeriod } from './testing'
import type { Completion, DayKey, DayScore, GameData, Habit, HpLedgerEntry, Purchase } from './types'

const START: DayKey = '2026-11-02' // Montag
const D = (n: number): DayKey => addDays(START, n)

/** Held seit `createdDay` mit Lebenspunkten ab `since` (`since: null` → Lebenspunkte an, aber nie abgerechnet). */
function hero(overrides: Partial<GameData> = {}, since: DayKey | null = START, createdDay: DayKey = START): GameData {
  return makeGameData({
    profile: { name: 'Ronja', avatar: '🛡️', createdDay },
    settings: {
      ...DEFAULT_SETTINGS,
      penalties: since === null ? { enabled: true } : { enabled: true, since },
    },
    ...overrides,
  })
}

/** Leichte Tagesquest (10 XP). */
function daily(id: string, overrides: Partial<Habit> = {}): Habit {
  return makeHabit({ id, difficulty: 'easy', createdDay: START, ...overrides })
}

/** Leichte Wochenquest (1 × pro Woche, nie fällig). */
function weekly(id: string, overrides: Partial<Habit> = {}): Habit {
  return daily(id, { schedule: { type: 'weekly', times: 1 }, ...overrides })
}

function doneOn(plan: Record<DayKey, Habit[]>): Completion[] {
  return Object.entries(plan).flatMap(([day, habits]) => habits.map((habit) => makeCompletion(habit, day)))
}

function withEntries(data: GameData, entries: readonly HpLedgerEntry[]): GameData {
  return { ...data, hpLedger: [...(data.hpLedger ?? []), ...entries] }
}

/** Alles bis einschließlich `through` auf einmal abrechnen (wie die App am Tag `through + 2`). */
function settleThrough(data: GameData, through: DayKey): HpLedgerEntry[] {
  return settleDays(data, addDays(through, 2))
}

/** Wie eine App, die jeden Tag geöffnet wird: Tag für Tag bis zum Spieltag `lastToday` abrechnen und anhängen. */
function settleDaily(data: GameData, from: DayKey, lastToday: DayKey): GameData {
  let current = data
  for (const today of dayRange(from, lastToday)) current = withEntries(current, settleDays(current, today))
  return current
}

const scores = (entries: readonly HpLedgerEntry[]) => entries.map((entry) => entry.score)
const hpAfter = (entries: readonly HpLedgerEntry[]) => entries.map((entry) => entry.hpAfter)
const deltas = (entries: readonly HpLedgerEntry[]) => entries.map((entry) => entry.hpDelta)
const frozen = (entries: readonly HpLedgerEntry[]) => entries.map((entry) => entry.frozen)
const sum = (values: readonly number[]) => values.reduce((total, value) => total + value, 0)
const repeat = <T>(value: T, n: number): T[] => Array.from({ length: n }, () => value)

describe('Durchhänger-Pause: Zahl', () => {
  it('slumpPauseAfterDays = 3, absentAfterDays gibt es nicht mehr', () => {
    expect(BALANCING.slumpPauseAfterDays).toBe(3)
    expect(Object.keys(BALANCING)).not.toContain('absentAfterDays')
  })
})

describe('(a) reine Abwesenheit von vollen 50 HP', () => {
  const a = daily('a')
  const data = hero({ habits: [a] })

  it('44, 38, 32 – danach 10 Tage Pause', () => {
    const entries = settleThrough(data, D(12))
    // D0 50 − 6 = 44 (1) · D1 38 (2) · D2 32 (3) · D3–D12 Pause (Zähler bleibt 3): 10 × 0.
    expect(scores(entries)).toEqual([...repeat<DayScore>('missed', 3), ...repeat<DayScore>('absent', 10)])
    expect(hpAfter(entries)).toEqual([44, 38, 32, ...repeat(32, 10)])
    expect(deltas(entries)).toEqual([-6, -6, -6, ...repeat(0, 10)])
    // Summe: 3 × −6 = −18 – nie mehr, egal wie lange die Abwesenheit dauert.
    expect(sum(deltas(entries))).toBe(-18)
    expect(entries.every((entry) => entry.maxHp === 50 && !entry.frozen && entry.defeat === undefined)).toBe(true)
  })

  it('täglich abgerechnet = alles auf einmal; hp.current = 32', () => {
    // Am Spieltag D14 ist bis D12 abgerechnet (Gnadenfrist: D13 ist noch offen).
    const everyDay = settleDaily(data, D(0), D(14))
    expect(everyDay.hpLedger).toEqual(settleThrough(data, D(12)))
    expect(deriveGameState(everyDay, D(14)).hp.current).toBe(32)
  })
})

describe('(b) nur eine Wochenquest pro Woche, drei Wochen lang', () => {
  const [a, b] = ['a', 'b'].map((id) => daily(id))
  const w = weekly('w')
  // w am Montag D0, D7, D14, sonst nichts. XP: 10 + round(10 × 1,05) + round(10 × 1,10) = 10 + 11 + 11 = 32.
  const plan: Record<DayKey, Habit[]> = { [D(0)]: [w], [D(7)]: [w], [D(14)]: [w] }
  const data = hero({ habits: [a, b, w], completions: doneOn(plan) })

  it('−1, −6, −6 (zusammen −13), dann Pause – auch an den Tagen nur mit der Wochenquest', () => {
    const entries = settleThrough(data, D(20))
    // D0 nur w → weak 49 (1) · D1 missed 43 (2) · D2 missed 37 (3) · D3–D20 Pause (18 Tage, darunter D7 und D14 mit
    // der Wochenquest – sie wären weak, in der Pause also absent).
    expect(scores(entries)).toEqual(['weak', 'missed', 'missed', ...repeat<DayScore>('absent', 18)])
    expect(hpAfter(entries)).toEqual([49, 43, 37, ...repeat(37, 18)])
    expect(sum(deltas(entries))).toBe(-13) // −1 − 6 − 6
    expect(entries.find((entry) => entry.day === D(7))?.score).toBe('absent')
    expect(entries.find((entry) => entry.day === D(14))?.score).toBe('absent')
  })

  it('etwas zu tun ist nie schlechter als nichts: ganz ohne Wochenquest −18', () => {
    const idle = settleThrough(hero({ habits: [a, b, w] }), D(20))
    // D0 44, D1 38, D2 32, dann Pause → −18 < −13.
    expect(sum(deltas(idle))).toBe(-18)
    expect(sum(deltas(settleThrough(data, D(20))))).toBeGreaterThan(sum(deltas(idle)))
  })

  it('erst ein guter Tag beendet die Pause (+2), danach zählt es wieder von vorn', () => {
    // D21 (Mo) a erledigt: 1 von 2 = 50 % → good 37 + 2 = 39 (0) · D22 nichts → missed 33 (1). XP: 32 + 10 = 42.
    const more = hero({ habits: [a, b, w], completions: doneOn({ ...plan, [D(21)]: [a] }) })
    const entries = settleThrough(more, D(22))
    expect(entries.slice(-2).map(({ day, score, hpDelta, hpAfter: after }) => ({ day, score, hpDelta, after }))).toEqual([
      { day: D(21), score: 'good', hpDelta: 2, after: 39 },
      { day: D(22), score: 'missed', hpDelta: -6, after: 33 },
    ])
    expect(settleDaily(more, D(0), D(24)).hpLedger).toEqual(entries)
  })
})

describe('(c) ein guter Tag mitten im Durchhänger setzt den Zähler zurück', () => {
  const [a, b, c] = ['a', 'b', 'c'].map((id) => daily(id))
  // Jede Erledigung folgt auf einen Tag ohne dieselbe Quest → nie ein Streak-Bonus, je 10 XP.
  // XP: D0 10, D1 10, D2 20, D3 10, D4 10, D5 10, D6 10 = 80 (< 100, Level 1).
  const data = hero({
    habits: [a, b, c],
    completions: doneOn({
      [D(0)]: [a],
      [D(1)]: [b],
      [D(2)]: [a, c],
      [D(3)]: [b],
      [D(4)]: [a],
      [D(5)]: [c],
      [D(6)]: [b],
    }),
  })

  it('weak, weak, good, weak, weak, weak – dann Pause', () => {
    const entries = settleThrough(data, D(8))
    // D0 1/3 weak 49 (1) · D1 1/3 weak 48 (2) · D2 2/3 good 48 + 2 = 50 (0) · D3 weak 49 (1) · D4 weak 48 (2) ·
    // D5 weak 47 (3) · D6 1/3 → wäre weak, Pause 47 · D7 nichts → Pause 47 · D8 nichts → Pause 47.
    expect(scores(entries)).toEqual(['weak', 'weak', 'good', 'weak', 'weak', 'weak', 'absent', 'absent', 'absent'])
    expect(hpAfter(entries)).toEqual([49, 48, 50, 49, 48, 47, 47, 47, 47])
    expect(deltas(entries)).toEqual([-1, -1, 2, -1, -1, -1, 0, 0, 0])
    expect(settleDaily(data, D(0), D(10)).hpLedger).toEqual(entries)
  })

  it('ohne den guten Tag beginnt die Pause schon am 4. Tag', () => {
    // D2 nur a statt a + c: D0 weak 49 (1) · D1 weak 48 (2) · D2 weak 47 (3) · D3–D6 Pause.
    const noGoodDay = hero({
      habits: [a, b, c],
      completions: doneOn({ [D(0)]: [a], [D(1)]: [b], [D(2)]: [a], [D(3)]: [b], [D(4)]: [a], [D(5)]: [c], [D(6)]: [b] }),
    })
    const entries = settleThrough(noGoodDay, D(6))
    expect(scores(entries)).toEqual(['weak', 'weak', 'weak', 'absent', 'absent', 'absent', 'absent'])
    expect(hpAfter(entries)).toEqual([49, 48, 47, 47, 47, 47, 47])
  })
})

describe('(d) Ruhetage im Durchhänger zählen nicht und beenden die Pause nicht', () => {
  const a = daily('a')
  const data = hero({
    habits: [a],
    // D8 a erledigt: 10 + round(25 % × 10) = 13 XP.
    completions: doneOn({ [D(8)]: [a] }),
    restPeriods: [makeRestPeriod('r1', D(1)), makeRestPeriod('r2', D(5), D(6))],
  })

  it('missed, Ruhetag, missed, missed, Pause, Ruhetage, weiter Pause, perfekter Tag beendet sie', () => {
    const entries = settleThrough(data, D(9))
    // D0 missed 44 (1) · D1 Ruhetag 44 (1) · D2 missed 38 (2) · D3 missed 32 (3) · D4 Pause 32 (3) ·
    // D5, D6 Ruhetage 32 (3) · D7 Pause 32 – die Ruhetage haben die Pause nicht beendet · D8 perfect 42 (0) ·
    // D9 missed 36 (1).
    expect(scores(entries)).toEqual([
      'missed',
      'rest',
      'missed',
      'missed',
      'absent',
      'rest',
      'rest',
      'absent',
      'perfect',
      'missed',
    ])
    expect(hpAfter(entries)).toEqual([44, 44, 38, 32, 32, 32, 32, 32, 42, 36])
    expect(settleDaily(data, D(0), D(11)).hpLedger).toEqual(entries)
  })
})

describe('(e) Streak-Schutz am ersten verpassten Tag, die Pause verbraucht den zweiten nicht', () => {
  const a = daily('a')
  // Streak-Schutz 1 am D0, Streak-Schutz 2 erst am D4 (schon in der Pause) gekauft.
  // D7 a erledigt: 10 + round(25 % × 10) = 13 XP.
  const purchases: Purchase[] = [makeItemPurchase('f1', 'streakFreeze', D(0)), makeItemPurchase('f2', 'streakFreeze', D(4))]
  const data = hero({ habits: [a], purchases, completions: doneOn({ [D(7)]: [a] }) })

  it('frozen, −6, −6, −6, Pause ohne Verbrauch, perfekter Tag, dann rettet der zweite einen Tag', () => {
    const entries = settleThrough(data, D(9))
    // D0 missed, Streak-Schutz 1 → frozen, 50 (0 – aufgefangen zählt nicht) · D1 missed 44 (1) · D2 38 (2) ·
    // D3 32 (3) · D4 Pause 32 – erst die Pause prüfen: kein Streak-Schutz nötig, Nr. 2 bleibt im Vorrat ·
    // D5, D6 Pause 32 · D7 perfect 42 (0) · D8 missed → Streak-Schutz 2, frozen, 42 (0) · D9 missed 36 (1).
    expect(scores(entries)).toEqual([
      'missed',
      'missed',
      'missed',
      'missed',
      'absent',
      'absent',
      'absent',
      'perfect',
      'missed',
      'missed',
    ])
    expect(frozen(entries)).toEqual([true, false, false, false, false, false, false, false, true, false])
    expect(hpAfter(entries)).toEqual([50, 44, 38, 32, 32, 32, 32, 42, 42, 36])
    expect(settleDaily(data, D(0), D(11)).hpLedger).toEqual(entries)
  })

  it('Vorrat: während der Pause 1 (2 gekauft − 1 verbraucht), nach D8 0', () => {
    const atD9 = settleDaily(data, D(0), D(9)) // abgerechnet bis D7
    expect(atD9.hpLedger?.at(-1)?.day).toBe(D(7))
    expect(deriveGameState(atD9, D(9)).inventory.streakFreezes).toBe(1)
    const atD10 = settleDaily(atD9, D(10), D(10)) // + D8 (frozen)
    expect(deriveGameState(atD10, D(10)).inventory.streakFreezes).toBe(0)
  })
})

describe('(f) altes Ledger mit einem absent-Eintrag: die Pause läuft weiter', () => {
  const [a, b, c] = ['a', 'b', 'c'].map((id) => daily(id, { createdDay: D(-5) }))
  // Abgerechnet nach der alten Regel: D(-2) good (40 HP), D(-1) absent (40 HP). Zähler nach dem Ledger: good → 0,
  // absent → max(0, 3) = 3 → die Pause läuft. D1 a + b erledigt (20 XP).
  const legacy = [
    makeLedgerEntry(D(-2), { score: 'good', hpDelta: 2, hpAfter: 40 }),
    makeLedgerEntry(D(-1), { score: 'absent', hpDelta: 0, hpAfter: 40 }),
  ]
  const data = hero({ habits: [a, b, c], hpLedger: legacy, completions: doneOn({ [D(1)]: [a, b] }) }, D(-2), D(-5))

  it('Pause, good beendet sie, danach wieder 3 schadende Tage bis zur nächsten Pause', () => {
    const entries = settleThrough(data, D(5))
    // D0 nichts → Pause 40 (3) · D1 2/3 good 42 (0) · D2 missed 36 (1) · D3 30 (2) · D4 24 (3) · D5 Pause 24.
    expect(scores(entries)).toEqual(['absent', 'good', 'missed', 'missed', 'missed', 'absent'])
    expect(hpAfter(entries)).toEqual([40, 42, 36, 30, 24, 24])
    // Die alten Einträge werden nie umgeschrieben (nur neue Tage ab D0).
    expect(entries[0].day).toBe(D(0))
    const everyDay = settleDaily(data, D(0), D(7))
    expect(everyDay.hpLedger?.slice(0, 2)).toEqual(legacy)
    expect(everyDay.hpLedger?.slice(2)).toEqual(entries)
  })

  it('Gegenprobe: ohne den absent-Eintrag wäre D0 ein verpasster Tag (−6)', () => {
    const noLegacyPause = { ...data, hpLedger: [legacy[0], makeLedgerEntry(D(-1), { score: 'none', hpAfter: 40 })] }
    // good → 0, none → 0 → D0 missed 34 (1).
    expect(settleThrough(noLegacyPause, D(0))).toMatchObject([{ day: D(0), score: 'missed', hpAfter: 34 }])
  })

  it('Vorschau für gestern am D1: Pause ohne Drohung', () => {
    expect(deriveGameState(data, D(1)).hp.yesterday).toEqual({
      day: D(0),
      score: 'absent',
      threatenedDelta: 0,
      savedByFreeze: false,
    })
  })

  it('Statistik: vor dem Beginn der Abrechnung live, danach Ledger, Vorschau und heute nach derselben Regel', () => {
    const atD7 = settleDaily(data, D(0), D(7)) // abgerechnet bis D5, D6 offen (Vorschau), D7 heute
    const history = dayHistory(atD7, D(7))
    expect(history.from).toBe(D(-5))
    // Live (vor since = D(-2), Zähler ab Beginn der Historie): D(-5) missed (1), D(-4) missed (2), D(-3) missed (3).
    // Ab D(-2) zählt nur das Ledger (Zähler neu ab 0): good (0), absent (3), dann die Abrechnung von oben;
    // D6 Vorschau: Pause (3); D7 heute: Pause.
    expect(history.days.map((stat) => stat.score)).toEqual([
      'missed',
      'missed',
      'missed',
      'good',
      'absent',
      'absent',
      'good',
      'missed',
      'missed',
      'missed',
      'absent',
      'absent',
      'absent',
    ])
  })
})

describe('(g) Statistik und Abrechnung werten dieselbe Geschichte gleich', () => {
  // Tagesquests nur Mo–Fr (Sa/So → none), dazu eine Wochenquest; Ruhetag am D9 (Mi).
  const [a, b, c] = ['a', 'b', 'c'].map((id) => daily(id, { schedule: { type: 'weekdays', days: [1, 2, 3, 4, 5] } }))
  const w = weekly('w')
  const plan: Record<DayKey, Habit[]> = {
    [D(0)]: [a],
    [D(2)]: [a, b],
    [D(4)]: [w],
    [D(8)]: [a],
    [D(11)]: [a, b, c],
  }
  // XP (jede Erledigung nach einem verpassten Plantag → kein Streak-Bonus): 10 + 20 + 10 + 10 + 30 + round(25 % × 30)
  // = 10 + 20 + 10 + 10 + 30 + 8 = 88 (< 100, Level 1).
  const restPeriods = [makeRestPeriod('r', D(9))]
  const TODAY = D(17)

  // Wertung (Zähler danach) und HP:
  // D0 Mo 1/3 weak 49 (1) · D1 Di missed 43 (2) · D2 Mi 2/3 good 45 (0) · D3 Do missed 39 (1) ·
  // D4 Fr nur w → weak 38 (2) · D5 Sa none (2) · D6 So none (2) · D7 Mo missed 32 (3) ·
  // D8 Di 1/3 → Pause 32 · D9 Mi Ruhetag (3) · D10 Do Pause · D11 Fr 3/3 perfect 42 (0) · D12 Sa none · D13 So none ·
  // D14 Mo missed 36 (1) · D15 Di missed 30 (2) · D16 Mi missed (3; offen: Vorschau −6) · D17 Do heute → Pause.
  const expected: DayScore[] = [
    'weak',
    'missed',
    'good',
    'missed',
    'weak',
    'none',
    'none',
    'missed',
    'absent',
    'rest',
    'absent',
    'perfect',
    'none',
    'none',
    'missed',
    'missed',
    'missed',
    'absent',
  ]

  it('Abrechnung: Wertung und HP wie von Hand gerechnet', () => {
    const data = hero({ habits: [a, b, c, w], completions: doneOn(plan), restPeriods })
    const settled = settleDaily(data, D(0), TODAY) // abgerechnet bis D15
    const ledger = settled.hpLedger ?? []
    expect(scores(ledger)).toEqual(expected.slice(0, 16))
    expect(hpAfter(ledger)).toEqual([49, 43, 45, 39, 38, 38, 38, 32, 32, 32, 32, 42, 42, 42, 36, 30])
    const state = deriveGameState(settled, TODAY)
    expect(state.hp.current).toBe(30)
    expect(state.hp.yesterday).toEqual({ day: D(16), score: 'missed', threatenedDelta: -6, savedByFreeze: false })
  })

  it('dayHistory mit Ledger: abgerechnete Tage = Ledger, gestern = Vorschau, heute nach derselben Regel', () => {
    const data = hero({ habits: [a, b, c, w], completions: doneOn(plan), restPeriods })
    const settled = settleDaily(data, D(0), TODAY)
    const days = dayHistory(settled, TODAY).days
    expect(days.map((stat) => stat.score)).toEqual(expected)
    const ledger = settled.hpLedger ?? []
    for (const entry of ledger) expect(days.find((stat) => stat.day === entry.day)?.score).toBe(entry.score)
    expect(days.filter((stat) => stat.settled)).toHaveLength(16)
  })

  it('dayHistory ganz ohne Abrechnung (kein since): live nach derselben Regel', () => {
    const live = hero({ habits: [a, b, c, w], completions: doneOn(plan), restPeriods }, null)
    const days = dayHistory(live, TODAY).days
    expect(days.map((stat) => stat.score)).toEqual(expected)
    expect(days.some((stat) => stat.settled)).toBe(false)
  })

  it('Tage vor since zählen live, die Abrechnung beginnt ihren Zähler bei 0 – die Statistik genauso', () => {
    const only = daily('a')
    const data = hero({ habits: [only] }, D(3))
    // Heute D4, noch nichts abgerechnet: D0–D2 live missed (Zähler 1, 2, 3), ab since neu ab 0: D3 Vorschau missed
    // (−6, Zähler 1), D4 heute missed (Zähler 1 davor – keine Pause, obwohl live schon 5 Tage nichts geschah).
    expect(dayHistory(data, D(4)).days.map((stat) => stat.score)).toEqual(repeat<DayScore>('missed', 5))
    expect(deriveGameState(data, D(4)).hp.yesterday).toMatchObject({ day: D(3), score: 'missed', threatenedDelta: -6 })
    const settled = settleDaily(data, D(3), D(8)) // abgerechnet D3–D6, D7 offen, D8 heute
    // Abrechnung ab since = D3 mit Zähler 0: D3 44 (1) · D4 38 (2) · D5 32 (3) · D6 Pause 32.
    expect(scores(settled.hpLedger ?? [])).toEqual(['missed', 'missed', 'missed', 'absent'])
    expect(hpAfter(settled.hpLedger ?? [])).toEqual([44, 38, 32, 32])
    // Statistik: D0–D2 live (1, 2, 3 → alle drei noch missed), ab D3 nur das Ledger (neu ab 0): D3–D5 missed,
    // D6 Pause, D7 Vorschau Pause, D8 heute Pause.
    expect(dayHistory(settled, D(8)).days.map((stat) => stat.score)).toEqual([
      ...repeat<DayScore>('missed', 6),
      ...repeat<DayScore>('absent', 3),
    ])
  })

  it('Lücke im Ledger (etwa nach dem Wiederherstellen): Lückentage zählen weder bei der Abrechnung noch in der Statistik', () => {
    const only = daily('a')
    // Abgerechnet D0, D1 (Zähler 2), dann Lücke D2–D4 (nie abgerechnet), since = D5.
    const ledger = [
      makeLedgerEntry(D(0), { score: 'missed', hpDelta: -6, hpAfter: 44 }),
      makeLedgerEntry(D(1), { score: 'missed', hpDelta: -6, hpAfter: 38 }),
    ]
    const data = hero({ habits: [only], hpLedger: ledger }, D(5))
    const settled = settleDaily(data, D(5), D(9)) // abgerechnet D5–D7, D8 offen, D9 heute
    // Abrechnung: Zähler aus dem Ledger = 2 → D5 missed 32 (3) · D6 Pause · D7 Pause.
    expect((settled.hpLedger ?? []).slice(2).map(({ day, score, hpAfter: after }) => ({ day, score, after }))).toEqual([
      { day: D(5), score: 'missed', after: 32 },
      { day: D(6), score: 'absent', after: 32 },
      { day: D(7), score: 'absent', after: 32 },
    ])
    // Statistik: D0, D1 Ledger · D2–D4 live mit Zähler 2 → missed (zählen nicht mit) · D5–D7 Ledger · D8 Vorschau
    // Pause · D9 heute Pause.
    expect(dayHistory(settled, D(9)).days.map((stat) => stat.score)).toEqual([
      ...repeat<DayScore>('missed', 6),
      ...repeat<DayScore>('absent', 4),
    ])
  })
})

describe('(h) Vorschau für gestern in der Pause', () => {
  const a = daily('a')
  // Ein Streak-Schutz, gekauft am D3: kann D2 nicht retten (Kauftag danach), D3 braucht ihn nicht (Pause).
  const data = hero({ habits: [a], purchases: [makeItemPurchase('f', 'streakFreeze', D(3))] })

  it('am 3. schadenden Tag droht noch −6, danach „Pause“ mit threatenedDelta 0', () => {
    // Heute D3: abgerechnet D0, D1 (44, 38 → Zähler 2); gestern D2 wäre der 3. schadende Tag → −6 (der am D3
    // gekaufte Streak-Schutz kann ihn nicht retten).
    const atD3 = settleDaily(data, D(0), D(3))
    expect(hpAfter(atD3.hpLedger ?? [])).toEqual([44, 38])
    expect(deriveGameState(atD3, D(3)).hp.yesterday).toEqual({
      day: D(2),
      score: 'missed',
      threatenedDelta: -6,
      savedByFreeze: false,
    })
    // Heute D4: abgerechnet bis D2 (44, 38, 32 → Zähler 3); gestern D3 → Pause, keine Drohung, kein Streak-Schutz.
    const atD4 = settleDaily(atD3, D(4), D(4))
    expect(hpAfter(atD4.hpLedger ?? [])).toEqual([44, 38, 32])
    const state = deriveGameState(atD4, D(4))
    expect(state.hp.yesterday).toEqual({ day: D(3), score: 'absent', threatenedDelta: 0, savedByFreeze: false })
    expect(state.hp.current).toBe(32)
    expect(state.inventory.streakFreezes).toBe(1)
    // Statistik zeigt dasselbe: D3 offen als Pause, heute (D4) ebenfalls Pause.
    const history = dayHistory(atD4, D(4))
    expect(history.days.slice(-2).map(({ day, score, open, frozen: f }) => ({ day, score, open, frozen: f }))).toEqual([
      { day: D(3), score: 'absent', open: true, frozen: false },
      { day: D(4), score: 'absent', open: true, frozen: false },
    ])
  })

  it('auch am Tag nur mit einer Wochenquest bleibt die Vorschau in der Pause bei 0', () => {
    const w = weekly('w')
    // D3 (Do) nur die Wochenquest: wäre weak (−1), in der Pause (Zähler 3 nach D0–D2) aber absent.
    const withWeekly = hero({ habits: [a, w], completions: doneOn({ [D(3)]: [w] }) })
    const atD4 = settleDaily(withWeekly, D(0), D(4))
    expect(deriveGameState(atD4, D(4)).hp.yesterday).toEqual({
      day: D(3),
      score: 'absent',
      threatenedDelta: 0,
      savedByFreeze: false,
    })
  })
})
