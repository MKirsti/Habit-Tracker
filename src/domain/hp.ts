/**
 * Lebenspunkte (Phase 2b) – öffentlicher Einstieg: alle Regeln aus `hpRules.ts` (Ruhetage, Tageswertung,
 * Streak-Schutz, abgeleiteter Zustand) plus die Abrechnung `settleDays` (ARCHITECTURE.md „Phase 2b … (Vertrag)“).
 *
 * Vom Spieler gewünscht: **eine** Wertung pro Spieltag (nicht pro Quest!), höchstens −6 HP pro Tag, Wochenquests
 * kosten nie etwas (eine erledigte macht aus „verpasst“ höchstens „schwach“, −1), gestern darf noch nachgetragen
 * werden (Gnadenfrist), ein Durchhänger kostet höchstens 3 schadende Tage (danach „Pause“ bis zum nächsten guten
 * Tag), eine Niederlage kostet 15 % Gold, höchstens 100 – Level, XP und Streaks bleiben immer. Im Sanften Modus gibt
 * es gar keine HP-Wirkung.
 */
import { BALANCING } from './balancing'
import { addDays, compareDays, isValidDayKey } from './dates'
import { dayFactsOf, deriveGameState, totalXpTimeline } from './engine'
import {
  chestFreezeDays,
  countItemPurchases,
  hpDeltaForScore,
  maxHpForLevel,
  nextUnsettledDay,
  penaltiesEnabled,
  restDaySet,
  scoreDays,
  sortedLedger,
} from './hpRules'
import { levelFromXp } from './leveling'
import type { DayKey, GameData, HpLedgerEntry } from './types'

export * from './hpRules'

/** Anteil in Basispunkten – so rechnet `floor(15 % × Gold)` ohne Gleitkomma-Rauschen. */
const BASIS_POINTS = 10_000

/**
 * Gold, das eine Niederlage am Tag `day` kostet: `min(defeatGoldLossMax, floor(defeatGoldLoss × max(0, Guthaben)))`
 * (15 %, höchstens 100 Gold) mit dem Guthaben zu diesem Zeitpunkt – am Ende des Tages `day`
 * (`deriveGameState(…, day).gold.balance`, frühere Niederlagen schon abgezogen). Ausgaben zählen dort wie überall
 * unabhängig von ihrem Tag, auch die bis zur Abrechnung getätigten: Eine Niederlage drückt das Guthaben so nie
 * unter 0.
 */
function defeatGoldLoss(data: GameData, ledgerSoFar: HpLedgerEntry[], day: DayKey): number {
  const balance = Math.max(0, deriveGameState({ ...data, hpLedger: ledgerSoFar }, day).gold.balance)
  if (!Number.isFinite(balance)) return 0
  const share = Math.round(BALANCING.defeatGoldLoss * BASIS_POINTS)
  return Math.min(BALANCING.defeatGoldLossMax, Math.floor((balance * share) / BASIS_POINTS))
}

