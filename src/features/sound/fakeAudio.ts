/**
 * Nachgebauter `AudioContext` für Tests (jsdom und Node kennen Web Audio nicht). Hält fest, welche Knoten angelegt,
 * verbunden, gestartet und gestoppt wurden – genug, um die Klang-Maschine ohne Lautsprecher zu prüfen. Nur für Tests.
 */

export interface FakeParam {
  value: number
  events: { type: string; value: number; time: number }[]
  setValueAtTime(value: number, time: number): FakeParam
  linearRampToValueAtTime(value: number, time: number): FakeParam
  exponentialRampToValueAtTime(value: number, time: number): FakeParam
}

function param(value = 0): FakeParam {
  const result: FakeParam = {
    value,
    events: [],
    setValueAtTime(next, time) {
      result.events.push({ type: 'set', value: next, time })
      return result
    },
    linearRampToValueAtTime(next, time) {
      result.events.push({ type: 'linear', value: next, time })
      return result
    },
    exponentialRampToValueAtTime(next, time) {
      if (next <= 0) throw new RangeError('exponentialRamp braucht einen Wert > 0')
      result.events.push({ type: 'exponential', value: next, time })
      return result
    },
  }
  return result
}

export interface FakeNode {
  kind: string
  connections: FakeNode[]
  disconnected: boolean
  connect(target: FakeNode): FakeNode
  disconnect(): void
  [key: string]: unknown
}

export interface FakeSource extends FakeNode {
  started?: number
  stopped?: number
  onended: (() => void) | null
  start(time?: number): void
  stop(time?: number): void
}

export interface FakeOscillator extends FakeSource {
  type: string
  frequency: FakeParam
}

export interface FakeGain extends FakeNode {
  gain: FakeParam
}

function node<T extends object>(ctx: FakeAudioContext, kind: string, extra: T): FakeNode & T {
  const created: FakeNode & T = {
    kind,
    connections: [],
    disconnected: false,
    connect(target: FakeNode) {
      created.connections.push(target)
      return target
    },
    disconnect() {
      created.disconnected = true
    },
    ...extra,
  }
  ctx.nodes.push(created)
  return created
}

function source<T extends object>(ctx: FakeAudioContext, kind: string, extra: T): FakeSource & T {
  const created = node(ctx, kind, {
    onended: null as (() => void) | null,
    start(time = 0) {
      created.started = time
    },
    stop(time = 0) {
      created.stopped = time
    },
    ...extra,
  }) as unknown as FakeSource & T
  return created
}

export interface FakeAudioOptions {
  /** Anfangszustand (Standard 'suspended', wie ohne Geste im Browser). */
  state?: AudioContextState | 'interrupted'
  /**
   * Was `resume()` tut: sofort laufen (Standard), erst auf `finishResume()` hin laufen ('manual'), ablehnen oder
   * synchron werfen.
   */
  resume?: 'run' | 'manual' | 'reject' | 'throw'
  sampleRate?: number
}

export class FakeAudioContext {
  static instances: FakeAudioContext[] = []
  static options: FakeAudioOptions = {}

  state: AudioContextState | 'interrupted'
  currentTime = 0
  sampleRate: number
  destination: FakeNode
  nodes: FakeNode[] = []
  resumeCalls = 0
  suspendCalls = 0
  closeCalls = 0
  /** Bei `resume: 'manual'`: lässt das hängende `resume()` jetzt fertig werden. */
  finishResume: () => void = () => {}
  readonly constructorOptions: unknown

  constructor(options?: unknown) {
    this.constructorOptions = options
    this.state = FakeAudioContext.options.state ?? 'suspended'
    this.sampleRate = FakeAudioContext.options.sampleRate ?? 44_100
    this.destination = node(this, 'destination', {})
    FakeAudioContext.instances.push(this)
  }

  static reset(options: FakeAudioOptions = {}): void {
    FakeAudioContext.instances = []
    FakeAudioContext.options = options
  }

  resume(): Promise<void> {
    this.resumeCalls += 1
    const mode = FakeAudioContext.options.resume ?? 'run'
    if (mode === 'throw') throw new Error('resume geht nicht')
    if (mode === 'reject') return Promise.reject(new Error('Keine Geste'))
    if (mode === 'manual') {
      return new Promise((resolve) => {
        this.finishResume = () => {
          this.state = 'running'
          resolve()
        }
      })
    }
    this.state = 'running'
    return Promise.resolve()
  }

  suspend(): Promise<void> {
    this.suspendCalls += 1
    this.state = 'suspended'
    return Promise.resolve()
  }

  close(): Promise<void> {
    this.closeCalls += 1
    this.state = 'closed'
    return Promise.resolve()
  }

  createGain(): FakeGain {
    return node(this, 'gain', { gain: param(1) })
  }

  createOscillator(): FakeOscillator {
    return source(this, 'oscillator', { type: 'sine', frequency: param(440) })
  }

  createBiquadFilter() {
    return node(this, 'filter', { type: 'lowpass', frequency: param(350), Q: param(1) })
  }

  createDelay() {
    return node(this, 'delay', { delayTime: param(0) })
  }

  createDynamicsCompressor() {
    return node(this, 'compressor', {
      threshold: param(-24),
      knee: param(30),
      ratio: param(12),
      attack: param(0.003),
      release: param(0.25),
    })
  }

  createBuffer(channels: number, length: number, sampleRate: number) {
    const data = Array.from({ length: channels }, () => new Float32Array(length))
    return { numberOfChannels: channels, length, sampleRate, getChannelData: (channel: number) => data[channel] }
  }

  createBufferSource() {
    return source(this, 'bufferSource', { buffer: null as unknown })
  }

  /** Alle angelegten Knoten einer Art. */
  ofKind<T extends FakeNode = FakeNode>(kind: string): T[] {
    return this.nodes.filter((created) => created.kind === kind) as T[]
  }
}

/** Als `AudioContext` ausgeben (für `createSoundEngine({ createContext })`). */
export function asAudioContext(fake: FakeAudioContext): AudioContext {
  return fake as unknown as AudioContext
}
