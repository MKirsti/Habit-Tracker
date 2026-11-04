/**
 * Unabhängige Prüfung der vier nachjustierten (milderen) HP-Regeln – jede Erwartung ist von Hand gerechnet, die
 * Rechnung steht jeweils daneben:
 * 1. Ein Tag ohne erledigte Tagesquest, aber mit einer anderen erledigten Quest (etwa einer Wochenquest) ist
 *    `weak` („Ein Anfang“) statt `missed`.
 * 2. `weak` kostet −1 statt −3.
 * 3. Durchhänger-Pause (ersetzt die frühere Abwesenheits-Regel „ab dem 4. Tag ohne Quest“): Nach
 *    `slumpPauseAfterDays` = 3 schadenden Tagen in Folge (`weak`/`missed` ohne Streak-Schutz; Ruhetage, „none“ und
 *    aufgefangene Tage zählen nicht und brechen nichts) ist jeder weitere schwache oder verpasste Tag `absent`
 *    („Pause“, 0 HP, kein Streak-Schutz) – bis zum nächsten guten oder perfekten Tag. Ein Durchhänger kostet so
 *    höchstens 3 schadende Tage (≤ 3 × −6 = −18), und etwas zu tun ist nie schlechter als nichts.
 * 4. Eine Niederlage kostet min(100, floor(15 % × Guthaben)) Gold.
 * Schon abgerechnete Einträge werden nie umgeschrieben.
 *
 * Kalender: 2026-11-02 ist ein Montag (D(0)). Level-Kurve (leveling.ts): Level 2 ab 100 XP, 3 ab 383, 4 ab 903,
 * 5 ab 1.703, 6 ab 2.821, 7 ab 4.291. Attribut-Kurve: Level 5 ab 519, 7 ab 1.194, 10 ab 2.811, 11 ab 3.522 XP.
 * Max-HP = 45 + 5 × Level (Level 1 → 50, 4 → 65, 6 → 75).
 */
import { describe, expect, it } from 'vitest'
import { BALANCING, DEFAULT_SETTINGS } from './balancing'
import { addDays, dayRange } from './dates'
import { deriveGameState } from './engine'
import { settleDays } from './hp'
import {
  makeCompletion,
  makeGameData,
  makeHabit,
  makeItemPurchase,
  makeLedgerEntry,
  makePurchase,
  makeRestPeriod,
  makeSideQuest,
} from './testing'
import type { Completion, DayKey, GameData, Habit, HpLedgerEntry } from './types'

const START: DayKey = '2026-11-02' // Montag
const D = (n: number): DayKey => addDays(START, n)

