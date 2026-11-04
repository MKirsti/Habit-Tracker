// @vitest-environment jsdom
import 'fake-indexeddb/auto'
import { cleanup, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MotionGlobalConfig } from 'motion/react'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { loadGameData, resetAllData, saveProfile } from '../data/repository'
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

beforeAll(async () => {
  await resetAllData()
  await saveProfile({ name: 'Testheld', avatar: '🧙', createdDay: '2026-11-03' })
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
    expect(labels).toEqual(['Heute', 'Quests', 'Kampagne', 'Schätze', 'Held'])
    expect(NAV_ITEMS.map((item) => item.sidebarLabel)).toEqual(['Heute', 'Quests', 'Kampagne', 'Schatzkammer', 'Held'])
    expect(NAV_ITEMS.map((item) => item.to)).toEqual(['/', '/quests', '/kampagne', '/schatzkammer', '/held'])
    // Die Einstellungen stehen nicht mehr in der Leiste (erreichbar über das Zahnrad der Held-Seite).
    expect(within(bottomNav()).queryByRole('link', { name: /Einstellungen|Optionen/ })).not.toBeInTheDocument()
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

  // Alle Seiten außer „Heute“ werden nachgeladen (Code-Splitting) – auch direkt per Adresse geöffnet.
  it.each([
    ['#/quests', 'Quests'],
    ['#/kampagne', 'Kampagne'],
    ['#/schatzkammer', 'Schatzkammer'],
    ['#/held', 'Held'],
  ])('öffnet die nachgeladene Seite %s direkt per Adresse', async (hash, title) => {
    window.location.hash = hash
    render(<App />)
    expect(await screen.findByRole('heading', { level: 1, name: title })).toBeInTheDocument()
    expect(
      within(bottomNav()).getByRole('link', { name: NAV_ITEMS.find((item) => `#${item.to}` === hash)?.label }),
    ).toHaveAttribute('aria-current', 'page')
  })

  it('öffnet die Einstellungen direkt per Adresse und hebt dabei „Held“ hervor', async () => {
    window.location.hash = '#/einstellungen'
    render(<App />)
    expect(await screen.findByRole('heading', { level: 1, name: 'Einstellungen' })).toBeInTheDocument()
    const hero = within(bottomNav()).getByRole('link', { name: 'Held' })
    // Optisch aktiv (Unterseite des Helden), aber nicht „aktuelle Seite“ – das ist die Einstellungen-Seite.
    expect(hero).toHaveClass('text-gold-bright')
    expect(hero).not.toHaveAttribute('aria-current')
  })

  it('erreicht die Einstellungen über das Zahnrad der Held-Seite und kommt zurück zum Helden', async () => {
    const user = userEvent.setup()
    window.location.hash = '#/held'
    render(<App />)
    await screen.findByRole('heading', { level: 1, name: 'Held' })
    await user.click(screen.getByRole('link', { name: 'Einstellungen' }))
    expect(await screen.findByRole('heading', { level: 1, name: 'Einstellungen' })).toBeInTheDocument()
    expect(window.location.hash).toBe('#/einstellungen')

    await user.click(screen.getByRole('link', { name: 'Zurück zum Helden' }))
    expect(await screen.findByRole('heading', { level: 1, name: 'Held' })).toBeInTheDocument()
    expect(window.location.hash).toBe('#/held')
  })

  it('navigiert zur Schatzkammer', async () => {
    const user = userEvent.setup()
    render(<App />)
    await screen.findByRole('heading', { level: 1, name: 'Heute' })
    await user.click(within(bottomNav()).getByRole('link', { name: 'Schätze' }))
    expect(await screen.findByRole('heading', { level: 1, name: 'Schatzkammer' })).toBeInTheDocument()
    expect(window.location.hash).toBe('#/schatzkammer')
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

describe('Lebenspunkte', () => {
  it('rechnet beim Start ab (HpSettler ist eingebunden) – ab heute, nie rückwirkend', async () => {
    render(<App />)
    await screen.findByRole('heading', { level: 1, name: 'Heute' })
    await waitFor(async () => expect((await loadGameData()).settings.penalties?.since).toMatch(/^\d{4}-\d{2}-\d{2}$/))
  })
})

describe('Onboarding-Weiche', () => {
  it('zeigt ohne Charakter-Profil das Onboarding statt der App', async () => {
    await resetAllData()
    render(<App />)
    expect(await screen.findByRole('heading', { level: 1, name: 'Willkommen' })).toBeInTheDocument()
    expect(screen.queryByRole('navigation', { name: 'Hauptnavigation' })).not.toBeInTheDocument()
    await saveProfile({ name: 'Testheld', avatar: '🧙', createdDay: '2026-11-03' })
  })
})

describe('Dauerhafter Speicher', () => {
  /** Simuliert die StorageManager-API (jsdom hat keine) mit noch nicht geschütztem Speicher. */
  function mockStorage() {
    const persist = vi.fn(async () => true)
    Object.defineProperty(navigator, 'storage', {
      configurable: true,
      value: { persisted: vi.fn(async () => false), persist },
    })
    return persist
  }

  afterEach(async () => {
    delete (navigator as { storage?: StorageManager }).storage
    await saveProfile({ name: 'Testheld', avatar: '🧙', createdDay: '2026-11-03' })
  })

  it('bittet mit vorhandenem Helden beim Start um dauerhaften Speicher', async () => {
    const persist = mockStorage()
    render(<App />)
    await screen.findByRole('heading', { level: 1, name: 'Heute' })
    await waitFor(() => expect(persist).toHaveBeenCalled())
  })

  it('fragt vor dem Onboarding noch nicht, erst sobald der Held angelegt ist', async () => {
    const persist = mockStorage()
    await resetAllData()
    render(<App />)
    await screen.findByRole('heading', { level: 1, name: 'Willkommen' })
    expect(persist).not.toHaveBeenCalled()

    await saveProfile({ name: 'Testheld', avatar: '🧙', createdDay: '2026-11-03' })
    await screen.findByRole('heading', { level: 1, name: 'Heute' })
    await waitFor(() => expect(persist).toHaveBeenCalled())
  })
})
