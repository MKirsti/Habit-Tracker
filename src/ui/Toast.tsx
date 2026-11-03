import { CircleAlert, CircleCheck, Info, Sparkles, X } from 'lucide-react'
import { AnimatePresence, motion } from 'motion/react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { cn } from './cn'
import { TOAST_DURATIONS, ToastContext } from './toastContext'
import { useMediaQuery } from './useMediaQuery'
import type { ToastApi, ToastOptions, ToastRecord, ToastTone } from './toastContext'

export interface ToastProviderProps {
  children: ReactNode
  /** Maximal gleichzeitig sichtbare Toasts (älteste fallen heraus). Standard: 4. */
  max?: number
}

/**
 * Stellt `useToast()` bereit und rendert den Toast-Stapel: auf dem Handy oben (unter der
 * Statusleiste), auf dem Desktop unten rechts. Toasts verschwinden automatisch; Hover oder Fokus
 * pausiert den Timer.
 */
export function ToastProvider({ children, max = 4 }: ToastProviderProps) {
  const [toasts, setToasts] = useState<ToastRecord[]>([])
  const nextId = useRef(0)

  const dismiss = useCallback((id: string) => {
    setToasts((current) => current.filter((t) => t.id !== id))
  }, [])

  const toast = useCallback(
    (options: ToastOptions) => {
      nextId.current += 1
      const id = `toast-${nextId.current}`
      setToasts((current) => [...current, { ...options, id, tone: options.tone ?? 'info' }].slice(-max))
      return id
    },
    [max],
  )

  const api = useMemo<ToastApi>(() => ({ toast, dismiss }), [toast, dismiss])

  return (
    <ToastContext value={api}>
      {children}
      <ToastViewport toasts={toasts} onDismiss={dismiss} />
    </ToastContext>
  )
}

/** Breakpoint `md` (48rem) – ab hier Seitenleiste statt unterer Navigation. */
const DESKTOP_QUERY = '(min-width: 48rem)'

function ToastViewport({ toasts, onDismiss }: { toasts: ToastRecord[]; onDismiss: (id: string) => void }) {
  const isDesktop = useMediaQuery(DESKTOP_QUERY)
  if (typeof document === 'undefined') return null
  // Der neueste Toast steht immer am Bildschirmrand: auf dem Handy oben, auf dem Desktop unten.
  // (Umgedrehte DOM-Reihenfolge statt flex-col-reverse, damit Tab- und Lesereihenfolge der Optik folgen.)
  const ordered = isDesktop ? toasts : [...toasts].reverse()
  return createPortal(
    <div
      className={cn(
        // Handy: oben unter der Statusleiste. Unten lägen die Toasts über der Navigation, den Buttons
        // der Bottom-Sheet-Dialoge und der nächsten Quest-Checkbox – und schnappten sich den Tipp.
        'pointer-events-none fixed inset-x-0 top-[calc(env(safe-area-inset-top)+0.5rem)] z-[60] flex justify-center px-4',
        'md:inset-x-auto md:top-auto md:right-6 md:bottom-6 md:justify-end md:px-0',
      )}
    >
      <ol
        aria-live="polite"
        aria-label="Benachrichtigungen"
        className="flex w-full max-w-sm flex-col items-stretch gap-2 md:w-96"
      >
        <AnimatePresence initial={false}>
          {ordered.map((t) => (
            <ToastItem key={t.id} toast={t} onDismiss={onDismiss} enterFrom={isDesktop ? 'below' : 'above'} />
          ))}
        </AnimatePresence>
      </ol>
    </div>,
    document.body,
  )
}

const TONE_STYLES: Record<ToastTone, { container: string; icon: string; title: string }> = {
  xp: {
    container:
      'border-gold/55 bg-linear-to-r from-[#33260f] via-surface-raised to-surface-raised shadow-[0_12px_32px_-12px_rgb(0_0_0/0.9),0_0_24px_-8px_rgb(212_165_72/0.55)]',
    icon: 'bg-gold/20 text-gold-bright ring-gold/45',
    title: 'font-display tracking-wide text-gold-bright',
  },
  success: {
    container: 'border-success/35 bg-surface-raised shadow-[0_12px_32px_-12px_rgb(0_0_0/0.9)]',
    icon: 'bg-success/15 text-success ring-success/35',
    title: 'text-parchment',
  },
  info: {
    container: 'border-border-strong bg-surface-raised shadow-[0_12px_32px_-12px_rgb(0_0_0/0.9)]',
    icon: 'bg-info/15 text-info ring-info/30',
    title: 'text-parchment',
  },
  error: {
    container: 'border-danger/45 bg-surface-raised shadow-[0_12px_32px_-12px_rgb(0_0_0/0.9)]',
    icon: 'bg-danger/15 text-danger ring-danger/35',
    title: 'text-parchment',
  },
}

