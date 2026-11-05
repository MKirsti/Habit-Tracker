// @vitest-environment jsdom
import { act, cleanup, render, renderHook } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { GameContext } from '../../app/gameContext'
import type { GameContextValue } from '../../app/gameContext'
import { deriveGameState } from '../../domain/engine'
import { makeGameData } from '../../domain/testing'
import type { Settings } from '../../domain/types'
import { resetSoundEngine } from './engine'
import { FakeAudioContext } from './fakeAudio'
import { MAX_STEP_MS, gentlePattern, vibrateDevice } from './haptics'
import { useGameSounds } from './index'

const TODAY = '2026-11-04'

function contextWith(settings: Partial<Settings>): GameContextValue {
  const data = makeGameData({ settings: { dayStartHour: 4, effects: true, ...settings } })
  return { data, today: TODAY, state: deriveGameState(data, TODAY) }
}

function wrapperFor(settings: Partial<Settings>) {
  const value = contextWith(settings)
  return function Wrapper({ children }: { children: ReactNode }) {
    return <GameContext.Provider value={value}>{children}</GameContext.Provider>
  }
}

function stubVibrate(implementation: (pattern: VibratePattern) => boolean = () => true) {
  const vibrate = vi.fn(implementation)
  Object.defineProperty(navigator, 'vibrate', { value: vibrate, configurable: true, writable: true })
  return vibrate
}

beforeEach(() => {
  resetSoundEngine()
  FakeAudioContext.reset({ state: 'suspended' })
})
afterEach(() => {
  cleanup()
  resetSoundEngine()
  vi.unstubAllGlobals()
  // jsdom kennt navigator.vibrate nicht – ein im Test gesetztes wieder entfernen.
  delete (navigator as { vibrate?: unknown }).vibrate
})

describe('useGameSounds – ohne Web Audio (jsdom)', () => {
  it('stürzt nicht ab, auch wenn Klänge an sind', () => {
    expect(globalThis.AudioContext).toBeUndefined()
    const { result } = renderHook(() => useGameSounds(), { wrapper: wrapperFor({ sound: true, haptics: true }) })
    expect(() => {
      result.current.play('check')
      result.current.play('victory')
      result.current.vibrate([10, 20, 10])
    }).not.toThrow()
    // Auch eine Geste weckt nichts, das es nicht gibt.
    expect(() => act(() => document.body.dispatchEvent(new Event('pointerdown', { bubbles: true })))).not.toThrow()
  })

  it('bleibt außerhalb des Spielkontexts still, statt zu werfen', () => {
    vi.stubGlobal('AudioContext', FakeAudioContext)
    const vibrate = stubVibrate()
    const { result } = renderHook(() => useGameSounds())
    result.current.play('check')
    result.current.vibrate(20)
    expect(FakeAudioContext.instances).toHaveLength(0)
    expect(vibrate).not.toHaveBeenCalled()
  })
})

describe('useGameSounds – Einstellung „Klänge“', () => {
  beforeEach(() => {
    vi.stubGlobal('AudioContext', FakeAudioContext)
  })

  it('ist standardmäßig aus: kein AudioContext, kein Ton', () => {
    const { result } = renderHook(() => useGameSounds(), { wrapper: wrapperFor({}) })
    result.current.play('levelUp')
    act(() => document.body.dispatchEvent(new Event('pointerdown', { bubbles: true })))
    expect(FakeAudioContext.instances).toHaveLength(0)
  })

  it('bleibt bei ausgeschalteten Klängen still', () => {
    const { result } = renderHook(() => useGameSounds(), { wrapper: wrapperFor({ sound: false, haptics: true }) })
    result.current.play('chest')
    expect(FakeAudioContext.instances).toHaveLength(0)
  })

  it('spielt bei eingeschalteten Klängen – der Ton erwacht erst mit der ersten Geste', async () => {
    const { result } = renderHook(() => useGameSounds(), { wrapper: wrapperFor({ sound: true }) })
    // Noch keine Geste: kein AudioContext (lazy).
    expect(FakeAudioContext.instances).toHaveLength(0)
    act(() => document.body.dispatchEvent(new Event('pointerdown', { bubbles: true })))
    expect(FakeAudioContext.instances).toHaveLength(1)
    const [ctx] = FakeAudioContext.instances
    expect(ctx.resumeCalls).toBe(1)
    expect(ctx.state).toBe('running')

    result.current.play('check')
    expect(ctx.ofKind('oscillator').length).toBeGreaterThan(0)
  })

  it('weckt beim Spielen mit, wenn der Ton noch schläft', async () => {
    const { result } = renderHook(() => useGameSounds(), { wrapper: wrapperFor({ sound: true }) })
    result.current.play('achievement')
    const [ctx] = FakeAudioContext.instances
    expect(ctx.resumeCalls).toBe(1)
    await act(async () => {
      await Promise.resolve()
    })
    expect(ctx.ofKind('oscillator').length).toBeGreaterThan(0)
  })

  it('lässt den Ton schlafen, wenn Klänge ausgeschaltet werden', () => {
    let settings: Partial<Settings> = { sound: true }
    function Wrapper({ children }: { children: ReactNode }) {
      return <GameContext.Provider value={contextWith(settings)}>{children}</GameContext.Provider>
    }
    const { result, rerender } = renderHook(() => useGameSounds(), { wrapper: Wrapper })
    act(() => document.body.dispatchEvent(new Event('click', { bubbles: true })))
    const [ctx] = FakeAudioContext.instances
    expect(ctx.state).toBe('running')

    settings = { sound: false }
    rerender()
    expect(ctx.state).toBe('suspended')
    result.current.play('check')
    expect(ctx.ofKind('oscillator')).toHaveLength(0)
    // Ohne Klänge weckt auch eine Geste nichts mehr.
    act(() => document.body.dispatchEvent(new Event('click', { bubbles: true })))
    expect(ctx.state).toBe('suspended')
  })

  it('folgt „Bewegung reduzieren“ nicht – das betrifft nur das Sichtbare', () => {
    vi.stubGlobal('matchMedia', (query: string) => ({
      matches: query.includes('reduce'),
      media: query,
      addEventListener() {},
      removeEventListener() {},
    }))
    FakeAudioContext.reset({ state: 'running' })
    const { result } = renderHook(() => useGameSounds(), { wrapper: wrapperFor({ sound: true, effects: false }) })
    result.current.play('bossHit')
    expect(FakeAudioContext.instances[0].ofKind('oscillator').length).toBeGreaterThan(0)
  })

  it('liefert dasselbe Objekt, solange sich die Einstellungen nicht ändern', () => {
    const wrapper = wrapperFor({ sound: true, haptics: true })
    const { result, rerender } = renderHook(() => useGameSounds(), { wrapper })
    const first = result.current
    rerender()
    expect(result.current).toBe(first)
  })
})

