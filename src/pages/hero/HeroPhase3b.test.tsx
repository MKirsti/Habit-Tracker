// @vitest-environment jsdom
import 'fake-indexeddb/auto'
import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MotionGlobalConfig } from 'motion/react'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  createHabit,
  createReward,
  loadGameData,
  purchaseReward,
  resetAllData,
  saveJournalNote,
  saveProfile,
  setCompanion,
  setCompletionValue,
} from '../../data/repository'
import type { HabitDraft } from '../../data/repository'
import { COMPANIONS } from '../../domain/companionDefinitions'
import { addDays, dayRange } from '../../domain/dates'
import type { DayKey } from '../../domain/types'
import { renderWithGame } from '../../test/renderWithGame'
import { HeroPage } from '../HeroPage'

/** Donnerstag, 5. November 2026, 12:00 Uhr → Spieltag 2026-11-05. */
const TODAY: DayKey = '2026-11-05'
const START: DayKey = '2026-10-01'

const READING: HabitDraft = {
  title: 'Lesen',
  icon: '📖',
  attribute: 'intellect',
  difficulty: 'medium',
  schedule: { type: 'daily' },
}

beforeAll(() => {
  MotionGlobalConfig.skipAnimations = true
  vi.useFakeTimers({ toFake: ['Date'] })
})
afterAll(() => {
  vi.useRealTimers()
})
beforeEach(async () => {
  vi.setSystemTime(new Date(2026, 10, 5, 12, 0, 0))
  await resetAllData()
  await saveProfile({ name: 'Aria', avatar: '🧙', createdDay: START })
})
afterEach(cleanup)

/** Lesen an `days` Tagen in Folge bis `until` erledigt → so viele aktive Tage. */
async function activeDays(days: number, until: DayKey = TODAY) {
  const habit = await createHabit(READING, START)
  for (const day of dayRange(addDays(until, -(days - 1)), until)) await setCompletionValue(habit.id, day, 1)
  return habit
}

async function renderHero(route = '/held') {
  const user = userEvent.setup()
  const view = renderWithGame(<HeroPage />, { route })
  await screen.findByRole('heading', { level: 1, name: 'Held' })
  return { user, ...view }
}

function companionCard(): HTMLElement {
  const card = document.getElementById('gefaehrte')
  if (card === null) throw new Error('Keine Gefährten-Karte')
  return card
}

