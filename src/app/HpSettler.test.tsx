// @vitest-environment jsdom
import 'fake-indexeddb/auto'
import { act, cleanup, render, waitFor } from '@testing-library/react'
import { StrictMode } from 'react'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { loadGameData, resetAllData, saveProfile, setPenaltiesEnabled, updateSettings } from '../data/repository'
import type { DayKey } from '../domain/types'
import { GameProvider } from './GameProvider'
import { HpSettler } from './HpSettler'
import { createSettleQueue } from './settleQueue'

// settleHpDays beobachten, gezielt aufhalten oder scheitern lassen; sonst die echte Implementierung.
const control = vi.hoisted(() => ({
  calls: [] as DayKey[],
  failNext: false,
  hold: undefined as Promise<void> | undefined,
}))
vi.mock('../data/repository', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../data/repository')>()
  return {
    ...actual,
    settleHpDays: async (today: DayKey) => {
      control.calls.push(today)
      if (control.hold) await control.hold
      if (control.failNext) {
        control.failNext = false
        throw new Error('Die Datenbank ist gerade nicht erreichbar.')
      }
      return actual.settleHpDays(today)
    },
  }
})

/** Dienstag, 3. November 2026, 12:00 Uhr (Ortszeit) → Spieltag 2026-11-03. */
const TODAY: DayKey = '2026-11-03'

beforeAll(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
})
afterAll(() => {
  vi.useRealTimers()
})
beforeEach(async () => {
  vi.setSystemTime(new Date(2026, 10, 3, 12, 0, 0))
  await resetAllData()
  control.calls = []
  control.failNext = false
  control.hold = undefined
})
afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

function renderSettler({ strict = false } = {}) {
  const tree = (
    <GameProvider>
      <HpSettler />
    </GameProvider>
  )
  return render(strict ? <StrictMode>{tree}</StrictMode> : tree)
}

/** Gibt laufenden Schreibvorgängen und Live-Queries Zeit – danach darf nichts mehr angestoßen werden. */
async function settle() {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 120))
  })
}

function returnToApp() {
  act(() => {
    document.dispatchEvent(new Event('visibilitychange'))
  })
}

function deferred() {
  let resolve!: () => void
  const promise = new Promise<void>((done) => {
    resolve = done
  })
  return { promise, resolve }
}

describe('createSettleQueue', () => {
  it('rechnet nie doppelt gleichzeitig ab und holt Anfragen danach genau einmal nach (letzter Tag)', async () => {
    const gate = deferred()
    const calls: DayKey[] = []
    const queue = createSettleQueue(async (day) => {
      calls.push(day)
      if (calls.length === 1) await gate.promise
    }, () => {})

    queue.request('2026-11-03')
    queue.request('2026-11-03')
    queue.request('2026-11-04')
    queue.request('2026-11-05')
    expect(calls).toEqual(['2026-11-03'])

    gate.resolve()
    await vi.waitFor(() => expect(calls).toEqual(['2026-11-03', '2026-11-05']))
    await new Promise((resolve) => setTimeout(resolve, 10))
    expect(calls).toEqual(['2026-11-03', '2026-11-05'])
  })

  it('meldet Fehler (auch synchron geworfene) und bleibt danach bedienbar', async () => {
    const errors: unknown[] = []
    let attempt = 0
    const queue = createSettleQueue((day) => {
      attempt++
      if (attempt === 1) throw new Error(`kaputt ${day}`)
      return Promise.reject(new Error('wieder kaputt'))
    }, (error) => errors.push(error))

    queue.request('2026-11-03')
    await vi.waitFor(() => expect(errors).toHaveLength(1))
    queue.request('2026-11-03')
    await vi.waitFor(() => expect(errors).toHaveLength(2))
    expect(attempt).toBe(2)
  })

  it('verwirft angehalten alle Anfragen und nimmt sie nach dem Freigeben wieder an', async () => {
    const calls: DayKey[] = []
    const queue = createSettleQueue(async (day) => {
      calls.push(day)
    }, () => {})
    queue.setPaused(true)
    queue.request('2026-11-03')
    expect(calls).toEqual([])
    queue.setPaused(false)
    queue.request('2026-11-04')
    expect(calls).toEqual(['2026-11-04'])
  })
})

