// @vitest-environment jsdom
import 'fake-indexeddb/auto'
import { cleanup, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MotionGlobalConfig } from 'motion/react'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { createHabit, loadGameData, resetAllData, saveProfile, setCompletionValue } from '../../data/repository'
import { RANKS } from '../../domain/balancing'
import type { DayKey } from '../../domain/types'
import { renderWithGame } from '../../test/renderWithGame'
import { HeroPage } from '../HeroPage'
import { nextRank, rankLadder, roundShares, validateHeroName } from './heroProfile'

/** Dienstag, 3. November 2026, 12:00 Uhr (Ortszeit) → Spieltag 2026-11-03. */
const TODAY: DayKey = '2026-11-03'
const CREATED: DayKey = '2026-10-01'

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
})
afterEach(cleanup)

/** Findet die Zeile „Tag N deines Abenteuers …“ (die Zahl steckt in einem eigenen Element). */
function adventureDayText(day: number) {
  return (_: string, element: Element | null) =>
    element?.tagName === 'P' && (element.textContent ?? '').startsWith(`Tag ${day} deines Abenteuers`)
}

async function setup() {
  await saveProfile({ name: 'Aria', avatar: '🧙', createdDay: CREATED })
  const reading = await createHabit(
    { title: 'Lesen', icon: '📖', attribute: 'intellect', difficulty: 'medium', schedule: { type: 'daily' } },
    CREATED,
  )
  await setCompletionValue(reading.id, '2026-11-02', 1)
  await setCompletionValue(reading.id, TODAY, 1)
  const user = userEvent.setup()
  renderWithGame(<HeroPage />, { route: '/held' })
  await screen.findByRole('heading', { level: 2, name: 'Aria' })
  return user
}

