import { Star } from 'lucide-react'
import { AnimatePresence } from 'motion/react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useGameContext } from '../../app/gameContext'
import { ATTRIBUTES } from '../../domain/attributes'
import type { CharacterProfile, Completion, GameState } from '../../domain/types'
import { useMediaQuery, useToast } from '../../ui'
import type { ToastApi, ToastOptions } from '../../ui'
import { CelebrationOverlay } from './CelebrationOverlay'
import {
  celebrationMemoryOf,
  enqueueCelebrations,
  hasCelebration,
  isCelebrationEvent,
  reconcileCelebrations,
  rememberCelebration,
  withoutCelebrated,
} from './celebrations'
import type { Celebration } from './celebrations'
import { Confetti } from './Confetti'
import type { ConfettiBurstSpec } from './Confetti'
import { creditedCompletions, diffGameStates, feedbackStillHolds, isBulkChange } from './feedbackEvents'
import type { FeedbackEvent, PerfectDayEvent, XpGainedEvent } from './feedbackEvents'
import {
  attributeToastText,
  bonusGrowthToastText,
  chapterToastText,
  perfectDayToastText,
  xpToastText,
} from './feedbackText'
import { nextXpSession } from './xpSession'
import type { XpSession } from './xpSession'

/** Besondere Toasts (Perfekter Tag, Kapitel) bleiben etwas länger stehen. */
const HIGHLIGHT_TOAST_MS = 5000
/** Kurzer Hinweis „Tagesbonus steigt auf …“ (wie ein XP-Toast). */
const BONUS_GROWTH_TOAST_MS = 3500

type ConfettiIntensity = ConfettiBurstSpec['intensity']

/**
 * Zentrale Spiel-Rückmeldung: beobachtet den Spielzustand und zeigt XP-Toasts, Attribut-Aufstiege,
 * Perfekter Tag, Kapitel-Abschlüsse (mit Konfetti) sowie die großen Feier-Szenen für Level-Up und
 * gemeisterte Kampagnen (nacheinander, als Warteschlange).
 *
 * Sitzt außerhalb des Routers (keine Router-Hooks). Beim ersten Rendern gilt der aktuelle Zustand
 * als Ausgangsbasis – es wird nur auf spätere Änderungen reagiert. Massenänderungen (Tageswechsel,
 * Backup, Demo-Daten) bleiben stumm. Ohne „Effekte“ bzw. bei reduzierter Bewegung gibt es kein
 * Konfetti und keine Lichtstrahlen; die Szenen werden dann schlicht eingeblendet.
 *
 * - Toasts, die während einer Szene ankommen, erscheinen erst danach (sonst liefen sie ungesehen ab).
 * - Was nicht mehr stimmt (Haken sofort wieder entfernt), verschwindet wieder – Toast wie Szene.
 * - Eine schon gesehene Szene (gleicher Level, gleiche Kampagne) kommt nicht noch einmal.
 * - Der Bonus des Perfekten Tages erscheint immer als Tagessumme (wie in der Tagesbilanz): Wächst er,
 *   wird der Toast ersetzt statt ein „inkl. … Bonus-XP“ an XP-Toasts zu hängen.
 * - XP werden über die geänderten Erledigungen den Quests zugeordnet – auch nachgetragene.
 */
