/**
 * Review Phase 2b: eine unabhängige Geschichte über fünf Wochen mit **von Hand gerechnetem** Ledger.
 *
 * Die App rechnet jeden Tag ab (wie `HpSettler`): am Tag t alles bis t − 2 (gestern bleibt in der Gnadenfrist).
 * Erwartet wird jede einzelne Zeile – Wertung, Streak-Schutz, HP-Änderung, HP danach, Max-HP, Sanfter Modus,
 * Niederlage – so, wie sie ein Mensch aus den Regeln in ARCHITECTURE.md („Phase 2b … (Vertrag)“) ableitet.
 *
 * Held: Level 6 (36 epische Nebenquests vor Beginn = 2.880 XP; Level 7 erst ab 4.291 XP) → Max-HP 75.
 * Am Tag 16 bringen 20 epische Nebenquests (+1.600 XP) genau einen Level-Aufstieg (Level 7 → Max-HP 80).
 * Quests: A, B, C täglich (leicht), W 2× pro Woche (leicht). Vor Beginn steht ein Ledger-Eintrag mit 18 HP.
 *
 * Regeln (mild): +10 / +2 / −1 / −6 je Wertung; ein Tag nur mit der Wochenquest ist `weak` (nicht `missed`);
 * Durchhänger-Pause: nach 3 schadenden Tagen in Folge (`weak`/`missed` ohne Streak-Schutz; Ruhetage und aufgefangene
 * Tage zählen nicht und brechen nichts) ist jeder weitere schwache oder verpasste Tag `absent` („Pause“, 0 HP, kein
 * Streak-Schutz) – bis zum nächsten guten oder perfekten Tag; eine Niederlage kostet 15 % des Guthabens, höchstens
 * 100 Gold. In den Kommentaren steht der Durchhänger-Zähler in Klammern.
 */
import { describe, expect, it } from 'vitest'
import { BALANCING, DEFAULT_SETTINGS } from './balancing'
import { addDays, dayRange } from './dates'
import { applyHabitDeletion } from './deletion'
import { deriveGameState, getDayState } from './engine'
import { settleDays } from './hp'
import { levelFromXp } from './leveling'
import { dayHistory } from './statistics'
import {
  makeCompletion,
  makeGameData,
  makeHabit,
  makeItemPurchase,
  makeLedgerEntry,
  makePurchase,
  makeRestPeriod,
  makeSideQuest,
  seededRandom,
} from './testing'
import type { Completion, DayKey, DayScore, GameData, Habit, HpLedgerEntry, Purchase } from './types'

// 2026-11-02 ist ein Montag.
const START: DayKey = '2026-11-02'
const D = (n: number): DayKey => addDays(START, n)

const A = makeHabit({ id: 'A', title: 'Lesen', difficulty: 'easy', createdDay: START, order: 0 })
const B = makeHabit({ id: 'B', title: 'Laufen', difficulty: 'easy', createdDay: START, order: 1 })
const C = makeHabit({ id: 'C', title: 'Meditieren', difficulty: 'easy', createdDay: START, order: 2 })
const W = makeHabit({ id: 'W', title: 'Freunde', difficulty: 'easy', createdDay: START, order: 3, schedule: { type: 'weekly', times: 2 } })

/** Erledigte Quests je Tag (alle anderen Tage: nichts). */
const PLAN: Record<number, Habit[]> = {
  0: [A, B, C],
  1: [A, B],
  2: [A],
  3: [W],
  4: [A],
  7: [W],
  8: [A, B],
  12: [A, B],
  15: [A, B, C],
  17: [A, B],
  18: [A],
  33: [A, B, C],
}
const COMPLETIONS: Completion[] = Object.entries(PLAN).flatMap(([n, habits]) =>
  habits.map((habit) => makeCompletion(habit, D(Number(n)))),
)

/**
 * Vor Beginn hat sich Mira etwas gegönnt – so liegt ihr Guthaben bei der Niederlage (Tag 14) zwischen 667 und 816
 * Gold: 15 % davon sind mehr als 100 (die Grenze greift), nach dem Streak-Schutz vom Tag 18 (−150) aber weniger.
 */
const TREAT_PRICE = 875
const TREAT = makePurchase({ id: 'treat', title: 'Ein neues Buch', price: TREAT_PRICE, day: D(-1) })

const PURCHASES: Purchase[] = [
  TREAT,
  makeItemPurchase('freeze-1', 'streakFreeze', D(4)),
  makeItemPurchase('freeze-2', 'streakFreeze', D(18)),
  makeItemPurchase('potion-1', 'healingPotion', D(27)),
]

const SIDE_QUESTS = [
  ...Array.from({ length: 36 }, (_, i) => makeSideQuest({ id: `old-${i}`, difficulty: 'epic', createdDay: D(-1), doneDay: D(-1) })),
  ...Array.from({ length: 20 }, (_, i) => makeSideQuest({ id: `boost-${i}`, difficulty: 'epic', createdDay: D(16), doneDay: D(16) })),
]