describe('Heldenseite', () => {
  it('zeigt den Charakterbogen mit Rang, Level, Abenteuertag und nächstem Rang', async () => {
    await setup()
    expect(screen.getByRole('heading', { level: 1, name: 'Held' })).toBeInTheDocument()
    const sheet = screen.getByRole('region', { name: 'Aria' })
    expect(within(sheet).getByText('Novize')).toBeInTheDocument()
    // 2 × 20 XP + 2 perfekte Tage à 5 XP = 50 XP → Level 1 mit 50 / 100 XP.
    expect(within(sheet).getByRole('progressbar', { name: 'Erfahrung' })).toHaveAttribute('aria-valuenow', '50')
    expect(within(sheet).getByText(adventureDayText(34))).toBeInTheDocument()
    expect(within(sheet).getByText(/Nächster Rang:/)).toHaveTextContent('Nächster Rang: Lehrling ab Level 3 · noch 2 Level')
  })

  it('zeigt alle sechs Attribute mit Level und XP', async () => {
    await setup()
    const attributes = screen.getByRole('region', { name: 'Attribute' })
    const cards = within(attributes).getAllByRole('listitem')
    expect(cards).toHaveLength(6)
    const intellect = cards.find((card) => within(card).queryByRole('heading', { name: 'Intelligenz' }))
    expect(intellect).toBeDefined()
    // Zwei mittlere Quests à 20 XP → 40 XP → Level 2 mit 0 / 95 XP (round(40 × 2^1,25)).
    expect(within(intellect as HTMLElement).getByText('Lesen, Lernen, Sprachen, Wissen')).toBeInTheDocument()
    expect(intellect).toHaveTextContent('Level2')
    expect(intellect).toHaveTextContent('0 / 95 XP')
    expect(within(intellect as HTMLElement).getByRole('progressbar')).toHaveAccessibleName(
      'Intelligenz: Fortschritt zu Level 3',
    )
  })

  it('zeigt die Statistik und die Herkunft der XP', async () => {
    await setup()
    const stats = screen.getByRole('region', { name: 'Statistik' })
    const tile = (label: string) =>
      within(stats)
        .getAllByRole('listitem')
        .find((item) => item.textContent?.startsWith(label))
    expect(tile('Quests erledigt')).toHaveTextContent('Quests erledigt2')
    expect(tile('Perfekte Tage')).toHaveTextContent('Perfekte Tage2')
    expect(tile('Aktive Tage')).toHaveTextContent('Aktive Tage2')
    expect(tile('Bester Streak')).toHaveTextContent('Bester Streak2Tage')
    expect(tile('Bester Wochen-Streak')).toHaveTextContent('Bester Wochen-Streak0Wochen')
    expect(tile('Gesamt-XP')).toHaveTextContent('Gesamt-XP50')

    const breakdown = screen.getByRole('region', { name: 'Herkunft deiner XP' })
    expect(breakdown).toHaveTextContent('50 XP insgesamt')
    expect(within(breakdown).getByRole('progressbar', { name: 'Quests' })).toHaveAttribute('aria-valuenow', '80')
    expect(within(breakdown).getByRole('progressbar', { name: 'Perfekte Tage' })).toHaveAttribute('aria-valuenow', '20')
    expect(within(breakdown).getByRole('progressbar', { name: 'Kapitel & Kampagnen' })).toHaveAttribute(
      'aria-valuenow',
      '0',
    )
  })

  it('zeigt die Rangleiter mit dem aktuellen Rang', async () => {
    await setup()
    const ladder = screen.getByRole('region', { name: 'Rangleiter' })
    const items = within(ladder).getAllByRole('listitem')
    expect(items).toHaveLength(RANKS.length)
    expect(items[0]).toHaveAttribute('aria-current', 'step')
    expect(items[0]).toHaveTextContent('aktueller Rang')
    expect(items[1]).toHaveTextContent('noch nicht erreicht')
  })

  it('bearbeitet Name und Avatar und behält den Beginn des Abenteuers', async () => {
    const user = await setup()
    await user.click(screen.getByRole('button', { name: 'Held bearbeiten' }))
    const dialog = await screen.findByRole('dialog', { name: 'Held bearbeiten' })
    const nameInput = within(dialog).getByRole('textbox', { name: /^Name/ })
    expect(nameInput).toHaveValue('Aria')
    expect(within(dialog).getByRole('radio', { name: 'Magier' })).toBeChecked()

    await user.clear(nameInput)
    await user.type(nameInput, 'Borin')
    await user.click(within(dialog).getByRole('radio', { name: 'Wolf' }))
    await user.click(within(dialog).getByRole('button', { name: 'Speichern' }))

    await waitFor(async () => {
      expect((await loadGameData()).profile).toEqual({ name: 'Borin', avatar: '🐺', createdDay: CREATED })
    })
    expect(await screen.findByRole('heading', { level: 2, name: 'Borin' })).toBeInTheDocument()
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    // Der Abenteuertag zählt weiter ab dem ursprünglichen Start.
    expect(screen.getByText(adventureDayText(34))).toBeInTheDocument()
  })

  it('speichert keinen leeren Namen und startet beim erneuten Öffnen mit dem gespeicherten Profil', async () => {
    const user = await setup()
    await user.click(screen.getByRole('button', { name: 'Held bearbeiten' }))
    let dialog = await screen.findByRole('dialog', { name: 'Held bearbeiten' })
    await user.clear(within(dialog).getByRole('textbox', { name: /^Name/ }))
    await user.click(within(dialog).getByRole('button', { name: 'Speichern' }))
    expect(within(dialog).getByText('Bitte gib deinem Helden einen Namen.')).toBeInTheDocument()
    expect((await loadGameData()).profile?.name).toBe('Aria')

    await user.click(within(dialog).getByRole('button', { name: 'Abbrechen' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    await user.click(screen.getByRole('button', { name: 'Held bearbeiten' }))
    dialog = await screen.findByRole('dialog', { name: 'Held bearbeiten' })
    expect(within(dialog).getByRole('textbox', { name: /^Name/ })).toHaveValue('Aria')
  })
})

describe('heroProfile', () => {
  it('prüft den Heldennamen', () => {
    expect(validateHeroName('')).toBe('Bitte gib deinem Helden einen Namen.')
    expect(validateHeroName('   ')).toBe('Bitte gib deinem Helden einen Namen.')
    expect(validateHeroName('Aria')).toBeUndefined()
    expect(validateHeroName('x'.repeat(31))).toMatch(/höchstens 30 Zeichen/)
  })

  it('kennt den nächsten Rang und die Rangleiter', () => {
    expect(nextRank(1)).toEqual({ minLevel: 3, title: 'Lehrling' })
    expect(nextRank(7)).toEqual({ minLevel: 8, title: 'Abenteurer' })
    expect(nextRank(40)).toBeUndefined()
    const ladder = rankLadder(9)
    expect(ladder.filter((rank) => rank.status === 'current').map((rank) => rank.title)).toEqual(['Abenteurer'])
    expect(ladder.filter((rank) => rank.status === 'reached').map((rank) => rank.title)).toEqual([
      'Novize',
      'Lehrling',
      'Wanderer',
    ])
    expect(ladder.at(-1)?.status).toBe('locked')
  })

  it('rundet Anteile so, dass sie zusammen genau 100 % ergeben', () => {
    // 79,87 % / 10,57 % / 9,56 % – einzeln gerundet wären das 80 + 11 + 10 = 101 %.
    expect(roundShares([1670, 221, 200])).toEqual([80, 11, 9])
    expect(roundShares([1, 1, 1])).toEqual([34, 33, 33])
    expect(roundShares([40, 10, 0])).toEqual([80, 20, 0])
    expect(roundShares([0, 0, 0])).toEqual([0, 0, 0])
  })
})
