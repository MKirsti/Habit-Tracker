/**
 * Rückmeldungen zu den Lebenspunkten (Phase 2b) – rein und ohne React, die Darstellung übernimmt `GameFeedback`.
 *
 * Erkannt wird aus zwei aufeinanderfolgenden Ständen (Daten + Spielzustand):
 * - **Niederlage**: ein neu abgerechneter Tag mit `defeat` → würdevolle Szene (verlorenes Gold, volle HP).
 * - **Streak-Schutz eingesetzt**: neu abgerechnete Tage mit `frozen` → kleine Meldung.
 * - **Heiltrank getrunken**: neue Heiltrank-Käufe von heute → kleine Meldung mit den geheilten HP.
 *
 * Bewusst **ohne** Meldung: der übliche Tagesschaden bzw. die Heilung der Abrechnung – die steht ruhig im
 * Helden-Kopf („Sonntag: −1 HP“). Lebenspunkte sollen motivieren, nicht jeden Morgen mit einem Toast mahnen.
 *
 * „Neu abgerechnet“ heißt: ans Ledger angehängt (Tag nach dem bisher letzten) – so meldet ein ersetztes Ledger
 * (Backup) keine alten Tage. Massenänderungen (Tageswechsel, Backup, anderes Profil) filtert `GameFeedback` vorher.
 */
import { compareDays, diffDays, formatDay, isValidDayKey } from '../../domain/dates'
import type { DayKey, GameState, HpLedgerEntry, Purchase } from '../../domain/types'

export interface DefeatEvent {
  type: 'defeat'
  /** Tag der (letzten) Niederlage in diesem Schritt. */
  day: DayKey
  /** Verlorenes Gold (Summe, falls in einem Schritt mehrere Niederlagen abgerechnet wurden). */
  goldLost: number
  /** Anzahl Niederlagen in diesem Schritt (meist 1). */
  count: number
  /** Lebenspunkte jetzt (nach der Abrechnung) – nach einer Niederlage normalerweise wieder voll. */
  hp: number
  max: number
}

export interface FreezeUsedEvent {
  type: 'freeze-used'
  /** Die aufgefangenen Tage (chronologisch). */
  days: DayKey[]
}

export interface PotionHealedEvent {
  type: 'potion-healed'
  /** Heute neu getrunkene Heiltränke. */
  count: number
  /** Tatsächlich geheilte Lebenspunkte (begrenzt auf die Max-HP). */
  healed: number
  hp: number
  max: number
}

export type HpFeedbackEvent = DefeatEvent | FreezeUsedEvent | PotionHealedEvent

/** Was `hpFeedbackEvents` von einem Stand braucht. */
export interface HpSnapshot {
  ledger: readonly HpLedgerEntry[] | undefined
  purchases: readonly Purchase[] | undefined
  state: Pick<GameState, 'today' | 'hp'>
}

/** Letzter gültiger Ledger-Tag. */
function lastLedgerDay(ledger: readonly HpLedgerEntry[] | undefined): DayKey | undefined {
  let last: DayKey | undefined
  for (const entry of ledger ?? []) {
    if (!isValidDayKey(entry.day)) continue
    if (last === undefined || compareDays(entry.day, last) > 0) last = entry.day
  }
  return last
}

/** Neu angehängte Ledger-Einträge (Tag nach dem bisher letzten), chronologisch. */
export function appendedLedgerEntries(
  before: readonly HpLedgerEntry[] | undefined,
  after: readonly HpLedgerEntry[] | undefined,
): HpLedgerEntry[] {
  if (before === after || after === undefined) return []
  const last = lastLedgerDay(before)
  const known = new Set((before ?? []).map((entry) => entry.day))
  return after
    .filter((entry) => isValidDayKey(entry.day) && !known.has(entry.day) && (last === undefined || compareDays(entry.day, last) > 0))
    .sort((a, b) => compareDays(a.day, b.day))
}

/** Rückmeldungen zu den Lebenspunkten für den Schritt `prev` → `next` (Reihenfolge: Niederlage, Streak-Schutz, Heiltrank). */
export function hpFeedbackEvents(prev: HpSnapshot, next: HpSnapshot): HpFeedbackEvent[] {
  const events: HpFeedbackEvent[] = []
  const appended = appendedLedgerEntries(prev.ledger, next.ledger)

  const defeats = appended.filter((entry) => entry.defeat !== undefined)
  const lastDefeat = defeats.at(-1)
  if (lastDefeat !== undefined) {
    const goldLost = defeats.reduce((sum, entry) => {
      const lost = entry.defeat?.goldLost ?? 0
      return sum + (Number.isFinite(lost) && lost > 0 ? lost : 0)
    }, 0)
    events.push({
      type: 'defeat',
      day: lastDefeat.day,
      goldLost,
      count: defeats.length,
      hp: Math.max(0, Math.round(next.state.hp.current)),
      max: Math.max(0, Math.round(next.state.hp.max)),
    })
  }

  const frozen = appended.filter((entry) => entry.frozen === true).map((entry) => entry.day)
  if (frozen.length > 0) events.push({ type: 'freeze-used', days: frozen })

  if (prev.purchases !== next.purchases) {
    const known = new Set((prev.purchases ?? []).map((purchase) => purchase.id))
    const potions = (next.purchases ?? []).filter(
      (purchase) =>
        !known.has(purchase.id) &&
        purchase.kind === 'item' &&
        purchase.itemId === 'healingPotion' &&
        purchase.day === next.state.today,
    )
    if (potions.length > 0) {
      const before = prev.state.hp
      const after = next.state.hp
      const healed = before.enabled && after.enabled ? Math.max(0, Math.round(after.current - before.current)) : 0
      events.push({
        type: 'potion-healed',
        count: potions.length,
        healed,
        hp: Math.max(0, Math.round(after.current)),
        max: Math.max(0, Math.round(after.max)),
      })
    }
  }
  return events
}

let weekdayFormatter: Intl.DateTimeFormat | undefined

/**
 * Name eines abgerechneten Tages für Texte: innerhalb der letzten Woche der Wochentag („Montag“), sonst das Datum
 * („3. Nov.“).
 */
export function settledDayName(day: DayKey, today: DayKey): string {
  const age = diffDays(day, today)
  if (age >= 1 && age <= 6) {
    weekdayFormatter ??= new Intl.DateTimeFormat('de-DE', { timeZone: 'UTC', weekday: 'long' })
    return weekdayFormatter.format(new Date(`${day}T00:00:00Z`))
  }
  return formatDay(day, 'short')
}
