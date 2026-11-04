import { describe, expect, it } from 'vitest'
import { BALANCING, DEFAULT_SETTINGS } from './balancing'
import { addDays, dayRange } from './dates'
import { deriveGameState, getDayState, totalXpTimeline } from './engine'
import {
  canUndoItemPurchase,
  classifyDay,
  hpDeltaForScore,
  isDamagingDay,
  isRestDay,
  isSlumpPause,
  maxHpForLevel,
  restDaySet,
  restPeriodOn,
  scoreByProgress,
  settleDays,
  slumpCountAfter,
  slumpCountOf,
} from './hp'
import {
  makeAchievement,
  makeCompletion,
  makeGameData,
  makeHabit,
  makeItemPurchase,
  makeLedgerEntry,
  makeMainQuest,
  makeChapter,
  makePurchase,
  makeRestPeriod,
  makeSideQuest,
  seededRandom,
} from './testing'
import type { Completion, DayKey, DayScore, GameData, Habit, HpLedgerEntry, Settings } from './types'

// Kalender-Referenz: 2026-11-02 ist ein Montag.
const START: DayKey = '2026-11-02'
/** Tag n des Abenteuers (D(0) = START). */
const D = (n: number): DayKey => addDays(START, n)

/** Held seit START mit Lebenspunkten ab START; `penalties: null` = noch nie abgerechnet (kein since). */
function hero(overrides: Partial<GameData> = {}, penalties: Settings['penalties'] | null = { enabled: true, since: START }): GameData {
  return makeGameData({
    profile: { name: 'Mira', avatar: '🧙', createdDay: START },
    settings: penalties === null ? { ...DEFAULT_SETTINGS } : { ...DEFAULT_SETTINGS, penalties },
    ...overrides,
  })
}

/** Leichte Tagesquest (10 XP), angelegt am Abenteuerbeginn. */
function daily(id: string, overrides: Partial<Habit> = {}): Habit {
  return makeHabit({ id, difficulty: 'easy', createdDay: START, ...overrides })
}

/** Erledigungen: je Tag die Quests, die erledigt wurden. */
function doneOn(plan: Record<DayKey, Habit[]>): Completion[] {
  return Object.entries(plan).flatMap(([day, habits]) => habits.map((habit) => makeCompletion(habit, day)))
}

function withEntries(data: GameData, entries: readonly HpLedgerEntry[]): GameData {
  return { ...data, hpLedger: [...(data.hpLedger ?? []), ...entries] }
}

/** Rechnet alle Tage bis einschließlich `through` ab (wie die App am Tag `through + 2`). */
function settleThrough(data: GameData, through: DayKey): HpLedgerEntry[] {
  return settleDays(data, addDays(through, 2))
}

/** Wie die App, die jeden Tag geöffnet wird: Tag für Tag abrechnen und anhängen. */
function settleDaily(data: GameData, lastToday: DayKey): GameData {
  let current = data
  for (const today of dayRange(START, lastToday)) current = withEntries(current, settleDays(current, today))
  return current
}

const scores = (entries: readonly HpLedgerEntry[]) => entries.map((entry) => entry.score)
const hpAfter = (entries: readonly HpLedgerEntry[]) => entries.map((entry) => entry.hpAfter)

describe('Tageswertung (rein)', () => {
  it('nach Anteil der Tagesquests: alle → perfect, ≥ 50 % → good, > 0 → weak, 0 → missed, keine fällig → none', () => {
    expect(scoreByProgress(3, 3)).toBe('perfect')
    expect(scoreByProgress(1, 1)).toBe('perfect')
    expect(scoreByProgress(4, 2)).toBe('good') // genau 50 %
    expect(scoreByProgress(2, 1)).toBe('good') // genau 50 %
    expect(scoreByProgress(3, 2)).toBe('good')
    expect(scoreByProgress(5, 3)).toBe('good') // 60 %
    expect(scoreByProgress(5, 2)).toBe('weak') // 40 %
    expect(scoreByProgress(3, 1)).toBe('weak') // 33 %
    expect(scoreByProgress(9, 4)).toBe('weak') // 44 %
    expect(scoreByProgress(9, 1)).toBe('weak')
    expect(scoreByProgress(3, 0)).toBe('missed')
    expect(scoreByProgress(0, 0)).toBe('none')
  })

  it('Reihenfolge: Ruhetag vor „keine fällig“ vor dem Anteil; in der Pause wird nur aus schwach/verpasst „absent“', () => {
    const facts = { requiredCount: 2, requiredDone: 0, active: false }
    expect(classifyDay(facts, { rest: true, pause: true })).toBe('rest')
    expect(classifyDay({ ...facts, requiredCount: 0 }, { rest: false, pause: true })).toBe('none')
    expect(classifyDay(facts, { rest: false, pause: false })).toBe('missed')
    // Pause: 0 von 2 (missed) → absent · 1 von 3 (weak) → absent · nur eine Wochenquest (weak) → absent.
    expect(classifyDay(facts, { rest: false, pause: true })).toBe('absent')
    expect(classifyDay({ requiredCount: 3, requiredDone: 1, active: true }, { rest: false, pause: true })).toBe('absent')
    expect(classifyDay({ ...facts, active: true }, { rest: false, pause: true })).toBe('absent')
    // 1 von 2 = 50 % → good, 2 von 2 → perfect: Gute Tage bleiben, was sie sind (und beenden die Pause).
    expect(classifyDay({ ...facts, requiredDone: 1, active: true }, { rest: false, pause: true })).toBe('good')
    expect(classifyDay({ ...facts, requiredDone: 2, active: true }, { rest: false, pause: true })).toBe('perfect')
  })

  it('Durchhänger-Zähler: schadende Tage +1, gut/perfekt → 0, „absent“ hält die Pause, Rest/none/aufgefangen zählen nicht', () => {
    expect(BALANCING.slumpPauseAfterDays).toBe(3)
    const day = (score: DayScore, frozen = false) => ({ score, frozen })
    expect(isDamagingDay(day('missed'))).toBe(true)
    expect(isDamagingDay(day('weak'))).toBe(true)
    expect(isDamagingDay(day('weak', true))).toBe(false)
    expect(isDamagingDay(day('absent'))).toBe(false)
    expect(slumpCountAfter(0, day('missed'))).toBe(1) // 0 + 1
    expect(slumpCountAfter(1, day('weak'))).toBe(2) // 1 + 1
    expect(slumpCountAfter(2, day('missed', true))).toBe(2) // aufgefangen: bleibt
    expect(slumpCountAfter(2, day('rest'))).toBe(2)
    expect(slumpCountAfter(2, day('none'))).toBe(2)
    expect(slumpCountAfter(5, day('good'))).toBe(0)
    expect(slumpCountAfter(5, day('perfect'))).toBe(0)
    expect(slumpCountAfter(0, day('absent'))).toBe(3) // alter Abwesenheits-Eintrag: max(0, 3) – die Pause läuft
    expect(slumpCountAfter(4, day('absent'))).toBe(4) // max(4, 3)
    // missed 1 · rest 1 · weak 2 · aufgefangen 2 · none 2 · missed 3 → Pause.
    const run = [day('missed'), day('rest'), day('weak'), day('missed', true), day('none'), day('missed')]
    expect(slumpCountOf(run)).toBe(3)
    expect(slumpCountOf([...run, day('good')])).toBe(0)
    expect(slumpCountOf([day('weak')], 2)).toBe(3) // Startwert 2 + 1
    expect([0, 1, 2, 3, 4].map(isSlumpPause)).toEqual([false, false, false, true, true])
  })

  it('keine Tagesquest erledigt, aber eine andere Quest (z. B. eine Wochenquest) → „weak“ statt „missed“', () => {
    const active = { requiredCount: 3, requiredDone: 0, active: true }
    expect(classifyDay(active, { rest: false, pause: false })).toBe('weak')
    expect(classifyDay({ ...active, active: false }, { rest: false, pause: false })).toBe('missed')
    // Nur „missed“ wird milder – die übrigen Wertungen bleiben, wie sie sind.
    expect(classifyDay({ ...active, requiredDone: 1 }, { rest: false, pause: false })).toBe('weak')
    expect(classifyDay({ ...active, requiredDone: 2 }, { rest: false, pause: false })).toBe('good')
    expect(classifyDay({ ...active, requiredDone: 3 }, { rest: false, pause: false })).toBe('perfect')
    expect(classifyDay({ ...active, requiredCount: 0 }, { rest: false, pause: false })).toBe('none')
    expect(classifyDay(active, { rest: true, pause: false })).toBe('rest')
  })

  it('HP-Wirkung je Wertung und Max-HP je Level', () => {
    expect(['perfect', 'good', 'weak', 'missed', 'rest', 'none', 'absent'].map((s) => hpDeltaForScore(s as never))).toEqual([
      10, 2, -1, -6, 0, 0, 0,
    ])
    expect(maxHpForLevel(1)).toBe(50)
    expect(maxHpForLevel(2)).toBe(55)
    expect(maxHpForLevel(10)).toBe(95)
    expect(maxHpForLevel(Number.NaN)).toBe(50)
  })
})

