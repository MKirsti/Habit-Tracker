import { X } from 'lucide-react'
import { AnimatePresence, motion } from 'motion/react'
import { useEffect, useId, useRef, useState } from 'react'
import type { ReactNode, RefObject } from 'react'
import { createPortal } from 'react-dom'
import { Button, IconButton } from './Button'
import { cn } from './cn'
import { isTopModal, lockBodyScroll, makeAppInert, pushModal, trapTabKey } from './modal'
import { useMediaQuery } from './useMediaQuery'

export type DialogSize = 'sm' | 'md' | 'lg'

export interface DialogProps {
  open: boolean
  /** Wird bei Esc, Klick auf den Hintergrund und dem Schließen-Button aufgerufen. */
  onClose: () => void
  title: ReactNode
  description?: ReactNode
  /** Emoji/Icon links neben dem Titel. */
  icon?: ReactNode
  children?: ReactNode
  /** Aktionsleiste unten (Buttons). Auf dem Handy untereinander in voller Breite, letzter Button oben. */
  footer?: ReactNode
  /** Maximale Breite auf dem Desktop. Standard: md. */
  size?: DialogSize
  /** Element, das beim Öffnen den Fokus bekommt. Standard: der Dialog selbst (keine Tastatur-Popups auf dem Handy). */
  initialFocusRef?: RefObject<HTMLElement | null>
  /** "alertdialog" für Rückfragen, die eine Entscheidung erfordern. */
  role?: 'dialog' | 'alertdialog'
  /** Klick auf den Hintergrund schließt (Standard: an). */
  closeOnOverlayClick?: boolean
  hideCloseButton?: boolean
  className?: string
}

const SIZES: Record<DialogSize, string> = {
  sm: 'sm:max-w-sm',
  md: 'sm:max-w-lg',
  lg: 'sm:max-w-2xl',
}

/**
 * Modaler Dialog: auf dem Handy als Bottom-Sheet, ab 640 px zentriert.
 * Esc schließt, der Fokus wird beim Öffnen in den Dialog gesetzt, per Tab darin gehalten und beim
 * Schließen zurückgegeben. Die Seite dahinter scrollt nicht und ist für Screenreader verborgen.
 */
export function Dialog(props: DialogProps) {
  const { open, onClose, initialFocusRef } = props
  const panelRef = useRef<HTMLDivElement>(null)

  // Immer die aktuelle onClose-Funktion verwenden, ohne die Effekte neu zu starten.
  const onCloseRef = useRef(onClose)
  useEffect(() => {
    onCloseRef.current = onClose
  })

  useEffect(() => {
    if (!open) return
    const previouslyFocused = document.activeElement instanceof HTMLElement ? document.activeElement : null
    const token = Symbol('dialog')
    const releaseStack = pushModal(token)
    const releaseScroll = lockBodyScroll()
    const releaseInert = makeAppInert()

    // Fokus in den Dialog setzen (außer ein Kind hat sich per autoFocus schon selbst fokussiert).
    const panel = panelRef.current
    if (panel && !panel.contains(document.activeElement)) {
      const target = initialFocusRef?.current ?? panel
      target.focus({ preventScroll: true })
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
    // initialFocusRef wird bewusst nur beim Öffnen gelesen.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  if (typeof document === 'undefined') return null
  return createPortal(
    <AnimatePresence>{open && <DialogLayer key="dialog" {...props} panelRef={panelRef} />}</AnimatePresence>,
    document.body,
  )
}

function DialogLayer({
  onClose,
  title,
  description,
  icon,
  children,
  footer,
  size = 'md',
  role = 'dialog',
  closeOnOverlayClick = true,
  hideCloseButton = false,
  className,
  panelRef,
}: DialogProps & { panelRef: RefObject<HTMLDivElement | null> }) {
  const titleId = useId()
  const descriptionId = useId()
  const isDesktop = useMediaQuery('(min-width: 640px)')

  const panelMotion = isDesktop
    ? {
        initial: { opacity: 0, scale: 0.96, y: 10 },
        animate: { opacity: 1, scale: 1, y: 0 },
        exit: { opacity: 0, scale: 0.97, y: 6 },
        transition: { type: 'spring' as const, stiffness: 420, damping: 32 },
      }
    : {
        initial: { y: '100%' },
        animate: { y: 0 },
        exit: { y: '100%' },
        transition: { type: 'spring' as const, stiffness: 380, damping: 38 },
      }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-6">
      <motion.div
        aria-hidden="true"
        className="absolute inset-0 bg-black/70 backdrop-blur-[3px]"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.2 }}
        onClick={closeOnOverlayClick ? onClose : undefined}
      />
      <motion.div
        ref={panelRef}
        role={role}
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={description !== undefined ? descriptionId : undefined}
        tabIndex={-1}
        {...panelMotion}
        className={cn(
          'relative flex max-h-[92dvh] w-full flex-col overflow-hidden border border-border-strong bg-surface text-parchment outline-none',
          'rounded-t-3xl border-b-0 shadow-[0_-12px_40px_-8px_rgb(0_0_0/0.8)]',
          'sm:rounded-2xl sm:border-b sm:shadow-[0_30px_80px_-20px_rgb(0_0_0/0.9),0_0_0_1px_rgb(212_165_72/0.08)]',
          SIZES[size],
          className,
        )}
      >
        {/* Goldene Lichtkante + dezenter Schein von oben */}
        <span
          aria-hidden="true"
          className="pointer-events-none absolute inset-x-10 top-0 h-px bg-linear-to-r from-transparent via-gold/60 to-transparent"
        />
        <span
          aria-hidden="true"
          className="pointer-events-none absolute inset-x-0 top-0 h-24 bg-linear-to-b from-gold/[0.06] to-transparent"
        />
        {/* Griff des Bottom-Sheets (nur Handy, dekorativ) */}
        <span aria-hidden="true" className="mx-auto mt-2.5 h-1 w-10 shrink-0 rounded-full bg-border-strong sm:hidden" />

        <header className="relative flex shrink-0 items-start gap-3 px-5 pt-4 pb-3 sm:px-6 sm:pt-6">
          {icon !== undefined && (
            <div
              aria-hidden="true"
              className="grid size-10 shrink-0 place-items-center rounded-xl bg-gold/10 text-xl text-gold ring-1 ring-gold/25 ring-inset [&_svg]:size-5"
            >
              {icon}
            </div>
          )}
          <div className="min-w-0 flex-1 self-center">
            <h2 id={titleId} className="font-display text-xl leading-snug font-semibold tracking-wide text-parchment">
              {title}
            </h2>
            {description !== undefined && (
              <div id={descriptionId} className="mt-1 text-[0.9375rem] text-muted">
                {description}
              </div>
            )}
          </div>
          {!hideCloseButton && (
            <IconButton aria-label="Schließen" icon={<X />} size="sm" className="-mt-1 -mr-2" onClick={onClose} />
          )}
        </header>

        {children !== undefined && (
          <div className="relative min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 pb-5 sm:px-6 sm:pb-6">
            {children}
          </div>
        )}

        {footer !== undefined && (
          <footer
            className={cn(
              'relative flex shrink-0 flex-col-reverse gap-2 border-t border-border bg-bg-deep/40 px-5 pt-4',
              'pb-[max(1rem,env(safe-area-inset-bottom))] sm:flex-row sm:justify-end sm:px-6 sm:pb-4',
              '[&>*]:w-full sm:[&>*]:w-auto',
            )}
          >
            {footer}
          </footer>
        )}
        {footer === undefined && <div aria-hidden="true" className="shrink-0 pb-[env(safe-area-inset-bottom)] sm:pb-0" />}
      </motion.div>
    </div>
  )
}

