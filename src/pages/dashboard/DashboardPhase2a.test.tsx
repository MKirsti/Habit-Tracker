// @vitest-environment jsdom
import 'fake-indexeddb/auto'
import { cleanup, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MotionGlobalConfig } from 'motion/react'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  completeSideQuest,
  createHabit,
  createReward,
  createSideQuest,
  loadGameData,
  purchaseReward,
  resetAllData,
  saveProfile,
  setCompletionValue,
} from '../../data/repository'
import type { HabitDraft, SideQuestDraft } from '../../data/repository'
import type { DayKey } from '../../domain/types'
import { renderWithGame } from '../../test/renderWithGame'
import { DashboardPage } from '../DashboardPage'

/** Dienstag, 3. November 2026, 12:00 Uhr → Spieltag 2026-11-03. */
const TODAY: DayKey = '2026-11-03'
const YESTERDAY: DayKey = '2026-11-02'

const READING: HabitDraft = {
  title: 'Lesen',
  icon: '📖',
  attribute: 'intellect',
  difficulty: 'medium',
  schedule: { type: 'daily' },
}
const MEDITATION: HabitDraft = {
  title: 'Meditieren',
  icon: '🧘',
  attribute: 'wisdom',
  difficulty: 'easy',
  schedule: { type: 'daily' },
}
const side = (title: string, extra: Partial<SideQuestDraft> = {}): SideQuestDraft => ({
  title,
  icon: '📜',
  attribute: 'discipline',
  difficulty: 'medium',
  ...extra,
})

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
  await saveProfile({ name: 'Aria', avatar: '🧙', createdDay: '2026-10-20' })
})
afterEach(cleanup)

async function renderDashboard() {
  const user = userEvent.setup()
  const view = renderWithGame(<DashboardPage />)
  await screen.findByRole('heading', { level: 1, name: 'Heute' })
  return { user, ...view }
}

function section(name: string): HTMLElement {
  return screen.getByRole('region', { name: new RegExp(`^${name}`) })
}

async function sideQuest(title: string) {
  return (await loadGameData()).sideQuests?.find((quest) => quest.title === title)
}

describe('Dashboard – Gold', () => {
  it('zeigt das Gold-Guthaben im Helden-Kopf und führt zur Schatzkammer', async () => {
    const reading = await createHabit(READING, '2026-10-20')
    // 20 + 21 + 22 XP (Streak-Bonus) = 63 XP → 31 Gold; dazu kein Perfekter Tag (Meditieren offen).
    await createHabit(MEDITATION, '2026-10-20')
    for (const day of ['2026-10-31', '2026-11-01', YESTERDAY]) await setCompletionValue(reading.id, day, 1)
    const { user, router } = await renderDashboard()

    const hero = screen.getByRole('region', { name: 'Aria' })
    const links = within(hero).getAllByRole('link', { name: '31 Gold – zur Schatzkammer' })
    // Kompakt auf dem Handy, groß ab md – beide führen zur Schatzkammer.
    expect(links).toHaveLength(2)
    for (const link of links) expect(link).toHaveAttribute('href', '/schatzkammer')
    // Der Helden-Link bleibt daneben bestehen (kein verschachtelter Link).
    expect(within(hero).getByRole('link', { name: 'Heldenprofil von Aria öffnen' })).not.toContainElement(links[0])

    await user.click(links[0])
    expect(router.state.location.pathname).toBe('/schatzkammer')
  })

  it('zieht Ausgaben ab und färbt ein negatives Guthaben rot', async () => {
    const reading = await createHabit({ ...READING, difficulty: 'epic' }, '2026-10-20')
    await createHabit(MEDITATION, '2026-10-20')
    await setCompletionValue(reading.id, '2026-10-30', 1) // 80 XP → 40 Gold
    const reward = await createReward({ title: 'Kino', icon: '🎬', price: 30, repeatable: true })
    await purchaseReward(reward.id, YESTERDAY)
    await renderDashboard()
    // 40 Gold aus XP + 25 Gold für den Erfolg „Beim Händler“ (erste Einlösung) − 30 Gold Ausgabe.
    const [chip] = within(screen.getByRole('region', { name: 'Aria' })).getAllByRole('link', {
      name: '35 Gold – zur Schatzkammer',
    })
    expect(chip).toHaveAttribute('data-gold-balance', '35')
    expect(chip.className).toContain('text-gold-bright')

    // Nachträglich weniger XP (Erledigung entfernt): Das Guthaben wird negativ.
    await setCompletionValue(reading.id, '2026-10-30', 0)
    const [negative] = await within(screen.getByRole('region', { name: 'Aria' })).findAllByRole('link', {
      name: '-5 Gold – zur Schatzkammer',
    })
    expect(negative.className).toContain('text-danger')
  })
})