describe('settleDays – Zeitraum, Gnadenfrist, Idempotenz', () => {
  const habit = daily('h')

  it('ohne penalties.since wird nie abgerechnet (nie rückwirkend)', () => {
    expect(settleDays(hero({ habits: [habit] }, null), D(10))).toEqual([])
    expect(settleDays(hero({ habits: [habit] }, { enabled: true }), D(10))).toEqual([])
  })

  it('Gnadenfrist: gestern ist noch offen, abgerechnet wird bis vorgestern', () => {
    const data = hero({ habits: [habit] })
    expect(settleDays(data, START)).toEqual([])
    expect(settleDays(data, D(1))).toEqual([])
    expect(settleDays(data, D(2)).map((entry) => entry.day)).toEqual([START])
    expect(settleDays(data, D(5)).map((entry) => entry.day)).toEqual([D(0), D(1), D(2), D(3)])
  })

  it('beginnt nach dem letzten Ledger-Tag bzw. bei since – je nachdem, was später ist', () => {
    const data = hero({ habits: [habit], hpLedger: [makeLedgerEntry(D(2), { hpAfter: 40 })] })
    expect(settleDays(data, D(6)).map((entry) => entry.day)).toEqual([D(3), D(4)])
    const later = hero({ habits: [habit], hpLedger: [makeLedgerEntry(D(-5))] }, { enabled: true, since: START })
    expect(settleDays(later, D(3)).map((entry) => entry.day)).toEqual([D(0), D(1)])
  })

  it('idempotent: mit den neuen Einträgen im Ledger bringt ein zweiter Aufruf nichts', () => {
    const data = hero({ habits: [habit], completions: doneOn({ [D(1)]: [habit] }) })
    const first = settleDays(data, D(6))
    expect(first).toHaveLength(5)
    const settled = withEntries(data, first)
    expect(settleDays(settled, D(6))).toEqual([])
    expect(settleDays(settled, D(5))).toEqual([])
    // Am nächsten Tag kommt genau ein Tag dazu.
    expect(settleDays(settled, D(7)).map((entry) => entry.day)).toEqual([D(5)])
  })

  it('einmal abgerechnet bleibt abgerechnet: spätere Bearbeitungen ändern das Ledger nicht', () => {
    const data = hero({ habits: [habit] })
    const settled = withEntries(data, settleThrough(data, D(0)))
    // Nachträglich (z. B. per Backup) erledigt – der Tag ist schon abgerechnet.
    const edited = { ...settled, completions: doneOn({ [D(0)]: [habit] }) }
    expect(settleDays(edited, D(2))).toEqual([])
    expect(edited.hpLedger?.[0]).toMatchObject({ day: D(0), score: 'missed', hpAfter: 44 })
  })
})

describe('settleDays – Wertungen und HP', () => {
  const [a, b, c, d] = ['a', 'b', 'c', 'd'].map((id) => daily(id))
  const weekly = daily('w', { schedule: { type: 'weekly', times: 1 } })

  it('jede Wertung mit ihrer Wirkung: +10 / +2 / −1 / −6; ein Tag nur mit einer Wochenquest ist „weak“', () => {
    const data = hero({
      habits: [a, b, c, d, weekly],
      hpLedger: [makeLedgerEntry(D(-1), { hpAfter: 30 })],
      completions: doneOn({
        [D(0)]: [a, b, c, d], // perfect
        [D(1)]: [a, b], // 2 / 4 = 50 % → good
        [D(2)]: [a], // 1 / 4 → weak
        [D(3)]: [], // missed
        [D(4)]: [weekly], // keine Tagesquest, aber die Wochenquest → weak statt missed
      }),
    })
    // XP: 50 + 22 + 11 + 0 + 10 = 93 → kein Level-Up.
    // HP: 30 + 10 = 40 → + 2 = 42 → − 1 = 41 → − 6 = 35 → − 1 = 34.
    expect(settleThrough(data, D(4))).toEqual([
      { day: D(0), score: 'perfect', frozen: false, hpDelta: 10, hpAfter: 40, maxHp: 50, penalties: true },
      { day: D(1), score: 'good', frozen: false, hpDelta: 2, hpAfter: 42, maxHp: 50, penalties: true },
      { day: D(2), score: 'weak', frozen: false, hpDelta: -1, hpAfter: 41, maxHp: 50, penalties: true },
      { day: D(3), score: 'missed', frozen: false, hpDelta: -6, hpAfter: 35, maxHp: 50, penalties: true },
      { day: D(4), score: 'weak', frozen: false, hpDelta: -1, hpAfter: 34, maxHp: 50, penalties: true },
    ])
  })

  it('eine Quest außerhalb ihres Plans erledigt (sonst nichts) zählt wie eine Wochenquest: „weak“ (−1) statt „missed“ (−6)', () => {
    const monday = daily('mo', { schedule: { type: 'weekdays', days: [1] } })
    const tuesday = daily('di', { schedule: { type: 'weekdays', days: [2] } })
    // Di (D1): die Dienstags-Quest bleibt offen, dafür die Montags-Quest erledigt.
    const data = hero({ habits: [monday, tuesday], completions: doneOn({ [D(0)]: [monday], [D(1)]: [monday] }) })
    // 50 + 10 → begrenzt auf 50 (hpDelta 0) · 50 − 1 = 49.
    expect(settleThrough(data, D(1)).map((entry) => [entry.score, entry.hpDelta, entry.hpAfter])).toEqual([
      ['perfect', 0, 50],
      ['weak', -1, 49],
    ])
  })

  it('HP bleiben in 0 … Max: volle HP steigen nicht weiter (hpDelta = tatsächliche Änderung)', () => {
    const data = hero({ habits: [a], completions: doneOn({ [D(0)]: [a], [D(1)]: [a] }) })
    expect(settleThrough(data, D(1)).map((entry) => [entry.score, entry.hpDelta, entry.hpAfter])).toEqual([
      ['perfect', 0, 50],
      ['perfect', 0, 50],
    ])
  })

  it('höchstens −6 pro Tag – auch mit 3 Kampagnen und 9 Tagesquests', () => {
    const habits = Array.from({ length: 9 }, (_, i) => daily(`q${i}`, { mainQuestId: `campaign-${i % 3}` }))
    const data = hero({
      habits,
      mainQuests: [0, 1, 2].map((i) => makeMainQuest({ id: `campaign-${i}`, startDay: START })),
      completions: doneOn({ [D(1)]: [habits[0]], [D(2)]: habits.slice(0, 4) }),
    })
    expect(settleThrough(data, D(2)).map((entry) => [entry.score, entry.hpDelta])).toEqual([
      ['missed', -6], // 0 / 9
      ['weak', -1], // 1 / 9
      ['weak', -1], // 4 / 9 = 44 %
    ])
  })

  it('Wochenquests kosten nie etwas: nur Wochenquests → jeden Tag „none“, auch ohne jede Erledigung', () => {
    const data = hero({ habits: [weekly, daily('w2', { schedule: { type: 'weekly', times: 3 } })] })
    const entries = settleThrough(data, D(20))
    expect(new Set(scores(entries))).toEqual(new Set(['none']))
    expect(entries.every((entry) => entry.hpDelta === 0 && entry.hpAfter === 50)).toBe(true)
  })

  it('Tage mit Quests nur an bestimmten Wochentagen: an den übrigen „none“', () => {
    const monday = daily('mo', { schedule: { type: 'weekdays', days: [1] } })
    const tuesday = daily('di', { schedule: { type: 'weekdays', days: [2] } })
    const data = hero({ habits: [monday, tuesday], completions: doneOn({ [D(1)]: [tuesday] }) })
    // Mo verpasst (Zähler 1) · Di perfekt (0) · Mi–So „none“ · der zweite Montag (D7) verpasst (1).
    expect(scores(settleThrough(data, D(7)))).toEqual(['missed', 'perfect', 'none', 'none', 'none', 'none', 'none', 'missed'])
    // „none“-Tage zählen für die Durchhänger-Pause nicht und brechen sie nicht: Mo D0 (1), Di D1 (2), Mi–So nichts,
    // Mo D7 (3) → −6, Di D8 ist der 4. schadende Tag in Folge → Pause.
    const nothing = settleThrough(hero({ habits: [monday, tuesday] }), D(8))
    expect(scores(nothing)).toEqual(['missed', 'missed', 'none', 'none', 'none', 'none', 'none', 'missed', 'absent'])
    // 50 − 6 = 44 · 38 · fünfmal 38 · 32 · Pause 32
    expect(hpAfter(nothing)).toEqual([44, 38, 38, 38, 38, 38, 38, 32, 32])
  })

  it('Grabsteine gelöschter Quests bleiben an ihren Tagen Pflicht (wie beim Perfekten Tag)', () => {
    const data = hero({
      habits: [a],
      completions: doneOn({ [D(0)]: [a] }),
      deletedHabits: [{ id: 'gone', createdDay: START, archivedDay: D(5), schedule: { type: 'daily' } }],
    })
    expect(scores(settleThrough(data, D(0)))).toEqual(['good']) // 1 / 2
  })
})

