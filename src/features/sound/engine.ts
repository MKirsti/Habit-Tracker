/**
 * Klang-Maschine (Phase 3b): spielt die Rezepte aus `sounds.ts` über die Web Audio API – alles im Gerät erzeugt, keine
 * Audiodateien. Leise (Gesamtlautstärke `MASTER_VOLUME`), mit weichen Hüllkurven, einem sanften Begrenzer und einem
 * leisen Echo als „Raum“.
 *
 * - **Nie ein Fehler nach außen:** Ohne Web Audio (alte Browser, jsdom, Node) oder wenn der Browser ablehnt, bleibt es
 *   still – jede Methode fängt alles ab.
 * - **Lazy:** Der `AudioContext` entsteht erst beim ersten Bedarf – beim ersten Tippen/Klicken, solange Klänge
 *   eingeschaltet sind (`retain`, siehe `useGameSounds`), oder beim ersten `play`. Browser erlauben Ton erst nach einer
 *   Geste; im Gesten-Handler wird er geweckt (`resume` plus ein stiller Ein-Sample-Puffer für iOS).
 * - **`play` weckt mit:** Ist der Kontext gerade schlafend (z. B. nach der Rückkehr in die App), wird er geweckt und der
 *   Klang danach gespielt – aber nur, wenn das schnell geht (`STALE_MS`); ein verspäteter Klang verwirrt mehr, als er nützt.
 * - Gleichzeitig höchstens `MAX_VOICES` Klänge, derselbe Klang höchstens alle `REPEAT_GAP` s (fünf Treffer auf einmal
 *   klingen wie einer, nicht wie ein Trommelwirbel). In einem unsichtbaren Tab bleibt es still.
 * - Unter iOS (Safari 17+) läuft der Ton als „ambient“: Er mischt sich unter Musik statt sie anzuhalten und folgt dem
 *   Stummschalter.
 * - „Bewegung reduzieren“ betrifft nur das Sichtbare – Klänge folgen allein der Einstellung „Klänge“.
 */
import { DEFAULT_ATTACK, SOUND_RECIPES, isSoundName, recipeDuration } from './sounds'
import type { NoiseBurst, SoundName, SoundRecipe, Tone } from './sounds'

/** Gesamtlautstärke (0–1): bewusst leise. */
export const MASTER_VOLUME = 0.15
/** Vorlauf (s), damit der erste Ton nicht knackt. */
const LOOKAHEAD = 0.012
/** Ein Klang, dessen Wecken länger dauert (ms), wird verworfen. */
export const STALE_MS = 350
/** Derselbe Klang höchstens alle so viele Sekunden. */
export const REPEAT_GAP = 0.07
/** Höchstens so viele Klänge gleichzeitig. */
export const MAX_VOICES = 6
/** „Stille“ für exponentielle Rampen (0 ist dort nicht erlaubt). */
const SILENT = 0.0001
/** Obertöne darüber werden weggelassen (zu spitz, und nahe der Nyquist-Grenze unschön). */
const MAX_PARTIAL_HZ = 12_000
/** Gesten, die den Ton wecken dürfen (`touchend`/`click` für iOS, `pointerdown`/`keydown` für den Rest). */
const UNLOCK_EVENTS = ['pointerdown', 'touchend', 'keydown', 'click'] as const
const LISTENER_OPTIONS: AddEventListenerOptions = { capture: true, passive: true }

export interface SoundEngine {
  /** Spielt einen Klang (still, wenn Web Audio fehlt oder der Browser ablehnt). */
  play(name: SoundName): void
  /** Weckt den Ton (im Gesten-Handler aufrufen) – legt den `AudioContext` bei Bedarf erst an. */
  unlock(): void
  /**
   * Hält die Gesten-Weckung aktiv (solange Klänge eingeschaltet sind). Die zurückgegebene Funktion gibt sie wieder frei;
   * gibt der letzte Halter frei, schläft der Ton (`suspend`).
   */
  retain(): () => void
  /** Lässt den Ton schlafen (spart Akku, wenn Klänge ausgeschaltet werden). */
  suspend(): void
  /** Schließt den Kontext und entfernt alle Gesten-Lauscher (Tests). */
  close(): void
}

type GestureTarget = Pick<EventTarget, 'addEventListener' | 'removeEventListener'>

export interface SoundEngineOptions {
  /** Legt den `AudioContext` an; `undefined` = kein Web Audio. Standard: `AudioContext` bzw. `webkitAudioContext`. */
  createContext?: () => AudioContext | undefined
  /** Uhr in ms (für `STALE_MS`). */
  now?: () => number
  /** Ist die Seite gerade unsichtbar? */
  isHidden?: () => boolean
  /** Wo die Gesten-Lauscher hängen. Standard: `window`. */
  gestureTarget?: () => GestureTarget | undefined
}

