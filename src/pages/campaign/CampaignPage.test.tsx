// @vitest-environment jsdom
import 'fake-indexeddb/auto'
import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MotionGlobalConfig } from 'motion/react'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import * as repository from '../../data/repository'
import type { HabitDraft, MainQuestDraft } from '../../data/repository'
import { deriveGameState } from '../../domain/engine'
import type { Chapter, DayKey, MainQuest } from '../../domain/types'
import { renderWithGame } from '../../test/renderWithGame'
import { CampaignPage } from '../CampaignPage'

// Fehlerfall: setChapterManual kann gezielt fehlschlagen, sonst gilt die echte Implementierung.
const failures = vi.hoisted(() => ({ manual: false }))
vi.mock('../../data/repository', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../data/repository')>()
  return {
    ...actual,
    setChapterManual: async (...args: Parameters<typeof actual.setChapterManual>) => {
      if (failures.manual) throw new Error('Diese Kampagne gibt es nicht (mehr).')
      return actual.setChapterManual(...args)
    },
  }
})

const {
  archiveHabit,
  createHabit,
  createMainQuest,
  deleteHabit,
  loadGameData,
  resetAllData,
  saveProfile,
  setCompletionValue,
} = repository

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

const MANUAL: Chapter = { id: 'manual', title: 'Das erste Buch', criterion: { type: 'manual' } }
const COUNTER: Chapter = {
  id: 'counter',
  title: 'Der Gelehrte',
  criterion: { type: 'counter', target: 3, label: 'Bücher beendet' },
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
  failures.manual = false
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

/** Element, dessen gesamter Text genau `text` ist (Text über mehrere Spans verteilt). */
function byFullText(text: string) {
  return (_: string, element: Element | null) =>
    element !== null &&
    element.textContent?.replace(/\s+/g, ' ').trim() === text &&
    Array.from(element.children).every((child) => child.textContent?.replace(/\s+/g, ' ').trim() !== text)
}

async function firstQuest() {
  const data = await loadGameData()
  return data.mainQuests[0]
}

async function totalXp(): Promise<number> {
  return deriveGameState(await loadGameData(), TODAY).level.totalXp
}

/** Drei Kampagnen mit aufsteigendem createdAt (bei angehaltener Uhr sonst gleich alt). */
async function threeCampaigns(): Promise<MainQuest[]> {
  const quests: MainQuest[] = []
  const drafts = [
    campaign([MANUAL], { title: 'Der Weg des Gelehrten', icon: '📚' }),
    campaign([COUNTER], { title: 'Halbmarathon im Juni', icon: '🏃' }),
    campaign([MANUAL], { title: 'Sprache lernen', icon: '🗣️' }),
  ]
  for (const [index, draft] of drafts.entries()) {
    vi.setSystemTime(new Date(2026, 10, 3, 12, 0, index))
    quests.push(await createMainQuest(draft))
  }
  vi.setSystemTime(new Date(2026, 10, 3, 12, 0, 0))
  return quests
}

/** Kampagne mit Quest-Ziel „Drei Tage“ (3 Erledigungen ab Start 29.10.) – erreicht am 1. November. */
async function readingCampaign(chapters: Chapter[] = []) {
  const habit = await createHabit(READING, '2026-10-25')
  for (const day of ['2026-10-30', '2026-10-31', '2026-11-01']) await setCompletionValue(habit.id, day, 10)
  const threeDays: Chapter = {
    id: 'three',
    title: 'Drei Tage',
    criterion: { type: 'habit', habitId: habit.id, metric: 'completions', target: 3 },
  }
  const quest = await createMainQuest(campaign([threeDays, ...chapters], { startDay: '2026-10-29' }))
  return { habit, quest }
}

describe('CampaignPage – ohne Kampagne', () => {
  it('bietet die Vorlage an und richtet sie ein', async () => {
    const { user } = await renderPage()
    expect(screen.getByRole('heading', { name: 'Wähle deine Kampagne' })).toBeInTheDocument()
    // Einheitliche Begriffe: „Kampagne“, nicht „Hauptquest“.
    expect(screen.queryByText(/Hauptquest/)).not.toBeInTheDocument()
    expect(screen.getByText('Dein großes Ziel')).toBeInTheDocument()
    const template = screen.getByRole('article', { name: 'Der Weg des Gelehrten' })
    expect(within(template).getByText('5 Quests')).toBeInTheDocument()
    expect(within(template).getByText('6 Kapitel')).toBeInTheDocument()
    expect(within(template).getByText('1 Jahr')).toBeInTheDocument()

    await user.click(within(template).getByRole('button', { name: 'Kampagne beginnen' }))

    const heading = await screen.findByRole('heading', { level: 2, name: 'Der Weg des Gelehrten' })
    await waitFor(() => expect(heading).toHaveFocus())
    expect(await screen.findByText('Kampagne begonnen')).toBeInTheDocument()

    const data = await loadGameData()
    expect(data.mainQuests).toHaveLength(1)
    expect(data.mainQuests[0].startDay).toBe(TODAY)
    expect(data.habits).toHaveLength(5)
    expect(data.habits.every((habit) => habit.mainQuestId === data.mainQuests[0].id)).toBe(true)

    // Banner, Kapitel und verknüpfte Quests
    expect(screen.getByText('Mein Warum')).toBeInTheDocument()
    expect(screen.getByText('noch 365 Tage')).toBeInTheDocument()
    expect(screen.getByText('+100 XP pro Kapitel · +500 XP für die Kampagne')).toBeInTheDocument()
    expect(screen.getByText('Aktuelles Kapitel')).toBeInTheDocument()
    const linked = screen.getByRole('region', { name: 'Quests dieser Kampagne' })
    expect(within(linked).getAllByRole('listitem')).toHaveLength(5)
  })

  it('legt eine eigene Kampagne mit Kapitel an', async () => {
    const { user } = await renderPage()
    await user.click(screen.getByRole('button', { name: 'Eigene Kampagne erstellen' }))
    const dialog = await screen.findByRole('dialog', { name: 'Neue Kampagne' })

    await user.type(within(dialog).getByLabelText(/^Titel/), 'Halbmarathon')
    await user.type(within(dialog).getByLabelText(/^Warum/), 'Weil ich es kann.')
    await user.type(within(dialog).getByLabelText('Belohnung'), 'Neue Laufschuhe')
    expect(within(dialog).getByLabelText(/^Start/)).toHaveValue(TODAY)
    await user.click(within(dialog).getByRole('button', { name: '90 Tage' }))
    expect(within(dialog).getByLabelText('Zieldatum')).toHaveValue('2027-02-01')

    await user.click(within(dialog).getByRole('button', { name: 'Kapitel hinzufügen' }))
    const chapterDialog = await screen.findByRole('dialog', { name: 'Neues Kapitel' })
    await user.type(within(chapterDialog).getByLabelText(/^Titel/), 'Erste 5 km')
    await user.click(within(chapterDialog).getByRole('button', { name: 'Hinzufügen' }))
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Neues Kapitel' })).not.toBeInTheDocument())
    expect(within(dialog).getByText('Erste 5 km')).toBeInTheDocument()

    await user.click(within(dialog).getByRole('button', { name: 'Kampagne erstellen' }))

    const heading = await screen.findByRole('heading', { level: 2, name: 'Halbmarathon' })
    await waitFor(() => expect(heading).toHaveFocus())
    const quest = await firstQuest()
    expect(quest).toMatchObject({
      title: 'Halbmarathon',
      why: 'Weil ich es kann.',
      reward: 'Neue Laufschuhe',
      startDay: TODAY,
      deadline: '2027-02-01',
    })
    expect(quest.chapters.map((chapter) => chapter.title)).toEqual(['Erste 5 km'])
    expect(screen.getByRole('button', { name: 'Als erledigt markieren' })).toBeInTheDocument()
  })

  it('prüft das Formular: Pflichtfelder und Zieldatum vor dem Start', async () => {
    const { user } = await renderPage()
    await user.click(screen.getByRole('button', { name: 'Eigene Kampagne erstellen' }))
    const dialog = await screen.findByRole('dialog', { name: 'Neue Kampagne' })

    await user.click(within(dialog).getByRole('button', { name: 'Kampagne erstellen' }))
    expect(within(dialog).getByText('Gib deiner Kampagne einen Namen.')).toBeInTheDocument()
    expect(within(dialog).getByLabelText(/^Titel/)).toHaveFocus()

    await user.type(within(dialog).getByLabelText(/^Titel/), 'Halbmarathon')
    await user.type(within(dialog).getByLabelText(/^Warum/), 'Weil ich es kann.')
    fireEvent.change(within(dialog).getByLabelText('Zieldatum'), { target: { value: '2026-11-01' } })
    expect(within(dialog).getByText('Das Zieldatum darf nicht vor dem Start liegen.')).toBeInTheDocument()

    await user.click(within(dialog).getByRole('button', { name: 'Kampagne erstellen' }))
    expect(within(dialog).getByLabelText('Zieldatum')).toHaveFocus()
    expect(within(dialog).getByLabelText('Zieldatum')).toHaveAttribute('aria-invalid', 'true')
    expect((await loadGameData()).mainQuests).toHaveLength(0)

    fireEvent.change(within(dialog).getByLabelText('Zieldatum'), { target: { value: TODAY } })
    expect(within(dialog).queryByText('Das Zieldatum darf nicht vor dem Start liegen.')).not.toBeInTheDocument()
  })
})

describe('CampaignPage – Kapitel', () => {
  it('zählt Zähler-Kapitel hoch und runter', async () => {
    await createMainQuest(campaign([COUNTER]))
    const { user } = await renderPage()
    const minus = screen.getByRole('button', { name: 'Bücher beendet verringern' })
    const plus = screen.getByRole('button', { name: 'Bücher beendet erhöhen' })
    expect(minus).toHaveAttribute('aria-disabled', 'true')

    await user.click(plus)
    await user.click(plus)
    await user.click(plus)
    await waitFor(async () => expect((await firstQuest()).chapters[0]).toMatchObject({ counter: 3, completedDay: TODAY }))
    expect(await screen.findByText('Abgeschlossen am 3. Nov.')).toBeInTheDocument()
    expect(screen.getByRole('progressbar', { name: 'Fortschritt: Der Gelehrte' })).toHaveAttribute(
      'aria-valuetext',
      'Bücher beendet: 3 von 3',
    )
    expect(screen.getByText('Bücher beendet: 3 von 3 – Kapitel „Der Gelehrte“ abgeschlossen!')).toBeInTheDocument()

    await user.click(minus)
    await waitFor(async () => expect((await firstQuest()).chapters[0].counter).toBe(2))
    expect((await firstQuest()).chapters[0].completedDay).toBeUndefined()
    await waitFor(() => expect(screen.queryByText('Abgeschlossen am 3. Nov.')).not.toBeInTheDocument())
    expect(screen.getByText(byFullText('2 / 3 Bücher beendet'))).toBeInTheDocument()
  })

  it('hakt manuelle Kapitel ab und wieder auf – der Fokus bleibt auf dem Button', async () => {
    await createMainQuest(campaign([MANUAL, COUNTER]))
    const { user } = await renderPage()
    const button = screen.getByRole('button', { name: 'Als erledigt markieren' })
    await user.click(button)

    expect(await screen.findByText('Abgeschlossen am 3. Nov.')).toBeInTheDocument()
    const undo = screen.getByRole('button', { name: 'Rückgängig' })
    expect(undo).toHaveFocus()
    expect((await firstQuest()).chapters[0]).toMatchObject({ manualDone: true, completedDay: TODAY })
    // Jetzt ist das zweite Kapitel das aktuelle.
    const current = screen.getAllByRole('listitem').find((item) => item.getAttribute('aria-current') === 'step')
    expect(current).toHaveTextContent('Der Gelehrte')

    await user.click(undo)
    expect(await screen.findByRole('button', { name: 'Als erledigt markieren' })).toHaveFocus()
    expect((await firstQuest()).chapters[0].manualDone).toBe(false)
  })

  it('zeigt Fortschritt von Quest-Zielen: Erledigungen, Gesamtmenge, Streak', async () => {
    const habit = await createHabit(READING, '2026-10-25')
    for (const [day, value] of [
      ['2026-10-30', 10],
      ['2026-10-31', 12],
      ['2026-11-01', 4],
      ['2026-11-02', 10],
    ] as const) {
      await setCompletionValue(habit.id, day, value)
    }
    await createMainQuest(
      campaign([
        { id: 'a', title: 'Funke', criterion: { type: 'habit', habitId: habit.id, metric: 'completions', target: 7 } },
        { id: 'b', title: 'Seiten', criterion: { type: 'habit', habitId: habit.id, metric: 'total', target: 1000 } },
        { id: 'c', title: 'Serie', criterion: { type: 'habit', habitId: habit.id, metric: 'streak', target: 21 } },
      ]),
    )
    await renderPage()
    expect(screen.getByText(byFullText('3 / 7 Tage'))).toBeInTheDocument()
    expect(screen.getByText(byFullText('36 / 1.000 Seiten'))).toBeInTheDocument()
    expect(screen.getByText(byFullText('Bester Streak 2 / 21 Tage'))).toBeInTheDocument()
    expect(screen.getAllByText('Lesen').length).toBeGreaterThanOrEqual(3)
  })

  it('weist darauf hin, wenn die Quest eines Quest-Ziels archiviert ist', async () => {
    const habit = await createHabit(READING, '2026-10-25')
    await setCompletionValue(habit.id, '2026-11-01', 10)
    await archiveHabit(habit.id, '2026-11-02')
    await createMainQuest(
      campaign([{ id: 'a', title: 'Funke', criterion: { type: 'habit', habitId: habit.id, metric: 'completions', target: 7 } }]),
    )
    await renderPage()
    const chapter = screen.getByRole('article', { name: 'Funke' })
    expect(within(chapter).getByText(byFullText('1 / 7 Tage'))).toBeInTheDocument()
    // Ohne Hinweis stünde das Kapitel still, ohne dass man erfährt, warum.
    expect(within(chapter).getByText(/Quest ist archiviert/)).toBeInTheDocument()
  })

  it('warnt bei gelöschter Quest und bietet die Bearbeitung an', async () => {
    const habit = await createHabit(READING, '2026-10-25')
    await createMainQuest(
      campaign([{ id: 'a', title: 'Funke', criterion: { type: 'habit', habitId: habit.id, metric: 'completions', target: 7 } }]),
    )
    await deleteHabit(habit.id)
    const { user } = await renderPage()

    expect(screen.getByText('Verknüpfte Quest gelöscht.')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Kapitel bearbeiten' }))
    const dialog = await screen.findByRole('dialog', { name: 'Kapitel bearbeiten' })
    expect(within(dialog).getByText(/bisher verknüpfte Quest wurde gelöscht/)).toBeInTheDocument()

    // Auf "Abhaken" umstellen repariert das Kapitel.
    await user.click(within(dialog).getByRole('radio', { name: 'Abhaken' }))
    await user.click(within(dialog).getByRole('button', { name: 'Speichern' }))
    await waitFor(async () => expect((await firstQuest()).chapters[0].criterion).toEqual({ type: 'manual' }))
    expect(await screen.findByRole('button', { name: 'Als erledigt markieren' })).toBeInTheDocument()
  })

  it('bearbeitet und löscht ein Kapitel direkt aus der Zeitleiste', async () => {
    await createMainQuest(campaign([MANUAL, COUNTER]))
    const { user } = await renderPage()

    await user.click(screen.getByRole('button', { name: 'Kapitel „Der Gelehrte“ bearbeiten' }))
    let dialog = await screen.findByRole('dialog', { name: 'Kapitel bearbeiten' })
    const target = within(dialog).getByLabelText(/^Ziel/)
    await user.clear(target)
    await user.type(target, '12')
    await user.click(within(dialog).getByRole('button', { name: 'Speichern' }))
    await waitFor(async () =>
      expect((await firstQuest()).chapters[1].criterion).toEqual({ type: 'counter', target: 12, label: 'Bücher beendet' }),
    )

    // Neues Kapitel ans Ende
    await user.click(screen.getByRole('button', { name: 'Kapitel hinzufügen' }))
    dialog = await screen.findByRole('dialog', { name: 'Neues Kapitel' })
    expect(within(dialog).getByText(/Kapitel 3/)).toBeInTheDocument()
    await user.type(within(dialog).getByLabelText(/^Titel/), 'Finale')
    await user.click(within(dialog).getByRole('button', { name: 'Kapitel anlegen' }))
    await waitFor(async () => expect((await firstQuest()).chapters.map((c) => c.title)).toEqual(['Das erste Buch', 'Der Gelehrte', 'Finale']))

    // Löschen mit Rückfrage
    await user.click(await screen.findByRole('button', { name: 'Kapitel „Das erste Buch“ bearbeiten' }))
    dialog = await screen.findByRole('dialog', { name: 'Kapitel bearbeiten' })
    await user.click(within(dialog).getByRole('button', { name: 'Löschen' }))
    const confirm = await screen.findByRole('alertdialog', { name: 'Kapitel löschen?' })
    // Das Kapitel ist offen – es gehen keine XP verloren, also auch keine Warnung davor.
    expect(confirm).not.toHaveTextContent('XP')
    await user.click(within(confirm).getByRole('button', { name: 'Löschen' }))
    await waitFor(async () => expect((await firstQuest()).chapters.map((c) => c.title)).toEqual(['Der Gelehrte', 'Finale']))
    await waitFor(() => expect(screen.getByRole('button', { name: 'Kapitel hinzufügen' })).toHaveFocus())
  })

  it('verwaltet Kapitel im Kampagnen-Dialog: hinzufügen, bearbeiten, umsortieren, löschen', async () => {
    await createMainQuest(campaign([MANUAL, COUNTER]))
    const { user } = await renderPage()
    await user.click(screen.getByRole('button', { name: 'Bearbeiten' }))
    const dialog = await screen.findByRole('dialog', { name: 'Kampagne bearbeiten' })

    // Hinzufügen (Zähler)
    await user.click(within(dialog).getByRole('button', { name: 'Kapitel hinzufügen' }))
    let chapterDialog = await screen.findByRole('dialog', { name: 'Neues Kapitel' })
    await user.type(within(chapterDialog).getByLabelText(/^Titel/), 'Laufkilometer')
    await user.click(within(chapterDialog).getByRole('radio', { name: 'Zähler' }))
    await user.type(within(chapterDialog).getByLabelText(/^Ziel/), '300')
    await user.type(within(chapterDialog).getByLabelText('Bezeichnung'), 'km gelaufen')
    await user.click(within(chapterDialog).getByRole('button', { name: 'Hinzufügen' }))
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Neues Kapitel' })).not.toBeInTheDocument())

    // Bearbeiten
    await user.click(within(dialog).getByRole('button', { name: 'Kapitel 1 „Das erste Buch“ bearbeiten' }))
    chapterDialog = await screen.findByRole('dialog', { name: 'Kapitel bearbeiten' })
    const title = within(chapterDialog).getByLabelText(/^Titel/)
    await user.clear(title)
    await user.type(title, 'Das erste Kapitel')
    await user.click(within(chapterDialog).getByRole('button', { name: 'Übernehmen' }))
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Kapitel bearbeiten' })).not.toBeInTheDocument())

    // Umsortieren: „Laufkilometer“ ganz nach oben – der Fokus bleibt auf dem Pfeil (am Rand: der andere)
    await user.click(within(dialog).getByRole('button', { name: '„Laufkilometer“ nach oben' }))
    await user.click(within(dialog).getByRole('button', { name: '„Laufkilometer“ nach oben' }))
    expect(within(dialog).getByRole('button', { name: '„Laufkilometer“ nach oben' })).toBeDisabled()
    expect(within(dialog).getByRole('button', { name: '„Laufkilometer“ nach unten' })).toHaveFocus()

    // Löschen mit Rückfrage
    await user.click(within(dialog).getByRole('button', { name: 'Kapitel „Der Gelehrte“ löschen' }))
    const confirm = await screen.findByRole('alertdialog', { name: 'Kapitel löschen?' })
    await user.click(within(confirm).getByRole('button', { name: 'Löschen' }))
    await waitFor(() => expect(within(dialog).queryByText('Der Gelehrte')).not.toBeInTheDocument())

    // Noch nichts gespeichert …
    expect((await firstQuest()).chapters.map((c) => c.title)).toEqual(['Das erste Buch', 'Der Gelehrte'])
    await user.click(within(dialog).getByRole('button', { name: 'Speichern' }))
    await waitFor(async () =>
      expect((await firstQuest()).chapters.map((c) => c.title)).toEqual(['Laufkilometer', 'Das erste Kapitel']),
    )
    const quest = await firstQuest()
    expect(quest.chapters[0].criterion).toEqual({ type: 'counter', target: 300, label: 'km gelaufen' })
    expect(quest.chapters[1].id).toBe('manual')
    expect(await screen.findByText('Kampagne gespeichert')).toBeInTheDocument()
  })

  it('zeigt einen Fehler-Toast, wenn das Speichern scheitert', async () => {
    await createMainQuest(campaign([MANUAL]))
    failures.manual = true
    const { user } = await renderPage()
    await user.click(screen.getByRole('button', { name: 'Als erledigt markieren' }))
    expect(await screen.findByText('Kapitel konnte nicht gespeichert werden')).toBeInTheDocument()
    expect(screen.getByText('Diese Kampagne gibt es nicht (mehr).')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Als erledigt markieren' })).toBeInTheDocument()
  })
})

describe('CampaignPage – Kampagne', () => {
  it('zeigt Zeitrahmen, Fortschritt und die gemeisterte Kampagne', async () => {
    await createMainQuest(
      campaign([{ ...MANUAL, manualDone: true, completedDay: '2026-11-01' }], { deadline: '2026-10-31' }),
    )
    await renderPage()
    expect(screen.getByRole('heading', { name: 'Kampagne gemeistert!' })).toBeInTheDocument()
    expect(screen.getAllByText('Neue Laufschuhe').length).toBeGreaterThan(0)
    expect(screen.getByText('Abgeschlossen am 1. Nov.')).toBeInTheDocument()
    expect(screen.getByText(byFullText('1 / 1 Kapitel abgeschlossen'))).toBeInTheDocument()
    expect(screen.getByText('100 %')).toBeInTheDocument()
    expect(screen.getByText('geschafft')).toBeInTheDocument()
  })

  it('nennt beim Löschen die XP, die verloren gehen', async () => {
    await createMainQuest(campaign([{ ...MANUAL, manualDone: true, completedDay: '2026-11-01' }, COUNTER]))
    const { user } = await renderPage()
    await user.click(screen.getByRole('button', { name: 'Kapitel „Das erste Buch“ bearbeiten' }))
    const chapterDialog = await screen.findByRole('dialog', { name: 'Kapitel bearbeiten' })
    await user.click(within(chapterDialog).getByRole('button', { name: 'Löschen' }))
    const confirmChapter = await screen.findByRole('alertdialog', { name: 'Kapitel löschen?' })
    expect(confirmChapter).toHaveTextContent('100 XP')
    await user.click(within(confirmChapter).getByRole('button', { name: 'Abbrechen' }))
    await user.click(within(chapterDialog).getByRole('button', { name: 'Abbrechen' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())

    await user.click(screen.getByRole('button', { name: 'Bearbeiten' }))
    const dialog = await screen.findByRole('dialog', { name: 'Kampagne bearbeiten' })
    await user.click(within(dialog).getByRole('button', { name: 'Löschen' }))
    const confirm = await screen.findByRole('alertdialog', { name: 'Kampagne löschen?' })
    expect(confirm).toHaveTextContent('100 XP')
  })

  it('zählt beim Löschen einer gemeisterten Kampagne auch den Kampagnen-Bonus mit', async () => {
    await createMainQuest(campaign([{ ...MANUAL, manualDone: true, completedDay: '2026-11-01' }]))
    const { user } = await renderPage()
    // Das einzige Kapitel löschen: Ohne Kapitel ist die Kampagne nicht mehr gemeistert.
    await user.click(screen.getByRole('button', { name: 'Kapitel „Das erste Buch“ bearbeiten' }))
    const chapterDialog = await screen.findByRole('dialog', { name: 'Kapitel bearbeiten' })
    await user.click(within(chapterDialog).getByRole('button', { name: 'Löschen' }))
    expect(await screen.findByRole('alertdialog', { name: 'Kapitel löschen?' })).toHaveTextContent('600 XP')
  })

  it('zeigt überfällige Kampagnen', async () => {
    await createMainQuest(campaign([MANUAL], { deadline: '2026-10-31' }))
    await renderPage()
    expect(screen.getByText('seit 3 Tagen überfällig')).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Kampagne gemeistert!' })).not.toBeInTheDocument()
  })

  it('führt mit „Quest hinzufügen“ zum Anlege-Dialog der Quests', async () => {
    const quest = await createMainQuest(campaign([MANUAL]))
    await createHabit({ ...READING, mainQuestId: quest.id }, TODAY)
    const { user, router } = await renderPage()
    const linked = screen.getByRole('region', { name: 'Quests dieser Kampagne' })
    expect(within(linked).getByText('Lesen')).toBeInTheDocument()
    expect(within(linked).getByText('Täglich · 10 Seiten')).toBeInTheDocument()

    await user.click(within(linked).getByRole('button', { name: 'Quest hinzufügen' }))
    expect(router.state.location.pathname).toBe('/quests')
    const params = new URLSearchParams(router.state.location.search)
    expect(params.get('neu')).toBe('1')
    expect(params.get('kampagne')).toBe(quest.id)
  })

  it('wechselt zwischen mehreren Kampagnen', async () => {
    await createMainQuest(campaign([MANUAL]))
    // Kampagnen sind nach createdAt sortiert – bei angehaltener Uhr sonst gleich alt.
    vi.setSystemTime(new Date(2026, 10, 3, 12, 0, 1))
    await createMainQuest(campaign([COUNTER], { title: 'Sprache lernen', icon: '🗣️' }))
    vi.setSystemTime(new Date(2026, 10, 3, 12, 0, 0))
    const { user } = await renderPage()
    expect(screen.getByRole('heading', { level: 2, name: 'Halbmarathon' })).toBeInTheDocument()
    await user.click(screen.getByRole('radio', { name: /Sprache lernen/ }))
    expect(screen.getByRole('heading', { level: 2, name: 'Sprache lernen' })).toBeInTheDocument()
  })

  it('öffnet die laufende Kampagne statt einer bereits gemeisterten', async () => {
    await createMainQuest(campaign([{ ...MANUAL, manualDone: true, completedDay: '2026-11-01' }]))
    vi.setSystemTime(new Date(2026, 10, 3, 12, 0, 1))
    await createMainQuest(campaign([COUNTER], { title: 'Sprache lernen', icon: '🗣️' }))
    vi.setSystemTime(new Date(2026, 10, 3, 12, 0, 0))
    await renderPage()
    expect(screen.getByRole('heading', { level: 2, name: 'Sprache lernen' })).toBeInTheDocument()
    expect(screen.getByRole('radio', { name: /Sprache lernen/ })).toHaveAttribute('aria-checked', 'true')
    expect(screen.queryByRole('heading', { name: 'Kampagne gemeistert!' })).not.toBeInTheDocument()
  })

  it('bleibt bei der gezeigten Kampagne, wenn sie gerade gemeistert wird', async () => {
    await createMainQuest(campaign([MANUAL]))
    vi.setSystemTime(new Date(2026, 10, 3, 12, 0, 1))
    await createMainQuest(campaign([COUNTER], { title: 'Sprache lernen', icon: '🗣️' }))
    vi.setSystemTime(new Date(2026, 10, 3, 12, 0, 0))
    const { user } = await renderPage()
    expect(screen.getByRole('heading', { level: 2, name: 'Halbmarathon' })).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Als erledigt markieren' }))
    expect(await screen.findByRole('heading', { name: 'Kampagne gemeistert!' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { level: 2, name: 'Halbmarathon' })).toBeInTheDocument()
  })

  it('erklärt eine Kampagne ohne Kapitel statt „0 / 0“ zu zeigen', async () => {
    await createMainQuest(campaign([]))
    await renderPage()
    const banner = screen.getByRole('region', { name: 'Halbmarathon' })
    expect(within(banner).getByText(/Noch keine Kapitel/)).toBeInTheDocument()
    expect(within(banner).queryByText(byFullText('0 / 0 Kapitel abgeschlossen'))).not.toBeInTheDocument()
    expect(within(banner).queryByRole('progressbar')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Erstes Kapitel anlegen' })).toBeInTheDocument()
  })

  it('löscht die Kampagne – verknüpfte Quests bleiben, werden aber gelöst', async () => {
    const quest = await createMainQuest(campaign([MANUAL]))
    const habit = await createHabit({ ...READING, mainQuestId: quest.id }, TODAY)
    const { user } = await renderPage()

    await user.click(screen.getByRole('button', { name: 'Bearbeiten' }))
    const dialog = await screen.findByRole('dialog', { name: 'Kampagne bearbeiten' })
    await user.click(within(dialog).getByRole('button', { name: 'Löschen' }))
    const confirm = await screen.findByRole('alertdialog', { name: 'Kampagne löschen?' })
    expect(confirm).toHaveTextContent('Deine Quests bleiben erhalten')
    // Kein Kapitel abgeschlossen → keine XP, die verloren gehen könnten.
    expect(confirm).not.toHaveTextContent('XP')
    await user.click(within(confirm).getByRole('button', { name: 'Endgültig löschen' }))

    const heading = await screen.findByRole('heading', { name: 'Wähle deine Kampagne' })
    await waitFor(() => expect(heading).toHaveFocus())
    expect(await screen.findByText('Kampagne gelöscht')).toBeInTheDocument()
    const data = await loadGameData()
    expect(data.mainQuests).toHaveLength(0)
    expect(data.habits.find((h) => h.id === habit.id)?.mainQuestId).toBeUndefined()
  })
})

describe('CampaignPage – Auswahl in der Adresse', () => {
  it('zeigt die Kampagne aus ?id= und schreibt eine neue Auswahl zurück', async () => {
    const [, second, third] = await threeCampaigns()
    const user = userEvent.setup()
    const { router } = renderWithGame(<CampaignPage />, { route: `/kampagne?id=${second.id}` })
    expect(await screen.findByRole('heading', { level: 2, name: 'Halbmarathon im Juni' })).toBeInTheDocument()
    expect(screen.getByRole('radio', { name: /Halbmarathon im Juni/ })).toHaveAttribute('aria-checked', 'true')

    await user.click(screen.getByRole('radio', { name: /Sprache lernen/ }))
    expect(screen.getByRole('heading', { level: 2, name: 'Sprache lernen' })).toBeInTheDocument()
    expect(router.state.location.search).toBe(`?id=${third.id}`)
    // Ersetzt den Eintrag – „Zurück“ führt nicht durch jede Auswahl.
    expect(router.state.historyAction).toBe('REPLACE')
  })

  it('fällt bei einer unbekannten ID auf die laufende Kampagne zurück', async () => {
    await threeCampaigns()
    renderWithGame(<CampaignPage />, { route: '/kampagne?id=gibt-es-nicht' })
    expect(await screen.findByRole('heading', { level: 2, name: 'Der Weg des Gelehrten' })).toBeInTheDocument()
  })

  it('kehrt nach „Quest hinzufügen“ mit „Zurück“ zur gewählten Kampagne zurück', async () => {
    const [, second] = await threeCampaigns()
    const user = userEvent.setup()
    const { router } = renderWithGame(<CampaignPage />, { route: '/kampagne' })
    await screen.findByRole('heading', { level: 2, name: 'Der Weg des Gelehrten' })
    await user.click(screen.getByRole('radio', { name: /Halbmarathon im Juni/ }))
    await user.click(screen.getByRole('button', { name: 'Quest hinzufügen' }))
    expect(router.state.location.pathname).toBe('/quests')
    expect(new URLSearchParams(router.state.location.search).get('kampagne')).toBe(second.id)

    await router.navigate(-1)
    await waitFor(() => expect(router.state.location.search).toBe(`?id=${second.id}`))
    expect(await screen.findByRole('heading', { level: 2, name: 'Halbmarathon im Juni' })).toBeInTheDocument()
  })

  it('merkt sich die Auswahl auch über einen Seitenwechsel ohne ?id= (Navigation „Kampagne“)', async () => {
    const [, , third] = await threeCampaigns()
    const user = userEvent.setup()
    renderWithGame(<CampaignPage />, { route: '/kampagne' })
    await user.click(await screen.findByRole('radio', { name: /Sprache lernen/ }))
    cleanup()

    // Später wieder über die Navigation (/kampagne ohne Parameter) geöffnet
    const { router } = renderWithGame(<CampaignPage />, { route: '/kampagne' })
    expect(await screen.findByRole('heading', { level: 2, name: 'Sprache lernen' })).toBeInTheDocument()
    expect(router.state.location.search).toBe('')
    expect(third.id).toBeTruthy()
  })

  it('wählt nach dem Anlegen die neue Kampagne – auch in der Adresse', async () => {
    await createMainQuest(campaign([MANUAL]))
    const { user, router } = await renderPage()
    await user.click(screen.getByRole('button', { name: 'Weitere Kampagne beginnen' }))
    const dialog = await screen.findByRole('dialog', { name: 'Neue Kampagne' })
    await user.type(within(dialog).getByLabelText(/^Titel/), 'Sprache lernen')
    await user.type(within(dialog).getByLabelText(/^Warum/), 'Reisen.')
    await user.click(within(dialog).getByRole('button', { name: 'Kampagne erstellen' }))
    expect(await screen.findByRole('heading', { level: 2, name: 'Sprache lernen' })).toBeInTheDocument()
    const created = (await loadGameData()).mainQuests.find((quest) => quest.title === 'Sprache lernen')
    expect(router.state.location.search).toBe(`?id=${created?.id}`)
  })

  it('zeigt auf schmalen Bildschirmen eine Auswahlliste mit vollen Titeln', async () => {
    const [first, second] = await threeCampaigns()
    const matchMedia = vi.fn((query: string) => ({
      matches: query.includes('max-width'),
      media: query,
      addEventListener: () => {},
      removeEventListener: () => {},
    }))
    vi.stubGlobal('matchMedia', matchMedia)
    try {
      const user = userEvent.setup()
      const { router } = renderWithGame(<CampaignPage />, { route: `/kampagne?id=${first.id}` })
      const select = await screen.findByRole('combobox', { name: 'Kampagne' })
      expect(screen.queryByRole('radiogroup', { name: 'Kampagne wählen' })).not.toBeInTheDocument()
      expect(within(select).getAllByRole('option').map((option) => option.textContent)).toEqual([
        '📚 Der Weg des Gelehrten',
        '🏃 Halbmarathon im Juni',
        '🗣️ Sprache lernen',
      ])
      await user.selectOptions(select, second.id)
      expect(await screen.findByRole('heading', { level: 2, name: 'Halbmarathon im Juni' })).toBeInTheDocument()
      expect(router.state.location.search).toBe(`?id=${second.id}`)
    } finally {
      vi.unstubAllGlobals()
    }
  })

  it('zählt im Abschnitt „Kapitel“ die abgeschlossenen Kapitel', async () => {
    await createMainQuest(campaign([{ ...MANUAL, manualDone: true, completedDay: '2026-11-01' }, COUNTER]))
    await renderPage()
    // Gleiche Bedeutung wie auf dem Dashboard: „X / Y“ = abgeschlossene Kapitel.
    expect(screen.getByRole('heading', { level: 2, name: /^Kapitel\b.*1 \/ 2 abgeschlossen$/ })).toBeInTheDocument()
  })
})

describe('CampaignPage – XP-Verlust beim Bearbeiten', () => {
  it('fragt im Kampagnen-Dialog nach, wenn ein späterer Start ein Kapitel kippt', async () => {
    await readingCampaign([MANUAL])
    const { user } = await renderPage()
    const xpBefore = await totalXp()

    await user.click(screen.getByRole('button', { name: 'Bearbeiten' }))
    const dialog = await screen.findByRole('dialog', { name: 'Kampagne bearbeiten' })
    fireEvent.change(within(dialog).getByLabelText(/^Start/), { target: { value: '2026-10-31' } })
    await user.click(within(dialog).getByRole('button', { name: 'Speichern' }))
    let confirm = await screen.findByRole('alertdialog', { name: 'Änderung kostet XP' })
    expect(confirm).toHaveTextContent('Kapitel „Drei Tage“ verliert seinen Abschluss. Dadurch entfallen 100 XP.')

    // Abbrechen: zurück ins Formular, nichts gespeichert
    await user.click(within(confirm).getByRole('button', { name: 'Abbrechen' }))
    await waitFor(() => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument())
    expect(screen.getByRole('dialog', { name: 'Kampagne bearbeiten' })).toBeInTheDocument()
    expect(within(dialog).getByLabelText(/^Start/)).toHaveValue('2026-10-31')
    expect((await firstQuest()).startDay).toBe('2026-10-29')
    expect(await totalXp()).toBe(xpBefore)

    // Bestätigen: gespeichert, genau die genannten XP entfallen
    await user.click(within(dialog).getByRole('button', { name: 'Speichern' }))
    confirm = await screen.findByRole('alertdialog', { name: 'Änderung kostet XP' })
    await user.click(within(confirm).getByRole('button', { name: 'Trotzdem speichern' }))
    await waitFor(async () => expect((await firstQuest()).startDay).toBe('2026-10-31'))
    expect(await totalXp()).toBe(xpBefore - 100)
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(await screen.findByText('Kampagne gespeichert')).toBeInTheDocument()
  })

  it('fragt im Kampagnen-Dialog auch nach einem erhöhten Ziel (über „Übernehmen“) nach', async () => {
    await readingCampaign()
    const { user } = await renderPage()
    await user.click(screen.getByRole('button', { name: 'Bearbeiten' }))
    const dialog = await screen.findByRole('dialog', { name: 'Kampagne bearbeiten' })
    await user.click(within(dialog).getByRole('button', { name: 'Kapitel 1 „Drei Tage“ bearbeiten' }))
    const chapterDialog = await screen.findByRole('dialog', { name: 'Kapitel bearbeiten' })
    const target = within(chapterDialog).getByLabelText(/^Ziel/)
    await user.clear(target)
    await user.type(target, '5')
    await user.click(within(chapterDialog).getByRole('button', { name: 'Übernehmen' }))
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Kapitel bearbeiten' })).not.toBeInTheDocument())

    await user.click(within(dialog).getByRole('button', { name: 'Speichern' }))
    const confirm = await screen.findByRole('alertdialog', { name: 'Änderung kostet XP' })
    expect(confirm).toHaveTextContent('Dadurch entfallen 600 XP (davon 500 XP Kampagnen-Bonus).')
  })

  it('fragt im Kapitel-Dialog der Zeitleiste nach, wenn ein höheres Ziel das Kapitel kippt', async () => {
    await readingCampaign()
    const { user } = await renderPage()
    const xpBefore = await totalXp()

    await user.click(screen.getByRole('button', { name: 'Kapitel „Drei Tage“ bearbeiten' }))
    const dialog = await screen.findByRole('dialog', { name: 'Kapitel bearbeiten' })
    const target = within(dialog).getByLabelText(/^Ziel/)
    await user.clear(target)
    await user.type(target, '5')
    await user.click(within(dialog).getByRole('button', { name: 'Speichern' }))
    let confirm = await screen.findByRole('alertdialog', { name: 'Änderung kostet XP' })
    expect(confirm).toHaveTextContent(
      'Kapitel „Drei Tage“ verliert seinen Abschluss. Die Kampagne gilt dann nicht mehr als gemeistert. ' +
        'Dadurch entfallen 600 XP (davon 500 XP Kampagnen-Bonus).',
    )

    await user.click(within(confirm).getByRole('button', { name: 'Abbrechen' }))
    await waitFor(() => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument())
    expect(screen.getByRole('dialog', { name: 'Kapitel bearbeiten' })).toBeInTheDocument()
    expect(within(dialog).getByLabelText(/^Ziel/)).toHaveValue('5')
    expect((await firstQuest()).chapters[0].criterion).toMatchObject({ target: 3 })
    expect(await totalXp()).toBe(xpBefore)

    await user.click(within(dialog).getByRole('button', { name: 'Speichern' }))
    confirm = await screen.findByRole('alertdialog', { name: 'Änderung kostet XP' })
    await user.click(within(confirm).getByRole('button', { name: 'Trotzdem speichern' }))
    await waitFor(async () => expect((await firstQuest()).chapters[0].criterion).toMatchObject({ target: 5 }))
    expect(await totalXp()).toBe(xpBefore - 600)
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
  })

  it('warnt, wenn ein neues Kapitel die gemeisterte Kampagne wieder öffnet', async () => {
    await readingCampaign()
    const { user } = await renderPage()
    await user.click(screen.getByRole('button', { name: 'Kapitel hinzufügen' }))
    const dialog = await screen.findByRole('dialog', { name: 'Neues Kapitel' })
    await user.type(within(dialog).getByLabelText(/^Titel/), 'Finale')
    await user.click(within(dialog).getByRole('button', { name: 'Kapitel anlegen' }))
    const confirm = await screen.findByRole('alertdialog', { name: 'Änderung kostet XP' })
    expect(confirm).toHaveTextContent(
      'Die Kampagne gilt dann nicht mehr als gemeistert. Dadurch entfällt der Kampagnen-Bonus von 500 XP.',
    )
  })

  it('speichert harmlose Änderungen ohne Rückfrage', async () => {
    await readingCampaign([MANUAL])
    const { user } = await renderPage()
    await user.click(screen.getByRole('button', { name: 'Bearbeiten' }))
    const dialog = await screen.findByRole('dialog', { name: 'Kampagne bearbeiten' })
    fireEvent.change(within(dialog).getByLabelText(/^Start/), { target: { value: '2026-10-20' } })
    await user.click(within(dialog).getByRole('button', { name: 'Speichern' }))
    await waitFor(async () => expect((await firstQuest()).startDay).toBe('2026-10-20'))
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
  })
})
