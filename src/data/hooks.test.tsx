// @vitest-environment jsdom
import 'fake-indexeddb/auto'
import { act, cleanup, renderHook, waitFor } from '@testing-library/react'
import { afterAll, afterEach, describe, expect, it, vi } from 'vitest'
import { toDayKey } from '../domain/dates'
import { db } from './db'
import { useGame, useToday } from './hooks'
import { createHabit, resetAllData, saveProfile, toggleCompletion, updateSettings } from './repository'

/** Lokale Zeit (Monat 1-basiert), damit die Tests in jeder Zeitzone gleich laufen. */
function local(month: number, day: number, hours: number, minutes = 0): Date {
  return new Date(2026, month - 1, day, hours, minutes)
}

afterEach(async () => {
  cleanup()
  vi.useRealTimers()
  vi.restoreAllMocks()
  await resetAllData()
})

afterAll(() => {
  db.close()
})

describe('useToday', () => {
  it('berücksichtigt den Tageswechsel und springt per Intervall auf den neuen Spieltag', () => {
    vi.useFakeTimers()
    vi.setSystemTime(local(11, 3, 3, 59))
    const { result } = renderHook(() => useToday(4))
    expect(result.current).toBe('2026-11-02') // 03:59 gehört noch zum Vortag

    act(() => {
      vi.advanceTimersByTime(60_000) // 04:00:59 – das Intervall hat inzwischen geprüft
    })
    expect(result.current).toBe('2026-11-03')
  })

  it('rechnet sofort neu, wenn sich dayStartHour ändert', () => {
    vi.useFakeTimers()
    vi.setSystemTime(local(11, 3, 3, 30))
    const { result, rerender } = renderHook(({ hour }) => useToday(hour), { initialProps: { hour: 4 } })
    expect(result.current).toBe('2026-11-02')

    rerender({ hour: 0 })
    expect(result.current).toBe('2026-11-03')
    rerender({ hour: 4 })
    expect(result.current).toBe('2026-11-02')
  })

  it('aktualisiert sich beim Zurückkehren in die App (visibilitychange, focus) – nur wenn sichtbar', () => {
    vi.useFakeTimers()
    vi.setSystemTime(local(11, 3, 22))
    const { result } = renderHook(() => useToday(4))
    expect(result.current).toBe('2026-11-03')

    // Die Zeit springt (z. B. Gerät im Standby), ohne dass ein Intervall gefeuert hat.
    vi.setSystemTime(local(11, 4, 9))
    const visibility = vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden')
    act(() => {
      document.dispatchEvent(new Event('visibilitychange'))
    })
    expect(result.current).toBe('2026-11-03')

    visibility.mockReturnValue('visible')
    act(() => {
      document.dispatchEvent(new Event('visibilitychange'))
    })
    expect(result.current).toBe('2026-11-04')

    vi.setSystemTime(local(11, 5, 9))
    act(() => {
      window.dispatchEvent(new Event('focus'))
    })
    expect(result.current).toBe('2026-11-05')
  })

  it('räumt Intervall und Event-Listener beim Unmount auf', () => {
    vi.useFakeTimers()
    vi.setSystemTime(local(11, 3, 12))
    const docAdd = vi.spyOn(document, 'addEventListener')
    const docRemove = vi.spyOn(document, 'removeEventListener')
    const winAdd = vi.spyOn(window, 'addEventListener')
    const winRemove = vi.spyOn(window, 'removeEventListener')

    const { unmount, rerender } = renderHook(({ hour }) => useToday(hour), { initialProps: { hour: 4 } })
    // Wechsel von dayStartHour: alte Listener/Intervalle werden ersetzt, nicht gestapelt.
    rerender({ hour: 5 })
    expect(vi.getTimerCount()).toBe(1)
    unmount()
    expect(vi.getTimerCount()).toBe(0)

    const added = (spy: typeof docAdd, type: string) => spy.mock.calls.filter(([t]) => t === type).map(([, fn]) => fn)
    const visibilityAdded = added(docAdd, 'visibilitychange')
    const focusAdded = added(winAdd, 'focus')
    expect(visibilityAdded).toHaveLength(2)
    expect(focusAdded).toHaveLength(2)
    expect(added(docRemove, 'visibilitychange')).toEqual(visibilityAdded)
    expect(added(winRemove, 'focus')).toEqual(focusAdded)
  })
})

describe('useGame', () => {
  const draft = {
    title: 'Lesen',
    icon: '📖',
    attribute: 'intellect',
    difficulty: 'medium',
    schedule: { type: 'daily' },
  } as const

  it('liefert undefined während des Ladens, danach Daten, Spieltag und Spielzustand – live aktualisiert', async () => {
    const today = toDayKey(new Date(), 4)
    await saveProfile({ name: 'Aria', avatar: '🧝', createdDay: today })

    const { result } = renderHook(() => useGame())
    expect(result.current).toBeUndefined()
    await waitFor(() => expect(result.current).toBeDefined())
    expect(result.current?.data.profile?.name).toBe('Aria')
    expect(result.current?.state.todayState.habits).toEqual([])

    const habit = await act(() => createHabit(draft, today))
    await waitFor(() => expect(result.current?.state.todayState.habits.map((h) => h.habit.id)).toEqual([habit.id]))

    await act(() => toggleCompletion(habit.id, today))
    await waitFor(() => expect(result.current?.state.todayState.habits[0].done).toBe(true))
    expect(result.current?.state.level.totalXp).toBeGreaterThan(0)
  })

  it('verwendet den gespeicherten Tageswechsel für den Spieltag', async () => {
    // Nur Date fälschen – Dexie/IndexedDB brauchen echte Timer.
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(local(11, 3, 3, 30))

    const { result } = renderHook(() => useGame())
    await waitFor(() => expect(result.current).toBeDefined())
    expect(result.current?.today).toBe('2026-11-02') // Standard: Tageswechsel um 4 Uhr

    await act(() => updateSettings({ dayStartHour: 0 }))
    await waitFor(() => expect(result.current?.today).toBe('2026-11-03'))
    expect(result.current?.state.today).toBe('2026-11-03')
  })
})