type AudioContextConstructor = new (options?: AudioContextOptions) => AudioContext

/** Standard-Fabrik: `AudioContext` (bzw. `webkitAudioContext` in älterem Safari), sonst `undefined`. */
export function defaultCreateContext(): AudioContext | undefined {
  const scope = globalThis as { AudioContext?: AudioContextConstructor; webkitAudioContext?: AudioContextConstructor }
  const Context = scope.AudioContext ?? scope.webkitAudioContext
  if (typeof Context !== 'function') return undefined
  preferAmbientAudioSession()
  return new Context({ latencyHint: 'interactive' })
}

/** Kann dieser Browser überhaupt Klänge erzeugen (Web Audio vorhanden)? Erzeugt dabei nichts und wirft nie. */
export function canPlaySound(): boolean {
  try {
    const scope = globalThis as { AudioContext?: unknown; webkitAudioContext?: unknown }
    return typeof (scope.AudioContext ?? scope.webkitAudioContext) === 'function'
  } catch {
    return false
  }
}

/** Safari 17+: Klänge mischen sich unter laufende Musik und folgen dem Stummschalter. */
function preferAmbientAudioSession(): void {
  try {
    const session = (globalThis.navigator as { audioSession?: { type?: string } } | undefined)?.audioSession
    if (session && session.type !== 'ambient') session.type = 'ambient'
  } catch {
    // Nur eine Feinheit – ohne sie klingt es trotzdem.
  }
}

function defaultIsHidden(): boolean {
  return typeof document !== 'undefined' && document.visibilityState === 'hidden'
}

function defaultNow(): number {
  return typeof performance !== 'undefined' ? performance.now() : Date.now()
}

function defaultGestureTarget(): GestureTarget | undefined {
  return typeof window !== 'undefined' ? window : undefined
}

/** `resume()`/`suspend()` liefern in alten Browsern kein Promise – immer eines daraus machen, nie synchron werfen. */
function settle(action: () => Promise<void> | void): Promise<void> {
  try {
    return Promise.resolve(action())
  } catch (error) {
    return Promise.reject(error)
  }
}

/** Ausgangskette eines Kontexts: Klänge → Begrenzer → Gesamtlautstärke → Lautsprecher, dazu ein Echo-Bus. */
interface Graph {
  ctx: AudioContext
  /** Eingang für die Klänge (der Begrenzer). */
  input: AudioNode
  /** Eingang des Echos. */
  echo: AudioNode
  /** Rauschen (einmal je Kontext erzeugt). */
  noise?: AudioBuffer
}

function buildGraph(ctx: AudioContext): Graph {
  const master = ctx.createGain()
  master.gain.value = MASTER_VOLUME
  master.connect(ctx.destination)

  // Sanfter Begrenzer: Mehrere Klänge übereinander werden nie lauter als einer.
  const limiter = ctx.createDynamicsCompressor()
  limiter.threshold.value = -10
  limiter.knee.value = 8
  limiter.ratio.value = 8
  limiter.attack.value = 0.003
  limiter.release.value = 0.2
  limiter.connect(master)

  // Leises Echo mit gedämpfter Rückkopplung – der „Raum“, in dem Glöckchen schimmern.
  const echo = ctx.createGain()
  echo.gain.value = 1
  const delay = ctx.createDelay(1)
  delay.delayTime.value = 0.17
  const damp = ctx.createBiquadFilter()
  damp.type = 'lowpass'
  damp.frequency.value = 3200
  const feedback = ctx.createGain()
  feedback.gain.value = 0.3
  const wet = ctx.createGain()
  wet.gain.value = 0.42
  echo.connect(delay)
  delay.connect(damp)
  damp.connect(feedback)
  feedback.connect(delay)
  damp.connect(wet)
  wet.connect(limiter)

  return { ctx, input: limiter, echo }
}

