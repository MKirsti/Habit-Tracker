// @vitest-environment jsdom
import 'fake-indexeddb/auto'
import { cleanup, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MotionGlobalConfig } from 'motion/react'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { GameProvider } from '../../app/GameProvider'
import { useGameContext } from '../../app/gameContext'
import { createBackup, restoreBackup } from '../../data/backup'
import { db } from '../../data/db'
import {
  archiveHabit,
  createHabit,
  createMainQuest,
  resetAllData,
  saveProfile,
  setChapterCounter,
  setCompletionValue,
  updateSettings,
} from '../../data/repository'
import type { HabitDraft } from '../../data/repository'
import { ATTRIBUTES } from '../../domain/attributes'
import type { DayKey } from '../../domain/types'
import { renderWithGame } from '../../test/renderWithGame'
import { ToastProvider } from '../../ui'
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
afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

/** Zeigt das aktuelle Level – damit der Test weiß, wann ein neuer Zustand angekommen ist. */
function LevelProbe() {
  const { state } = useGameContext()
  return <p data-testid="level">Level {state.level.level}</p>
}

/** Tagesbilanz wie im Dashboard: „+N Bonus-XP“ und „Heute verdient“. */
function DayProbe() {
  const { state } = useGameContext()
  const { perfectBonusXp, questXp } = state.todayState
  return (
    <>
      <p data-testid="day-bonus">{perfectBonusXp}</p>
      <p data-testid="day-earned">{questXp + perfectBonusXp}</p>
    </>
  )
}

/** Mit Platz für viele Toasts (sonst fallen die ältesten heraus) und der Tagesbilanz. */
async function renderFeedbackWithDay() {
  render(
    <ToastProvider max={12}>
      <GameProvider>
        <GameFeedback />
        <LevelProbe />
        <DayProbe />
      </GameProvider>
    </ToastProvider>,
  )
  await screen.findByTestId('level')
}

/** Lässt für `GameFeedback` Zeit vergehen (Zusammenfass-Fenster, Toast-Dauer), ohne zu warten. */
function controllableClock() {
  const realNow = performance.now.bind(performance)
  let offset = 0
  vi.spyOn(performance, 'now').mockImplementation(() => realNow() + offset)
  return {
    skip(ms: number) {
      offset += ms
    },
  }
}

