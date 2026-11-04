// @vitest-environment jsdom
import 'fake-indexeddb/auto'
import { cleanup, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MotionGlobalConfig } from 'motion/react'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  archiveReward,
  createHabit,
  createReward,
  loadGameData,
  purchaseReward,
  resetAllData,
  saveProfile,
  setCompletionValue,
} from '../../data/repository'
import { addDays } from '../../domain/dates'
import type { DayKey } from '../../domain/types'
import { renderWithGame } from '../../test/renderWithGame'
import { TreasuryPage } from '../TreasuryPage'

/**
 * Fokus in der Schatzkammer: Verschwindet das bediente Element (Idee übernommen, Belohnung ausgeblendet,
 * eingelöst, Einlösung rückgängig …), darf der Fokus nicht auf <body> fallen – Tastatur- und Screenreader-Nutzer
 * verlören sonst ihren Platz auf der langen Seite. Gleiche Muster wie bei Quests und Nebenquests.
 */

/** Dienstag, 3. November 2026, 12:00 Uhr (Ortszeit) → Spieltag 2026-11-03. */
const TODAY: DayKey = '2026-11-03'
const CREATED: DayKey = '2026-10-20'

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

/** Held mit 15 Tagen „Training“ (schwer, täglich) → einige Hundert Gold. */
async function seedHero(): Promise<void> {
  await saveProfile({ name: 'Aria', avatar: '🧙', createdDay: CREATED })
  const habit = await createHabit(
    { title: 'Training', icon: '🏋️', attribute: 'strength', difficulty: 'hard', schedule: { type: 'daily' } },
    CREATED,
  )
  for (let day = CREATED; day <= TODAY; day = addDays(day, 1)) await setCompletionValue(habit.id, day, 1)
}

async function renderPage() {
  const user = userEvent.setup()
  const view = renderWithGame(<TreasuryPage />, { route: '/schatzkammer' })
  await screen.findByRole('heading', { level: 1, name: 'Schatzkammer' })
  return { user, ...view }
}

function rewards(): HTMLElement {
  return screen.getByRole('region', { name: /^Belohnungen/ })
}

