import { Crown, ScrollText, Trophy } from 'lucide-react'
import { motion } from 'motion/react'
import { useEffect, useId, useRef } from 'react'
import type { ReactNode, RefObject } from 'react'
import { Badge, Button, Ornament, XpBar, cn, formatNumber } from '../../ui'
// Die Modal-Hilfen (Dialog-Stapel, Scroll-Sperre, Fokusfalle) teilt sich die Szene mit `Dialog`, damit
// Esc/Tab auch bei einem darunter offenen Dialog nur die oberste Ebene betreffen.
import { isTopModal, lockBodyScroll, makeAppInert, pushModal, trapTabKey } from '../../ui/modal'
import type { Celebration } from './celebrations'
import type { CampaignCompletedEvent, LevelUpEvent } from './feedbackEvents'
import { rankHint, xpLabel } from './feedbackText'

export interface CelebrationOverlayProps {
  celebration: Celebration
  /** Volle Effekte (Lichtstrahlen, Sprung-Animation). Sonst wird die Szene nur schlicht eingeblendet. */
  fancy: boolean
  onClose: () => void
  /** Nach dem Einblenden: Mittelpunkt des Medaillons (Anteil der Fenstergröße) – Ursprung fürs Konfetti. */
  onReveal?: (origin: { x: number; y: number }) => void
}

const EASE_OUT = [0.22, 1, 0.36, 1] as const

/** Überschrift der Szene (ohne Abstand – `cn` löst widersprüchliche Klassen nicht auf). Schrumpft auf niedrigen Bildschirmen (dvh). */
const HEADING =
  'font-display text-[clamp(1.625rem,4.4dvh,1.875rem)] leading-tight font-bold tracking-wide text-balance text-parchment'

/**
 * Bildschirmfüllende Feier-Szene (Level-Up bzw. Kampagne gemeistert) als modaler Dialog:
 * Fokus startet auf „Weiter“, Esc und ein Tipp neben den Inhalt schließen, Tab bleibt in der Szene,
 * danach kehrt der Fokus zurück. Liegt über Toasts und Dialogen.
 */
export function CelebrationOverlay({ celebration, fancy, onClose, onReveal }: CelebrationOverlayProps) {
  const titleId = useId()
  const descriptionId = useId()
  const panelRef = useRef<HTMLDivElement>(null)
  const buttonRef = useRef<HTMLButtonElement>(null)
  const medallionRef = useRef<HTMLDivElement>(null)
  useModalScene(panelRef, buttonRef, onClose)

  const onRevealRef = useRef(onReveal)
  useEffect(() => {
    onRevealRef.current = onReveal
  })
  useEffect(() => {
    const medallion = medallionRef.current
    if (!medallion || !onRevealRef.current) return
    const rect = medallion.getBoundingClientRect()
    onRevealRef.current({
      x: (rect.left + rect.width / 2) / Math.max(1, window.innerWidth),
      y: (rect.top + rect.height / 2) / Math.max(1, window.innerHeight),
    })
  }, [])

  const content =
    celebration.kind === 'level-up' ? (
      <LevelUpContent
        event={celebration.event}
        fancy={fancy}
        titleId={titleId}
        descriptionId={descriptionId}
        medallionRef={medallionRef}
      />
    ) : (
      <CampaignContent
        event={celebration.event}
        fancy={fancy}
        titleId={titleId}
        descriptionId={descriptionId}
        medallionRef={medallionRef}
      />
    )

  return (
    <motion.div
      className="fixed inset-0 z-[65]"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: fancy ? 0.35 : 0.2, ease: 'easeOut' }}
    >
      {/* Abdunkelung mit warmem Goldschein in der oberen Bildmitte */}
      <div aria-hidden="true" className="absolute inset-0 bg-bg-deep/90 backdrop-blur-md" />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(70%_50%_at_50%_32%,rgb(212_165_72/0.2),transparent_70%)]"
      />

      <div className="absolute inset-0 overflow-y-auto overscroll-contain">
        {/* overflow-clip: Die großen Lichtstrahlen werden abgeschnitten statt Scrollfläche zu erzeugen. */}
        <div
          className={cn(
            'flex min-h-full items-center justify-center overflow-clip',
            'pt-[max(1.25rem,env(safe-area-inset-top))] pb-[max(1.25rem,env(safe-area-inset-bottom))]',
            'pr-[max(1.25rem,env(safe-area-inset-right))] pl-[max(1.25rem,env(safe-area-inset-left))]',
          )}
          onClick={(event) => {
            if (event.target === event.currentTarget) onClose()
          }}
        >
          <motion.div
            ref={panelRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
            aria-describedby={descriptionId}
            tabIndex={-1}
            // isolate: eigener Stapelkontext, damit die Lichtstrahlen (-z-10) nie hinter die Abdunkelung rutschen.
            className="relative isolate flex w-full max-w-sm flex-col items-center text-center outline-none"
            initial={fancy ? { opacity: 0, y: 18 } : { opacity: 0 }}
            animate={{ opacity: 1, y: 0 }}
            exit={fancy ? { opacity: 0, y: 10 } : { opacity: 0 }}
            transition={{ duration: fancy ? 0.45 : 0.2, ease: EASE_OUT }}
          >
            {content}
            <Button ref={buttonRef} size="lg" onClick={onClose} className="mt-[clamp(1.25rem,3.5dvh,1.75rem)] w-full sm:w-60">
              Weiter
            </Button>
          </motion.div>
        </div>
      </div>
    </motion.div>
  )
}

