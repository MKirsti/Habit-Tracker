// @vitest-environment jsdom
import 'fake-indexeddb/auto'
import { cleanup, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MotionGlobalConfig } from 'motion/react'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { useGameContext } from '../../app/gameContext'
import {
  addRestPeriod,
  createHabit,
  markCombatIntroSeen,
  recordProgress,
  resetAllData,
  saveProfile,
  setCompletionValue,
  updateSettings,
} from '../../data/repository'
import type { HabitDraft } from '../../data/repository'
import type { DayKey, GrammaticalForm } from '../../domain/types'
import { renderWithGame } from '../../test/renderWithGame'
import type { ClassSceneStore } from './combatFeedback'
import { GameFeedback } from './GameFeedback'

// Feste IDs: Ob eine erledigte Quest eine Truhe abwirft, hängt (deterministisch) an der ID ihrer Erledigung – mit
// zufälligen IDs käme in jedem zehnten Lauf ein zusätzlicher Toast „Truhe gefunden“ dazu.
vi.mock('../../data/ids', () => {
  let next = 0
  return { newId: () => `test-id-${(next += 1)}` }
})

/** Mittwoch, 4. November 2026 → Woche ab Montag, 2. November. */
const TODAY: DayKey = '2026-11-04'
const MONDAY: DayKey = '2026-11-02'
const TUESDAY: DayKey = '2026-11-03'

const STRENGTH: HabitDraft = { title: 'Krafttraining', icon: '🏋️', attribute: 'strength', difficulty: 'epic', schedule: { type: 'daily' } }
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
  await updateSettings({ effects: false })
})
afterEach(() => {
  cleanup()
})

function memoryStore(): ClassSceneStore & { seen: Map<string, DayKey> } {
  const seen = new Map<string, DayKey>()
  return { seen, get: (hero) => seen.get(hero), set: (hero, week) => void seen.set(hero, week) }
}

/** Zeigt den Stand des Wochen-Bosses – damit der Test weiß, wann ein neuer Zustand angekommen ist. */
function BossProbe() {
  const { state } = useGameContext()
  const boss = state.bosses.current
  return <p data-testid="boss">{boss ? `${boss.boss.name}:${boss.hp}/${boss.maxHp}:${boss.defeated}` : 'kein Boss'}</p>
}

async function renderFeedback(store: ClassSceneStore = memoryStore()) {
  renderWithGame(
    <>
      <GameFeedback classScenes={store} />
      <BossProbe />
    </>,
  )
  await screen.findByTestId('boss')
}

/**
 * Ein Held, dessen Wochen-Boss mit dem heutigen Krafttraining fällt: Donnerstag bis Sonntag Urlaub (geplant sind nur
 * Mo–Mi: 3 × 80 Krafttraining + 3 × 10 Lesen = 270 Schaden → 189 HP), Mo und Di schon trainiert (160 Schaden).
 */
async function heroBeforeVictory(form?: GrammaticalForm) {
  await saveProfile({ name: 'Aria', avatar: '🧙', createdDay: '2026-10-20', ...(form ? { form } : {}) })
  const training = await createHabit(STRENGTH, '2026-10-20')
  const reading = await createHabit(READING, '2026-10-20')
  await addRestPeriod({ from: '2026-11-05', until: '2026-11-08' }, TODAY)
  await setCompletionValue(training.id, MONDAY, 1)
  await setCompletionValue(training.id, TUESDAY, 1)
  return { training, reading }
}

describe('GameFeedback – Boss besiegt', () => {
  it('zeigt die Siegesszene mit Truhe; „Öffnen“ öffnet den Truhen-Dialog über der Szene', async () => {
    const { training } = await heroBeforeVictory()
    await renderFeedback()
    await waitFor(() => expect(screen.getByTestId('boss').textContent).toMatch(/:29\/189:false$/))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()

    await setCompletionValue(training.id, TODAY, 1)
    const scene = await screen.findByRole('dialog', { name: /ist besiegt!$/ })
    const bossName = screen.getByTestId('boss').textContent?.split(':')[0] ?? ''
    expect(scene).toHaveAccessibleName(`${bossName} ist besiegt!`)
    expect(scene).toHaveTextContent('Boss besiegt')
    expect(scene).toHaveTextContent('189 HP bezwungen')
    expect(scene).toHaveTextContent('Truhe gefunden')
    expect(scene).toHaveTextContent('Du kannst sie auch später in deiner Sammlung öffnen.')

    const open = within(scene).getByRole('button', { name: /Truhe öffnen$/ })
    await waitFor(() => expect(open).toHaveFocus())
    const user = userEvent.setup()
    await user.click(open)

    const chestDialog = await screen.findByRole('dialog', { name: /Truhe$/ })
    expect(chestDialog).toHaveTextContent('Boss-Truhe')
    expect(chestDialog).toHaveTextContent(`${bossName} besiegt`)
    await user.click(within(chestDialog).getByRole('button', { name: 'Truhe öffnen' }))
    const next = await within(chestDialog).findByRole('button', { name: 'Weiter' })
    await user.click(next)
    await waitFor(() => expect(screen.queryByRole('dialog', { name: /Truhe$/ })).not.toBeInTheDocument())

    // Zurück in der Szene: Die Truhe zeigt ihren Inhalt, der Fokus liegt auf „Weiter“.
    await waitFor(() => expect(scene.querySelector('[data-victory-chest-content]')).toHaveTextContent(/^Geöffnet: /))
    const continueButton = within(scene).getByRole('button', { name: 'Weiter' })
    await waitFor(() => expect(continueButton).toHaveFocus())
    await user.click(continueButton)
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())

    // Haken weg und wieder dran: Der Sieg wird nicht noch einmal gefeiert.
    await setCompletionValue(training.id, TODAY, 0)
    await waitFor(() => expect(screen.getByTestId('boss').textContent).toMatch(/:false$/))
    await setCompletionValue(training.id, TODAY, 1)
    await waitFor(() => expect(screen.getByTestId('boss').textContent).toMatch(/:true$/))
    expect(screen.queryByRole('dialog', { name: /ist besiegt!$/ })).not.toBeInTheDocument()
  })

  it('bleibt still, wenn der Boss schon beim Start besiegt ist', async () => {
    const { training } = await heroBeforeVictory()
    await setCompletionValue(training.id, TODAY, 1)
    await renderFeedback()
    await waitFor(() => expect(screen.getByTestId('boss').textContent).toMatch(/:true$/))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })
})

