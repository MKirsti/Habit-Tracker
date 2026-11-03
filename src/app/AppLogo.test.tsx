// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { AppLogo, Crest } from './AppLogo'

afterEach(cleanup)

/** Wirksames `fill` eines SVG-Elements: eigenes Attribut oder das nächste geerbte (SVG-Standard: schwarz). */
function effectiveFill(element: Element | null): string {
  for (let current = element; current; current = current.parentElement) {
    const fill = current.getAttribute('fill')
    if (fill !== null) return fill
  }
  return 'black'
}

describe('Crest', () => {
  it('füllt offene Linienpfade nicht (sonst entstehen schwarze Flächen unter den Buchzeilen)', () => {
    const { container } = render(<Crest />)
    const openPaths = [...container.querySelectorAll('path')].filter(
      (path) => !/z\s*$/i.test(path.getAttribute('d') ?? ''),
    )
    expect(openPaths.length).toBeGreaterThan(0)
    for (const path of openPaths) {
      expect(effectiveFill(path), path.getAttribute('d') ?? '').toBe('none')
    }
  })

  it('ist ohne Titel dekorativ und mit Titel ein benanntes Bild', () => {
    const { container, rerender } = render(<Crest />)
    expect(container.querySelector('svg')).toHaveAttribute('aria-hidden', 'true')
    rerender(<Crest title="Questlog" />)
    expect(screen.getByRole('img', { name: 'Questlog' })).toBeInTheDocument()
  })
})

describe('AppLogo', () => {
  it('zeigt den Schriftzug und versteckt dann das Wappen vor Screenreadern', () => {
    render(<AppLogo />)
    expect(screen.getByText('Questlog')).toBeInTheDocument()
    expect(screen.queryByRole('img')).not.toBeInTheDocument()
  })

  it('benennt das Wappen, wenn der Schriftzug fehlt', () => {
    render(<AppLogo showWordmark={false} />)
    expect(screen.getByRole('img', { name: 'Questlog' })).toBeInTheDocument()
  })
})