// ---------------------------------------------------------------------------
// Inhalte
// ---------------------------------------------------------------------------

interface ContentProps<E> {
  event: E
  fancy: boolean
  titleId: string
  descriptionId: string
  medallionRef: RefObject<HTMLDivElement | null>
}

function LevelUpContent({ event, fancy, titleId, descriptionId, medallionRef }: ContentProps<LevelUpEvent>) {
  const jump = event.to - event.from
  const digits = String(event.to).length
  return (
    <>
      <Eyebrow>Level-Aufstieg</Eyebrow>
      <Medallion fancy={fancy} medallionRef={medallionRef}>
        <motion.span
          className={cn(
            'relative font-display leading-none font-bold text-gold-gradient tabular-nums drop-shadow-[0_2px_10px_rgb(0_0_0/0.6)]',
            digits <= 2 ? 'text-[clamp(3.5rem,10dvh,4.75rem)]' : 'text-[clamp(2.5rem,7dvh,3rem)]',
          )}
          initial={fancy ? { opacity: 0, scale: 2.2, filter: 'blur(10px)' } : { opacity: 0 }}
          animate={{ opacity: 1, scale: 1, filter: 'blur(0px)' }}
          transition={
            fancy ? { type: 'spring', stiffness: 260, damping: 17, delay: 0.18 } : { duration: 0.2, delay: 0.05 }
          }
        >
          {formatNumber(event.to)}
        </motion.span>
      </Medallion>

      <h2 id={titleId} className={cn(HEADING, 'mt-[clamp(1.25rem,4dvh,2rem)]')}>
        Level {formatNumber(event.to)} erreicht!
      </h2>
      <Ornament className="mt-2 h-3.5 w-24" />

      <div id={descriptionId} className="mt-3 flex flex-col items-center gap-2">
        {jump > 1 && (
          <Badge tone="gold" size="md">
            +{formatNumber(jump)} Level auf einmal
          </Badge>
        )}
        {event.rankChanged ? (
          <p className="flex items-center gap-2 text-[1.0625rem] text-parchment">
            <Crown aria-hidden className="size-5 text-gold-bright" strokeWidth={1.9} />
            <span>
              Neuer Rang: <span className="font-display font-bold tracking-wide text-gold-bright">{event.rank}</span>
            </span>
          </p>
        ) : (
          <p className="text-[0.9375rem] text-muted">{rankHint(event.to, event.rank)}</p>
        )}
      </div>

      <div className="mt-[clamp(1rem,3dvh,1.5rem)] w-full rounded-2xl border border-border bg-surface/80 px-4 pt-3.5 pb-4 text-left shadow-card">
        <XpBar level={event.to} xpIntoLevel={event.level.xpIntoLevel} xpForNextLevel={event.level.xpForNextLevel} />
      </div>
    </>
  )
}