/** Vor Beginn schon abgerechnet: angeschlagen mit 18 von 75 HP. */
const PRIOR = makeLedgerEntry(D(-1), { score: 'good', hpDelta: 2, hpAfter: 18, maxHp: 75 })
/** Sanfter Modus galt an den Abrechnungstagen 19 und 20 (also für die Tage 17 und 18). */
const GENTLE_ON = new Set([D(19), D(20)])
/** Urlaub von Tag 19 bis Tag 22 – vorab geplant. */
const VACATION = makeRestPeriod('urlaub', D(19), D(22), { note: 'Ostsee' })

/** Stand der Daten am Spieltag `today`: Käufe bis heute, Einstellungen wie an diesem Tag. */
function dataAt(today: DayKey, ledger: readonly HpLedgerEntry[], overrides: Partial<GameData> = {}): GameData {
  return makeGameData({
    profile: { name: 'Mira', avatar: '🧙', createdDay: START },
    settings: { ...DEFAULT_SETTINGS, penalties: { enabled: !GENTLE_ON.has(today), since: D(-1) } },
    habits: [A, B, C, W],
    completions: COMPLETIONS.filter((c) => c.day <= today),
    sideQuests: SIDE_QUESTS,
    purchases: PURCHASES.filter((p) => p.day <= today),
    restPeriods: [VACATION],
    hpLedger: [...ledger],
    ...overrides,
  })
}

/** Die App wird an jedem Tag von `from` bis `to` geöffnet; liefert das Ledger und prüft unterwegs die Invarianten. */
function playDaily(from: DayKey, to: DayKey, ledger: HpLedgerEntry[] = [PRIOR]): HpLedgerEntry[] {
  const result = [...ledger]
  for (const today of dayRange(from, to)) {
    const entries = settleDays(dataAt(today, result), today)
    result.push(...entries)
    // Gnadenfrist: gestern und heute werden nie abgerechnet.
    for (const entry of entries) expect(entry.day <= addDays(today, -2), `${entry.day} am ${today}`).toBe(true)
    // Idempotent: ein zweiter Aufruf am selben Tag findet nichts Neues.
    expect(settleDays(dataAt(today, result), today)).toStrictEqual([])
  }
  return result
}

type Row = [day: number, score: DayScore, frozen: boolean, hpDelta: number, hpAfter: number, maxHp: number, penalties: boolean]

/** Von Hand gerechnet (siehe Kommentare; der Durchhänger-Zähler in Klammern). */
const EXPECTED: Row[] = [
  [0, 'perfect', false, 10, 28, 75, true], // 18 + 10 (0; der Eintrag davor war gut)
  [1, 'good', false, 2, 30, 75, true], // 2 von 3 ≥ 50 % (0)
  [2, 'weak', false, -1, 29, 75, true], // 1 von 3 (1)
  [3, 'weak', false, -1, 28, 75, true], // nur die Wochenquest: keine Tagesquest, aber etwas getan → weak statt missed (2)
  [4, 'weak', true, 0, 28, 75, true], // am selben Tag gekaufter Streak-Schutz fängt auf (bleibt 2)
  [5, 'missed', false, -6, 22, 75, true], // kein Schutz mehr (3)
  [6, 'absent', false, 0, 22, 75, true], // Durchhänger-Pause: 0 statt −6
  [7, 'absent', false, 0, 22, 75, true], // nur die Wochenquest – in der Pause bleibt es Pause (0 statt −1)
  [8, 'good', false, 2, 24, 75, true], // 2 von 3: die Pause ist vorbei (0)
  [9, 'missed', false, -6, 18, 75, true], // (1)
  [10, 'missed', false, -6, 12, 75, true], // (2)
  [11, 'missed', false, -6, 6, 75, true], // (3)
  [12, 'good', false, 2, 8, 75, true], // 2 von 3 (0) – ohne ihn wäre Tag 13/14 Pause
  [13, 'missed', false, -6, 2, 75, true], // (1)
  [14, 'missed', false, -2, 75, 75, true], // 2 − 6 → 0: Niederlage, danach wieder voll (hpDelta = −Start) (2)
  [15, 'perfect', false, 0, 75, 75, true], // schon voll (0)
  [16, 'missed', false, 5, 80, 80, true], // Level-Up heilt voll – trotz verpasstem Tag (1)
  [17, 'good', false, 0, 80, 80, false], // Sanfter Modus (abgerechnet am Tag 19): Wertung ja, HP nicht (0)
  [18, 'weak', true, 0, 80, 80, false], // Streak-Schutz wirkt auch im Sanften Modus (bleibt 0)
  [19, 'rest', false, 0, 80, 80, true], // wieder an: Start mit vollen HP; Urlaub
  [20, 'rest', false, 0, 80, 80, true],
  [21, 'rest', false, 0, 80, 80, true],
  [22, 'rest', false, 0, 80, 80, true],
  // Zehn Tage Abwesenheit: 3 schadende Tage (3 × −6 = −18), dann Pause.
  [23, 'missed', false, -6, 74, 80, true], // (1)
  [24, 'missed', false, -6, 68, 80, true], // (2)
  [25, 'missed', false, -6, 62, 80, true], // (3)
  [26, 'absent', false, 0, 62, 80, true],
  [27, 'absent', false, 18, 80, 80, true], // Heiltrank in der Pause: 62 + 20 = 82, begrenzt auf 80
  [28, 'absent', false, 0, 80, 80, true],
  [29, 'absent', false, 0, 80, 80, true],
  [30, 'absent', false, 0, 80, 80, true],
  [31, 'absent', false, 0, 80, 80, true],
  [32, 'absent', false, 0, 80, 80, true],
  [33, 'perfect', false, 0, 80, 80, true], // zurück: Perfekter Tag, schon voll (0)
]