describe('settleDays – Durchhänger-Pause', () => {
  const habit = daily('h')

  it('nach 3 schadenden Tagen in Folge „Pause“ (absent) – reine Abwesenheit führt bei vollen HP nie zur Niederlage', () => {
    expect(BALANCING.slumpPauseAfterDays).toBe(3)
    const entries = settleThrough(hero({ habits: [habit] }), D(19))
    // D0–D2: 1.–3. schadender Tag (je −6) · ab D3 Pause (Zähler 3 ≥ 3), kein Schaden mehr.
    expect(scores(entries)).toEqual([...Array(3).fill('missed'), ...Array(17).fill('absent')])
    expect(hpAfter(entries).slice(0, 5)).toEqual([44, 38, 32, 32, 32])
    expect(entries.at(-1)?.hpAfter).toBe(50 - 3 * 6) // 32
    expect(entries.some((entry) => entry.defeat !== undefined)).toBe(false)
  })

  it('auch mit 9 Tagesquests (z. B. 3 Kampagnen): höchstens 3 × −6 = −18', () => {
    const habits = Array.from({ length: 9 }, (_, i) => daily(`q${i}`))
    const entries = settleThrough(hero({ habits }), D(30))
    expect(Math.min(...hpAfter(entries))).toBe(32) // 50 − 18
    expect(entries.filter((entry) => entry.hpDelta < 0)).toHaveLength(3)
  })

  it('Ruhetage im Durchhänger zählen nicht mit (und brechen ihn nicht), ein perfekter Tag beendet die Pause', () => {
    const data = hero({
      habits: [habit],
      restPeriods: [makeRestPeriod('rast', D(1), D(3))],
      completions: doneOn({ [D(8)]: [habit] }),
    })
    const entries = settleThrough(data, D(9))
    expect(scores(entries)).toEqual([
      'missed', // D0: Zähler 1
      'rest', 'rest', 'rest', // D1–D3: zählen nicht mit
      'missed', 'missed', // D4, D5: Zähler 2 und 3 (zählten Ruhetage mit, wäre D4 schon Pause)
      'absent', 'absent', // D6, D7: Pause (brächen Ruhetage die Folge, wäre D6 erst der 3. schadende Tag)
      'perfect', // D8: beendet die Pause, Zähler 0
      'missed', // D9: Zähler 1
    ])
    // 50 − 6 = 44 · Rast 44 · − 6 = 38 · − 6 = 32 · Pause 32 · + 10 = 42 · − 6 = 36
    expect(hpAfter(entries)).toEqual([44, 44, 44, 44, 38, 32, 32, 32, 42, 36])
  })

  it('auch ein guter Tag (≥ 50 %) beendet die Pause – mit seinen +2', () => {
    const [x, y] = [daily('x'), daily('y')]
    const data = hero({ habits: [x, y], completions: doneOn({ [D(4)]: [x] }) })
    const entries = settleThrough(data, D(6))
    // D0–D2 −6 (Zähler 3) · D3 Pause · D4 1 von 2 = 50 % → good, +2, Zähler 0 · D5 Zähler 1, D6 Zähler 2: je −6.
    expect(entries.map((entry) => [entry.score, entry.hpDelta, entry.hpAfter])).toEqual([
      ['missed', -6, 44],
      ['missed', -6, 38],
      ['missed', -6, 32],
      ['absent', 0, 32],
      ['good', 2, 34], // 32 + 2
      ['missed', -6, 28], // 34 − 6
      ['missed', -6, 22], // 28 − 6
    ])
  })

  it('eine erledigte Wochenquest ist „weak“ (−1): Sie zählt als schadender Tag und beendet keine Pause', () => {
    const weekly = daily('w', { schedule: { type: 'weekly', times: 1 } })
    const data = hero({ habits: [habit, weekly], completions: doneOn({ [D(2)]: [weekly], [D(7)]: [weekly] }) })
    const entries = settleThrough(data, D(8))
    // D0, D1: Zähler 1, 2 (−6, −6) · D2 nur die Wochenquest: weak, Zähler 3 (−1) · D3–D6 Pause · D7 (Mo, neue Woche)
    // wieder nur die Wochenquest: in der Pause bleibt es Pause (0) · D8 Pause.
    expect(scores(entries)).toEqual(['missed', 'missed', 'weak', ...Array(6).fill('absent')])
    // 50 − 6 = 44 · 38 · 38 − 1 = 37 · dann 37
    expect(hpAfter(entries)).toEqual([44, 38, 37, 37, 37, 37, 37, 37, 37])
    // Etwas zu tun ist nie schlechter als nichts: ohne die Wochenquest 44, 38, 32 – dann Pause.
    const idle = settleThrough(hero({ habits: [habit, weekly] }), D(8))
    expect(scores(idle)).toEqual(['missed', 'missed', 'missed', ...Array(6).fill('absent')])
    expect(hpAfter(idle).at(-1)).toBe(32)
  })

  it('der Zähler kommt aus dem Ledger: Tage vor since (ohne Eintrag) zählen nicht, abgerechnete schon', () => {
    // Held seit D(-10), nichts erledigt, Lebenspunkte erst ab D0: Die 10 Tage davor sind nie abgerechnet → Zähler 0.
    const late = hero({ habits: [habit], profile: { name: 'Mira', avatar: '🧙', createdDay: D(-10) } })
    expect(scores(settleThrough(late, D(3)))).toEqual(['missed', 'missed', 'missed', 'absent'])
    // Schon abgerechnet: D(-3) … D(-1) je missed → Zähler 3 → D0 gleich Pause.
    const missed = (n: number) => makeLedgerEntry(D(n), { score: 'missed', hpDelta: -6 })
    const withLedger = (last: HpLedgerEntry) => hero({ habits: [habit], hpLedger: [missed(-3), missed(-2), last] })
    expect(scores(settleThrough(withLedger(missed(-1)), D(0)))).toEqual(['absent'])
    // … ein guter Tag zuletzt setzt ihn zurück (Zähler 0 → D0 missed) …
    expect(scores(settleThrough(withLedger(makeLedgerEntry(D(-1), { score: 'good' })), D(0)))).toEqual(['missed'])
    // … ein Ruhetag nicht (Zähler 2 → D0 der 3. schadende Tag, D1 Pause) …
    expect(scores(settleThrough(withLedger(makeLedgerEntry(D(-1), { score: 'rest' })), D(1)))).toEqual(['missed', 'absent'])
    // … und ein aufgefangener Tag auch nicht (Zähler 2).
    const frozen = makeLedgerEntry(D(-1), { score: 'missed', frozen: true })
    expect(scores(settleThrough(withLedger(frozen), D(1)))).toEqual(['missed', 'absent'])
    // Ein neuer Held hat am ersten Tag keine Pause.
    expect(scores(settleThrough(hero({ habits: [habit] }), D(0)))).toEqual(['missed'])
  })

  it('alte Abwesenheits-Einträge (`absent`) bleiben, wie sie sind, und setzen die Pause fort', () => {
    // Nach der früheren Regel abgerechnet: missed, missed, missed, absent (D(-4) … D(-1)) – der Zähler steht danach
    // auf max(3, 3) = 3, die Pause läuft weiter.
    const old = [-4, -3, -2].map((n) => makeLedgerEntry(D(n), { score: 'missed', hpDelta: -6 }))
    const absent = makeLedgerEntry(D(-1), { score: 'absent', hpAfter: 32 })
    const data = hero({ habits: [habit], hpLedger: [...old, absent], completions: doneOn({ [D(2)]: [habit] }) })
    const entries = settleThrough(data, D(3))
    // D0, D1 Pause (32) · D2 perfekt: 32 + 10 = 42, Zähler 0 · D3 Zähler 1: 42 − 6 = 36.
    expect(entries.map((entry) => [entry.score, entry.hpAfter])).toEqual([
      ['absent', 32],
      ['absent', 32],
      ['perfect', 42],
      ['missed', 36],
    ])
    // Auch ein alter `absent`-Eintrag allein (etwa nach einer Lücke) hält die Pause: max(0, 3) = 3.
    expect(scores(settleThrough(hero({ habits: [habit], hpLedger: [absent] }), D(0)))).toEqual(['absent'])
    // Abgerechnete Einträge werden nie umgeschrieben: settleDays liefert nur die neuen Tage.
    expect(entries.map((entry) => entry.day)).toEqual([D(0), D(1), D(2), D(3)])
    expect(data.hpLedger).toStrictEqual([...old, absent])
  })
})

