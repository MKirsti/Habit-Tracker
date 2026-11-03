// @vitest-environment jsdom
import 'fake-indexeddb/auto'
import { cleanup, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MotionGlobalConfig } from 'motion/react'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { db } from '../../data/db'
import * as repository from '../../data/repository'
import type { HabitDraft } from '../../data/repository'
import { deriveGameState } from '../../domain/engine'
import type { DayKey, Habit } from '../../domain/types'
import { renderWithGame } from '../../test/renderWithGame'
import { QuestsPage } from '../QuestsPage'

// Steuerbare Fehlerfälle: moveHabit/createHabit können gezielt fehlschlagen, createHabit und restoreHabit
// können auf ein „Tor“ warten (Speichern läuft noch). Sonst gilt die echte Implementierung.
const failures = vi.hoisted(() => ({
  move: false,
  create: false,
  createGate: null as Promise<void> | null,
  restoreGates: new Map<string, Promise<void>>(),
}))
vi.mock('../../data/repository', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../data/repository')>()
  return {
    ...actual,
    createHabit: async (...args: Parameters<typeof actual.createHabit>) => {
      if (failures.createGate) await failures.createGate
      if (failures.create) throw new Error('Die Quest braucht einen Namen.')
      return actual.createHabit(...args)
    },
    restoreHabit: async (...args: Parameters<typeof actual.restoreHabit>) => {
      await failures.restoreGates.get(args[0])
      return actual.restoreHabit(...args)
    },
    moveHabit: async (...args: Parameters<typeof actual.moveHabit>) => {
      if (failures.move) throw new Error('Diese Quest gibt es nicht (mehr).')
      return actual.moveHabit(...args)
    },
  }
})

const { archiveHabit, createHabit, createMainQuest, loadGameData, resetAllData, saveProfile, setCompletionValue } =
  repository

/** Dienstag, 3. November 2026 → Spieltag 2026-11-03. */
const TODAY: DayKey = '2026-11-03'

const READING: HabitDraft = {
  title: 'Lesen',
  icon: '📖',
  description: 'Im aktuellen Buch.',
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
  schedule: { type: 'weekdays', days: [1, 3, 5] },
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
  failures.move = false
  failures.create = false
  failures.createGate = null
  failures.restoreGates.clear()
  await resetAllData()
  await saveProfile({ name: 'Testheld', avatar: '🧙', createdDay: '2026-10-01' })
})
afterEach(cleanup)

async function createCampaign(title = 'Der Weg des Gelehrten', extra: Partial<repository.MainQuestDraft> = {}) {
  return createMainQuest({
    title,
    icon: '📚',
    why: 'Mehr wissen',
    reward: 'Ein schönes Buch',
    startDay: '2026-10-01',
    chapters: [],
    ...extra,
  })
}

async function habitByTitle(title: string): Promise<Habit | undefined> {
  return (await loadGameData()).habits.find((habit) => habit.title === title)
}

function questRow(title: string): HTMLElement {
  return screen.getByRole('listitem', { name: title })
}

async function openCreateDialog(user: ReturnType<typeof userEvent.setup>) {
  await user.click(await screen.findByRole('button', { name: 'Neue Quest' }))
  return screen.findByRole('dialog', { name: 'Neue Quest' })
}

