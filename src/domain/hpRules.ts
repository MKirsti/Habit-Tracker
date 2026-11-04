/**
 * Lebenspunkte (Phase 2b) – die Regeln ohne die eigentliche Abrechnung: Ruhetage, Tageswertung, Durchhänger-Pause,
 * Streak-Schutz, Heiltränke und der abgeleitete HP-Zustand (ARCHITECTURE.md „Phase 2b … (Vertrag)“).
 *
 * Öffentlicher Einstieg ist `hp.ts`: Es exportiert alles von hier plus `settleDays`. Diese Datei hängt bewusst
 * nicht von der Engine ab – `engine.ts` nutzt sie für `GameState.hp`, und `hp.ts` nutzt die Engine für die
 * Abrechnung. So entsteht kein Import-Kreis (`hp.ts` → `engine.ts` → `hpRules.ts`).
 *
 * Grundidee (vom Spieler gewünscht): **eine** Wertung pro Spieltag, egal wie viele Quests und Kampagnen laufen.
 * Höchstens −6 HP pro Tag, Wochenquests kosten nie etwas (eine erledigte macht aus `missed` höchstens `weak`),
 * ein Durchhänger kostet höchstens 3 schadende Tage (danach „Pause“ bis zum nächsten guten Tag), Ruhetage nie.
 * Etwas zu tun ist so nie schlechter als nichts zu tun.
 */
import { BALANCING } from './balancing'
import { addDays, compareDays, fromEpochDay, isValidDayKey, toEpochDay } from './dates'
import type {
  DayKey,
  DayScore,
  GameData,
  HpLedgerEntry,
  HpState,
  InventoryState,
  ItemId,
  Purchase,
  RestPeriod,
  Settings,
} from './types'

// ---------------------------------------------------------------------------
// Grundwerte
// ---------------------------------------------------------------------------

/** Max-HP bei diesem Level: `hpBase + hpPerLevel × Level` (Level 1 → 50). Ungültige Level zählen als 1. */
export function maxHpForLevel(level: number): number {
  const valid = Number.isFinite(level) && level >= 1 ? Math.floor(level) : 1
  return BALANCING.hpBase + BALANCING.hpPerLevel * valid
}

/** Lebenspunkte aktiv? Standard: ja. `penalties.enabled === false` ist der Sanfte Modus. */
export function penaltiesEnabled(settings: Pick<Settings, 'penalties'>): boolean {
  return settings.penalties?.enabled !== false
}

/** HP-Wirkung einer Tageswertung (`BALANCING.hpByScore`, +10 / +2 / −1 / −6 / 0); unbekannte Wertung → 0. */
export function hpDeltaForScore(score: DayScore): number {
  return Object.hasOwn(BALANCING.hpByScore, score) ? BALANCING.hpByScore[score] : 0
}

