/**
 * Fokusziele der Tagesübersicht für die Lebenspunkte-Aktionen (Phase 2b): „Heute Ruhetag“, „Ruhetag aufheben“ und
 * „Verstanden“ entfernen jeweils den Knopf, der sie ausgelöst hat. Der Fokus springt dann auf das passende Gegenstück
 * statt auf <body> (gleiches Muster wie `pages/treasury/focus.ts`).
 */

/** DOM-ID von „Heute Ruhetag“ (Fußzeile der Tagesquest-Karte). */
export const REST_DAY_ACTION_ID = 'rest-day-action'

/** DOM-ID von „Ruhetag aufheben“ im Ruhetag-Banner. */
export const REST_DAY_UNDO_ID = 'rest-day-undo'

/** DOM-ID der Tagesbilanz (Ruhetag-Banner bzw. Fortschritt) – Ersatzziel, wenn keiner der Knöpfe da ist. */
export const DAY_SUMMARY_ID = 'day-summary'

const TABBABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]'

/**
 * Das erste per Tab erreichbare Element, das im Dokument NACH `element` (und nicht darin) steht – z. B. das nächste
 * Bedienelement unter einer Karte, die gleich verschwindet. Ohne versteckte (`hidden`, `inert`, `aria-hidden`) und
 * ohne Elemente mit negativem `tabIndex`.
 */
export function nextTabbableAfter(element: Element): HTMLElement | null {
  for (const candidate of element.ownerDocument.querySelectorAll<HTMLElement>(TABBABLE)) {
    if (element.contains(candidate)) continue
    if (!(element.compareDocumentPosition(candidate) & Node.DOCUMENT_POSITION_FOLLOWING)) continue
    if (candidate.tabIndex < 0) continue
    if (candidate.closest('[hidden], [inert], [aria-hidden="true"]') !== null) continue
    return candidate
  }
  return null
}
