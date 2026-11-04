// @vitest-environment jsdom
import 'fake-indexeddb/auto'
import { cleanup, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MotionGlobalConfig } from 'motion/react'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { useGameContext } from '../../app/gameContext'
import { db } from '../../data/db'
import {
  createHabit,
  loadGameData,
  purchaseItem,
  resetAllData,
  saveProfile,
  setCompletionValue,
  setPenaltiesEnabled,
  settleHpDays,
} from '../../data/repository'
import type { HabitDraft } from '../../data/repository'
import { addDays, dayRange } from '../../domain/dates'
import type { DayKey, HpLedgerEntry } from '../../domain/types'
import { renderWithGame } from '../../test/renderWithGame'
import { GameFeedback } from './GameFeedback'

/** Dienstag, 3. November 2026, 12:00 Uhr → Spieltag 2026-11-03; abgerechnet wird bis Sonntag, 1. November. */
const TODAY: DayKey = '2026-11-03'
const SUNDAY: DayKey = '2026-11-01'
const SATURDAY: DayKey = '2026-10-31'

const TRAINING: HabitDraft = {
  title: 'Krafttraining',
  icon: '🏋️',
  attribute: 'strength',
  difficulty: 'epic',
  schedule: { type: 'daily' },
}

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
  await setPenaltiesEnabled(true, '2026-10-25')
})
afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

/** Zeigt die aktuellen HP („54/60“) – damit der Test weiß, wann ein neuer Zustand angekommen ist. */
function HpProbe() {
  const { state } = useGameContext()
  return (
    <p data-testid="hp">
      {state.hp.current}/{state.hp.max}
    </p>
  )
}

async function renderFeedback() {
  renderWithGame(
    <>
      <GameFeedback />
      <HpProbe />
    </>,
  )
  await screen.findByTestId('hp')
}

/**
 * Ein Held mit Gold (epische Quest vom 25. bis 30. Oktober erledigt → Level 3, 60 Max-HP), am Samstag abgerechnet
 * mit `hpAfter` HP. Sonntag ist offen (nichts erledigt) und wird beim nächsten `settleHpDays(TODAY)` abgerechnet:
 * verpasst, −6 HP.
 */
async function heroWithOpenSunday(hpAfter: number, extra: Partial<HpLedgerEntry> = {}) {
  const training = await createHabit(TRAINING, '2026-10-20')
  for (const day of dayRange('2026-10-25', '2026-10-30')) await setCompletionValue(training.id, day, 1)
  await db.hpLedger.put({
    day: SATURDAY,
    score: 'missed',
    frozen: false,
    hpDelta: -6,
    hpAfter,
    maxHp: 60,
    penalties: true,
    ...extra,
  })
  return training
}

describe('GameFeedback – Lebenspunkte', () => {
  it('zeigt nach der Abrechnung einer Niederlage eine ruhige, würdevolle Szene', async () => {
    await heroWithOpenSunday(4)
    await renderFeedback()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()

    const [entry] = await settleHpDays(TODAY)
    expect(entry.defeat?.goldLost).toBeGreaterThan(0)

    const scene = await screen.findByRole('dialog', { name: /^Du bist gefallen\s– und stehst wieder auf$/ })
    expect(scene).toHaveTextContent('Deine Lebenspunkte sind am Sonntag auf 0 gesunken.')
    expect(scene).toHaveTextContent(`sein Lohn: ${entry.defeat?.goldLost.toLocaleString('de-DE')} Gold`)
    expect(scene).toHaveTextContent('Gerade alles zu viel? Im Sanften Modus')
    expect(scene).toHaveTextContent('Level, XP und Serien bleiben dir.')
    expect(scene).toHaveTextContent('Du stehst mit vollen Lebenspunkten wieder auf.')
    expect(within(scene).getByRole('progressbar', { name: 'Lebenspunkte' })).toHaveAttribute('aria-valuenow', '100')
    // Ruhig: kein Konfetti.
    expect(document.querySelector('canvas')).toBeNull()

    const user = userEvent.setup()
    await user.click(within(scene).getByRole('button', { name: 'Wieder aufstehen' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())

    // Ein zweiter (leerer) Abrechnungslauf zeigt die Szene nicht noch einmal.
    await settleHpDays(TODAY)
    await new Promise((resolve) => setTimeout(resolve, 100))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('meldet den üblichen Tagesschaden nicht – weder Toast noch Szene', async () => {
    await heroWithOpenSunday(60)
    await renderFeedback()
    expect(screen.getByTestId('hp')).toHaveTextContent('60/60')
    await settleHpDays(TODAY)
    await waitFor(() => expect(screen.getByTestId('hp')).toHaveTextContent('54/60'))
    await new Promise((resolve) => setTimeout(resolve, 100))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(screen.queryByRole('listitem')).not.toBeInTheDocument()
  })

  it('meldet einen eingesetzten Streak-Schutz', async () => {
    await heroWithOpenSunday(60)
    await purchaseItem('streakFreeze', '2026-10-30')
    await renderFeedback()
    const [entry] = await settleHpDays(TODAY)
    expect(entry.frozen).toBe(true)

    expect(await screen.findByText('Streak-Schutz eingesetzt')).toBeInTheDocument()
    expect(screen.getByText('Er hat Sonntag aufgefangen – keine HP verloren, deine Serien bleiben bestehen.')).toBeInTheDocument()
    expect(screen.getByTestId('hp')).toHaveTextContent('60/60')
  })

  it('meldet einen getrunkenen Heiltrank mit den geheilten HP', async () => {
    await heroWithOpenSunday(30, { day: SUNDAY })
    await renderFeedback()
    await purchaseItem('healingPotion', TODAY)
    expect(await screen.findByText('Heiltrank getrunken · +20 HP')).toBeInTheDocument()
    expect(screen.getByText('Lebenspunkte: 50 / 60 HP')).toBeInTheDocument()
    expect((await loadGameData()).purchases?.some((p) => p.itemId === 'healingPotion' && p.day === TODAY)).toBe(true)
  })

  it('bleibt beim ersten Laden still, auch wenn das Ledger schon eine Niederlage enthält', async () => {
    await heroWithOpenSunday(60, { day: addDays(TODAY, -2), defeat: { goldLost: 50 } })
    await renderFeedback()
    await new Promise((resolve) => setTimeout(resolve, 100))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })
})
