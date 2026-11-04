import { Check, Sparkles } from 'lucide-react'
import { AnimatePresence, motion } from 'motion/react'
import { useEffect, useId, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { useGameContext } from '../../app/gameContext'
import { openChest, updateProfile } from '../../data/repository'
import { FRAMES } from '../../domain/combat/cosmeticDefinitions'
import type { Chest, ChestContent } from '../../domain/types'
import { Badge, Button, cn, tintTextColor, useMediaQuery, useToast } from '../../ui'
import { Confetti } from '../feedback/Confetti'
import type { ConfettiBurstSpec } from '../feedback/Confetti'
import { focusIsLost, useModalScene } from '../feedback/modalScene'
import { AvatarFrame } from './AvatarFrame'
import { ChestGraphic } from './ChestGraphic'
import type { ChestPhase } from './ChestGraphic'
import { CHEST_SOURCE_LABELS, chestReveal, chestSourceLine } from './chestText'
import { chestTheme } from './chestTheme'
import { chestName } from './combatText'

export interface ChestOpenDialogProps {
  /** ID der Truhe (`Chest.id`) – gespeichert oder gerade gefunden (`GameState.chests`). */
  chestId: string
  open: boolean
  /** Schließen (Esc, Tipp neben den Inhalt, „Später“/„Weiter“) – nicht, während die Truhe gerade aufgeht. */
  onClose: () => void
  /** Nach dem Öffnen: der tatsächliche Inhalt (z. B. Gold statt Streak-Schutz bei vollem Beutel). */
  onOpened?: (content: ChestContent) => void
  /**
   * Fokusziel nach dem Schließen, falls das vorher fokussierte Element verschwunden ist (z. B. der „Öffnen“-Knopf der
   * gerade geöffneten Truhe). Ohne: dann bleibt der Fokus beim Aufrufer.
   */
  returnFocus?: () => HTMLElement | null
}

/** So lange klappert der Deckel mindestens, bevor die Beute erscheint (nur mit vollen Effekten). */
const OPEN_ANIMATION_MS = 900
const EASE_OUT = [0.22, 1, 0.36, 1] as const

/**
 * Truhe öffnen (Phase 3a): eine eigene, bildschirmfüllende Ebene über Seite und Feier-Szenen. Zuerst die geschlossene
 * Truhe in ihrer Seltenheit (Beschläge und Leuchten: Bronze, Silber, Blau-Violett, Gold) – Tippen auf die Truhe oder
 * „Truhe öffnen“ (Fokus, also auch Enter) öffnet sie per `openChest(id, today)`. Der Deckel hebt sich, Licht strahlt
 * heraus (legendär mit goldenem Strahlenkranz, selten und legendär mit Konfetti), dann erscheint die Beute: Gold,
 * Streak-Schutz (bei vollem Beutel stattdessen Gold) oder ein neuer Titel/Rahmen mit „Jetzt anlegen“ (`updateProfile`).
 * Fehler erscheinen als Toast und in der Ebene selbst; die Truhe bleibt dann zu und lässt sich erneut öffnen.
 * Ohne „Effekte“ bzw. bei reduzierter Bewegung springt der Deckel nur auf – kein Wackeln, keine Strahlen, kein Konfetti.
 */
export function ChestOpenDialog(props: ChestOpenDialogProps) {
  if (typeof document === 'undefined') return null
  return createPortal(<AnimatePresence>{props.open && <ChestLayer key={props.chestId} {...props} />}</AnimatePresence>, document.body)
}

type Phase = 'closed' | 'opening' | 'revealed'

interface OpenedResult {
  content: ChestContent
  /** Versprochener Streak-Schutz, wegen vollem Beutel als Gold ausgezahlt. */
  freezeFallback: boolean
  /** Die Truhe war beim Aufrufen schon offen. */
  earlier: boolean
}

function ChestLayer({ chestId, onClose, onOpened, returnFocus }: ChestOpenDialogProps) {
  const { data, state, today } = useGameContext()
  const { toast } = useToast()
  const reducedMotion = useMediaQuery('(prefers-reduced-motion: reduce)')
  const fancy = data.settings.effects && !reducedMotion
  const titleId = useId()
  const descriptionId = useId()

  const live = state.chests.find((chest) => chest.id === chestId)
  // Die Truhe beim Aufrufen: Sie bleibt sichtbar, auch wenn sich der Live-Stand während des Öffnens kurz ändert.
  const [found] = useState<Chest | undefined>(live)
  const [result, setResult] = useState<OpenedResult | undefined>(() =>
    live?.openedAt !== undefined ? { content: live.content, freezeFallback: false, earlier: true } : undefined,
  )
  const [phase, setPhase] = useState<Phase>(result !== undefined ? 'revealed' : 'closed')
  const [error, setError] = useState<string | undefined>(undefined)
  const [equipping, setEquipping] = useState(false)
  const [bursts, setBursts] = useState<ConfettiBurstSpec[]>([])
  const chest = live ?? (phase === 'closed' ? undefined : found)

  const panelRef = useRef<HTMLDivElement>(null)
  const primaryRef = useRef<HTMLButtonElement>(null)
  const equipRef = useRef<HTMLButtonElement>(null)
  const stageRef = useRef<HTMLDivElement>(null)
  const phaseRef = useRef(phase)
  useEffect(() => {
    phaseRef.current = phase
  })
  useModalScene(panelRef, primaryRef, onClose, () => phaseRef.current !== 'opening', returnFocus)

  const mounted = useRef(true)
  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
    }
  }, [])

  const reveal = result
    ? chestReveal(result.content, {
        form: data.profile?.form,
        heroName: data.profile?.name,
        freezeFallback: result.freezeFallback,
        streakFreezes: state.inventory.streakFreezes,
      })
    : undefined
  const cosmetic = reveal?.cosmetic
  const equipped =
    cosmetic !== undefined &&
    (cosmetic.kind === 'title' ? data.profile?.titleId === cosmetic.id : data.profile?.frameId === cosmetic.id)

  // Nach dem Aufklappen: Fokus auf die nächste sinnvolle Aktion („Jetzt anlegen“, sonst „Weiter“).
  const revealedOnce = useRef(phase === 'revealed')
  useEffect(() => {
    if (phase !== 'revealed' || revealedOnce.current) return
    revealedOnce.current = true
    ;(equipRef.current ?? primaryRef.current)?.focus({ preventScroll: true })
  }, [phase])
  // „Jetzt anlegen“ verschwindet nach dem Anlegen – der Fokus springt auf „Weiter“.
  useEffect(() => {
    if (equipped && focusIsLost()) primaryRef.current?.focus({ preventScroll: true })
  }, [equipped])

  async function handleOpen() {
    if (phase !== 'closed' || chest === undefined) return
    const promised = chest.content
    setError(undefined)
    setPhase('opening')
    try {
      const [content] = await Promise.all([openChest(chest.id, today), wait(fancy ? OPEN_ANIMATION_MS : 0)])
      if (!mounted.current) return
      setResult({ content, freezeFallback: promised.kind === 'item' && content.kind === 'gold', earlier: false })
      setPhase('revealed')
      if (fancy && chestTheme(chest.rarity).confetti) {
        const rect = stageRef.current?.getBoundingClientRect()
        setBursts([
          {
            id: 1,
            mode: 'burst',
            intensity: chest.rarity === 'legendary' ? 'full' : 'light',
            accent: chestTheme(chest.rarity).color,
            x: rect ? (rect.left + rect.width / 2) / Math.max(1, window.innerWidth) : 0.5,
            y: rect ? (rect.top + rect.height * 0.45) / Math.max(1, window.innerHeight) : 0.4,
          },
        ])
      }
      onOpened?.(content)
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : 'Bitte versuche es noch einmal.'
      toast({ tone: 'error', title: 'Die Truhe klemmt', description: message })
      if (!mounted.current) return
      setPhase('closed')
      setError(message)
      primaryRef.current?.focus({ preventScroll: true })
    }
  }

  async function handleEquip() {
    if (cosmetic === undefined || equipping) return
    setEquipping(true)
    try {
      await updateProfile(cosmetic.kind === 'title' ? { titleId: cosmetic.id } : { frameId: cosmetic.id })
    } catch (caught) {
      toast({
        tone: 'error',
        title: 'Anlegen hat nicht geklappt',
        description: caught instanceof Error ? caught.message : 'Bitte versuche es noch einmal.',
      })
    } finally {
      if (mounted.current) setEquipping(false)
    }
  }

  const rarity = chest?.rarity ?? 'common'
  const theme = chestTheme(rarity)
  const chestPhase: ChestPhase = phase === 'revealed' ? 'open' : phase === 'opening' ? 'opening' : 'closed'
  const canClose = phase !== 'opening'
  const sourceLine =
    chest !== undefined
      ? chestSourceLine(chest, {
          habits: data.habits,
          mainQuests: data.mainQuests,
          victories: data.bossVictories,
          bosses: [state.bosses.current, state.bosses.previous],
        })
      : undefined
  const frame = cosmetic?.kind === 'frame' ? FRAMES.find((entry) => entry.id === cosmetic.id) : undefined

  let body: ReactNode
  if (chest === undefined) {
    body = (
      <>
        <h2 id={titleId} className="font-display text-2xl leading-tight font-bold tracking-wide text-parchment">
          Die Truhe ist fort
        </h2>
        <p id={descriptionId} className="mt-3 text-[0.9375rem] text-muted">
          Diese Truhe gibt es nicht mehr – vielleicht wurde die Quest wieder abgehakt, bevor sie sicher verstaut war.
        </p>
        <Button ref={primaryRef} size="lg" variant="secondary" className="mt-6 w-full sm:w-60" onClick={onClose}>
          Schließen
        </Button>
      </>
    )
  } else {
    body = (
      <>
        <Eyebrow>{result?.earlier ? 'Schon geöffnet' : CHEST_SOURCE_LABELS[chest.source] ?? 'Truhe'}</Eyebrow>
        <h2
          id={titleId}
          className="mt-2 font-display text-[clamp(1.5rem,4dvh,1.875rem)] leading-tight font-bold tracking-wide text-balance"
          style={{ color: tintTextColor(theme.color) }}
        >
          {chestName(rarity)}
        </h2>
        {sourceLine && <p className="mt-1 max-w-full text-sm text-muted wrap-anywhere">{sourceLine}</p>}

        {/* Bühne: Leuchten, (legendär) Strahlen, die Truhe und die aufsteigende Beute */}
        <div
          ref={stageRef}
          data-chest-stage={chestPhase}
          className="relative mt-[clamp(0.75rem,2dvh,1.25rem)] grid h-[clamp(10rem,27dvh,13.5rem)] w-full place-items-end justify-center"
        >
          {theme.rays && phase === 'revealed' && fancy && (
            <motion.span
              aria-hidden="true"
              data-chest-rays=""
              className="pointer-events-none absolute top-1/2 left-1/2 -z-10 size-[40rem] rounded-full"
              style={{
                x: '-50%',
                y: '-50%',
                background: `repeating-conic-gradient(from 0deg, color-mix(in srgb, ${theme.color} 24%, transparent) 0deg 5deg, transparent 5deg 14deg)`,
                maskImage: 'radial-gradient(closest-side, black 8%, rgb(0 0 0 / 0.4) 30%, transparent 62%)',
                WebkitMaskImage: 'radial-gradient(closest-side, black 8%, rgb(0 0 0 / 0.4) 30%, transparent 62%)',
              }}
              initial={{ opacity: 0, scale: 0.4, rotate: 0 }}
              animate={{ opacity: 1, scale: 1, rotate: 360 }}
              transition={{
                opacity: { duration: 0.6 },
                scale: { duration: 0.9, ease: EASE_OUT },
                rotate: { duration: 70, ease: 'linear', repeat: Infinity },
              }}
            />
          )}
          <motion.span
            aria-hidden="true"
            className="pointer-events-none absolute inset-x-0 top-[8%] bottom-0 -z-10 mx-auto w-[85%] rounded-full blur-2xl"
            style={{ background: `radial-gradient(closest-side, color-mix(in srgb, ${theme.color} 55%, transparent), color-mix(in srgb, ${theme.glow} 12%, transparent) 60%, transparent)` }}
            initial={false}
            animate={{ opacity: phase === 'revealed' ? 1 : phase === 'opening' ? 0.75 : 0.4 }}
            transition={{ duration: fancy ? 0.6 : 0.15 }}
          />
          {/* Die Truhe selbst ist eine große Tippfläche; für Tastatur und Screenreader gibt es den Knopf darunter. */}
          <span
            aria-hidden="true"
            data-chest-tap=""
            onClick={phase === 'closed' ? () => void handleOpen() : undefined}
            className={cn('relative block w-[min(11.5rem,62vw)]', phase === 'closed' && 'cursor-pointer active:scale-[0.97]')}
          >
            <ChestGraphic rarity={rarity} phase={chestPhase} fancy={fancy} className="w-full" />
          </span>
          <AnimatePresence>
            {phase === 'revealed' && reveal && (
              <motion.span
                key="loot"
                aria-hidden="true"
                data-chest-loot={reveal.kind}
                className="absolute top-0 left-1/2 grid place-items-center text-[clamp(2.5rem,7dvh,3.25rem)] leading-none drop-shadow-[0_6px_16px_rgb(0_0_0/0.6)]"
                style={{ x: '-50%' }}
                initial={fancy ? { opacity: 0, y: 70, scale: 0.4 } : { opacity: 0 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                transition={fancy ? { type: 'spring', stiffness: 220, damping: 15, delay: 0.12 } : { duration: 0.15 }}
              >
                {frame && data.profile ? (
                  <AvatarFrame frame={frame} size="lg">
                    {data.profile.avatar}
                  </AvatarFrame>
                ) : (
                  reveal.icon
                )}
              </motion.span>
            )}
          </AnimatePresence>
        </div>

        {phase !== 'revealed' || reveal === undefined ? (
          <div id={descriptionId} className="mt-[clamp(1rem,3dvh,1.5rem)] flex w-full flex-col items-center">
            <p className="text-[0.9375rem] text-muted">
              {phase === 'opening' ? 'Der Deckel knarrt …' : 'Was wohl darin liegt? Tippe auf die Truhe.'}
            </p>
            {error && (
              <p role="alert" className="mt-2 text-sm text-danger">
                {error}
              </p>
            )}
            <Button
              ref={primaryRef}
              size="lg"
              icon={<Sparkles />}
              loading={phase === 'opening'}
              onClick={() => void handleOpen()}
              className="mt-4 w-full sm:w-60"
            >
              Truhe öffnen
            </Button>
            <Button variant="ghost" className="mt-2 w-full sm:w-60" onClick={onClose} disabled={!canClose}>
              Später öffnen
            </Button>
          </div>
        ) : (
          <motion.div
            id={descriptionId}
            data-chest-reveal={reveal.kind}
            className="mt-[clamp(0.75rem,2.5dvh,1.25rem)] flex w-full flex-col items-center"
            initial={fancy ? { opacity: 0, y: 10 } : false}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.35, delay: fancy ? 0.25 : 0, ease: EASE_OUT }}
          >
            <p className="text-xs font-semibold tracking-[0.2em] text-gold uppercase">{reveal.label}</p>
            <p
              className={cn(
                'mt-1 max-w-full font-display text-[clamp(1.5rem,4.2dvh,2rem)] leading-tight font-bold tracking-wide wrap-anywhere',
                reveal.kind === 'gold' ? 'text-gold-gradient tabular-nums' : 'text-parchment',
              )}
            >
              {reveal.name}
            </p>
            <p className="mt-2 max-w-prose text-[0.9375rem] leading-relaxed text-muted">{reveal.detail}</p>
            {cosmetic !== undefined &&
              (equipped ? (
                <Badge tone="gold" size="md" icon={<Check />} className="mt-4" data-chest-equipped="">
                  {cosmetic.kind === 'title' ? 'Titel angelegt' : 'Rahmen angelegt'}
                </Badge>
              ) : (
                <Button ref={equipRef} size="lg" className="mt-4 w-full sm:w-60" loading={equipping} onClick={() => void handleEquip()}>
                  Jetzt anlegen
                </Button>
              ))}
            <Button
              ref={primaryRef}
              size="lg"
              variant={cosmetic !== undefined && !equipped ? 'secondary' : 'primary'}
              className="mt-2.5 w-full sm:w-60"
              onClick={onClose}
            >
              Weiter
            </Button>
          </motion.div>
        )}
      </>
    )
  }

  return (
    <motion.div
      className="fixed inset-0 z-[66]"
      data-chest-dialog={chestId}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: fancy ? 0.3 : 0.15, ease: 'easeOut' }}
    >
      <div aria-hidden="true" className="absolute inset-0 bg-bg-deep/90 backdrop-blur-md" />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0"
        style={{ background: `radial-gradient(70% 50% at 50% 36%, color-mix(in srgb, ${theme.color} 16%, transparent), transparent 70%)` }}
      />
      <div className="absolute inset-0 overflow-y-auto overscroll-contain">
        <div
          className={cn(
            'flex min-h-full items-center justify-center overflow-clip',
            'pt-[max(1.25rem,env(safe-area-inset-top))] pb-[max(1.25rem,env(safe-area-inset-bottom))]',
            'pr-[max(1.25rem,env(safe-area-inset-right))] pl-[max(1.25rem,env(safe-area-inset-left))]',
          )}
          onClick={(event) => {
            if (event.target === event.currentTarget && canClose) onClose()
          }}
        >
          <motion.div
            ref={panelRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
            aria-describedby={descriptionId}
            tabIndex={-1}
            data-rarity={rarity}
            className="relative isolate flex w-full max-w-sm flex-col items-center text-center outline-none"
            initial={fancy ? { opacity: 0, y: 16, scale: 0.98 } : { opacity: 0 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={fancy ? { opacity: 0, y: 10 } : { opacity: 0 }}
            transition={{ duration: fancy ? 0.4 : 0.15, ease: EASE_OUT }}
          >
            {body}
            {/* Ansage für Screenreader: was gerade passiert und was in der Truhe war. */}
            <p className="sr-only" role="status">
              {phase === 'opening' ? 'Die Truhe öffnet sich …' : phase === 'revealed' && reveal && !result?.earlier ? reveal.spoken : ''}
            </p>
          </motion.div>
        </div>
      </div>
      <Confetti bursts={bursts} onBurstEnd={(id) => setBursts((current) => current.filter((burst) => burst.id !== id))} />
    </motion.div>
  )
}

function Eyebrow({ children }: { children: ReactNode }) {
  return (
    <p className="flex items-center gap-2 text-xs font-semibold tracking-[0.2em] whitespace-nowrap text-gold uppercase sm:gap-2.5 sm:tracking-[0.26em]">
      <span aria-hidden="true" className="h-px w-5 bg-linear-to-r from-transparent to-gold/70 sm:w-8" />
      {children}
      <span aria-hidden="true" className="h-px w-5 bg-linear-to-l from-transparent to-gold/70 sm:w-8" />
    </p>
  )
}

function wait(ms: number): Promise<void> {
  return ms > 0 ? new Promise((resolve) => window.setTimeout(resolve, ms)) : Promise.resolve()
}
