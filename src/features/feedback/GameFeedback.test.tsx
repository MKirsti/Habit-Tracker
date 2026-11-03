// @vitest-environment jsdom
import 'fake-indexeddb/auto'
import { cleanup, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MotionGlobalConfig } from 'motion/react'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { useGameContext } from '../../app/gameContext'
import { createBackup, restoreBackup } from '../../data/backup'
import {
  createHabit,
  createMainQuest,
  resetAllData,
  saveProfile,
  setChapterCounter,
  setCompletionValue,
  updateSettings,
} from '../../data/repository'
import type { HabitDraft } from '../../data/repository'
import type { DayKey } from '../../domain/types'
import { renderWithGame } from '../../test/renderWithGame'
import { GameFeedback } from './GameFeedback'

/** Dienstag, 3. November 2026, 12:00 Uhr → Spieltag 2026-11-03. */
const TODAY: DayKey = '2026-11-03'

const TRAINING: HabitDraft = {
  title: 'Krafttraining',
  icon: '🏋️',
  attribute: 'strength',
  difficulty: 'epic',
  schedule: { type: 'daily' },
}
const READING: HabitDraft = {
  title: 'Lesen',
  icon: '📖',
  attribute: 'intellect',
  difficulty: 'epic',
  schedule: { type: 'daily' },
}

beforeAll(() => {
  MotionGlobalConfig.skipAnimations = true
  // Nur die Uhr anhalten – Timer (IndexedDB, Toasts) laufen normal weiter.
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date(2026, 10, 3, 12, 0, 0))
})
afterAll(() => {
  vi.useRealTimers()
})
beforeEach(async () => {
  await resetAllData()
  await saveProfile({ name: 'Aria', avatar: '🧙', createdDay: '2026-11-01' })
})
afterEach(cleanup)

/** Zeigt das aktuelle Level – damit der Test weiß, wann ein neuer Zustand angekommen ist. */
function LevelProbe() {
  const { state } = useGameContext()
  return <p data-testid="level">Level {state.level.level}</p>
}

async function renderFeedback() {
  const view = renderWithGame(
    <>
      <GameFeedback />
      <LevelProbe />
    </>,
  )
  await screen.findByTestId('level')
  return view
}

