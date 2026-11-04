import { useEffect, useRef } from 'react'
import type { RefObject } from 'react'
// Die Modal-Hilfen (Dialog-Stapel, Scroll-Sperre, Fokusfalle) teilen sich die Szenen mit `Dialog`, damit Esc/Tab auch
// bei einem darunter offenen Dialog nur die oberste Ebene betreffen.
import { isTopModal, lockBodyScroll, makeAppInert, pushModal, trapTabKey } from '../../ui/modal'

/**
 * Modal-Verhalten der großen Szenen (Feier-Szenen, Truhen-Dialog) – wie `Dialog`: in den Modal-Stapel eintragen, Seite
 * sperren und für Screenreader verbergen, Fokus auf `initialFocusRef`, Esc schließt (`onClose`; `canClose` false →
 * Esc wird ignoriert, z. B. während eine Truhe aufgeht), Tab bleibt im Panel, Fokus kehrt danach zurück – ist das
 * vorher fokussierte Element inzwischen verschwunden (z. B. „Truhe öffnen“ nach dem Öffnen), auf `returnFocus()`.
 * Aktiv, solange die Komponente eingehängt ist.
 */
export function useModalScene(
  panelRef: RefObject<HTMLElement | null>,
  initialFocusRef: RefObject<HTMLElement | null>,
  onClose: () => void,
  canClose: () => boolean = () => true,
  returnFocus?: () => HTMLElement | null,
): void {
  const onCloseRef = useRef(onClose)
  const canCloseRef = useRef(canClose)
  const returnFocusRef = useRef(returnFocus)
  useEffect(() => {
    onCloseRef.current = onClose
    canCloseRef.current = canClose
    returnFocusRef.current = returnFocus
  })

  useEffect(() => {
    const previouslyFocused = document.activeElement instanceof HTMLElement ? document.activeElement : null
    const token = Symbol('scene')
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
        if (canCloseRef.current()) onCloseRef.current()
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
      const target = previouslyFocused?.isConnected ? previouslyFocused : returnFocusRef.current?.()
      target?.focus({ preventScroll: true })
    }
  }, [panelRef, initialFocusRef])
}

/** Ist gerade nichts Sinnvolles fokussiert (der fokussierte Knopf ist verschwunden)? */
export function focusIsLost(): boolean {
  const active = document.activeElement
  return active === null || active === document.body || !active.isConnected
}
