// @vitest-environment jsdom
import { act, cleanup, render } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { GameContext } from '../../app/gameContext'
import type { GameContextValue } from '../../app/gameContext'
import { deriveGameState } from '../../domain/engine'
import { makeGameData } from '../../domain/testing'
import { HitParticles } from './HitParticles'
import { BURST_LIFETIME_MS, sparksFor } from './hitParticles'

const TODAY = '2026-11-04'
const VIOLET = '#9b3fb5'

function withEffects(effects: boolean, ui: ReactNode) {
  const data = makeGameData({ settings: { dayStartHour: 4, effects } })
  const value: GameContextValue = { data, today: TODAY, state: deriveGameState(data, TODAY) }
  return <GameContext.Provider value={value}>{ui}</GameContext.Provider>
}

function reduceMotion(reduce: boolean) {
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: reduce && query.includes('prefers-reduced-motion: reduce'),
    media: query,
    addEventListener() {},
    removeEventListener() {},
  }))
}

const layer = (container: HTMLElement) => container.querySelector<HTMLElement>('[data-hit-particles]')
const sparks = (container: HTMLElement) => container.querySelectorAll<HTMLElement>('[data-spark]')

beforeEach(() => {
  vi.useFakeTimers()
  reduceMotion(false)
})
afterEach(() => {
  cleanup()
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

describe('HitParticles', () => {
  it('sprüht nichts beim Einhängen – erst, wenn sich der Auslöser ändert', () => {
    const { container, rerender } = render(withEffects(true, <HitParticles trigger={3} color={VIOLET} />))
    expect(layer(container)).toBeNull()

    rerender(withEffects(true, <HitParticles trigger={4} color={VIOLET} />))
    const burst = layer(container)
    expect(burst).not.toBeNull()
    expect(burst).toHaveAttribute('aria-hidden', 'true')
    expect(burst?.className).toContain('pointer-events-none')
    expect(sparks(container)).toHaveLength(10)
  })

  it('färbt die Funken in der Trefferfarbe, gemischt mit Gold', () => {
    const { container, rerender } = render(withEffects(true, <HitParticles trigger={0} color={VIOLET} />))
    rerender(withEffects(true, <HitParticles trigger={1} color={VIOLET} />))
    const colors = [...sparks(container)].map((spark) => spark.style.background)
    expect(colors.some((color) => color.includes('155, 63, 181') || color === VIOLET)).toBe(true)
    expect(colors.some((color) => color.includes('--color-gold-bright'))).toBe(true)
    for (const spark of sparks(container)) expect(spark.style.animation).toContain('hit-spark')
  })

  it('räumt den Schwall nach dem Verglühen ab', () => {
    const { container, rerender } = render(withEffects(true, <HitParticles trigger={0} color={VIOLET} />))
    rerender(withEffects(true, <HitParticles trigger={1} color={VIOLET} />))
    expect(layer(container)).not.toBeNull()
    act(() => vi.advanceTimersByTime(BURST_LIFETIME_MS + 1))
    expect(layer(container)).toBeNull()
  })

  it('lässt schnelle Treffer nebeneinander sprühen – höchstens drei Schwälle', () => {
    const { container, rerender } = render(withEffects(true, <HitParticles trigger={0} color={VIOLET} />))
    for (let hit = 1; hit <= 5; hit += 1) rerender(withEffects(true, <HitParticles trigger={hit} color={VIOLET} />))
    expect(container.querySelectorAll('[data-hit-burst]')).toHaveLength(3)
    expect(layer(container)).toHaveAttribute('data-hit-particles', '3')
  })

  it('macht starke Treffer größer: mehr Funken und ein Ring', () => {
    const { container, rerender } = render(withEffects(true, <HitParticles trigger={0} color={VIOLET} strong />))
    rerender(withEffects(true, <HitParticles trigger={1} color={VIOLET} strong />))
    expect(sparks(container)).toHaveLength(16)
    expect(container.querySelector('[data-hit-burst]')).toHaveAttribute('data-strong')
    expect(container.innerHTML).toContain('hit-ring')
  })

  it('nimmt eigene Anzahl und Flugweite', () => {
    const { container, rerender } = render(withEffects(true, <HitParticles trigger={0} color={VIOLET} count={6} />))
    rerender(withEffects(true, <HitParticles trigger={1} color={VIOLET} count={6} />))
    expect(sparks(container)).toHaveLength(6)
  })

  it('bleibt ohne „Effekte“ still', () => {
    const { container, rerender } = render(withEffects(false, <HitParticles trigger={0} color={VIOLET} />))
    rerender(withEffects(false, <HitParticles trigger={1} color={VIOLET} />))
    expect(layer(container)).toBeNull()
  })

  it('bleibt bei reduzierter Bewegung still', () => {
    reduceMotion(true)
    const { container, rerender } = render(withEffects(true, <HitParticles trigger={0} color={VIOLET} />))
    rerender(withEffects(true, <HitParticles trigger={1} color={VIOLET} />))
    expect(layer(container)).toBeNull()
  })

  it('lässt einen laufenden Schwall verschwinden, wenn Effekte ausgeschaltet werden – ohne später nachzuholen', () => {
    const { container, rerender } = render(withEffects(true, <HitParticles trigger={0} color={VIOLET} />))
    rerender(withEffects(true, <HitParticles trigger={1} color={VIOLET} />))
    expect(layer(container)).not.toBeNull()
    rerender(withEffects(false, <HitParticles trigger={1} color={VIOLET} />))
    expect(layer(container)).toBeNull()
    rerender(withEffects(true, <HitParticles trigger={1} color={VIOLET} />))
    expect(layer(container)).toBeNull()
  })

  it('funktioniert auch außerhalb des Spielkontexts (Effekte gelten dann als an)', () => {
    const { container, rerender } = render(<HitParticles trigger={0} color={VIOLET} />)
    rerender(<HitParticles trigger={2} color={VIOLET} />)
    expect(sparks(container)).toHaveLength(10)
  })

  it('sprüht bei 0 nichts (Zurücksetzen)', () => {
    const { container, rerender } = render(withEffects(true, <HitParticles trigger={4} color={VIOLET} />))
    rerender(withEffects(true, <HitParticles trigger={0} color={VIOLET} />))
    expect(layer(container)).toBeNull()
  })
})

describe('sparksFor', () => {
  const burst = { id: 1, seed: 7, strong: false }

  it('ist deterministisch und verteilt die Funken rundherum', () => {
    const first = sparksFor(burst, VIOLET, 12, 30)
    expect(sparksFor(burst, VIOLET, 12, 30)).toEqual(first)
    const xs = first.map((spark) => Number.parseFloat(String((spark.style as Record<string, unknown>)['--spark-x'])))
    expect(xs.some((x) => x > 5)).toBe(true)
    expect(xs.some((x) => x < -5)).toBe(true)
    for (const x of xs) expect(Math.abs(x)).toBeLessThanOrEqual(30 * 1.2 + 0.1)
  })

  it('sieht bei jedem Schwall etwas anders aus', () => {
    expect(sparksFor({ ...burst, seed: 8 }, VIOLET, 12, 30)).not.toEqual(sparksFor(burst, VIOLET, 12, 30))
  })

  it('bleibt in der Lebensdauer des Schwalls', () => {
    for (const spark of sparksFor(burst, VIOLET, 20, 30)) {
      const [duration, delay] = String(spark.style.animation)
        .match(/(\d+)ms/g)!
        .map((value) => Number.parseInt(value, 10))
      expect(duration + delay).toBeLessThan(BURST_LIFETIME_MS)
    }
  })
})
