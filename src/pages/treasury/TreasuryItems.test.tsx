// @vitest-environment jsdom
import 'fake-indexeddb/auto'
import { cleanup, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MotionGlobalConfig } from 'motion/react'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { db } from '../../data/db'
import {
  createHabit,
  loadGameData,
  purchaseItem,
  resetAllData,
  saveProfile,
  setCompletionValue,
  setPenaltiesEnabled,
} from '../../data/repository'
import { addDays } from '../../domain/dates'
import { deriveGameState } from '../../domain/engine'
import { makeItemPurchase, makeLedgerEntry } from '../../domain/testing'
import type { DayKey } from '../../domain/types'
import { renderWithGame } from '../../test/renderWithGame'
import { formatNumber } from '../../ui'
import { TreasuryPage } from '../TreasuryPage'

/** Dienstag, 3. November 2026, 12:00 Uhr (Ortszeit) → Spieltag 2026-11-03. */
const TODAY: DayKey = '2026-11-03'
const CREATED: DayKey = '2026-10-01'
/** Vorgestern – der zuletzt abgerechnete Tag (gestern ist noch in der Gnadenfrist). */
const SETTLED: DayKey = '2026-11-01'

beforeAll(() => {
  MotionGlobalConfig.skipAnimations = true
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date(2026, 10, 3, 12, 0, 0))
})
afterAll(() => {
  vi.useRealTimers()
})
beforeEach(async () => {
  await resetAllData()
})
afterEach(cleanup)

/** Held mit einem Monat „Training“ (schwer, täglich) → genug Gold für einige Gegenstände. */
async function seedHero(): Promise<void> {
  await saveProfile({ name: 'Aria', avatar: '🧙', createdDay: CREATED })
  const habit = await createHabit(
    { title: 'Training', icon: '🏋️', attribute: 'strength', difficulty: 'hard', schedule: { type: 'daily' } },
    CREATED,
  )
  for (let day = CREATED; day <= TODAY; day = addDays(day, 1)) await setCompletionValue(habit.id, day, 1)
}

async function currentState() {
  return deriveGameState(await loadGameData(), TODAY)
}

/** Abgerechnet bis vorgestern mit `hpAfter` HP (Max-HP des aktuellen Levels). */
async function settleWithHp(hpAfter: number): Promise<number> {
  const { max } = (await currentState()).hp
  await db.hpLedger.put(makeLedgerEntry(SETTLED, { score: 'missed', hpDelta: -6, hpAfter, maxHp: max }))
  return max
}

async function renderPage() {
  const user = userEvent.setup()
  const view = renderWithGame(<TreasuryPage />, { route: '/schatzkammer' })
  await screen.findByRole('heading', { level: 1, name: 'Schatzkammer' })
  return { user, ...view }
}

function itemCard(title: 'Streak-Schutz' | 'Heiltrank'): HTMLElement {
  const items = screen.getByRole('region', { name: 'Gegenstände' })
  return within(items).getByRole('listitem', { name: title })
}

function historyRegion(): HTMLElement {
  return screen.getByRole('region', { name: /^Chronik/ })
}