describe('QuestsPage – Liste', () => {
  it('erklärt im Leerzustand, was Quests sind, und verweist auf die Kampagnen-Bibliothek', async () => {
    const user = userEvent.setup()
    renderWithGame(<QuestsPage />, { route: '/quests' })
    expect(await screen.findByRole('heading', { level: 1, name: 'Quests' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Dein Questbuch ist noch leer' })).toBeInTheDocument()
    expect(screen.getByText(/Quests sind deine Gewohnheiten/)).toBeInTheDocument()
    expect(screen.getByText(/In der Kampagnen-Bibliothek warten Vorlagen/)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /Zur Bibliothek/ })).toHaveAttribute('href', '/kampagne?neu=1')
    // Genau ein „Neue Quest“-Button (der Kopf zeigt im Leerzustand keinen zweiten).
    await user.click(screen.getByRole('button', { name: 'Neue Quest' }))
    expect(await screen.findByRole('dialog', { name: 'Neue Quest' })).toBeInTheDocument()
  })

  it('zeigt aktive Quests mit Rhythmus, Schwierigkeit, Attribut, Ziel, Kampagne und Serie', async () => {
    const campaign = await createCampaign()
    const reading = await createHabit({ ...READING, mainQuestId: campaign.id }, '2026-10-20')
    await createHabit(MEDITATION, '2026-10-20')
    await createHabit(RUNNING, '2026-10-20')
    // Lesen: 30.10. verpasst, dann 31.10.–2.11. erledigt (heute noch offen) → Serie 3, Rekord 5 (25.–29.10.).
    for (const day of ['2026-10-25', '2026-10-26', '2026-10-27', '2026-10-28', '2026-10-29']) {
      await setCompletionValue(reading.id, day, 10)
    }
    for (const day of ['2026-10-31', '2026-11-01', '2026-11-02']) await setCompletionValue(reading.id, day, 12)
    // Teilfortschritt zählt nicht für die Serie.
    await setCompletionValue(reading.id, '2026-10-30', 4)

    renderWithGame(<QuestsPage />, { route: '/quests' })
    const row = await screen.findByRole('listitem', { name: 'Lesen' })
    expect(row).toHaveTextContent('Täglich')
    expect(row).toHaveTextContent('Mittel · 20 XP')
    expect(row).toHaveTextContent('Im aktuellen Buch.')
    expect(row).toHaveTextContent('Intelligenz')
    expect(row).toHaveTextContent('Ziel: 10 Seiten')
    expect(row).toHaveTextContent('Kampagne: Der Weg des Gelehrten')
    expect(row).toHaveTextContent('Aktuelle Serie:3Tage')
    expect(row).toHaveTextContent('Rekord 5')

    const meditation = questRow('Meditieren')
    expect(meditation).toHaveTextContent('Mo, Mi, Fr')
    expect(meditation).toHaveTextContent('Leicht · 10 XP')
    expect(meditation).not.toHaveTextContent('Ziel:')
    expect(meditation).not.toHaveTextContent('Kampagne:')
    expect(questRow('Laufen')).toHaveTextContent('3× pro Woche')
    expect(questRow('Laufen')).toHaveTextContent('0Wochen')

    // Reihenfolge = order; Abschnitt zeigt die Anzahl.
    const titles = within(screen.getByRole('region', { name: /Aktive Quests/ }))
      .getAllByRole('heading', { level: 3 })
      .map((heading) => heading.textContent)
    expect(titles).toEqual(['Lesen', 'Meditieren', 'Laufen'])
    expect(screen.queryByRole('button', { name: /Archiv/ })).not.toBeInTheDocument()
  })
})

describe('QuestsPage – Reihenfolge', () => {
  it('verschiebt Quests nach oben/unten und sperrt die Buttons an den Enden', async () => {
    const user = userEvent.setup()
    await createHabit(READING, TODAY)
    await createHabit(MEDITATION, TODAY)
    await createHabit(RUNNING, TODAY)
    renderWithGame(<QuestsPage />, { route: '/quests' })

    // Gesperrt per aria-disabled (statt disabled), damit ein fokussierter Button den Fokus behält.
    const readingUp = await screen.findByRole('button', { name: '„Lesen“ nach oben verschieben' })
    expect(readingUp).toHaveAttribute('aria-disabled', 'true')
    expect(screen.getByRole('button', { name: '„Laufen“ nach unten verschieben' })).toHaveAttribute('aria-disabled', 'true')
    expect(screen.getByRole('button', { name: '„Meditieren“ nach oben verschieben' })).not.toHaveAttribute('aria-disabled')

    // Meditieren nach oben → steht ganz oben; der Fokus bleibt auf dem (jetzt gesperrten) Button.
    const meditationUp = screen.getByRole('button', { name: '„Meditieren“ nach oben verschieben' })
    await user.click(meditationUp)
    await waitFor(async () =>
      expect((await loadGameData()).habits.map((h) => h.title)).toEqual(['Meditieren', 'Lesen', 'Laufen']),
    )
    await waitFor(() => expect(meditationUp).toHaveAttribute('aria-disabled', 'true'))
    expect(meditationUp).toHaveFocus()
    await waitFor(() =>
      expect(screen.getByRole('status')).toHaveTextContent('„Meditieren“ steht jetzt an Position 1 von 3.'),
    )
    const titles = screen.getAllByRole('heading', { level: 3 }).map((heading) => heading.textContent)
    expect(titles).toEqual(['Meditieren', 'Lesen', 'Laufen'])

    // Weiteres Drücken am Rand tut nichts (kein Hin-und-her beim Gedrückthalten von Enter).
    await user.keyboard('{Enter}')
    await new Promise((resolve) => setTimeout(resolve, 50))
    expect((await loadGameData()).habits.map((h) => h.title)).toEqual(['Meditieren', 'Lesen', 'Laufen'])
    expect(meditationUp).toHaveFocus()

    // Lesen nach unten → ans Ende.
    const readingDown = screen.getByRole('button', { name: '„Lesen“ nach unten verschieben' })
    await user.click(readingDown)
    await waitFor(async () =>
      expect((await loadGameData()).habits.map((h) => h.title)).toEqual(['Meditieren', 'Laufen', 'Lesen']),
    )
    await waitFor(() => expect(readingDown).toHaveAttribute('aria-disabled', 'true'))
    expect(readingDown).toHaveFocus()
  })

  it('meldet nach schnell wiederholtem Verschieben die tatsächliche Position', async () => {
    await createHabit(READING, TODAY)
    await createHabit(MEDITATION, TODAY)
    await createHabit(RUNNING, TODAY)
    renderWithGame(<QuestsPage />, { route: '/quests' })

    // Drei Klicks, bevor die Liste neu gezeichnet ist (z. B. gedrückt gehaltenes Enter).
    const runningUp = await screen.findByRole('button', { name: '„Laufen“ nach oben verschieben' })
    runningUp.focus()
    runningUp.click()
    runningUp.click()
    runningUp.click()

    await waitFor(async () =>
      expect((await loadGameData()).habits.map((h) => h.title)).toEqual(['Laufen', 'Lesen', 'Meditieren']),
    )
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('„Laufen“ steht jetzt an Position 1 von 3.'))
    expect(runningUp).toHaveFocus()
    expect(runningUp).toHaveAttribute('aria-disabled', 'true')
  })

  it('zeigt einen Fehler-Toast, wenn das Verschieben fehlschlägt', async () => {
    const user = userEvent.setup()
    await createHabit(READING, TODAY)
    await createHabit(MEDITATION, TODAY)
    failures.move = true
    renderWithGame(<QuestsPage />, { route: '/quests' })
    await user.click(await screen.findByRole('button', { name: '„Lesen“ nach unten verschieben' }))
    expect(await screen.findByText('Verschieben fehlgeschlagen')).toBeInTheDocument()
    expect(screen.getByText('Diese Quest gibt es nicht (mehr).')).toBeInTheDocument()
    expect((await loadGameData()).habits.map((h) => h.title)).toEqual(['Lesen', 'Meditieren'])
  })
})