function CampaignContent({ event, fancy, titleId, descriptionId, medallionRef }: ContentProps<CampaignCompletedEvent>) {
  return (
    <>
      <Eyebrow>Kampagne abgeschlossen</Eyebrow>
      <Medallion fancy={fancy} medallionRef={medallionRef}>
        <motion.span
          className="relative text-[clamp(3rem,8.5dvh,4rem)] leading-none drop-shadow-[0_4px_12px_rgb(0_0_0/0.6)]"
          initial={fancy ? { opacity: 0, scale: 0.3, rotate: -12 } : { opacity: 0 }}
          animate={{ opacity: 1, scale: 1, rotate: 0 }}
          transition={
            fancy ? { type: 'spring', stiffness: 240, damping: 14, delay: 0.18 } : { duration: 0.2, delay: 0.05 }
          }
        >
          {event.icon}
        </motion.span>
        <span
          aria-hidden="true"
          className="absolute -bottom-3 left-1/2 grid size-9 -translate-x-1/2 place-items-center rounded-full border border-gold-bright/70 bg-linear-to-b from-gold-bright to-gold text-on-gold shadow-glow"
        >
          <Trophy className="size-[1.125rem]" strokeWidth={2.2} />
        </span>
      </Medallion>

      <h2 id={titleId} className={cn(HEADING, 'mt-[clamp(1.5rem,4.5dvh,2.25rem)]')}>
        Kampagne gemeistert!
      </h2>
      <Ornament className="mt-2 h-3.5 w-24" />
      <div id={descriptionId} className="mt-3 flex max-w-full flex-col items-center gap-2">
        {/* wrap-anywhere: Lange deutsche Komposita dürfen die zentrierte Spalte nicht sprengen. */}
        <p className="max-w-full font-display text-lg leading-snug font-semibold tracking-wide wrap-anywhere text-gold-bright">
          {event.title}
        </p>
        <p className="text-[0.9375rem] text-muted">
          {event.chapterCount === 1 ? 'Das Kapitel ist bestanden' : `Alle ${formatNumber(event.chapterCount)} Kapitel bestanden`}{' '}
          · <span className="font-semibold text-gold-bright tabular-nums">{xpLabel(event.xp)}</span>
        </p>
      </div>

      {/* Belohnung auf Pergament */}
      <div className="relative mt-[clamp(1rem,3dvh,1.5rem)] w-full rotate-[-0.6deg] rounded-xl border border-gold-dim bg-parchment px-5 pt-4 pb-4.5 text-on-gold shadow-[inset_0_0_32px_rgb(156_120_52/0.5),inset_0_0_0_3px_rgb(236_224_200/0.6),0_16px_36px_-14px_rgb(0_0_0/0.9)]">
        <span
          aria-hidden="true"
          className="pointer-events-none absolute inset-1.5 rounded-lg border border-dashed border-gold-dim/45"
        />
        <p className="relative flex items-center justify-center gap-1.5 text-[0.6875rem] font-bold tracking-[0.22em] text-on-gold/75 uppercase">
          <ScrollText aria-hidden className="size-3.5" strokeWidth={2.2} />
          Deine Belohnung
        </p>
        {event.reward.trim() !== '' ? (
          <>
            <p className="relative mt-1.5 font-display text-lg leading-snug font-bold wrap-anywhere sm:text-xl">{event.reward}</p>
            <p className="relative mt-1 text-sm text-on-gold/75 [@media(max-height:42rem)]:hidden">Du hast sie dir verdient – gönn sie dir!</p>
          </>
        ) : (
          <p className="relative mt-1.5 font-display text-lg leading-snug font-bold">
            Gönn dir etwas Schönes – du hast es dir verdient!
          </p>
        )}
      </div>
    </>
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

/** Goldenes Medaillon mit Lichtschein; bei vollen Effekten mit Lichtstrahlen und Schockwelle. */
function Medallion({
  fancy,
  medallionRef,
  children,
}: {
  fancy: boolean
  medallionRef: RefObject<HTMLDivElement | null>
  children: ReactNode
}) {
  return (
    <div
      ref={medallionRef}
      className="relative mt-[clamp(1rem,3dvh,1.5rem)] grid size-[clamp(7rem,19dvh,10rem)] place-items-center"
    >
      {fancy && (
        <motion.span
          aria-hidden="true"
          className="pointer-events-none absolute top-1/2 left-1/2 -z-10 size-[56rem] rounded-full sm:size-[76rem]"
          style={{
            x: '-50%',
            y: '-50%',
            background:
              'repeating-conic-gradient(from 0deg, rgb(240 201 106 / 0.17) 0deg 4deg, transparent 4deg 13deg)',
            maskImage: 'radial-gradient(closest-side, black 10%, rgb(0 0 0 / 0.45) 32%, transparent 68%)',
            WebkitMaskImage: 'radial-gradient(closest-side, black 10%, rgb(0 0 0 / 0.45) 32%, transparent 68%)',
          }}
          initial={{ opacity: 0, scale: 0.5, rotate: 0 }}
          animate={{ opacity: 1, scale: 1, rotate: 360 }}
          transition={{
            opacity: { duration: 0.8 },
            scale: { duration: 1.1, ease: EASE_OUT },
            rotate: { duration: 90, ease: 'linear', repeat: Infinity },
          }}
        />
      )}
      {/* Lichtschein hinter dem Medaillon */}
      <motion.span
        aria-hidden="true"
        className="pointer-events-none absolute -inset-14 -z-10 rounded-full bg-[radial-gradient(closest-side,rgb(240_201_106/0.42),rgb(212_165_72/0.12)_55%,transparent)]"
        initial={{ opacity: 0 }}
        animate={fancy ? { opacity: [0, 1, 0.75, 1] } : { opacity: 0.8 }}
        transition={
          fancy ? { duration: 3.2, times: [0, 0.25, 0.6, 1], repeat: Infinity, repeatType: 'mirror' } : { duration: 0.2 }
        }
      />
      {fancy && (
        <motion.span
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 rounded-full border-2 border-gold-bright/80"
          initial={{ opacity: 0.9, scale: 0.85 }}
          animate={{ opacity: 0, scale: 2.3 }}
          transition={{ duration: 1.2, delay: 0.22, ease: 'easeOut' }}
        />
      )}
      <span
        aria-hidden="true"
        className="absolute inset-0 rounded-full border border-gold/70 bg-[radial-gradient(circle_at_50%_28%,var(--color-surface-hover),var(--color-bg-deep)_78%)] shadow-[0_0_0_6px_rgb(212_165_72/0.08),0_0_56px_-6px_rgb(240_201_106/0.6),inset_0_2px_0_rgb(255_236_200/0.1),inset_0_-10px_24px_rgb(0_0_0/0.5)]"
      />
      <span aria-hidden="true" className="absolute inset-2 rounded-full border border-gold-dim/50" />
      {children}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Modal-Verhalten
// ---------------------------------------------------------------------------

/**
 * Wie `Dialog`: in den Modal-Stapel eintragen, Seite sperren und für Screenreader verbergen,
 * Fokus auf `initialFocusRef`, Esc schließt, Tab bleibt im Panel, Fokus kehrt danach zurück.
 */
function useModalScene(
  panelRef: RefObject<HTMLElement | null>,
  initialFocusRef: RefObject<HTMLElement | null>,
  onClose: () => void,
): void {
  const onCloseRef = useRef(onClose)
  useEffect(() => {
    onCloseRef.current = onClose
  })

  useEffect(() => {
    const previouslyFocused = document.activeElement instanceof HTMLElement ? document.activeElement : null
    const token = Symbol('celebration')
    const releaseStack = pushModal(token)
    const releaseScroll = lockBodyScroll()
    const releaseInert = makeAppInert()
    const initial = initialFocusRef.current ?? panelRef.current
    initial?.focus({ preventScroll: true })
    // Sehr niedrige Bildschirme (Handy quer): Der fokussierte Button darf nicht unsichtbar unter dem Rand liegen.
    if (initial && initial.getBoundingClientRect().bottom > window.innerHeight) {
      initial.scrollIntoView?.({ block: 'nearest' })
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (!isTopModal(token) || event.defaultPrevented) return
      if (event.key === 'Escape') {
        event.preventDefault()
        onCloseRef.current()
      } else if (event.key === 'Tab' && panelRef.current) {
        trapTabKey(event, panelRef.current)
      }
    }
    document.addEventListener('keydown', handleKeyDown)

    return () => {
      document.removeEventListener('keydown', handleKeyDown)
      releaseStack()
      releaseInert()
      releaseScroll()
      if (previouslyFocused?.isConnected) previouslyFocused.focus({ preventScroll: true })
    }
  }, [panelRef, initialFocusRef])
}