export function GameFeedback() {
  const { data, state } = useGameContext()
  const prefersReducedMotion = useMediaQuery('(prefers-reduced-motion: reduce)')
  const fancy = data.settings.effects && !prefersReducedMotion

  const ownedToasts = useOwnedToasts()
  const { present, revoke, syncPerfectBonus, resetSessions } = useFeedbackToasts(ownedToasts)
  const { bursts, addBurst, removeBurst } = useConfettiBursts()

  // Die Warteschlange wird synchron über die Ref geführt (für die Logik im Effekt) und als State
  // gespiegelt (fürs Rendern). Kein Rechnen in State-Updatern – StrictMode ruft sie doppelt auf.
  const [queue, setQueueState] = useState<readonly Celebration[]>([])
  const queueRef = useRef<readonly Celebration[]>(queue)
  const setQueue = useCallback((next: readonly Celebration[]) => {
    if (next === queueRef.current) return
    queueRef.current = next
    setQueueState(next)
  }, [])
  const nextCelebrationId = useRef(0)
  /** Toast-Ereignisse, die während einer Szene ankamen – sie folgen nach der letzten Szene. */
  const deferred = useRef<FeedbackEvent[]>([])

  // Vergleichsbasis: der zuletzt gesehene Zustand (beim Mounten der aktuelle – keine Rückmeldung) samt
  // Erledigungen, damit sich XP-Gewinne den Quests zuordnen lassen.
  const baseline = useRef<{ state: GameState; profile: string; completions: readonly Completion[] }>({
    state,
    profile: profileKey(data.profile),
    completions: data.completions,
  })
  const memory = useRef(celebrationMemoryOf(state))

  useEffect(() => {
    const previous = baseline.current
    const profile = profileKey(data.profile)
    baseline.current = { state, profile, completions: data.completions }
    if (previous.state === state) return

    // Rückgängig gemacht: Toasts und Szenen, die nicht mehr stimmen, verschwinden.
    revoke(state)
    setQueue(reconcileCelebrations(queueRef.current, state))

    // Massenänderung (Tageswechsel, Backup, Demo-Daten, anderes Profil): neuer Ausgangspunkt, keine Rückmeldung.
    if (previous.profile !== profile || isBulkChange(previous.state, state)) {
      memory.current = celebrationMemoryOf(state)
      deferred.current = []
      resetSessions()
      return
    }

    // Gesunkener Tagesbonus (z. B. Wochenquest wieder offen): Der sichtbare Toast zeigt die neue Summe.
    syncPerfectBonus(state)

    const credits = creditedCompletions(previous.completions, data.completions, data.habits, state.today)
    const events = withoutCelebrated(diffGameStates(previous.state, state, credits), memory.current)
    if (events.length === 0) return

    const celebrate = hasCelebration(events)
    if (celebrate) {
      setQueue(enqueueCelebrations(queueRef.current, events, () => ++nextCelebrationId.current))
    }
    const toastEvents = events.filter((event) => !isCelebrationEvent(event))
    if (queueRef.current.length > 0) {
      deferred.current.push(...toastEvents)
      return
    }
    // Höchstens ein Konfetti pro Änderung.
    const confetti = present(toastEvents, state)
    if (confetti && fancy) addBurst({ intensity: confetti, ...toastOrigin() })
  }, [
    state,
    data.profile,
    data.completions,
    data.habits,
    fancy,
    present,
    revoke,
    syncPerfectBonus,
    resetSessions,
    addBurst,
    setQueue,
  ])

  // Nach der letzten Szene: die zurückgehaltenen Toasts zeigen (soweit sie noch stimmen).
  useEffect(() => {
    if (queue.length > 0 || deferred.current.length === 0) return
    const events = deferred.current
    deferred.current = []
    present(events, baseline.current.state)
  }, [queue, present])

  const close = useCallback(
    (id: number) => {
      const closing = queueRef.current.find((celebration) => celebration.id === id)
      if (!closing) return
      memory.current = rememberCelebration(memory.current, closing)
      setQueue(queueRef.current.filter((celebration) => celebration.id !== id))
    },
    [setQueue],
  )

  // Pro Szene genau ein Konfetti-Burst (auch wenn Effekte im StrictMode doppelt laufen).
  const burstFor = useRef<number | undefined>(undefined)
  const reveal = useCallback(
    (id: number, origin: { x: number; y: number }) => {
      if (!fancy || burstFor.current === id) return
      burstFor.current = id
      addBurst({ mode: 'burst', intensity: 'full', ...origin })
    },
    [fancy, addBurst],
  )

  const current = queue[0]
  return (
    <>
      {typeof document !== 'undefined' &&
        createPortal(
          <AnimatePresence mode="wait">
            {current && (
              <CelebrationOverlay
                key={current.id}
                celebration={current}
                fancy={fancy}
                onClose={() => close(current.id)}
                onReveal={(origin) => reveal(current.id, origin)}
              />
            )}
          </AnimatePresence>,
          document.body,
        )}
      <Confetti bursts={bursts} onBurstEnd={removeBurst} />
    </>
  )
}

