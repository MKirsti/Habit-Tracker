// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import { MotionGlobalConfig } from 'motion/react'
import { afterEach, beforeAll, describe, expect, it } from 'vitest'
import { ProgressBar } from './ProgressBar'
import { XpBar } from './XpBar'

beforeAll(() => {
  MotionGlobalConfig.skipAnimations = true
})
afterEach(cleanup)

describe('ProgressBar', () => {
  it('stellt den Fortschritt als progressbar in Prozent dar', () => {
    render(<ProgressBar value={0.544} label="Kapitel 2" />)
    const bar = screen.getByRole('progressbar', { name: 'Kapitel 2' })
    expect(bar).toHaveAttribute('aria-valuemin', '0')
    expect(bar).toHaveAttribute('aria-valuemax', '100')
    expect(bar).toHaveAttribute('aria-valuenow', '54')
    expect(bar).toHaveAttribute('aria-valuetext', '54 %')
  })

  it.each([
    [1.7, '100'],
    [-0.3, '0'],
    [Number.NaN, '0'],
    [1, '100'],
  ])('begrenzt %d auf %s %%', (value, expected) => {
    render(<ProgressBar value={value} />)
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', expected)
  })

  it('nutzt "Fortschritt" als Standardnamen und erlaubt eigenen valueText', () => {
    render(<ProgressBar value={0.6} valueText="3 von 5 Kapiteln" />)
    const bar = screen.getByRole('progressbar', { name: 'Fortschritt' })
    expect(bar).toHaveAttribute('aria-valuetext', '3 von 5 Kapiteln')
  })

  it('zeigt Label und Wertbeschriftung sichtbar an', () => {
    render(<ProgressBar value={0.5} label="Lesen" valueLabel="5 / 10" />)
    expect(screen.getByText('Lesen')).toBeInTheDocument()
    expect(screen.getByText('5 / 10')).toBeInTheDocument()
  })
})

describe('XpBar', () => {
  it('formatiert XP de-DE und beschreibt den Weg zum nächsten Level', () => {
    render(<XpBar level={7} xpIntoLevel={820} xpForNextLevel={1470} />)
    expect(screen.getByText('1.470', { exact: false })).toBeInTheDocument()
    const bar = screen.getByRole('progressbar', { name: 'Erfahrung' })
    expect(bar).toHaveAttribute('aria-valuenow', '56')
    expect(bar).toHaveAttribute('aria-valuetext', '820 von 1.470 XP bis Level 8')
  })

  it('kommt mit 0 XP-Bedarf ohne Division durch null aus', () => {
    render(<XpBar level={1} xpIntoLevel={0} xpForNextLevel={0} />)
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '0')
  })
})
