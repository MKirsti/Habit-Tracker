/**
 * Fokus in der Schatzkammer nachziehen: Viele Aktionen entfernen das Element, das sie ausgelöst hat (eine
 * übernommene Idee, die ausgeblendete Karte, „Einlösen“ einer einmaligen Belohnung, die rückgängig gemachte
 * Einlösung …). Der Dialog gibt den Fokus dann ins Leere zurück, er fiele auf <body> – Tastatur- und
 * Screenreader-Nutzer verlören ihren Platz. Gleiches Muster wie bei Quests und Nebenquests (QuestsPage).
 */
import { useCallback, useEffect, useRef } from 'react'

/** DOM-ID des Bearbeiten-Knopfs einer Belohnungskarte (Fokusziel). */
export function rewardEditButtonId(rewardId: string): string {
  return `reward-edit-${rewardId}`
}

/** DOM-ID des Einlösen-Knopfs einer Belohnungskarte. */
export function rewardRedeemButtonId(rewardId: string): string {
  return `reward-redeem-${rewardId}`
}

/** DOM-ID des Kaufen-Knopfs eines Gegenstands (Phase 2b). */
export function itemBuyButtonId(itemId: string): string {
  return `item-buy-${itemId}`
}

/** DOM-ID des Vorrats- bzw. HP-Felds eines Gegenstands – Fokusziel, wenn „Kaufen“ nach dem Kauf gesperrt ist. */
export function itemStatusId(itemId: string): string {
  return `item-status-${itemId}`
}

/** DOM-ID des Rückgängig-Knopfs einer Einlösung in der Chronik. */
export function purchaseUndoButtonId(purchaseId: string): string {
  return `purchase-undo-${purchaseId}`
}

/**
 * Liegt der Fokus „im Leeren“? Auf <body>, auf einem entfernten oder (inzwischen) deaktivierten Knopf oder noch
 * im ausblendenden Dialog.
 */
export function focusIsLost(): boolean {
  const active = document.activeElement
  if (active === null || active === document.body || !active.isConnected) return true
  if (active instanceof HTMLButtonElement && active.disabled) return true
  return active.closest('[role="dialog"], [role="alertdialog"]') !== null
}

/** Ein bedienbares Element per ID – deaktivierte zählen nicht. */
export function enabledElementById(id: string): HTMLElement | null {
  const element = document.getElementById(id)
  if (element === null) return null
  if (element instanceof HTMLButtonElement && element.disabled) return null
  return element
}

export interface FocusRequest<T> {
  /**
   * Fokusziel, sobald `snapshot` (die Live-Daten) die Änderung zeigt. `undefined` = noch nicht (nach dem nächsten
   * Rendern erneut fragen), `null` = kein Ziel (Anfrage verwerfen).
   */
  resolve: (snapshot: T) => HTMLElement | null | undefined
  /** Auch fokussieren, wenn der Fokus nicht verloren ist – z. B. die neue Karte nach dem Anlegen. */
  force?: boolean
}

/**
 * Merkt ein Fokusziel vor (`request`) und setzt es nach dem Rendern, sobald es bereitsteht und kein eigener Dialog
 * mehr offen ist (`blocked`). Ohne `force` nur, wenn der Fokus verloren ist – nie jemandem wegnehmen, der schon
 * weitergetabbt ist. Das Ziel wird dabei in die Mitte gescrollt (auf dem Handy liegt unten die Navigationsleiste).
 */
export function usePendingFocus<T>(snapshot: T, blocked: boolean): (request: FocusRequest<T> | null) => void {
  const pending = useRef<FocusRequest<T> | null>(null)

  useEffect(() => {
    const request = pending.current
    if (request === null || blocked) return
    const target = request.resolve(snapshot)
    if (target === undefined) return
    pending.current = null
    if (target === null || (request.force !== true && !focusIsLost())) return
    // jsdom kennt scrollIntoView nicht.
    ;(target.closest('li') ?? target).scrollIntoView?.({ block: 'center' })
    target.focus({ preventScroll: true })
  })

  return useCallback((request: FocusRequest<T> | null) => {
    pending.current = request
  }, [])
}
