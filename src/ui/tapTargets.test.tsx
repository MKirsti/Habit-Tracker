// @vitest-environment jsdom
import { act, cleanup, render, renderHook, screen } from '@testing-library/react'
import { MotionGlobalConfig } from 'motion/react'
import { afterEach, beforeAll, describe, expect, it } from 'vitest'
import { Chip } from './Badge'
import { buttonClassName } from './buttonStyles'
import type { ButtonSize } from './buttonStyles'
import { SegmentedControl } from './SegmentedControl'
import { Switch } from './Switch'
import { ToastProvider } from './Toast'
import { useToast } from './useToast'

/**
 * Mobile Vorgabe: Jedes Tap-Ziel ist mindestens 40 px hoch – in jeder Größenvariante, denn Seiten
 * nutzen `size="sm"` auch auf dem Handy. jsdom kennt kein Layout, daher wird die Höhe aus den
 * Tailwind-Klassen der Basisvariante (ohne Breakpoint-Präfix) abgelesen: h-N / size-N / min-h-N = N × 4 px.
 */
function tapHeightPx(className: string): number {
  let px = 0
  for (const token of className.split(/\s+/)) {
    const match = /^(?:h|size|min-h)-(\d+(?:\.\d+)?)$/.exec(token)
    if (match) px = Math.max(px, Number(match[1]) * 4)
  }
  return px
}

const SIZES: ButtonSize[] = ['sm', 'md', 'lg']

beforeAll(() => {
  MotionGlobalConfig.skipAnimations = true
})
afterEach(cleanup)

describe('Tap-Ziele ≥ 40 px', () => {
  it.each(SIZES)('Button und IconButton in Größe %s', (size) => {
    expect(tapHeightPx(buttonClassName({ size }))).toBeGreaterThanOrEqual(40)
    expect(tapHeightPx(buttonClassName({ size, iconOnly: true }))).toBeGreaterThanOrEqual(40)
  })

  it.each(['sm', 'md'] as const)('Chip in Größe %s', (size) => {
    render(<Chip size={size}>Mo</Chip>)
    expect(tapHeightPx(screen.getByRole('button').className)).toBeGreaterThanOrEqual(40)
  })

  it.each(['sm', 'md'] as const)('Segmente des SegmentedControl in Größe %s', (size) => {
    render(
      <SegmentedControl
        aria-label="Rhythmus"
        size={size}
        value="a"
        onChange={() => {}}
        options={[
          { value: 'a', label: 'A' },
          { value: 'b', label: 'B' },
        ]}
      />,
    )
    for (const radio of screen.getAllByRole('radio')) {
      expect(tapHeightPx(radio.className)).toBeGreaterThanOrEqual(40)
    }
  })

  it('Switch ohne sichtbares Label', () => {
    render(<Switch aria-label="Effekte" checked={false} onChange={() => {}} />)
    expect(tapHeightPx(screen.getByRole('switch').className)).toBeGreaterThanOrEqual(40)
  })

  it('Schließen-Button eines Toasts', () => {
    const { result } = renderHook(() => useToast(), {
      wrapper: ({ children }) => <ToastProvider>{children}</ToastProvider>,
    })
    act(() => {
      result.current.toast({ title: 'Hinweis', duration: Number.POSITIVE_INFINITY })
    })
    const close = screen.getByRole('button', { name: 'Benachrichtigung schließen' })
    expect(tapHeightPx(close.className)).toBeGreaterThanOrEqual(40)
  })
})