describe('GameFeedback – Truhe gefunden', () => {
  it('meldet eine neue Quest-Truhe mit Seltenheit und Quest', async () => {
    const { reading } = await heroBeforeVictory()
    await renderFeedback()
    await recordProgress({
      chests: [
        {
          id: `quest:${reading.id}:${TODAY}`,
          source: 'quest',
          foundDay: TODAY,
          rarity: 'rare',
          content: { kind: 'gold', amount: 100 },
        },
      ],
    })
    expect(await screen.findByText('Truhe gefunden!')).toBeInTheDocument()
    expect(screen.getByText('Seltene Truhe · 📖 Lesen – öffne sie in deiner Sammlung.')).toBeInTheDocument()
    expect(document.querySelector('[data-chest-toast="rare"]')).not.toBeNull()
  })
})

describe('GameFeedback – Klassenwechsel', () => {
  /**
   * Intelligenz erreicht bis Sonntag, 18. Oktober Level 3 (Magierin), Weisheit holt bis Sonntag, 1. November auf Level 3
   * auf → ab Montag Erzmagierin (die normale Ermittlung ergibt eine Hybridklasse mit Intelligenz – die entsteht trotz
   * Klassen-Trägheit, Nachbesserung 3a).
   */
  async function heroWhoAscends(form: GrammaticalForm) {
    await saveProfile({ name: 'Aria', avatar: '🧙', createdDay: '2026-10-01', form })
    const study = await createHabit({ ...READING, title: 'Studieren', difficulty: 'epic', schedule: { type: 'weekly', times: 2 } }, '2026-10-10')
    const meditate = await createHabit(
      { title: 'Meditieren', icon: '🧘', attribute: 'wisdom', difficulty: 'epic', schedule: { type: 'weekly', times: 2 } },
      '2026-10-10',
    )
    await setCompletionValue(study.id, '2026-10-12', 1)
    await setCompletionValue(study.id, '2026-10-13', 1)
    await setCompletionValue(meditate.id, '2026-10-27', 1)
    await setCompletionValue(meditate.id, '2026-10-28', 1)
  }

  it('zeigt zu Wochenbeginn „Du bist zur Erzmagierin aufgestiegen!“ – einmal je Woche', async () => {
    await heroWhoAscends('female')
    await markCombatIntroSeen()
    const store = memoryStore()
    await renderFeedback(store)

    const scene = await screen.findByRole('dialog', { name: 'Du bist zur Erzmagierin aufgestiegen!' })
    expect(scene).toHaveTextContent('Klassenaufstieg')
    expect(scene).toHaveTextContent('Bisher Magierin, jetzt Erzmagierin.')
    expect(within(scene).getByRole('list', { name: 'Klassen-Bonus' })).toHaveTextContent(/\+10\s%\sArkaner Blitz/)
    expect(store.seen.size).toBe(1)

    const user = userEvent.setup()
    await user.click(within(scene).getByRole('button', { name: 'Weiter' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())

    // Neu geladen (gleiches Gerät): keine zweite Szene.
    cleanup()
    await renderFeedback(store)
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('spricht neutral: „Du bist zum Sternengeist aufgestiegen!“', async () => {
    await heroWhoAscends('neutral')
    await markCombatIntroSeen()
    await renderFeedback()
    expect(await screen.findByRole('dialog', { name: 'Du bist zum Sternengeist aufgestiegen!' })).toHaveTextContent(
      'Bisher Arkane Seele, jetzt Sternengeist.',
    )
  })

  it('bleibt vor der Einführung still und merkt sich die Woche als gesehen', async () => {
    await heroWhoAscends('male')
    const store = memoryStore()
    await renderFeedback(store)
    await waitFor(() => expect(store.seen.size).toBe(1))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })
})