/** Summe aller sichtbaren XP-Toasts („+30 XP“). */
function visibleXpSum(): number {
  return screen
    .queryAllByText(/^\+[\d.]+ XP$/)
    .reduce((sum, element) => sum + Number((element.textContent ?? '').replace(/[^\d]/g, '')), 0)
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
    expect(await screen.findByText('Stärke steigt auf Level 2')).toBeInTheDocument()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()

    // +80 XP + Perfekter Tag (+40) → 200 XP → Level 2.
    await setCompletionValue(reading.id, TODAY, 1)
    const dialog = await screen.findByRole('dialog', { name: 'Level 2 erreicht!' })
    expect(dialog).toHaveAttribute('aria-modal', 'true')
    expect(within(dialog).getByText('Level-Aufstieg')).toBeInTheDocument()
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

    // 80 XP + Perfekter Tag (+20) → genau 100 XP → Level 2, Stärke steigt auf Level 2.
    await setCompletionValue(training.id, TODAY, 1)
    const dialog = await screen.findByRole('dialog', { name: 'Level 2 erreicht!' })
    // Hinter der Szene würden die Toasts ungesehen ablaufen.
    expect(screen.queryByText('+80 XP')).not.toBeInTheDocument()
    expect(screen.queryByText('Perfekter Tag! +20 Bonus-XP')).not.toBeInTheDocument()
    expect(screen.queryByText('Stärke steigt auf Level 2')).not.toBeInTheDocument()

    await userEvent.setup().click(within(dialog).getByRole('button', { name: 'Weiter' }))
    expect(await screen.findByText('+80 XP')).toBeInTheDocument()
    expect(screen.getByText('Krafttraining')).toBeInTheDocument()
    expect(screen.getByText('Perfekter Tag! +20 Bonus-XP')).toBeInTheDocument()
    expect(screen.getByText('Stärke steigt auf Level 2')).toBeInTheDocument()
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

  it('zeigt den Bonus des Perfekten Tages immer als Tagessumme – wie die Tagesbilanz', async () => {
    // Vorab 160 XP (Level 2) ohne Perfekte Tage, damit heute kein Level-Up die Toasts zurückhält.
    const filler = await createHabit(
      { title: 'Vorrat', icon: '💪', attribute: 'strength', difficulty: 'epic', schedule: { type: 'weekly', times: 1 } },
      '2026-10-20',
    )
    await setCompletionValue(filler.id, '2026-10-30', 1)
    await setCompletionValue(filler.id, '2026-10-31', 1)
    await archiveHabit(filler.id, TODAY)
    const quest = (title: string, icon: string, attribute: HabitDraft['attribute'], difficulty: HabitDraft['difficulty'], schedule: HabitDraft['schedule']) =>
      createHabit({ title, icon, attribute, difficulty, schedule }, TODAY)
    const reading = await quest('Lesen', '📖', 'intellect', 'medium', { type: 'daily' })
    const candle = await quest('Kerze', '🕯️', 'wisdom', 'medium', { type: 'daily' })
    const thought = await quest('Gedanke', '✍️', 'discipline', 'easy', { type: 'daily' })
    const deep = await quest('Tiefe', '⏳', 'charisma', 'hard', { type: 'weekly', times: 3 })
    const talk = await quest('Gespräch', '🗣️', 'vitality', 'medium', { type: 'weekly', times: 1 })
    await renderFeedbackWithDay()
    expect(screen.getByTestId('level')).toHaveTextContent('Level 2')

    const tick = async (id: string, earned: number) => {
      await setCompletionValue(id, TODAY, 1)
      await waitFor(() => expect(screen.getByTestId('day-earned')).toHaveTextContent(String(earned)))
    }
    await tick(reading.id, 20)
    await tick(candle.id, 40)
    // Perfekt: round(25 % × 50) = 13.
    await tick(thought.id, 63)
    expect(await screen.findByText('Perfekter Tag! +13 Bonus-XP')).toBeInTheDocument()
    // Wochenquests an einem perfekten Tag: derselbe Toast zeigt die neue Tagessumme.
    await tick(deep.id, 113)
    expect(await screen.findByText('Perfekter Tag! +23 Bonus-XP')).toBeInTheDocument()
    await waitFor(() => expect(screen.queryByText('Perfekter Tag! +13 Bonus-XP')).not.toBeInTheDocument())
    await tick(talk.id, 138)
    expect(await screen.findByText('Perfekter Tag! +28 Bonus-XP')).toBeInTheDocument()
    await waitFor(() => expect(screen.queryByText('Perfekter Tag! +23 Bonus-XP')).not.toBeInTheDocument())

    // Jede sichtbare Bonus-Zahl ist die der Tagesbilanz – kein „inkl. … Bonus-XP“ in XP-Toasts.
    expect(screen.getByTestId('day-bonus')).toHaveTextContent('28')
    await waitFor(() =>
      expect(screen.getAllByText(/Bonus-XP/).map((element) => element.textContent)).toEqual([
        'Perfekter Tag! +28 Bonus-XP',
      ]),
    )
    expect(screen.queryByText(/inkl\./)).not.toBeInTheDocument()
    // Die Toasts ergeben zusammen „Heute verdient“.
    expect(visibleXpSum() + 28).toBe(138)

    // Tagesquest wieder offen: Der Perfekte Tag verschwindet, kein Toast erwähnt mehr einen Bonus.
    await setCompletionValue(thought.id, TODAY, 0)
    await waitFor(() => expect(screen.queryByText(/Bonus/)).not.toBeInTheDocument())
    expect(screen.getByText('Tiefe und Gespräch')).toBeInTheDocument()
  })

  it('meldet den wachsenden Tagesbonus kurz als neue Summe, wenn der Perfekter-Tag-Toast schon weg ist', async () => {
    const clock = controllableClock()
    const reading = await createHabit({ ...READING, difficulty: 'easy' }, TODAY)
    const deep = await createHabit(
      { title: 'Tiefe', icon: '⏳', attribute: 'wisdom', difficulty: 'hard', schedule: { type: 'weekly', times: 3 } },
      TODAY,
    )
    await renderFeedback()

    await setCompletionValue(reading.id, TODAY, 1)
    expect(await screen.findByText('Perfekter Tag! +3 Bonus-XP')).toBeInTheDocument()
    clock.skip(6000)
    await setCompletionValue(deep.id, TODAY, 1)
    expect(await screen.findByText('Tagesbonus steigt auf +13 Bonus-XP')).toBeInTheDocument()
    await waitFor(() => expect(screen.queryByText(/^Perfekter Tag!/)).not.toBeInTheDocument())
    expect(screen.getByText('+40 XP')).toBeInTheDocument()
    expect(screen.getByText('Tiefe')).toBeInTheDocument()
  })

  it('korrigiert den sichtbaren Tagesbonus, wenn eine Wochenquest wieder offen ist', async () => {
    const reading = await createHabit({ ...READING, difficulty: 'easy' }, TODAY)
    const deep = await createHabit(
      { title: 'Tiefe', icon: '⏳', attribute: 'wisdom', difficulty: 'hard', schedule: { type: 'weekly', times: 3 } },
      TODAY,
    )
    await renderFeedback()
    await setCompletionValue(reading.id, TODAY, 1)
    await setCompletionValue(deep.id, TODAY, 1)
    expect(await screen.findByText('Perfekter Tag! +13 Bonus-XP')).toBeInTheDocument()

    await setCompletionValue(deep.id, TODAY, 0)
    expect(await screen.findByText('Perfekter Tag! +3 Bonus-XP')).toBeInTheDocument()
    await waitFor(() => expect(screen.queryByText('Perfekter Tag! +13 Bonus-XP')).not.toBeInTheDocument())
  })

  it('nennt nachgetragene Quests, die heute nicht anstehen', async () => {
    const running = await createHabit(
      { title: 'Laufen', icon: '🏃', attribute: 'strength', difficulty: 'medium', schedule: { type: 'weekdays', days: [1, 3, 5] } },
      '2026-10-20',
    )
    await renderFeedback()
    // Dienstag: Die Mo/Mi/Fr-Quest wird für Montag nachgetragen.
    await setCompletionValue(running.id, '2026-11-02', 1)
    expect(await screen.findByText('+20 XP')).toBeInTheDocument()
    expect(screen.getByText('Nachgetragen: Laufen')).toBeInTheDocument()
    expect(screen.queryByText('Nachgetragene Quest')).not.toBeInTheDocument()
  })

  it('nennt die Quest, wenn eine erledigte Quest schwerer wird (Leicht → Episch)', async () => {
    const clock = controllableClock()
    const meditation = await createHabit({ ...READING, title: 'Meditieren', icon: '🧘', difficulty: 'easy' }, TODAY)
    await createHabit(TRAINING, TODAY) // noch offen → kein Perfekter Tag
    await renderFeedback()
    await setCompletionValue(meditation.id, TODAY, 1)
    expect(await screen.findByText('+10 XP')).toBeInTheDocument()

    clock.skip(2000) // eigener Toast statt Zusammenfassen
    await db.completions.where('habitId').equals(meditation.id).modify({ difficulty: 'epic', updatedAt: Date.now() + 1 })
    expect(await screen.findByText('+70 XP')).toBeInTheDocument()
    expect(screen.getAllByText('Meditieren')).toHaveLength(2)
    expect(screen.queryByText(/Nachgetragen/)).not.toBeInTheDocument()
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

  it('Kapitel und Kampagne in der Hauptfarbe der Kampagne – XP und Belohnung bleiben golden', async () => {
    // Eigene Kampagne mit der Mönch-Vorlage als Herkunft, ohne eigene Quests → Weisheit (Silber).
    const quest = await createMainQuest({
      title: 'Die stille Probe',
      icon: '📿',
      why: 'Ruhe finden',
      reward: 'Ein Abend im Badehaus',
      startDay: TODAY,
      blueprint: { id: 'monk', level: 'beginner' },
      chapters: [
        { id: 'first', title: 'Die erste Stille', criterion: { type: 'counter', target: 1, label: 'Stunden' } },
        { id: 'second', title: 'Die zweite Stille', criterion: { type: 'counter', target: 1, label: 'Stunden' } },
      ],
    })
    // Gestern 80 XP + 20 Bonus-XP → Level 2: Das Kapitel (+100) bringt keinen Level-Up, der Toast kommt sofort.
    const training = await createHabit(TRAINING, '2026-11-01')
    await setCompletionValue(training.id, '2026-11-02', 1)
    await renderFeedback()
    expect(screen.getByTestId('level')).toHaveTextContent('Level 2')
    const silver = ATTRIBUTES.wisdom.color

    // Kapitel: Toast mit dem Emoji der Kampagne in einem Ring ihrer Farbe, Konfetti mit ihrer Farbe.
    await setChapterCounter(quest.id, 'first', 1, TODAY)
    const title = await screen.findByText('Kapitel abgeschlossen: Die erste Stille · +100 XP')
    const toast = title.closest('li')
    const icon = toast?.querySelector<HTMLElement>('[data-chapter-accent]')
    expect(icon).toHaveAttribute('data-chapter-accent', silver)
    expect(icon).toHaveTextContent('📿')
    expect(icon?.style.getPropertyValue('--accent')).toBe(silver)
    expect(document.querySelector('[data-confetti] [data-accent]')).toHaveAttribute('data-accent', silver)

    // Kampagne gemeistert: Szene in Silber, Pokal und Belohnung golden.
    await setChapterCounter(quest.id, 'second', 1, TODAY)
    const scene = await screen.findByRole('dialog', { name: 'Kampagne gemeistert!' })
    const root = scene.closest<HTMLElement>('[data-tone]')
    expect(root).toHaveAttribute('data-tone', 'accent')
    expect(root?.style.getPropertyValue('--accent')).toBe(silver)
    expect(scene.querySelector('[data-medallion]')).toHaveAttribute('data-medallion', 'accent')
    expect(within(scene).getByText('Die stille Probe').className).toContain('text-(--accent-text)')
    expect(within(scene).getByText('+500 XP').className).toContain('text-gold-bright')
    expect(within(scene).getByText('Ein Abend im Badehaus').closest('[class*="bg-parchment"]')).not.toBeNull()
  })

  it('Kampagne ohne Attribut (keine Quests, keine Vorlage): Szene und Kapitel-Toast bleiben golden', async () => {
    const quest = await createMainQuest({
      title: 'Mein eigener Weg',
      icon: '🗺️',
      why: '',
      reward: '',
      startDay: TODAY,
      chapters: [{ id: 'only', title: 'Der eine Schritt', criterion: { type: 'counter', target: 1, label: 'Schritte' } }],
    })
    await renderFeedback()
    await setChapterCounter(quest.id, 'only', 1, TODAY)
    const scene = await screen.findByRole('dialog', { name: 'Kampagne gemeistert!' })
    const root = scene.closest<HTMLElement>('[data-tone]')
    expect(root).toHaveAttribute('data-tone', 'gold')
    expect(root?.style.getPropertyValue('--accent')).toBe('')
    expect(within(scene).getByText('Mein eigener Weg').className).toContain('text-gold-bright')
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