const DEFAULT_ICONS: Record<ToastTone, ReactNode> = {
  xp: <Sparkles />,
  success: <CircleCheck />,
  info: <Info />,
  error: <CircleAlert />,
}

function ToastItem({
  toast,
  onDismiss,
  enterFrom,
}: {
  toast: ToastRecord
  onDismiss: (id: string) => void
  /** Von wo der Toast hereingleitet: vom oberen Rand (Handy) oder von unten (Desktop). */
  enterFrom: 'above' | 'below'
}) {
  // Hover und Fokus getrennt verfolgen: Verlässt der Zeiger den Toast, während er noch per Tastatur
  // fokussiert ist, muss der Timer weiter pausieren (WCAG 2.2.1 „Zeitbegrenzungen anpassbar“).
  const [hovered, setHovered] = useState(false)
  const [focused, setFocused] = useState(false)
  const paused = hovered || focused
  const duration = toast.duration ?? TOAST_DURATIONS[toast.tone]
  const remaining = useRef(duration)

  // Auto-Ausblenden mit Pause bei Hover/Fokus (die Restzeit läuft danach weiter).
  useEffect(() => {
    if (paused || !Number.isFinite(remaining.current)) return
    const startedAt = Date.now()
    const timer = setTimeout(() => onDismiss(toast.id), Math.max(0, remaining.current))
    return () => {
      clearTimeout(timer)
      remaining.current -= Date.now() - startedAt
    }
  }, [paused, toast.id, onDismiss])

  const styles = TONE_STYLES[toast.tone]

  return (
    <motion.li
      layout
      initial={{ opacity: 0, y: enterFrom === 'above' ? -18 : 18, scale: 0.95 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, scale: 0.95, transition: { duration: 0.16 } }}
      transition={{ type: 'spring', stiffness: 460, damping: 34 }}
      onPointerEnter={() => setHovered(true)}
      onPointerLeave={() => setHovered(false)}
      onFocus={() => setFocused(true)}
      onBlur={(event) => {
        // Fokuswechsel innerhalb des Toasts zählt nicht als Verlassen.
        const next = event.relatedTarget
        if (!(next instanceof Node && event.currentTarget.contains(next))) setFocused(false)
      }}
      className={cn(
        'pointer-events-auto relative flex items-start gap-3 overflow-hidden rounded-2xl border py-3 pr-2 pl-3 backdrop-blur-md',
        styles.container,
      )}
    >
      {toast.tone === 'xp' && (
        <span
          aria-hidden="true"
          className="pointer-events-none absolute inset-x-6 top-0 h-px bg-linear-to-r from-transparent via-gold-bright/80 to-transparent"
        />
      )}
      <span
        aria-hidden="true"
        className={cn(
          'grid size-9 shrink-0 place-items-center rounded-full text-lg ring-1 ring-inset [&_svg]:size-[1.125rem]',
          styles.icon,
        )}
      >
        {toast.icon ?? DEFAULT_ICONS[toast.tone]}
      </span>
      <div className="min-w-0 flex-1 self-center py-0.5">
        <p className={cn('text-[0.9375rem] leading-snug font-semibold', styles.title)}>{toast.title}</p>
        {toast.description !== undefined && <p className="mt-0.5 text-sm text-muted">{toast.description}</p>}
      </div>
      <button
        type="button"
        aria-label="Benachrichtigung schließen"
        onClick={() => onDismiss(toast.id)}
        // 40 px Tap-Ziel; der negative Rand hält die Toast-Höhe trotzdem kompakt.
        className="-my-0.5 grid size-10 shrink-0 place-items-center rounded-lg text-faint transition-colors hover:bg-white/5 hover:text-parchment [&_svg]:size-4"
      >
        <X aria-hidden />
      </button>
    </motion.li>
  )
}