const row = (entry: HpLedgerEntry): Row => [
  EXPECTED.find(([n]) => D(n) === entry.day)?.[0] ?? -1,
  entry.score,
  entry.frozen,
  entry.hpDelta,
  entry.hpAfter,
  entry.maxHp,
  entry.penalties,
]

describe('Review 2b – die Geschichte von Mira (von Hand gerechnetes Ledger)', () => {
  const ledger = playDaily(D(0), D(35))
  const settled = ledger.slice(1)

  it('Voraussetzung: Level 6 bis Tag 15, Level 7 ab Tag 16 – genau ein Aufstieg', () => {
    const level = (day: DayKey) => deriveGameState(dataAt(day, []), day).level.level
    expect(levelFromXp(36 * 80).level).toBe(6)
    expect(level(D(-1))).toBe(6)
    expect(level(D(15))).toBe(6)
    expect(level(D(16))).toBe(7)
    expect(level(D(35))).toBe(7)
  })

  it('jede Zeile des Ledgers stimmt', () => {
    expect(settled.map(row)).toStrictEqual(EXPECTED)
  })

  it('Niederlage am Tag 14: 15 % des Guthabens am Ende des Tages, höchstens 100 Gold; sonst keine', () => {
    const defeats = settled.filter((entry) => entry.defeat !== undefined)
    expect(defeats.map((entry) => entry.day)).toStrictEqual([D(14)])
    const before = ledger.filter((entry) => entry.day < D(14))
    const balance = deriveGameState(dataAt(D(16), before), D(14)).gold.balance
    // 15 % von mindestens 667 Gold sind mindestens 100 → die Grenze greift: genau 100 Gold.
    expect(balance).toBeGreaterThanOrEqual(667)
    expect(Math.floor(balance * 0.15)).toBeGreaterThanOrEqual(BALANCING.defeatGoldLossMax)
    expect(defeats[0].defeat).toStrictEqual({ goldLost: 100 })
  })

  it('der abgeleitete Zustand unterwegs: HP, Vorschau für gestern, Vorrat, Kennzahlen, Gold', () => {
    // Stand am Tag `today`: abgerechnet ist bis vorgestern.
    const at = (today: DayKey) =>
      deriveGameState(dataAt(today, ledger.filter((entry) => entry.day <= addDays(today, -2))), today)

    // Tag 5: abgerechnet bis Tag 3; gestern (Tag 4) rettet der am Tag 4 gekaufte Streak-Schutz.
    const day5 = at(D(5))
    expect(day5.hp).toMatchObject({ enabled: true, current: 28, max: 75, settledThrough: D(3), defeats: 0 })
    expect(day5.hp.yesterday).toStrictEqual({ day: D(4), score: 'weak', threatenedDelta: 0, savedByFreeze: true })
    expect(day5.inventory.streakFreezes).toBe(1) // verbraucht ist er erst mit der Abrechnung

    // Tag 6: gestern verpasst, kein Schutz mehr übrig → −6 drohen (Zähler davor 2).
    const day6 = at(D(6))
    expect(day6.inventory.streakFreezes).toBe(0)
    expect(day6.hp.yesterday).toStrictEqual({ day: D(5), score: 'missed', threatenedDelta: -6, savedByFreeze: false })

    // Tag 7: abgerechnet bis Tag 5 (22 HP, Zähler 3) – die Vorschau für gestern zeigt die Pause, nichts droht.
    const day7 = at(D(7))
    expect(day7.hp).toMatchObject({ current: 22, settledThrough: D(5) })
    expect(day7.hp.yesterday).toStrictEqual({ day: D(6), score: 'absent', threatenedDelta: 0, savedByFreeze: false })

    // Tag 10: gestern (Tag 9) wieder −6 – der gute Tag 8 hat die Pause beendet.
    expect(at(D(10)).hp.yesterday).toStrictEqual({ day: D(9), score: 'missed', threatenedDelta: -6, savedByFreeze: false })

    // Tag 16: Niederlage abgerechnet; das Level ist heute höher als am Tag 14 → sofort volle (neue) Max-HP.
    const day16 = at(D(16))
    const goldLost = 100
    expect(day16.hp).toMatchObject({ current: 80, max: 80, defeats: 1, lastDefeat: { day: D(14), goldLost } })
    expect(day16.gold.lostToDefeats).toBe(goldLost)
    expect(day16.gold.balance).toBe(day16.gold.earned - day16.gold.spent - goldLost)
    expect(day16.gold.spent).toBe(TREAT_PRICE + 150)
    // „Unbeugsam“: Tag 15 war nach der Niederlage perfekt.
    expect(day16.achievements.find((a) => a.definition.id === 'indomitable')?.unlocked).toBe(true)

    // Tag 19 (Sanfter Modus): HP ausgeblendet, voll; der zweite Streak-Schutz ist noch nicht verbraucht.
    const day19 = at(D(19))
    expect(day19.hp).toMatchObject({ enabled: false, current: 80, max: 80 })
    expect(day19.hp.yesterday).toStrictEqual({ day: D(18), score: 'weak', threatenedDelta: 0, savedByFreeze: true })
    expect(day19.restToday).toBe(true)

    // Tag 28: Heiltrank vom Tag 27 wirkt sofort im abgeleiteten Zustand (abgerechnet bis Tag 26: 62 + 20 → 80).
    expect(at(D(28)).hp).toMatchObject({ current: 80, max: 80, settledThrough: D(26) })

    // Ende: alles abgerechnet bis Tag 33.
    const end = at(D(35))
    expect(end.hp).toMatchObject({ enabled: true, current: 80, max: 80, settledThrough: D(33), defeats: 1 })
    expect(end.inventory.streakFreezes).toBe(0)
    expect(end.gold.lostToDefeats).toBe(goldLost)
    expect(end.gold.spent).toBe(TREAT_PRICE + 150 + 150 + 80)
  })

  it('unregelmäßig geöffnet (Tag 3, 10, 18): bis Tag 16 dieselben Wertungen und HP wie täglich', () => {
    let irregular: HpLedgerEntry[] = [PRIOR]
    for (const today of [D(3), D(10), D(18)]) {
      irregular = [...irregular, ...settleDays(dataAt(today, irregular), today)]
    }
    const withoutGold = (entries: HpLedgerEntry[]) => entries.map(({ defeat, ...entry }) => ({ ...entry, defeat: defeat !== undefined }))
    expect(withoutGold(irregular.slice(1))).toStrictEqual(withoutGold(settled.filter((entry) => entry.day <= D(16))))
    // Nur das Gold der Niederlage hängt vom Zeitpunkt ab: Es rechnet mit allen Ausgaben bis zur Abrechnung (hier
    // zusätzlich dem Streak-Schutz vom Tag 18) – eine spätere Abrechnung kostet so nie mehr, und das Guthaben fällt
    // durch eine Niederlage nie unter 0.
    const lostDaily = settled.find((entry) => entry.day === D(14))?.defeat?.goldLost ?? 0
    const lostLate = irregular.find((entry) => entry.day === D(14))?.defeat?.goldLost ?? 0
    const balanceLate = deriveGameState(dataAt(D(18), irregular.filter((entry) => entry.day < D(14))), D(14)).gold.balance
    const balanceDaily = deriveGameState(dataAt(D(16), settled.filter((entry) => entry.day < D(14))), D(14)).gold.balance
    expect(balanceLate).toBe(balanceDaily - 150)
    // Täglich: ≥ 667 Gold → 15 % ≥ 100 → die Grenze (100). Spät: 150 Gold weniger, < 667 → 15 % < 100, keine Grenze.
    expect(balanceDaily).toBeGreaterThanOrEqual(667)
    expect(balanceLate).toBeLessThan(667)
    expect(lostDaily).toBe(100)
    expect(lostLate).toBe(Math.floor(balanceLate * 0.15))
    expect(lostLate).toBeLessThan(lostDaily)
  })

  it('nach dem Abrechnen ändern Bearbeitungen nichts mehr: Quest löschen, Rhythmus ändern, nachtragen, Urlaub löschen', () => {
    const today = D(35)
    const base = dataAt(today, ledger)
    const before = deriveGameState(base, today)
    // Quest A löschen, B auf Wochenquest umstellen (Verlauf wie im Repository), C für einen abgerechneten Tag
    // nachtragen, den (vergangenen) Urlaub entfernen.
    let edited = applyHabitDeletion(base, 'A', today)
    edited = {
      ...edited,
      habits: edited.habits.map((habit) =>
        habit.id === 'B'
          ? { ...habit, schedule: { type: 'weekly', times: 3 }, scheduleHistory: [{ until: today, schedule: { type: 'daily' } }] }
          : habit,
      ),
      completions: [...edited.completions, makeCompletion(C, D(13))],
      restPeriods: [],
    }
    expect(settleDays(edited, today)).toStrictEqual([])
    const after = deriveGameState(edited, today)
    expect(after.level.level).toBe(before.level.level)
    expect(after.hp).toStrictEqual(before.hp)
    expect(after.gold.lostToDefeats).toBe(before.gold.lostToDefeats)
    // Die Statistik zeigt für abgerechnete Tage weiter die gespeicherte Wertung.
    const history = dayHistory(edited, today)
    for (const entry of settled) {
      const stat = history.days.find((day) => day.day === entry.day)
      expect(stat?.score, entry.day).toBe(entry.score)
      expect(stat?.settled).toBe(true)
    }
  })
})

