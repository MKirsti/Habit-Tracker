// @vitest-environment jsdom
import 'fake-indexeddb/auto'
import { cleanup, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MotionGlobalConfig } from 'motion/react'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { useGameContext } from '../../app/gameContext'
import {
  createHabit,
  createMainQuest,
  markCombatIntroSeen,
  markCompanionIntroSeen,
  resetAllData,
  saveProfile,
  setChapterManual,
  setCompanion,
  setCompletionValue,
  updateSettings,
} from '../../data/repository'
import type { HabitDraft } from '../../data/repository'
import { END_BOSSES } from '../../domain/combat/endBosses'
import { addDays, dayRange } from '../../domain/dates'
import type { DayKey } from '../../domain/types'
import { renderWithGame } from '../../test/renderWithGame'
import type { ClassSceneStore } from './combatFeedback'
import { GameFeedback } from './GameFeedback'

// Feste IDs: Truhen-Funde hängen (deterministisch) an den IDs der Erledigungen.
vi.mock('../../data/ids', () => {
  let next = 0
  return { newId: () => `test-id-${(next += 1)}` }
})

// Klang & Vibration: nur prüfen, dass im richtigen Moment gerufen wird (das Sound-Modul selbst testet sich selbst).
const sounds = vi.hoisted(() => ({ play: vi.fn(), vibrate: vi.fn() }))
vi.mock('../sound', () => ({ useGameSounds: () => sounds }))

/** Mittwoch, 4. November 2026. */
const TODAY: DayKey = '2026-11-04'
const START: DayKey = '2026-10-01'

const READING: HabitDraft = { title: 'Lesen', icon: '📖', attribute: 'intellect', difficulty: 'easy', schedule: { type: 'daily' } }

beforeAll(() => {
  MotionGlobalConfig.skipAnimations = true
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date(2026, 10, 4, 12, 0, 0))
})
afterAll(() => {
  vi.useRealTimers()
})
beforeEach(async () => {
  await resetAllData()
  window.localStorage.clear()
  sounds.play.mockClear()
  sounds.vibrate.mockClear()
  await saveProfile({ name: 'Aria', avatar: '🧙', createdDay: START })
  await updateSettings({ effects: false, hpIntroSeen: true })
  await markCombatIntroSeen()
  await markCompanionIntroSeen()
})
afterEach(() => {
  cleanup()
})

/** Klassenwechsel-Szenen gelten als gesehen – hier geht es um Gefährten und Endgegner. */
function seenClassScenes(): ClassSceneStore {
  return { get: () => '2099-12-28', set: () => {} }
}

/** Zeigt Stufe des Gefährten und Kampagnen-Stand – damit der Test weiß, wann ein neuer Zustand angekommen ist. */
function Probe() {
  const { state } = useGameContext()
  const campaign = state.mainQuests[0]
  return (
    <>
      <p data-testid="companion">{state.companion ? `${state.companion.choice.name}:${state.companion.stage}` : 'kein Gefährte'}</p>
      <p data-testid="campaign">{campaign ? `${campaign.chapters.filter((chapter) => chapter.done).length}:${campaign.complete}` : 'keine'}</p>
    </>
  )
}

async function renderFeedback() {
  renderWithGame(
    <>
      <GameFeedback classScenes={seenClassScenes()} />
      <Probe />
    </>,
  )
  await screen.findByTestId('companion')
}

describe('GameFeedback – Entwicklung des Gefährten', () => {
  it('zeigt die Entwicklungs-Szene, sobald der 14. aktive Tag die nächste Stufe bringt – mit Klang', async () => {
    const reading = await createHabit(READING, START)
    // 13 aktive Tage (21. Oktober bis 2. November), der gestrige Dienstag bleibt frei.
    for (const day of dayRange('2026-10-21', '2026-11-02')) await setCompletionValue(reading.id, day, 1)
    await setCompanion({ species: 'raccoon', name: 'Krümel' }, '2026-10-21')
    await renderFeedback()
    await waitFor(() => expect(screen.getByTestId('companion')).toHaveTextContent('Krümel:0'))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()

    await setCompletionValue(reading.id, TODAY, 1)
    const scene = await screen.findByRole('dialog', { name: 'Krümel ist gewachsen!' })
    expect(scene).toHaveTextContent('Dein Gefährte wächst')
    expect(scene).toHaveTextContent('Bisher Wuselwicht, jetzt Glitzerpfote.')
    expect(scene).toHaveTextContent('Stufe 2 von 4 · Gefährte')
    expect(scene).toHaveTextContent('Nächste Stufe in 46 aktiven Tagen.')
    expect(scene.querySelector('[data-evolve-to]')).toHaveTextContent('Glitzerpfote')
    // Der Klang folgt im Effekt nach dem Rendern der Szene – unter Last einen Moment später.
    await waitFor(() => expect(sounds.play).toHaveBeenCalledWith('evolve'))
    expect(sounds.vibrate).toHaveBeenCalled()

    // Weiter → gesehen; Haken weg und wieder dran bringt die Szene nicht noch einmal.
    const user = userEvent.setup()
    await user.click(within(scene).getByRole('button', { name: 'Weiter' }))
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Krümel ist gewachsen!' })).not.toBeInTheDocument())
    await setCompletionValue(reading.id, TODAY, 0)
    await waitFor(() => expect(screen.getByTestId('companion')).toHaveTextContent('Krümel:0'))
    await setCompletionValue(reading.id, TODAY, 1)
    await waitFor(() => expect(screen.getByTestId('companion')).toHaveTextContent('Krümel:1'))
    expect(screen.queryByRole('dialog', { name: 'Krümel ist gewachsen!' })).not.toBeInTheDocument()
  })

  it('verschwindet wieder, wenn der Haken sofort zurückgenommen wird', async () => {
    const reading = await createHabit(READING, START)
    for (const day of dayRange('2026-10-21', '2026-11-02')) await setCompletionValue(reading.id, day, 1)
    await setCompanion({ species: 'fox', name: 'Flink' }, '2026-10-21')
    await renderFeedback()
    await waitFor(() => expect(screen.getByTestId('companion')).toHaveTextContent('Flink:0'))

    await setCompletionValue(reading.id, TODAY, 1)
    await screen.findByRole('dialog', { name: 'Flink ist gewachsen!' })
    await setCompletionValue(reading.id, TODAY, 0)
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Flink ist gewachsen!' })).not.toBeInTheDocument())
  })

  it('bleibt beim ersten Laden still (die Stufe ist schon erreicht)', async () => {
    const reading = await createHabit(READING, START)
    for (const day of dayRange('2026-10-21', TODAY)) await setCompletionValue(reading.id, day, 1)
    await setCompanion({ species: 'fox', name: 'Flink' }, '2026-10-21')
    await renderFeedback()
    await waitFor(() => expect(screen.getByTestId('companion')).toHaveTextContent('Flink:1'))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(sounds.play).not.toHaveBeenCalled()
  })
})

