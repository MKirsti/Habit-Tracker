// @vitest-environment jsdom
import { act, cleanup, fireEvent, renderHook, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MotionGlobalConfig } from 'motion/react'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { ToastProvider } from './Toast'
import type { ToastApi } from './toastContext'
import { useToast } from './useToast'

beforeAll(() => {
  MotionGlobalConfig.skipAnimations = true
})
afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

/** Rendert einen Provider und liefert die (stabile) Toast-API zum direkten Aufruf. */
function setup(): ToastApi {
  const { result } = renderHook(() => useToast(), {
    wrapper: ({ children }) => <ToastProvider>{children}</ToastProvider>,
  })
  return result.current
}

function region() {
  return screen.getByRole('list', { name: 'Benachrichtigungen' })
}

describe('Toasts', () => {
  it('zeigt einen Toast mit Titel und Beschreibung in einer Live-Region', () => {
    const api = setup()
    act(() => {
      api.toast({ title: '+20 XP', description: '10 Seiten lesen', tone: 'xp' })
    })
    expect(region()).toHaveAttribute('aria-live', 'polite')
    expect(within(region()).getByText('+20 XP')).toBeInTheDocument()
    expect(within(region()).getByText('10 Seiten lesen')).toBeInTheDocument()
  })

  it('blendet sich nach der Anzeigedauer automatisch aus', async () => {
    vi.useFakeTimers()
    const api = setup()
    act(() => {
      api.toast({ title: 'Gespeichert', tone: 'success', duration: 2000 })
    })
    act(() => {
      vi.advanceTimersByTime(1500)
    })
    expect(screen.getByText('Gespeichert')).toBeInTheDocument()
    act(() => {
      vi.advanceTimersByTime(600)
    })
    vi.useRealTimers()
    await waitFor(() => expect(screen.queryByText('Gespeichert')).not.toBeInTheDocument())
  })

  it('pausiert bei Hover und läuft danach mit der Restzeit weiter', async () => {
    vi.useFakeTimers()
    const api = setup()
    act(() => {
      api.toast({ title: 'Hover', duration: 1000 })
    })
    const item = screen.getByRole('listitem')
    act(() => {
      vi.advanceTimersByTime(600)
    })
    fireEvent.pointerEnter(item)
    act(() => {
      vi.advanceTimersByTime(5000)
    })
    expect(screen.getByText('Hover')).toBeInTheDocument()

    fireEvent.pointerLeave(item)
    act(() => {
      vi.advanceTimersByTime(300)
    })
    expect(screen.getByText('Hover')).toBeInTheDocument()
    act(() => {
      vi.advanceTimersByTime(200)
    })
    vi.useRealTimers()
    await waitFor(() => expect(screen.queryByText('Hover')).not.toBeInTheDocument())
  })

  it('bleibt pausiert, solange er fokussiert ist – auch wenn der Zeiger ihn verlässt', async () => {
    vi.useFakeTimers()
    const api = setup()
    act(() => {
      api.toast({ title: 'Fokus', duration: 1000 })
    })
    const item = screen.getByRole('listitem')
    const close = within(item).getByRole('button', { name: 'Benachrichtigung schließen' })

    act(() => close.focus())
    fireEvent.pointerEnter(item)
    fireEvent.pointerLeave(item)
    act(() => {
      vi.advanceTimersByTime(5000)
    })
    // Tastaturnutzer lesen noch – der Toast darf nicht unter dem Fokus verschwinden.
    expect(screen.getByText('Fokus')).toBeInTheDocument()

    act(() => close.blur())
    act(() => {
      vi.advanceTimersByTime(1100)
    })
    vi.useRealTimers()
    await waitFor(() => expect(screen.queryByText('Fokus')).not.toBeInTheDocument())
  })

  it('lässt sich über den Schließen-Button entfernen', async () => {
    const user = userEvent.setup()
    const api = setup()
    act(() => {
      api.toast({ title: 'Hinweis', duration: Number.POSITIVE_INFINITY })
    })
    await user.click(screen.getByRole('button', { name: 'Benachrichtigung schließen' }))
    await waitFor(() => expect(screen.queryByText('Hinweis')).not.toBeInTheDocument())
  })

  it('zeigt höchstens vier Toasts gleichzeitig (älteste fallen heraus)', async () => {
    const api = setup()
    act(() => {
      for (let i = 1; i <= 5; i++) api.toast({ title: `Toast ${i}`, duration: Number.POSITIVE_INFINITY })
    })
    await waitFor(() => expect(screen.queryByText('Toast 1')).not.toBeInTheDocument())
    expect(screen.getByText('Toast 5')).toBeInTheDocument()
    expect(within(region()).getAllByRole('listitem')).toHaveLength(4)
  })

  it('liefert IDs, mit denen sich Toasts gezielt schließen lassen', async () => {
    const api = setup()
    let id = ''
    act(() => {
      id = api.toast({ title: 'Wird geschlossen', duration: Number.POSITIVE_INFINITY })
    })
    expect(id).not.toBe('')
    act(() => api.dismiss(id))
    await waitFor(() => expect(screen.queryByText('Wird geschlossen')).not.toBeInTheDocument())
  })

  it('ist ohne Provider wirkungslos statt abzustürzen', () => {
    const { result } = renderHook(() => useToast())
    expect(result.current.toast({ title: 'x' })).toBe('')
  })
})
