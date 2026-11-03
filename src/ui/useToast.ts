import { useContext } from 'react'
import { ToastContext } from './toastContext'
import type { ToastApi } from './toastContext'

/** Ersatz ohne Provider (z. B. in isolierten Komponententests): tut nichts. */
const NOOP_TOASTS: ToastApi = {
  toast: () => '',
  dismiss: () => {},
}

/**
 * Zugriff auf das Toast-System: `const { toast } = useToast()` →
 * `toast({ title: '+20 XP', description: '10 Seiten lesen', tone: 'xp' })`.
 *
 * Außerhalb eines `ToastProvider` liefert der Hook eine wirkungslose API (damit Seiten auch
 * isoliert gerendert werden können); in der App ist der Provider in `App.tsx` gesetzt.
 */
export function useToast(): ToastApi {
  return useContext(ToastContext) ?? NOOP_TOASTS
}
