import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { MASTER_VOLUME, MAX_VOICES, STALE_MS, canPlaySound, createSoundEngine, defaultCreateContext } from './engine'
import { FakeAudioContext, asAudioContext } from './fakeAudio'
import type { FakeGain, FakeOscillator } from './fakeAudio'
import { SOUND_NAMES } from './sounds'
import type { SoundName } from './sounds'

/** Kleiner Gesten-Ziel-Ersatz (Node hat kein window). */
function gestureTarget() {
  const listeners = new Map<string, Set<EventListenerOrEventListenerObject>>()
  return {
    listeners,
    addEventListener(type: string, listener: EventListenerOrEventListenerObject) {
      if (!listeners.has(type)) listeners.set(type, new Set())
      listeners.get(type)?.add(listener)
    },
    removeEventListener(type: string, listener: EventListenerOrEventListenerObject) {
      listeners.get(type)?.delete(listener)
    },
    fire(type: string) {
      for (const listener of listeners.get(type) ?? []) {
        if (typeof listener === 'function') listener(new Event(type))
        else listener.handleEvent(new Event(type))
      }
    },
    count() {
      return [...listeners.values()].reduce((sum, set) => sum + set.size, 0)
    },
  }
}

function setup(options: { state?: 'running' | 'suspended'; resume?: 'run' | 'manual' | 'reject' | 'throw'; hidden?: boolean } = {}) {
  FakeAudioContext.reset({ state: options.state ?? 'running', resume: options.resume })
  let clock = 0
  const target = gestureTarget()
  const engine = createSoundEngine({
    createContext: () => asAudioContext(new FakeAudioContext()),
    now: () => clock,
    isHidden: () => options.hidden ?? false,
    gestureTarget: () => target,
  })
  return {
    engine,
    target,
    tick(ms: number) {
      clock += ms
    },
    context: () => FakeAudioContext.instances.at(-1),
  }
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
})
afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

async function settled() {
  // Promise-Ketten (resume → then) laufen als Mikroaufgaben.
  await vi.advanceTimersByTimeAsync(0)
}

describe('Klang-Maschine ohne Web Audio', () => {
  it('bleibt still und wirft nie, wenn es keinen AudioContext gibt', () => {
    expect(globalThis.AudioContext).toBeUndefined()
    expect(defaultCreateContext()).toBeUndefined()
    const engine = createSoundEngine()
    expect(() => {
      for (const name of SOUND_NAMES) engine.play(name)
      engine.unlock()
      const release = engine.retain()
      release()
      engine.suspend()
      engine.close()
    }).not.toThrow()
  })

  it('wirft auch nicht, wenn der Browser den AudioContext verweigert', () => {
    const engine = createSoundEngine({
      createContext: () => {
        throw new Error('Zu viele AudioContexts')
      },
    })
    expect(() => engine.play('check')).not.toThrow()
    expect(() => engine.unlock()).not.toThrow()
  })

  it('wirft nicht, wenn das Abspielen selbst scheitert', () => {
    FakeAudioContext.reset({ state: 'running' })
    const engine = createSoundEngine({
      createContext: () => {
        const fake = new FakeAudioContext()
        fake.createOscillator = () => {
          throw new Error('kaputt')
        }
        return asAudioContext(fake)
      },
    })
    expect(() => engine.play('levelUp')).not.toThrow()
  })

  it('nimmt den echten AudioContext bzw. webkitAudioContext, wenn es ihn gibt', () => {
    FakeAudioContext.reset()
    vi.stubGlobal('webkitAudioContext', FakeAudioContext)
    const ctx = defaultCreateContext()
    expect(ctx).toBeInstanceOf(FakeAudioContext)
    expect((ctx as unknown as FakeAudioContext).constructorOptions).toEqual({ latencyHint: 'interactive' })
  })
})