function profileKey(profile: CharacterProfile | undefined): string {
  return profile ? `${profile.createdDay}|${profile.name}|${profile.avatar}` : ''
}

/**
 * Konfetti am Toast-Stapel: Desktop unten rechts als Fontäne nach oben; Handy oben mittig (der Stapel
 * sitzt dort unter dem Sicherheitsabstand) als Fächer nach unten – nach oben flöge es aus dem Bild.
 */
function toastOrigin(): Pick<ConfettiBurstSpec, 'mode' | 'x' | 'y'> {
  const width = Math.max(1, window.innerWidth)
  const height = Math.max(1, window.innerHeight)
  const desktop = typeof window.matchMedia === 'function' && window.matchMedia('(min-width: 768px)').matches
  return desktop
    ? { mode: 'cannon', x: Math.max(0.5, (width - 24 - 192) / width), y: Math.min(0.95, (height - 64) / height) }
    : { mode: 'spray', x: 0.5, y: Math.min(0.5, Math.max(0.06, (safeAreaTop() + 48) / height)) }
}

/** `env(safe-area-inset-top)` in px (Notch/Statusleiste), 0 ohne Unterstützung. */
function safeAreaTop(): number {
  if (typeof document === 'undefined' || !document.body) return 0
  const probe = document.createElement('div')
  probe.style.cssText = 'position:fixed;top:0;left:0;visibility:hidden;pointer-events:none;height:env(safe-area-inset-top, 0px)'
  document.body.appendChild(probe)
  const inset = probe.getBoundingClientRect().height
  probe.remove()
  return Number.isFinite(inset) ? inset : 0
}

// ---------------------------------------------------------------------------
// Toasts
// ---------------------------------------------------------------------------

/**
 * Wie viele eigene Toast-IDs höchstens gemerkt werden. Sichtbar sind ohnehin nur vier; selbst
 * geschlossene IDs werden sofort vergessen, abgelaufene fallen irgendwann hinten heraus.
 */
const OWNED_TOAST_MEMORY = 16

/**
 * `useToast()`, das sich die eigenen Toasts merkt und sie beim Unmounten schließt – z. B. wenn nach
 * „Alles löschen“ das Onboarding erscheint, sollen keine alten XP-Toasts darüber stehen bleiben.
 */
function useOwnedToasts(): ToastApi {
  const { toast, dismiss } = useToast()
  const owned = useRef<string[]>([])

  const ownedToast = useCallback(
    (options: ToastOptions) => {
      const id = toast(options)
      owned.current = [...owned.current, id].slice(-OWNED_TOAST_MEMORY)
      return id
    },
    [toast],
  )

  const ownedDismiss = useCallback(
    (id: string) => {
      owned.current = owned.current.filter((ownedId) => ownedId !== id)
      dismiss(id)
    },
    [dismiss],
  )

  useEffect(() => {
    const ids = owned
    return () => {
      for (const id of ids.current) dismiss(id)
      ids.current = []
    }
  }, [dismiss])

  return useMemo(() => ({ toast: ownedToast, dismiss: ownedDismiss }), [ownedToast, ownedDismiss])
}

/** So lange (ms) wird geprüft, ob ein gezeigter Toast noch stimmt – länger steht keiner. */
const CLAIM_MS = 15_000

/** Ein gezeigter Toast und die Ereignisse, die er meldet (alle müssen weiter stimmen). */
interface ToastClaim {
  toastId: string
  events: readonly FeedbackEvent[]
  at: number
}

/** Der Toast zum heutigen Perfekten Tag – wird ersetzt, wenn der Bonus wächst. */
interface PerfectToast {
  toastId: string
  /** „Perfekter Tag! …“ oder der kurze Hinweis „Tagesbonus steigt auf …“. */
  kind: 'perfect' | 'growth'
  /** Gezeigte Tagessumme. */
  bonusXp: number
  shownAt: number
  duration: number
}

/**
 * Steht der Toast noch? Gemessen an seiner Anzeigedauer (Hover verlängert sie; dann wird er eben
 * durch den kurzen Hinweis ersetzt – die Zahl stimmt in jedem Fall).
 */
