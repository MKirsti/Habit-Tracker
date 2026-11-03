// @vitest-environment jsdom
import 'fake-indexeddb/auto'
import { cleanup, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MotionGlobalConfig } from 'motion/react'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import * as repository from '../../data/repository'
import type { HabitDraft } from '../../data/repository'
import type { Completion, DayKey } from '../../domain/types'
import { renderWithGame } from '../../test/renderWithGame'
import { DashboardPage } from '../DashboardPage'

// Fehlerfall: toggleCompletion kann gezielt fehlschlagen, sonst gilt die echte Implementierung.
const failures = vi.hoisted(() => ({ toggle: false }))
vi.mock('../../data/repository', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../data/repository')>()
  return {
    ...actual,
    toggleCompletion: async (...args: Parameters<typeof actual.toggleCompletion>) => {
      if (failures.toggle) throw new Error('Diese Quest gibt es nicht mehr.')
      return actual.toggleCompletion(...args)
    },
  }
})

const {
  archiveHabit,
  createHabit,
  createMainQuest,
  loadGameData,
  resetAllData,
  saveProfile,
  setCompletionValue,
  updateHabit,
} = repository

/** Dienstag, 3. November 2026, 12:00 Uhr (Ortszeit) → Spieltag 2026-11-03. */
const TODAY: DayKey = '2026-11-03'
const YESTERDAY: DayKey = '2026-11-02'

const READING: HabitDraft = {
  title: 'Lesen',
  icon: '📖',
  attribute: 'intellect',
  difficulty: 'medium',
  schedule: { type: 'daily' },
  measure: { target: 10, unit: 'Seiten' },
}
const MEDITATION: HabitDraft = {
  title: 'Meditieren',
  icon: '🧘',
  attribute: 'wisdom',
  difficulty: 'easy',
  schedule: { type: 'daily' },
}
const RUNNING: HabitDraft = {
  title: 'Laufen',
  icon: '🏃',
  attribute: 'strength',
  difficulty: 'hard',
  schedule: { type: 'weekly', times: 3 },
}

beforeAll(() => {
  MotionGlobalConfig.skipAnimations = true
  // Nur die Uhr anhalten – Timer (IndexedDB, userEvent) laufen normal weiter.
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date(2026, 10, 3, 12, 0, 0))
})
afterAll(() => {
  vi.useRealTimers()
})
beforeEach(async () => {
  failures.toggle = false
  await resetAllData()
})
afterEach(cleanup)

async function setup({
  createdDay = '2026-10-29',
  habits = [READING, MEDITATION, RUNNING],
  habitsSince = '2026-10-29',
}: { createdDay?: DayKey; habits?: HabitDraft[]; habitsSince?: DayKey } = {}) {
  await saveProfile({ name: 'Aria', avatar: '🧙', createdDay })
  const created = []
  for (const draft of habits) created.push(await createHabit(draft, habitsSince))
  const user = userEvent.setup()
  const view = renderWithGame(<DashboardPage />)
  await screen.findByRole('heading', { level: 1, name: 'Heute' })
  return { user, habits: created, ...view }
}

async function completionsOf(habitId: string): Promise<Completion[]> {
  const data = await loadGameData()
  return data.completions.filter((c) => c.habitId === habitId)
}

function section(name: string): HTMLElement {
  return screen.getByRole('region', { name: new RegExp(`^${name}`) })
}

