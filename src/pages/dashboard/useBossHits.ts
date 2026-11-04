import { useCallback, useEffect, useState } from 'react'
import type { AttackEvent, WeeklyBossState } from '../../domain/types'
import { bossSnapshot, newBossHits } from './combatText'

/** Ein sichtbarer Treffer der Treffer-Anzeige. */
export interface BossHit {
  /** Eindeutig für die Anzeige (derselbe Angriff kann nach Ab- und wieder Anhaken erneut treffen). */
  id: string
  attack: AttackEvent
}

/** So lange steht ein Treffer an der Boss-Karte, bevor er verschwindet. */
export const HIT_DURATION_MS = 1600

/**
 * Treffer gegen den Wochen-Boss, die durch Abhaken gerade dazugekommen sind (`newBossHits`: nicht beim ersten Laden,
 * nicht beim Wochenwechsel, nicht gegen einen schon besiegten Boss, nicht bei Massenänderungen). Verglichen wird
 * während des Renderns mit dem vorigen Stand (wie das „+XP“ der Quest-Zeile) – so erscheint der Treffer im selben
 * Bild wie der gesunkene Lebensbalken. `dismiss` entfernt einen Treffer (die Anzeige ruft es nach
 * `HIT_DURATION_MS`).
 */
export function useBossHits(boss: WeeklyBossState | undefined) {
  const [previous, setPrevious] = useState(boss)
  const [hits, setHits] = useState<BossHit[]>([])
  const [serial, setSerial] = useState(0)

  if (boss !== previous) {
    setPrevious(boss)
    const fresh = newBossHits(bossSnapshot(previous), boss)
    if (previous?.weekStart !== boss?.weekStart) setHits([])
    if (fresh.length > 0) {
      setHits((current) => [
        ...current,
        ...fresh.map((attack, index) => ({ id: `${serial + index}`, attack })),
      ])
      setSerial(serial + fresh.length)
    }
  }

  const dismiss = useCallback((id: string) => {
    setHits((current) => current.filter((hit) => hit.id !== id))
  }, [])

  return { hits, dismiss }
}

/**
 * Ist das Element (z. B. der Lebensbalken des Bosses) gerade gut sichtbar? Ohne Element: ja. Berücksichtigt grob die Kopfleiste und die
 * untere Navigation auf dem Handy. Ohne `IntersectionObserver` (Tests): immer sichtbar.
 */
export function useOnScreen(element: Element | null): boolean {
  const [onScreen, setOnScreen] = useState(true)
  useEffect(() => {
    if (element === null || typeof IntersectionObserver === 'undefined') return
    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries[entries.length - 1]
        if (entry) setOnScreen(entry.isIntersecting)
      },
      { rootMargin: '-48px 0px -88px 0px', threshold: 0.5 },
    )
    observer.observe(element)
    return () => {
      observer.disconnect()
      setOnScreen(true)
    }
  }, [element])
  return onScreen
}