function isShown(record: PerfectToast): boolean {
  return performance.now() - record.shownAt < record.duration
}

/**
 * Zeigt die Toasts zu Ereignissen und nimmt sie zurück, sobald sie nicht mehr stimmen.
 * XP-Toasts: Folgt ein Gewinn innerhalb von `XP_MERGE_WINDOW_MS` auf den vorigen, ersetzt ein
 * gemeinsamer Toast („+40 XP · Lesen und Meditieren“) den alten (siehe `xpSession.ts`).
 * Perfekter Tag (heute): ein einziger Toast mit der Tagessumme. Wächst der Bonus, ersetzt ihn
 * „Perfekter Tag! +28 Bonus-XP“ – oder, wenn er schon abgelaufen ist, ein kurzer Hinweis
 * „Tagesbonus steigt auf +28 Bonus-XP“.
 */
function useFeedbackToasts({ toast, dismiss }: ToastApi) {
  const xp = useRef<{ session: XpSession; toastId: string; events: XpGainedEvent[] } | null>(null)
  const perfect = useRef<PerfectToast | null>(null)
  const claims = useRef<ToastClaim[]>([])

  /** Schließt einen eigenen Toast und vergisst seine Meldung. */
  const withdraw = useCallback(
    (toastId: string) => {
      dismiss(toastId)
      claims.current = claims.current.filter((entry) => entry.toastId !== toastId)
    },
    [dismiss],
  )

  const claim = useCallback((toastId: string, events: readonly FeedbackEvent[]) => {
    const now = performance.now()
    claims.current = [
      ...claims.current.filter((entry) => entry.toastId !== toastId && now - entry.at < CLAIM_MS),
      { toastId, events, at: now },
    ]
  }, [])

  const showXp = useCallback(
    (event: XpGainedEvent) => {
      const previous = xp.current
      const { session, merged } = nextXpSession(previous?.session ?? null, event, performance.now())
      if (merged && previous) withdraw(previous.toastId)
      const toastId = toast({
        tone: 'xp',
        icon: session.quests.length === 1 ? session.quests[0].icon : undefined,
        ...xpToastText(session.amount, session.quests, session.bonusXp, session.backfill),
      })
      const events = merged && previous ? [...previous.events, event] : [event]
      xp.current = { session, toastId, events }
      claim(toastId, events)
    },
    [toast, withdraw, claim],
  )

  /** Zeigt den Toast zum heutigen Perfekten Tag mit der Tagessumme `bonusXp` – anstelle des bisherigen. */
  const replacePerfectToast = useCallback(
    (kind: PerfectToast['kind'], bonusXp: number, event: PerfectDayEvent) => {
      if (perfect.current) withdraw(perfect.current.toastId)
      const duration = kind === 'perfect' ? HIGHLIGHT_TOAST_MS : BONUS_GROWTH_TOAST_MS
      const text = kind === 'perfect' ? perfectDayToastText({ bonusXp, today: true }) : bonusGrowthToastText(bonusXp)
      const toastId = toast({ tone: 'xp', icon: <Star />, duration, ...text })
      perfect.current = { toastId, kind, bonusXp, shownAt: performance.now(), duration }
      claim(toastId, [{ ...event, bonusXp }])
    },
    [toast, withdraw, claim],
  )

  /**
   * Heutiger Perfekter Tag mit der Tagessumme `bonusXp`. Neu perfekt oder der Toast steht noch:
   * „Perfekter Tag! …“ (bzw. derselbe Hinweis). Ist er abgelaufen, meldet ein kurzer Hinweis die neue Summe.
   */
  const showPerfectToday = useCallback(
    (event: PerfectDayEvent, bonusXp: number) => {
      const previous = perfect.current
      const stillShown = previous !== null && isShown(previous) ? previous.kind : undefined
      replacePerfectToast(event.update ? (stillShown ?? 'growth') : 'perfect', bonusXp, event)
    },
    [replacePerfectToast],
  )

  /**
   * Zeigt die Toasts zu `events`, soweit sie in `state` noch stimmen, und meldet, ob dazu Konfetti
   * passt (Perfekter Tag: dezent, Kapitel: voll).
   */
  const present = useCallback(
    (events: readonly FeedbackEvent[], state: GameState): ConfettiIntensity | undefined => {
      let confetti: ConfettiIntensity | undefined
      for (const event of events) {
        if (!feedbackStillHolds(event, state)) continue
        switch (event.type) {
          case 'xp-gained':
            showXp(event)
            break
          case 'perfect-day':
            if (!event.today) {
              claim(toast({ tone: 'xp', icon: <Star />, duration: HIGHLIGHT_TOAST_MS, ...perfectDayToastText(event) }), [event])
              confetti ??= 'light'
              break
            }
            // Immer die aktuelle Tagessumme – auch für Toasts, die nach einer Szene nachgeholt werden.
            showPerfectToday(event, state.todayState.perfectBonusXp)
            if (!event.update) {
              confetti ??= 'light'
              // Neue XP-Sitzung: Quests von vor dem Perfekten Tag landen nicht in einem Toast danach.
              xp.current = null
            }
            break
          case 'chapter-completed':
            claim(
              toast({ tone: 'xp', icon: event.campaignIcon, duration: HIGHLIGHT_TOAST_MS, ...chapterToastText(event) }),
              [event],
            )
            confetti = 'full'
            break
          case 'attribute-level-up':
            claim(toast({ tone: 'success', icon: ATTRIBUTES[event.attribute].icon, ...attributeToastText(event) }), [event])
            break
          case 'level-up':
          case 'campaign-completed':
            break
        }
      }
      return confetti
    },
    [toast, showXp, showPerfectToday, claim],
  )

  /** Schließt Toasts, deren Meldung im neuen Zustand nicht mehr stimmt (z. B. Haken entfernt). */
  const revoke = useCallback(
    (state: GameState) => {
      const now = performance.now()
      const kept: ToastClaim[] = []
      for (const entry of claims.current) {
        if (now - entry.at >= CLAIM_MS) continue
        if (entry.events.every((event) => feedbackStillHolds(event, state))) {
          kept.push(entry)
          continue
        }
        dismiss(entry.toastId)
        // Ein zurückgenommener XP-Toast wird nicht mehr fortgeschrieben (sonst stünde gleich „+40 XP“ da).
        if (xp.current?.toastId === entry.toastId) xp.current = null
        if (perfect.current?.toastId === entry.toastId) perfect.current = null
      }
      claims.current = kept
    },
    [dismiss],
  )

  /**
   * Ist der heutige Bonus gesunken (Wochenquest wieder offen, Quest leichter), während der Tag perfekt
   * bleibt, zeigt ein noch sichtbarer Perfekter-Tag-Toast die neue Summe. Rückgänge melden sonst nichts.
   */
  const syncPerfectBonus = useCallback(
    (state: GameState) => {
      const current = perfect.current
      const bonusXp = state.todayState.perfectBonusXp
      if (!current || !isShown(current) || !state.todayState.perfect || bonusXp >= current.bonusXp) return
      replacePerfectToast(current.kind, bonusXp, { type: 'perfect-day', bonusXp, addedXp: 0, today: true, update: true })
    },
    [replacePerfectToast],
  )

  /** Neuer Ausgangspunkt (Massenänderung): nichts wird mehr fortgeschrieben oder ersetzt. */
  const resetSessions = useCallback(() => {
    xp.current = null
    perfect.current = null
  }, [])

  return { present, revoke, syncPerfectBonus, resetSessions }
}

// ---------------------------------------------------------------------------
// Konfetti
// ---------------------------------------------------------------------------

function useConfettiBursts() {
  const [bursts, setBursts] = useState<ConfettiBurstSpec[]>([])
  const nextId = useRef(0)

  const addBurst = useCallback((spec: Omit<ConfettiBurstSpec, 'id'>) => {
    nextId.current += 1
    const id = nextId.current
    // Nie mehr als drei gleichzeitig – sonst wird es unruhig (und teuer).
    setBursts((current) => [...current, { ...spec, id }].slice(-3))
  }, [])

  const removeBurst = useCallback((id: number) => {
    setBursts((current) => current.filter((burst) => burst.id !== id))
  }, [])

  return { bursts, addBurst, removeBurst }
}