describe('settleDays – Streak-Schutz', () => {
  const habit = daily('h')

  it('wird bei weak/missed verbraucht; ein erst danach gekaufter kann den Tag nicht retten', () => {
    const data = hero({ habits: [habit], purchases: [makeItemPurchase('f1', 'streakFreeze', D(1))] })
    // D0 schadend (Zähler 1) · D1 aufgefangen (bleibt 1) · D2 schadend (2) – noch keine Pause.
    const entries = settleThrough(data, D(2))
    expect(entries.map((entry) => [entry.day, entry.score, entry.frozen, entry.hpDelta, entry.hpAfter])).toEqual([
      [D(0), 'missed', false, -6, 44], // vor dem Kauf: nicht zu retten
      [D(1), 'missed', true, 0, 44], // am Kauftag nutzbar
      [D(2), 'missed', false, -6, 38], // Vorrat leer
    ])
  })

  it('ältester zuerst, Vorrat begrenzt; über mehrere Abrechnungen hinweg', () => {
    const purchases = [
      makeItemPurchase('f1', 'streakFreeze', D(-3)),
      makeItemPurchase('f2', 'streakFreeze', D(-3)),
      makeItemPurchase('f3', 'streakFreeze', D(4)),
    ]
    // D3 erledigt (perfekt): setzt den Durchhänger-Zähler zurück.
    const data = hero({ habits: [habit], purchases, completions: doneOn({ [D(3)]: [habit] }) })
    const first = settleThrough(data, D(1))
    expect(first.map((entry) => entry.frozen)).toEqual([true, true])
    const settled = withEntries(data, first)
    expect(deriveGameState(settled, D(3)).inventory.streakFreezes).toBe(0)
    const second = settleThrough(settled, D(5))
    expect(second.map((entry) => [entry.day, entry.frozen])).toEqual([
      [D(2), false], // verpasst, Vorrat leer (f3 erst am D4 gekauft), Zähler 1
      [D(3), false], // perfekt, Zähler 0
      [D(4), true], // verpasst, f3
      [D(5), false], // verpasst, Vorrat wieder leer, Zähler 1
    ])
    expect(deriveGameState(withEntries(settled, second), D(7))).toMatchObject({
      inventory: { streakFreezes: 0, unopenedChests: 0 },
    })
  })

  it('wird nicht verbraucht an guten, perfekten, Ruhe-, „none“- und Pause-Tagen', () => {
    const [x, y] = [daily('x'), daily('y', { schedule: { type: 'weekdays', days: [1, 2, 3, 4, 5] } })]
    const freezes = Array.from({ length: 8 }, (_, i) => makeItemPurchase(`f${i}`, 'streakFreeze', D(-1)))
    const data = hero({
      habits: [x, y],
      purchases: freezes,
      restPeriods: [makeRestPeriod('rast', D(2))],
      completions: doneOn({ [D(0)]: [x, y], [D(1)]: [x], [D(3)]: [x], [D(5)]: [x] }),
    })
    // Mo perfect · Di good · Mi rest · Do good · Fr missed (Schutz) · Sa (nur x fällig) perfect
    const entries = settleThrough(data, D(5))
    expect(entries.map((entry) => [entry.score, entry.frozen])).toEqual([
      ['perfect', false],
      ['good', false],
      ['rest', false],
      ['good', false],
      ['missed', true],
      ['perfect', false],
    ])
    // Wochenquest-only-Tage → „none“, kein Verbrauch.
    const weekly = daily('w', { schedule: { type: 'weekly', times: 1 } })
    expect(settleThrough(hero({ habits: [weekly], purchases: freezes }), D(3)).some((e) => e.frozen)).toBe(false)
    // Pause: D0–D2 ohne Vorrat schadend (Zähler 3), die 8 Streak-Schutz-Gegenstände kommen erst am D3 – da läuft
    // schon die Pause, also wird keiner verbraucht: 8 bleiben übrig.
    const late = Array.from({ length: 8 }, (_, i) => makeItemPurchase(`l${i}`, 'streakFreeze', D(3)))
    const paused = settleThrough(hero({ habits: [habit], purchases: late }), D(9))
    expect(paused.map((entry) => [entry.score, entry.frozen])).toEqual([
      ...Array(3).fill(['missed', false]),
      ...Array(7).fill(['absent', false]),
    ])
    expect(deriveGameState(withEntries(hero({ habits: [habit], purchases: late }), paused), D(11)).inventory).toEqual({
      streakFreezes: 8,
      unopenedChests: 0,
    })
  })

  it('erst der Streak-Schutz, dann die Pause: Aufgefangene Tage zählen nicht als schadend', () => {
    // 2 Streak-Schutz vorrätig, nichts erledigt: D0, D1 aufgefangen (Zähler 0) · D2–D4 je −6 (Zähler 1–3) · ab D5 Pause.
    const freezes = [makeItemPurchase('f1', 'streakFreeze', D(-1)), makeItemPurchase('f2', 'streakFreeze', D(-1))]
    const data = hero({ habits: [habit], purchases: freezes })
    const entries = settleThrough(data, D(7))
    expect(entries.map((entry) => [entry.score, entry.frozen, entry.hpAfter])).toEqual([
      ['missed', true, 50],
      ['missed', true, 50],
      ['missed', false, 44], // 50 − 6
      ['missed', false, 38], // 44 − 6
      ['missed', false, 32], // 38 − 6
      ['absent', false, 32],
      ['absent', false, 32],
      ['absent', false, 32],
    ])
    expect(deriveGameState(withEntries(data, entries), D(9)).inventory.streakFreezes).toBe(0)
    // Ein am 3. Tag der Pause gekaufter Schutz (D6) bleibt ungenutzt: Die Pause prüft vor dem Streak-Schutz.
    const later = { ...data, purchases: [...freezes, makeItemPurchase('f3', 'streakFreeze', D(6))] }
    expect(settleThrough(later, D(7)).map((entry) => entry.frozen)).toEqual([true, true, false, false, false, false, false, false])
    expect(deriveGameState(withEntries(later, settleThrough(later, D(7))), D(9)).inventory.streakFreezes).toBe(1)
  })

  it('auch ein schwacher Tag wird aufgefangen', () => {
    const [x, y, z] = ['x', 'y', 'z'].map((id) => daily(id))
    const data = hero({
      habits: [x, y, z],
      purchases: [makeItemPurchase('f', 'streakFreeze', START)],
      completions: doneOn({ [D(0)]: [x] }),
    })
    expect(settleThrough(data, D(0))).toEqual([
      { day: D(0), score: 'weak', frozen: true, hpDelta: 0, hpAfter: 50, maxHp: 50, penalties: true },
    ])
  })
})

