// @vitest-environment jsdom
import 'fake-indexeddb/auto'
import { cleanup, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MotionGlobalConfig } from 'motion/react'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { createHabit, markHpIntroSeen, resetAllData, saveProfile, setPenaltiesEnabled } from '../../data/repository'
import type { HabitDraft } from '../../data/repository'
import { renderWithGame } from '../../test/renderWithGame'
import { DashboardPage } from '../DashboardPage'

/*
 * Fokus nach den Lebenspunkte-Aktionen der Tagesübersicht (Phase 2b): Jede dieser Aktionen entfernt den Knopf, der
 * sie ausgelöst hat („Heute Ruhetag“, „Ruhetag aufheben“, „Verstanden“). Der Fokus darf dann nicht auf <body>
 * fallen – Tastatur- und Screenreader-Nutzer verlören ihren Platz.
 */

const READING: HabitDraft = {
  title: 'Lesen',
  icon: '📖',
  attribute: 'intellect',
  difficulty: 'medium',
  schedule: { type: 'daily' },
}
const MEDITATION: HabitDraft = {
  title: 'Meditieren',
  icon: '🧘',
  attribute: 'wisdom',
  difficulty: 'easy',
  schedule: { type: 'daily' },
}

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
  await saveProfile({ name: 'Aria', avatar: '🧙', createdDay: '2026-10-20' })
  await setPenaltiesEnabled(true, '2026-10-25')
  await createHabit(READING, '2026-10-20')
  await createHabit(MEDITATION, '2026-10-20')
})
afterEach(cleanup)

async function renderDashboard() {
  const user = userEvent.setup()
  const view = renderWithGame(<DashboardPage />)
  await screen.findByRole('heading', { level: 1, name: 'Heute' })
  return { user, ...view }
}

function dailySection(): HTMLElement {
  return screen.getByRole('region', { name: /^Tagesquests/ })
}

describe('Dashboard – Fokus nach Ruhetag-Aktionen', () => {
  it('springt nach „Ruhetag einlegen“ auf „Ruhetag aufheben“ und danach zurück auf „Heute Ruhetag“', async () => {
    await markHpIntroSeen()
    const { user } = await renderDashboard()

    within(dailySection()).getByRole('button', { name: 'Heute Ruhetag' }).focus()
    await user.keyboard('{Enter}')
    const dialog = await screen.findByRole('alertdialog', { name: 'Heute Ruhetag einlegen?' })
    await user.click(within(dialog).getByRole('button', { name: 'Ruhetag einlegen' }))

    const undo = await within(dailySection()).findByRole('button', { name: 'Ruhetag aufheben' })
    await waitFor(() => expect(undo).toHaveFocus())

    await user.keyboard('{Enter}')
    const rest = await within(dailySection()).findByRole('button', { name: 'Heute Ruhetag' })
    await waitFor(() => expect(rest).toHaveFocus())
    expect(document.activeElement).not.toBe(document.body)
  })
})

describe('Dashboard – Fokus nach der Einführung', () => {
  it('lässt den Fokus nach „Verstanden“ beim nächsten Bedienelement (Tag wählen) statt auf <body>', async () => {
    const { user } = await renderDashboard()
    const intro = screen.getByRole('region', { name: 'Lebenspunkte' })
    within(intro).getByRole('button', { name: 'Verstanden' }).focus()
    await user.keyboard('{Enter}')

    await waitFor(() => expect(screen.queryByRole('region', { name: 'Lebenspunkte' })).not.toBeInTheDocument())
    await waitFor(() => expect(document.activeElement).not.toBe(document.body))
    // Das nächste Bedienelement nach der Karte: der Umschalter „Heute / Gestern“ der Tagesquests.
    expect(dailySection().contains(document.activeElement)).toBe(true)
  })
})