describe('Held → Gefährte', () => {
  it('lädt ohne Gefährten zur Wahl ein und speichert Art und Namen', async () => {
    const { user } = await renderHero()
    const card = await waitFor(companionCard)
    expect(card).toHaveAttribute('data-companion-card', 'empty')
    expect(within(card).getByRole('heading', { name: 'Wähle deinen Gefährten' })).toBeInTheDocument()

    await user.click(within(card).getByRole('button', { name: 'Gefährten wählen' }))
    const dialog = await screen.findByRole('dialog', { name: 'Wähle deinen Gefährten' })
    const options = within(dialog).getAllByRole('radio')
    expect(options.map((option) => option.getAttribute('data-species'))).toEqual(['dragon', 'raccoon', 'snake', 'owl', 'fox'])
    // Vorgewählt ist der Fuchs mit seinem Namensvorschlag; die gewählte Art hat den Fokus.
    expect(within(dialog).getByRole('radio', { name: /Fuchs/ })).toHaveAttribute('aria-checked', 'true')
    expect(within(dialog).getByLabelText(/^Name/)).toHaveValue('Flink')

    await user.click(within(dialog).getByRole('radio', { name: /Drache/ }))
    expect(within(dialog).getByLabelText(/^Name/)).toHaveValue('Funke')
    await user.click(within(dialog).getByRole('button', { name: 'Mit Funke losziehen' }))

    await waitFor(async () =>
      expect((await loadGameData()).profile?.companion).toEqual({ species: 'dragon', name: 'Funke', chosenDay: TODAY }),
    )
    expect(await screen.findByText('Funke schließt sich dir an!')).toBeInTheDocument()
    await waitFor(() => expect(companionCard()).toHaveAttribute('data-companion-card', 'dragon'))
    expect(within(companionCard()).getByRole('heading', { name: 'Dein Gefährte: Funke' })).toBeInTheDocument()
  })

  it('zeigt bei der ersten Wahl die Stufe, die der Gefährte dank der aktiven Tage gleich hat', async () => {
    await activeDays(20)
    const { user } = await renderHero()
    await user.click(within(await waitFor(companionCard)).getByRole('button', { name: 'Gefährten wählen' }))
    const dialog = await screen.findByRole('dialog', { name: 'Wähle deinen Gefährten' })
    // 20 aktive Tage: Stufe 2 – nicht das Jungtier.
    expect(within(dialog).getByRole('radio', { name: /Fuchs/ })).toHaveTextContent('als Spitzohr')
    expect(within(dialog).getByRole('radio', { name: /Drache/ })).toHaveTextContent('als Jungdrache')
    expect(dialog).not.toHaveTextContent('als Fuchswelpe')
  })

  it('verlangt einen Namen', async () => {
    const { user } = await renderHero()
    await user.click(within(await waitFor(companionCard)).getByRole('button', { name: 'Gefährten wählen' }))
    const dialog = await screen.findByRole('dialog')
    await user.clear(within(dialog).getByLabelText(/^Name/))
    await user.click(within(dialog).getByRole('button', { name: 'Gefährten wählen' }))
    expect(within(dialog).getByText('Gib deinem Gefährten einen Namen.')).toBeInTheDocument()
    expect((await loadGameData()).profile?.companion).toBeUndefined()
  })

  it('zeigt Stufe, Text, Wachstum zur nächsten Stufe und die Stufen-Leiter', async () => {
    await activeDays(8)
    await setCompanion({ species: 'dragon', name: 'Funke' }, START)
    await renderHero()
    const card = await waitFor(() => {
      const element = companionCard()
      expect(element).toHaveAttribute('data-companion-card', 'dragon')
      return element
    })
    expect(card).toHaveAttribute('data-companion-stage', '0')
    expect(card).not.toHaveAttribute('data-companion-sleeping')
    expect(card).toHaveTextContent('Drache · Drachenei-Schlüpfling')
    expect(within(card).getByText('Stufe 1 von 4 · Jungtier')).toBeInTheDocument()
    expect(within(card).getByText(/Gerade erst aus dem Ei gepurzelt/)).toBeInTheDocument()
    expect(within(card).getByText('noch 6 aktive Tage bis Jungdrache')).toBeInTheDocument()
    const bar = within(card).getByRole('progressbar', { name: 'Wachstum von Funke' })
    expect(bar).toHaveAttribute('aria-valuenow', String(Math.round((8 / 14) * 100)))
    expect(bar).toHaveAttribute('aria-valuetext', '8 von 14 aktiven Tagen – noch 6 aktive Tage bis Jungdrache')

    const steps = within(card).getAllByRole('listitem').filter((item) => item.hasAttribute('data-stage-status'))
    expect(steps.map((step) => step.getAttribute('data-stage-status'))).toEqual(['current', 'upcoming', 'upcoming', 'upcoming'])
    expect(steps[0]).toHaveAttribute('aria-current', 'step')
    expect(steps[3]).toHaveTextContent('Uralter Drache')
    expect(within(card).getByText(/An jedem Perfekten Tag springt Funke mit an/)).toBeInTheDocument()
  })

  it('benennt um, ohne den Tag der Wahl zu ändern', async () => {
    await activeDays(3)
    await setCompanion({ species: 'fox', name: 'Flink' }, START)
    const { user } = await renderHero()
    await waitFor(() => expect(companionCard()).toHaveAttribute('data-companion-card', 'fox'))

    await user.click(within(companionCard()).getByRole('button', { name: 'Umbenennen' }))
    const dialog = await screen.findByRole('dialog', { name: 'Gefährten umbenennen' })
    expect(within(dialog).queryByRole('radiogroup')).not.toBeInTheDocument()
    const name = within(dialog).getByLabelText(/^Name/)
    expect(name).toHaveFocus()
    await user.clear(name)
    await user.type(name, 'Rotpelz')
    await user.click(within(dialog).getByRole('button', { name: 'Speichern' }))

    await waitFor(async () =>
      expect((await loadGameData()).profile?.companion).toEqual({ species: 'fox', name: 'Rotpelz', chosenDay: START }),
    )
    expect(await screen.findByText('Dein Gefährte heißt jetzt Rotpelz.')).toBeInTheDocument()
  })

  it('wechselt die Art – die Stufe bleibt, der Name auch', async () => {
    await activeDays(15)
    await setCompanion({ species: 'fox', name: 'Flink' }, START)
    const { user } = await renderHero()
    await waitFor(() => expect(companionCard()).toHaveAttribute('data-companion-stage', '1'))

    await user.click(within(companionCard()).getByRole('button', { name: 'Art wechseln' }))
    const dialog = await screen.findByRole('dialog', { name: 'Art wechseln' })
    expect(within(dialog).getByText(/Die Stufe bleibt beim Wechsel erhalten/)).toBeInTheDocument()
    const current = within(dialog).getByRole('radio', { name: /Fuchs/ })
    expect(current).toHaveAttribute('aria-checked', 'true')
    expect(current).toHaveFocus()
    expect(current).toHaveTextContent('Bisher')
    // Jede Art zeigt den Namen der Stufe, die der Gefährte gerade hätte.
    expect(within(dialog).getByRole('radio', { name: /Eule/ })).toHaveTextContent(`als ${COMPANIONS.owl.stages[1].name}`)
    await user.keyboard('{ArrowLeft}')
    expect(within(dialog).getByRole('radio', { name: /Eule/ })).toHaveAttribute('aria-checked', 'true')
    expect(within(dialog).getByLabelText(/^Name/)).toHaveValue('Flink')
    await user.click(within(dialog).getByRole('button', { name: 'Wechseln' }))

    await waitFor(async () => expect((await loadGameData()).profile?.companion).toMatchObject({ species: 'owl', name: 'Flink' }))
    expect(await screen.findByText('Gefährte gewechselt')).toBeInTheDocument()
    await waitFor(() => expect(companionCard()).toHaveAttribute('data-companion-card', 'owl'))
    expect(companionCard()).toHaveAttribute('data-companion-stage', '1')
  })

  it('schläft nach drei ruhigen Tagen – ganz ohne Vorwurf', async () => {
    await activeDays(5, addDays(TODAY, -4))
    await setCompanion({ species: 'owl', name: 'Nox' }, START)
    await renderHero()
    await waitFor(() => expect(companionCard()).toHaveAttribute('data-companion-sleeping'))
    const card = companionCard()
    expect(within(card).getByText('schläft')).toBeInTheDocument()
    expect(within(card).getByText(/Nox hält gerade ein Nickerchen – eine erledigte Quest weckt Nox wieder/)).toBeInTheDocument()
  })

  it('springt über /held#gefaehrte zur Gefährten-Karte', async () => {
    await setCompanion({ species: 'snake', name: 'Jade' }, START)
    await renderHero('/held#gefaehrte')
    await waitFor(() => expect(companionCard()).toHaveFocus())
  })
})