describe('DashboardPage', () => {
  it('zeigt Held, Tagesbilanz und Quests in Tages- und Wochenquests', async () => {
    await setup()

    expect(screen.getByText('Dienstag, 3. November 2026')).toBeInTheDocument()
    const hero = screen.getByRole('region', { name: 'Aria' })
    expect(hero).toHaveTextContent('Level 1 · Novize')
    expect(hero).toHaveTextContent('Tag 6 deines Abenteuers')
    expect(within(hero).getByRole('progressbar', { name: 'Erfahrung' })).toBeInTheDocument()
    expect(within(hero).getByRole('link', { name: 'Heldenprofil von Aria öffnen' })).toHaveAttribute('href', '/held')

    const daily = section('Tagesquests')
    expect(within(daily).getByRole('checkbox', { name: 'Lesen erledigt' })).not.toBeChecked()
    expect(within(daily).getByRole('checkbox', { name: 'Meditieren erledigt' })).not.toBeChecked()
    expect(within(daily).getByText('+20 XP')).toBeInTheDocument()
    expect(within(daily).queryByRole('checkbox', { name: 'Laufen erledigt' })).not.toBeInTheDocument()

    const weekly = section('Wochenquests')
    expect(within(weekly).getByRole('checkbox', { name: 'Laufen erledigt' })).toBeInTheDocument()
    expect(within(weekly).getByText(/0 \/ 3 diese Woche/)).toBeInTheDocument()

    expect(screen.getByRole('progressbar', { name: 'Tagesfortschritt' })).toHaveAttribute(
      'aria-valuetext',
      '0 von 2 Tagesquests erledigt',
    )
    expect(screen.getByText('2 Quests')).toBeInTheDocument()
    expect(screen.getByText(/bis zum Perfekten Tag/)).toHaveTextContent('(+25 % Bonus-XP)')

    // Alle sechs Attribute, Kampagnen-Einladung
    const attributes = screen.getByRole('region', { name: /^Attribute/ })
    expect(within(attributes).getAllByRole('listitem')).toHaveLength(6)
    expect(screen.getByRole('link', { name: /Kampagne starten/ })).toHaveAttribute('href', '/kampagne')
  })

  it('hakt eine Quest per Tipp ab und wieder aus', async () => {
    const { user, habits } = await setup()
    const meditation = habits[1]
    const check = screen.getByRole('checkbox', { name: 'Meditieren erledigt' })

    await user.click(check)
    await waitFor(async () => expect(await completionsOf(meditation.id)).toMatchObject([{ day: TODAY, value: 1 }]))
    await waitFor(() => expect(screen.getByRole('checkbox', { name: 'Meditieren erledigt' })).toBeChecked())
    expect(screen.getByRole('progressbar', { name: 'Tagesfortschritt' })).toHaveAttribute(
      'aria-valuetext',
      '1 von 2 Tagesquests erledigt',
    )
    expect(screen.getByText('1 Quest')).toBeInTheDocument()

    await user.click(screen.getByRole('checkbox', { name: 'Meditieren erledigt' }))
    await waitFor(async () => expect(await completionsOf(meditation.id)).toEqual([]))
    await waitFor(() => expect(screen.getByRole('checkbox', { name: 'Meditieren erledigt' })).not.toBeChecked())
  })

  it('erfasst messbare Quests mit −/+, Auffüllen und genauer Eingabe im Dialog', async () => {
    const { user, habits } = await setup()
    const reading = habits[0]
    const valueOf = async () => (await completionsOf(reading.id))[0]?.value ?? 0

    await user.click(screen.getByRole('button', { name: 'Lesen: 1 mehr' }))
    await waitFor(async () => expect(await valueOf()).toBe(1))
    await user.click(screen.getByRole('button', { name: 'Lesen: 1 mehr' }))
    await waitFor(async () => expect(await valueOf()).toBe(2))
    await user.click(screen.getByRole('button', { name: 'Lesen: 1 weniger' }))
    await waitFor(async () => expect(await valueOf()).toBe(1))
    await screen.findByRole('button', { name: /^Lesen: 1 von 10 Seiten/ })
    expect(screen.getByRole('checkbox', { name: 'Lesen erledigt' })).not.toBeChecked()

    // Auffüllen auf das Ziel (+9)
    await user.click(screen.getByRole('button', { name: 'Lesen: auf Ziel auffüllen (+9 Seiten)' }))
    await waitFor(async () => expect(await valueOf()).toBe(10))
    await waitFor(() => expect(screen.getByRole('checkbox', { name: 'Lesen erledigt' })).toBeChecked())
    expect(screen.queryByRole('button', { name: /auf Ziel auffüllen/ })).not.toBeInTheDocument()

    // Genaue Eingabe – mehr als das Ziel ist erlaubt
    await user.click(screen.getByRole('button', { name: /^Lesen: 10 von 10 Seiten – genauen Wert eingeben/ }))
    const dialog = await screen.findByRole('dialog', { name: 'Lesen' })
    const input = within(dialog).getByRole('spinbutton', { name: 'Erfasster Wert' })
    expect(input).toHaveValue('10')
    await user.clear(input)
    await user.type(input, '12')
    await user.click(within(dialog).getByRole('button', { name: 'Speichern' }))
    await waitFor(async () => expect(await valueOf()).toBe(12))
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(await screen.findByRole('button', { name: /^Lesen: 12 von 10 Seiten/ })).toBeInTheDocument()
    expect(screen.getByRole('checkbox', { name: 'Lesen erledigt' })).toBeChecked()

    // Der Haken setzt eine erledigte messbare Quest zurück
    await user.click(screen.getByRole('checkbox', { name: 'Lesen erledigt' }))
    await waitFor(async () => expect(await valueOf()).toBe(0))
  })

  it('setzt im Dialog per Enter und kann über „Zurücksetzen“ den Eintrag löschen', async () => {
    const { user, habits } = await setup()
    const reading = habits[0]
    await setCompletionValue(reading.id, TODAY, 4)
    await user.click(await screen.findByRole('button', { name: /^Lesen: 4 von 10 Seiten/ }))
    const dialog = await screen.findByRole('dialog', { name: 'Lesen' })
    await user.click(within(dialog).getByRole('button', { name: 'Zurücksetzen' }))
    expect(within(dialog).getByRole('spinbutton', { name: 'Erfasster Wert' })).toHaveValue('0')
    await user.type(within(dialog).getByRole('spinbutton', { name: 'Erfasster Wert' }), '{Enter}')
    await waitFor(async () => expect(await completionsOf(reading.id)).toEqual([]))
  })

  it('trägt im Modus „Gestern“ für den Vortag nach', async () => {
    const { user, habits } = await setup()
    const meditation = habits[1]

    expect(screen.queryByText(/Du trägst für gestern nach/)).not.toBeInTheDocument()
    await user.click(screen.getByRole('radio', { name: 'Gestern' }))
    expect(await screen.findByText('Du trägst für gestern nach')).toBeInTheDocument()
    expect(screen.getByText(/Montag, 2\. November 2026/)).toBeInTheDocument()

    await user.click(screen.getByRole('checkbox', { name: 'Meditieren erledigt' }))
    await waitFor(async () => expect(await completionsOf(meditation.id)).toMatchObject([{ day: YESTERDAY, value: 1 }]))
    await waitFor(() => expect(screen.getByRole('checkbox', { name: 'Meditieren erledigt' })).toBeChecked())

    // Zurück zu heute: dort ist die Quest noch offen.
    await user.click(screen.getByRole('radio', { name: 'Heute' }))
    expect(screen.getByRole('checkbox', { name: 'Meditieren erledigt' })).not.toBeChecked()
    expect(screen.queryByText(/Du trägst für gestern nach/)).not.toBeInTheDocument()
  })

  it('bietet „Gestern“ nur an, wenn das Abenteuer gestern schon lief', async () => {
    await setup({ createdDay: TODAY, habitsSince: TODAY })
    expect(screen.queryByRole('radio', { name: 'Gestern' })).not.toBeInTheDocument()
    expect(screen.queryByRole('radiogroup', { name: 'Tag wählen' })).not.toBeInTheDocument()
  })

  it('feiert den Perfekten Tag mit Bonus-XP', async () => {
    const { habits } = await setup()
    await setCompletionValue(habits[0].id, TODAY, 10)
    await setCompletionValue(habits[1].id, TODAY, 1)
    expect(await screen.findByText('Perfekter Tag!')).toBeInTheDocument()
    // 20 + 10 Quest-XP → round(0,25 × 30) = 8 Bonus-XP
    expect(screen.getByText('+8 Bonus-XP')).toBeInTheDocument()
    expect(screen.queryByText(/bis zum Perfekten Tag/)).not.toBeInTheDocument()
  })

  it('erklärt Tage ohne Tagesquests und lässt erfüllte Wochenquests weiter abhaken', async () => {
    const { user, habits } = await setup({ habits: [{ ...RUNNING, schedule: { type: 'weekly', times: 2 } }] })
    const running = habits[0]
    expect(await screen.findByText(/Heute stehen keine Tagesquests an/)).toBeInTheDocument()
    expect(screen.queryByRole('region', { name: /^Tagesquests/ })).not.toBeInTheDocument()

    await setCompletionValue(running.id, '2026-11-01', 1) // Sonntag der Vorwoche zählt nicht mit
    await setCompletionValue(running.id, YESTERDAY, 1)
    expect(await screen.findByText('1 / 2 diese Woche')).toBeInTheDocument()

    await user.click(screen.getByRole('checkbox', { name: 'Laufen erledigt' }))
    expect(await screen.findByText('2 / 2 diese Woche – Wochenziel erreicht')).toBeInTheDocument()
    expect(within(section('Wochenquests')).getByText('1 / 1 erfüllt')).toBeInTheDocument()

    // Weiterhin bedienbar: Haken wieder entfernen
    await user.click(screen.getByRole('checkbox', { name: 'Laufen erledigt' }))
    expect(await screen.findByText('1 / 2 diese Woche')).toBeInTheDocument()
  })

  it('zeigt einen freien Tag, wenn heute gar keine Quest fällig ist', async () => {
    await setup({
      habits: [{ ...MEDITATION, schedule: { type: 'weekdays', days: [1] } }],
    })
    expect(await screen.findByText(/Heute stehen keine Quests an/)).toBeInTheDocument()
  })

  it('zeigt ohne aktive Quests einen leeren Zustand mit Einstieg', async () => {
    const { user, router } = await setup({ habits: [] })
    expect(screen.getByRole('heading', { name: 'Dein Questlog ist noch leer' })).toBeInTheDocument()
    expect(screen.queryByRole('region', { name: /^Tagesquests/ })).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Erste Quest anlegen' }))
    await waitFor(() => expect(router.state.location.pathname).toBe('/quests'))
    expect(router.state.location.search).toBe('?neu=1')
  })

  it('zeigt Kapitel, Fortschritt und Restlaufzeit der Kampagne', async () => {
    await setup()
    await createMainQuest({
      title: 'Der Weg des Gelehrten',
      icon: '📚',
      why: 'Mehr lesen',
      reward: 'Ein neues Buch',
      startDay: '2026-10-29',
      deadline: '2026-12-03',
      chapters: [
        { id: 'c1', title: 'Der erste Funke', criterion: { type: 'manual' }, manualDone: true, completedDay: TODAY },
        { id: 'c2', title: 'Das erste Buch', criterion: { type: 'manual' } },
      ],
    })
    const campaign = await screen.findByRole('article')
    expect(within(campaign).getByRole('heading', { name: 'Der Weg des Gelehrten' })).toBeInTheDocument()
    expect(within(campaign).getByText('Kapitel 2 / 2: Das erste Buch')).toBeInTheDocument()
    expect(within(campaign).getByText('50 %')).toBeInTheDocument()
    expect(within(campaign).getByText('noch 30 Tage')).toBeInTheDocument()
    expect(within(campaign).getByRole('link', { name: 'Kampagne „Der Weg des Gelehrten“ öffnen' })).toHaveAttribute(
      'href',
      '/kampagne',
    )
  })

  it('zeigt im Modus „Gestern“ den damals gültigen Rhythmus', async () => {
    // Laufen war bis gestern eine Wochenquest und ist ab heute täglich; Meditieren umgekehrt.
    const { user, habits } = await setup({ habits: [RUNNING, MEDITATION] })
    const [running, meditation] = habits
    await updateHabit(running.id, { schedule: { type: 'daily' } }, TODAY)
    await updateHabit(meditation.id, { schedule: { type: 'weekly', times: 2 } }, TODAY)
    await setCompletionValue(running.id, YESTERDAY, 1)

    // Heute: aktueller Rhythmus
    await waitFor(() =>
      expect(within(section('Tagesquests')).getByRole('checkbox', { name: 'Laufen erledigt' })).toBeInTheDocument(),
    )
    expect(within(section('Wochenquests')).getByRole('checkbox', { name: 'Meditieren erledigt' })).toBeInTheDocument()

    // Gestern: jede Quest genau einmal, im damals gültigen Abschnitt
    await user.click(screen.getByRole('radio', { name: 'Gestern' }))
    await screen.findByText('Du trägst für gestern nach')
    expect(screen.getAllByRole('checkbox', { name: 'Laufen erledigt' })).toHaveLength(1)
    expect(screen.getAllByRole('checkbox', { name: 'Meditieren erledigt' })).toHaveLength(1)
    const weekly = section('Wochenquests')
    expect(within(weekly).getByRole('checkbox', { name: 'Laufen erledigt' })).toBeChecked()
    expect(within(weekly).getByText('1 / 3 diese Woche')).toBeInTheDocument()
    expect(within(section('Tagesquests')).getByRole('checkbox', { name: 'Meditieren erledigt' })).toBeInTheDocument()
  })

  it('erklärt einen gestrigen Tag nur mit (damaligen) Wochenquests', async () => {
    const { user, habits } = await setup({ habits: [RUNNING] })
    await updateHabit(habits[0].id, { schedule: { type: 'daily' } }, TODAY)
    await user.click(await screen.findByRole('radio', { name: 'Gestern' }))
    expect(
      await screen.findByText(/Gestern standen keine Tagesquests an – nur Wochenquests lassen sich nachtragen/),
    ).toBeInTheDocument()
  })

  it('erklärt einen gestrigen freien Tag ohne Lagerfeuer-Aufforderung', async () => {
    // Nur dienstags fällig: heute (Dienstag) ja, gestern (Montag) nicht.
    const { user } = await setup({ habits: [{ ...MEDITATION, schedule: { type: 'weekdays', days: [2] } }] })
    await user.click(screen.getByRole('radio', { name: 'Gestern' }))
    expect(await screen.findByText('Gestern standen keine Quests an – es gibt nichts nachzutragen.')).toBeInTheDocument()
  })

  it('behält den Tastaturfokus, wenn „Auffüllen“ verschwindet oder „−“ nicht mehr geht', async () => {
    const { user } = await setup()

    await user.click(screen.getByRole('button', { name: 'Lesen: 1 mehr' }))
    await screen.findByRole('button', { name: /^Lesen: 1 von 10 Seiten/ })
    const minus = screen.getByRole('button', { name: 'Lesen: 1 weniger' })
    await user.click(minus)
    await screen.findByRole('button', { name: /^Lesen: 0 von 10 Seiten/ })
    // Bei 0 bleibt „−“ fokussierbar (aria-disabled statt disabled) und tut nichts.
    expect(minus).toHaveFocus()
    expect(minus).toHaveAttribute('aria-disabled', 'true')
    await user.keyboard('{Enter}')
    expect(minus).toHaveFocus()

    // Nach dem Auffüllen verschwindet der Knopf – der Fokus landet auf dem Haken der Quest.
    await user.click(screen.getByRole('button', { name: /^Lesen: auf Ziel auffüllen/ }))
    await waitFor(() => expect(screen.getByRole('checkbox', { name: 'Lesen erledigt' })).toBeChecked())
    expect(screen.queryByRole('button', { name: /^Lesen: auf Ziel auffüllen/ })).not.toBeInTheDocument()
    expect(screen.getByRole('checkbox', { name: 'Lesen erledigt' })).toHaveFocus()
  })

  it('zeigt kein „+0“-Auffüllen, wenn das Ziel nachträglich unter den erfassten Wert gesenkt wurde', async () => {
    const { user, habits } = await setup()
    const reading = habits[0]
    await setCompletionValue(reading.id, TODAY, 6)
    await updateHabit(reading.id, { measure: { target: 5, unit: 'Seiten' } }, TODAY)
    // Der Eintrag gilt mit seinem Ziel-Schnappschuss (10) als offen; auffüllen gibt es nichts mehr.
    await screen.findByRole('button', { name: /^Lesen: 6 von 10 Seiten/ })
    await waitFor(() => expect(screen.queryByRole('button', { name: /^Lesen: auf Ziel auffüllen/ })).not.toBeInTheDocument())
    expect(screen.queryByText('+0')).not.toBeInTheDocument()
    // Der Haken schließt mit dem aktuellen Ziel ab und behält den erfassten Wert.
    await user.click(screen.getByRole('checkbox', { name: 'Lesen erledigt' }))
    await waitFor(async () => expect(await completionsOf(reading.id)).toMatchObject([{ value: 6, target: 5 }]))
    await waitFor(() => expect(screen.getByRole('checkbox', { name: 'Lesen erledigt' })).toBeChecked())
  })

  it('unterscheidet „alle Quests archiviert“ von einem leeren Questlog', async () => {
    const { habits } = await setup({ habits: [MEDITATION] })
    await archiveHabit(habits[0].id, '2026-10-31')
    expect(await screen.findByRole('heading', { name: 'Alle Quests ruhen' })).toBeInTheDocument()
    expect(screen.queryByText('Dein Questlog ist noch leer')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Neue Quest anlegen' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Zu deinen Quests' })).toHaveAttribute('href', '/quests')
  })

  it('meldet Speicherfehler als Fehler-Toast', async () => {
    const { user } = await setup()
    failures.toggle = true
    await user.click(screen.getByRole('checkbox', { name: 'Meditieren erledigt' }))
    expect(await screen.findByText('Quest konnte nicht gespeichert werden')).toBeInTheDocument()
    expect(screen.getByText('Diese Quest gibt es nicht mehr.')).toBeInTheDocument()
  })
})