describe('settleDays – Heiltrank', () => {
  const habit = daily('h')
  const low = makeLedgerEntry(D(-1), { hpAfter: 20 })

  it('zählt am Kauftag zur Änderung des Tages, mehrere addieren sich, begrenzt auf Max', () => {
    const data = hero({
      habits: [habit],
      hpLedger: [low],
      purchases: [
        makeItemPurchase('p1', 'healingPotion', D(0)),
        makeItemPurchase('p2', 'healingPotion', D(1)),
        makeItemPurchase('p3', 'healingPotion', D(1)),
      ],
    })
    expect(settleThrough(data, D(2)).map((entry) => [entry.hpDelta, entry.hpAfter])).toEqual([
      [14, 34], // 20 − 6 + 20
      [16, 50], // 34 − 6 + 40 → 68, begrenzt auf 50
      [-6, 44],
    ])
  })

  it('wirkt im abgeleiteten Zustand sofort (Kauftag nach dem letzten abgerechneten Tag)', () => {
    const data = hero({ habits: [habit], hpLedger: [low] })
    expect(deriveGameState(data, D(1)).hp).toMatchObject({ current: 20, max: 50, ratio: 0.4 })
    const potion = { ...data, purchases: [makeItemPurchase('p', 'healingPotion', D(1))] }
    expect(deriveGameState(potion, D(1)).hp).toMatchObject({ current: 40, ratio: 0.8 })
    // Ein Trank vom schon abgerechneten Tag ist in dessen hpAfter enthalten – nicht doppelt.
    const old = { ...data, purchases: [makeItemPurchase('p', 'healingPotion', D(-1))] }
    expect(deriveGameState(old, D(1)).hp.current).toBe(20)
    // Abgerechnet zählt der Trank genau einmal – an seinem Kauftag (D0 und D1 verpasst: 20 − 6 → 14 − 6 + 20 → 28).
    const settled = withEntries(potion, settleThrough(potion, D(1)))
    expect(settled.hpLedger?.map((entry) => [entry.hpDelta, entry.hpAfter])).toEqual([
      [0, 20],
      [-6, 14],
      [14, 28],
    ])
    expect(deriveGameState(settled, D(3)).hp.current).toBe(28)
  })

  it('im Sanften Modus ohne Wirkung', () => {
    const data = hero(
      { habits: [habit], hpLedger: [low], purchases: [makeItemPurchase('p', 'healingPotion', D(0))] },
      { enabled: false, since: START },
    )
    expect(settleThrough(data, D(0))).toEqual([
      { day: D(0), score: 'missed', frozen: false, hpDelta: 0, hpAfter: 50, maxHp: 50, penalties: false },
    ])
  })
})

describe('settleDays – Level-Up heilt voll', () => {
  const epic1 = daily('e1', { difficulty: 'epic' })
  const epic2 = daily('e2', { difficulty: 'epic' })

  it('Level am Tagesende höher als am Vortagesende → volle (neue) Max-HP', () => {
    // 2 × 80 + 25 % = 200 XP → Level 2 (Max 55).
    const data = hero({
      habits: [epic1, epic2],
      hpLedger: [makeLedgerEntry(D(-1), { hpAfter: 30 })],
      completions: doneOn({ [D(0)]: [epic1, epic2] }),
    })
    expect(settleThrough(data, D(1))).toEqual([
      { day: D(0), score: 'perfect', frozen: false, hpDelta: 25, hpAfter: 55, maxHp: 55, penalties: true },
      { day: D(1), score: 'missed', frozen: false, hpDelta: -6, hpAfter: 49, maxHp: 55, penalties: true },
    ])
  })

  it('auch an einem verpassten Tag (z. B. durch Nebenquests)', () => {
    const habit = daily('h')
    const data = hero({
      habits: [habit],
      hpLedger: [makeLedgerEntry(D(-1), { hpAfter: 12 })],
      sideQuests: [1, 2].map((i) => makeSideQuest({ id: `s${i}`, difficulty: 'epic', createdDay: START, doneDay: D(0) })),
    })
    expect(settleThrough(data, D(0))).toEqual([
      { day: D(0), score: 'missed', frozen: false, hpDelta: 43, hpAfter: 55, maxHp: 55, penalties: true },
    ])
  })

  it('abgeleitet: ist das Level jetzt höher als am letzten abgerechneten Tag, sind die HP sofort voll', () => {
    const habit = daily('h')
    const base = hero({ habits: [habit], hpLedger: [makeLedgerEntry(D(-1), { hpAfter: 12 })] })
    expect(deriveGameState(base, D(0)).hp).toMatchObject({ current: 12, max: 50 })
    const leveled = {
      ...base,
      sideQuests: [1, 2].map((i) => makeSideQuest({ id: `s${i}`, difficulty: 'epic', createdDay: START, doneDay: D(0) })),
    }
    expect(deriveGameState(leveled, D(0)).hp).toMatchObject({ current: 55, max: 55, ratio: 1 })
  })
})

describe('settleDays – Niederlage', () => {
  const habit = daily('h')
  /** 30 epische Nebenquests vor dem Start: 2.400 XP → Level 5 (Max 70), gut 1.200 Gold. */
  const sideQuests = Array.from({ length: 30 }, (_, i) =>
    makeSideQuest({ id: `s${i}`, difficulty: 'epic', createdDay: D(-3), doneDay: D(-3) }),
  )
  /** Spielstand mit genau `balance` Gold am Start (über eine Einlösung justiert) und `hp` HP. */
  function fallen(balance: number, hp = 4, extra: Partial<GameData> = {}): GameData {
    const base = hero({
      habits: [habit],
      sideQuests,
      hpLedger: [makeLedgerEntry(D(-1), { hpAfter: hp, maxHp: 70 })],
      achievementUnlocks: [{ id: 'purchases-1', day: D(-3) }],
      ...extra,
    })
    const before = deriveGameState(base, START).gold.balance
    const data = { ...base, purchases: [makePurchase({ id: 'p', price: before - balance, day: D(-2) }), ...(extra.purchases ?? [])] }
    expect(deriveGameState(data, START).gold.balance).toBe(balance)
    return data
  }

  it('HP ≤ 0 → 15 % des Guthabens (abgerundet), danach volle HP; Level und XP bleiben', () => {
    const data = fallen(600)
    const entries = settleThrough(data, D(1))
    // D0: 4 − 6 → 0 (Niederlage, hpDelta = −4), 15 % von 600 = 90 Gold, danach 70 · D1: 70 − 6 = 64.
    expect(entries).toEqual([
      {
        day: D(0),
        score: 'missed',
        frozen: false,
        hpDelta: -4,
        hpAfter: 70,
        maxHp: 70,
        defeat: { goldLost: 90 },
        penalties: true,
      },
      { day: D(1), score: 'missed', frozen: false, hpDelta: -6, hpAfter: 64, maxHp: 70, penalties: true },
    ])
    const before = deriveGameState(data, D(3))
    const after = deriveGameState(withEntries(data, entries), D(3))
    expect(after.level).toEqual(before.level)
    expect(after.totals).toEqual(before.totals)
    expect(after.gold).toMatchObject({ lostToDefeats: 90, balance: before.gold.balance - 90 })
    expect(after.hp).toMatchObject({ defeats: 1, lastDefeat: { day: D(0), goldLost: 90 }, current: 64, max: 70 })
  })

  it('höchstens 100 Gold je Niederlage – bei großem Guthaben greift die Grenze, bei kleinem bleibt es bei 15 %', () => {
    expect(BALANCING.defeatGoldLossMax).toBe(100)
    // min(100, floor(15 % × Guthaben)):
    expect(settleThrough(fallen(1000), D(0))[0].defeat).toEqual({ goldLost: 100 }) // 150 → 100
    expect(settleThrough(fallen(1200), D(0))[0].defeat).toEqual({ goldLost: 100 }) // 180 → 100
    expect(settleThrough(fallen(667), D(0))[0].defeat).toEqual({ goldLost: 100 }) // 100,05 → 100
    expect(settleThrough(fallen(666), D(0))[0].defeat).toEqual({ goldLost: 99 }) // 99,9 → 99
    expect(settleThrough(fallen(200), D(0))[0].defeat).toEqual({ goldLost: 30 }) // 30
    // Im Spielstand: 1.000 − 100 = 900 übrig.
    const data = fallen(1000)
    const entries = settleThrough(data, D(0))
    expect(deriveGameState(withEntries(data, entries), D(2)).gold).toMatchObject({
      lostToDefeats: 100,
      balance: deriveGameState(data, D(2)).gold.balance - 100,
    })
  })

  it('abgerundet: 15 % von 333 = 49,95 → 49', () => {
    expect(settleThrough(fallen(333), D(0))[0].defeat).toEqual({ goldLost: 49 })
    expect(settleThrough(fallen(6), D(0))[0].defeat).toEqual({ goldLost: 0 })
  })

  it('kein Guthaben (oder ein negatives) → nichts verloren, die Niederlage zählt trotzdem', () => {
    expect(settleThrough(fallen(0), D(0))[0].defeat).toEqual({ goldLost: 0 })
    expect(settleThrough(fallen(-40), D(0))[0]).toMatchObject({ defeat: { goldLost: 0 }, hpAfter: 70 })
  })

  it('genau 0 HP ist eine Niederlage, 1 HP nicht', () => {
    expect(settleThrough(fallen(100, 6), D(0))[0]).toMatchObject({ hpDelta: -6, defeat: { goldLost: 15 }, hpAfter: 70 })
    const survived = settleThrough(fallen(100, 7), D(0))[0]
    expect(survived).toMatchObject({ hpDelta: -6, hpAfter: 1 })
    expect(survived.defeat).toBeUndefined()
  })

  it('Ausgaben bis zur Abrechnung zählen mit (wie überall) – eine Niederlage drückt das Guthaben nie unter 0', () => {
    const before = fallen(1000)
    const data = { ...before, purchases: [...(before.purchases ?? []), makePurchase({ id: 'big', price: 900, day: D(1) })] }
    const [entry] = settleThrough(data, D(0))
    expect(entry.defeat).toEqual({ goldLost: 15 }) // 15 % von 100
    expect(deriveGameState(withEntries(data, [entry]), D(2)).gold.balance).toBe(85)
  })

  it('zwei Niederlagen: die zweite rechnet mit dem Guthaben nach der ersten', () => {
    const [x, y, z] = ['x', 'y', 'z'].map((id) => daily(id))
    // Durchhänger mit je einem guten Tag dazwischen (x und y von 3 = 67 % → good, +2): Jeder gute Tag beendet die
    // Folge, danach kosten 3 verpasste Tage −18 – je 4 Tage −16. Zähler in Klammern.
    // D0 4 − 6 → 0: Niederlage, wieder 70 (1) · D1 64 (2) · D2 58 (3) · D3 good 60 (0) · D4–D6 54, 48, 42 (3) ·
    // D7 good 44 · D8–D10 38, 32, 26 · D11 good 28 · D12–D14 22, 16, 10 · D15 good 12 · D16 6 (1) ·
    // D17 6 − 6 = 0 (2): Niederlage, wieder 70.
    const goodDays = [3, 7, 11, 15]
    const data = fallen(600, 4, {
      habits: [x, y, z],
      completions: doneOn(Object.fromEntries(goodDays.map((n) => [D(n), [x, y]]))),
    })
    const entries = settleThrough(data, D(17))
    expect(scores(entries)).toEqual([
      ...['missed', 'missed', 'missed', 'good'],
      ...['missed', 'missed', 'missed', 'good'],
      ...['missed', 'missed', 'missed', 'good'],
      ...['missed', 'missed', 'missed', 'good'],
      ...['missed', 'missed'],
    ])
    expect(hpAfter(entries)).toEqual([70, 64, 58, 60, 54, 48, 42, 44, 38, 32, 26, 28, 22, 16, 10, 12, 6, 70])
    expect(entries.map((entry) => entry.hpDelta)).toEqual([-4, -6, -6, 2, -6, -6, -6, 2, -6, -6, -6, 2, -6, -6, -6, 2, -6, -6])
    const defeats = entries.filter((entry) => entry.defeat !== undefined)
    expect(defeats.map((entry) => entry.day)).toEqual([D(0), D(17)])
    // Erste: 15 % von 600 = 90 (D0 bringt keine XP).
    expect(defeats[0].defeat?.goldLost).toBe(90)
    // Zweite: 600 − 90 + 4 × 10 Gold (je 2 × 10 XP an D3, D7, D11, D15 – keine Serie, also kein Streak-Bonus;
    // ½ Gold pro XP) = 550 → floor(82,5) = 82. Ohne die erste Niederlage wären es 640 → 96.
    const ledgerBefore = [...(data.hpLedger ?? []), ...entries.slice(0, 17)]
    expect(deriveGameState({ ...data, hpLedger: ledgerBefore }, D(17)).gold.balance).toBe(550)
    expect(defeats[1].defeat?.goldLost).toBe(82)
    expect(entries.every((entry) => entry.maxHp === 70)).toBe(true) // kein Level-Up in der Zeit
    const state = deriveGameState(withEntries(data, entries), D(19))
    expect(state.gold.lostToDefeats).toBe(90 + 82)
    expect(state.hp.defeats).toBe(2)
    expect(state.hp.lastDefeat?.day).toBe(D(17))
  })
})

