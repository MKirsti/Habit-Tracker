import { useCallback, useContext, useEffect, useState } from 'react'
import { GameContext } from '../../app/gameContext'
import { cn, useMediaQuery } from '../../ui'
import { BURST_LIFETIME_MS, EMBER, MAX_BURSTS, sparksFor } from './hitParticles'
import type { Burst } from './hitParticles'

export interface HitParticlesProps {
  /**
   * Wechselt die Zahl (z. B. ein Zähler der Treffer), sprühen Funken. Der Wert beim Einhängen und 0 sprühen nichts –
   * so funkt es weder beim Laden der Seite noch beim Zurücksetzen.
   */
  trigger: number
  /** Farbe der Funken (CSS-Farbe, z. B. die Attributfarbe); goldene und helle Funken mischen sich dazu. */
  color: string
  /** Stärkerer Treffer (z. B. Schwachstelle): mehr Funken, die weiter fliegen, und ein Ring. */
  strong?: boolean
  /** Anzahl der Funken (Standard 10, stark 16). */
  count?: number
  /** Flugweite in px (Standard 38, stark 50 – Funken verlassen so auch ein 64-px-Boss-Symbol sichtbar). */
  distance?: number
  /** Position/Ebene; Standard: Mitte des nächsten positionierten Vorfahren. */
  className?: string
}

/**
 * Treffer-Funken (Phase 3b): Bei jedem neuen `trigger` sprüht ein kleiner Schwall Funken aus der Mitte des Eltern-
 * Elements (es muss positioniert sein, z. B. `relative`) – in der Farbe des Treffers, gemischt mit Gold, dazu ein
 * kurzes Aufblitzen; ein starker Treffer zusätzlich mit Ring. Rein dekorativ (`aria-hidden`), fängt keine Klicks und
 * verschiebt nichts (absolut positioniert, ohne eigene Größe).
 *
 * Nur mit der Einstellung „Effekte“ und ohne „Bewegung reduzieren“ – sonst erscheint nichts (auch ein laufender Schwall
 * verschwindet sofort). Animiert per CSS (`hit-spark`, `hit-flash`, `hit-ring` in `src/index.css`): läuft auf dem
 * Compositor, auch wenn die Seite gerade rechnet.
 *
 * ```tsx
 * <div className="relative">
 *   <HitParticles trigger={hitCount} color={ATTRIBUTES[attack.attribute].color} strong={attack.weakness} />
 *   …
 * </div>
 * ```
 */
export function HitParticles({ trigger, color, strong = false, count, distance, className }: HitParticlesProps) {
  const game = useContext(GameContext)
  const reducedMotion = useMediaQuery('(prefers-reduced-motion: reduce)')
  const active = (game?.data.settings.effects ?? true) && !reducedMotion

  const [seen, setSeen] = useState({ trigger, serial: 0 })
  const [bursts, setBursts] = useState<Burst[]>([])

  // Neuer Treffer → neuer Schwall (im Rendern abgeleitet, wie React es für „Zustand aus Props“ empfiehlt).
  if (trigger !== seen.trigger) {
    const serial = seen.serial + 1
    setSeen({ trigger, serial })
    if (active && trigger !== 0) {
      setBursts((current) => [...current.slice(-(MAX_BURSTS - 1)), { id: serial, seed: trigger + serial * 0.618, strong }])
    }
  }
  // Effekte aus oder reduzierte Bewegung: laufende Schwälle verschwinden (und tauchen später nicht wieder auf).
  if (!active && bursts.length > 0) setBursts([])

  const finish = useCallback((id: number) => {
    setBursts((current) => current.filter((burst) => burst.id !== id))
  }, [])

  if (!active || bursts.length === 0) return null
  return (
    <span
      aria-hidden="true"
      data-hit-particles={bursts.length}
      className={cn('pointer-events-none absolute top-1/2 left-1/2 z-20 size-0', className)}
    >
      {bursts.map((burst) => (
        <HitBurst
          key={burst.id}
          burst={burst}
          color={color}
          count={count ?? (burst.strong ? 16 : 10)}
          distance={distance ?? (burst.strong ? 50 : 38)}
          onDone={finish}
        />
      ))}
    </span>
  )
}

function HitBurst({
  burst,
  color,
  count,
  distance,
  onDone,
}: {
  burst: Burst
  color: string
  count: number
  distance: number
  onDone: (id: number) => void
}) {
  // Farbe und Bahnen stehen beim Einsetzen fest – ein Farbwechsel mitten im Flug malt nichts um.
  const [sparks] = useState(() => sparksFor(burst, color, Math.max(0, Math.round(count)), Math.max(8, distance)))
  const [tint] = useState(color)

  useEffect(() => {
    const timer = setTimeout(() => onDone(burst.id), BURST_LIFETIME_MS)
    return () => clearTimeout(timer)
  }, [burst.id, onDone])

  const flash = Math.round(distance * 0.75)
  return (
    <span data-hit-burst={burst.id} data-strong={burst.strong ? '' : undefined}>
      <span
        className="absolute top-0 left-0 block rounded-full"
        style={{
          width: flash,
          height: flash,
          background: `radial-gradient(circle, ${EMBER} 0%, ${tint} 38%, transparent 70%)`,
          animation: 'hit-flash 260ms ease-out both',
        }}
      />
      {burst.strong && (
        <span
          className="absolute top-0 left-0 block rounded-full"
          style={{
            width: distance * 2,
            height: distance * 2,
            border: `2px solid ${tint}`,
            boxShadow: `0 0 10px ${tint}, inset 0 0 8px ${tint}`,
            animation: 'hit-ring 460ms cubic-bezier(0.2, 0.8, 0.3, 1) both',
          }}
        />
      )}
      {sparks.map((spark) => (
        <span key={spark.key} data-spark="" className="absolute top-0 left-0 block" style={spark.style} />
      ))}
    </span>
  )
}
