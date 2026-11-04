import { Star } from 'lucide-react'
import { AnimatePresence } from 'motion/react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useGameContext } from '../../app/gameContext'
import { ATTRIBUTES } from '../../domain/attributes'
import { heroSeedOf } from '../../domain/combat/boss'
import type {
  CharacterProfile,
  ChestRarity,
  Completion,
  GameData,
  GameState,
  HpLedgerEntry,
  Purchase,
  SideQuest,
} from '../../domain/types'
import { useMediaQuery, useToast } from '../../ui'
import type { ToastApi, ToastOptions } from '../../ui'
import { accentVars, attributeColor } from '../campaignTheme'
import { ChestGraphic } from '../combat/ChestGraphic'
import { ChestOpenDialog } from '../combat/ChestOpenDialog'
import { chestSourceLine } from '../combat/chestText'
import { chestTheme } from '../combat/chestTheme'
import { achievementConfetti, ACHIEVEMENT_TIER_COLORS } from './achievementTier'
import { campaignAccentById } from './campaignAccent'
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
import { browserClassSceneStore, classChangeOf, classSceneSeen, combatFeedbackEvents } from './combatFeedback'
import type { ChestFoundEvent, ClassSceneStore } from './combatFeedback'
import { chestFoundToastText } from './combatSceneText'
import { Confetti } from './Confetti'
import type { ConfettiBurstSpec } from './Confetti'
import {
  BULK_CHANGE_LIMIT,
  creditedCompletions,
  creditedSideQuests,
  diffGameStates,
  feedbackStillHolds,
  isBulkChange,
} from './feedbackEvents'
import type {
  AchievementUnlockedEvent,
  ChapterCompletedEvent,
  FeedbackEvent,
  PerfectDayEvent,
  XpGainedEvent,
} from './feedbackEvents'
import {
  achievementToastText,
  attributeToastText,
  bonusGrowthToastText,
  chapterToastText,
  freezeToastText,
  perfectDayToastText,
  potionToastText,
  xpToastText,
} from './feedbackText'
import { hpFeedbackEvents } from './hpFeedback'
import { nextXpSession } from './xpSession'
import type { XpSession } from './xpSession'

/** Besondere Toasts (Perfekter Tag, Kapitel) bleiben etwas länger stehen. */
const HIGHLIGHT_TOAST_MS = 5000
/** Kurzer Hinweis „Tagesbonus steigt auf …“ (wie ein XP-Toast). */
const BONUS_GROWTH_TOAST_MS = 3500
/** Hinweise zu den Lebenspunkten (Streak-Schutz eingesetzt, Heiltrank) – ruhig, aber lange genug zum Lesen. */
const HP_TOAST_MS = 5000

/** Konfetti, das zu einer Änderung passt: Stärke und ggf. die Kampagnenfarbe (Kapitel). */
type ConfettiChoice = Pick<ConfettiBurstSpec, 'intensity' | 'accent'>

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
 * - XP werden über die geänderten Erledigungen den Quests zugeordnet – auch nachgetragene – und erledigte
 *   Nebenquests zählen mit ihrem Titel. Der XP-Toast nennt auch das Gold dieser XP („+24 XP · +12 Gold“).
 * - Neue Erfolge: eigener Toast mit Medaillon in der Farbe der Stufe (Bronze/Silber/Gold) und Gold-Belohnung.
 *   Was schon beim ersten Laden freigeschaltet ist, bleibt still (Ausgangsbasis) – ebenso Massenänderungen.
 * - Kampagnenfarbe: Kapitel-Toast (Icon-Rahmen), Kapitel-Konfetti und die Szene „Kampagne gemeistert“ tragen die
 *   Hauptfarbe der Kampagne (`campaignAccentById`); XP, Belohnung und Pokal bleiben golden. Ohne Attribut bleibt
 *   alles golden.
 * - Lebenspunkte (`hpFeedback.ts`): Eine neu abgerechnete Niederlage zeigt eine ruhige, würdevolle Szene (ohne
 *   Konfetti) mit verlorenem Gold und vollen HP; ein eingesetzter Streak-Schutz und ein getrunkener Heiltrank je
 *   eine kleine Meldung. Der übliche Tagesschaden der Abrechnung bleibt still (er steht im Helden-Kopf).
 * - Kampf & Beute (`combatFeedback.ts`, Phase 3a): Ein besiegter Wochen-Boss zeigt die Siegesszene mit seiner Truhe
 *   („Öffnen“ öffnet den Truhen-Dialog über der Szene), neue Quest- und Kapitel-Truhen die Meldung „Truhe gefunden“.
 *   Der Klassenwechsel zu Wochenbeginn erscheint als Szene, sobald die App in der neuen Woche läuft – einmal je Held
 *   und Woche (gemerkt auf diesem Gerät, `ClassSceneStore`), erst nach der Einführung „Neu: Klassen, Bosse & Beute“
 *   (vorher gilt die Woche still als gesehen: Die Einführung stellt die Klasse ja gerade vor).
 */
