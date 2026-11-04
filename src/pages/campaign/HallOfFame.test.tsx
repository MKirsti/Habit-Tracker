// @vitest-environment jsdom
import 'fake-indexeddb/auto'
import { cleanup, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MotionGlobalConfig } from 'motion/react'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  archiveMainQuest,
  createHabit,
  createMainQuest,
  loadGameData,
  resetAllData,
  saveProfile,
  setCompletionValue,
} from '../../data/repository'
import type { HabitDraft, MainQuestDraft } from '../../data/repository'
import { ATTRIBUTES } from '../../domain/attributes'
import { hallOfFame } from '../../domain/hallOfFame'
import type { Chapter, DayKey } from '../../domain/types'
import { renderWithGame } from '../../test/renderWithGame'
import { CampaignPage } from '../CampaignPage'

/** Dienstag, 3. November 2026, 12:00 Uhr (Ortszeit) → Spieltag 2026-11-03. */
const TODAY: DayKey = '2026-11-03'

const READING: HabitDraft = {
  title: 'Lesen',
  icon: '📖',
  attribute: 'intellect',
  difficulty: 'medium',
  schedule: { type: 'daily' },
  measure: { target: 10, unit: 'Seiten' },
}

function campaign(chapters: Chapter[], patch: Partial<MainQuestDraft> = {}): MainQuestDraft {
  return {
    title: 'Halbmarathon',
    icon: '🏃',
    why: 'Ich will mir beweisen, dass ich durchhalte.',
    reward: 'Neue Laufschuhe',
    startDay: '2026-10-01',
    chapters,
    ...patch,
  }
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
  await saveProfile({ name: 'Aria', avatar: '🧙', createdDay: '2026-10-01' })
})
afterEach(cleanup)

async function renderPage() {
  const user = userEvent.setup()
  const view = renderWithGame(<CampaignPage />, { route: '/kampagne' })
  await screen.findByRole('heading', { level: 1, name: 'Kampagne' })
  return { user, ...view }
}

/**
 * Gemeisterte Kampagne „Leseratte“ (Start 20. Okt., Frist 31. Okt.): „Drei Tage“ Lesen (erreicht am 30. Okt.) und
 * ein abgehaktes Gelöbnis (28. Okt.). Gelesen wird am 28., 29., 30. und – nach dem Abschluss – am 31. Oktober.
 */
async function masteredCampaign(patch: Partial<MainQuestDraft> = {}) {
  const habit = await createHabit(READING, '2026-10-20')
  for (const day of ['2026-10-28', '2026-10-29', '2026-10-30', '2026-10-31']) await setCompletionValue(habit.id, day, 10)
  const quest = await createMainQuest(
    campaign(
      [
        { id: 'oath', title: 'Das Gelöbnis', criterion: { type: 'manual' }, manualDone: true, completedDay: '2026-10-28' },
        { id: 'three', title: 'Drei Tage', criterion: { type: 'habit', habitId: habit.id, metric: 'completions', target: 3 } },
      ],
      { title: 'Leseratte', icon: '🐭', startDay: '2026-10-20', deadline: '2026-10-31', reward: 'Ein neues Buch', ...patch },
    ),
  )
  return { habit, quest }
}

function hall() {
  return screen.getByRole('region', { name: /^Ruhmeshalle/ })
}

