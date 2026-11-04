// @vitest-environment jsdom
import 'fake-indexeddb/auto'
import { cleanup, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MotionGlobalConfig } from 'motion/react'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  completeSideQuest,
  createHabit,
  createSideQuest,
  loadGameData,
  resetAllData,
  saveProfile,
} from '../../data/repository'
import type { SideQuestDraft } from '../../data/repository'
import type { DayKey, SideQuest } from '../../domain/types'
import { renderWithGame } from '../../test/renderWithGame'
import { QuestsPage } from '../QuestsPage'

/** Dienstag, 3. November 2026 → Spieltag 2026-11-03. */
const TODAY: DayKey = '2026-11-03'

const TAXES: SideQuestDraft = {
  title: 'Steuererklärung abgeben',
  icon: '🧾',
  attribute: 'discipline',
  difficulty: 'hard',
  dueDay: '2026-11-01',
}
const DENTIST: SideQuestDraft = { title: 'Zahnarzt anrufen', icon: '🦷', attribute: 'vitality', difficulty: 'easy' }

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
  await saveProfile({ name: 'Testheld', avatar: '🧙', createdDay: '2026-10-01' })
})
afterEach(cleanup)

async function sideQuestByTitle(title: string): Promise<SideQuest | undefined> {
  return (await loadGameData()).sideQuests?.find((quest) => quest.title === title)
}

function card(title: string): HTMLElement {
  return screen.getByRole('listitem', { name: title })
}

describe('Quests-Seite – Reiter', () => {
  it('wechselt per Reiter zwischen Gewohnheiten und Nebenquests (URL ?tab=nebenquests)', async () => {
    const user = userEvent.setup()
    await createHabit({ title: 'Lesen', icon: '📖', attribute: 'intellect', difficulty: 'medium', schedule: { type: 'daily' } }, TODAY)
    await createSideQuest(DENTIST, TODAY)
    const { router } = renderWithGame(<QuestsPage />, { route: '/quests' })

    const tablist = await screen.findByRole('tablist', { name: 'Art der Quests' })
    const [habits, side] = within(tablist).getAllByRole('tab')
    expect(habits).toHaveAccessibleName('Gewohnheiten 1 aktiv')
    expect(side).toHaveAccessibleName('Nebenquests 1 offen')
    expect(habits).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByRole('tabpanel')).toHaveAttribute('aria-labelledby', habits.id)
    // aria-controls nur am gezeigten Reiter – das andere Panel gibt es nicht (gültiges ARIA).
    expect(habits).toHaveAttribute('aria-controls', screen.getByRole('tabpanel').id)
    expect(side).not.toHaveAttribute('aria-controls')
    expect(screen.getByRole('heading', { name: /Aktive Quests/ })).toBeInTheDocument()

    await user.click(side)
    expect(router.state.location.search).toBe('?tab=nebenquests')
    expect(side).toHaveAttribute('aria-selected', 'true')
    expect(await screen.findByRole('listitem', { name: 'Zahnarzt anrufen' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Neue Nebenquest' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Neue Quest' })).not.toBeInTheDocument()

    // Pfeiltasten wechseln (mit Umlauf), der Fokus folgt dem Reiter.
    await user.keyboard('{ArrowRight}')
    expect(habits).toHaveFocus()
    expect(habits).toHaveAttribute('aria-selected', 'true')
    expect(router.state.location.search).toBe('')
  })

  it('erklärt Nebenquests im leeren Zustand und öffnet per Deep-Link „Neue Nebenquest“', async () => {
    const user = userEvent.setup()
    renderWithGame(<QuestsPage />, { route: '/quests?tab=nebenquests' })
    expect(await screen.findByRole('heading', { name: 'Noch keine Nebenquests' })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Neue Nebenquest' }))
    expect(await screen.findByRole('dialog', { name: 'Neue Nebenquest' })).toBeInTheDocument()
    cleanup()

    const { router } = renderWithGame(<QuestsPage />, { route: '/quests?tab=nebenquests&neu=1' })
    expect(await screen.findByRole('dialog', { name: 'Neue Nebenquest' })).toBeInTheDocument()
    await waitFor(() => expect(router.state.location.search).toBe('?tab=nebenquests'))
  })
})