export function GameFeedback({ classScenes = browserClassSceneStore }: { classScenes?: ClassSceneStore } = {}) {
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
  // Erledigungen und Nebenquests, damit sich XP-Gewinne den Quests zuordnen lassen.
  const baseline = useRef<{
    state: GameState
    profile: string
    completions: readonly Completion[]
    sideQuests: readonly SideQuest[] | undefined
    hpLedger: readonly HpLedgerEntry[] | undefined
    purchases: readonly Purchase[] | undefined
  }>({
    state,
    profile: profileKey(data.profile),
    completions: data.completions,
    sideQuests: data.sideQuests,
    hpLedger: data.hpLedger,
    purchases: data.purchases,
  })
  const memory = useRef(celebrationMemoryOf(state))

  useEffect(() => {
    const previous = baseline.current
    const profile = profileKey(data.profile)
    baseline.current = {
      state,
      profile,
      completions: data.completions,
      sideQuests: data.sideQuests,
      hpLedger: data.hpLedger,
      purchases: data.purchases,
    }
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

    const credits = [
      ...creditedCompletions(previous.completions, data.completions, data.habits, state.today),
      ...creditedSideQuests(previous.sideQuests, data.sideQuests, state.today),
    ]
    const hpEvents = hpFeedbackEvents(
      { ledger: previous.hpLedger, purchases: previous.purchases, state: previous.state },
      { ledger: data.hpLedger, purchases: data.purchases, state },
    )
    const combatEvents = combatFeedbackEvents(previous.state, state, BULK_CHANGE_LIMIT).map((event) =>
      event.type === 'chest-found' ? withChestSources(event, data, state) : event,
    )
    const events = withoutCelebrated(
      [...diffGameStates(previous.state, state, credits), ...hpEvents, ...combatEvents],
      memory.current,
    )
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
    if (confetti && fancy) addBurst({ ...confetti, ...toastOrigin() })
  }, [
    state,
    data,
    data.profile,
    data.completions,
    data.habits,
    data.sideQuests,
    data.hpLedger,
    data.purchases,
    fancy,
    present,
    revoke,
    syncPerfectBonus,
    resetSessions,
    addBurst,
    setQueue,
  ])

  // Klassenwechsel zu Wochenbeginn: einmal je Held und Woche – auch beim Öffnen der App (dann beginnt die Woche ja).
  const introSeen = data.settings.combatIntroSeen === true
  useEffect(() => {
    const profile = data.profile
    if (profile === undefined) return
    const change = classChangeOf(state)
    if (change === undefined) return
    const hero = heroSeedOf(profile)
    if (classSceneSeen(classScenes, hero, change.weekStart)) return
    classScenes.set(hero, change.weekStart)
    // Vor der Einführung still: Sie stellt die Klasse gerade vor.
    if (!introSeen) return
    setQueue(enqueueCelebrations(queueRef.current, [change], () => ++nextCelebrationId.current))
  }, [state, data.profile, introSeen, classScenes, setQueue])

  // Truhen-Dialog über der Siegesszene.
  const [chestDialog, setChestDialog] = useState<{ chestId: string; open: boolean } | undefined>(undefined)
  const openChestDialog = useCallback((chestId: string) => setChestDialog({ chestId, open: true }), [])
  const closeChestDialog = useCallback(
    () => setChestDialog((current) => (current ? { ...current, open: false } : current)),
    [],
  )

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
    (id: number, origin: { x: number; y: number }, accent: string | undefined) => {
      // Die Niederlage-Szene bleibt ruhig – kein Konfetti.
      if (!fancy || burstFor.current === id || queueRef.current.find((item) => item.id === id)?.kind === 'defeat') return
      burstFor.current = id
      addBurst({ mode: 'burst', intensity: 'full', accent, ...origin })
    },
    [fancy, addBurst],
  )

  const current = queue[0]
  // Kampagne gemeistert: in der Hauptfarbe der Kampagne, Klassenwechsel: in der Farbe des (ersten) Klassen-Attributs.
  // Level-Up, Boss-Sieg und Kampagnen ohne Attribut bleiben golden.
  const accent =
    current?.kind === 'campaign'
      ? campaignAccentById(state, current.event.campaignId)
      : current?.kind === 'class' && current.event.to.attributes.length > 0
        ? attributeColor(current.event.to.attributes[0])
        : undefined
  const bossChestId = current?.kind === 'boss' ? (current.event.chestId ?? `boss:${current.event.weekStart}`) : undefined
  const bossChest = bossChestId !== undefined ? state.chests.find((chest) => chest.id === bossChestId) : undefined
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
                onReveal={(origin) => reveal(current.id, origin, accent)}
                accent={accent}
                today={state.today}
                form={data.profile?.form}
                bossChest={bossChest}
                onOpenChest={openChestDialog}
              />
            )}
          </AnimatePresence>,
          document.body,
        )}
      {chestDialog !== undefined && (
        <ChestOpenDialog
          chestId={chestDialog.chestId}
          open={chestDialog.open}
          onClose={closeChestDialog}
          returnFocus={sceneContinueButton}
        />
      )}
      <Confetti bursts={bursts} onBurstEnd={removeBurst} />
    </>
  )
}

