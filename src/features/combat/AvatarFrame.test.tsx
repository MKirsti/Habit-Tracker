// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import { MotionGlobalConfig } from 'motion/react'
import { afterEach, beforeAll, describe, expect, it } from 'vitest'
import { GameContext } from '../../app/gameContext'
import type { GameContextValue } from '../../app/gameContext'
import { deriveGameState } from '../../domain/engine'
import { makeGameData } from '../../domain/testing'
import { AvatarFrame } from './AvatarFrame'

beforeAll(() => {
  MotionGlobalConfig.skipAnimations = true
})
afterEach(cleanup)

function frameOf(container: HTMLElement): HTMLElement {
  const element = container.querySelector<HTMLElement>('[data-avatar-frame]')
  if (!element) throw new Error('kein Rahmen gerendert')
  return element
}

function withEffects(effects: boolean, ui: React.ReactNode) {
  const data = makeGameData({ settings: { dayStartHour: 4, effects } })
  const value: GameContextValue = { data, today: '2026-11-04', state: deriveGameState(data, '2026-11-04') }
  return <GameContext.Provider value={value}>{ui}</GameContext.Provider>
}

describe('AvatarFrame', () => {
  it('zeigt ohne Rahmen die vertraute goldene Plakette (dekorativ)', () => {
    const { container } = render(<AvatarFrame size="sm">🧙</AvatarFrame>)
    const frame = frameOf(container)
    expect(frame).toHaveAttribute('data-avatar-frame', 'none')
    expect(frame).toHaveAttribute('aria-hidden', 'true')
    expect(frame.className).toContain('ring-gold/45')
    expect(frame.className).toContain('size-11')
    expect(frame).toHaveTextContent('🧙')
  })

  it('fällt bei unbekanntem Rahmen auf die Plakette zurück', () => {
    const { container } = render(<AvatarFrame frameId="gibt-es-nicht">🧙</AvatarFrame>)
    expect(frameOf(container)).toHaveAttribute('data-avatar-frame', 'none')
  })

  it('malt den Ring aus den Farben des Rahmens – ohne Glanzbogen bei gewöhnlichen Rahmen', () => {
    const { container } = render(
      <AvatarFrame frameId="bronze" size="lg">
        🧙
      </AvatarFrame>,
    )
    const frame = frameOf(container)
    expect(frame).toHaveAttribute('data-avatar-frame', 'bronze')
    expect(frame).toHaveAttribute('data-rarity', 'common')
    expect(frame.style.background).toContain('conic-gradient')
    expect(frame.className).toContain('size-[4.5rem]')
    expect(frame).not.toHaveAttribute('data-shine')
    expect(container.querySelector('[data-frame-shine]')).toBeNull()
  })

  it('lässt seltene und legendäre Rahmen glänzen – bewegt nur mit „Effekte“', () => {
    const on = render(withEffects(true, <AvatarFrame frameId="stardust">🧙</AvatarFrame>))
    expect(frameOf(on.container)).toHaveAttribute('data-shine', 'moving')
    expect(on.container.querySelector('[data-frame-shine]')).not.toBeNull()
    on.unmount()

    const off = render(withEffects(false, <AvatarFrame frameId="stardust">🧙</AvatarFrame>))
    expect(frameOf(off.container)).toHaveAttribute('data-shine', 'still')
    expect(off.container.querySelector('[data-frame-shine]')).not.toBeNull()
    off.unmount()

    const forced = render(withEffects(true, <AvatarFrame frameId="dragon-scale" animate={false}>🧙</AvatarFrame>))
    expect(frameOf(forced.container)).toHaveAttribute('data-shine', 'still')
  })

  it('bekommt mit `label` einen zugänglichen Namen', () => {
    render(
      <AvatarFrame frameId="gold" label="Rahmen Goldreif">
        🧙
      </AvatarFrame>,
    )
    expect(screen.getByRole('img', { name: 'Rahmen Goldreif' })).toHaveAttribute('data-avatar-frame', 'gold')
  })
})