describe('Held → Tagebuch', () => {
  async function renderJournal() {
    const view = await renderHero('/held?tab=tagebuch')
    expect(screen.getByRole('tab', { name: 'Tagebuch' })).toHaveAttribute('aria-selected', 'true')
    await screen.findByRole('heading', { name: 'Tagebuch deines Abenteuers' })
    return view
  }

  function day(dayKey: DayKey): HTMLElement {
    const element = document.querySelector<HTMLElement>(`[data-journal-day="${dayKey}"]`)
    if (element === null) throw new Error(`Kein Tag ${dayKey}`)
    return element
  }

  it('zeigt die Chronik nach Tagen – heute oben, Ereignisse und Notizen mit Stimmung', async () => {
    await activeDays(3, addDays(TODAY, -1))
    await saveJournalNote(addDays(TODAY, -2), { text: 'Erste Seiten geschafft.', mood: '😄' }, TODAY)
    await renderJournal()

    const timeline = screen.getByRole('list', { name: 'Chronik nach Tagen' })
    const days = [...timeline.querySelectorAll('[data-journal-day]')].map((element) => element.getAttribute('data-journal-day'))
    expect(days[0]).toBe(TODAY)
    expect(days).toContain(START)
    expect(within(day(TODAY)).getByRole('heading', { name: /^Heute/ })).toBeInTheDocument()
    expect(within(day(START)).getByText('Dein Abenteuer beginnt')).toBeInTheDocument()

    const noted = day(addDays(TODAY, -2))
    const note = noted.querySelector<HTMLElement>('[data-journal-note]')
    expect(note).toHaveTextContent('Erste Seiten geschafft.')
    expect(note).toHaveTextContent('Strahlend')
    expect(note).toHaveTextContent('😄')
  })

  it('schreibt eine Notiz zu heute – mit Stimmung, abwählbar', async () => {
    const { user } = await renderJournal()
    await user.click(screen.getByRole('button', { name: 'Notiz schreiben' }))
    const dialog = await screen.findByRole('dialog', { name: 'Notiz zu heute' })
    expect(within(dialog).getByLabelText(/^Tag/)).toHaveValue(TODAY)
    const text = within(dialog).getByLabelText(/^Notiz/)
    expect(text).toHaveFocus()

    // Ohne Text und Stimmung gibt es nichts zu speichern.
    await user.click(within(dialog).getByRole('button', { name: 'Speichern' }))
    expect(within(dialog).getByText('Schreib ein paar Worte oder wähle eine Stimmung.')).toBeInTheDocument()

    const good = within(dialog).getByRole('radio', { name: 'Gut' })
    await user.click(good)
    expect(good).toHaveAttribute('aria-checked', 'true')
    await user.click(good)
    expect(good).toHaveAttribute('aria-checked', 'false')
    await user.click(within(dialog).getByRole('radio', { name: 'Müde' }))
    await user.type(text, 'Lange Schicht, trotzdem gelesen.')
    await user.click(within(dialog).getByRole('button', { name: 'Speichern' }))

    await waitFor(async () =>
      expect((await loadGameData()).journalNotes).toEqual([
        expect.objectContaining({ day: TODAY, text: 'Lange Schicht, trotzdem gelesen.', mood: '😴' }),
      ]),
    )
    expect(await screen.findByText('Ins Tagebuch geschrieben')).toBeInTheDocument()
    await waitFor(() => expect(day(TODAY).querySelector('[data-journal-note]')).toHaveTextContent('Lange Schicht'))
  })

  it('schreibt für einen früheren Tag, bearbeitet und löscht', async () => {
    const { user } = await renderJournal()
    await user.click(screen.getByRole('button', { name: 'Notiz schreiben' }))
    let dialog = await screen.findByRole('dialog', { name: 'Notiz zu heute' })
    // Zukunft und Tage vor dem Abenteuer gehen nicht.
    fireEvent.change(within(dialog).getByLabelText(/^Tag/), { target: { value: addDays(TODAY, 1) } })
    expect(within(dialog).getByText(/Die Zukunft ist noch ungeschrieben/)).toBeInTheDocument()
    expect(within(dialog).getByRole('button', { name: 'Speichern' })).toBeDisabled()
    fireEvent.change(within(dialog).getByLabelText(/^Tag/), { target: { value: '2026-11-02' } })
    expect(within(dialog).getByRole('heading', { name: 'Notiz zum 2. Nov.' })).toBeInTheDocument()
    await user.type(within(dialog).getByLabelText(/^Notiz/), 'Montag mit Rückenwind.')
    await user.click(within(dialog).getByRole('button', { name: 'Speichern' }))
    await waitFor(async () => expect((await loadGameData()).journalNotes?.map((note) => note.day)).toEqual(['2026-11-02']))

    await waitFor(() => expect(day('2026-11-02').querySelector('[data-journal-note]')).not.toBeNull())
    await user.click(within(day('2026-11-02')).getByRole('button', { name: 'Notiz zum 2. Nov. bearbeiten' }))
    dialog = await screen.findByRole('dialog', { name: 'Notiz zum 2. Nov.' })
    // Fester Tag: kein Datumsfeld, der Text ist geladen.
    expect(within(dialog).queryByLabelText(/^Tag/)).not.toBeInTheDocument()
    expect(within(dialog).getByLabelText(/^Notiz/)).toHaveValue('Montag mit Rückenwind.')
    await user.click(within(dialog).getByRole('button', { name: 'Löschen' }))
    await waitFor(async () => expect((await loadGameData()).journalNotes).toBeUndefined())
    expect(await screen.findByText('Notiz entfernt')).toBeInTheDocument()
  })

  it('nimmt beim Tageswechsel im Dialog keine geladene Notiz eines anderen Tages mit – eigener Text bleibt', async () => {
    await saveJournalNote(TODAY, { text: 'Heute war ein guter Tag.', mood: '😄' }, TODAY)
    const { user } = await renderJournal()
    await user.click(screen.getByRole('button', { name: 'Notiz schreiben' }))
    const dialog = await screen.findByRole('dialog', { name: 'Notiz zu heute' })
    const text = within(dialog).getByLabelText(/^Notiz/)
    expect(text).toHaveValue('Heute war ein guter Tag.')

    // Gestern hat noch keine Notiz: Die von heute wird nicht dorthin kopiert.
    fireEvent.change(within(dialog).getByLabelText(/^Tag/), { target: { value: addDays(TODAY, -1) } })
    expect(within(dialog).getByRole('heading', { name: 'Notiz zu gestern' })).toBeInTheDocument()
    expect(text).toHaveValue('')
    expect(within(dialog).getByRole('radio', { name: 'Strahlend' })).toHaveAttribute('aria-checked', 'false')

    // Selbst Getipptes geht beim Wechsel nicht verloren.
    await user.type(text, 'Nachgetragen.')
    fireEvent.change(within(dialog).getByLabelText(/^Tag/), { target: { value: addDays(TODAY, -2) } })
    expect(text).toHaveValue('Nachgetragen.')
    await user.click(within(dialog).getByRole('button', { name: 'Speichern' }))
    await waitFor(async () =>
      expect((await loadGameData()).journalNotes?.map((note) => [note.day, note.text])).toEqual([
        [addDays(TODAY, -2), 'Nachgetragen.'],
        [TODAY, 'Heute war ein guter Tag.'],
      ]),
    )
  })

  it('filtert „Nur Notizen“ und lädt lange Geschichten seitenweise', async () => {
    await saveProfile({ name: 'Aria', avatar: '🧙', createdDay: '2026-08-01' })
    const noteDays = dayRange(addDays(TODAY, -44), TODAY)
    for (const [index, noteDay] of noteDays.entries()) await saveJournalNote(noteDay, { text: `Eintrag ${index + 1}` }, TODAY)
    const { user } = await renderJournal()

    await user.click(screen.getByRole('radio', { name: 'Nur Notizen (45 Notizen)' }))
    const list = await screen.findByRole('list', { name: 'Deine Notizen' })
    expect(list.querySelectorAll('[data-journal-day]')).toHaveLength(30)
    expect(list.querySelectorAll('[data-journal-kind]')).toHaveLength(0)
    expect(screen.getByText('Noch 15 ältere Tage')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Ältere laden' }))
    expect(list.querySelectorAll('[data-journal-day]')).toHaveLength(45)
    expect(screen.queryByRole('button', { name: 'Ältere laden' })).not.toBeInTheDocument()
    // Der Fokus landet beim ersten neu geladenen Tag.
    const firstNew = noteDays[noteDays.length - 31]
    await waitFor(() => expect(document.activeElement).toBe(within(day(firstNew)).getByRole('heading')))

    // Zurück zu „Alles“: wieder die erste Seite.
    await user.click(screen.getByRole('radio', { name: 'Alles' }))
    expect(screen.getByRole('list', { name: 'Chronik nach Tagen' }).querySelectorAll('[data-journal-day]')).toHaveLength(30)
  })

  it('lädt an einem leeren Tag zum Schreiben ein – und im Filter ohne Notizen auch', async () => {
    const { user } = await renderJournal()
    expect(within(day(TODAY)).getByText('Noch nichts eingetragen – wie war dein Tag?')).toBeInTheDocument()
    await user.click(within(day(TODAY)).getByRole('button', { name: 'Notiz zu heute schreiben' }))
    const fixed = await screen.findByRole('dialog', { name: 'Notiz zu heute' })
    expect(within(fixed).queryByLabelText(/^Tag/)).not.toBeInTheDocument()
    await user.click(within(fixed).getByRole('button', { name: 'Abbrechen' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())

    await user.click(screen.getByRole('radio', { name: /^Nur Notizen/ }))
    expect(screen.getByRole('heading', { name: 'Noch keine Notizen' })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Erste Notiz schreiben' }))
    expect(await screen.findByRole('dialog', { name: 'Notiz zu heute' })).toBeInTheDocument()
  })

  it('führt vergangene Wochenrückblicke kompakt – aufklappbar zum ganzen Bericht', async () => {
    // Woche 26. Okt. – 1. Nov. vollständig gelesen.
    await activeDays(11, '2026-11-01')
    const { user } = await renderJournal()
    const sunday = day('2026-11-01')
    const review = sunday.querySelector<HTMLElement>('[data-journal-kind="weeklyReview"]')
    expect(review).not.toBeNull()
    expect(review).toHaveTextContent('Bericht des Gildenmeisters')
    expect(review).toHaveTextContent('Woche vom 26. Okt.')
    expect(review).toHaveTextContent(/Wochenrückblick: [\d.]+ XP · 7 Perfekte Tage/)

    const toggle = within(review as HTMLElement).getByRole('button', { name: 'Ganzen Bericht ansehen' })
    expect(toggle).toHaveAttribute('aria-expanded', 'false')
    await user.click(toggle)
    expect(toggle).toHaveAttribute('aria-expanded', 'true')
    expect(review).toHaveTextContent('Quests erledigt')
    expect(review).toHaveTextContent('Bester Streak')
    expect(review).toHaveTextContent('Intelligenz')
    // Dieselben Kacheln wie auf der Tagesübersicht: das Attribut in lesbar aufgehellter Farbe, nichts abgeschnitten,
    // was umbrechen kann (Boss-Namen sind lang).
    const attribute = (review as HTMLElement).querySelector<HTMLElement>('[data-review-stat="attribute"] [data-review-value]')
    expect(attribute).toHaveTextContent('Intelligenz')
    expect(attribute?.style.color).toContain('color-mix')
    const boss = (review as HTMLElement).querySelector<HTMLElement>('[data-review-stat="boss"]')
    if (boss !== null) {
      expect(boss).toHaveClass('max-sm:col-span-2')
      expect(boss.querySelector('[data-review-value]')).toHaveClass('line-clamp-2')
    }
  })
})

describe('Held → Tagebuch: volle Tage', () => {
  it('klappt einen Tag mit vielen Ereignissen zu und auf Wunsch auf', async () => {
    // Acht verschiedene Belohnungen heute eingelöst – jede ist ein eigener Eintrag (dazu ggf. Erfolge des Tages).
    const habit = await createHabit({ ...READING, difficulty: 'epic' }, START)
    for (const day of dayRange(START, TODAY)) await setCompletionValue(habit.id, day, 1)
    for (let i = 1; i <= 8; i++) {
      const reward = await createReward({ title: `Belohnung ${i}`, icon: '🎁', price: 10, repeatable: true })
      await purchaseReward(reward.id, TODAY)
    }
    const user = userEvent.setup()
    renderWithGame(<HeroPage />, { route: '/held?tab=tagebuch' })
    await screen.findByRole('heading', { name: 'Tagebuch deines Abenteuers' })
    const today = document.querySelector<HTMLElement>(`[data-journal-day="${TODAY}"]`) as HTMLElement
    const total = await waitFor(() => {
      const more = within(today).getByRole('button', { name: /weitere Einträge? anzeigen$/ })
      return Number(/^(\d+)/.exec(more.textContent ?? '')?.[1])
    })
    expect(today.querySelectorAll('[data-journal-kind]')).toHaveLength(5)
    await user.click(within(today).getByRole('button', { name: /weitere Einträge? anzeigen$/ }))
    expect(today.querySelectorAll('[data-journal-kind]')).toHaveLength(5 + total)
    expect(within(today).queryByRole('button', { name: /weitere Einträge? anzeigen$/ })).not.toBeInTheDocument()
  })
})