describe('Sanfter Modus', () => {
  const habit = daily('h')

  it('keine HP-Wirkung, keine Niederlage – Streak-Schutz wird trotzdem verbraucht', () => {
    const data = hero(
      {
        habits: [habit],
        hpLedger: [makeLedgerEntry(D(-1), { hpAfter: 2 })],
        purchases: [makeItemPurchase('f', 'streakFreeze', START)],
      },
      { enabled: false, since: START },
    )
    expect(settleThrough(data, D(1))).toEqual([
      { day: D(0), score: 'missed', frozen: true, hpDelta: 0, hpAfter: 50, maxHp: 50, penalties: false },
      { day: D(1), score: 'missed', frozen: false, hpDelta: 0, hpAfter: 50, maxHp: 50, penalties: false },
    ])
    const state = deriveGameState(data, D(1))
    expect(state.hp).toMatchObject({ enabled: false, current: 50, max: 50, ratio: 1 })
    // Die Vorschau für gestern droht nichts an – rettet aber trotzdem den Streak.
    expect(state.hp.yesterday).toEqual({ day: D(0), score: 'missed', threatenedDelta: 0, savedByFreeze: true })
  })

  it('wieder eingeschaltet: Die HP starten beim nächsten abgerechneten Tag voll', () => {
    // D1 erledigt (perfekt): Die Wertungen gelten auch im Sanften Modus, D0 missed (Zähler 1), D1 perfect (0),
    // D2 missed (1) – so ist D3 der 2. schadende Tag (verpasst) und keine Pause (ohne D1 wäre D3 der 4. → Pause).
    const gentle = hero(
      { habits: [habit], hpLedger: [makeLedgerEntry(D(-1), { hpAfter: 8 })], completions: doneOn({ [D(1)]: [habit] }) },
      { enabled: false, since: START },
    )
    const entries = settleThrough(gentle, D(2))
    expect(entries.every((entry) => !entry.penalties)).toBe(true)
    const enabled = withEntries({ ...gentle, settings: { ...gentle.settings, penalties: { enabled: true, since: START } } }, entries)
    expect(deriveGameState(enabled, D(4)).hp).toMatchObject({ enabled: true, current: 50 })
    // Start voll (50, nicht die 8 von vorher) − 6 = 44.
    expect(settleThrough(enabled, D(3))).toEqual([
      { day: D(3), score: 'missed', frozen: false, hpDelta: -6, hpAfter: 44, maxHp: 50, penalties: true },
    ])
  })
})

