// @vitest-environment jsdom
import 'fake-indexeddb/auto'
import { cleanup, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MotionGlobalConfig } from 'motion/react'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { loadGameData, resetAllData, saveProfile } from '../../data/repository'
import { renderWithGame } from '../../test/renderWithGame'
import { SettingsPage } from '../SettingsPage'

// Klang: nur prüfen, dass die Probe das Sound-Modul ruft (Web Audio gibt es in jsdom nicht).
const sounds = vi.hoisted(() => ({ play: vi.fn(), vibrate: vi.fn() }))
vi.mock('../../features/sound', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../features/sound')>()),
  useGameSounds: () => sounds,
}))

beforeAll(() => {
  MotionGlobalConfig.skipAnimations = true
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date(2026, 10, 5, 12, 0, 0))
})
afterAll(() => {
  vi.useRealTimers()
})
beforeEach(async () => {
  sounds.play.mockClear()
  sounds.vibrate.mockClear()
  await resetAllData()
  await saveProfile({ name: 'Aria', avatar: '🧙', createdDay: '2026-10-01' })
})
afterEach(() => {
  cleanup()
  // jsdom kennt navigator.vibrate und Web Audio nicht – im Test gesetzte wieder entfernen.
  delete (navigator as { vibrate?: unknown }).vibrate
  delete (globalThis as { AudioContext?: unknown }).AudioContext
})

/** Ein Browser mit Web Audio (gespielt wird über das gemockte Sound-Modul). */
function withWebAudio() {
  Object.defineProperty(globalThis, 'AudioContext', { value: class {}, configurable: true, writable: true })
}

async function renderSettings() {
  const user = userEvent.setup()
  renderWithGame(<SettingsPage />, { route: '/einstellungen' })
  const card = await screen.findByRole('region', { name: 'Klänge & Vibration' })
  return { user, card }
}

describe('Einstellungen – Klänge & Vibration', () => {
  it('sind standardmäßig aus; die Probe wartet, bis die Klänge an sind', async () => {
    const { card } = await renderSettings()
    expect(within(card).getByRole('switch', { name: 'Klänge' })).not.toBeChecked()
    expect(within(card).getByRole('switch', { name: 'Vibration' })).not.toBeChecked()
    const preview = within(card).getByRole('button', { name: 'Probe hören' })
    expect(preview).toBeDisabled()
    expect(preview).toHaveAccessibleDescription('Schalte die Klänge ein, um reinzuhören.')
    // jsdom kann nicht vibrieren – das wird ehrlich (und in einem Satz) gesagt, auch auf dem iPhone passend.
    expect(within(card).getByText('Dieses Gerät kann leider nicht vibrieren – auf dem iPhone gibt es das nicht.')).toBeInTheDocument()
    expect(within(card).queryByText(/Auch dieses Gerät/)).not.toBeInTheDocument()
  })

  it('sagt ehrlich, wenn der Browser gar keine Klänge erzeugen kann – statt still „Gerade: …“ zu zeigen', async () => {
    // jsdom hat kein Web Audio.
    const { user, card } = await renderSettings()
    await user.click(within(card).getByRole('switch', { name: 'Klänge' }))
    await waitFor(async () => expect((await loadGameData()).settings.sound).toBe(true))
    const preview = within(card).getByRole('button', { name: 'Probe hören' })
    await waitFor(() => expect(preview).toHaveAccessibleDescription('Dieser Browser kann leider keine Klänge abspielen.'))
    expect(preview).toBeDisabled()
  })

  it('schaltet die Klänge ein und spielt sie der Reihe nach vor', async () => {
    withWebAudio()
    const { user, card } = await renderSettings()
    await user.click(within(card).getByRole('switch', { name: 'Klänge' }))
    await waitFor(async () => expect((await loadGameData()).settings.sound).toBe(true))
    const preview = within(card).getByRole('button', { name: 'Probe hören' })
    await waitFor(() => expect(preview).toBeEnabled())

    await user.click(preview)
    expect(sounds.play).toHaveBeenLastCalledWith('check')
    expect(within(card).getByText('Gerade: Quest abgehakt')).toBeInTheDocument()
    await user.click(preview)
    expect(sounds.play).toHaveBeenLastCalledWith('bossHit')
    expect(within(card).getByText('Gerade: Boss-Treffer')).toBeInTheDocument()

    await user.click(within(card).getByRole('switch', { name: 'Klänge' }))
    await waitFor(async () => expect((await loadGameData()).settings.sound).toBe(false))
    await waitFor(() => expect(preview).toBeDisabled())
  })

  it('schaltet die Vibration ein und summt einmal zur Bestätigung (wo das Gerät es kann)', async () => {
    const vibrate = vi.fn(() => true)
    Object.defineProperty(navigator, 'vibrate', { value: vibrate, configurable: true, writable: true })
    const { user, card } = await renderSettings()
    expect(within(card).getByText('Auf dem iPhone nicht verfügbar.')).toBeInTheDocument()
    expect(within(card).queryByText(/kann leider nicht vibrieren/)).not.toBeInTheDocument()

    await user.click(within(card).getByRole('switch', { name: 'Vibration' }))
    await waitFor(async () => expect((await loadGameData()).settings.haptics).toBe(true))
    expect(vibrate).toHaveBeenCalledTimes(1)
    expect(within(card).getByRole('switch', { name: 'Vibration' })).toBeChecked()

    // Ausschalten summt nicht.
    await user.click(within(card).getByRole('switch', { name: 'Vibration' }))
    await waitFor(async () => expect((await loadGameData()).settings.haptics).toBe(false))
    expect(vibrate).toHaveBeenCalledTimes(1)
  })
})