describe('HpSettler', () => {
  it('rechnet beim Start ab und setzt dabei den Abrechnungsbeginn – ohne Schleife', async () => {
    await saveProfile({ name: 'Aria', avatar: '🧙', createdDay: '2026-10-20' })
    renderSettler()

    await waitFor(async () => expect((await loadGameData()).settings.penalties?.since).toBe(TODAY))
    await settle()
    expect(control.calls.length).toBeGreaterThanOrEqual(1)
    // Höchstens ein zweiter (leerer) Lauf, weil sich der Abrechnungsbeginn durch den ersten geändert hat.
    expect(control.calls.length).toBeLessThanOrEqual(2)
    expect(new Set(control.calls)).toEqual(new Set([TODAY]))

    // Andere Änderungen lösen keine weitere Abrechnung aus.
    const before = control.calls.length
    await updateSettings({ effects: false })
    await settle()
    expect(control.calls).toHaveLength(before)
  })

  it('läuft auch im StrictMode nicht doppelt an', async () => {
    await saveProfile({ name: 'Aria', avatar: '🧙', createdDay: '2026-10-20' })
    await setPenaltiesEnabled(true, '2026-10-25')
    renderSettler({ strict: true })
    await waitFor(() => expect(control.calls).toEqual([TODAY]))
    await settle()
    expect(control.calls).toEqual([TODAY])
  })

  it('rechnet ohne Helden nichts ab (Onboarding) und beginnt, sobald der Held angelegt ist', async () => {
    renderSettler()
    await settle()
    expect(control.calls).toEqual([])
    returnToApp()
    await settle()
    expect(control.calls).toEqual([])

    await saveProfile({ name: 'Aria', avatar: '🧙', createdDay: TODAY })
    await waitFor(() => expect(control.calls[0]).toBe(TODAY))
  })

  it('rechnet bei der Rückkehr in die App und beim Tageswechsel erneut ab', async () => {
    await saveProfile({ name: 'Aria', avatar: '🧙', createdDay: '2026-10-20' })
    await setPenaltiesEnabled(true, '2026-10-25')
    const visibility = vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden')
    renderSettler()
    await waitFor(() => expect(control.calls).toEqual([TODAY]))
    await settle()

    // Im Hintergrund passiert nichts.
    returnToApp()
    await settle()
    expect(control.calls).toEqual([TODAY])

    // Zurück in der App (selber Tag): noch einmal (idempotent).
    visibility.mockReturnValue('visible')
    returnToApp()
    await waitFor(() => expect(control.calls).toEqual([TODAY, TODAY]))

    // Am nächsten Morgen aus dem Hintergrund zurück: der neue Spieltag wird abgerechnet.
    vi.setSystemTime(new Date(2026, 10, 4, 8, 0, 0))
    returnToApp()
    await waitFor(() => expect(control.calls.at(-1)).toBe('2026-11-04'))
    await settle()
    // Tageswechsel (useToday) und Rückkehr fallen zusammen – höchstens zwei Läufe, nie gleichzeitig.
    expect(control.calls.filter((day) => day === '2026-11-04').length).toBeLessThanOrEqual(2)
  })

  it('stößt nie zwei Abrechnungen gleichzeitig an', async () => {
    await saveProfile({ name: 'Aria', avatar: '🧙', createdDay: '2026-10-20' })
    await setPenaltiesEnabled(true, '2026-10-25')
    const gate = deferred()
    control.hold = gate.promise
    renderSettler()
    await waitFor(() => expect(control.calls).toEqual([TODAY]))

    // Mehrfach zurück in die App, während die erste Abrechnung noch läuft.
    returnToApp()
    returnToApp()
    returnToApp()
    await settle()
    expect(control.calls).toEqual([TODAY])

    control.hold = undefined
    gate.resolve()
    await waitFor(() => expect(control.calls).toEqual([TODAY, TODAY]))
    await settle()
    expect(control.calls).toEqual([TODAY, TODAY])
  })

  it('versucht eine gescheiterte Abrechnung nicht in einer Schleife erneut', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    await saveProfile({ name: 'Aria', avatar: '🧙', createdDay: '2026-10-20' })
    await setPenaltiesEnabled(true, '2026-10-25')
    control.failNext = true
    renderSettler()

    await waitFor(() => expect(warn).toHaveBeenCalled())
    await settle()
    expect(control.calls).toEqual([TODAY])
    await updateSettings({ effects: false })
    await settle()
    expect(control.calls).toEqual([TODAY])
  })
})
