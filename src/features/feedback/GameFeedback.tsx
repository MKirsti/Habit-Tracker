import { Star } from 'lucide-react'
import { AnimatePresence } from 'motion/react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useGameContext } from '../../app/gameContext'
import { ATTRIBUTES } from '../../domain/attributes'
import type { CharacterProfile, GameState } from '../../domain/types'
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
import { diffGameStates, feedbackStillHolds, isBulkChange } from './feedbackEvents'
import type { FeedbackEvent, XpGainedEvent } from './feedbackEvents'
import { attributeToastText, chapterToastText, perfectDayToastText, xpToastText } from './feedbackText'
import { nextXpSession } from './xpSession'
import type { XpSession } from './xpSession'

/** Besondere Toasts (Perfekter Tag, Kapitel) bleiben etwas länger stehen. */
const HIGHLIGHT_TOAST_MS = 5000

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
 */
export function GameFeedback() {
  const { data, state } = useGameContext()
  const prefersReducedMotion = useMediaQuery('(prefers-reduced-motion: reduce)')
  const fancy = data.settings.effects && !prefersReducedMotion

  const ownedToasts = useOwnedToasts()
  const { present, revoke, resetXp } = useFeedbackToasts(ownedToasts)
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

  // Vergleichsbasis: der zuletzt gesehene Zustand (beim Mounten der aktuelle – keine Rückmeldung).
  const baseline = useRef({ state, profile: profileKey(data.profile) })
  const memory = useRef(celebrationMemoryOf(state))

  useEffect(() => {
    const previous = baseline.current
    const profile = profileKey(data.profile)
    baseline.current = { state, profile }
    if (previous.state === state) return

    // Rückgängig gemacht: Toasts und Szenen, die nicht mehr stimmen, verschwinden.
    revoke(state)
    setQueue(reconcileCelebrations(queueRef.current, state))

    // Massenänderung (Tageswechsel, Backup, Demo-Daten, anderes Profil): neuer Ausgangspunkt, keine Rückmeldung.
    if (previous.profile !== profile || isBulkChange(previous.state, state)) {
      memory.current = celebrationMemoryOf(state)
      deferred.current = []
      resetXp()
      return
    }

    const events = withoutCelebrated(diffGameStates(previous.state, state), memory.current)
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
    if (confetti && fancy) addBurst({ mode: 'cannon', intensity: confetti, ...toastOrigin() })
  }, [state, data.profile, fancy, present, revoke, resetXp, addBurst, setQueue])

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

/** Konfetti-Ursprung beim Toast-Stapel: Handy unten mittig, Desktop unten rechts. */
function toastOrigin(): { x: number; y: number } {
  const width = Math.max(1, window.innerWidth)
  const height = Math.max(1, window.innerHeight)
  const desktop = typeof window.matchMedia === 'function' && window.matchMedia('(min-width: 768px)').matches
  return desktop
    ? { x: Math.max(0.5, (width - 24 - 192) / width), y: Math.min(0.95, (height - 64) / height) }
    : { x: 0.5, y: Math.min(0.92, (height - 64 - 48) / height) }
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

/**
 * Zeigt die Toasts zu Ereignissen und nimmt sie zurück, sobald sie nicht mehr stimmen.
 * XP-Toasts: Folgt ein Gewinn innerhalb von `XP_MERGE_WINDOW_MS` auf den vorigen, ersetzt ein
 * gemeinsamer Toast („+40 XP · Lesen und Meditieren“) den alten (siehe `xpSession.ts`).
 */
function useFeedbackToasts({ toast, dismiss }: ToastApi) {
  const xp = useRef<{ session: XpSession; toastId: string; events: XpGainedEvent[] } | null>(null)
  const claims = useRef<ToastClaim[]>([])

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
      if (merged && previous) {
        dismiss(previous.toastId)
        claims.current = claims.current.filter((entry) => entry.toastId !== previous.toastId)
      }
      const toastId = toast({
        tone: 'xp',
        icon: session.quests.length === 1 ? session.quests[0].icon : undefined,
        ...xpToastText(session.amount, session.quests, session.bonusXp, session.backfill),
      })
      const events = merged && previous ? [...previous.events, event] : [event]
      xp.current = { session, toastId, events }
      claim(toastId, events)
    },
    [toast, dismiss, claim],
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
            claim(toast({ tone: 'xp', icon: <Star />, duration: HIGHLIGHT_TOAST_MS, ...perfectDayToastText(event) }), [event])
            confetti ??= 'light'
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
    [toast, showXp, claim],
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
      }
      claims.current = kept
    },
    [dismiss],
  )

  const resetXp = useCallback(() => {
    xp.current = null
  }, [])

  return { present, revoke, resetXp }
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