/** Ein Ton mit Obertönen: je Teilton ein Oszillator mit eigener Hüllkurve (weich ein, exponentiell aus). */
function scheduleTone(ctx: AudioContext, out: AudioNode, tone: Tone, start: number): void {
  const t0 = start + tone.at
  const attack = Math.max(0.001, tone.attack ?? DEFAULT_ATTACK)
  const limit = Math.min(MAX_PARTIAL_HZ, ctx.sampleRate / 2)
  const partials = [
    { ratio: 1, gain: 1, decay: tone.dur },
    ...(tone.overtones ?? []).map((overtone) => ({ ratio: overtone.ratio, gain: overtone.gain, decay: overtone.decay ?? tone.dur })),
  ].filter((partial) => tone.freq * partial.ratio < limit && partial.gain > 0)
  if (partials.length === 0) return

  let target = out
  let filter: BiquadFilterNode | undefined
  if (tone.cutoff !== undefined) {
    filter = ctx.createBiquadFilter()
    filter.type = 'lowpass'
    filter.frequency.value = Math.min(tone.cutoff, limit)
    filter.Q.value = 0.7
    filter.connect(out)
    target = filter
  }

  let running = partials.length
  for (const partial of partials) {
    const osc = ctx.createOscillator()
    osc.type = partial.ratio === 1 ? (tone.wave ?? 'sine') : 'sine'
    osc.frequency.setValueAtTime(tone.freq * partial.ratio, t0)
    if (tone.glideTo !== undefined) {
      osc.frequency.exponentialRampToValueAtTime(Math.max(1, tone.glideTo * partial.ratio), t0 + attack + tone.dur)
    }
    const env = ctx.createGain()
    const end = t0 + attack + partial.decay
    env.gain.setValueAtTime(SILENT, t0)
    env.gain.linearRampToValueAtTime(Math.max(SILENT, tone.gain * partial.gain), t0 + attack)
    env.gain.exponentialRampToValueAtTime(SILENT, end)
    osc.connect(env)
    env.connect(target)
    osc.onended = () => {
      osc.disconnect()
      env.disconnect()
      running -= 1
      if (running === 0) filter?.disconnect()
    }
    osc.start(t0)
    osc.stop(end + 0.03)
  }
}

/** Weißes Rauschen (deterministisch, ½ s) – einmal je Kontext. */
function noiseBuffer(graph: Graph): AudioBuffer {
  if (graph.noise) return graph.noise
  const { ctx } = graph
  const length = Math.max(1, Math.round(ctx.sampleRate * 0.5))
  const buffer = ctx.createBuffer(1, length, ctx.sampleRate)
  const samples = buffer.getChannelData(0)
  let seed = 0x2f6b_1d3
  for (let index = 0; index < length; index += 1) {
    seed = (Math.imul(seed, 1_664_525) + 1_013_904_223) >>> 0
    samples[index] = (seed / 0xffff_ffff) * 2 - 1
  }
  graph.noise = buffer
  return buffer
}

function scheduleNoise(graph: Graph, out: AudioNode, burst: NoiseBurst, start: number): void {
  const { ctx } = graph
  const t0 = start + burst.at
  const source = ctx.createBufferSource()
  source.buffer = noiseBuffer(graph)
  const filter = ctx.createBiquadFilter()
  filter.type = 'lowpass'
  filter.frequency.value = Math.min(burst.cutoff, ctx.sampleRate / 2)
  const env = ctx.createGain()
  env.gain.setValueAtTime(SILENT, t0)
  env.gain.linearRampToValueAtTime(Math.max(SILENT, burst.gain), t0 + 0.004)
  env.gain.exponentialRampToValueAtTime(SILENT, t0 + burst.dur)
  source.connect(filter)
  filter.connect(env)
  env.connect(out)
  source.onended = () => {
    source.disconnect()
    filter.disconnect()
    env.disconnect()
  }
  source.start(t0)
  source.stop(t0 + burst.dur + 0.03)
}

/** Ein ganzer Klang: eigener Bus (trocken + Anteil ins Echo), nach dem Verklingen wieder abgebaut. */
function scheduleRecipe(graph: Graph, recipe: SoundRecipe, start: number): number {
  const { ctx } = graph
  const bus = ctx.createGain()
  bus.gain.value = 1
  bus.connect(graph.input)
  let send: GainNode | undefined
  if (recipe.echo > 0) {
    send = ctx.createGain()
    send.gain.value = recipe.echo
    bus.connect(send)
    send.connect(graph.echo)
  }
  for (const tone of recipe.tones) scheduleTone(ctx, bus, tone, start)
  for (const burst of recipe.noise ?? []) scheduleNoise(graph, bus, burst, start)
  const seconds = recipeDuration(recipe)
  setTimeout(
    () => {
      try {
        bus.disconnect()
        send?.disconnect()
      } catch {
        // schon abgebaut
      }
    },
    (seconds + 0.4) * 1000,
  )
  return seconds
}