describe('Schatzkammer: Fokus nach Aktionen', () => {
  it('übernommene Idee: Fokus auf die neue Karte (die Idee selbst verschwindet)', async () => {
    await seedHero()
    const { user } = await renderPage()
    await user.click(screen.getByRole('button', { name: 'Idee übernehmen: Pizza bestellen, 500 Gold' }))
    const dialog = await screen.findByRole('dialog', { name: 'Neue Belohnung' })
    await user.click(within(dialog).getByRole('button', { name: 'Belohnung anlegen' }))

    await waitFor(() => expect(screen.getByRole('button', { name: '„Pizza bestellen“ bearbeiten' })).toHaveFocus())
    expect(document.body).not.toHaveFocus()
  })

  it('„Neue Belohnung“: Fokus auf die neue Karte', async () => {
    await seedHero()
    await createReward({ title: 'Kaffee', icon: '☕', price: 100, repeatable: true })
    const { user } = await renderPage()
    await user.click(screen.getByRole('button', { name: 'Neue Belohnung' }))
    const dialog = await screen.findByRole('dialog', { name: 'Neue Belohnung' })
    await user.type(within(dialog).getByRole('textbox', { name: /^Name/ }), 'Kinoabend')
    await user.click(within(dialog).getByRole('button', { name: 'Belohnung anlegen' }))

    await waitFor(() => expect(screen.getByRole('button', { name: '„Kinoabend“ bearbeiten' })).toHaveFocus())
  })

  it('ausgeblendet: Fokus auf „Ausgeblendete Belohnungen“', async () => {
    await seedHero()
    await createReward({ title: 'Kaffee', icon: '☕', price: 100, repeatable: true })
    const { user } = await renderPage()
    await user.click(screen.getByRole('button', { name: '„Kaffee“ bearbeiten' }))
    const dialog = await screen.findByRole('dialog', { name: 'Belohnung bearbeiten' })
    await user.click(within(dialog).getByRole('button', { name: 'Ausblenden' }))

    await waitFor(() => expect(screen.getByRole('button', { name: /^Ausgeblendete Belohnungen/ })).toHaveFocus())
    expect(within(rewards()).queryByRole('listitem', { name: 'Kaffee' })).not.toBeInTheDocument()
  })

  it('wieder eingeblendet: Fokus auf die Liste, bei der letzten auf ihre Karte', async () => {
    await seedHero()
    const coffee = await createReward({ title: 'Kaffee', icon: '☕', price: 100, repeatable: true })
    const cinema = await createReward({ title: 'Kino', icon: '🎬', price: 250, repeatable: true })
    await archiveReward(coffee.id)
    await archiveReward(cinema.id)
    const { user } = await renderPage()
    await user.click(screen.getByRole('button', { name: /^Ausgeblendete Belohnungen/ }))

    await user.click(screen.getByRole('button', { name: '„Kaffee“ wieder einblenden' }))
    await waitFor(() => expect(within(rewards()).getByRole('listitem', { name: 'Kaffee' })).toBeInTheDocument())
    await waitFor(() => expect(screen.getByRole('button', { name: /^Ausgeblendete Belohnungen/ })).toHaveFocus())

    await user.click(screen.getByRole('button', { name: '„Kino“ wieder einblenden' }))
    await waitFor(() => expect(screen.getByRole('button', { name: '„Kino“ bearbeiten' })).toHaveFocus())
    expect(screen.queryByRole('button', { name: /^Ausgeblendete Belohnungen/ })).not.toBeInTheDocument()
  })

  it('endgültig gelöscht (die letzte ausgeblendete): Fokus auf „Neue Belohnung“', async () => {
    await seedHero()
    const coffee = await createReward({ title: 'Kaffee', icon: '☕', price: 100, repeatable: true })
    await archiveReward(coffee.id)
    const { user } = await renderPage()
    await user.click(screen.getByRole('button', { name: /^Ausgeblendete Belohnungen/ }))
    await user.click(screen.getByRole('button', { name: '„Kaffee“ endgültig löschen' }))
    const confirm = await screen.findByRole('alertdialog', { name: 'Belohnung löschen?' })
    await user.click(within(confirm).getByRole('button', { name: 'Endgültig löschen' }))

    await waitFor(async () => expect((await loadGameData()).rewards).toBeUndefined())
    await waitFor(() => expect(screen.getByRole('button', { name: 'Neue Belohnung' })).toHaveFocus())
  })

  it('einmalige Belohnung eingelöst: „Einlösen“ verschwindet, der Fokus bleibt auf ihrer Karte', async () => {
    await seedHero()
    await createReward({ title: 'Neues Spiel', icon: '🎮', price: 300, repeatable: false })
    const { user } = await renderPage()
    await user.click(screen.getByRole('button', { name: '„Neues Spiel“ einlösen' }))
    const confirm = await screen.findByRole('alertdialog', { name: '„Neues Spiel“ einlösen?' })
    await user.click(within(confirm).getByRole('button', { name: /^Für .* einlösen$/ }))

    await waitFor(() =>
      expect(within(rewards()).getByRole('listitem', { name: 'Neues Spiel' })).toHaveTextContent('Eingelöst am'),
    )
    await waitFor(() => expect(screen.getByRole('button', { name: '„Neues Spiel“ bearbeiten' })).toHaveFocus())
  })

  it('wiederholbare Belohnung eingelöst: Fokus bleibt auf „Einlösen“', async () => {
    await seedHero()
    await createReward({ title: 'Kaffee', icon: '☕', price: 50, repeatable: true })
    const { user } = await renderPage()
    await user.click(screen.getByRole('button', { name: '„Kaffee“ einlösen' }))
    const confirm = await screen.findByRole('alertdialog', { name: '„Kaffee“ einlösen?' })
    await user.click(within(confirm).getByRole('button', { name: /^Für .* einlösen$/ }))

    await waitFor(async () => expect((await loadGameData()).purchases).toHaveLength(1))
    await waitFor(() =>
      expect(within(rewards()).getByRole('listitem', { name: 'Kaffee' })).toHaveTextContent('1× eingelöst'),
    )
    expect(screen.getByRole('button', { name: '„Kaffee“ einlösen' })).toHaveFocus()
  })

  it('Einlösung rückgängig: Fokus auf die nächste Einlösung, zuletzt auf die leere Chronik', async () => {
    await seedHero()
    const coffee = await createReward({ title: 'Kaffee', icon: '☕', price: 50, repeatable: true })
    const cinema = await createReward({ title: 'Kino', icon: '🎬', price: 60, repeatable: true })
    await purchaseReward(coffee.id, TODAY)
    await purchaseReward(cinema.id, TODAY)
    const { user } = await renderPage()
    const history = () => screen.getByRole('region', { name: /^Chronik/ })

    // Neueste zuerst: Kino, dann Kaffee.
    await user.click(within(history()).getByRole('button', { name: /^Einlösung „Kino“ vom .* rückgängig machen$/ }))
    let confirm = await screen.findByRole('alertdialog', { name: 'Einlösung rückgängig machen?' })
    await user.click(within(confirm).getByRole('button', { name: 'Rückgängig machen' }))
    await waitFor(() =>
      expect(within(history()).getByRole('button', { name: /^Einlösung „Kaffee“ vom .* rückgängig machen$/ })).toHaveFocus(),
    )

    await user.click(within(history()).getByRole('button', { name: /^Einlösung „Kaffee“ vom .* rückgängig machen$/ }))
    confirm = await screen.findByRole('alertdialog', { name: 'Einlösung rückgängig machen?' })
    await user.click(within(confirm).getByRole('button', { name: 'Rückgängig machen' }))
    await waitFor(() =>
      expect(within(history()).getByText('Noch nichts eingelöst – deine erste Belohnung wartet schon.')).toHaveFocus(),
    )
  })
})

describe('Schatzkammer: Verschieben wird angesagt', () => {
  it('meldet die neue Position (wie bei den Quests)', async () => {
    await seedHero()
    await createReward({ title: 'Kaffee', icon: '☕', price: 100, repeatable: true })
    await createReward({ title: 'Kino', icon: '🎬', price: 250, repeatable: true })
    await createReward({ title: 'Pizza', icon: '🍕', price: 400, repeatable: true })
    const { user } = await renderPage()
    const button = screen.getByRole('button', { name: '„Kaffee“ nach hinten verschieben' })
    await user.click(button)

    await waitFor(() =>
      expect(screen.getByRole('status')).toHaveTextContent('„Kaffee“ steht jetzt an Position 2 von 3.'),
    )
    expect(screen.getByRole('button', { name: '„Kaffee“ nach hinten verschieben' })).toHaveFocus()
  })
})