describe('Klang-Maschine mit Web Audio', () => {
  it('legt den AudioContext erst beim ersten Bedarf an (lazy)', () => {
    const { engine } = setup()
    expect(FakeAudioContext.instances).toHaveLength(0)
    engine.retain()
    expect(FakeAudioContext.instances).toHaveLength(0)
    engine.play('check')
    expect(FakeAudioContext.instances).toHaveLength(1)
    engine.play('achievement')
    expect(FakeAudioContext.instances).toHaveLength(1)
  })

  it('spielt leise: Gesamtlautstärke höchstens 0,15, hinter einem Begrenzer, am Lautsprecher', () => {
    const { engine, context } = setup()
    engine.play('victory')
    const ctx = context()!
    expect(MASTER_VOLUME).toBeLessThanOrEqual(0.15)
    const master = ctx.ofKind<FakeGain>('gain').find((gain) => gain.connections.includes(ctx.destination))
    expect(master?.gain.value).toBe(MASTER_VOLUME)
    const [limiter] = ctx.ofKind('compressor')
    expect(limiter.connections).toContain(master)
  })

  it.each(SOUND_NAMES)('plant „%s“ mit weichen Hüllkurven, die wieder verklingen', (name: SoundName) => {
    const { engine, context } = setup()
    engine.play(name)
    const ctx = context()!
    const oscillators = ctx.ofKind<FakeOscillator>('oscillator')
    expect(oscillators.length).toBeGreaterThan(0)
    for (const osc of oscillators) {
      expect(osc.started).toBeGreaterThan(0)
      expect(osc.stopped).toBeGreaterThan(osc.started!)
      expect(osc.stopped! - osc.started!).toBeLessThan(2.1)
      // Kein Teilton über 12 kHz.
      expect(osc.frequency.events[0].value).toBeLessThan(12_000)
    }
    // Jede Hüllkurve beginnt still, steigt an und fällt exponentiell auf (fast) null.
    const envelopes = ctx.ofKind<FakeGain>('gain').filter((gain) => gain.gain.events.length > 0)
    expect(envelopes.length).toBeGreaterThanOrEqual(oscillators.length)
    for (const env of envelopes) {
      const [start, peak, end] = env.gain.events
      expect(start).toMatchObject({ type: 'set', value: 0.0001 })
      expect(peak.type).toBe('linear')
      expect(peak.value).toBeLessThanOrEqual(1)
      expect(end).toMatchObject({ type: 'exponential', value: 0.0001 })
      expect(end.time).toBeGreaterThan(peak.time)
    }
  })

  it('gibt beendete Töne wieder frei', async () => {
    const { engine, context } = setup()
    engine.play('check')
    const ctx = context()!
    const oscillators = ctx.ofKind<FakeOscillator>('oscillator')
    for (const osc of oscillators) osc.onended?.()
    expect(oscillators.every((osc) => osc.disconnected)).toBe(true)
    await vi.advanceTimersByTimeAsync(2_000)
    // Auch der Bus des Klangs ist abgebaut.
    const buses = ctx.ofKind<FakeGain>('gain').filter((gain) => gain.disconnected && gain.gain.events.length === 0)
    expect(buses.length).toBeGreaterThan(0)
  })

  it('weckt einen schlafenden Kontext und spielt dann', async () => {
    const { engine, context } = setup({ state: 'suspended' })
    engine.play('chest')
    const ctx = context()!
    expect(ctx.resumeCalls).toBe(1)
    expect(ctx.ofKind('oscillator')).toHaveLength(0)
    await settled()
    expect(ctx.state).toBe('running')
    expect(ctx.ofKind('oscillator').length).toBeGreaterThan(0)
  })

  it('spielt nach kurzem Wecken – verwirft aber einen Klang, dessen Wecken zu lange dauert', async () => {
    const quick = setup({ state: 'suspended', resume: 'manual' })
    quick.engine.play('check')
    quick.tick(120)
    quick.context()!.finishResume()
    await settled()
    expect(quick.context()!.ofKind('oscillator').length).toBeGreaterThan(0)

    const slow = setup({ state: 'suspended', resume: 'manual' })
    slow.engine.play('check')
    // Ohne Geste hängt das Wecken – und klappt erst viel später: Der alte Klang bleibt dann aus.
    slow.tick(STALE_MS + 1)
    slow.context()!.finishResume()
    await settled()
    expect(slow.context()!.state).toBe('running')
    expect(slow.context()!.ofKind('oscillator')).toHaveLength(0)
  })

  it('bleibt still, wenn das Wecken abgelehnt wird oder wirft', async () => {
    const rejected = setup({ state: 'suspended', resume: 'reject' })
    expect(() => rejected.engine.play('check')).not.toThrow()
    await settled()
    expect(rejected.context()!.ofKind('oscillator')).toHaveLength(0)

    const thrown = setup({ state: 'suspended', resume: 'throw' })
    expect(() => thrown.engine.play('check')).not.toThrow()
    expect(() => thrown.engine.unlock()).not.toThrow()
    await settled()
    expect(thrown.context()!.ofKind('oscillator')).toHaveLength(0)
  })

  it('bleibt in einem unsichtbaren Tab still', () => {
    const { engine } = setup({ hidden: true })
    engine.play('levelUp')
    expect(FakeAudioContext.instances).toHaveLength(0)
  })

  it('ignoriert unbekannte Klangnamen', () => {
    const { engine } = setup()
    expect(() => engine.play('trompete' as SoundName)).not.toThrow()
    expect(FakeAudioContext.instances).toHaveLength(0)
  })

  it('spielt denselben Klang nicht mehrfach im selben Augenblick und begrenzt die Stimmen', () => {
    const { engine, context } = setup()
    engine.play('bossHit')
    const ctx = context()!
    const once = ctx.ofKind('oscillator').length
    engine.play('bossHit')
    engine.play('bossHit')
    expect(ctx.ofKind('oscillator')).toHaveLength(once)
    // Etwas später darf er wieder.
    ctx.currentTime = 0.5
    engine.play('bossHit')
    expect(ctx.ofKind('oscillator')).toHaveLength(once * 2)

  })

  it('spielt höchstens MAX_VOICES Klänge gleichzeitig – danach wieder', async () => {
    const { engine, context } = setup()
    for (const name of SOUND_NAMES) engine.play(name)
    const ctx = context()!
    const [limiter] = ctx.ofKind('compressor')
    // Jeder Klang hat einen eigenen Bus (Verstärkung 1) direkt vor dem Begrenzer.
    const buses = () => ctx.ofKind<FakeGain>('gain').filter((gain) => gain.gain.value === 1 && gain.connections.includes(limiter))
    expect(SOUND_NAMES.length).toBeGreaterThan(MAX_VOICES)
    expect(buses()).toHaveLength(MAX_VOICES)
    // Sind die Klänge verklungen, sind die Stimmen wieder frei.
    await vi.advanceTimersByTimeAsync(3_000)
    ctx.currentTime = 3
    engine.play('check')
    expect(buses()).toHaveLength(MAX_VOICES + 1)
  })

  it('weckt den Ton bei der ersten Geste, solange jemand ihn hält – und schläft beim Loslassen', () => {
    const { engine, target, context } = setup({ state: 'suspended' })
    const release = engine.retain()
    const releaseTwice = engine.retain()
    expect(target.count()).toBeGreaterThan(0)
    expect(FakeAudioContext.instances).toHaveLength(0)

    target.fire('pointerdown')
    const ctx = context()!
    expect(ctx.resumeCalls).toBe(1)
    expect(ctx.state).toBe('running')
    // iOS: ein stiller Puffer wurde „gespielt“.
    expect(ctx.ofKind('bufferSource').some((node) => node.connections.includes(ctx.destination))).toBe(true)

    // Läuft schon: weitere Gesten wecken nichts mehr.
    target.fire('click')
    expect(ctx.resumeCalls).toBe(1)

    release()
    release()
    expect(target.count()).toBeGreaterThan(0)
    releaseTwice()
    expect(target.count()).toBe(0)
    expect(ctx.suspendCalls).toBe(1)
    expect(ctx.state).toBe('suspended')
  })

  it('legt nach dem Schließen einen frischen Kontext an', () => {
    const { engine } = setup()
    engine.play('check')
    engine.close()
    expect(FakeAudioContext.instances[0].state).toBe('closed')
    engine.play('check')
    expect(FakeAudioContext.instances).toHaveLength(2)
  })
})

describe('canPlaySound', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('erkennt Web Audio, ohne einen AudioContext zu erzeugen', () => {
    vi.stubGlobal('AudioContext', undefined)
    vi.stubGlobal('webkitAudioContext', undefined)
    expect(canPlaySound()).toBe(false)
    const created = vi.fn()
    vi.stubGlobal(
      'webkitAudioContext',
      class {
        constructor() {
          created()
        }
      },
    )
    expect(canPlaySound()).toBe(true)
    expect(created).not.toHaveBeenCalled()
  })
})