describe('GameFeedback – Kampagnen-Endgegner', () => {
  async function campaignBeforeFinale() {
    const quest = await createMainQuest({
      title: 'Mein großes Ziel',
      icon: '🏔️',
      why: 'Weil ich es kann.',
      reward: 'Ein Wochenende am Meer',
      startDay: START,
      chapters: [
        { id: 'first', title: 'Der Anfang', criterion: { type: 'manual' } },
        { id: 'finale', title: 'Das Finale', criterion: { type: 'manual' } },
      ],
    })
    await setChapterManual(quest.id, 'first', true, addDays(TODAY, -1))
    return quest
  }

  it('zeigt die Endgegner-Siegesszene vor „Kampagne gemeistert“ – mit seiner Truhe statt einer Meldung', async () => {
    const quest = await campaignBeforeFinale()
    await renderFeedback()
    await waitFor(() => expect(screen.getByTestId('campaign')).toHaveTextContent('1:false'))

    await setChapterManual(quest.id, 'finale', true, TODAY)
    const boss = END_BOSSES.custom
    const scene = await screen.findByRole('dialog', { name: `${boss.name} ist besiegt!` })
    expect(scene).toHaveTextContent('Endgegner besiegt')
    expect(scene).toHaveTextContent('🏔️ Mein großes Ziel')
    expect(scene).toHaveTextContent(boss.defeatLine)
    expect(scene).toHaveTextContent('deine Kampagne ist gemeistert!')
    // Der Klang folgt im Effekt nach dem Rendern der Szene – unter Last einen Moment später.
    await waitFor(() => expect(sounds.play).toHaveBeenCalledWith('victory'))

    // Die Endgegner-Truhe liegt in der Szene (mit „Öffnen“) – keine zusätzliche Meldung „Truhe gefunden“.
    const chest = await within(scene).findByRole('button', { name: /Truhe öffnen$/ })
    await waitFor(() => expect(chest).toHaveFocus())
    expect(scene.querySelector('[data-victory-chest="campaign:' + quest.id + '"]')).not.toBeNull()
    expect(screen.queryByText('Truhe gefunden!')).not.toBeInTheDocument()

    const user = userEvent.setup()
    await user.click(within(scene).getByRole('button', { name: 'Weiter' }))
    const campaignScene = await screen.findByRole('dialog', { name: 'Kampagne gemeistert!' })
    expect(campaignScene).toHaveTextContent('Mein großes Ziel')
    // Der Klang folgt im Effekt nach dem Rendern der Szene – unter Last einen Moment später.
    await waitFor(() => expect(sounds.play).toHaveBeenCalledWith('achievement'))
  })

  it('zeigt den Endgegner auch, wenn sein Kapitel vor den anderen fällt – ohne Truhe, mit Ausblick', async () => {
    const quest = await createMainQuest({
      title: 'Mein großes Ziel',
      icon: '🏔️',
      why: 'Weil ich es kann.',
      reward: '',
      startDay: START,
      chapters: [
        { id: 'first', title: 'Der Anfang', criterion: { type: 'manual' } },
        { id: 'finale', title: 'Das Finale', criterion: { type: 'manual' } },
      ],
    })
    await renderFeedback()
    await waitFor(() => expect(screen.getByTestId('campaign')).toHaveTextContent('0:false'))

    await setChapterManual(quest.id, 'finale', true, TODAY)
    const scene = await screen.findByRole('dialog', { name: `${END_BOSSES.custom.name} ist besiegt!` })
    expect(scene).toHaveTextContent('Ein paar Kapitel warten noch')
    expect(within(scene).queryByRole('button', { name: /Truhe öffnen$/ })).not.toBeInTheDocument()
  })
})
