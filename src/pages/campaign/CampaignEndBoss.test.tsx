// @vitest-environment jsdom
import 'fake-indexeddb/auto'
import { cleanup, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MotionGlobalConfig } from 'motion/react'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { createMainQuest, resetAllData, saveProfile } from '../../data/repository'
import type { MainQuestDraft } from '../../data/repository'
import type { Chapter } from '../../domain/types'
import { renderWithGame } from '../../test/renderWithGame'
import { CampaignPage } from '../CampaignPage'

const FIRST: Chapter = { id: 'first', title: 'Das erste Buch', criterion: { type: 'manual' } }
const SECOND: Chapter = { id: 'second', title: 'Zehn Seiten am Tag', criterion: { type: 'manual' } }
const FINALE: Chapter = {
  id: 'finale',
  title: 'Der Gelehrte',
  criterion: { type: 'counter', target: 3, label: 'Bücher beendet' },
}

function scholar(chapters: Chapter[], patch: Partial<MainQuestDraft> = {}): MainQuestDraft {
  return {
    title: 'Der Weg des Gelehrten',
    icon: '📚',
    why: '',
    reward: 'Ein neues Bücherregal',
    startDay: '2026-10-01',
    chapters,
    blueprint: { id: 'scholar', level: 'beginner' },
    ...patch,
  }
}

beforeAll(() => {
  MotionGlobalConfig.skipAnimations = true
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date(2026, 10, 5, 12, 0, 0))
})
afterAll(() => {
  vi.useRealTimers()
})
beforeEach(async () => {
  await resetAllData()
  await saveProfile({ name: 'Aria', avatar: '🧙', createdDay: '2026-10-01' })
})
afterEach(cleanup)

async function renderPage() {
  const user = userEvent.setup()
  const view = renderWithGame(<CampaignPage />, { route: '/kampagne' })
  await screen.findByRole('heading', { level: 1, name: 'Kampagne' })
  return { user, ...view }
}

function endBossArticle(): HTMLElement {
  const article = document.querySelector<HTMLElement>('article[data-end-boss]')
  if (article === null) throw new Error('Kein Endgegner')
  return article
}

function hint(): HTMLElement {
  const element = document.querySelector<HTMLElement>('[data-end-boss-hint]')
  if (element === null) throw new Error('Kein Endgegner-Hinweis')
  return element
}