describe('Dashboard – Streak-Bonus', () => {
  it('zeigt XP inklusive Streak-Bonus und das Bonus-Abzeichen', async () => {
    const reading = await createHabit(READING, '2026-10-20')
    await createHabit(MEDITATION, '2026-10-20')
    // Lesen: 4 Tage in Folge bis gestern → heute +20 %.
    for (const day of ['2026-10-30', '2026-10-31', '2026-11-01', YESTERDAY]) await setCompletionValue(reading.id, day, 1)
    const { user } = await renderDashboard()

    const daily = section('Tagesquests')
    const row = within(daily).getByRole('checkbox', { name: 'Lesen erledigt' }).closest('li') as HTMLElement
    expect(row).toHaveTextContent('+24 XP')
    const badge = row.querySelector('[data-streak-bonus]')
    expect(badge).toHaveAttribute('data-streak-bonus', '20')
    expect(badge).toHaveTextContent('🔥4·+20 %')
    expect(within(row).getByText('4 Tage in Folge, Streak-Bonus 20 Prozent')).toBeInTheDocument()

    // Ohne Serie kein Abzeichen, Basis-XP.
    const meditation = within(daily).getByRole('checkbox', { name: 'Meditieren erledigt' }).closest('li') as HTMLElement
    expect(meditation).toHaveTextContent('+10 XP')
    expect(meditation.querySelector('[data-streak-bonus]')).toBeNull()

    // Abgehakt: dieselben (gutgeschriebenen) XP, der Bonus bleibt.
    await user.click(within(daily).getByRole('checkbox', { name: 'Lesen erledigt' }))
    await waitFor(() => expect(within(row).getByText('5 Tage in Folge, Streak-Bonus 20 Prozent')).toBeInTheDocument())
    expect(row).toHaveTextContent('+24 XP')
  })
})

