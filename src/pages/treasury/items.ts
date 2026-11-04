/**
 * Gegenstände der Schatzkammer (Phase 2b) für die Anzeige – rein: Was kostet ein Gegenstand, kann der Held ihn
 * gerade kaufen (dieselben Regeln und dieselbe Reihenfolge wie `purchaseItem`), und was ist aus einem gekauften
 * Gegenstand geworden (Chronik)?
 *
 * Ton: Gegenstände sind Helfer, keine Pflicht – Hinweise erklären freundlich, warum etwas gerade nicht geht.
 */
import { ITEMS, ITEM_IDS } from '../../data/repository'
import { BALANCING } from '../../domain/balancing'
import { canUndoItemPurchase, chestFreezeDays, freezesUsedIn, sortedLedger } from '../../domain/hp'
import type { DayKey, GameData, GameState, ItemId, Purchase } from '../../domain/types'
import { formatNumber } from '../../ui/format'
import { goldText, missingGoldLabel } from './treasuryState'

/** Warum ein Gegenstand gerade nicht gekauft werden kann. */
export type ItemBlockReason =
  /** ❄️ Der Beutel ist voll (`items.streakFreeze.max`). */
  | 'stockFull'
  /** 🧪 Sanfter Modus: keine Lebenspunkte, nichts zu heilen. */
  | 'gentle'
  /** 🧪 Die Lebenspunkte sind schon voll. */
  | 'fullHp'
  /** Das Gold reicht (noch) nicht. */
  | 'gold'

export type ItemStatus =
  | { kind: 'available' }
  | {
      kind: 'blocked'
      reason: ItemBlockReason
      /** Kurz für den gesperrten Knopf, z. B. „Beutel voll“. */
      label: string
      /** Ganzer Satz unter dem Knopf, z. B. „Deine Lebenspunkte sind voll – …“. */
      text: string
      /** Nur bei `gold`: so viel Gold fehlt noch. */
      missing?: number
    }

export interface ItemView {
  id: ItemId
  title: string
  icon: string
  price: number
  status: ItemStatus
}

/** Was die Schatzkammer über den Helden wissen muss, um Gegenstände anzubieten. */
export type ItemShopState = Pick<GameState, 'hp' | 'inventory'> & { gold: Pick<GameState['gold'], 'balance'> }

/** Höchster Vorrat an Streak-Schutz (5). */
export const FREEZE_MAX = BALANCING.items.streakFreeze.max
/** So viele HP heilt ein Heiltrank (20). */
export const POTION_HEAL = BALANCING.items.healingPotion.heal

/** „2 / 5“ – Vorrat an Streak-Schutz. */
export function freezeStockText(stock: number): string {
  return `${formatNumber(Math.max(0, stock))} / ${formatNumber(FREEZE_MAX)}`
}

/** Vorgelesen: „2 von 5 Streak-Schutz im Beutel“. */
export function freezeStockSpoken(stock: number): string {
  return `${formatNumber(Math.max(0, stock))} von ${formatNumber(FREEZE_MAX)} Streak-Schutz im Beutel`
}

/** "42 / 55 HP" */
export function hpText(current: number, max: number): string {
  return `${formatNumber(Math.max(0, Math.round(current)))} / ${formatNumber(Math.max(0, Math.round(max)))} HP`
}

/** Tatsächliche Heilung eines Heiltranks jetzt: höchstens bis zum Maximum (0 im Sanften Modus). */
export function potionHealNow(hp: Pick<GameState['hp'], 'enabled' | 'current' | 'max'>): number {
  if (!hp.enabled) return 0
  return Math.max(0, Math.min(POTION_HEAL, Math.round(hp.max - hp.current)))
}

/**
 * Kann `itemId` gerade gekauft werden? Gleiche Prüfungen in gleicher Reihenfolge wie `purchaseItem`:
 * Vorrat voll → Sanfter Modus → volle HP → Gold.
 */