/** Held seit `createdDay` mit Lebenspunkten ab `since`. */
function hero(overrides: Partial<GameData> = {}, since: DayKey = START, createdDay: DayKey = START): GameData {
  return makeGameData({
    profile: { name: 'Ronja', avatar: '🛡️', createdDay },
    settings: { ...DEFAULT_SETTINGS, penalties: { enabled: true, since } },
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

/** Wie eine App, die jeden Tag geöffnet wird: Tag für Tag abrechnen und anhängen. */
function settleDaily(data: GameData, from: DayKey, lastToday: DayKey): GameData {
  let current = data
  for (const today of dayRange(from, lastToday)) current = withEntries(current, settleDays(current, today))
  return current
}

const view = (entries: readonly HpLedgerEntry[]) =>
  entries.map(({ day, score, hpDelta, hpAfter }) => ({ day, score, hpDelta, hpAfter }))
const scores = (entries: readonly HpLedgerEntry[]) => entries.map((entry) => entry.score)
const hpAfter = (entries: readonly HpLedgerEntry[]) => entries.map((entry) => entry.hpAfter)

/** `n` epische Nebenquests (je 80 XP, Attribut Intellekt), erledigt am Tag `day` – Nebenquests zählen nie als Anwesenheit. */
function epicSideQuests(n: number, day: DayKey) {
  return Array.from({ length: n }, (_, i) =>
    makeSideQuest({ id: `s${i}`, difficulty: 'epic', attribute: 'intellect', createdDay: day, doneDay: day }),
  )
}

describe('die vier Zahlen', () => {
  it('weak −1, Pause nach 3 schadenden Tagen, Niederlage 15 % und höchstens 100 Gold', () => {
    expect(BALANCING.hpByScore).toEqual({ perfect: 10, good: 2, weak: -1, missed: -6, rest: 0, none: 0, absent: 0 })
    expect(BALANCING.slumpPauseAfterDays).toBe(3)
    expect(BALANCING).not.toHaveProperty('absentAfterDays')
    expect(BALANCING.defeatGoldLoss).toBe(0.15)
    expect(BALANCING.defeatGoldLossMax).toBe(100)
  })
})

describe('Eine Woche nach den milderen Regeln (Regeln 1–3 im Zusammenspiel)', () => {
  const [a, b, c] = ['a', 'b', 'c'].map((id) => daily(id, { createdDay: D(-1) }))
  const w = weekly('w', { createdDay: D(-1) })
  // Vor der Umstellung abgerechnet: ein schwacher Tag kostete damals −3. Der Eintrag bleibt, wie er ist – und zählt
  // als schadender Tag (Zähler 1 zu Beginn von D0).
  const oldEntry = makeLedgerEntry(D(-1), { score: 'weak', hpDelta: -3, hpAfter: 30, maxHp: 50 })
  const data = hero(
    {
      habits: [a, b, c, w],
      completions: doneOn({ [D(0)]: [a, b, c], [D(1)]: [w], [D(2)]: [a], [D(8)]: [a, b] }),
      hpLedger: [oldEntry],
    },
    D(-1),
    D(-1),
  )
  // XP (bleibt unter 100 → immer Level 1, Max 50, keine Level-Up-Heilung):
  // D0 3 × 10 + round(25 % × 30) = 38; D1 +10 = 48; D2 +10 = 58 (Serie von a am Di gerissen, kein Bonus);
  // D8 +20 = 78.
  // Durchhänger-Zähler (schadende Tage in Folge) jeweils in Klammern.
  const expected = [
    { day: D(0), score: 'perfect', hpDelta: 10, hpAfter: 40 }, // Mo: 3 von 3 → 30 + 10 (0)
    { day: D(1), score: 'weak', hpDelta: -1, hpAfter: 39 }, // Di: nur die Wochenquest → Ein Anfang, 40 − 1 (1)
    { day: D(2), score: 'weak', hpDelta: -1, hpAfter: 38 }, // Mi: 1 von 3 → 39 − 1 (2)
    { day: D(3), score: 'missed', hpDelta: -6, hpAfter: 32 }, // Do: nichts → 38 − 6 (3)
    { day: D(4), score: 'absent', hpDelta: 0, hpAfter: 32 }, // Fr: Pause – die beiden schwachen Tage zählen mit
    { day: D(5), score: 'absent', hpDelta: 0, hpAfter: 32 }, // Sa: Pause
    { day: D(6), score: 'absent', hpDelta: 0, hpAfter: 32 }, // So: Pause
    { day: D(7), score: 'absent', hpDelta: 0, hpAfter: 32 }, // Mo: Pause
    { day: D(8), score: 'good', hpDelta: 2, hpAfter: 34 }, // Di: zurück, 2 von 3 → 32 + 2, Pause vorbei (0)
  ]

  it('Wertung und HP Tag für Tag', () => {
    const entries = settleThrough(data, D(8))
    expect(view(entries)).toEqual(expected)
    expect(entries.every((entry) => entry.maxHp === 50 && !entry.frozen && entry.defeat === undefined)).toBe(true)
    // Summe: +10 − 1 − 1 − 6 + 0 + 0 + 0 + 0 + 2 = +4 → 30 + 4 = 34.
    expect(entries.reduce((sum, entry) => sum + entry.hpDelta, 0)).toBe(4)
  })

  it('täglich abgerechnet = alles auf einmal; der alte Eintrag bleibt unverändert', () => {
    const everyDay = settleDaily(data, D(0), D(10))
    expect(everyDay.hpLedger?.[0]).toBe(oldEntry) // derselbe Eintrag, weiter mit −3
    expect(view(everyDay.hpLedger?.slice(1) ?? [])).toEqual(expected)
    // Zweiter Aufruf: nichts mehr offen.
    expect(settleDays(everyDay, D(10))).toEqual([])
    const state = deriveGameState(everyDay, D(10))
    expect(state.hp).toMatchObject({ current: 34, max: 50, settledThrough: D(8), defeats: 0 })
  })

  it('ein Ruhetag mitten im Durchhänger zählt nicht mit und bricht ihn nicht', () => {
    const rest = { ...data, restPeriods: [makeRestPeriod('r', D(3))] }
    expect(view(settleThrough(rest, D(8)))).toEqual([
      ...expected.slice(0, 3), // bis Mi wie oben: 40 (0), 39 (1), 38 (2)
      { day: D(3), score: 'rest', hpDelta: 0, hpAfter: 38 }, // Do: Ruhetag, zählt nicht (2)
      { day: D(4), score: 'missed', hpDelta: -6, hpAfter: 32 }, // Fr: 38 − 6 (3)
      { day: D(5), score: 'absent', hpDelta: 0, hpAfter: 32 }, // Sa: Pause
      { day: D(6), score: 'absent', hpDelta: 0, hpAfter: 32 }, // So: Pause
      { day: D(7), score: 'absent', hpDelta: 0, hpAfter: 32 }, // Mo: Pause
      { day: D(8), score: 'good', hpDelta: 2, hpAfter: 34 }, // Di: 32 + 2
    ])
  })
})

describe('Regel 1 + 2: „Ein Anfang“ (−1) auch ohne Tagesquest', () => {
  // Ein einzelner Tag D0 von vollen HP (Level 1, 50 HP); abgerechnet am D2.
  const a = daily('a')
  const b = daily('b')
  const w = weekly('w')

  it('nur eine Wochenquest erledigt → weak, 50 − 1 = 49; ohne sie → missed, 50 − 6 = 44', () => {
    const withWeekly = hero({ habits: [a, b, w], completions: doneOn({ [D(0)]: [w] }) })
    expect(view(settleThrough(withWeekly, D(0)))).toEqual([{ day: D(0), score: 'weak', hpDelta: -1, hpAfter: 49 }])
    const without = hero({ habits: [a, b, w] })
    expect(view(settleThrough(without, D(0)))).toEqual([{ day: D(0), score: 'missed', hpDelta: -6, hpAfter: 44 }])
  })

  it('eine Tagesquest außerhalb ihres Plans zählt ebenso (Sa, Mo–Fr-Quest erledigt) → weak, 49', () => {
    // D5 = Samstag 2026-11-07: fällig ist nur a, erledigt nur die Mo–Fr-Quest.
    const workdays = daily('wd', { createdDay: D(5), schedule: { type: 'weekdays', days: [1, 2, 3, 4, 5] } })
    const data = hero(
      { habits: [daily('a', { createdDay: D(5) }), workdays], completions: doneOn({ [D(5)]: [workdays] }) },
      D(5),
      D(5),
    )
    expect(view(settleThrough(data, D(5)))).toEqual([{ day: D(5), score: 'weak', hpDelta: -1, hpAfter: 49 }])
  })

  it('Nebenquests und Teilfortschritt sind keine erledigte Quest → missed, 44', () => {
    // Eine epische Nebenquest (80 XP, noch Level 1) am D0.
    const side = hero({ habits: [a, b], sideQuests: epicSideQuests(1, D(0)) })
    expect(view(settleThrough(side, D(0)))).toEqual([{ day: D(0), score: 'missed', hpDelta: -6, hpAfter: 44 }])
    // 4 von 10 Seiten gelesen: Teilfortschritt.
    const reading = daily('m', { measure: { target: 10, unit: 'Seiten' } })
    const partial = hero({ habits: [a, reading], completions: [makeCompletion(reading, D(0), { value: 4 })] })
    expect(view(settleThrough(partial, D(0)))).toEqual([{ day: D(0), score: 'missed', hpDelta: -6, hpAfter: 44 }])
  })

  it('ist gar keine Tagesquest fällig, bleibt es „none“ (0) – auch mit erledigter Wochenquest', () => {
    const data = hero({ habits: [w], completions: doneOn({ [D(0)]: [w] }) })
    expect(view(settleThrough(data, D(0)))).toEqual([{ day: D(0), score: 'none', hpDelta: 0, hpAfter: 50 }])
  })

  it('weak durch Anteil: 1 von 3 → −1 (früher −3)', () => {
    const c = daily('c')
    const data = hero({ habits: [a, b, c], completions: doneOn({ [D(0)]: [a] }) })
    expect(view(settleThrough(data, D(0)))).toEqual([{ day: D(0), score: 'weak', hpDelta: -1, hpAfter: 49 }])
  })

  it('Vorschau für gestern: nur eine Wochenquest → „Bleibt es so“ −1', () => {
    // Heute D2: D0 schon abgerechnet (missed, 44), gestern D1 offen mit nur der Wochenquest.
    const data = hero({ habits: [a, b, w], completions: doneOn({ [D(1)]: [w] }) })
    const settled = withEntries(data, settleDays(data, D(2)))
    expect(view(settled.hpLedger ?? [])).toEqual([{ day: D(0), score: 'missed', hpDelta: -6, hpAfter: 44 }])
    expect(deriveGameState(settled, D(2)).hp.yesterday).toEqual({
      day: D(1),
      score: 'weak',
      threatenedDelta: -1,
      savedByFreeze: false,
    })
  })
})

describe('Regel 3: Durchhänger-Pause nach 3 schadenden Tagen', () => {
  const a = daily('a')

  it('reine Abwesenheit von vollen HP: 3 × −6 = −18, danach 0 – nie eine Niederlage', () => {
    const entries = settleThrough(hero({ habits: [a] }), D(9))
    // D0 50 − 6 = 44 (1), D1 38 (2), D2 32 (3), ab D3 Pause.
    expect(scores(entries)).toEqual(['missed', 'missed', 'missed', ...Array(7).fill('absent')])
    expect(hpAfter(entries)).toEqual([44, 38, 32, 32, 32, 32, 32, 32, 32, 32])
    expect(entries.reduce((sum, entry) => sum + entry.hpDelta, 0)).toBe(-18)
    expect(entries.some((entry) => entry.defeat !== undefined)).toBe(false)
  })

  it('Grenze: mit 19 HP bleibt 1 übrig, mit 18 HP fällt der Held am 3. Tag (0 Gold → 0 Verlust)', () => {
    const at = (hp: number) =>
      settleThrough(hero({ habits: [a], hpLedger: [makeLedgerEntry(D(-1), { hpAfter: hp })] }), D(4))
    // 19 − 6 = 13, 13 − 6 = 7, 7 − 6 = 1, dann Pause.
    expect(hpAfter(at(19))).toEqual([13, 7, 1, 1, 1])
    // 18 − 6 = 12, 12 − 6 = 6, 6 − 6 = 0 → Niederlage, volle 50; D3/D4 Pause.
    const fallen = at(18)
    expect(view(fallen)).toEqual([
      { day: D(0), score: 'missed', hpDelta: -6, hpAfter: 12 },
      { day: D(1), score: 'missed', hpDelta: -6, hpAfter: 6 },
      { day: D(2), score: 'missed', hpDelta: -6, hpAfter: 50 },
      { day: D(3), score: 'absent', hpDelta: 0, hpAfter: 50 },
      { day: D(4), score: 'absent', hpDelta: 0, hpAfter: 50 },
    ])
    // Kein XP, kein Erfolg → Guthaben 0 → min(100, floor(15 % × 0)) = 0.
    expect(fallen[2].defeat).toEqual({ goldLost: 0 })
  })

  it('Ruhetage zählen nicht mit und setzen die Zählung nicht zurück', () => {
    // Ruhetag am D1: D0 (1), D1 Ruhetag (1), D2 (2), D3 (3), D4 → Pause.
    const early = settleThrough(hero({ habits: [a], restPeriods: [makeRestPeriod('r', D(1))] }), D(4))
    expect(scores(early)).toEqual(['missed', 'rest', 'missed', 'missed', 'absent'])
    expect(hpAfter(early)).toEqual([44, 44, 38, 32, 32])
    // Ruhetag am D3 (nach dem 3. schadenden Tag): Der Zähler bleibt 3 → D4 Pause, kein neuer Schaden.
    const late = settleThrough(hero({ habits: [a], restPeriods: [makeRestPeriod('r', D(3))] }), D(4))
    expect(scores(late)).toEqual(['missed', 'missed', 'missed', 'rest', 'absent'])
    expect(hpAfter(late)).toEqual([44, 38, 32, 32, 32])
  })

  it('eine Wochenquest in der Pause bleibt Pause (0) – sie beendet den Durchhänger nicht', () => {
    const w = weekly('w')
    const entries = settleThrough(hero({ habits: [a, w], completions: doneOn({ [D(3)]: [w] }) }), D(5))
    expect(view(entries)).toEqual([
      { day: D(0), score: 'missed', hpDelta: -6, hpAfter: 44 }, // (1)
      { day: D(1), score: 'missed', hpDelta: -6, hpAfter: 38 }, // (2)
      { day: D(2), score: 'missed', hpDelta: -6, hpAfter: 32 }, // (3)
      { day: D(3), score: 'absent', hpDelta: 0, hpAfter: 32 }, // nur die Wochenquest (wäre weak) → Pause, 0
      { day: D(4), score: 'absent', hpDelta: 0, hpAfter: 32 },
      { day: D(5), score: 'absent', hpDelta: 0, hpAfter: 32 },
    ])
  })

  it('eine Wochenquest pro Woche, sonst nichts: −1, −6, −6 (= −13), dann Pause bis zum nächsten guten Tag', () => {
    const w = weekly('w')
    // Jeden Montag (D0, D7, D14) nur die Wochenquest; am D15 endlich die Tagesquest.
    const data = hero({ habits: [a, w], completions: doneOn({ [D(0)]: [w], [D(7)]: [w], [D(14)]: [w], [D(15)]: [a] }) })
    const entries = settleThrough(data, D(16))
    // D0 weak 50 − 1 = 49 (1) · D1 missed 43 (2) · D2 missed 37 (3) · D3–D14 Pause (auch die Montage D7, D14 mit der
    // Wochenquest) · D15 perfekt 37 + 10 = 47 (0) · D16 missed 41 (1).
    expect(scores(entries)).toEqual(['weak', 'missed', 'missed', ...Array(12).fill('absent'), 'perfect', 'missed'])
    expect(hpAfter(entries)).toEqual([49, 43, 37, ...Array(12).fill(37), 47, 41])
    expect(entries.slice(0, 15).reduce((sum, entry) => sum + entry.hpDelta, 0)).toBe(-13) // −1 − 6 − 6
    // Nichts zu tun wäre nicht besser: −18 statt −13.
    const idle = settleThrough(hero({ habits: [a, w] }), D(14))
    expect(idle.reduce((sum, entry) => sum + entry.hpDelta, 0)).toBe(-18)
  })

  it('der Zähler beginnt mit der Abrechnung: Tage vor since zählen nicht', () => {
    // Held seit D0, nichts erledigt, Lebenspunkte erst ab D3: Der Zähler beginnt bei 0 → D3 44 (1), D4 38 (2),
    // D5 32 (3), D6 Pause.
    const fromD3 = settleThrough(hero({ habits: [a] }, D(3)), D(6))
    expect(view(fromD3)).toEqual([
      { day: D(3), score: 'missed', hpDelta: -6, hpAfter: 44 },
      { day: D(4), score: 'missed', hpDelta: -6, hpAfter: 38 },
      { day: D(5), score: 'missed', hpDelta: -6, hpAfter: 32 },
      { day: D(6), score: 'absent', hpDelta: 0, hpAfter: 32 },
    ])
  })

  it('Vorschau für gestern: am 3. schadenden Tag noch −6, dann „Pause“ ohne Drohung (und ohne Streak-Schutz)', () => {
    // Ein am D3 gekaufter Streak-Schutz kann D2 nicht retten (Kauftag danach) – und D3 braucht ihn nicht (Pause).
    const data = hero({ habits: [a], purchases: [makeItemPurchase('f', 'streakFreeze', D(3))] })
    // Heute D3: abgerechnet D0, D1 (44, 38; Zähler 2); gestern D2 wäre der 3. schadende Tag.
    const atD3 = withEntries(data, settleDays(data, D(3)))
    expect(hpAfter(atD3.hpLedger ?? [])).toEqual([44, 38])
    expect(deriveGameState(atD3, D(3)).hp.yesterday).toMatchObject({ day: D(2), score: 'missed', threatenedDelta: -6 })
    // Heute D4: abgerechnet bis D2 (32, Zähler 3); gestern D3 → Pause (absent), keine Drohung.
    const atD4 = withEntries(atD3, settleDays(atD3, D(4)))
    expect(hpAfter(atD4.hpLedger ?? [])).toEqual([44, 38, 32])
    const state = deriveGameState(atD4, D(4))
    expect(state.hp.yesterday).toEqual({ day: D(3), score: 'absent', threatenedDelta: 0, savedByFreeze: false })
    expect(state.inventory.streakFreezes).toBe(1)
    // Abgerechnet (am D5) bleibt es dabei: Pause, 32 HP, der Streak-Schutz bleibt im Vorrat.
    const atD5 = withEntries(atD4, settleDays(atD4, D(5)))
    expect(atD5.hpLedger?.at(-1)).toMatchObject({ day: D(3), score: 'absent', frozen: false, hpAfter: 32 })
    expect(deriveGameState(atD5, D(5)).inventory.streakFreezes).toBe(1)
  })
})

describe('Regel 4: Niederlage kostet höchstens 100 Gold', () => {
  it('Guthaben 2.000 → 100 Gold (früher 15 % = 300); danach volle HP und nach 3 schadenden Tagen Pause', () => {
    const a = daily('a')
    // 50 epische Nebenquests am D(-1): 50 × 80 = 4.000 XP → Level 6 (2.821 ≤ 4.000 < 4.291), Max-HP 75.
    // Gold aus XP: floor(4.000 × 0,5) = 2.000.
    // Erfolge: side-quests-1 (25), side-quests-10 (25), side-quests-50 (75), level-5 (25), gold-1000 (25; 2.000 Gold
    // aus XP), attribute-level-5 (25) und attribute-level-10 (75; Intellekt 4.000 XP ≥ 2.811), purchases-1 (25)
    // = 300. Ein Festmahl für 300 → Guthaben 2.000 + 300 − 300 = 2.000.
    const data = hero({
      habits: [a],
      sideQuests: epicSideQuests(50, D(-1)),
      purchases: [makePurchase({ id: 'feast', title: 'Festmahl', price: 300, day: D(-1) })],
      hpLedger: [makeLedgerEntry(D(-1), { hpAfter: 12, maxHp: 75 })],
    })

    const before = deriveGameState(data, D(1))
    expect(before.level.level).toBe(6)
    expect(before.gold).toMatchObject({ fromXp: 2000, fromAchievements: 300, spent: 300, lostToDefeats: 0, balance: 2000 })
    expect(
      before.achievements
        .filter((achievement) => achievement.unlocked)
        .map((achievement) => achievement.definition.id)
        .sort(),
    ).toEqual([
      'attribute-level-10',
      'attribute-level-5',
      'gold-1000',
      'level-5',
      'purchases-1',
      'side-quests-1',
      'side-quests-10',
      'side-quests-50',
    ])

    const entries = settleThrough(data, D(3))
    expect(view(entries)).toEqual([
      { day: D(0), score: 'missed', hpDelta: -6, hpAfter: 6 }, // 12 − 6 (Zähler 1)
      { day: D(1), score: 'missed', hpDelta: -6, hpAfter: 75 }, // 6 − 6 = 0 → Niederlage, volle 75 (2)
      { day: D(2), score: 'missed', hpDelta: -6, hpAfter: 69 }, // 75 − 6 (3) – die Niederlage beendet den Durchhänger nicht
      { day: D(3), score: 'absent', hpDelta: 0, hpAfter: 69 }, // Pause
    ])
    // min(100, floor(15 % × 2.000) = 300) = 100.
    expect(entries[1].defeat).toEqual({ goldLost: 100 })
    expect(entries.filter((entry) => entry.defeat !== undefined)).toHaveLength(1)

    const after = deriveGameState(withEntries(data, entries), D(5))
    // 2.000 + 300 − 300 − 100 = 1.900; Level und XP bleiben.
    expect(after.gold).toMatchObject({ lostToDefeats: 100, balance: 1900 })
    expect(after.level).toMatchObject({ level: 6, totalXp: 4000 })
    expect(after.hp).toMatchObject({ current: 69, max: 75, defeats: 1, lastDefeat: { day: D(1), goldLost: 100 } })
  })

  it('Guthaben 300 → 45 Gold (unter der Grenze, 15 % abgerundet); ausgelöst von einem −1-Tag bei 1 HP', () => {
    const a = daily('a')
    const w = weekly('w')
    // 15 epische Nebenquests am D(-1): 1.200 XP → Level 4 (903 ≤ 1.200 < 1.703), Max-HP 65.
    // Am D1 die Wochenquest: +10 XP (erste Woche, kein Streak-Bonus) → 1.210 XP, weiter Level 4.
    // Gold aus XP am Ende von D1: floor(1.210 × 0,5) = 605.
    // Erfolge: side-quests-1 (25), side-quests-10 (25), attribute-level-5 (25; Intellekt 1.200 XP → Level 7, < 10),
    // purchases-1 (25) = 100 (gold-1000, level-5, quests-10: nein). Stiefel für 405 → 605 + 100 − 405 = 300.
    const data = hero({
      habits: [a, w],
      completions: doneOn({ [D(1)]: [w] }),
      sideQuests: epicSideQuests(15, D(-1)),
      purchases: [makePurchase({ id: 'boots', title: 'Neue Stiefel', price: 405, day: D(-1) })],
      hpLedger: [makeLedgerEntry(D(-1), { hpAfter: 7, maxHp: 65 })],
    })

    const before = deriveGameState(data, D(1))
    expect(before.level.level).toBe(4)
    expect(before.gold).toMatchObject({ fromXp: 605, fromAchievements: 100, spent: 405, lostToDefeats: 0, balance: 300 })

    const entries = settleThrough(data, D(2))
    expect(view(entries)).toEqual([
      { day: D(0), score: 'missed', hpDelta: -6, hpAfter: 1 }, // 7 − 6 (Zähler 1)
      { day: D(1), score: 'weak', hpDelta: -1, hpAfter: 65 }, // nur die Wochenquest: 1 − 1 = 0 → Niederlage, volle 65 (2)
      { day: D(2), score: 'missed', hpDelta: -6, hpAfter: 59 }, // 65 − 6 (3)
    ])
    // min(100, floor(15 % × 300) = 45) = 45.
    expect(entries[1].defeat).toEqual({ goldLost: 45 })

    const after = deriveGameState(withEntries(data, entries), D(4))
    expect(after.gold).toMatchObject({ lostToDefeats: 45, balance: 255 }) // 300 − 45
    expect(after.hp).toMatchObject({ current: 59, max: 65, defeats: 1, lastDefeat: { day: D(1), goldLost: 45 } })
  })
})