describe('Rast & Urlaub', () => {
  const habit = daily('h')

  it('Ruhetage: keine Pflicht, Quests bleiben sichtbar und bringen XP, kein Perfekter Tag', () => {
    const data = hero({ habits: [habit], restPeriods: [makeRestPeriod('rast', D(1))], completions: doneOn({ [D(1)]: [habit] }) })
    const day = getDayState(data, D(1))
    expect(day).toMatchObject({ requiredCount: 0, requiredDone: 0, perfect: false, perfectBonusXp: 0 })
    expect(day.habits.map((status) => [status.habit.id, status.required, status.done])).toEqual([['h', false, true]])
    expect(deriveGameState(data, D(1))).toMatchObject({ restToday: true, totals: { xpFromQuests: 10, perfectDays: 0 } })
    expect(deriveGameState(data, D(2)).restToday).toBe(false)
  })

  it('keine HP-Wirkung und kein Streak-Schutz-Verbrauch', () => {
    const data = hero({
      habits: [habit],
      restPeriods: [makeRestPeriod('urlaub', D(0), D(2), { note: 'Italien' })],
      purchases: [makeItemPurchase('f', 'streakFreeze', START)],
    })
    expect(settleThrough(data, D(3)).map((entry) => [entry.score, entry.frozen, entry.hpDelta])).toEqual([
      ['rest', false, 0],
      ['rest', false, 0],
      ['rest', false, 0],
      ['missed', true, 0],
    ])
  })

  it('der Streak übersteht Ruhetage; eine Erledigung am Ruhetag zählt mit', () => {
    const rest = [makeRestPeriod('rast', D(2))]
    const skipped = hero({ habits: [habit], restPeriods: rest, completions: doneOn({ [D(0)]: [habit], [D(1)]: [habit], [D(3)]: [habit] }) })
    expect(deriveGameState(skipped, D(3)).todayState.habits[0].streak).toEqual({ current: 3, best: 3, unit: 'day' })
    expect(deriveGameState({ ...skipped, restPeriods: [] }, D(3)).todayState.habits[0].streak.current).toBe(1)
    // Streak-Bonus am Tag danach: Serie 2 → +10 % = 11 XP (ohne Ruhetag: Serie 0 → 10 XP).
    expect(getDayState(skipped, D(3)).habits[0]).toMatchObject({ xp: 11, streakBonus: 0.1 })

    const kept = hero({ habits: [habit], restPeriods: rest, completions: doneOn(Object.fromEntries(dayRange(D(0), D(3)).map((d) => [d, [habit]]))) })
    expect(deriveGameState(kept, D(3)).todayState.habits[0].streak.current).toBe(4)
    expect(getDayState(kept, D(3)).habits[0]).toMatchObject({ xp: 12, streakBonus: 0.15 })
  })

  it('Wochen-Streak: eine Woche mit Ruhetag bricht nie – sie zählt, wenn sie erfüllt ist (auch mit Erledigung am Ruhetag)', () => {
    const weekly = daily('w', { schedule: { type: 'weekly', times: 2 } })
    // KW 45 (D0–D6) erfüllt · KW 46 (D7–D13) nur 1× + Ruhetag · KW 47 (D14–D20) erfüllt
    const completions = doneOn({ [D(0)]: [weekly], [D(1)]: [weekly], [D(8)]: [weekly], [D(14)]: [weekly], [D(15)]: [weekly] })
    const rest = [makeRestPeriod('rast', D(10))]
    const withRest = hero({ habits: [weekly], completions, restPeriods: rest })
    expect(deriveGameState(withRest, D(16)).todayState.habits[0].streak).toEqual({ current: 2, best: 2, unit: 'week' })
    expect(deriveGameState({ ...withRest, restPeriods: [] }, D(16)).todayState.habits[0].streak.current).toBe(1)
    // Am Ruhetag erledigt → KW 46 erfüllt → 3 Wochen in Folge.
    const doneOnRest = { ...withRest, completions: [...completions, makeCompletion(weekly, D(10))] }
    expect(deriveGameState(doneOnRest, D(16)).todayState.habits[0].streak.current).toBe(3)
  })

  it('Helfer: restDaySet (inklusive beider Enden), restPeriodOn, isRestDay; ungültige Zeiträume zählen nicht', () => {
    const periods = [
      makeRestPeriod('a', D(0), D(2), { note: 'Krank' }),
      makeRestPeriod('kaputt', D(9), D(5)),
      makeRestPeriod('b', '2026-13-01', D(3)),
    ]
    expect([...restDaySet(periods)]).toEqual([D(0), D(1), D(2)])
    expect(restPeriodOn(periods, D(1))?.note).toBe('Krank')
    expect(isRestDay(periods, D(2))).toBe(true)
    expect(isRestDay(periods, D(3))).toBe(false)
    expect(isRestDay(undefined, D(0))).toBe(false)
  })
})

describe('Vorschau für gestern & Streak-Schutz für die Streaks', () => {
  const habit = daily('h')
  const fiveDays = doneOn(Object.fromEntries(dayRange(D(0), D(4)).map((day) => [day, [habit]])))

  /** Bis D4 abgerechnet, gestern (D5) offen, heute D6. */
  function scenario(extra: Partial<GameData> = {}): GameData {
    const data = hero({ habits: [habit], completions: fiveDays, ...extra })
    return withEntries(data, settleThrough(data, D(4)))
  }

  it('ohne Streak-Schutz: drohende Wirkung −6, die Serie von heute beginnt neu', () => {
    const state = deriveGameState(scenario(), D(6))
    expect(state.hp.yesterday).toEqual({ day: D(5), score: 'missed', threatenedDelta: -6, savedByFreeze: false })
    expect(state.hp.settledThrough).toBe(D(4))
    expect(state.todayState.habits[0]).toMatchObject({ streak: { current: 0, best: 5 }, streakBonus: 0 })
  })

  it('mit Streak-Schutz: gestern ist gerettet – Serie und Streak-Bonus von heute bleiben', () => {
    const data = scenario({ purchases: [makeItemPurchase('f', 'streakFreeze', D(3))] })
    const state = deriveGameState(data, D(6))
    expect(state.hp.yesterday).toEqual({ day: D(5), score: 'missed', threatenedDelta: 0, savedByFreeze: true })
    expect(state.todayState.habits[0]).toMatchObject({ streak: { current: 5, best: 5 }, streakBonus: 0.25, xp: 13 })
    expect(getDayState(data, D(6)).habits[0]).toMatchObject({ streak: { current: 5 }, streakBonus: 0.25 })
    // Noch nicht verbraucht – erst die Abrechnung verbraucht ihn.
    expect(state.inventory.streakFreezes).toBe(1)

    // Heute erledigt, übermorgen abgerechnet: gestern ist ein frozen-Tag, die Serie zählt weiter.
    const today = { ...data, completions: [...data.completions, makeCompletion(habit, D(6))] }
    const settled = withEntries(today, settleDays(today, D(7)))
    expect(settled.hpLedger?.at(-1)).toMatchObject({ day: D(5), score: 'missed', frozen: true, hpDelta: 0 })
    const later = deriveGameState(settled, D(7))
    expect(later.todayState.habits[0].streak).toEqual({ current: 6, best: 6, unit: 'day' })
    expect(later.inventory.streakFreezes).toBe(0)
    // Die XP von heute (D6) bleiben dieselben wie in der Vorschau.
    expect(getDayState(settled, D(6)).habits[0]).toMatchObject({ done: true, xp: 13, streakBonus: 0.25 })
  })

  it('gestern nur eine Wochenquest erledigt: die Vorschau droht nur −1 („weak“ statt „missed“)', () => {
    const weekly = daily('w', { schedule: { type: 'weekly', times: 1 } })
    const data = scenario({ habits: [habit, weekly], completions: [...fiveDays, makeCompletion(weekly, D(5))] })
    expect(deriveGameState(data, D(6)).hp.yesterday).toEqual({ day: D(5), score: 'weak', threatenedDelta: -1, savedByFreeze: false })
  })

  it('ein heute gekaufter Streak-Schutz rettet gestern nicht', () => {
    const state = deriveGameState(scenario({ purchases: [makeItemPurchase('f', 'streakFreeze', D(6))] }), D(6))
    expect(state.hp.yesterday).toMatchObject({ savedByFreeze: false, threatenedDelta: -6 })
    expect(state.inventory.streakFreezes).toBe(1)
  })

  it('wird gestern nachgetragen, braucht es keinen Schutz mehr', () => {
    const data = scenario({ purchases: [makeItemPurchase('f', 'streakFreeze', D(3))] })
    const backfilled = { ...data, completions: [...data.completions, makeCompletion(habit, D(5))] }
    const state = deriveGameState(backfilled, D(6))
    expect(state.hp.yesterday).toEqual({ day: D(5), score: 'perfect', threatenedDelta: 10, savedByFreeze: false })
    expect(state.todayState.habits[0].streak.current).toBe(6)
  })

  it('keine Vorschau vor since oder für schon abgerechnete Tage', () => {
    expect(deriveGameState(hero({ habits: [habit] }), START).hp.yesterday).toBeUndefined()
    expect(deriveGameState(hero({ habits: [habit] }, null), D(5)).hp.yesterday).toBeUndefined()
    const data = scenario()
    expect(deriveGameState(withEntries(data, settleThrough(data, D(5))), D(6)).hp.yesterday).toBeUndefined()
  })

  it('verspätete Abrechnung: offene Tage vor gestern werden für Streaks und Vorrat wie abgerechnet behandelt', () => {
    const data = hero({ habits: [habit], completions: fiveDays, purchases: [makeItemPurchase('f', 'streakFreeze', D(0))] })
    // Nichts abgerechnet; D5 und D6 verpasst, heute D7: D5 nimmt den Streak-Schutz, D6 (gestern) bleibt ohne.
    const state = deriveGameState(data, D(7))
    expect(state.hp.yesterday).toEqual({ day: D(6), score: 'missed', threatenedDelta: -6, savedByFreeze: false })
    expect(state.todayState.habits[0].streak.current).toBe(0)
  })
})

