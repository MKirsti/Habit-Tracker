import { useCallback, useSyncExternalStore } from 'react'

function canMatch(): boolean {
  return typeof window !== 'undefined' && typeof window.matchMedia === 'function'
}

/**
 * Reagiert auf eine CSS-Media-Query, z. B. `useMediaQuery('(min-width: 768px)')`.
 * Ohne `matchMedia` (Tests, SSR) liefert der Hook `false`.
 */
export function useMediaQuery(query: string): boolean {
  const subscribe = useCallback(
    (onChange: () => void) => {
      if (!canMatch()) return () => {}
      const list = window.matchMedia(query)
      list.addEventListener('change', onChange)
      return () => list.removeEventListener('change', onChange)
    },
    [query],
  )
  return useSyncExternalStore(
    subscribe,
    () => canMatch() && window.matchMedia(query).matches,
    () => false,
  )
}