describe('Dashboard – Nebenquests', () => {
  it('lädt ohne Nebenquests zum Anlegen ein und legt per Schnell-Anlegen eine an', async () => {
    await createHabit(READING, '2026-10-20')
    const { user } = await renderDashboard()
    const area = section('Nebenquests')
    expect(area).toHaveTextContent('Einmalige Aufgaben')

    await user.click(within(area).getByRole('button', { name: 'Neue Nebenquest' }))
    const dialog = await screen.findByRole('dialog', { name: 'Neue Nebenquest' })
    await user.type(within(dialog).getByRole('textbox', { name: /Titel/ }), 'Paket abholen')
    await user.click(within(dialog).getByRole('button', { name: 'Heute' }))
    await user.click(within(dialog).getByRole('radio', { name: 'Leicht' }))
    await user.click(within(dialog).getByRole('button', { name: 'Nebenquest anlegen' }))

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    const check = await within(section('Nebenquests')).findByRole('checkbox', { name: 'Paket abholen erledigt' })
    const row = check.closest('li') as HTMLElement
    expect(row).toHaveTextContent('heute fällig')
    expect(row).toHaveTextContent('+10 XP')
    expect(await sideQuest('Paket abholen')).toMatchObject({ dueDay: TODAY, difficulty: 'easy', createdDay: TODAY })
  })

  it('zeigt offene mit Termin-Hinweis und hakt für heute ab – auch, wenn oben „Gestern“ gewählt ist', async () => {
    await createHabit(READING, '2026-10-20')
    await createSideQuest(side('Steuer', { dueDay: '2026-11-01', difficulty: 'hard' }), '2026-10-20')
    await createSideQuest(side('Zahnarzt', { dueDay: '2026-11-12' }), '2026-10-20')
    await createSideQuest(side('Fahrrad'), '2026-10-20')
    const { user } = await renderDashboard()

    const area = section('Nebenquests')
    expect(within(area).getByRole('heading', { name: /Nebenquests/ })).toHaveTextContent('3 offen')
    const rows = within(area).getAllByRole('listitem')
    expect(rows.map((row) => within(row).getByRole('checkbox').getAttribute('aria-label'))).toEqual([
      'Steuer erledigt',
      'Zahnarzt erledigt',
      'Fahrrad erledigt',
    ])
    expect(rows[0]).toHaveTextContent('überfällig seit 2 Tagen')
    expect(rows[0]).toHaveTextContent('+40 XP')
    expect(rows[1]).toHaveTextContent('bis 12. Nov.')

    expect(within(area).queryByText('Nebenquests zählen immer für heute.')).not.toBeInTheDocument()
    await user.click(screen.getByRole('radio', { name: 'Gestern' }))
    await screen.findByText('Du trägst für gestern nach')
    // Die Quests darüber gelten jetzt für gestern – die Nebenquests nicht: Das steht dabei.
    expect(within(area).getByText('Nebenquests zählen immer für heute.')).toBeInTheDocument()
    await user.click(within(area).getByRole('checkbox', { name: 'Steuer erledigt' }))
    await waitFor(async () => expect((await sideQuest('Steuer'))?.doneDay).toBe(TODAY))

    // Heute erledigte bleiben sichtbar (abgehakt, am Ende), der Termin-Hinweis entfällt.
    await waitFor(() => expect(within(area).getByRole('heading', { name: /Nebenquests/ })).toHaveTextContent('2 offen'))
    const done = within(area).getByRole('checkbox', { name: 'Steuer erledigt' })
    expect(done).toHaveAttribute('aria-checked', 'true')
    expect(within(area).getAllByRole('checkbox').at(-1)).toBe(done)
    expect(done.closest('li')).not.toHaveTextContent('überfällig')

    await user.click(done)
    await waitFor(async () => expect((await sideQuest('Steuer'))?.doneDay).toBeUndefined())
  })

  it('klappt viele Nebenquests ein und verlinkt die Verwaltung', async () => {
    for (const title of ['A', 'B', 'C', 'D', 'E']) await createSideQuest(side(title), '2026-10-20')
    const { user, router } = await renderDashboard()
    const area = section('Nebenquests')
    expect(within(area).getAllByRole('listitem')).toHaveLength(3)
    const more = within(area).getByRole('button', { name: '2 weitere anzeigen' })
    expect(more).toHaveAttribute('aria-expanded', 'false')
    await user.click(more)
    expect(within(area).getAllByRole('listitem')).toHaveLength(5)
    expect(within(area).getByRole('button', { name: 'Weniger anzeigen' })).toHaveAttribute('aria-expanded', 'true')

    await user.click(within(area).getByRole('link', { name: 'Verwalten' }))
    expect(router.state.location.pathname).toBe('/quests')
    expect(router.state.location.search).toBe('?tab=nebenquests')
  })

  it('zeigt vier Nebenquests ohne Einklappen und meldet, wenn alle früher erledigt sind', async () => {
    for (const title of ['A', 'B', 'C', 'D']) await createSideQuest(side(title), '2026-10-20')
    await renderDashboard()
    expect(within(section('Nebenquests')).getAllByRole('listitem')).toHaveLength(4)
    expect(within(section('Nebenquests')).queryByRole('button', { name: /weitere anzeigen/ })).not.toBeInTheDocument()
    cleanup()

    await resetAllData()
    await saveProfile({ name: 'Aria', avatar: '🧙', createdDay: '2026-10-20' })
    const old = await createSideQuest(side('Alt'), '2026-10-20')
    await completeSideQuest(old.id, YESTERDAY)
    await renderDashboard()
    expect(section('Nebenquests')).toHaveTextContent('Keine offenen Nebenquests.')
  })
})

describe('Dashboard – Nebenquests: Fokus beim Abhaken', () => {
  it('eingeklappt: Wandert die erledigte ans (verborgene) Ende, bekommt die nachrückende den Fokus', async () => {
    for (const title of ['A', 'B', 'C', 'D', 'E']) await createSideQuest(side(title), '2026-10-20')
    const { user } = await renderDashboard()
    const area = section('Nebenquests')
    await user.click(within(area).getByRole('checkbox', { name: 'A erledigt' }))

    await waitFor(async () => expect((await sideQuest('A'))?.doneDay).toBe(TODAY))
    // A steht jetzt (erledigt) am Ende und ist eingeklappt – B rückt an die erste Stelle und hat den Fokus.
    await waitFor(() => expect(within(area).queryByRole('checkbox', { name: 'A erledigt' })).not.toBeInTheDocument())
    await waitFor(() => expect(within(area).getByRole('checkbox', { name: 'B erledigt' })).toHaveFocus())
  })

  it('ausgeklappt: Der Haken behält den Fokus, auch wenn die Zeile ans Ende wandert', async () => {
    for (const title of ['A', 'B', 'C', 'D', 'E']) await createSideQuest(side(title), '2026-10-20')
    const { user } = await renderDashboard()
    const area = section('Nebenquests')
    await user.click(within(area).getByRole('button', { name: '2 weitere anzeigen' }))
    await user.click(within(area).getByRole('checkbox', { name: 'A erledigt' }))

    await waitFor(() =>
      expect(within(area).getByRole('checkbox', { name: 'A erledigt' })).toHaveAttribute('aria-checked', 'true'),
    )
    await waitFor(() => expect(within(area).getByRole('checkbox', { name: 'A erledigt' })).toHaveFocus())
  })
})
