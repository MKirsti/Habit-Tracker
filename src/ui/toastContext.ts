import { createContext } from 'react'
import type { ReactNode } from 'react'

/** xp = Belohnung (golden), success = geschafft, info = Hinweis, error = Fehler. */
export type ToastTone = 'xp' | 'success' | 'info' | 'error'

export interface ToastOptions {
  title: string
  description?: string
  /** Standard: 'info'. */
  tone?: ToastTone
  /** Eigenes Icon/Emoji statt des Standard-Icons der Tonalität. */
  icon?: ReactNode
  /** Anzeigedauer in ms. `Infinity` = bleibt, bis geschlossen. Standard je nach Tonalität. */
  duration?: number
}

export interface ToastApi {
  /** Zeigt eine Benachrichtigung und liefert ihre ID. */
  toast: (options: ToastOptions) => string
  dismiss: (id: string) => void
}

export interface ToastRecord extends ToastOptions {
  id: string
  tone: ToastTone
}

/** Standard-Anzeigedauer je Tonalität (ms). */
export const TOAST_DURATIONS: Record<ToastTone, number> = {
  xp: 3500,
  success: 4000,
  info: 4500,
  error: 7000,
}

export const ToastContext = createContext<ToastApi | null>(null)