describe('useGameSounds – Einstellung „Vibration“', () => {
  it('vibriert nur, wenn sie eingeschaltet ist', () => {
    const vibrate = stubVibrate()
    const off = renderHook(() => useGameSounds(), { wrapper: wrapperFor({ sound: true }) })
    off.result.current.vibrate([12, 40, 12])
    expect(vibrate).not.toHaveBeenCalled()

    const on = renderHook(() => useGameSounds(), { wrapper: wrapperFor({ haptics: true }) })
    on.result.current.vibrate([12, 40, 12])
    expect(vibrate).toHaveBeenCalledWith([12, 40, 12])
    on.result.current.vibrate(20)
    expect(vibrate).toHaveBeenLastCalledWith(20)
  })

  it('stürzt nicht ab, wenn das Gerät nicht vibrieren kann oder der Browser ablehnt', () => {
    const { result } = renderHook(() => useGameSounds(), { wrapper: wrapperFor({ haptics: true }) })
    expect('vibrate' in navigator).toBe(false)
    expect(() => result.current.vibrate(30)).not.toThrow()

    stubVibrate(() => {
      throw new Error('Erst tippen')
    })
    expect(() => result.current.vibrate(30)).not.toThrow()
  })

  it('vibriert nicht in einem unsichtbaren Tab', () => {
    const vibrate = stubVibrate()
    const visibility = vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden')
    expect(vibrateDevice(20)).toBe(false)
    visibility.mockRestore()
    expect(vibrateDevice(20)).toBe(true)
    expect(vibrate).toHaveBeenCalledTimes(1)
  })

  it('hält Muster sanft: gedeckelt, nicht negativ, nie leer', () => {
    expect(gentlePattern(5_000)).toBe(MAX_STEP_MS)
    expect(gentlePattern(-3)).toBeUndefined()
    expect(gentlePattern(Number.NaN)).toBeUndefined()
    expect(gentlePattern([20, -5, 9_999])).toEqual([20, 0, MAX_STEP_MS])
    expect(gentlePattern([0, 50])).toBeUndefined()
    expect(gentlePattern(Array.from({ length: 30 }, () => 10))).toHaveLength(10)
  })
})

describe('useGameSounds in einer Komponente', () => {
  it('lässt sich aus einem Klick-Handler heraus benutzen', () => {
    vi.stubGlobal('AudioContext', FakeAudioContext)
    const vibrate = stubVibrate()
    function Button() {
      const { play, vibrate: buzz } = useGameSounds()
      return (
        <button
          type="button"
          onClick={() => {
            play('check')
            buzz(12)
          }}
        >
          Abhaken
        </button>
      )
    }
    const value = contextWith({ sound: true, haptics: true })
    const { getByRole } = render(
      <GameContext.Provider value={value}>
        <Button />
      </GameContext.Provider>,
    )
    act(() => getByRole('button').click())
    const [ctx] = FakeAudioContext.instances
    // Die Geste hat den Ton geweckt (Lauscher in der Capture-Phase), der Klang ist geplant.
    expect(ctx.state).toBe('running')
    expect(ctx.ofKind('oscillator').length).toBeGreaterThan(0)
    expect(vibrate).toHaveBeenCalledWith(12)
  })
})
