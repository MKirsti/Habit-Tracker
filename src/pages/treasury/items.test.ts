import { describe, expect, it } from 'vitest'
import { BALANCING } from '../../domain/balancing'
import { makeChest, makeGameData, makeItemPurchase, makeLedgerEntry, makePurchase } from '../../domain/testing'
import type { HpState } from '../../domain/types'
import {
  FREEZE_MAX,
  POTION_HEAL,
  canUndoPurchase,
  freezeStockText,
  itemOutcomes,
  itemStatus,
  itemViews,
  potionHealNow,
} from './items'
import type { ItemShopState } from './items'

const TODAY = '2026-11-03'

function hp(overrides: Partial<HpState> = {}): HpState {
  const current = overrides.current ?? 40
  const max = overrides.max ?? 60
  return { enabled: true, current, max, ratio: current / max, defeats: 0, ...overrides }
}

function shop(overrides: { balance?: number; freezes?: number; hp?: Partial<HpState> } = {}): ItemShopState {
  return {
    hp: hp(overrides.hp),
    inventory: { streakFreezes: overrides.freezes ?? 0, unopenedChests: 0 },
    gold: { balance: overrides.balance ?? 1_000 },
  }
}

describe('Gegenstände: Kaufbarkeit', () => {
  it('nimmt Preise und Grenzen aus BALANCING', () => {
    const views = itemViews(shop())
    expect(views.map((view) => [view.id, view.price, view.icon, view.title])).toEqual([
      ['streakFreeze', BALANCING.items.streakFreeze.price, '❄️', 'Streak-Schutz'],
      ['healingPotion', BALANCING.items.healingPotion.price, '🧪', 'Heiltrank'],
    ])
    expect(FREEZE_MAX).toBe(5)
    expect(POTION_HEAL).toBe(20)
    expect(views.every((view) => view.status.kind === 'available')).toBe(true)
  })

  it('Streak-Schutz: voller Beutel vor fehlendem Gold, sonst fehlendes Gold', () => {
    expect(itemStatus('streakFreeze', shop({ freezes: 5, balance: 0 }))).toMatchObject({
      kind: 'blocked',
      reason: 'stockFull',
      label: 'Beutel voll',
    })
    expect(itemStatus('streakFreeze', shop({ freezes: 4, balance: 149 }))).toMatchObject({
      kind: 'blocked',
      reason: 'gold',
      missing: 1,
      label: 'Noch 1 Gold',
      text: 'Dafür fehlen dir noch 1 Gold.',
    })
    expect(itemStatus('streakFreeze', shop({ freezes: 4, balance: 150 }))).toEqual({ kind: 'available' })
  })

  it('Heiltrank: Sanfter Modus, dann volle HP, dann Gold – wie purchaseItem', () => {
    expect(itemStatus('healingPotion', shop({ hp: { enabled: false, current: 10 }, balance: 0 }))).toMatchObject({
      reason: 'gentle',
    })
    expect(itemStatus('healingPotion', shop({ hp: { current: 60, max: 60 }, balance: 0 }))).toMatchObject({
      reason: 'fullHp',
      text: 'Deine Lebenspunkte sind voll – du brauchst gerade keinen Heiltrank.',
    })
    expect(itemStatus('healingPotion', shop({ hp: { current: 59 }, balance: 79 }))).toMatchObject({
      reason: 'gold',
      missing: 1,
    })
    // Negatives Guthaben: Es fehlt mehr als der Preis.
    expect(itemStatus('healingPotion', shop({ balance: -20 }))).toMatchObject({ reason: 'gold', missing: 100 })
    expect(itemStatus('healingPotion', shop({ hp: { current: 59 }, balance: 80 }))).toEqual({ kind: 'available' })
  })

  it('heilt höchstens bis zum Maximum, im Sanften Modus gar nicht', () => {
    expect(potionHealNow(hp({ current: 30, max: 60 }))).toBe(20)
    expect(potionHealNow(hp({ current: 53, max: 60 }))).toBe(7)
    expect(potionHealNow(hp({ current: 60, max: 60 }))).toBe(0)
    expect(potionHealNow(hp({ enabled: false, current: 10 }))).toBe(0)
  })

  it('schreibt den Vorrat als „x / 5“', () => {
    expect(freezeStockText(0)).toBe('0 / 5')
    expect(freezeStockText(3)).toBe('3 / 5')
  })
})