describe('Ruhmeshalle', () => {
  it('verewigt eine abgelegte Kampagne mit Bilanz, Belohnung und Chronik', async () => {
    const { quest } = await masteredCampaign()
    await archiveMainQuest(quest.id, TODAY)
    const [entry] = hallOfFame(await loadGameData(), TODAY)
    const { user } = await renderPage()

    const card = within(hall()).getByRole('listitem', { name: 'Leseratte' })
    expect(within(card).getByText('Gemeistert am 30. Okt.')).toBeInTheDocument()
    expect(within(card).getByText('Verewigt')).toBeInTheDocument()
    expect(within(card).getByText('Vor dem Zieldatum')).toBeInTheDocument()

    // Bilanz: 20. – 30. Oktober = 11 Tage, 2 Kapitel, 3 Quest-Tage (der 31. kam erst nach dem Abschluss).
    const stats = within(card).getAllByRole('definition').map((element) => element.textContent)
    expect(stats).toEqual(
      expect.arrayContaining(['11 Tage', '20. Okt. – 30. Okt.', '2', '3', 'mit 1 Quest', `+${entry.totalXp.toLocaleString('de-DE')} XP`]),
    )
    // 20 + 21 + 22 Quest-XP (Streak-Bonus) + 2 × 100 Kapitel + 500 Kampagne.
    expect(entry.totalXp).toBe(763)
    expect(within(card).getByText('davon 700 Bonus')).toBeInTheDocument()
    expect(within(card).getByText('Ein neues Buch')).toBeInTheDocument()

    // Die ganze Geschichte zum Aufklappen.
    await user.click(within(card).getByText('Chronik ansehen'))
    expect(within(card).getByText('Chronik ausblenden')).toBeInTheDocument()
    const chapters = within(card).getAllByRole('listitem').filter((item) => item.textContent?.startsWith('Kapitel'))
    expect(chapters.map((item) => item.textContent)).toEqual([
      'Kapitel 1: Das Gelöbnis · 28. Okt.',
      'Kapitel 2: Drei Tage · 30. Okt.',
    ])
    expect(within(card).getByText('3 Tage · 63 XP')).toBeInTheDocument()

    // Die Karte trägt die Farbe der Kampagne (Lesen → Intelligenz), die Meisterschaft bleibt golden.
    expect(card).toHaveAttribute('data-campaign-color', ATTRIBUTES.intellect.color)
  })

  it('zeigt auch frisch gemeisterte Kampagnen – die zuletzt gemeisterte zuerst', async () => {
    await masteredCampaign()
    await createMainQuest(
      campaign([{ id: 'm', title: 'Ziel erreicht', criterion: { type: 'manual' }, manualDone: true, completedDay: '2026-11-02' }], {
        title: 'Frühsport',
        icon: '🌅',
        reward: '',
      }),
    )
    await renderPage()
    const cards = within(hall()).getAllByRole('listitem').filter((item) => item.getAttribute('aria-labelledby'))
    expect(cards.map((card) => card.querySelector('h3')?.textContent)).toEqual(['Frühsport', 'Leseratte'])
    expect(within(cards[0]).getByText('Frisch gemeistert')).toBeInTheDocument()
    // Ohne Belohnung: freundlich statt leer – und ohne Frist kein Fristen-Abzeichen.
    expect(within(cards[0]).getByText('Ohne Belohnung angetreten – der Sieg selbst ist Lohn genug.')).toBeInTheDocument()
    expect(within(cards[0]).queryByText('Vor dem Zieldatum')).not.toBeInTheDocument()
    // Die Anzahl steht hinter dem Titel (vorgelesen „Ruhmeshalle – 2“).
    expect(screen.getByRole('region', { name: 'Ruhmeshalle – 2' })).toBeInTheDocument()
  })

  it('nennt eine verpasste Frist nicht – ein Sieg bleibt ein Sieg', async () => {
    await masteredCampaign({ deadline: '2026-10-25' })
    await renderPage()
    const card = within(hall()).getByRole('listitem', { name: 'Leseratte' })
    expect(within(card).queryByText(/Zieldatum|Frist|verspätet|überfällig/)).not.toBeInTheDocument()
  })

  it('lädt ohne gemeisterte Kampagne zum ersten Sieg ein – ganz ohne Kampagne fehlt sie', async () => {
    await createMainQuest(campaign([{ id: 'm', title: 'Offen', criterion: { type: 'manual' } }]))
    const { unmount } = await renderPage()
    expect(within(hall()).getByText(/Noch wartet die Halle auf ihren ersten Eintrag/)).toBeInTheDocument()
    expect(within(hall()).queryByRole('listitem')).not.toBeInTheDocument()
    unmount()

    await resetAllData()
    await saveProfile({ name: 'Aria', avatar: '🧙', createdDay: '2026-10-01' })
    await renderPage()
    expect(screen.queryByRole('region', { name: /^Ruhmeshalle/ })).not.toBeInTheDocument()
  })
})
