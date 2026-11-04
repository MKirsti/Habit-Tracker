// @vitest-environment jsdom
import 'fake-indexeddb/auto'
import { cleanup, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MotionGlobalConfig } from 'motion/react'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  createHabit,
  createReward,
  loadGameData,
  purchaseReward,
  resetAllData,
  saveProfile,
  setCompletionValue,
} from '../../data/repository'
import { addDays } from '../../domain/dates'
import { deriveGameState } from '../../domain/engine'
import type { DayKey } from '../../domain/types'
import { renderWithGame } from '../../test/renderWithGame'
import { formatNumber } from '../../ui'
import { TreasuryPage } from '../TreasuryPage'

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

/** Held mit 15 Tagen „Training“ (schwer, täglich) → einige Hundert Gold. Liefert das Guthaben. */
async function seedHero(): Promise<number> {
  await saveProfile({ name: 'Aria', avatar: '🧙', createdDay: CREATED })
  const habit = await createHabit(
    { title: 'Training', icon: '🏋️', attribute: 'strength', difficulty: 'hard', schedule: { type: 'daily' } },
    CREATED,
  )
  for (let day = CREATED; day <= TODAY; day = addDays(day, 1)) await setCompletionValue(habit.id, day, 1)
  return balance()
}

async function balance(): Promise<number> {
  return deriveGameState(await loadGameData(), TODAY).gold.balance
}

function gold(amount: number): string {
  return `${formatNumber(amount)} Gold`
}

async function renderPage() {
  const user = userEvent.setup()
  const view = renderWithGame(<TreasuryPage />, { route: '/schatzkammer' })
  await screen.findByRole('heading', { level: 1, name: 'Schatzkammer' })
  return { user, ...view }
}

function rewardCard(title: string): HTMLElement {
  const rewards = screen.getByRole('region', { name: /^Belohnungen/ })
  return within(rewards).getByRole('listitem', { name: title })
}