export function itemStatus(itemId: ItemId, state: ItemShopState): ItemStatus {
  if (itemId === 'streakFreeze' && state.inventory.streakFreezes >= FREEZE_MAX) {
    return {
      kind: 'blocked',
      reason: 'stockFull',
      label: 'Beutel voll',
      text: `Dein Beutel ist voll (${freezeStockText(state.inventory.streakFreezes)}) – sobald ein Streak-Schutz einen Tag auffängt, ist wieder Platz.`,
    }
  }
  if (itemId === 'healingPotion') {
    if (!state.hp.enabled) {
      return {
        kind: 'blocked',
        reason: 'gentle',
        label: 'Sanfter Modus',
        text: 'Im Sanften Modus gibt es keine Lebenspunkte – ein Heiltrank hätte nichts zu heilen.',
      }
    }
    if (state.hp.current >= state.hp.max) {
      return {
        kind: 'blocked',
        reason: 'fullHp',
        label: 'HP voll',
        text: 'Deine Lebenspunkte sind voll – du brauchst gerade keinen Heiltrank.',
      }
    }
  }
  const price = ITEMS[itemId].price
  if (state.gold.balance < price) {
    const missing = price - state.gold.balance
    return {
      kind: 'blocked',
      reason: 'gold',
      label: missingGoldLabel(missing),
      text: `Dafür fehlen dir noch ${goldText(missing)}.`,
      missing,
    }
  }
  return { kind: 'available' }
}

/** Alle Gegenstände in Anzeigereihenfolge mit ihrem Status. */
export function itemViews(state: ItemShopState): ItemView[] {
  return ITEM_IDS.map((id) => ({ id, ...ITEMS[id], status: itemStatus(id, state) }))
}

/** Was aus einem gekauften Gegenstand geworden ist (Chronik). */
export type ItemOutcome =
  /** ❄️ wartet im Beutel */
  | 'stocked'
  /** ❄️ hat einen Tag aufgefangen */
  | 'used'
  /** 🧪 wurde sofort getrunken */
  | 'drunk'

/** Kurzbeschriftung des Verbleibs. */
export const ITEM_OUTCOME_LABELS: Record<ItemOutcome, string> = {
  stocked: 'Im Beutel',
  used: 'Eingesetzt',
  drunk: 'Getrunken',
}

/**
 * Verbleib jedes gekauften Gegenstands (nach Kauf-ID): Heiltränke sind getrunken; von allen Streak-Schutz-Gegenständen
 * – Käufe und (Phase 3a) in geöffneten Truhen gefundene, ab dem Spieltag des Öffnens (`chestFreezeDays`) – gelten die
 * ältesten als eingesetzt (so viele, wie abgerechnete Tage aufgefangen wurden; wie in Abrechnung und Vorrat), die
 * übrigen liegen im Beutel. Am selben Tag entscheidet der Zeitpunkt (Kauf bzw. Öffnen).
 */
export function itemOutcomes(
  data: Pick<GameData, 'purchases' | 'hpLedger'> & Partial<Pick<GameData, 'chests' | 'settings'>>,
): Map<string, ItemOutcome> {
  const result = new Map<string, ItemOutcome>()
  const arrivals: { day: DayKey; at: number; purchaseId?: string }[] = []
  for (const purchase of data.purchases ?? []) {
    if (purchase.kind !== 'item') continue
    if (purchase.itemId === 'healingPotion') result.set(purchase.id, 'drunk')
    else if (purchase.itemId === 'streakFreeze') arrivals.push({ day: purchase.day, at: purchase.createdAt, purchaseId: purchase.id })
  }
  for (const chest of data.chests ?? []) {
    const day = chestFreezeDays([chest], data.settings?.dayStartHour)[0]
    if (day !== undefined) arrivals.push({ day, at: chest.openedAt ?? 0 })
  }
  let used = freezesUsedIn(sortedLedger(data.hpLedger))
  arrivals.sort((a, b) => a.day.localeCompare(b.day) || a.at - b.at)
  for (const arrival of arrivals) {
    if (arrival.purchaseId !== undefined) result.set(arrival.purchaseId, used > 0 ? 'used' : 'stocked')
    used--
  }
  return result
}

/** Lässt sich der Eintrag der Chronik am Spieltag `today` rückgängig machen? Belohnungen immer, Gegenstände nur am Kauftag. */
export function canUndoPurchase(data: GameData, purchase: Purchase, today: DayKey): boolean {
  return purchase.kind !== 'item' || canUndoItemPurchase(data, purchase, today)
}