export interface ConfirmDialogProps {
  open: boolean
  /** Abbrechen bzw. Schließen. */
  onClose: () => void
  /**
   * Bestätigen. Darf ein Promise liefern: Der Button zeigt dann einen Ladezustand, und der Dialog
   * schließt sich erst nach Erfolg. Bei einem Fehler bleibt er offen (Fehler selbst anzeigen, z. B. per Toast).
   */
  onConfirm: () => void | Promise<void>
  title: ReactNode
  message?: ReactNode
  confirmLabel?: string
  cancelLabel?: string
  /** Destruktive Aktion: roter Button, Fokus startet auf „Abbrechen“. */
  danger?: boolean
  icon?: ReactNode
}

/** Rückfrage vor einer Aktion („Quest wirklich löschen?“). */
export function ConfirmDialog({
  open,
  onClose,
  onConfirm,
  title,
  message,
  confirmLabel = 'Bestätigen',
  cancelLabel = 'Abbrechen',
  danger = false,
  icon,
}: ConfirmDialogProps) {
  const cancelRef = useRef<HTMLButtonElement>(null)
  const confirmRef = useRef<HTMLButtonElement>(null)
  const [busy, setBusy] = useState(false)
  // Im Ladezustand ist der Bestätigen-Button deaktiviert – Browser schieben den Fokus dann auf <body>.
  // Schlägt die Aktion fehl, bekommt er den Fokus zurück, sobald er wieder bedienbar ist.
  const refocusConfirm = useRef(false)

  useEffect(() => {
    if (busy || !refocusConfirm.current) return
    refocusConfirm.current = false
    const confirmButton = confirmRef.current
    const active = document.activeElement
    if (confirmButton?.isConnected && (active === null || active === document.body)) {
      confirmButton.focus({ preventScroll: true })
    }
  }, [busy])

  async function handleConfirm() {
    setBusy(true)
    try {
      await onConfirm()
      onClose()
    } catch (error) {
      refocusConfirm.current = true
      console.error('Questlog: Bestätigte Aktion fehlgeschlagen', error)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog
      open={open}
      onClose={busy ? () => {} : onClose}
      title={title}
      description={message}
      icon={icon}
      role="alertdialog"
      size="sm"
      initialFocusRef={danger ? cancelRef : confirmRef}
      closeOnOverlayClick={!busy}
      footer={
        <>
          <Button ref={cancelRef} variant="secondary" onClick={onClose} disabled={busy}>
            {cancelLabel}
          </Button>
          <Button ref={confirmRef} variant={danger ? 'danger' : 'primary'} onClick={handleConfirm} loading={busy}>
            {confirmLabel}
          </Button>
        </>
      }
    />
  )
}