describe('Abgeleiteter Zustand & Kennzahlen', () => {
  const habit = daily('h')

  it('ohne Abrechnung: volle HP, Level 1 → 50', () => {
    const state = deriveGameState(hero({ habits: [habit] }, null), START)
    expect(state.hp).toEqual({ enabled: true, current: 50, max: 50, ratio: 1, defeats: 0 })
    expect(state.inventory).toEqual({ streakFreezes: 0, unopenedChests: 0 })
    expect(state.restToday).toBe(false)
  })

  it('Ledger-Einträge ab heute (zurückgestellte Uhr) zählen noch nicht', () => {
    const data = hero({
      habits: [habit],
      hpLedger: [makeLedgerEntry(D(0), { hpAfter: 30 }), makeLedgerEntry(D(3), { hpAfter: 10, defeat: { goldLost: 5 } })],
    })
    expect(deriveGameState(data, D(2)).hp).toMatchObject({ current: 30, settledThrough: D(0), defeats: 0 })
    expect(deriveGameState(data, D(2)).gold.lostToDefeats).toBe(0)
    expect(deriveGameState(data, D(4)).hp).toMatchObject({ current: 10, defeats: 1 })
    expect(deriveGameState(data, D(4)).gold.lostToDefeats).toBe(5)
  })

  it('Kennzahlen: Niederlagen, Perfekte Tage nach der ersten Niederlage, verbrauchte Streak-Schutz-Gegenstände', () => {
    const achievements = [
      makeAchievement('defeats', (s) => s.defeats, 1),
      makeAchievement('indomitable', (s) => s.perfectDaysAfterDefeat, 1),
      makeAchievement('freezes', (s) => s.freezesUsed, 2),
    ]
    const data = hero({
      habits: [habit],
      completions: doneOn({ [D(0)]: [habit], [D(3)]: [habit], [D(4)]: [habit] }),
      hpLedger: [
        makeLedgerEntry(D(0), { score: 'perfect' }),
        makeLedgerEntry(D(1), { score: 'missed', frozen: true }),
        makeLedgerEntry(D(2), { score: 'missed', defeat: { goldLost: 0 } }),
        makeLedgerEntry(D(3), { score: 'perfect' }),
      ],
    })
    const state = deriveGameState(data, D(5), { achievements })
    expect(state.achievements.map((a) => [a.definition.id, a.current, a.unlocked])).toEqual([
      ['defeats', 1, true],
      ['indomitable', 2, true], // D3 und D4 (D0 lag vor der Niederlage)
      ['freezes', 1, false],
    ])
  })

  it('Gegenstände sind keine Einlösungen (Erfolge „Beim Händler“), kosten aber Gold', () => {
    const achievements = [makeAchievement('purchases', (s) => s.purchases, 1)]
    const data = hero({ purchases: [makeItemPurchase('f', 'streakFreeze', START), makeItemPurchase('p', 'healingPotion', START)] })
    const state = deriveGameState(data, START, { achievements })
    expect(state.achievements[0].current).toBe(0)
    expect(state.gold.spent).toBe(BALANCING.items.streakFreeze.price + BALANCING.items.healingPotion.price)
  })

  it('canUndoItemPurchase: nur am Kauftag und solange nichts verbraucht/abgerechnet ist', () => {
    const freeze = makeItemPurchase('f', 'streakFreeze', D(3))
    const potion = makeItemPurchase('p', 'healingPotion', D(3))
    const data = hero({ habits: [habit], purchases: [freeze, potion] })
    expect(canUndoItemPurchase(data, freeze, D(3))).toBe(true)
    expect(canUndoItemPurchase(data, potion, D(3))).toBe(true)
    expect(canUndoItemPurchase(data, freeze, D(4))).toBe(false)
    expect(canUndoItemPurchase(data, makePurchase({ id: 'r', day: D(3) }), D(3))).toBe(false)
    // Ein abgerechneter Kauftag ist endgültig.
    expect(canUndoItemPurchase({ ...data, hpLedger: [makeLedgerEntry(D(3))] }, potion, D(3))).toBe(false)
    // Ein schon verbrauchter Vorrat lässt sich nicht zurückgeben (kaputte Daten / zurückgestellte Uhr).
    expect(canUndoItemPurchase({ ...data, hpLedger: [makeLedgerEntry(D(1), { frozen: true })] }, freeze, D(3))).toBe(false)
  })
})

describe('Konsistenz & Laufzeit', () => {
  /** Zufälliger Spielstand mit mehreren Quests, Kapiteln, Nebenquests, Ruhetagen und Gegenständen. */
  function randomHero(seed: number, days: number): GameData {
    const random = seededRandom(seed)
    const habits: Habit[] = [
      daily('a'),
      daily('b', { difficulty: 'medium' }),
      daily('c', { schedule: { type: 'weekdays', days: [1, 3, 5] }, difficulty: 'hard' }),
      daily('d', { schedule: { type: 'weekly', times: 3 } }),
      daily('e', { createdDay: D(20) }),
    ]
    const completions: Completion[] = []
    for (const day of dayRange(START, D(days))) {
      const mood = random()
      for (const habit of habits) if (random() < mood) completions.push(makeCompletion(habit, day))
    }
    const purchases = Array.from({ length: Math.floor(days / 15) }, (_, i) =>
      makeItemPurchase(`i${i}`, random() < 0.6 ? 'streakFreeze' : 'healingPotion', D(Math.floor(random() * days))),
    )
    const restPeriods = [makeRestPeriod('r1', D(10), D(13)), makeRestPeriod('r2', D(40), D(41))]
    const sideQuests = Array.from({ length: 6 }, (_, i) =>
      makeSideQuest({ id: `s${i}`, difficulty: 'hard', createdDay: START, doneDay: D(Math.floor(random() * days)) }),
    )
    const mainQuests = [
      makeMainQuest({
        id: 'm',
        startDay: START,
        chapters: [
          makeChapter({ id: 'c1', criterion: { type: 'habit', habitId: 'a', metric: 'completions', target: 10 } }),
          makeChapter({ id: 'c2', criterion: { type: 'habit', habitId: 'b', metric: 'streak', target: 4 } }),
        ],
      }),
    ]
    return hero({ habits, completions, purchases, restPeriods, sideQuests, mainQuests })
  }

  it('Tag für Tag abgerechnet = alles auf einmal abgerechnet (der Zeitpunkt der Abrechnung ändert nichts)', () => {
    for (const seed of [1, 2, 3]) {
      const data = randomHero(seed, 60)
      const stepwise = settleDaily(data, D(62)).hpLedger
      const batch = settleDays(data, D(62))
      expect(stepwise, `seed ${seed}`).toEqual(batch)
      expect(batch).toHaveLength(61)
    }
  })

  it('mit Ledger und Vorschau: todayState = getDayState(heute), abgerechnet bis vorgestern', () => {
    for (const seed of [4, 5, 6]) {
      const data = settleDaily(randomHero(seed, 60), D(60))
      const state = deriveGameState(data, D(60))
      expect(state.todayState, `seed ${seed}`).toEqual(getDayState(data, D(60)))
      expect(state.hp.settledThrough).toBe(D(58))
      expect(state.hp.yesterday?.day).toBe(D(59))
      expect(state.hp.current).toBeGreaterThan(0)
      expect(state.hp.current).toBeLessThanOrEqual(state.hp.max)
      const frozen = (data.hpLedger ?? []).filter((entry) => entry.frozen).length
      const bought = (data.purchases ?? []).filter((p) => p.itemId === 'streakFreeze').length
      expect(state.inventory.streakFreezes).toBe(bought - frozen)
    }
  })

  it('totalXpTimeline: Gesamt-XP am Ende jedes Tages = deriveGameState(…, Tag).level.totalXp', () => {
    const data = { ...randomHero(7, 50), settings: { ...DEFAULT_SETTINGS } } // ohne HP: keine Vorschau
    const restDays = restDaySet(data.restPeriods)
    const timeline = totalXpTimeline(data, D(50), { restDays, freeDays: restDays })
    for (const day of dayRange(D(-1), D(50))) {
      expect(timeline.totalXpAt(day), day).toBe(deriveGameState(data, day).level.totalXp)
    }
  })

  it('365 Tage mit 12 Quests sind schnell abgerechnet', () => {
    const habits = Array.from({ length: 12 }, (_, i) =>
      daily(`q${i}`, i % 4 === 3 ? { schedule: { type: 'weekly', times: 3 } } : { difficulty: i % 2 ? 'medium' : 'easy' }),
    )
    const random = seededRandom(42)
    const completions = dayRange(START, D(365)).flatMap((day) =>
      habits.filter(() => random() < 0.7).map((habit) => makeCompletion(habit, day)),
    )
    const purchases = Array.from({ length: 20 }, (_, i) => makeItemPurchase(`f${i}`, 'streakFreeze', D(i * 18)))
    const data = hero({ habits, completions, purchases, restPeriods: [makeRestPeriod('urlaub', D(200), D(213))] })
    const started = performance.now()
    const entries = settleDays(data, D(367))
    const elapsed = performance.now() - started
    expect(entries).toHaveLength(366)
    expect(elapsed).toBeLessThan(1500)
    const derived = performance.now()
    deriveGameState(withEntries(data, entries), D(367))
    expect(performance.now() - derived).toBeLessThan(500)
  })
})
