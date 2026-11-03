/**
 * Hilfen für modale Ebenen (Dialoge): Stapel offener Dialoge, Scroll-Sperre, Fokusfalle.
 * Mehrere Dialoge können verschachtelt offen sein – nur der oberste reagiert auf Esc/Tab.
 */

const openModals: symbol[] = []

/** Registriert einen geöffneten Dialog; die Rückgabe entfernt ihn wieder. */
export function pushModal(token: symbol): () => void {
  openModals.push(token)
  return () => {
    const index = openModals.lastIndexOf(token)
    if (index !== -1) openModals.splice(index, 1)
  }
}

export function isTopModal(token: symbol): boolean {
  return openModals[openModals.length - 1] === token
}

let scrollLocks = 0
let savedBodyStyle: { overflow: string; paddingRight: string } | null = null

/**
 * Sperrt das Scrollen der Seite (mit Zähler für verschachtelte Dialoge). Gleicht die Breite der
 * wegfallenden Scrollleiste auf dem Desktop aus, damit nichts springt.
 */
export function lockBodyScroll(): () => void {
  const body = document.body
  if (scrollLocks === 0) {
    const scrollbarWidth = window.innerWidth - document.documentElement.clientWidth
    savedBodyStyle = { overflow: body.style.overflow, paddingRight: body.style.paddingRight }
    body.style.overflow = 'hidden'
    if (scrollbarWidth > 0) body.style.paddingRight = `${scrollbarWidth}px`
  }
  scrollLocks++

  let released = false
  return () => {
    if (released) return
    released = true
    scrollLocks--
    if (scrollLocks === 0 && savedBodyStyle) {
      body.style.overflow = savedBodyStyle.overflow
      body.style.paddingRight = savedBodyStyle.paddingRight
      savedBodyStyle = null
    }
  }
}

let inertLocks = 0

/**
 * Macht den App-Inhalt (#root) für Maus, Tastatur und Screenreader unerreichbar, solange ein Dialog
 * offen ist. Dialoge und Toasts werden per Portal direkt in <body> gerendert und bleiben bedienbar.
 */
export function makeAppInert(): () => void {
  const root = document.getElementById('root')
  if (!root) return () => {}
  if (inertLocks === 0) root.inert = true
  inertLocks++

  let released = false
  return () => {
    if (released) return
    released = true
    inertLocks--
    if (inertLocks === 0) root.inert = false
  }
}

const FOCUSABLE = [
  'a[href]',
  'area[href]',
  'button:not([disabled])',
  'input:not([disabled]):not([type="hidden"])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  'iframe',
  'audio[controls]',
  'video[controls]',
  '[contenteditable]:not([contenteditable="false"])',
  '[tabindex]:not([tabindex="-1"])',
].join(',')

/** Alle per Tab erreichbaren Elemente innerhalb von `container` (in DOM-Reihenfolge). */
export function getFocusable(container: HTMLElement): HTMLElement[] {
  return Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
    (element) => element.tabIndex >= 0 && !element.closest('[inert]') && !element.hidden,
  )
}

/** Hält den Tab-Fokus innerhalb von `container` (Umlauf am Anfang/Ende). */
export function trapTabKey(event: KeyboardEvent, container: HTMLElement): void {
  const focusable = getFocusable(container)
  if (focusable.length === 0) {
    event.preventDefault()
    container.focus()
    return
  }
  const first = focusable[0]
  const last = focusable[focusable.length - 1]
  const active = document.activeElement
  const outside = !(active instanceof Node) || !container.contains(active)

  if (event.shiftKey) {
    if (outside || active === first || active === container) {
      event.preventDefault()
      last.focus()
    }
  } else if (outside || active === last) {
    event.preventDefault()
    first.focus()
  }
}