/** Wertungen, die ein Streak-Schutz auffängt (und die sonst Schaden machen): `weak` und `missed`. */
export function isFreezableScore(score: DayScore): boolean {
  return score === 'weak' || score === 'missed'
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

function finiteOr(value: number, fallback: number): number {
  return Number.isFinite(value) ? value : fallback
}

// ---------------------------------------------------------------------------
// Rast & Urlaub
// ---------------------------------------------------------------------------

/** Schutz vor kaputten Daten: Ein Zeitraum wird höchstens so weit aufgespannt (das Repository erlaubt 60 Tage). */
const MAX_REST_SPAN_DAYS = 3660

/** Gültiger Zeitraum: beide Tage gültig, `from ≤ until`. */
function isValidRestPeriod(period: Pick<RestPeriod, 'from' | 'until'>): boolean {
  return isValidDayKey(period.from) && isValidDayKey(period.until) && compareDays(period.from, period.until) <= 0
}

/**
 * Alle Ruhetage (inklusive beider Enden jedes Zeitraums) als Menge – für `isRequiredOn(habit, day, restDays)` und
 * als Teil der Schontage der Streaks. Ungültige Zeiträume werden ignoriert.
 */
export function restDaySet(periods: readonly RestPeriod[] | undefined): Set<DayKey> {
  const days = new Set<DayKey>()
  for (const period of periods ?? []) {
    if (!isValidRestPeriod(period)) continue
    const start = toEpochDay(period.from)
    const end = Math.min(toEpochDay(period.until), start + MAX_REST_SPAN_DAYS - 1)
    for (let day = start; day <= end; day++) days.add(fromEpochDay(day))
  }
  return days
}

/** Der Ruhe-Zeitraum, in dem `day` liegt (bei Überschneidungen der zuerst gespeicherte), sonst `undefined`. */
export function restPeriodOn(periods: readonly RestPeriod[] | undefined, day: DayKey): RestPeriod | undefined {
  return (periods ?? []).find(
    (period) =>
      isValidRestPeriod(period) && compareDays(period.from, day) <= 0 && compareDays(day, period.until) <= 0,
  )
}

/** Ist `day` ein Ruhetag bzw. Urlaubstag? */
export function isRestDay(periods: readonly RestPeriod[] | undefined, day: DayKey): boolean {
  return restPeriodOn(periods, day) !== undefined
}

// ---------------------------------------------------------------------------
// Ledger & Gegenstände
// ---------------------------------------------------------------------------

/**
 * Gespeicherte Abrechnung, aufbereitet: nur Einträge mit gültigem Tag, nach Tag sortiert, je Tag einer (der
 * erste). Mit `before` nur Einträge vor diesem Tag (Stand „zu Beginn von `before`“).
 */
export function sortedLedger(entries: readonly HpLedgerEntry[] | undefined, before?: DayKey): HpLedgerEntry[] {
  const seen = new Set<DayKey>()
  const result: HpLedgerEntry[] = []
  for (const entry of entries ?? []) {
    if (!isValidDayKey(entry.day) || seen.has(entry.day)) continue
    if (before !== undefined && compareDays(entry.day, before) >= 0) continue
    seen.add(entry.day)
    result.push(entry)
  }
  return result.sort((a, b) => compareDays(a.day, b.day))
}

/** Ein gültiger Kauf des Gegenstands `itemId` (mit gültigem Kauftag). */
export function isItemPurchase(purchase: Purchase, itemId: ItemId): boolean {
  return purchase.kind === 'item' && purchase.itemId === itemId && isValidDayKey(purchase.day)
}

/** Kauftage eines Gegenstands, aufsteigend (ein Tag je Kauf, mehrere Käufe am selben Tag → mehrfach). */
export function itemPurchaseDays(purchases: readonly Purchase[] | undefined, itemId: ItemId): DayKey[] {
  return (purchases ?? [])
    .filter((purchase) => isItemPurchase(purchase, itemId))
    .map((purchase) => purchase.day)
    .sort(compareDays)
}

/** Anzahl Käufe des Gegenstands mit `after < Kauftag ≤ through` (`after` weggelassen: alle bis `through`). */
export function countItemPurchases(
  purchases: readonly Purchase[] | undefined,
  itemId: ItemId,
  through: DayKey,
  after?: DayKey,
): number {
  let count = 0
  for (const purchase of purchases ?? []) {
    if (!isItemPurchase(purchase, itemId) || compareDays(purchase.day, through) > 0) continue
    if (after !== undefined && compareDays(purchase.day, after) <= 0) continue
    count++
  }
  return count
}

/** Verbrauchte Streak-Schutz-Gegenstände: abgerechnete Tage mit `frozen`. */
export function freezesUsedIn(ledger: readonly HpLedgerEntry[]): number {
  return ledger.reduce((count, entry) => count + (entry.frozen === true ? 1 : 0), 0)
}

/** Durch Niederlagen verlorenes Gold (Summe `defeat.goldLost`, ungültige/negative Werte zählen nicht). */
export function goldLostToDefeats(ledger: readonly HpLedgerEntry[]): number {
  let lost = 0
  for (const entry of ledger) {
    const goldLost = entry.defeat?.goldLost
    if (goldLost !== undefined && Number.isFinite(goldLost) && goldLost > 0) lost += goldLost
  }
  return lost
}

// ---------------------------------------------------------------------------
// Tageswertung
// ---------------------------------------------------------------------------

/** Was ein Spieltag für die Wertung hergibt (liefert die Engine, `dayFactsOf`). */
export interface DayFacts {
  /** Fällige Tagesquests inkl. Grabsteinen gelöschter Quests (wie beim Perfekten Tag); an Ruhetagen 0. */
  requiredCount: number
  /** Davon erledigt. */
  requiredDone: number
  /** Mindestens eine Quest erledigt (Tages- oder Wochenquest; Nebenquests und Teilfortschritt zählen nicht). */
  active: boolean
}

/**
 * Wertung nach dem Anteil erledigter Tagesquests: alle → `perfect`, ≥ 50 % → `good`, > 0 → `weak`, keine →
 * `missed`; ohne fällige Tagesquest `none`. Gerechnet mit ganzen Zahlen (2 von 4 ist genau 50 % → `good`).
 */
export function scoreByProgress(requiredCount: number, requiredDone: number): DayScore {
  if (!(requiredCount > 0)) return 'none'
  if (requiredDone >= requiredCount) return 'perfect'
  if (2 * requiredDone >= requiredCount) return 'good'
  if (requiredDone > 0) return 'weak'
  return 'missed'
}

/**
 * Wertung eines Tages in der Reihenfolge des Vertrags: Ruhetag → `rest`; keine Tagesquest fällig → `none`; sonst
 * nach Anteil (`scoreByProgress`) – mit einer Ausnahme zugunsten des Helden: Ist keine Tagesquest erledigt, aber eine
 * andere Quest (z. B. eine Wochenquest), gilt der Tag als `weak` statt `missed`. Läuft die Durchhänger-Pause
 * (`flags.pause`, siehe `isSlumpPause`), wird aus einem schwachen oder verpassten Tag `absent` („Pause“, 0 HP);
 * ein guter oder perfekter Tag bleibt, was er ist (und beendet die Pause).
 */
export function classifyDay(facts: DayFacts, flags: { rest: boolean; pause: boolean }): DayScore {
  if (flags.rest) return 'rest'
  if (!(facts.requiredCount > 0)) return 'none'
  const progress = scoreByProgress(facts.requiredCount, facts.requiredDone)
  // Wer an dem Tag immerhin eine Quest erledigt hat (z. B. nur eine Wochenquest), hat etwas getan – das ist
  // „Ein Anfang“, nie „Nichts erledigt“. Wochenquests kosten so nie HP, sie können nur helfen.
  const score = progress === 'missed' && facts.active ? 'weak' : progress
  return flags.pause && isFreezableScore(score) ? 'absent' : score
}

/** Ein (vorab) gewerteter Tag: Schritte 1–2 der Abrechnung, noch ohne HP. */
export interface ScoredDay {
  day: DayKey
  score: DayScore
  /** Ein Streak-Schutz fängt den Tag auf (nur bei `weak`/`missed` und Vorrat). */
  frozen: boolean
}

// ---------------------------------------------------------------------------
// Durchhänger-Pause
// ---------------------------------------------------------------------------

/** Was der Durchhänger-Zähler von einem (abgerechneten oder vorab gewerteten) Tag braucht. */
export type SlumpDay = Pick<ScoredDay, 'score' | 'frozen'>

/** Schadender Tag: `weak` oder `missed`, den kein Streak-Schutz auffängt. */
export function isDamagingDay(day: SlumpDay): boolean {
  return isFreezableScore(day.score) && day.frozen !== true
}

/**
 * Ein Schritt des Durchhänger-Zählers (schadende Tage in Folge), chronologisch:
 * - schadender Tag (`weak`/`missed`, nicht aufgefangen) → +1
 * - `perfect` / `good` → 0 (die Pause endet)
 * - `absent` (eine Pause – auch ein alter Abwesenheits-Eintrag) → mindestens `slumpPauseAfterDays`: die Pause läuft
 * - `rest`, `none` und vom Streak-Schutz aufgefangene Tage → unverändert (zählen nicht, brechen nichts)
 */
export function slumpCountAfter(count: number, day: SlumpDay): number {
  if (day.score === 'perfect' || day.score === 'good') return 0
  if (day.score === 'absent') return Math.max(count, BALANCING.slumpPauseAfterDays)
  return isDamagingDay(day) ? count + 1 : count
}

/**
 * Durchhänger-Zähler nach den Tagen `days` (chronologisch, ab `count`) – der gemeinsame Baustein von Abrechnung
 * (`settleDays`/`scoreDays`), Vorschau für gestern (`hpCalendar`) und Statistik (`dayHistory`). Die Abrechnung zählt
 * über das Ledger (die abgerechneten Einträge) und die gerade gewerteten Tage – nie über Tage ohne Eintrag (vor
 * `since`, Lücken im Ledger); die Statistik zählt genauso und wertet nur die Tage vor dem Beginn der Abrechnung live.
 */
export function slumpCountOf(days: Iterable<SlumpDay>, count = 0): number {
  let result = count
  for (const day of days) result = slumpCountAfter(result, day)
  return result
}

/** Läuft die Durchhänger-Pause? Ja, wenn unmittelbar vor dem Tag ≥ `slumpPauseAfterDays` schadende Tage in Folge liegen. */
export function isSlumpPause(count: number): boolean {
  return count >= BALANCING.slumpPauseAfterDays
}

// ---------------------------------------------------------------------------
// Wertung mehrerer Tage (Abrechnung und Vorschau)
// ---------------------------------------------------------------------------

export interface ScoreDaysInput {
  /** Erster und letzter zu wertender Tag (inklusive). */
  from: DayKey
  to: DayKey
  factsOf: (day: DayKey) => DayFacts
  restDays: ReadonlySet<DayKey>
  purchases: readonly Purchase[] | undefined
  /**
   * Schon abgerechnete Einträge, nach Tag sortiert (`sortedLedger`); zählen nur die vor `from`: Daraus ergeben
   * sich die verbrauchten Streak-Schutz-Gegenstände (`frozen`) und der Durchhänger-Zähler (`slumpCountOf`).
   */
  ledger: readonly HpLedgerEntry[]
}

/**
 * Wertung und Streak-Schutz für die Tage `from … to` (chronologisch) – Schritte 1–2 der Abrechnung:
 * 1. Wertung (`classifyDay`). Durchhänger-Pause: Liegen unmittelbar vor dem Tag schon `slumpPauseAfterDays` (3)
 *    schadende Tage in Folge (Zähler aus dem Ledger plus den hier schon gewerteten Tagen, `slumpCountOf`), wird aus
 *    einem schwachen oder verpassten Tag `absent` („Pause“: 0 HP, kein Streak-Schutz) – bis zum nächsten guten oder
 *    perfekten Tag. Ein Durchhänger kostet so höchstens 3 schadende Tage.
 * 2. Streak-Schutz bei `weak`/`missed` (also nur, wenn keine Pause läuft), wenn der Vorrat reicht: gekaufte mit
 *    Kauftag ≤ Tag minus bereits verbrauchte (ältester zuerst). Ein nach dem Tag gekaufter Streak-Schutz kann ihn
 *    nicht mehr retten. Ein aufgefangener Tag zählt nicht als schadend (der Zähler bleibt).
 * Die Abrechnung (`settleDays`) und die Vorschau für gestern (`hpCalendar`) nutzen genau diese Funktion.
 */
export function scoreDays(input: ScoreDaysInput): ScoredDay[] {
  const result: ScoredDay[] = []
  if (!isValidDayKey(input.from) || !isValidDayKey(input.to) || compareDays(input.from, input.to) > 0) return result
  const before = input.ledger.filter((entry) => compareDays(entry.day, input.from) < 0)
  const freezeDays = itemPurchaseDays(input.purchases, 'streakFreeze')
  let bought = 0
  let next = 0
  let used = freezesUsedIn(before)
  let slump = slumpCountOf(before)
  const end = toEpochDay(input.to)
  for (let epoch = toEpochDay(input.from); epoch <= end; epoch++) {
    const day = fromEpochDay(epoch)
    while (next < freezeDays.length && compareDays(freezeDays[next], day) <= 0) {
      bought++
      next++
    }
    // Erst die Pause prüfen (dann gibt es nichts aufzufangen), sonst den Streak-Schutz.
    const score = classifyDay(input.factsOf(day), { rest: input.restDays.has(day), pause: isSlumpPause(slump) })
    const frozen = isFreezableScore(score) && bought - used > 0
    if (frozen) used++
    const scored: ScoredDay = { day, score, frozen }
    slump = slumpCountAfter(slump, scored)
    result.push(scored)
  }
  return result
}

/**
 * Beginn des Abenteuers (Beginn der Statistik): `profile.createdDay`; ohne Profil der früheste Anlegetag einer
 * Quest (auch gelöschter); ohne alles `fallback`.
 */
export function adventureStartOf(data: GameData, fallback: DayKey): DayKey {
  if (data.profile !== undefined && isValidDayKey(data.profile.createdDay)) return data.profile.createdDay
  let earliest: DayKey | undefined
  for (const habit of [...data.habits, ...(data.deletedHabits ?? [])]) {
    if (!isValidDayKey(habit.createdDay)) continue
    if (earliest === undefined || compareDays(habit.createdDay, earliest) < 0) earliest = habit.createdDay
  }
  return earliest ?? fallback
}

/**
 * Erster Tag, der als nächstes abgerechnet wird: `max(penalties.since, letzter Ledger-Tag + 1)`; `undefined`,
 * solange `since` fehlt (es wird nie rückwirkend abgerechnet).
 */
export function nextUnsettledDay(settings: Pick<Settings, 'penalties'>, ledger: readonly HpLedgerEntry[]): DayKey | undefined {
  const since = settings.penalties?.since
  if (since === undefined || !isValidDayKey(since)) return undefined
  const last = ledger.at(-1)
  if (last === undefined) return since
  const afterLast = addDays(last.day, 1)
  return compareDays(afterLast, since) > 0 ? afterLast : since
}

// ---------------------------------------------------------------------------
// Kalender für die Engine: Schontage, Vorschau
// ---------------------------------------------------------------------------

/** Was die Engine zu einem Stichtag über Ruhetage, Abrechnung und noch offene Tage wissen muss. */
export interface HpCalendar {
  restDays: ReadonlySet<DayKey>
  /** Abgerechnete Einträge vor dem Stichtag, nach Tag sortiert. */
  ledger: readonly HpLedgerEntry[]
  /**
   * Noch nicht abgerechnete Tage vor dem Stichtag (ab `penalties.since`), vorab gewertet wie bei der Abrechnung –
   * normalerweise nur gestern (die Gnadenfrist), bei verspäteter Abrechnung auch frühere.
   */
  pending: readonly ScoredDay[]
  /**
   * Schontage für Streaks und Streak-Bonus (alle Quests): Ruhetage, abgerechnete `frozen`-Tage und noch offene
   * Tage, die ein Streak-Schutz auffangen würde (Vorschau für gestern).
   */
  freeDays: ReadonlySet<DayKey>
}

/**
 * Kalender zum Stichtag `asOf` (Stand zu Beginn von `asOf`: Ledger-Einträge ab `asOf` zählen noch nicht).
 * @param factsOf Tagesfakten aus der Engine (Pflicht/erledigt/aktiv, an Ruhetagen ohne Pflicht).
 */
export function hpCalendar(
  data: GameData,
  asOf: DayKey,
  restDays: ReadonlySet<DayKey>,
  factsOf: (day: DayKey) => DayFacts,
): HpCalendar {
  const ledger = sortedLedger(data.hpLedger, asOf)
  const from = nextUnsettledDay(data.settings, ledger)
  const pending =
    from === undefined
      ? []
      : scoreDays({
          from,
          to: addDays(asOf, -1),
          factsOf,
          restDays,
          purchases: data.purchases,
          ledger,
        })
  const frozen = [...ledger, ...pending].filter((entry) => entry.frozen === true)
  let freeDays: ReadonlySet<DayKey> = restDays
  if (frozen.length > 0) {
    const set = new Set(restDays)
    for (const entry of frozen) set.add(entry.day)
    freeDays = set
  }
  return { restDays, ledger, pending, freeDays }
}

// ---------------------------------------------------------------------------
// Abgeleiteter Zustand
// ---------------------------------------------------------------------------

/**
 * `GameState.hp` zum Spieltag `today` beim aktuellen Level `level`:
 * - `current` = letzter `hpAfter` (bzw. Max, ohne Eintrag oder wenn am letzten Tag der Sanfte Modus galt) plus
 *   Heiltränke mit Kauftag nach dem letzten abgerechneten Tag, begrenzt auf `0 … max`; ist das Level jetzt höher
 *   als am letzten abgerechneten Tag (größere Max-HP), sind die HP voll. Im Sanften Modus immer `max`.
 * - `yesterday` = Vorschau für gestern, solange er nachgetragen werden kann (ab `since`, noch nicht abgerechnet):
 *   Wertung (nach denselben Regeln wie die Abrechnung, `scoreDays` – in der Durchhänger-Pause also `absent`),
 *   `threatenedDelta` = HP-Wirkung der Wertung (0 in der Pause, wenn ein Streak-Schutz ihn auffängt oder im Sanften
 *   Modus), `savedByFreeze`.
 */
export function hpStateOf(data: GameData, calendar: HpCalendar, today: DayKey, level: number): HpState {
  const enabled = penaltiesEnabled(data.settings)
  const max = maxHpForLevel(level)
  const { ledger } = calendar
  const last = ledger.at(-1)

  let current = max
  if (enabled && last !== undefined && last.penalties === true && !(max > last.maxHp)) {
    const potions = countItemPurchases(data.purchases, 'healingPotion', today, last.day)
    current = clamp(finiteOr(last.hpAfter, max) + potions * BALANCING.items.healingPotion.heal, 0, max)
  }

  const state: HpState = {
    enabled,
    current,
    max,
    ratio: max > 0 ? clamp(current / max, 0, 1) : 1,
    defeats: 0,
  }
  if (last !== undefined) state.settledThrough = last.day

  const yesterdayKey = addDays(today, -1)
  const preview = calendar.pending.find((entry) => entry.day === yesterdayKey)
  if (preview !== undefined) {
    state.yesterday = {
      day: preview.day,
      score: preview.score,
      threatenedDelta: enabled && !preview.frozen ? hpDeltaForScore(preview.score) : 0,
      savedByFreeze: preview.frozen,
    }
  }

  for (const entry of ledger) {
    if (entry.defeat === undefined) continue
    state.defeats++
    state.lastDefeat = { day: entry.day, goldLost: Math.max(0, finiteOr(entry.defeat.goldLost, 0)) }
  }
  return state
}

/** `GameState.inventory`: gekaufte Streak-Schutz-Gegenstände (Kauftag ≤ heute) minus verbrauchte (abgerechnet). */
export function inventoryOf(data: GameData, calendar: HpCalendar, today: DayKey): InventoryState {
  const bought = countItemPurchases(data.purchases, 'streakFreeze', today)
  return { streakFreezes: Math.max(0, bought - freezesUsedIn(calendar.ledger)) }
}

/** Erster Tag mit Niederlage im Ledger (für „Perfekte Tage nach der ersten Niederlage“). */
export function firstDefeatDay(ledger: readonly HpLedgerEntry[]): DayKey | undefined {
  return ledger.find((entry) => entry.defeat !== undefined)?.day
}

/**
 * Darf ein Gegenstands-Kauf rückgängig gemacht werden? Nur am Kauftag (`today`) und solange dieser Tag nicht
 * abgerechnet ist; ein Streak-Schutz außerdem nur, solange er nicht verbraucht ist (der Vorrat ohne ihn bleibt
 * ≥ 0). Ein am Kauftag gekaufter Streak-Schutz kann frühestens diesen Tag retten – der wird erst übermorgen
 * abgerechnet, ist also am Kauftag nie verbraucht.
 */
export function canUndoItemPurchase(data: GameData, purchase: Purchase, today: DayKey): boolean {
  if (purchase.kind !== 'item' || purchase.day !== today || !isValidDayKey(today)) return false
  const ledger = sortedLedger(data.hpLedger)
  const last = ledger.at(-1)
  if (last !== undefined && compareDays(last.day, purchase.day) >= 0) return false
  if (purchase.itemId === 'streakFreeze') {
    return countItemPurchases(data.purchases, 'streakFreeze', today) - 1 - freezesUsedIn(ledger) >= 0
  }
  return true
}