describe('Review 2b – Streaks überstehen aufgefangene Tage und Ruhetage', () => {
  // S: einzige Tagesquest. Tag 0–3 erledigt, Tag 4 verpasst (Streak-Schutz), Tag 5 erledigt, Tag 6 Ruhetag
  // (nichts erledigt), Tag 7 erledigt, Tag 8 Ruhetag mit Erledigung.
  const S = makeHabit({ id: 'S', difficulty: 'easy', createdDay: START })
  const doneDays = [0, 1, 2, 3, 5, 7, 8]
  function storyData(today: DayKey, ledger: HpLedgerEntry[]): GameData {
    return makeGameData({
      profile: { name: 'Mira', avatar: '🧙', createdDay: START },
      settings: { ...DEFAULT_SETTINGS, penalties: { enabled: true, since: START } },
      habits: [S],
      completions: doneDays.map((n) => makeCompletion(S, D(n))).filter((c) => c.day <= today),
      purchases: [makeItemPurchase('f', 'streakFreeze', D(2))],
      restPeriods: [makeRestPeriod('r1', D(6)), makeRestPeriod('r2', D(8))],
      hpLedger: ledger,
    })
  }
  function play(to: DayKey): HpLedgerEntry[] {
    let ledger: HpLedgerEntry[] = []
    for (const today of dayRange(START, to)) ledger = [...ledger, ...settleDays(storyData(today, ledger), today)]
    return ledger
  }

  it('Serie zählt Erledigungen weiter, aufgefangene/Ruhetage ohne Erledigung brechen nichts', () => {
    const ledger = play(D(10))
    expect(ledger.map((entry) => [entry.day, entry.score, entry.frozen])).toStrictEqual([
      [D(0), 'perfect', false],
      [D(1), 'perfect', false],
      [D(2), 'perfect', false],
      [D(3), 'perfect', false],
      [D(4), 'missed', true],
      [D(5), 'perfect', false],
      [D(6), 'rest', false],
      [D(7), 'perfect', false],
      [D(8), 'rest', false],
    ])
    const state = deriveGameState(storyData(D(10), ledger), D(10))
    // Tag 0,1,2,3,5,7,8 erledigt = 7 in Folge (Tag 4 und 6 überbrückt); Tag 9 ist verpasst (nicht abgerechnet,
    // kein Schutz mehr) und bricht – heute (Tag 10) läuft noch.
    expect(state.todayState.habits[0].streak).toMatchObject({ current: 0, best: 7 })
    expect(state.totals.bestDayStreak).toBe(7)
    // Streak-Bonus: Tag 5 = Serie davor 4 (+20 %), Tag 7 = 5 (+25 %), Tag 8 = 6 (+30 %).
    expect(getDayState(storyData(D(10), ledger), D(5)).habits[0].streakBonus).toBeCloseTo(0.2)
    expect(getDayState(storyData(D(10), ledger), D(7)).habits[0].streakBonus).toBeCloseTo(0.25)
    expect(getDayState(storyData(D(10), ledger), D(8)).habits[0].streakBonus).toBeCloseTo(0.3)
    // XP von Hand: 10 + 11 + 11 + 12 (Tage 0–3) + 12 (Tag 5, +20 %) + 13 (Tag 7, 12,5 → 13) + 13 (Tag 8)
    // = 82 Quest-XP; Perfekte Tage 0,1,2,3,5,7: round(¼ × 10, 11, 11, 12, 12, 13) = 3 + 3 + 3 + 3 + 3 + 3 = 18.
    expect(state.totals.xpFromQuests).toBe(82)
    expect(state.totals.xpFromPerfectDays).toBe(18)
    expect(state.level.totalXp).toBe(100)
    expect(BALANCING.perfectDayBonus).toBe(0.25)
  })

  it('der Streak-Schutz rettet die Wochen-Serie einer Wochenquest in derselben Woche (eine Woche mit Schontag bricht nie)', () => {
    const daily = makeHabit({ id: 'daily', difficulty: 'easy', createdDay: START })
    const weekly = makeHabit({ id: 'weekly', difficulty: 'easy', createdDay: START, schedule: { type: 'weekly', times: 3 } })
    // Woche 1: Wochenquest 3× erfüllt. Woche 2: nur 1× – aber Tag 9 (Mi) ist aufgefangen. Woche 3: 3× erfüllt.
    const completions = [
      ...[0, 1, 2, 3, 4, 5, 6, 7, 8, 10, 11, 12, 13, 14, 15, 16].map((n) => makeCompletion(daily, D(n))),
      ...[0, 1, 2, 7, 14, 15, 16].map((n) => makeCompletion(weekly, D(n))),
    ]
    const ledger = [makeLedgerEntry(D(9), { score: 'missed', frozen: true, hpAfter: 50 })]
    const data = makeGameData({
      profile: { name: 'Mira', avatar: '🧙', createdDay: START },
      settings: { ...DEFAULT_SETTINGS, penalties: { enabled: true, since: D(9) } },
      habits: [daily, weekly],
      completions,
      purchases: [makeItemPurchase('f', 'streakFreeze', D(9))],
      hpLedger: ledger,
    })
    const state = deriveGameState(data, D(17))
    const weeklyStatus = state.todayState.habits.find((status) => status.habit.id === 'weekly')
    // Woche 2 bricht nicht (Schontag), zählt aber nicht mit: Serie = Woche 1 + Woche 3 = 2.
    expect(weeklyStatus?.streak).toMatchObject({ unit: 'week', current: 2, best: 2 })
    const dailyStatus = state.todayState.habits.find((status) => status.habit.id === 'daily')
    // 0–8 (9) + aufgefangener Tag 9 überbrückt + 10–16 (7) = 16 in Folge, heute (Tag 17) offen.
    expect(dailyStatus?.streak).toMatchObject({ current: 16, best: 16 })
  })
})

