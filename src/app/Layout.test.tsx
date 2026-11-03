// @vitest-environment jsdom
import { cleanup, render, screen, within } from '@testing-library/react'
import { MotionGlobalConfig } from 'motion/react'
import { RouterProvider, createMemoryRouter } from 'react-router'
import { afterEach, beforeAll, describe, expect, it } from 'vitest'
import { Layout } from './Layout'

beforeAll(() => {
  MotionGlobalConfig.skipAnimations = true
})
afterEach(cleanup)

function renderLayout() {
  const router = createMemoryRouter(
    [
      {
        path: '*',
        element: (
          <Layout>
            <p>Inhalt</p>
          </Layout>
        ),
      },
    ],
    { initialEntries: ['/'] },
  )
  return render(<RouterProvider router={router} />)
}

describe('Layout', () => {
  it('hält die mobile Kopfzeile schlank (≤ 48 px ohne Safe Area), damit die heutigen Quests weit oben stehen', () => {
    renderLayout()
    const topBar = screen.getByRole('banner')
    expect(within(topBar).getByText('Questlog')).toBeInTheDocument()
    // Kein Ornament-Trenner mehr (er kostete ~16 px Höhe); eine Haarlinie reicht.
    expect(within(topBar).queryByRole('separator')).not.toBeInTheDocument()
    const bar = topBar.firstElementChild
    expect(bar?.className.split(/\s+/)).toContain('h-11')
    // Statusleiste/Notch bleibt berücksichtigt.
    expect(topBar.className.split(/\s+/)).toContain('pt-safe')
  })

  it('rendert Inhalt, Seitenleiste und untere Navigation', () => {
    renderLayout()
    expect(screen.getByRole('main')).toHaveTextContent('Inhalt')
    expect(screen.getAllByRole('navigation', { name: 'Hauptnavigation' })).toHaveLength(2)
  })
})
