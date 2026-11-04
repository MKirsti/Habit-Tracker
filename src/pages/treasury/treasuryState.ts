/**
 * Abgeleiteter Zustand der Schatzkammer für die Anzeige (rein): Was kann der Held sich gerade leisten, was ist
 * schon eingelöst, wie sieht die Chronik aus?
 */
import type { DayKey, Purchase, Reward } from '../../domain/types'
import { formatNumber } from '../../ui/format'

export type RewardStatus =
  /** Einlösbar: genug Gold. */
  | { kind: 'available' }
  /** Zu teuer: `missing` Gold fehlen (bei negativem Guthaben auch mehr als der Preis). */
  | { kind: 'missing'; missing: number }
  /** Einmalige Belohnung, schon eingelöst (am `day` der letzten Einlösung). */
  | { kind: 'redeemed'; day: DayKey }

export interface RewardView {
  reward: Reward
  status: RewardStatus
  /** Wie oft eingelöst (laut Chronik). */
  timesRedeemed: number
  /** Gespart: Anteil des Preises, den das Guthaben schon deckt (0..1). */
  saved: number
}

/** Einlösungen je Belohnung (in Chronik-Reihenfolge). */
export function purchasesByReward(purchases: readonly Purchase[]): Map<string, Purchase[]> {
  const result = new Map<string, Purchase[]>()
  for (const purchase of purchases) {
    if (purchase.rewardId === undefined) continue
    const list = result.get(purchase.rewardId)
    if (list) list.push(purchase)
    else result.set(purchase.rewardId, [purchase])
  }
  return result
}

/** Status einer Belohnung beim Guthaben `balance` – dieselben Regeln wie `purchaseReward`. */
export function rewardStatus(reward: Reward, balance: number, purchases: readonly Purchase[]): RewardStatus {
  if (!reward.repeatable && purchases.length > 0) {
    const last = purchases.reduce((latest, purchase) => (purchase.createdAt > latest.createdAt ? purchase : latest))
    return { kind: 'redeemed', day: last.day }
  }
  if (balance >= reward.price) return { kind: 'available' }
  return { kind: 'missing', missing: reward.price - balance }
}

/** Sichtbare (nicht ausgeblendete) Belohnungen in gespeicherter Reihenfolge mit ihrem Status. */
export function rewardViews(rewards: readonly Reward[], purchases: readonly Purchase[], balance: number): RewardView[] {
  const byReward = purchasesByReward(purchases)
  return rewards
    .filter((reward) => reward.archived !== true)
    .sort((a, b) => a.order - b.order || a.title.localeCompare(b.title, 'de'))
    .map((reward) => {
      const own = byReward.get(reward.id) ?? []
      return {
        reward,
        status: rewardStatus(reward, balance, own),
        timesRedeemed: own.length,
        saved: reward.price > 0 ? Math.min(Math.max(balance / reward.price, 0), 1) : 1,
      }
    })
}

/** Chronik: neueste Einlösung zuerst (nach Zeitpunkt, bei Gleichstand nach Tag). */
export function purchaseHistory(purchases: readonly Purchase[]): Purchase[] {
  return [...purchases].sort((a, b) => b.createdAt - a.createdAt || b.day.localeCompare(a.day))
}

const dateFormatter = new Intl.DateTimeFormat('de-DE', {
  timeZone: 'UTC',
  day: 'numeric',
  month: 'long',
  year: 'numeric',
})

/** Spieltag ohne Wochentag, z. B. „4. November 2026“ (kompakter als `formatDay` für Karten). */
export function formatDate(day: DayKey): string {
  const [year, month, date] = day.split('-').map(Number)
  return dateFormatter.format(new Date(Date.UTC(year, month - 1, date)))
}

const shortDateFormatter = new Intl.DateTimeFormat('de-DE', {
  timeZone: 'UTC',
  day: 'numeric',
  month: 'short',
  year: 'numeric',
})

/** Kompakter Spieltag mit Jahr, z. B. „4. Nov. 2026“ (Chronik auf dem Handy). */
export function formatShortDate(day: DayKey): string {
  const [year, month, date] = day.split('-').map(Number)
  return shortDateFormatter.format(new Date(Date.UTC(year, month - 1, date)))
}

/** „1.234 Gold“. */
export function goldText(amount: number): string {
  return `${formatNumber(amount)} Gold`
}

/** „Noch 150 Gold“ – Beschriftung einer Belohnung, die (noch) zu teuer ist. */
export function missingGoldLabel(missing: number): string {
  return `Noch ${goldText(missing)}`
}

/** „1× eingelöst“, „3× eingelöst“. */
export function timesRedeemedText(times: number): string {
  return `${formatNumber(times)}× eingelöst`
}