describe('QuestsPage – Quest anlegen', () => {
  it('zeigt Validierungsfehler und legt eine gültige Quest an', async () => {
    const user = userEvent.setup()
    await createHabit(READING, TODAY)
    renderWithGame(<QuestsPage />, { route: '/quests' })
    const form = await openCreateDialog(user)

    await user.click(within(form).getByRole('button', { name: 'Quest anlegen' }))
    expect(await within(form).findByText('Gib deiner Quest einen Namen.')).toBeInTheDocument()
    expect(within(form).getByRole('textbox', { name: /Titel/ })).toHaveFocus()
    expect(within(form).getByRole('textbox', { name: /Titel/ })).toHaveAttribute('aria-invalid', 'true')
    expect((await loadGameData()).habits).toHaveLength(1)

    await user.type(within(form).getByRole('textbox', { name: /Titel/ }), 'Wasser trinken')
    expect(within(form).queryByText('Gib deiner Quest einen Namen.')).not.toBeInTheDocument()
    await user.type(within(form).getByRole('textbox', { name: /Beschreibung/ }), 'Über den Tag verteilt.')
    const symbol = within(form).getByRole('button', { name: /Symbol ändern/ })
    expect(symbol).toHaveAttribute('aria-expanded', 'false')
    await user.click(symbol)
    expect(symbol).toHaveAttribute('aria-expanded', 'true')
    await user.click(within(form).getByRole('button', { name: 'Gesundheit' }))
    await user.click(within(form).getByRole('button', { name: '💧' }))
    expect(within(form).getByRole('button', { name: 'Symbol ändern (aktuell 💧)' })).toBeInTheDocument()

    const vitality = within(form).getByRole('radio', { name: 'Vitalität' })
    expect(vitality).toHaveAccessibleDescription('Ernährung, Wasser, Gesundheit, Selbstfürsorge')
    await user.click(vitality)
    expect(vitality).toBeChecked()

    expect(within(form).getByText('+20 XP pro Erledigung')).toBeInTheDocument()
    await user.click(within(form).getByRole('radio', { name: 'Schwer' }))
    expect(within(form).getByText('+40 XP pro Erledigung')).toBeInTheDocument()

    await user.click(within(form).getByRole('button', { name: 'Quest anlegen' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(await screen.findByText('Quest angelegt')).toBeInTheDocument()

    const habit = await habitByTitle('Wasser trinken')
    expect(habit).toMatchObject({
      icon: '💧',
      description: 'Über den Tag verteilt.',
      attribute: 'vitality',
      difficulty: 'hard',
      schedule: { type: 'daily' },
      createdDay: TODAY,
    })
    expect(habit?.measure).toBeUndefined()
    expect(habit?.mainQuestId).toBeUndefined()
    expect(await screen.findByRole('listitem', { name: 'Wasser trinken' })).toBeInTheDocument()
    // Die neue Quest steht am Ende der Liste – der Fokus springt zu ihr.
    await waitFor(() => expect(screen.getByRole('button', { name: '„Wasser trinken“ bearbeiten' })).toHaveFocus())
    expect(screen.getByRole('status')).toHaveTextContent('„Wasser trinken“ wurde angelegt.')
  })

  it('sperrt „Quest anlegen“ während des Speicherns', async () => {
    const user = userEvent.setup()
    let release = () => {}
    failures.createGate = new Promise<void>((resolve) => {
      release = resolve
    })
    renderWithGame(<QuestsPage />, { route: '/quests' })
    const form = await openCreateDialog(user)
    await user.type(within(form).getByRole('textbox', { name: /Titel/ }), 'Meditieren')
    const save = within(form).getByRole('button', { name: 'Quest anlegen' })
    await user.click(save)
    await waitFor(() => expect(save).toBeDisabled())
    expect(save).toHaveAttribute('aria-busy', 'true')
    expect(within(form).getByRole('button', { name: 'Abbrechen' })).toBeDisabled()

    release()
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect((await loadGameData()).habits.map((h) => h.title)).toEqual(['Meditieren'])
  })

  it('zeigt einen Fehler-Toast und lässt den Dialog offen, wenn das Speichern fehlschlägt', async () => {
    const user = userEvent.setup()
    failures.create = true
    renderWithGame(<QuestsPage />, { route: '/quests' })
    const form = await openCreateDialog(user)
    await user.type(within(form).getByRole('textbox', { name: /Titel/ }), 'Meditieren')
    await user.click(within(form).getByRole('button', { name: 'Quest anlegen' }))

    expect(await screen.findByText('Quest konnte nicht gespeichert werden')).toBeInTheDocument()
    expect(screen.getByText('Die Quest braucht einen Namen.')).toBeInTheDocument()
    expect(screen.getByRole('dialog', { name: 'Neue Quest' })).toBeInTheDocument()
    expect(within(form).getByRole('button', { name: 'Quest anlegen' })).toBeEnabled()
    expect(within(form).getByRole('textbox', { name: /Titel/ })).toHaveValue('Meditieren')
    expect((await loadGameData()).habits).toHaveLength(0)
  })

  it('legt eine messbare Quest an (Ziel mit Komma, Einheit per Vorschlag)', async () => {
    const user = userEvent.setup()
    renderWithGame(<QuestsPage />, { route: '/quests' })
    const form = await openCreateDialog(user)
    await user.type(within(form).getByRole('textbox', { name: /Titel/ }), 'Wasser')

    await user.click(within(form).getByRole('switch', { name: 'Messbar' }))
    await user.click(within(form).getByRole('button', { name: 'Quest anlegen' }))
    expect(await within(form).findByText('Gib ein Tagesziel an.')).toBeInTheDocument()
    expect(within(form).getByText('Gib eine Einheit an, z. B. „Seiten“.')).toBeInTheDocument()
    expect(within(form).getByRole('spinbutton', { name: /Ziel pro Tag/ })).toHaveFocus()

    await user.type(within(form).getByRole('spinbutton', { name: /Ziel pro Tag/ }), '2,5')
    const unitChip = within(form).getByRole('button', { name: 'L' })
    await user.click(unitChip)
    expect(unitChip).toHaveAttribute('aria-pressed', 'true')
    expect(within(form).getByRole('textbox', { name: /Einheit/ })).toHaveValue('L')

    await user.click(within(form).getByRole('button', { name: 'Quest anlegen' }))
    await waitFor(async () => expect((await habitByTitle('Wasser'))?.measure).toEqual({ target: 2.5, unit: 'L' }))
  })

  it('verlangt bei „Wochentage“ mindestens einen Tag und speichert die Auswahl', async () => {
    const user = userEvent.setup()
    renderWithGame(<QuestsPage />, { route: '/quests' })
    const form = await openCreateDialog(user)
    await user.type(within(form).getByRole('textbox', { name: /Titel/ }), 'Krafttraining')
    await user.click(within(form).getByRole('radio', { name: 'Wochentage' }))

    const weekdays = ['Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag']
    for (const day of weekdays) {
      expect(within(form).getByRole('button', { name: day })).toHaveAttribute('aria-pressed', 'true')
    }
    expect(within(form).getByRole('button', { name: 'Samstag' })).toHaveAttribute('aria-pressed', 'false')
    for (const day of weekdays) await user.click(within(form).getByRole('button', { name: day }))
    expect(within(form).getByText('Wähle mindestens einen Wochentag.')).toBeInTheDocument()

    await user.click(within(form).getByRole('button', { name: 'Quest anlegen' }))
    expect(within(form).getByRole('button', { name: 'Montag' })).toHaveFocus()
    expect(await habitByTitle('Krafttraining')).toBeUndefined()

    await user.click(within(form).getByRole('button', { name: 'Samstag' }))
    await user.click(within(form).getByRole('button', { name: 'Dienstag' }))
    expect(within(form).queryByText('Wähle mindestens einen Wochentag.')).not.toBeInTheDocument()
    await user.click(within(form).getByRole('button', { name: 'Quest anlegen' }))
    await waitFor(async () =>
      expect((await habitByTitle('Krafttraining'))?.schedule).toEqual({ type: 'weekdays', days: [2, 6] }),
    )
  })

  it('speichert „X pro Woche“ mit 1–7 Mal', async () => {
    const user = userEvent.setup()
    renderWithGame(<QuestsPage />, { route: '/quests' })
    const form = await openCreateDialog(user)
    await user.type(within(form).getByRole('textbox', { name: /Titel/ }), 'Schwimmen')
    await user.click(within(form).getByRole('radio', { name: 'X pro Woche' }))

    const times = within(form).getByRole('spinbutton', { name: /Mal pro Woche/ })
    expect(times).toHaveValue('3')
    await user.clear(times)
    await user.click(within(form).getByRole('button', { name: 'Quest anlegen' }))
    expect(await within(form).findByText('Gib an, wie oft pro Woche.')).toBeInTheDocument()

    await user.type(times, '9')
    await user.tab() // Verlassen begrenzt auf das Maximum.
    expect(times).toHaveValue('7')
    await user.clear(times)
    await user.type(times, '2')
    await user.click(within(form).getByRole('button', { name: 'Quest anlegen' }))
    await waitFor(async () =>
      expect((await habitByTitle('Schwimmen'))?.schedule).toEqual({ type: 'weekly', times: 2 }),
    )
  })

  it('öffnet per Deep-Link den Dialog mit vorausgewählter Kampagne und entfernt die Parameter', async () => {
    const user = userEvent.setup()
    const campaign = await createCampaign()
    await createCampaign('Alte Kampagne', { archived: true })
    const { router } = renderWithGame(<QuestsPage />, { route: `/quests?neu=1&kampagne=${campaign.id}` })

    const form = await screen.findByRole('dialog', { name: 'Neue Quest' })
    const select = within(form).getByRole('combobox', { name: 'Kampagne' })
    expect(select).toHaveValue(campaign.id)
    // Archivierte Kampagnen stehen nicht zur Wahl.
    expect(within(select).getAllByRole('option').map((option) => option.textContent)).toEqual([
      'Keine Kampagne',
      '📚 Der Weg des Gelehrten',
    ])
    await waitFor(() => expect(router.state.location.search).toBe(''))
    expect(router.state.location.pathname).toBe('/quests')

    await user.type(within(form).getByRole('textbox', { name: /Titel/ }), 'Lesen')
    await user.click(within(form).getByRole('button', { name: 'Quest anlegen' }))
    await waitFor(async () => expect((await habitByTitle('Lesen'))?.mainQuestId).toBe(campaign.id))
  })

  it('ignoriert beim Deep-Link eine unbekannte Kampagne', async () => {
    await createCampaign()
    renderWithGame(<QuestsPage />, { route: '/quests?neu=1&kampagne=gibt-es-nicht' })
    const form = await screen.findByRole('dialog', { name: 'Neue Quest' })
    expect(within(form).getByRole('combobox', { name: 'Kampagne' })).toHaveValue('')
  })

  it('setzt den Fokus nach dem Abbrechen eines Deep-Link-Dialogs auf „Neue Quest“', async () => {
    const user = userEvent.setup()
    await createHabit(READING, TODAY)
    renderWithGame(<QuestsPage />, { route: '/quests?neu=1' })
    const form = await screen.findByRole('dialog', { name: 'Neue Quest' })
    await user.click(within(form).getByRole('button', { name: 'Abbrechen' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    // Ohne Ausgangspunkt (der Dialog kam per Link) landete der Fokus sonst auf <body>.
    expect(screen.getByRole('button', { name: 'Neue Quest' })).toHaveFocus()
  })

  it('schließt bei Eingaben nicht durch einen versehentlichen Tipp auf den Hintergrund', async () => {
    const user = userEvent.setup()
    renderWithGame(<QuestsPage />, { route: '/quests' })
    const overlay = () => screen.getByRole('dialog').previousElementSibling as HTMLElement

    // Unverändert: Tipp daneben schließt wie gewohnt.
    await openCreateDialog(user)
    await user.click(overlay())
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())

    // Mit Eingaben bleibt der Dialog offen – nichts geht verloren.
    const form = await openCreateDialog(user)
    await user.type(within(form).getByRole('textbox', { name: /Titel/ }), 'Wasser trinken')
    await user.click(overlay())
    expect(screen.getByRole('dialog', { name: 'Neue Quest' })).toBeInTheDocument()
    expect(within(form).getByRole('textbox', { name: /Titel/ })).toHaveValue('Wasser trinken')
    // Abbrechen bleibt möglich.
    await user.click(within(form).getByRole('button', { name: 'Abbrechen' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
  })

  it('zeigt die Einheit im Zielfeld nur, solange sie kurz ist', async () => {
    const user = userEvent.setup()
    renderWithGame(<QuestsPage />, { route: '/quests' })
    const form = await openCreateDialog(user)
    await user.click(within(form).getByRole('switch', { name: 'Messbar' }))
    const target = within(form).getByRole('spinbutton', { name: /Ziel pro Tag/ })
    await user.type(target, '10')
    await user.click(within(form).getByRole('button', { name: 'Seiten' }))
    expect(target).toHaveAttribute('aria-valuetext', '10 Seiten')

    // Eine lange Einheit würde die Zahl auf dem Handy aus dem Feld drängen – sie steht ja direkt im Feld „Einheit“.
    const unit = within(form).getByRole('textbox', { name: /Einheit/ })
    await user.clear(unit)
    await user.type(unit, 'Liegestütze am Stück')
    expect(target).not.toHaveAttribute('aria-valuetext')
    expect(target).toHaveValue('10')
  })
})

describe('QuestsPage – Quest bearbeiten', () => {
  it('füllt das Formular vor, zeigt den Hinweis und entfernt Messung und Kampagne', async () => {
    const user = userEvent.setup()
    const campaign = await createCampaign()
    const reading = await createHabit({ ...READING, mainQuestId: campaign.id }, '2026-10-20')
    await setCompletionValue(reading.id, '2026-11-02', 10)
    renderWithGame(<QuestsPage />, { route: '/quests' })

    await user.click(await screen.findByRole('button', { name: '„Lesen“ bearbeiten' }))
    const form = await screen.findByRole('dialog', { name: 'Quest bearbeiten' })
    expect(form).toHaveTextContent('Änderungen gelten ab heute – auch für den heutigen Eintrag; frühere Tage behalten ihre Werte.')
    expect(within(form).getByRole('textbox', { name: /Titel/ })).toHaveValue('Lesen')
    expect(within(form).getByRole('textbox', { name: /Beschreibung/ })).toHaveValue('Im aktuellen Buch.')
    expect(within(form).getByRole('radio', { name: 'Intelligenz' })).toBeChecked()
    expect(within(form).getByRole('radio', { name: 'Mittel' })).toHaveAttribute('aria-checked', 'true')
    expect(within(form).getByRole('radio', { name: 'Täglich' })).toHaveAttribute('aria-checked', 'true')
    expect(within(form).getByRole('switch', { name: 'Messbar' })).toHaveAttribute('aria-checked', 'true')
    expect(within(form).getByRole('spinbutton', { name: /Ziel pro Tag/ })).toHaveValue('10')
    expect(within(form).getByRole('textbox', { name: /Einheit/ })).toHaveValue('Seiten')
    expect(within(form).getByRole('combobox', { name: 'Kampagne' })).toHaveValue(campaign.id)

    const title = within(form).getByRole('textbox', { name: /Titel/ })
    await user.clear(title)
    await user.type(title, 'Abends lesen')
    await user.clear(within(form).getByRole('textbox', { name: /Beschreibung/ }))
    await user.click(within(form).getByRole('switch', { name: 'Messbar' }))
    expect(within(form).queryByRole('spinbutton', { name: /Ziel pro Tag/ })).not.toBeInTheDocument()
    await user.selectOptions(within(form).getByRole('combobox', { name: 'Kampagne' }), 'Keine Kampagne')
    await user.click(within(form).getByRole('button', { name: 'Speichern' }))

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(await screen.findByText('Quest gespeichert')).toBeInTheDocument()
    const updated = await habitByTitle('Abends lesen')
    expect(updated).toBeDefined()
    expect(updated?.id).toBe(reading.id)
    expect(updated && Object.hasOwn(updated, 'measure')).toBe(false)
    expect(updated && Object.hasOwn(updated, 'mainQuestId')).toBe(false)
    expect(updated && Object.hasOwn(updated, 'description')).toBe(false)
    expect(updated?.createdDay).toBe('2026-10-20')
    // Bereits erfasste Tage behalten ihren Ziel-Snapshot.
    const completion = (await loadGameData()).completions.find((c) => c.habitId === reading.id)
    expect(completion).toMatchObject({ value: 10, target: 10 })
  })

  it('macht eine Abhak-Quest messbar und ändert Rhythmus und Schwierigkeit', async () => {
    const user = userEvent.setup()
    const meditation = await createHabit(MEDITATION, TODAY)
    renderWithGame(<QuestsPage />, { route: '/quests' })

    await user.click(await screen.findByRole('button', { name: '„Meditieren“ bearbeiten' }))
    const form = await screen.findByRole('dialog', { name: 'Quest bearbeiten' })
    expect(within(form).getByRole('radio', { name: 'Wochentage' })).toHaveAttribute('aria-checked', 'true')
    expect(within(form).getByRole('button', { name: 'Mittwoch' })).toHaveAttribute('aria-pressed', 'true')
    expect(within(form).getByRole('button', { name: 'Dienstag' })).toHaveAttribute('aria-pressed', 'false')

    await user.click(within(form).getByRole('switch', { name: 'Messbar' }))
    await user.type(within(form).getByRole('spinbutton', { name: /Ziel pro Tag/ }), '15')
    await user.click(within(form).getByRole('button', { name: 'Minuten' }))
    await user.click(within(form).getByRole('radio', { name: 'Täglich' }))
    await user.click(within(form).getByRole('radio', { name: 'Episch' }))
    expect(within(form).getByText('+80 XP pro Erledigung')).toBeInTheDocument()
    await user.click(within(form).getByRole('button', { name: 'Speichern' }))

    await waitFor(async () =>
      expect((await loadGameData()).habits.find((h) => h.id === meditation.id)).toMatchObject({
        measure: { target: 15, unit: 'Minuten' },
        schedule: { type: 'daily' },
        difficulty: 'epic',
      }),
    )
  })

  it('verwirft Änderungen beim Abbrechen und startet beim nächsten Öffnen frisch', async () => {
    const user = userEvent.setup()
    await createHabit(READING, TODAY)
    renderWithGame(<QuestsPage />, { route: '/quests' })

    await user.click(await screen.findByRole('button', { name: '„Lesen“ bearbeiten' }))
    let form = await screen.findByRole('dialog', { name: 'Quest bearbeiten' })
    await user.clear(within(form).getByRole('textbox', { name: /Titel/ }))
    await user.click(within(form).getByRole('button', { name: 'Abbrechen' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(screen.getByRole('button', { name: '„Lesen“ bearbeiten' })).toHaveFocus()

    await user.click(screen.getByRole('button', { name: '„Lesen“ bearbeiten' }))
    form = await screen.findByRole('dialog', { name: 'Quest bearbeiten' })
    expect(within(form).getByRole('textbox', { name: /Titel/ })).toHaveValue('Lesen')
    expect(within(form).queryByText('Gib deiner Quest einen Namen.')).not.toBeInTheDocument()
    expect((await habitByTitle('Lesen'))?.title).toBe('Lesen')
  })
})

describe('QuestsPage – Archiv', () => {
  it('archiviert eine Quest aus dem Bearbeiten-Dialog (Verlauf und XP bleiben)', async () => {
    const user = userEvent.setup()
    const reading = await createHabit(READING, '2026-10-20')
    await createHabit(MEDITATION, '2026-10-20')
    await setCompletionValue(reading.id, '2026-11-02', 10)
    renderWithGame(<QuestsPage />, { route: '/quests' })

    await user.click(await screen.findByRole('button', { name: '„Lesen“ bearbeiten' }))
    const form = await screen.findByRole('dialog', { name: 'Quest bearbeiten' })
    await user.click(within(form).getByRole('button', { name: 'Archivieren' }))
    const confirm = await screen.findByRole('alertdialog', { name: 'Quest archivieren?' })
    expect(confirm).toHaveTextContent('Verlauf, Serien und alle verdienten XP bleiben erhalten')
    await user.click(within(confirm).getByRole('button', { name: 'Archivieren' }))

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    await waitFor(() => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument())
    const archived = await habitByTitle('Lesen')
    expect(archived?.archivedDay).toBe(TODAY)
    expect((await loadGameData()).completions).toHaveLength(1)

    expect(await screen.findByText('Quest archiviert')).toBeInTheDocument()
    await waitFor(() => expect(screen.queryByRole('listitem', { name: 'Lesen' })).not.toBeInTheDocument())
    const toggle = screen.getByRole('button', { name: /Archiv/ })
    expect(toggle).toHaveTextContent('1')
    expect(toggle).toHaveAttribute('aria-expanded', 'false')
    await waitFor(() => expect(toggle).toHaveFocus())
  })

  it('klappt das Archiv auf und holt eine Quest zurück', async () => {
    const user = userEvent.setup()
    const reading = await createHabit(READING, '2026-10-20')
    await createHabit(MEDITATION, '2026-10-20')
    await archiveHabit(reading.id, '2026-11-01')
    renderWithGame(<QuestsPage />, { route: '/quests' })

    const toggle = await screen.findByRole('button', { name: /Archiv/ })
    expect(screen.queryByRole('button', { name: '„Lesen“ zurückholen' })).not.toBeInTheDocument()
    await user.click(toggle)
    expect(toggle).toHaveAttribute('aria-expanded', 'true')
    const row = screen.getByRole('listitem', { name: 'Lesen' })
    expect(row).toHaveTextContent('archiviert am 1. Nov.')

    await user.click(within(row).getByRole('button', { name: '„Lesen“ zurückholen' }))
    await waitFor(async () => expect((await habitByTitle('Lesen'))?.archivedDay).toBeUndefined())
    expect(await screen.findByText('Quest zurückgeholt')).toBeInTheDocument()
    expect(await screen.findByRole('button', { name: '„Lesen“ bearbeiten' })).toBeInTheDocument()
    // Archiv ist jetzt leer → Bereich verschwindet, Fokus landet auf „Neue Quest“.
    await waitFor(() => expect(screen.queryByRole('button', { name: /Archiv/ })).not.toBeInTheDocument())
    await waitFor(() => expect(screen.getByRole('button', { name: 'Neue Quest' })).toHaveFocus())
  })

  it('sperrt jede zurückgeholte Quest, bis ihr eigenes Speichern fertig ist', async () => {
    const user = userEvent.setup()
    const reading = await createHabit(READING, '2026-10-20')
    const meditation = await createHabit(MEDITATION, '2026-10-20')
    await archiveHabit(reading.id, '2026-11-01')
    await archiveHabit(meditation.id, '2026-11-01')
    let releaseReading = () => {}
    let releaseMeditation = () => {}
    failures.restoreGates.set(reading.id, new Promise<void>((resolve) => (releaseReading = resolve)))
    failures.restoreGates.set(meditation.id, new Promise<void>((resolve) => (releaseMeditation = resolve)))
    renderWithGame(<QuestsPage />, { route: '/quests' })

    await user.click(await screen.findByRole('button', { name: /Archiv/ }))
    const restoreReading = screen.getByRole('button', { name: '„Lesen“ zurückholen' })
    const restoreMeditation = screen.getByRole('button', { name: '„Meditieren“ zurückholen' })
    await user.click(restoreReading)
    await user.click(restoreMeditation)
    expect(restoreReading).toBeDisabled()
    expect(restoreMeditation).toBeDisabled()

    // Lesen ist fertig, Meditieren speichert noch → dessen Buttons bleiben gesperrt (kein doppeltes Zurückholen).
    releaseReading()
    expect(await screen.findByRole('button', { name: '„Lesen“ bearbeiten' })).toBeInTheDocument()
    expect(restoreMeditation).toBeDisabled()
    expect(screen.getByRole('button', { name: '„Meditieren“ endgültig löschen' })).toBeDisabled()

    releaseMeditation()
    expect(await screen.findByRole('button', { name: '„Meditieren“ bearbeiten' })).toBeInTheDocument()
    expect(screen.getAllByText('Quest zurückgeholt')).toHaveLength(2)
  })

  it('löscht eine archivierte Quest nach Rückfrage endgültig (samt Verlauf)', async () => {
    const user = userEvent.setup()
    const reading = await createHabit(READING, '2026-10-20')
    const meditation = await createHabit(MEDITATION, '2026-10-20')
    await setCompletionValue(reading.id, '2026-10-30', 10)
    await setCompletionValue(reading.id, '2026-10-31', 10)
    await setCompletionValue(reading.id, '2026-11-01', 5) // Teilfortschritt: keine XP
    await setCompletionValue(meditation.id, '2026-10-30', 1)
    await archiveHabit(reading.id, '2026-11-02')
    await archiveHabit(meditation.id, '2026-11-02')
    renderWithGame(<QuestsPage />, { route: '/quests' })

    expect(await screen.findByText('Keine aktiven Quests')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /Archiv/ }))
    await user.click(screen.getByRole('button', { name: '„Lesen“ endgültig löschen' }))
    const confirm = await screen.findByRole('alertdialog', { name: 'Quest endgültig löschen?' })
    expect(confirm).toHaveTextContent('„Lesen“ wird mit ihrem gesamten Verlauf gelöscht.')
    // 40 Quest-XP plus die Boni der beiden Perfekten Tage (30.10.: 8, 31.10.: 5), die ohne Lesen keine mehr sind.
    expect(confirm).toHaveTextContent('Du verlierst 53 XP.')
    expect(confirm).toHaveTextContent('Das lässt sich nicht rückgängig machen.')
    // Bei destruktiven Aktionen startet der Fokus auf „Abbrechen“.
    expect(within(confirm).getByRole('button', { name: 'Abbrechen' })).toHaveFocus()

    await user.click(within(confirm).getByRole('button', { name: 'Endgültig löschen' }))
    await waitFor(async () => expect(await habitByTitle('Lesen')).toBeUndefined())
    const data = await loadGameData()
    expect(data.completions.map((c) => c.habitId)).toEqual([meditation.id])
    expect(await screen.findByText('Quest gelöscht')).toBeInTheDocument()
    await waitFor(() => expect(screen.queryByRole('listitem', { name: 'Lesen' })).not.toBeInTheDocument())
    expect(screen.getByRole('listitem', { name: 'Meditieren' })).toBeInTheDocument()
    await waitFor(() => expect(screen.getByRole('button', { name: /Archiv/ })).toHaveFocus())
  })

  it('zeigt nach dem Löschen der letzten Quest den Leerzustand und fokussiert „Neue Quest“', async () => {
    const user = userEvent.setup()
    const reading = await createHabit(READING, '2026-10-20')
    await archiveHabit(reading.id, TODAY)
    renderWithGame(<QuestsPage />, { route: '/quests' })

    await user.click(await screen.findByRole('button', { name: /Archiv/ }))
    await user.click(screen.getByRole('button', { name: '„Lesen“ endgültig löschen' }))
    const confirm = await screen.findByRole('alertdialog')
    // Ohne Erledigungen gibt es keine XP zu verlieren – das sagt der Dialog dann auch klar.
    expect(confirm).toHaveTextContent('Deine XP und dein Level bleiben dabei unverändert.')
    expect(confirm).not.toHaveTextContent('Du verlierst')
    await user.click(within(confirm).getByRole('button', { name: 'Endgültig löschen' }))

    expect(await screen.findByRole('heading', { name: 'Dein Questbuch ist noch leer' })).toBeInTheDocument()
    await waitFor(() => expect(screen.getByRole('button', { name: 'Neue Quest' })).toHaveFocus())
  })

  it('warnt beim Löschen, wenn ein Kampagnen-Kapitel auf die Quest zählt', async () => {
    const user = userEvent.setup()
    const reading = await createHabit(READING, '2026-10-20')
    await createCampaign('Bücherwurm', {
      chapters: [
        { id: 'k1', title: '7 Tage', criterion: { type: 'habit', habitId: reading.id, metric: 'completions', target: 7 } },
      ],
    })
    await archiveHabit(reading.id, TODAY)
    renderWithGame(<QuestsPage />, { route: '/quests' })

    await user.click(await screen.findByRole('button', { name: /Archiv/ }))
    await user.click(screen.getByRole('button', { name: '„Lesen“ endgültig löschen' }))
    const confirm = await screen.findByRole('alertdialog')
    expect(confirm).toHaveTextContent('Kapitel deiner Kampagne, die auf diese Quest zählen, verlieren ihren Fortschritt.')
    expect(confirm).not.toHaveTextContent('Abschluss')
    await user.click(within(confirm).getByRole('button', { name: 'Abbrechen' }))
    await waitFor(() => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument())
    expect(await habitByTitle('Lesen')).toBeDefined()
  })
})

describe('QuestsPage – Löschen kostet genau, was der Dialog sagt', () => {
  async function totalXp(): Promise<number> {
    return deriveGameState(await loadGameData(), TODAY).level.totalXp
  }

  it('nennt Quest-XP, Perfekte Tage, Kapitel- und Kampagnen-XP samt Level – und genau so viel fällt der Spielstand', async () => {
    const user = userEvent.setup()
    const running = await createHabit({ ...RUNNING, schedule: { type: 'daily' }, difficulty: 'medium' }, '2026-10-31')
    const vocabulary = await createHabit(
      { title: 'Vokabeln', icon: '🈯', attribute: 'intellect', difficulty: 'easy', schedule: { type: 'daily' } },
      '2026-10-31',
    )
    await createCampaign('Sprachreise', {
      startDay: '2026-10-31',
      chapters: [
        { id: 'k1', title: 'Erste Vokabeln', criterion: { type: 'habit', habitId: vocabulary.id, metric: 'completions', target: 1 } },
      ],
    })
    for (const day of ['2026-10-31', '2026-11-01', '2026-11-02']) await setCompletionValue(running.id, day, 1)
    await setCompletionValue(vocabulary.id, '2026-10-31', 1)
    await archiveHabit(vocabulary.id, TODAY)
    const before = await totalXp()
    renderWithGame(<QuestsPage />, { route: '/quests' })

    await user.click(await screen.findByRole('button', { name: /Archiv/ }))
    await user.click(screen.getByRole('button', { name: '„Vokabeln“ endgültig löschen' }))
    const confirm = await screen.findByRole('alertdialog', { name: 'Quest endgültig löschen?' })
    // 10 Quest-XP + 8 Bonus (31.10. war perfekt) + 100 Kapitel + 500 Kampagne
    expect(confirm).toHaveTextContent('Du verlierst 618 XP (Level 3 → 1).')
    expect(confirm).toHaveTextContent(
      'Kapitel „Erste Vokabeln“ verliert seinen Abschluss (−100 XP); die Kampagne „Sprachreise“ ist dann nicht mehr gemeistert (−500 XP).',
    )
    expect(confirm).not.toHaveTextContent('verlieren ihren Fortschritt')

    await user.click(within(confirm).getByRole('button', { name: 'Endgültig löschen' }))
    await waitFor(async () => expect(await habitByTitle('Vokabeln')).toBeUndefined())
    expect(before - (await totalXp())).toBe(618)
  })

  it('sagt es, wenn das Löschen nichts kostet – und der Spielstand bleibt gleich', async () => {
    const user = userEvent.setup()
    const running = await createHabit(RUNNING, '2026-10-31')
    await createHabit(READING, '2026-10-31')
    const unused = await createHabit(MEDITATION, '2026-10-31')
    await setCompletionValue(running.id, '2026-11-02', 1)
    await archiveHabit(unused.id, '2026-11-01')
    const before = await totalXp()
    renderWithGame(<QuestsPage />, { route: '/quests' })

    await user.click(await screen.findByRole('button', { name: /Archiv/ }))
    await user.click(screen.getByRole('button', { name: '„Meditieren“ endgültig löschen' }))
    const confirm = await screen.findByRole('alertdialog')
    expect(confirm).toHaveTextContent('Deine XP und dein Level bleiben dabei unverändert.')
    await user.click(within(confirm).getByRole('button', { name: 'Endgültig löschen' }))
    await waitFor(async () => expect(await habitByTitle('Meditieren')).toBeUndefined())
    expect(await totalXp()).toBe(before)
  })
})

describe('QuestsPage – Bearbeiten gilt auch für den heutigen Eintrag', () => {
  it('warnt vor dem Speichern, wenn ein höheres Ziel die heute erledigte Quest wieder öffnet', async () => {
    const user = userEvent.setup()
    const reading = await createHabit(READING, '2026-10-20')
    await setCompletionValue(reading.id, TODAY, 10)
    renderWithGame(<QuestsPage />, { route: '/quests' })

    await user.click(await screen.findByRole('button', { name: '„Lesen“ bearbeiten' }))
    const form = await screen.findByRole('dialog', { name: 'Quest bearbeiten' })
    const target = within(form).getByRole('spinbutton', { name: /Ziel pro Tag/ })
    expect(within(form).queryByText(/die Quest ist danach wieder offen/)).not.toBeInTheDocument()
    await user.clear(target)
    await user.type(target, '20')
    expect(within(form).getByText('Heute: 10 / 20 Seiten – die Quest ist danach wieder offen.')).toBeInTheDocument()
    // Ein Ziel, das heute noch erreicht ist, braucht keinen Hinweis.
    await user.clear(target)
    await user.type(target, '8')
    expect(within(form).queryByText(/die Quest ist danach wieder offen/)).not.toBeInTheDocument()
    await user.clear(target)
    await user.type(target, '20')
    await user.click(within(form).getByRole('button', { name: 'Speichern' }))

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    // Die Tagesansicht zeigt sofort das neue Ziel.
    const status = deriveGameState(await loadGameData(), TODAY).todayState.habits.find((h) => h.habit.id === reading.id)
    expect(status).toMatchObject({ value: 10, target: 20, done: false })
  })
})

describe('QuestsPage – künftig archivierte Quest (Tageswechsel nach dem Archivieren verlegt)', () => {
  it('ist heute aktiv: lässt sich verschieben und archivieren', async () => {
    const user = userEvent.setup()
    await createHabit(READING, '2026-10-20')
    const meditation = await createHabit(MEDITATION, '2026-10-20')
    await createHabit(RUNNING, '2026-10-20')
    await db.habits.update(meditation.id, { archivedDay: '2026-11-04' })
    renderWithGame(<QuestsPage />, { route: '/quests' })

    expect(await screen.findByRole('listitem', { name: 'Meditieren' })).toBeInTheDocument()
    // Laufen nach oben → tauscht mit Meditieren (dem sichtbaren Nachbarn), nicht mit Lesen.
    await user.click(screen.getByRole('button', { name: '„Laufen“ nach oben verschieben' }))
    await waitFor(async () =>
      expect((await loadGameData()).habits.map((h) => h.title)).toEqual(['Lesen', 'Laufen', 'Meditieren']),
    )

    await user.click(screen.getByRole('button', { name: '„Meditieren“ bearbeiten' }))
    const form = await screen.findByRole('dialog', { name: 'Quest bearbeiten' })
    await user.click(within(form).getByRole('button', { name: 'Archivieren' }))
    const confirm = await screen.findByRole('alertdialog', { name: 'Quest archivieren?' })
    await user.click(within(confirm).getByRole('button', { name: 'Archivieren' }))
    await waitFor(async () => expect((await habitByTitle('Meditieren'))?.archivedDay).toBe(TODAY))
    await waitFor(() => expect(screen.queryByRole('listitem', { name: 'Meditieren' })).not.toBeInTheDocument())
  })
})