describe('Schatzkammer', () => {
  it('zeigt das Guthaben groß mit Erklärung und Aufschlüsselung', async () => {
    const amount = await seedHero()
    await renderPage()
    const card = screen.getByRole('region', { name: 'Dein Gold' })
    expect(within(card).getByTestId('gold-balance')).toHaveTextContent(formatNumber(amount))
    expect(card).toHaveTextContent('Für jede XP bekommst du ½ Gold')
    expect(card).toHaveTextContent('Aus XP')
    expect(card).toHaveTextContent('Ausgegeben0')
    expect(amount).toBeGreaterThan(500)
  })

  it('ohne Belohnungen: freundlicher leerer Zustand, Vorschläge, leere Chronik und Ausblick auf Gegenstände', async () => {
    await seedHero()
    await renderPage()
    expect(screen.getByRole('heading', { name: 'Deine Schatzkammer ist noch leer' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Erste Belohnung anlegen' })).toBeInTheDocument()
    expect(screen.getByRole('region', { name: 'Ideen für deine Schatzkammer' })).toBeInTheDocument()
    expect(screen.getByText('Noch nichts eingelöst – deine erste Belohnung wartet schon.')).toBeInTheDocument()
    const items = screen.getByRole('region', { name: 'Gegenstände' })
    expect(items).toHaveTextContent('Bald verfügbar')
  })

  it('übernimmt einen Vorschlag vorbelegt ins Formular und legt die Belohnung an', async () => {
    await seedHero()
    const { user } = await renderPage()
    await user.click(screen.getByRole('button', { name: 'Idee übernehmen: Pizza bestellen, 500 Gold' }))
    const dialog = await screen.findByRole('dialog', { name: 'Neue Belohnung' })
    expect(within(dialog).getByRole('textbox', { name: /^Name/ })).toHaveValue('Pizza bestellen')
    expect(within(dialog).getByRole('spinbutton', { name: /^Preis/ })).toHaveValue('500')
    expect(within(dialog).getByRole('switch', { name: 'Wiederholbar' })).toBeChecked()
    await user.click(within(dialog).getByRole('button', { name: 'Belohnung anlegen' }))

    await waitFor(async () => {
      const rewards = (await loadGameData()).rewards ?? []
      expect(rewards).toHaveLength(1)
      expect(rewards[0]).toMatchObject({ title: 'Pizza bestellen', icon: '🍕', price: 500, repeatable: true })
    })
    expect(await screen.findByText('Belohnung angelegt')).toBeInTheDocument()
    expect(rewardCard('Pizza bestellen')).toHaveTextContent('Wiederholbar')
    // Der übernommene Vorschlag verschwindet aus den Ideen.
    expect(screen.queryByRole('button', { name: /^Idee übernehmen: Pizza bestellen/ })).not.toBeInTheDocument()
  })

  it('prüft das Formular: Name Pflicht, Preis ganzzahlig und im Rahmen – ungültig wird nichts gespeichert', async () => {
    await seedHero()
    const { user } = await renderPage()
    await user.click(screen.getByRole('button', { name: 'Neue Belohnung' }))
    const dialog = await screen.findByRole('dialog', { name: 'Neue Belohnung' })
    const price = within(dialog).getByRole('spinbutton', { name: /^Preis/ })
    await user.clear(price)
    await user.type(price, '12,5')
    await user.click(within(dialog).getByRole('button', { name: 'Belohnung anlegen' }))

    expect(within(dialog).getByText('Bitte gib der Belohnung einen Namen.')).toBeInTheDocument()
    expect(within(dialog).getByText(/Der Preis muss eine ganze Zahl sein/)).toBeInTheDocument()
    expect(within(dialog).getByRole('textbox', { name: /^Name/ })).toHaveFocus()

    await user.type(within(dialog).getByRole('textbox', { name: /^Name/ }), 'Kinoabend')
    await user.clear(price)
    await user.click(within(dialog).getByRole('button', { name: 'Belohnung anlegen' }))
    expect(within(dialog).getByText('Bitte gib einen Preis ein.')).toBeInTheDocument()
    expect((await loadGameData()).rewards).toBeUndefined()

    // Schnellauswahl setzt einen gültigen Preis.
    await user.click(within(dialog).getByRole('button', { name: '250 Gold' }))
    await user.click(within(dialog).getByRole('switch', { name: 'Wiederholbar' }))
    await user.click(within(dialog).getByRole('button', { name: 'Belohnung anlegen' }))
    await waitFor(async () => {
      expect((await loadGameData()).rewards?.[0]).toMatchObject({ title: 'Kinoabend', price: 250, repeatable: false })
    })
  })

  it('löst eine Belohnung nach Rückfrage ein: Gold sinkt, Chronik und Toast', async () => {
    const amount = await seedHero()
    await createReward({ title: 'Kinoabend', icon: '🎬', price: 250, repeatable: true })
    const { user } = await renderPage()

    await user.click(within(rewardCard('Kinoabend')).getByRole('button', { name: '„Kinoabend“ einlösen' }))
    const confirm = await screen.findByRole('alertdialog', { name: '„Kinoabend“ einlösen?' })
    expect(confirm).toHaveTextContent(`Das kostet ${gold(250)}. Danach hast du noch ${gold(amount - 250)}.`)
    await user.click(within(confirm).getByRole('button', { name: `Für ${gold(250)} einlösen` }))

    await waitFor(async () => expect((await loadGameData()).purchases).toHaveLength(1))
    expect((await loadGameData()).purchases?.[0]).toMatchObject({ title: 'Kinoabend', price: 250, day: TODAY })
    expect(await screen.findByText('Belohnung eingelöst!')).toBeInTheDocument()
    // Die erste Einlösung schaltet zugleich „Beim Händler“ frei (+25 Gold).
    const after = await balance()
    expect(after).toBe(amount - 250 + 25)
    await waitFor(() => expect(screen.getByTestId('gold-balance')).toHaveTextContent(formatNumber(after)))
    const history = screen.getByRole('region', { name: /^Chronik/ })
    expect(within(history).getByText('Kinoabend')).toBeInTheDocument()
    expect(history).toHaveTextContent(`−${gold(250)}`)
    // Wiederholbar: bleibt einlösbar, zählt mit.
    expect(rewardCard('Kinoabend')).toHaveTextContent('1× eingelöst')
  })

  it('sperrt zu teure Belohnungen mit „Noch N Gold“', async () => {
    const amount = await seedHero()
    await createReward({ title: 'Wochenendausflug', icon: '🧳', price: amount + 150, repeatable: false })
    await renderPage()
    const card = rewardCard('Wochenendausflug')
    const button = within(card).getByRole('button', { name: `„Wochenendausflug“ einlösen – noch ${gold(150)}` })
    expect(button).toBeDisabled()
    expect(card).toHaveTextContent(`Noch ${gold(150)}`)
    expect(within(card).getByRole('progressbar', { name: 'Gespart für „Wochenendausflug“' })).toBeInTheDocument()
    expect(within(card).queryByRole('button', { name: /einlösen$/ })).not.toBeInTheDocument()
  })

  it('meldet fehlendes Gold beim Bestätigen (Guthaben inzwischen gesunken) und bleibt offen', async () => {
    const amount = await seedHero()
    await createReward({ title: 'Kinoabend', icon: '🎬', price: amount, repeatable: true })
    const other = await createReward({ title: 'Pizza', icon: '🍕', price: 100, repeatable: true })
    const { user } = await renderPage()

    await user.click(screen.getByRole('button', { name: '„Kinoabend“ einlösen' }))
    const confirm = await screen.findByRole('alertdialog', { name: '„Kinoabend“ einlösen?' })
    // Woanders (z. B. in einem zweiten Tab) wird inzwischen Gold ausgegeben.
    await purchaseReward(other.id, TODAY)
    await user.click(within(confirm).getByRole('button', { name: `Für ${gold(amount)} einlösen` }))

    expect(await screen.findByText('Einlösen nicht möglich')).toBeInTheDocument()
    // 100 Gold ausgegeben, 25 Gold für den Erfolg „Beim Händler“ zurück.
    expect(
      screen.getByText(`Dafür fehlen dir noch ${formatNumber(amount - (await balance()))} Gold.`),
    ).toBeInTheDocument()
    expect(screen.getByText('Dafür fehlen dir noch 75 Gold.')).toBeInTheDocument()
    expect(screen.getByRole('alertdialog', { name: '„Kinoabend“ einlösen?' })).toBeInTheDocument()
    expect((await loadGameData()).purchases).toHaveLength(1)
  })

  it('zeigt einmalige Belohnungen nach dem Einlösen als „Eingelöst“ und macht die Einlösung rückgängig', async () => {
    const amount = await seedHero()
    const reward = await createReward({ title: 'Neues Spiel', icon: '🎮', price: 300, repeatable: false })
    await purchaseReward(reward.id, TODAY)
    const { user } = await renderPage()

    const card = rewardCard('Neues Spiel')
    expect(card).toHaveTextContent('Eingelöst am 3. November 2026')
    expect(card).toHaveTextContent('Einmalig')
    expect(within(card).queryByRole('button', { name: /einlösen$/ })).not.toBeInTheDocument()
    expect(screen.getByTestId('gold-balance')).toHaveTextContent(formatNumber(await balance()))

    const history = screen.getByRole('region', { name: /^Chronik/ })
    await user.click(
      within(history).getByRole('button', { name: /^Einlösung „Neues Spiel“ vom .* rückgängig machen$/ }),
    )
    const confirm = await screen.findByRole('alertdialog', { name: 'Einlösung rückgängig machen?' })
    expect(confirm).toHaveTextContent(`du bekommst ${gold(300)} zurück`)
    await user.click(within(confirm).getByRole('button', { name: 'Rückgängig machen' }))

    await waitFor(async () => expect((await loadGameData()).purchases).toBeUndefined())
    expect(await screen.findByText('Einlösung rückgängig gemacht')).toBeInTheDocument()
    await waitFor(() =>
      expect(within(rewardCard('Neues Spiel')).getByRole('button', { name: '„Neues Spiel“ einlösen' })).toBeEnabled(),
    )
    expect(screen.getByTestId('gold-balance')).toHaveTextContent(formatNumber(amount))
  })

  it('bearbeitet, sortiert, blendet aus, blendet wieder ein und löscht', async () => {
    await seedHero()
    await createReward({ title: 'Kaffee', icon: '☕', price: 100, repeatable: true })
    await createReward({ title: 'Kino', icon: '🎬', price: 250, repeatable: true })
    const { user } = await renderPage()

    // Sortieren: „Kino“ nach vorne.
    await user.click(screen.getByRole('button', { name: '„Kino“ nach vorne verschieben' }))
    await waitFor(async () =>
      expect(((await loadGameData()).rewards ?? []).map((reward) => reward.title)).toEqual(['Kino', 'Kaffee']),
    )
    await waitFor(() =>
      expect(screen.getByRole('button', { name: '„Kino“ nach vorne verschieben' })).toHaveAttribute(
        'aria-disabled',
        'true',
      ),
    )

    // Bearbeiten.
    await user.click(screen.getByRole('button', { name: '„Kaffee“ bearbeiten' }))
    let dialog = await screen.findByRole('dialog', { name: 'Belohnung bearbeiten' })
    const name = within(dialog).getByRole('textbox', { name: /^Name/ })
    await user.clear(name)
    await user.type(name, 'Café-Besuch')
    await user.click(within(dialog).getByRole('button', { name: 'Speichern' }))
    await waitFor(async () => expect((await loadGameData()).rewards?.[1].title).toBe('Café-Besuch'))
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())

    // Ausblenden.
    await user.click(screen.getByRole('button', { name: '„Café-Besuch“ bearbeiten' }))
    dialog = await screen.findByRole('dialog', { name: 'Belohnung bearbeiten' })
    await user.click(within(dialog).getByRole('button', { name: 'Ausblenden' }))
    await waitFor(async () => expect((await loadGameData()).rewards?.[1].archived).toBe(true))
    await waitFor(() =>
      expect(
        within(screen.getByRole('region', { name: /^Belohnungen/ })).queryByRole('listitem', { name: 'Café-Besuch' }),
      ).not.toBeInTheDocument(),
    )

    // Wieder einblenden.
    await user.click(screen.getByRole('button', { name: /^Ausgeblendete Belohnungen/ }))
    await user.click(screen.getByRole('button', { name: '„Café-Besuch“ wieder einblenden' }))
    await waitFor(async () => expect((await loadGameData()).rewards?.[1].archived).toBeUndefined())
    expect(await screen.findByText('Belohnung wieder eingeblendet')).toBeInTheDocument()

    // Ausblenden und endgültig löschen (nie eingelöst).
    await user.click(screen.getByRole('button', { name: '„Café-Besuch“ bearbeiten' }))
    dialog = await screen.findByRole('dialog', { name: 'Belohnung bearbeiten' })
    await user.click(within(dialog).getByRole('button', { name: 'Ausblenden' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    await user.click(await screen.findByRole('button', { name: /^Ausgeblendete Belohnungen/ }))
    await user.click(screen.getByRole('button', { name: '„Café-Besuch“ endgültig löschen' }))
    const confirm = await screen.findByRole('alertdialog', { name: 'Belohnung löschen?' })
    await user.click(within(confirm).getByRole('button', { name: 'Endgültig löschen' }))
    await waitFor(async () =>
      expect(((await loadGameData()).rewards ?? []).map((reward) => reward.title)).toEqual(['Kino']),
    )
  })

  it('bietet für eingelöste ausgeblendete Belohnungen kein Löschen an (die Chronik verweist auf sie)', async () => {
    await seedHero()
    const reward = await createReward({ title: 'Kino', icon: '🎬', price: 100, repeatable: true })
    await purchaseReward(reward.id, TODAY)
    const { user } = await renderPage()
    await user.click(screen.getByRole('button', { name: '„Kino“ bearbeiten' }))
    const dialog = await screen.findByRole('dialog', { name: 'Belohnung bearbeiten' })
    await user.click(within(dialog).getByRole('button', { name: 'Ausblenden' }))
    await user.click(await screen.findByRole('button', { name: /^Ausgeblendete Belohnungen/ }))
    expect(screen.getByRole('button', { name: '„Kino“ wieder einblenden' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '„Kino“ endgültig löschen' })).not.toBeInTheDocument()
    expect(screen.getByText(/bleibt wegen der Chronik erhalten/)).toBeInTheDocument()
    // Die Chronik bleibt.
    expect(within(screen.getByRole('region', { name: /^Chronik/ })).getByText('Kino')).toBeInTheDocument()
  })
})