describe('Gegenstände in der Chronik', () => {
  it('Heiltränke sind getrunken; die ältesten Streak-Schutz-Käufe gelten als eingesetzt', () => {
    const data = makeGameData({
      purchases: [
        makeItemPurchase('f3', 'streakFreeze', '2026-11-02', { createdAt: 30 }),
        makeItemPurchase('f1', 'streakFreeze', '2026-10-20', { createdAt: 10 }),
        makeItemPurchase('p1', 'healingPotion', '2026-10-25', { createdAt: 15 }),
        makeItemPurchase('f2', 'streakFreeze', '2026-10-20', { createdAt: 20 }),
        makePurchase({ id: 'r1', day: '2026-10-21' }),
      ],
      hpLedger: [makeLedgerEntry('2026-10-28', { score: 'missed', frozen: true }), makeLedgerEntry('2026-10-29')],
    })
    const outcomes = itemOutcomes(data)
    expect(Object.fromEntries(outcomes)).toEqual({ f1: 'used', f2: 'stocked', f3: 'stocked', p1: 'drunk' })
  })

  it('zählt Streak-Schutz aus Truhen mit: ein älterer aus einer Truhe wird zuerst eingesetzt (wie in der Abrechnung)', () => {
    // Truhe am 20.10. geöffnet (Spieltag des Öffnens), Kauf am 25.10., ein aufgefangener Tag am 28.10.:
    // eingesetzt ist der ältere aus der Truhe – der gekaufte liegt noch im Beutel (Vorrat 1).
    const openedAt = new Date('2026-10-20T12:00:00').getTime()
    const freezeChest = makeChest('chapter:q1:c1', {
      foundDay: '2026-10-20',
      rarity: 'rare',
      content: { kind: 'item', itemId: 'streakFreeze' },
      openedAt,
    })
    const unopened = makeChest('quest:x', { foundDay: '2026-10-19', rarity: 'rare', content: { kind: 'item', itemId: 'streakFreeze' } })
    const data = makeGameData({
      purchases: [makeItemPurchase('f1', 'streakFreeze', '2026-10-25', { createdAt: 10 })],
      chests: [freezeChest, unopened],
      hpLedger: [makeLedgerEntry('2026-10-28', { score: 'missed', frozen: true })],
    })
    expect(Object.fromEntries(itemOutcomes(data))).toEqual({ f1: 'stocked' })

    // Zwei aufgefangene Tage: Truhe und Kauf sind beide eingesetzt.
    const both = { ...data, hpLedger: [...(data.hpLedger ?? []), makeLedgerEntry('2026-10-29', { score: 'missed', frozen: true })] }
    expect(Object.fromEntries(itemOutcomes(both))).toEqual({ f1: 'used' })

    // Eine erst nach dem Kauf geöffnete Truhe ist jünger: der Kauf wird zuerst eingesetzt.
    const later = { ...data, chests: [{ ...freezeChest, openedAt: new Date('2026-10-26T12:00:00').getTime() }] }
    expect(Object.fromEntries(itemOutcomes(later))).toEqual({ f1: 'used' })
  })

  it('Belohnungen lassen sich immer zurückgeben, Gegenstände nur am Kauftag vor der Abrechnung', () => {
    const reward = makePurchase({ id: 'r1', day: '2026-10-01' })
    const potionToday = makeItemPurchase('p1', 'healingPotion', TODAY)
    const potionYesterday = makeItemPurchase('p2', 'healingPotion', '2026-11-02')
    const data = makeGameData({ purchases: [reward, potionToday, potionYesterday] })
    expect(canUndoPurchase(data, reward, TODAY)).toBe(true)
    expect(canUndoPurchase(data, potionToday, TODAY)).toBe(true)
    expect(canUndoPurchase(data, potionYesterday, TODAY)).toBe(false)
  })
})