describe('Quests-Seite – Nebenquests', () => {
  it('legt eine Nebenquest mit Termin an und fokussiert sie', async () => {
    const user = userEvent.setup()
    renderWithGame(<QuestsPage />, { route: '/quests?tab=nebenquests' })
    await user.click(await screen.findByRole('button', { name: 'Neue Nebenquest' }))
    const dialog = await screen.findByRole('dialog', { name: 'Neue Nebenquest' })

    // Ohne Titel: Fehler am Feld, nichts gespeichert.
    await user.click(within(dialog).getByRole('button', { name: 'Nebenquest anlegen' }))
    expect(within(dialog).getByRole('textbox', { name: /Titel/ })).toHaveAccessibleDescription(
      'Gib deiner Nebenquest einen Namen.',
    )
    expect(within(dialog).getByRole('textbox', { name: /Titel/ })).toHaveFocus()

    await user.type(within(dialog).getByRole('textbox', { name: /Titel/ }), 'Fahrrad reparieren')
    await user.click(within(dialog).getByRole('button', { name: 'Morgen' }))
    await user.click(within(dialog).getByRole('radio', { name: /Stärke/ }))
    await user.click(within(dialog).getByRole('radio', { name: 'Schwer' }))
    expect(within(dialog).getByText('+40 XP · +20 Gold bei Erledigung')).toBeInTheDocument()
    await user.click(within(dialog).getByRole('button', { name: 'Nebenquest anlegen' }))

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(await sideQuestByTitle('Fahrrad reparieren')).toMatchObject({
      attribute: 'strength',
      difficulty: 'hard',
      dueDay: '2026-11-04',
      createdDay: TODAY,
    })
    const row = await screen.findByRole('listitem', { name: 'Fahrrad reparieren' })
    expect(row).toHaveTextContent('morgen fällig')
    expect(row).toHaveTextContent('Schwer · 40 XP')
    await waitFor(() => expect(within(row).getByRole('button', { name: '„Fahrrad reparieren“ bearbeiten' })).toHaveFocus())
    expect(screen.getByText('Nebenquest angelegt')).toBeInTheDocument()
  })

  it('sortiert offene nach Termin, hakt für heute ab und öffnet wieder', async () => {
    const user = userEvent.setup()
    await createSideQuest(DENTIST, TODAY)
    await createSideQuest(TAXES, '2026-10-20')
    renderWithGame(<QuestsPage />, { route: '/quests?tab=nebenquests' })

    const list = (await screen.findByRole('listitem', { name: 'Steuererklärung abgeben' })).closest('ul')
    expect(within(list as HTMLElement).getAllByRole('listitem')).toHaveLength(2)
    const titles = within(list as HTMLElement)
      .getAllByRole('heading')
      .map((heading) => heading.textContent)
    // Mit (überfälligem) Termin zuerst.
    expect(titles).toEqual(['🧾Steuererklärung abgeben', '🦷Zahnarzt anrufen'])
    expect(card('Steuererklärung abgeben')).toHaveTextContent('überfällig seit 2 Tagen')

    const check = within(card('Steuererklärung abgeben')).getByRole('checkbox', { name: 'Steuererklärung abgeben erledigt' })
    await user.click(check)
    await waitFor(async () => expect((await sideQuestByTitle('Steuererklärung abgeben'))?.doneDay).toBe(TODAY))
    await waitFor(() => expect(card('Steuererklärung abgeben')).toHaveTextContent('heute erledigt'))
    expect(within(card('Steuererklärung abgeben')).getByRole('checkbox')).toHaveAttribute('aria-checked', 'true')
    // Die erledigte steht jetzt hinter der offenen; der Haken behält den Fokus.
    expect(screen.getByRole('heading', { name: /Anstehend/ })).toHaveTextContent('1 offen')
    await waitFor(() => expect(within(card('Steuererklärung abgeben')).getByRole('checkbox')).toHaveFocus())

    await user.click(within(card('Steuererklärung abgeben')).getByRole('checkbox'))
    await waitFor(async () => expect((await sideQuestByTitle('Steuererklärung abgeben'))?.doneDay).toBeUndefined())
    await waitFor(() => expect(card('Steuererklärung abgeben')).toHaveTextContent('überfällig seit 2 Tagen'))
  })

  it('klappt früher erledigte Nebenquests ein und zeigt sie auf Wunsch', async () => {
    const user = userEvent.setup()
    const taxes = await createSideQuest(TAXES, '2026-10-20')
    await completeSideQuest(taxes.id, '2026-10-30')
    await createSideQuest(DENTIST, TODAY)
    renderWithGame(<QuestsPage />, { route: '/quests?tab=nebenquests' })

    const toggle = await screen.findByRole('button', { name: /Erledigt 1 Nebenquest/ })
    expect(toggle).toHaveAttribute('aria-expanded', 'false')
    expect(screen.queryByRole('listitem', { name: 'Steuererklärung abgeben' })).not.toBeInTheDocument()
    await user.click(toggle)
    expect(toggle).toHaveAttribute('aria-expanded', 'true')
    expect(await screen.findByRole('listitem', { name: 'Steuererklärung abgeben' })).toHaveTextContent('erledigt am 30. Okt.')
  })

  it('bearbeitet eine Nebenquest und entfernt ihren Termin', async () => {
    const user = userEvent.setup()
    await createSideQuest({ ...DENTIST, dueDay: '2026-11-12', description: 'Wegen Kontrolle' }, TODAY)
    renderWithGame(<QuestsPage />, { route: '/quests?tab=nebenquests' })
    await user.click(await screen.findByRole('button', { name: '„Zahnarzt anrufen“ bearbeiten' }))
    const dialog = await screen.findByRole('dialog', { name: 'Nebenquest bearbeiten' })
    expect(within(dialog).getByRole('button', { name: 'Ohne Termin' })).toHaveAttribute('aria-pressed', 'false')
    const title = within(dialog).getByRole('textbox', { name: /Titel/ })
    await user.clear(title)
    await user.type(title, 'Zahnarzttermin machen')
    await user.click(within(dialog).getByRole('button', { name: 'Ohne Termin' }))
    await user.click(within(dialog).getByRole('button', { name: 'Speichern' }))

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    const saved = await sideQuestByTitle('Zahnarzttermin machen')
    expect(saved?.dueDay).toBeUndefined()
    expect(saved?.description).toBe('Wegen Kontrolle')
    expect(await screen.findByText('Nebenquest gespeichert')).toBeInTheDocument()
  })

  it('warnt beim Löschen einer erledigten Nebenquest vor dem XP-Verlust', async () => {
    const user = userEvent.setup()
    const taxes = await createSideQuest(TAXES, '2026-10-20')
    await completeSideQuest(taxes.id, TODAY)
    renderWithGame(<QuestsPage />, { route: '/quests?tab=nebenquests' })

    await user.click(await screen.findByRole('button', { name: '„Steuererklärung abgeben“ bearbeiten' }))
    const dialog = await screen.findByRole('dialog', { name: 'Nebenquest bearbeiten' })
    // Schwierigkeit einer erledigten ändern: Hinweis auf die geänderten XP.
    await user.click(within(dialog).getByRole('radio', { name: 'Mittel' }))
    expect(within(dialog).getByText('Schon erledigt – ihre XP ändern sich von 40 auf 20.')).toBeInTheDocument()

    await user.click(within(dialog).getByRole('button', { name: 'Löschen' }))
    const confirm = await screen.findByRole('alertdialog', { name: 'Nebenquest löschen?' })
    expect(confirm).toHaveTextContent(
      '„Steuererklärung abgeben“ ist bereits erledigt. Mit dem Löschen verlierst du ihre 40 XP und 20 Gold.',
    )
    expect(within(confirm).getByRole('button', { name: 'Abbrechen' })).toHaveFocus()
    await user.click(within(confirm).getByRole('button', { name: 'Löschen' }))

    await waitFor(async () => expect(await sideQuestByTitle('Steuererklärung abgeben')).toBeUndefined())
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(await screen.findByText('Nebenquest gelöscht')).toBeInTheDocument()
    // Letzte Nebenquest weg → leerer Zustand, der Fokus landet auf „Neue Nebenquest“.
    await waitFor(() => expect(screen.getByRole('button', { name: 'Neue Nebenquest' })).toHaveFocus())
  })

  it('löscht eine offene Nebenquest ohne XP-Verlust', async () => {
    const user = userEvent.setup()
    await createSideQuest(DENTIST, TODAY)
    await createSideQuest(TAXES, TODAY)
    renderWithGame(<QuestsPage />, { route: '/quests?tab=nebenquests' })
    await user.click(await screen.findByRole('button', { name: '„Zahnarzt anrufen“ bearbeiten' }))
    await user.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Löschen' }))
    const confirm = await screen.findByRole('alertdialog', { name: 'Nebenquest löschen?' })
    expect(confirm).toHaveTextContent('Deine XP und dein Gold bleiben unverändert.')
    await user.click(within(confirm).getByRole('button', { name: 'Löschen' }))
    await waitFor(() => expect(screen.queryByRole('listitem', { name: 'Zahnarzt anrufen' })).not.toBeInTheDocument())
    await waitFor(() => expect(screen.getByRole('button', { name: 'Neue Nebenquest' })).toHaveFocus())
  })
})