/** Ein stiller Ein-Sample-Puffer – iOS gibt den Ton erst frei, wenn in einer Geste etwas „gespielt“ wurde. */
function primeSilently(ctx: AudioContext): void {
  const source = ctx.createBufferSource()
  source.buffer = ctx.createBuffer(1, 1, ctx.sampleRate)
  source.connect(ctx.destination)
  source.onended = () => source.disconnect()
  source.start(0)
}

export function createSoundEngine(options: SoundEngineOptions = {}): SoundEngine {
  const createContext = options.createContext ?? defaultCreateContext
  const now = options.now ?? defaultNow
  const isHidden = options.isHidden ?? defaultIsHidden
  const gestureTarget = options.gestureTarget ?? defaultGestureTarget

  let graph: Graph | undefined
  let voices = 0
  let holders = 0
  let listeningOn: GestureTarget | undefined
  const lastStart = new Map<SoundName, number>()

  function ensureGraph(): Graph | undefined {
    if (graph && graph.ctx.state !== 'closed') return graph
    graph = undefined
    lastStart.clear()
    const ctx = createContext()
    if (!ctx) return undefined
    try {
      graph = buildGraph(ctx)
    } catch (error) {
      void settle(() => ctx.close()).catch(() => {})
      throw error
    }
    return graph
  }

  function voice(current: Graph, name: SoundName): void {
    const time = current.ctx.currentTime
    const last = lastStart.get(name)
    if (last !== undefined && time - last < REPEAT_GAP) return
    if (voices >= MAX_VOICES) return
    lastStart.set(name, time)
    voices += 1
    let seconds = 0
    try {
      seconds = scheduleRecipe(current, SOUND_RECIPES[name], time + LOOKAHEAD)
    } finally {
      setTimeout(() => {
        voices = Math.max(0, voices - 1)
      }, seconds * 1000)
    }
  }

  function onGesture(): void {
    engine.unlock()
  }

  function listen(): void {
    const target = gestureTarget()
    if (!target || listeningOn) return
    for (const type of UNLOCK_EVENTS) target.addEventListener(type, onGesture, LISTENER_OPTIONS)
    listeningOn = target
  }

  function unlisten(): void {
    const target = listeningOn
    listeningOn = undefined
    if (!target) return
    for (const type of UNLOCK_EVENTS) target.removeEventListener(type, onGesture, LISTENER_OPTIONS)
  }

  const engine: SoundEngine = {
    play(name) {
      try {
        if (!isSoundName(name) || isHidden()) return
        const current = ensureGraph()
        if (!current) return
        if (current.ctx.state === 'running') {
          voice(current, name)
          return
        }
        const asked = now()
        settle(() => current.ctx.resume())
          .then(() => {
            if (graph !== current || current.ctx.state !== 'running' || now() - asked > STALE_MS) return
            voice(current, name)
          })
          .catch(() => {
            // Der Browser will (noch) keinen Ton – dann eben still.
          })
      } catch {
        // Klang ist Zugabe: nie ein Fehler nach außen.
      }
    },

    unlock() {
      try {
        const current = ensureGraph()
        if (!current || current.ctx.state === 'running') return
        void settle(() => current.ctx.resume()).catch(() => {})
        primeSilently(current.ctx)
      } catch {
        // still
      }
    },

    retain() {
      holders += 1
      try {
        listen()
      } catch {
        // Ohne Lauscher weckt eben das erste `play` den Ton.
      }
      let released = false
      return () => {
        if (released) return
        released = true
        holders = Math.max(0, holders - 1)
        if (holders > 0) return
        try {
          unlisten()
        } catch {
          // still
        }
        engine.suspend()
      }
    },

    suspend() {
      try {
        const current = graph
        if (!current || current.ctx.state !== 'running') return
        void settle(() => current.ctx.suspend()).catch(() => {})
      } catch {
        // still
      }
    },

    close() {
      try {
        unlisten()
      } catch {
        // still
      }
      holders = 0
      voices = 0
      lastStart.clear()
      const current = graph
      graph = undefined
      if (current && current.ctx.state !== 'closed') void settle(() => current.ctx.close()).catch(() => {})
    },
  }
  return engine
}

let shared: SoundEngine | undefined

/** Die eine Klang-Maschine der App (ein `AudioContext` für alles – Browser begrenzen ihre Zahl). */
export function soundEngine(): SoundEngine {
  shared ??= createSoundEngine()
  return shared
}

/** Nur für Tests: schließt die gemeinsame Klang-Maschine; die nächste wird frisch angelegt. */
export function resetSoundEngine(): void {
  shared?.close()
  shared = undefined
}