describe('GameFeedback', () => {
  it('zeigt XP-Toasts und nach dem Überschreiten der Schwelle die Level-Up-Szene', async () => {
    const training = await createHabit(TRAINING, TODAY)
    const reading = await createHabit(READING, TODAY)
    await renderFeedback()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()

    // 80 XP → noch Level 1: nur Toasts (XP + Attribut).
    await setCompletionValue(training.id, TODAY, 1)
    expect(await screen.findByText('+80 XP')).toBeInTheDocument()
    expect(screen.getByText('Krafttraining')).toBeInTheDocument()
    expect(await screen.findByText('Stärke steigt auf Stufe 2')).toBeInTheDocument()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()

    // +80 XP + Perfekter Tag (+40) → 200 XP → Level 2.
    await setCompletionValue(reading.id, TODAY, 1)
    const dialog = await screen.findByRole('dialog', { name: 'Level 2 erreicht!' })
    expect(dialog).toHaveAttribute('aria-modal', 'true')
    expect(within(dialog).getByRole('progressbar', { name: 'Erfahrung' })).toHaveAttribute(
      'aria-valuetext',
      '100 von 283 XP bis Level 3',
    )
    expect(within(dialog).getByText('Nur noch 1 Level bis zum Rang Lehrling')).toBeInTheDocument()
    await waitFor(() => expect(within(dialog).getByRole('button', { name: 'Weiter' })).toHaveFocus())
    // Volle Effekte: Konfetti fliegt.
    expect(document.querySelector('[data-confetti]')).not.toBeNull()

    // Esc schließt die Szene; der Perfekte Tag kommt danach (nicht unsichtbar hinter der Szene).
    await userEvent.keyboard('{Escape}')
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(await screen.findByText('Perfekter Tag! +40 Bonus-XP')).toBeInTheDocument()
  })

  it('zeigt Toasts, die mit einer Feier-Szene kommen, erst nach der Szene', async () => {
    const training = await createHabit(TRAINING, TODAY)
    await renderFeedback()

    // 80 XP + Perfekter Tag (+20) → genau 100 XP → Level 2, Stärke steigt auf Stufe 2.
    await setCompletionValue(training.id, TODAY, 1)
    const dialog = await screen.findByRole('dialog', { name: 'Level 2 erreicht!' })
    // Hinter der Szene würden die Toasts ungesehen ablaufen.
    expect(screen.queryByText('+80 XP')).not.toBeInTheDocument()
    expect(screen.queryByText('Perfekter Tag! +20 Bonus-XP')).not.toBeInTheDocument()
    expect(screen.queryByText('Stärke steigt auf Stufe 2')).not.toBeInTheDocument()

    await userEvent.setup().click(within(dialog).getByRole('button', { name: 'Weiter' }))
    expect(await screen.findByText('+80 XP')).toBeInTheDocument()
    expect(screen.getByText('Krafttraining')).toBeInTheDocument()
    expect(screen.getByText('Perfekter Tag! +20 Bonus-XP')).toBeInTheDocument()
    expect(screen.getByText('Stärke steigt auf Stufe 2')).toBeInTheDocument()
  })

  it('feiert denselben Level nach Haken entfernen und wieder setzen nicht erneut', async () => {
    const training = await createHabit(TRAINING, TODAY)
    await renderFeedback()

    await setCompletionValue(training.id, TODAY, 1)
    await screen.findByRole('dialog', { name: 'Level 2 erreicht!' })
    await userEvent.keyboard('{Escape}')
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())

    // Versehentlich entfernt und wieder abgehakt: kein zweites „Level 2 erreicht!“.
    await setCompletionValue(training.id, TODAY, 0)
    await waitFor(() => expect(screen.getByTestId('level')).toHaveTextContent('Level 1'))
    await setCompletionValue(training.id, TODAY, 1)
    await waitFor(() => expect(screen.getByTestId('level')).toHaveTextContent('Level 2'))
    await new Promise((resolve) => setTimeout(resolve, 50))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('zieht eine Szene zurück, deren Level-Up sofort rückgängig gemacht wurde (schnelles Doppeltippen)', async () => {
    const training = await createHabit(TRAINING, TODAY)
    await renderFeedback()

    await setCompletionValue(training.id, TODAY, 1)
    await screen.findByRole('dialog', { name: 'Level 2 erreicht!' })
    await setCompletionValue(training.id, TODAY, 0)
    await waitFor(() => expect(screen.getByTestId('level')).toHaveTextContent('Level 1'))
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    // Nichts davon ist mehr wahr – auch die zurückgehaltenen Toasts erscheinen nicht.
    await new Promise((resolve) => setTimeout(resolve, 50))
    expect(screen.queryByText('+80 XP')).not.toBeInTheDocument()
    expect(screen.queryByText('Perfekter Tag! +20 Bonus-XP')).not.toBeInTheDocument()

    // Wird der Level danach wirklich erreicht, gibt es die Szene (sie wurde ja nie gesehen).
    await setCompletionValue(training.id, TODAY, 1)
    expect(await screen.findByRole('dialog', { name: 'Level 2 erreicht!' })).toBeInTheDocument()
  })

  it('nimmt Toasts zurück, die nach dem Rückgängigmachen nicht mehr stimmen', async () => {
    const meditation = await createHabit({ ...READING, title: 'Meditieren', icon: '🧘', difficulty: 'easy' }, TODAY)
    const stretching = await createHabit({ ...TRAINING, title: 'Dehnen', icon: '🤸', difficulty: 'easy' }, TODAY)
    await renderFeedback()

    await setCompletionValue(meditation.id, TODAY, 1)
    expect(await screen.findByText('+10 XP')).toBeInTheDocument()
    // Nach dem Zusammenfass-Fenster: eigener Toast für die zweite Quest.
    await new Promise((resolve) => setTimeout(resolve, 1300))
    await setCompletionValue(stretching.id, TODAY, 1)
    expect(await screen.findByText('Perfekter Tag! +5 Bonus-XP')).toBeInTheDocument()
    expect(screen.getByText('Dehnen')).toBeInTheDocument()

    // Haken bei „Dehnen“ entfernt: Perfekter Tag und dessen XP-Toast stimmen nicht mehr.
    await setCompletionValue(stretching.id, TODAY, 0)
    await waitFor(() => expect(screen.queryByText('Perfekter Tag! +5 Bonus-XP')).not.toBeInTheDocument())
    expect(screen.queryByText('Dehnen')).not.toBeInTheDocument()
    // Der Toast für „Meditieren“ bleibt – die Quest ist ja weiterhin erledigt.
    expect(screen.getByText('Meditieren')).toBeInTheDocument()
  })

  it('zeigt Kampagne und Level-Up nacheinander, „Weiter“ schaltet zur nächsten Szene', async () => {
    const quest = await createMainQuest({
      title: 'Der Weg des Gelehrten',
      icon: '📚',
      why: 'Mehr wissen',
      reward: 'Ein Wochenende im Antiquariat',
      startDay: TODAY,
      chapters: [
        { id: 'books', title: 'Der erste Funke', criterion: { type: 'counter', target: 1, label: 'Bücher' } },
      ],
    })
    await renderFeedback()

    // Kapitel (+100) + Kampagne (+500) → 600 XP → Level 3 (Rang Lehrling).
    await setChapterCounter(quest.id, 'books', 1, TODAY)
    const campaign = await screen.findByRole('dialog', { name: 'Kampagne gemeistert!' })
    expect(within(campaign).getByText('Ein Wochenende im Antiquariat')).toBeInTheDocument()
    expect(within(campaign).getByText('Der Weg des Gelehrten')).toBeInTheDocument()
    // Der Kapitel-Toast wartet, bis alle Szenen gesehen sind.
    expect(screen.queryByText('Kapitel abgeschlossen: Der erste Funke · +100 XP')).not.toBeInTheDocument()

    const user = userEvent.setup()
    await user.click(within(campaign).getByRole('button', { name: 'Weiter' }))
    const levelUp = await screen.findByRole('dialog', { name: 'Level 3 erreicht!' })
    expect(within(levelUp).getByText('Lehrling')).toBeInTheDocument()
    expect(within(levelUp).getByText('+2 Level auf einmal')).toBeInTheDocument()
    expect(screen.queryByRole('dialog', { name: 'Kampagne gemeistert!' })).not.toBeInTheDocument()

    await user.click(within(levelUp).getByRole('button', { name: 'Weiter' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(await screen.findByText('Kapitel abgeschlossen: Der erste Funke · +100 XP')).toBeInTheDocument()
  })

  it('zeigt die Szene ohne Effekte schlicht – ohne Konfetti', async () => {
    await updateSettings({ effects: false })
    const training = await createHabit(TRAINING, TODAY)
    const reading = await createHabit(READING, TODAY)
    await renderFeedback()

    await setCompletionValue(training.id, TODAY, 1)
    await setCompletionValue(reading.id, TODAY, 1)
    expect(await screen.findByRole('dialog', { name: 'Level 2 erreicht!' })).toBeInTheDocument()
    expect(document.querySelector('[data-confetti]')).toBeNull()
  })

  it('räumt seine Toasts weg, wenn das Profil gelöscht wird (Onboarding)', async () => {
    const training = await createHabit(TRAINING, TODAY)
    await createHabit(READING, TODAY) // noch offen → kein Perfekter Tag, kein Level-Up
    // Wie ProfileGate in App.tsx: ohne Profil kein GameFeedback.
    function Gate() {
      const { data } = useGameContext()
      return data.profile ? <GameFeedback /> : null
    }
    renderWithGame(
      <>
        <Gate />
        <LevelProbe />
      </>,
    )
    await screen.findByTestId('level')
    await setCompletionValue(training.id, TODAY, 1)
    expect(await screen.findByText('+80 XP')).toBeInTheDocument()

    await resetAllData()
    await waitFor(() => expect(screen.queryByText('+80 XP')).not.toBeInTheDocument())
  })

  it('bleibt beim Start und bei Massenänderungen (Backup) stumm', async () => {
    // Bestehender Spielstand mit Level 2 → beim Start keine Feier.
    const training = await createHabit(TRAINING, '2026-10-20')
    for (const day of ['2026-10-28', '2026-10-29', '2026-10-30', '2026-10-31', '2026-11-01']) {
      await setCompletionValue(training.id, day, 1)
    }
    const backup = await createBackup()
    await setCompletionValue(training.id, '2026-11-01', 0)
    await setCompletionValue(training.id, '2026-10-31', 0)
    await setCompletionValue(training.id, '2026-10-30', 0)
    await setCompletionValue(training.id, '2026-10-29', 0)

    await renderFeedback()
    expect(screen.getByTestId('level')).toHaveTextContent('Level 2')
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()

    // Wiederherstellung bringt 4 Erledigungen auf einmal zurück → Level 3, aber keine Rückmeldung.
    await restoreBackup(backup)
    await waitFor(() => expect(screen.getByTestId('level')).toHaveTextContent('Level 3'))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(screen.queryByText(/XP$/)).not.toBeInTheDocument()
  })
})