describe('Review 2b – Lücke zwischen Ledger und Beginn der Abrechnung (z. B. nach dem Wiederherstellen)', () => {
  const S = makeHabit({ id: 'S', difficulty: 'easy', createdDay: START })
  function gapData(purchases: Purchase[]): GameData {
    return makeGameData({
      profile: { name: 'Mira', avatar: '🧙', createdDay: START },
      // Abgerechnet bis Tag 2 (30 HP); die Abrechnung beginnt erst wieder am Tag 6.
      settings: { ...DEFAULT_SETTINGS, penalties: { enabled: true, since: D(6) } },
      habits: [S],
      // Nur am Tag 6 erledigt (bleibt Level 1, kein Level-Aufstieg).
      completions: [makeCompletion(S, D(6))],
      purchases,
      hpLedger: [makeLedgerEntry(D(2), { score: 'perfect', hpAfter: 30 })],
    })
  }

  it('die Tage der Lücke werden nie abgerechnet; die HP laufen ab dem letzten Eintrag weiter', () => {
    const entries = settleDays(gapData([]), D(8))
    expect(entries.map((entry) => [entry.day, entry.score, entry.hpDelta, entry.hpAfter])).toStrictEqual([[D(6), 'perfect', 10, 40]])
  })

  it('ein Heiltrank aus der Lücke zählt mit dem ersten abgerechneten Tag – wie im abgeleiteten Zustand', () => {
    const data = gapData([makeItemPurchase('trank', 'healingPotion', D(4))])
    // Vorher (am Tag 7, abgerechnet bis Tag 2): 30 + 20 = 50.
    expect(deriveGameState(data, D(7)).hp.current).toBe(50)
    const entries = settleDays(data, D(8))
    expect(entries.map((entry) => [entry.day, entry.hpDelta, entry.hpAfter])).toStrictEqual([[D(6), 20, 50]])
    expect(deriveGameState({ ...data, hpLedger: [...(data.hpLedger ?? []), ...entries] }, D(8)).hp.current).toBe(50)
  })
})