describe('Kampagne – Endgegner (letztes Kapitel)', () => {
  it('schläft, solange andere Kapitel offen sind, erwacht danach und fällt mit dem letzten Kapitel', async () => {
    await createMainQuest(scholar([FIRST, SECOND, FINALE]))
    const { user } = await renderPage()

    // Kopf: wer am Ende wartet.
    expect(hint()).toHaveTextContent('Endgegner: Der Bibliothekar der Ewigkeit · schläft noch')
    expect(hint()).toHaveAttribute('data-end-boss-hint', 'asleep')

    // Zeitleiste: nur das letzte Kapitel ist der Endgegner.
    expect(document.querySelectorAll('article[data-end-boss]')).toHaveLength(1)
    const boss = endBossArticle()
    expect(boss).toHaveAttribute('data-end-boss', 'end-scholar')
    expect(boss).toHaveAttribute('data-end-boss-phase', 'asleep')
    expect(within(boss).getByRole('heading', { name: 'Der Gelehrte' })).toBeInTheDocument()
    expect(boss).toHaveTextContent('Kapitel 3 · Endgegner')
    expect(within(boss).getByText('Schläft')).toBeInTheDocument()
    expect(within(boss).getByText('Schläft noch – erwacht, sobald deine übrigen 2 Kapitel geschafft sind.')).toBeInTheDocument()
    const hp = within(boss).getByRole('progressbar', { name: 'Lebenspunkte: Der Bibliothekar der Ewigkeit' })
    expect(hp).toHaveAttribute('aria-valuenow', '100')
    expect(hp).toHaveAttribute('aria-valuetext', 'noch 3 von 3 Lebenspunkten')
    // Der Lebensbalken ersetzt den Fortschrittsbalken des Kapitels – die Zähler bleiben bedienbar.
    expect(within(boss).queryByRole('progressbar', { name: 'Fortschritt: Der Gelehrte' })).not.toBeInTheDocument()
    expect(within(boss).getByRole('button', { name: 'Bücher beendet erhöhen' })).toBeInTheDocument()

    // Ein Treffer schon im Schlaf zählt.
    await user.click(within(boss).getByRole('button', { name: 'Bücher beendet erhöhen' }))
    await waitFor(() => expect(hp).toHaveAttribute('aria-valuetext', 'noch 2 von 3 Lebenspunkten'))

    // Die übrigen Kapitel abhaken → er erwacht.
    for (const button of screen.getAllByRole('button', { name: 'Als erledigt markieren' })) await user.click(button)
    await waitFor(() => expect(endBossArticle()).toHaveAttribute('data-end-boss-phase', 'awakened'))
    expect(within(endBossArticle()).getByText('Erwacht')).toBeInTheDocument()
    expect(within(endBossArticle()).getByText(/^Erwacht! Zwischen Regalen/)).toBeInTheDocument()
    expect(hint()).toHaveTextContent('Endgegner: Der Bibliothekar der Ewigkeit · ist erwacht')

    // Die letzten Bücher → besiegt.
    await user.click(within(endBossArticle()).getByRole('button', { name: 'Bücher beendet erhöhen' }))
    await user.click(within(endBossArticle()).getByRole('button', { name: 'Bücher beendet erhöhen' }))
    await waitFor(() => expect(endBossArticle()).toHaveAttribute('data-end-boss-phase', 'defeated'))
    const defeated = endBossArticle()
    expect(within(defeated).getByText('Besiegt am 5. Nov.')).toBeInTheDocument()
    expect(within(defeated).getByText(/^„Der Bibliothekar der Ewigkeit verneigt sich/)).toBeInTheDocument()
    expect(within(defeated).queryByRole('progressbar', { name: /^Lebenspunkte/ })).not.toBeInTheDocument()
    expect(hint()).toHaveTextContent('Endgegner: Der Bibliothekar der Ewigkeit · besiegt')
  })

  it('ist bei einem einzigen Kapitel sofort wach; eigene Kampagnen haben den allgemeinen Endgegner', async () => {
    await createMainQuest(scholar([FIRST], { title: 'Mein Projekt', icon: '🪓', blueprint: undefined }))
    const { user } = await renderPage()
    const boss = endBossArticle()
    expect(boss).toHaveAttribute('data-end-boss', 'end-custom')
    expect(boss).toHaveAttribute('data-end-boss-phase', 'awakened')
    expect(hint()).toHaveTextContent('Endgegner: Der Schatten des Zweifels · ist erwacht')
    // Manuelles Kapitel: keine Zahl, nur unbesiegt/besiegt.
    expect(within(boss).getByRole('progressbar', { name: 'Lebenspunkte: Der Schatten des Zweifels' })).toHaveAttribute(
      'aria-valuetext',
      'unbesiegt – ein Haken genügt',
    )
    await user.click(within(boss).getByRole('button', { name: 'Als erledigt markieren' }))
    await waitFor(() => expect(endBossArticle()).toHaveAttribute('data-end-boss-phase', 'defeated'))
    // Rückgängig bleibt möglich – der Endgegner steht dann wieder.
    await user.click(within(endBossArticle()).getByRole('button', { name: 'Rückgängig' }))
    await waitFor(() => expect(endBossArticle()).toHaveAttribute('data-end-boss-phase', 'awakened'))
  })

  it('zeigt ohne Kapitel keinen Endgegner', async () => {
    await createMainQuest(scholar([], { title: 'Noch leer' }))
    await renderPage()
    expect(document.querySelector('[data-end-boss-hint]')).toBeNull()
    expect(document.querySelector('article[data-end-boss]')).toBeNull()
  })
})