/**
 * Die NEU abzurechnenden Tage (chronologisch) – rein; das Repository (`settleHpDays`) hängt sie an das Ledger an.
 *
 * Zeitraum: `max(settings.penalties.since, letzter Ledger-Tag + 1)` bis `today − backfillDays − 1` (gestern kann
 * noch nachgetragen werden). Ohne `since` wird nichts abgerechnet (nie rückwirkend). Pro Tag:
 * 1. Wertung (`scoreDays`, `classifyDay`): rest / none / perfect / good / weak / missed – oder `absent` („Pause“),
 *    wenn unmittelbar davor schon 3 schadende Tage in Folge liegen (Durchhänger-Pause, Zähler aus dem Ledger und
 *    den gerade gewerteten Tagen, `slumpCountOf`) und der Tag schwach oder verpasst wäre.
 * 2. Streak-Schutz bei weak/missed (nie in der Pause), wenn ein vorher (Kauftag ≤ Tag) gekaufter oder – Phase 3a – aus
 *    einer Truhe (Spieltag des Öffnens ≤ Tag, `chestFreezeDays`) noch da ist →
 *    `frozen`, keine HP-Wirkung; der Tag ist für alle Streaks ein Schontag. Auch im Sanften Modus (schützt Streaks).
 * 3. HP: Start = `hpAfter` des vorigen Eintrags (Max-HP ohne Eintrag oder nach einem Tag im Sanften Modus);
 *    Änderung = Wertung (0, wenn frozen) + `healingPotion.heal` je Heiltrank mit Kauftag = Tag; ein Level-Up an dem
 *    Tag (Level am Tagesende > am Vortagesende) heilt voll; `hpAfter = clamp(…, 0, maxHp)`. `hpDelta` ist die
 *    tatsächliche Änderung gegenüber dem Start (inkl. Heiltränken und Level-Up-Heilung).
 *    Liegt zwischen dem vorigen Eintrag und dem Tag eine Lücke (`since` nach dem letzten Ledger-Tag, z. B. nach dem
 *    Wiederherstellen eines Backups), zählen auch die Heiltränke aus der Lücke – genau wie in `GameState.hp.current`
 *    (Heiltränke nach dem letzten abgerechneten Tag).
 * 4. Niederlage bei `hpAfter ≤ 0`: `defeat.goldLost` (15 % des Guthabens, höchstens 100 Gold, siehe
 *    `defeatGoldLoss`), danach volle HP.
 * 5. Sanfter Modus (`penalties.enabled === false`): `penalties: false`, `hpDelta: 0`, `hpAfter = maxHp`, nie eine
 *    Niederlage.
 *
 * Das Level am Ende jedes Tages kommt aus einem einzigen Durchlauf (`totalXpTimeline`), nicht aus
 * `deriveGameState` pro Tag; nur eine (seltene) Niederlage wertet den Spielstand für das Gold einmal aus.
 * Idempotent: Mit den zurückgegebenen Einträgen im Ledger liefert ein zweiter Aufruf `[]`.
 */
export function settleDays(data: GameData, today: DayKey): HpLedgerEntry[] {
  if (!isValidDayKey(today)) return []
  const ledger = sortedLedger(data.hpLedger)
  const from = nextUnsettledDay(data.settings, ledger)
  if (from === undefined) return []
  const to = addDays(today, -BALANCING.backfillDays - 1)
  if (compareDays(from, to) > 0) return []

  // Schritte 1–2: Wertung und Streak-Schutz (unabhängig von XP und HP).
  const restDays = restDaySet(data.restPeriods)
  const scored = scoreDays({
    from,
    to,
    factsOf: dayFactsOf(data, today, restDays),
    restDays,
    purchases: data.purchases,
    // Phase 3a: Streak-Schutz aus geöffneten Truhen – derselbe Vorrat wie in der Vorschau für gestern (`hpCalendar`).
    chestFreezeDays: chestFreezeDays(data.chests, data.settings.dayStartHour),
    ledger,
  })

  // Level am Ende jedes Tages – mit den Schontagen inklusive der gerade aufgefangenen Tage (Streak-Bonus).
  const freeDays = new Set(restDays)
  for (const entry of [...ledger, ...scored]) if (entry.frozen) freeDays.add(entry.day)
  const xp = totalXpTimeline(data, today, { restDays, freeDays })
  const levelAt = (day: DayKey) => levelFromXp(xp.totalXpAt(day)).level

  const enabled = penaltiesEnabled(data.settings)
  const entries: HpLedgerEntry[] = []
  let previous = ledger.at(-1)
  let levelBefore = levelAt(addDays(from, -1))
  for (const { day, score, frozen } of scored) {
    const level = levelAt(day)
    const maxHp = maxHpForLevel(level)
    let entry: HpLedgerEntry
    if (!enabled) {
      entry = { day, score, frozen, hpDelta: 0, hpAfter: maxHp, maxHp, penalties: false }
    } else {
      const start =
        previous !== undefined && previous.penalties === true && Number.isFinite(previous.hpAfter)
          ? previous.hpAfter
          : maxHp
      // Heiltränke seit dem vorigen Eintrag (ohne Lücke: genau die vom Tag selbst).
      const potions = countItemPurchases(data.purchases, 'healingPotion', day, previous?.day ?? addDays(day, -1))
      const change = (frozen ? 0 : hpDeltaForScore(score)) + potions * BALANCING.items.healingPotion.heal
      const after = level > levelBefore ? maxHp : Math.min(maxHp, Math.max(0, start + change))
      entry = { day, score, frozen, hpDelta: after - start, hpAfter: after, maxHp, penalties: true }
      if (after <= 0) {
        entry.defeat = { goldLost: defeatGoldLoss(data, [...ledger, ...entries], day) }
        entry.hpAfter = maxHp
      }
    }
    entries.push(entry)
    previous = entry
    levelBefore = level
  }
  return entries
}