/** „Weiter“ der sichtbaren Szene – Fokusziel, wenn „Öffnen“ nach dem Öffnen der Truhe verschwunden ist. */
function sceneContinueButton(): HTMLElement | null {
  return document.querySelector<HTMLElement>('[data-scene-continue]')
}

/** Ergänzt die gefundenen Truhen um ihren Fundort in Worten („📖 Lesen“). */
function withChestSources(event: ChestFoundEvent, data: GameData, state: GameState): ChestFoundEvent {
  const context = {
    habits: data.habits,
    mainQuests: data.mainQuests,
    victories: data.bossVictories,
    bosses: [state.bosses.current, state.bosses.previous],
  }
  return { ...event, chests: event.chests.map((chest) => ({ ...chest, sourceLine: chestSourceLine(chest, context) })) }
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
        ...xpToastText(session.amount, session.quests, session.bonusXp, session.backfill, session.gold),
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
   * passt (Perfekter Tag: dezent, Kapitel: voll – in der Farbe der Kampagne, Erfolg: in der Farbe der Stufe,
   * Gold-Erfolge voll).
   */
  const present = useCallback(
    (events: readonly FeedbackEvent[], state: GameState): ConfettiChoice | undefined => {
      let confetti: ConfettiChoice | undefined
      for (const event of events) {
        if (!feedbackStillHolds(event, state)) continue
        switch (event.type) {
          case 'xp-gained':
            showXp(event)
            break
          case 'perfect-day':
            if (!event.today) {
              claim(toast({ tone: 'xp', icon: <Star />, duration: HIGHLIGHT_TOAST_MS, ...perfectDayToastText(event) }), [event])
              confetti ??= { intensity: 'light' }
              break
            }
            // Immer die aktuelle Tagessumme – auch für Toasts, die nach einer Szene nachgeholt werden.
            showPerfectToday(event, state.todayState.perfectBonusXp)
            if (!event.update) {
              confetti ??= { intensity: 'light' }
              // Neue XP-Sitzung: Quests von vor dem Perfekten Tag landen nicht in einem Toast danach.
              xp.current = null
            }
            break
          case 'chapter-completed': {
            const accent = campaignAccentById(state, event.campaignId)
            claim(
              toast({
                tone: 'xp',
                icon: accent === undefined ? event.campaignIcon : <ChapterToastIcon event={event} accent={accent} />,
                duration: HIGHLIGHT_TOAST_MS,
                ...chapterToastText(event),
              }),
              [event],
            )
            confetti = { intensity: 'full', accent }
            break
          }
          case 'attribute-level-up':
            claim(toast({ tone: 'success', icon: ATTRIBUTES[event.attribute].icon, ...attributeToastText(event) }), [event])
            break
          case 'achievement-unlocked': {
            claim(
              toast({
                tone: 'xp',
                icon: <AchievementToastIcon event={event} />,
                duration: HIGHLIGHT_TOAST_MS,
                ...achievementToastText(event),
              }),
              [event],
            )
            // Ein Kapitel-Feuerwerk bleibt; ein Gold-Erfolg ersetzt dezentes Konfetti.
            const choice = achievementConfetti(event.tier)
            if (confetti === undefined || (confetti.intensity === 'light' && choice.intensity === 'full')) {
              confetti = choice
            }
            break
          }
          case 'freeze-used':
            claim(
              toast({ tone: 'info', icon: '❄️', duration: HP_TOAST_MS, ...freezeToastText(event, state.today) }),
              [event],
            )
            break
          case 'potion-healed':
            claim(toast({ tone: 'success', icon: '🧪', duration: HP_TOAST_MS, ...potionToastText(event) }), [event])
            break
          case 'chest-found': {
            const text = chestFoundToastText(
              event.chests.map((chest) => ({ rarity: chest.rarity, sourceLine: chest.sourceLine ?? 'Ein Glücksfund' })),
            )
            const best = bestRarity(event.chests.map((chest) => chest.rarity))
            claim(toast({ tone: 'xp', icon: <ChestToastIcon rarity={best} />, duration: HIGHLIGHT_TOAST_MS, ...text }), [event])
            break
          }
          case 'level-up':
          case 'campaign-completed':
          case 'defeat':
          case 'boss-defeated':
          case 'class-changed':
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

/**
 * Icon des Kapitel-Toasts: das Emoji der Kampagne in einem Ring in ihrer Farbe. Deckt den goldenen Icon-Kreis
 * des XP-Toasts ab (gleiche Größe, deckende Fläche); der Toast selbst bleibt golden – er meldet XP.
 */
function ChapterToastIcon({ event, accent }: { event: ChapterCompletedEvent; accent: string }) {
  return (
    <span
      data-chapter-accent={accent}
      style={accentVars(accent)}
      className="grid size-9 place-items-center rounded-full bg-[color-mix(in_srgb,var(--accent)_16%,var(--color-surface-raised))] shadow-[0_0_14px_-3px_var(--accent-60)] ring-1 ring-(--accent-60) ring-inset"
    >
      {event.campaignIcon}
    </span>
  )
}

/**
 * Icon des Erfolgs-Toasts: das Emoji des Erfolgs als Medaillon in der Farbe seiner Stufe (Bronze, Silber, Gold).
 * Deckt wie beim Kapitel-Toast den goldenen Icon-Kreis ab; der Toast selbst bleibt golden – er meldet Gold.
 */
function AchievementToastIcon({ event }: { event: AchievementUnlockedEvent }) {
  return (
    <span
      data-achievement-tier={event.tier}
      style={accentVars(ACHIEVEMENT_TIER_COLORS[event.tier])}
      className="grid size-9 place-items-center rounded-full bg-[radial-gradient(circle_at_50%_30%,var(--accent-35),color-mix(in_srgb,var(--accent)_12%,var(--color-surface-raised))_72%)] shadow-[0_0_16px_-3px_var(--accent-60)] ring-2 ring-(--accent-60) ring-inset"
    >
      {event.icon}
    </span>
  )
}

/** Die wertvollste Seltenheit unter mehreren gefundenen Truhen (für das Toast-Symbol). */
function bestRarity(rarities: readonly ChestRarity[]): ChestRarity {
  const order: ChestRarity[] = ['common', 'uncommon', 'rare', 'legendary']
  return rarities.reduce<ChestRarity>((best, rarity) => (order.indexOf(rarity) > order.indexOf(best) ? rarity : best), 'common')
}

/**
 * Icon der Meldung „Truhe gefunden“: eine kleine Truhe in einem Ring in der Farbe ihrer Seltenheit (Bronze, Silber,
 * Blau-Violett, Gold). Deckt wie beim Kapitel-Toast den goldenen Icon-Kreis ab.
 */
function ChestToastIcon({ rarity }: { rarity: ChestRarity }) {
  return (
    <span
      data-chest-toast={rarity}
      style={accentVars(chestTheme(rarity).color)}
      className="grid size-9 place-items-center rounded-full bg-[radial-gradient(circle_at_50%_35%,var(--accent-20),color-mix(in_srgb,var(--accent)_10%,var(--color-surface-raised))_72%)] shadow-[0_0_14px_-3px_var(--accent-60)] ring-2 ring-(--accent-60) ring-inset"
    >
      <ChestGraphic rarity={rarity} phase="closed" fancy={false} className="w-7" />
    </span>
  )
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