describe('Review 2b – unabhängiges Referenzmodell der Abrechnung (Zufallsdaten)', () => {
  /**
   * Bewusst einfach und langsam: Wertung über `getDayState`, Durchhänger-Pause durch Zurückblättern im Ledger,
   * Streak-Schutz durch Zählen, Level und Gold über `deriveGameState` am Ende jedes Tages – keine Bausteine aus
   * `hpRules.ts`.
   */
  function referenceSettle(data: GameData, today: DayKey): HpLedgerEntry[] {
    const since = data.settings.penalties?.since
    if (since === undefined) return []
    const ledger = [...(data.hpLedger ?? [])].sort((a, b) => (a.day < b.day ? -1 : 1))
    const last = ledger.at(-1)
    const from = last !== undefined && addDays(last.day, 1) > since ? addDays(last.day, 1) : since
    const to = addDays(today, -2)
    const rest = new Set((data.restPeriods ?? []).flatMap((period) => dayRange(period.from, period.until)))
    const habitIds = new Set(data.habits.map((habit) => habit.id))
    const activeDays = new Set(
      data.completions.filter((c) => habitIds.has(c.habitId) && c.value >= c.target && c.day <= today).map((c) => c.day),
    )
    const enabled = data.settings.penalties?.enabled !== false
    const entries: HpLedgerEntry[] = []
    let previous = last
    for (const day of dayRange(from, to)) {
      const state = getDayState({ ...data, completions: data.completions.filter((c) => c.day <= today) }, day)
      // Durchhänger: von hinten durch alle bisherigen Einträge (Ledger und schon gerechnete Tage) – schadende Tage
      // (weak/missed ohne Schutz) zählen, Ruhe-, „none“- und aufgefangene Tage werden übersprungen; ein guter oder
      // perfekter Tag beendet die Suche, ein „absent“ heißt: Die Pause läuft schon.
      let damaging = 0
      let paused = false
      const earlier = [...ledger, ...entries]
      for (let i = earlier.length - 1; i >= 0 && !paused; i--) {
        const { score: earlierScore, frozen: earlierFrozen } = earlier[i]
        if (earlierScore === 'perfect' || earlierScore === 'good') break
        if (earlierScore === 'absent') paused = true
        else if ((earlierScore === 'weak' || earlierScore === 'missed') && !earlierFrozen) damaging++
      }
      let score: DayScore
      if (rest.has(day)) score = 'rest'
      else if (state.requiredCount === 0) score = 'none'
      else if (state.requiredDone === state.requiredCount) score = 'perfect'
      else if (state.requiredDone * 2 >= state.requiredCount) score = 'good'
      else if (state.requiredDone > 0) score = 'weak'
      else if (activeDays.has(day)) score = 'weak' // keine Tagesquest, aber eine andere Quest erledigt
      else score = 'missed'
      // Pause: schon 3 schadende Tage in Folge davor → aus weak/missed wird absent (vor dem Streak-Schutz).
      if ((paused || damaging >= 3) && (score === 'weak' || score === 'missed')) score = 'absent'
      const used = [...ledger, ...entries].filter((entry) => entry.frozen).length
      const bought = (data.purchases ?? []).filter((p) => p.itemId === 'streakFreeze' && p.day <= day).length
      const frozen = (score === 'weak' || score === 'missed') && bought - used > 0
      const soFar = [...ledger, ...entries]
      const level = deriveGameState({ ...data, hpLedger: soFar }, day).level.level
      const levelBefore = deriveGameState({ ...data, hpLedger: soFar }, addDays(day, -1)).level.level
      const maxHp = 45 + 5 * level
      let entry: HpLedgerEntry
      if (!enabled) {
        entry = { day, score, frozen, hpDelta: 0, hpAfter: maxHp, maxHp, penalties: false }
      } else {
        const startHp = previous !== undefined && previous.penalties ? previous.hpAfter : maxHp
        const potions = (data.purchases ?? []).filter(
          (p) => p.itemId === 'healingPotion' && p.day <= day && (previous === undefined ? p.day === day : p.day > previous.day),
        ).length
        const effect = frozen ? 0 : { perfect: 10, good: 2, weak: -1, missed: -6, rest: 0, none: 0, absent: 0 }[score]
        const after = level > levelBefore ? maxHp : Math.min(maxHp, Math.max(0, startHp + effect + 20 * potions))
        entry = { day, score, frozen, hpDelta: after - startHp, hpAfter: after, maxHp, penalties: true }
        if (after <= 0) {
          const balance = deriveGameState({ ...data, hpLedger: soFar }, day).gold.balance
          entry.defeat = { goldLost: Math.min(100, Math.floor(Math.max(0, balance) * 0.15)) }
          entry.hpAfter = maxHp
        }
      }
      entries.push(entry)
      previous = entry
    }
    return entries
  }

  function randomData(seed: number): { data: GameData; today: DayKey } {
    const rnd = seededRandom(seed)
    const days = 20 + Math.floor(rnd() * 25)
    const today = D(days)
    const count = 1 + Math.floor(rnd() * 4)
    const habits: Habit[] = Array.from({ length: count }, (_, i) =>
      makeHabit({
        id: `h${i}`,
        order: i,
        difficulty: rnd() < 0.5 ? 'easy' : 'hard',
        createdDay: D(Math.floor(rnd() * 5)),
        schedule: rnd() < 0.2 ? { type: 'weekly', times: 2 } : rnd() < 0.3 ? { type: 'weekdays', days: [1, 3, 5] } : { type: 'daily' },
      }),
    )
    const completions: Completion[] = []
    let chance = rnd()
    let slump = false
    for (const [i, day] of dayRange(START, today).entries()) {
      if (rnd() < 0.15) {
        chance = rnd() < 0.3 ? 0 : rnd()
        // Durststrecke: nur an jedem 4. Tag eine einzige Quest – bei 1–2 Tagesquests ein guter Tag, der die
        // Durchhänger-Pause beendet (danach wieder 3 × −6), bei mehr ein schwacher, der sie nicht beendet. So kommt es
        // auch mit den milden Regeln zu Niederlagen und zu langen Pausen.
        slump = chance === 0 && rnd() < 0.6
      }
      if (slump) {
        const habit = habits.find((candidate) => candidate.createdDay <= day)
        if (i % 4 === 0 && habit !== undefined) completions.push(makeCompletion(habit, day))
        continue
      }
      for (const habit of habits) if (habit.createdDay <= day && rnd() < chance) completions.push(makeCompletion(habit, day))
    }
    const purchases: Purchase[] = []
    for (const day of dayRange(START, today)) {
      if (rnd() < 0.08) purchases.push(makeItemPurchase(`f-${day}`, 'streakFreeze', day))
      if (rnd() < 0.08) purchases.push(makeItemPurchase(`p-${day}`, 'healingPotion', day))
    }
    const restPeriods = rnd() < 0.6 ? [makeRestPeriod('r', D(5 + Math.floor(rnd() * 10)), D(15 + Math.floor(rnd() * 5)))] : []
    const sinceOffset = Math.floor(rnd() * 6)
    // Oft schon angeschlagen – mit den milden Regeln (−1 für schwache Tage, höchstens 3 schadende Tage je
    // Durchhänger) kommt es sonst kaum zu Niederlagen.
    const ledger = rnd() < 0.6 ? [makeLedgerEntry(D(sinceOffset), { score: 'good', hpAfter: 1 + Math.floor(rnd() * 10) })] : []
    const data = makeGameData({
      profile: { name: 'Mira', avatar: '🧙', createdDay: START },
      settings: { ...DEFAULT_SETTINGS, penalties: { enabled: rnd() < 0.85, since: D(sinceOffset + (rnd() < 0.3 ? 3 : 0)) } },
      habits,
      completions,
      purchases,
      restPeriods,
      hpLedger: ledger,
      sideQuests: [
        ...(rnd() < 0.3 ? [makeSideQuest({ id: 'boost', difficulty: 'epic', createdDay: START, doneDay: D(10) })] : []),
        // Manchmal ein großes Guthaben (40 × 80 XP vor Beginn = 1.600 Gold, abzüglich der Gegenstände): 15 % wären
        // oft mehr als 100 → die Grenze.
        ...(rnd() < 0.3
          ? Array.from({ length: 40 }, (_, i) => makeSideQuest({ id: `rich-${i}`, difficulty: 'epic', createdDay: D(-1), doneDay: D(-1) }))
          : []),
      ],
    })
    return { data, today }
  }

  it('settleDays = Referenzmodell (60 Zufallsverläufe, inkl. Lücke, Sanfter Modus, Niederlagen)', () => {
    let defeats = 0
    let capped = 0
    let frozen = 0
    let absent = 0
    let pauseEnded = 0
    let weakWithoutDaily = 0
    for (let seed = 1; seed <= 60; seed++) {
      const { data, today } = randomData(seed)
      const actual = settleDays(data, today)
      expect(actual, `seed ${seed}`).toStrictEqual(referenceSettle(data, today))
      defeats += actual.filter((entry) => entry.defeat !== undefined).length
      capped += actual.filter((entry) => entry.defeat?.goldLost === 100).length
      frozen += actual.filter((entry) => entry.frozen).length
      absent += actual.filter((entry) => entry.score === 'absent').length
      pauseEnded += actual.filter(
        (entry, i) => (entry.score === 'good' || entry.score === 'perfect') && actual[i - 1]?.score === 'absent',
      ).length
      weakWithoutDaily += actual.filter((entry) => entry.score === 'weak' && getDayState(data, entry.day).requiredDone === 0).length
    }
    // Die Zufallsdaten decken auch Niederlagen (mit und ohne Obergrenze), Streak-Schutz, Durchhänger-Pausen (auch
    // durch einen guten Tag beendete) und schwache Tage ohne erledigte Tagesquest (nur eine andere Quest) ab.
    expect(defeats).toBeGreaterThan(capped)
    expect(capped).toBeGreaterThan(0)
    expect(frozen).toBeGreaterThan(0)
    expect(absent).toBeGreaterThan(0)
    expect(pauseEnded).toBeGreaterThan(0)
    expect(weakWithoutDaily).toBeGreaterThan(0)
  })
})
