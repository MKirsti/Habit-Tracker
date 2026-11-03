// @vitest-environment jsdom
import { cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MotionGlobalConfig } from 'motion/react'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { App } from './App'
import { NAV_ITEMS } from './navigation'

/*
 * Nur für Vitest: Hier löst `react-router` zum CommonJS-Build auf, `react-router/dom` dagegen zum
 * ESM-Build – zwei Kopien mit getrennten React-Kontexten ("<Navigate> may be used only in the context
 * of a <Router>"). Im Browser/Vite-Build gibt es nur eine Kopie. Deshalb hier den RouterProvider aus
 * derselben Instanz wie `Navigate`/`NavLink` verwenden.
 */
vi.mock('react-router/dom', async () => {
  const router = await import('react-router')
  return { RouterProvider: router.RouterProvider }
})

beforeAll(() => {
  MotionGlobalConfig.skipAnimations = true
  // ScrollRestoration scrollt bei Navigationen; jsdom implementiert scrollTo nicht.
  window.scrollTo = vi.fn() as unknown as typeof window.scrollTo
})
afterEach(() => {
  cleanup()
  window.location.hash = ''
})

/** Die (mobile) untere Navigation – in jsdom sind beide Navigationen im DOM, CSS blendet je eine aus. */
function bottomNav() {
  return screen.getAllByRole('navigation', { name: 'Hauptnavigation' }).at(-1) as HTMLElement
}

describe('App-Rahmen', () => {
  it('zeigt auf "/" die Seite "Heute" und markiert sie in der Navigation', async () => {
    render(<App />)
    expect(await screen.findByRole('heading', { level: 1, name: 'Heute' })).toBeInTheDocument()
    expect(within(bottomNav()).getByRole('link', { name: 'Heute' })).toHaveAttribute('aria-current', 'page')
  })

  it('bietet alle fünf Hauptbereiche mit deutschen Beschriftungen an', async () => {
    render(<App />)
    await screen.findByRole('heading', { level: 1 })
    const labels = within(bottomNav())
      .getAllByRole('link')
      .map((link) => link.textContent)
    expect(labels).toEqual(NAV_ITEMS.map((item) => item.label))
    expect(NAV_ITEMS.map((item) => item.to)).toEqual(['/', '/quests', '/kampagne', '/held', '/einstellungen'])
  })

  it('navigiert per Hash-Router zwischen den Seiten', async () => {
    const user = userEvent.setup()
    render(<App />)
    await screen.findByRole('heading', { level: 1, name: 'Heute' })
    await user.click(within(bottomNav()).getByRole('link', { name: 'Kampagne' }))
    expect(await screen.findByRole('heading', { level: 1, name: 'Kampagne' })).toBeInTheDocument()
    expect(window.location.hash).toBe('#/kampagne')
    expect(within(bottomNav()).getByRole('link', { name: 'Heute' })).not.toHaveAttribute('aria-current')
  })

  it('leitet unbekannte Adressen auf "Heute" um', async () => {
    window.location.hash = '#/gibt-es-nicht'
    render(<App />)
    expect(await screen.findByRole('heading', { level: 1, name: 'Heute' })).toBeInTheDocument()
    expect(window.location.hash).toBe('#/')
  })

  it('hat einen Sprunglink, der den Hauptinhalt fokussiert', async () => {
    const user = userEvent.setup()
    render(<App />)
    await screen.findByRole('heading', { level: 1 })
    await user.click(screen.getByRole('button', { name: 'Zum Inhalt springen' }))
    expect(screen.getByRole('main')).toHaveFocus()
  })
})