describe('Schatzkammer: Gegenstände', () => {
  it('zeigt Streak-Schutz und Heiltrank mit Preis, Wirkung und Vorrat', async () => {
    await seedHero()
    await renderPage()
    const freeze = itemCard('Streak-Schutz')
    expect(freeze).toHaveTextContent('Preis: 150 Gold')
    expect(freeze).toHaveTextContent('Fängt einen schwachen Tag auf – keine HP verloren, alle Streaks bleiben.')
    expect(freeze).toHaveTextContent('Setzt sich von selbst ein')
    expect(freeze).toHaveTextContent('0 von 5 Streak-Schutz im Beutel')
    expect(within(freeze).getByRole('button', { name: 'Streak-Schutz für 150 Gold kaufen' })).toBeEnabled()

    const potion = itemCard('Heiltrank')
    expect(potion).toHaveTextContent('Preis: 80 Gold')
    expect(potion).toHaveTextContent('Wird sofort getrunken und heilt +20 HP.')
  })

  it('kauft einen Streak-Schutz nach Rückfrage – Vorrat, Gold, Toast, Chronik – und gibt ihn am Kauftag zurück', async () => {
    await seedHero()
    const before = (await currentState()).gold.balance
    const { user } = await renderPage()

    await user.click(within(itemCard('Streak-Schutz')).getByRole('button', { name: 'Streak-Schutz für 150 Gold kaufen' }))
    const dialog = await screen.findByRole('alertdialog', { name: 'Streak-Schutz kaufen?' })
    expect(dialog).toHaveTextContent('Das kostet 150 Gold')
    expect(dialog).toHaveTextContent(`danach hast du noch ${formatNumber(before - 150)} Gold`)
    expect(dialog).toHaveTextContent('(dann 1 / 5)')
    await user.click(within(dialog).getByRole('button', { name: 'Für 150 Gold kaufen' }))

    expect(await screen.findByText('Streak-Schutz gekauft')).toBeInTheDocument()
    await waitFor(() => expect(itemCard('Streak-Schutz')).toHaveTextContent('1 von 5 Streak-Schutz im Beutel'))
    const purchases = (await loadGameData()).purchases ?? []
    expect(purchases).toEqual([expect.objectContaining({ kind: 'item', itemId: 'streakFreeze', price: 150, day: TODAY })])
    expect(screen.getByTestId('gold-balance')).toHaveTextContent(formatNumber(before - 150))

    // Chronik: am Kauftag lässt er sich zurückgeben.
    const history = historyRegion()
    expect(history).toHaveTextContent('Streak-Schutz')
    expect(history).toHaveTextContent('Gegenstände kannst du nur am Kauftag zurückgeben.')
    await user.click(
      within(history).getByRole('button', { name: 'Kauf „Streak-Schutz“ vom Dienstag, 3. November 2026 rückgängig machen' }),
    )
    const undo = await screen.findByRole('alertdialog', { name: 'Kauf rückgängig machen?' })
    expect(undo).toHaveTextContent('Der Streak-Schutz verlässt deinen Beutel.')
    await user.click(within(undo).getByRole('button', { name: 'Rückgängig machen' }))
    expect(await screen.findByText('Kauf rückgängig gemacht')).toBeInTheDocument()
    await waitFor(async () => expect((await loadGameData()).purchases).toBeUndefined())
    await waitFor(() => expect(itemCard('Streak-Schutz')).toHaveTextContent('0 von 5 Streak-Schutz im Beutel'))
  })

  it('sperrt den Streak-Schutz bei vollem Beutel mit freundlicher Begründung', async () => {
    await seedHero()
    for (let index = 0; index < 5; index++) await purchaseItem('streakFreeze', TODAY)
    await renderPage()
    const freeze = itemCard('Streak-Schutz')
    expect(freeze).toHaveTextContent('5 von 5 Streak-Schutz im Beutel')
    expect(freeze).toHaveTextContent('Dein Beutel ist voll (5 / 5)')
    expect(within(freeze).getByRole('button', { name: 'Streak-Schutz kaufen – Beutel voll' })).toBeDisabled()
  })

  it('sperrt den Heiltrank bei vollen HP und im Sanften Modus – jeweils mit Grund', async () => {
    await seedHero()
    const { unmount } = await renderPage()
    const potion = itemCard('Heiltrank')
    expect(potion).toHaveTextContent('Deine Lebenspunkte sind voll – du brauchst gerade keinen Heiltrank.')
    expect(within(potion).getByRole('button', { name: 'Heiltrank kaufen und trinken – HP voll' })).toBeDisabled()
    unmount()

    await setPenaltiesEnabled(false, TODAY)
    await renderPage()
    const gentle = itemCard('Heiltrank')
    expect(gentle).toHaveTextContent('Im Sanften Modus gibt es keine Lebenspunkte – ein Heiltrank hätte nichts zu heilen.')
    expect(gentle).toHaveTextContent('Sanfter Modus – ohne Lebenspunkte, ohne Schaden.')
    expect(within(gentle).getByRole('link', { name: 'Zu den Einstellungen' })).toHaveAttribute('href', '/einstellungen')
    expect(within(gentle).getByRole('button', { name: 'Heiltrank kaufen und trinken – Sanfter Modus' })).toBeDisabled()
    // Der Streak-Schutz bleibt auch im Sanften Modus kaufbar (er schützt die Streaks).
    expect(within(itemCard('Streak-Schutz')).getByRole('button', { name: /kaufen$/ })).toBeEnabled()
  })

  it('trinkt einen Heiltrank nach Rückfrage: Die HP steigen sofort, die Chronik zeigt ihn', async () => {
    await seedHero()
    const max = await settleWithHp(30)
    // Ein älterer, schon abgerechneter Trank: nicht mehr rückgängig zu machen, „Getrunken“.
    await db.purchases.add(makeItemPurchase('old-potion', 'healingPotion', '2026-10-30', { createdAt: 1 }))
    const { user } = await renderPage()

    const potion = itemCard('Heiltrank')
    expect(potion).toHaveTextContent(`30 / ${max} HP`)
    await user.click(within(potion).getByRole('button', { name: 'Heiltrank für 80 Gold kaufen und trinken' }))
    const dialog = await screen.findByRole('alertdialog', { name: 'Heiltrank trinken?' })
    expect(dialog).toHaveTextContent(`Der Trank wirkt sofort: +20 HP (30 → 50 / ${max} HP).`)
    await user.click(within(dialog).getByRole('button', { name: 'Für 80 Gold trinken' }))

    await waitFor(() => expect(itemCard('Heiltrank')).toHaveTextContent(`50 / ${max} HP`))
    expect((await currentState()).hp.current).toBe(50)

    const rows = within(historyRegion()).getAllByRole('listitem')
    expect(rows).toHaveLength(2)
    // Neuester zuerst: der heutige Trank lässt sich zurückgeben, der alte nicht mehr.
    expect(within(rows[0]).getByRole('button', { name: /^Kauf „Heiltrank“ vom Dienstag, 3\. November 2026/ })).toBeInTheDocument()
    expect(within(rows[1]).queryByRole('button')).not.toBeInTheDocument()
    expect(rows[1]).toHaveTextContent('Getrunken')
  })

  it('zeigt bei knappen HP, dass ein Trank nur bis zum Maximum heilt', async () => {
    await seedHero()
    const max = await settleWithHp(0)
    await db.hpLedger.update(SETTLED, { hpAfter: max - 7 })
    const { user } = await renderPage()
    await user.click(within(itemCard('Heiltrank')).getByRole('button', { name: /kaufen und trinken$/ }))
    const dialog = await screen.findByRole('alertdialog', { name: 'Heiltrank trinken?' })
    expect(dialog).toHaveTextContent(`+7 HP – mehr passt gerade nicht hinein (${formatNumber(max - 7)} → ${max} / ${max} HP)`)
  })

  it('sperrt Gegenstände ohne genug Gold mit „Noch N Gold“', async () => {
    await saveProfile({ name: 'Aria', avatar: '🧙', createdDay: TODAY })
    await renderPage()
    const freeze = itemCard('Streak-Schutz')
    expect(freeze).toHaveTextContent('Dafür fehlen dir noch 150 Gold.')
    expect(within(freeze).getByRole('button', { name: 'Streak-Schutz kaufen – Noch 150 Gold' })).toBeDisabled()
  })

  it('meldet einen Fehler beim Kauf und lässt die Rückfrage offen', async () => {
    await seedHero()
    const { user } = await renderPage()
    await user.click(within(itemCard('Streak-Schutz')).getByRole('button', { name: 'Streak-Schutz für 150 Gold kaufen' }))
    const dialog = await screen.findByRole('alertdialog', { name: 'Streak-Schutz kaufen?' })
    // Inzwischen (z. B. in einem anderen Tab) ist der Beutel voll geworden.
    await db.purchases.bulkAdd(
      Array.from({ length: 5 }, (_, index) => makeItemPurchase(`f${index}`, 'streakFreeze', TODAY, { createdAt: index })),
    )
    await user.click(within(dialog).getByRole('button', { name: 'Für 150 Gold kaufen' }))
    expect(await screen.findByText('Kauf nicht möglich')).toBeInTheDocument()
    expect(
      screen.getByText('Du hast schon 5 Streak-Schutz im Vorrat – mehr passen nicht in deinen Beutel.'),
    ).toBeInTheDocument()
    expect(screen.getByRole('alertdialog', { name: 'Streak-Schutz kaufen?' })).toBeInTheDocument()
    expect((await loadGameData()).purchases).toHaveLength(5)
  })

  it('zeigt eingesetzte und vorrätige Streak-Schutz-Käufe in der Chronik', async () => {
    await seedHero()
    await db.purchases.bulkAdd([
      makeItemPurchase('f1', 'streakFreeze', '2026-10-20', { createdAt: 1 }),
      makeItemPurchase('f2', 'streakFreeze', '2026-10-21', { createdAt: 2 }),
    ])
    await db.hpLedger.put(makeLedgerEntry('2026-10-25', { score: 'missed', frozen: true, maxHp: 200, hpAfter: 200 }))
    await renderPage()
    const rows = within(historyRegion()).getAllByRole('listitem')
    expect(rows.map((row) => row.textContent)).toEqual([
      expect.stringContaining('Im Beutel'),
      expect.stringContaining('Eingesetzt'),
    ])
    expect(itemCard('Streak-Schutz')).toHaveTextContent('1 von 5 Streak-Schutz im Beutel')
  })

  it('nennt in der Gold-Aufschlüsselung, was Niederlagen gekostet haben', async () => {
    await seedHero()
    await db.hpLedger.put(makeLedgerEntry(SETTLED, { defeat: { goldLost: 42 }, maxHp: 200, hpAfter: 200 }))
    await renderPage()
    const card = screen.getByRole('region', { name: 'Dein Gold' })
    expect(card).toHaveTextContent('Bei Niederlagen verloren42')
  })
})
