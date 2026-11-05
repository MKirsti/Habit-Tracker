import { motion } from 'motion/react'
import { cn, useMediaQuery } from '../../ui'

export interface ParticleBurstProps {
  /** Wechselt der Schlüssel, sprüht ein neuer Schwall (z. B. die ID eines Treffers). */
  burstKey: string | number
  /** Anzahl der Funken. */
  count?: number
  /** Farben der Funken (reihum). */
  colors: readonly string[]
  /** Wie weit die Funken fliegen (px). */
  distance?: number
  /** Größe eines Funkens (px). */
  size?: number
  /** Dauer (s). */
  duration?: number
  /** Verzögerung (s). */
  delay?: number
  /** Punkte oder kleine vierzackige Sterne. */
  shape?: 'dot' | 'star'
  className?: string
}

/** Kleine, feste „Zufalls“-Abweichung je Funke (deterministisch – gleiche Bilder in Tests und Screenshots). */
function jitter(index: number, salt: number): number {
  const x = Math.sin((index + 1) * 12.9898 + salt * 78.233) * 43_758.5453
  return x - Math.floor(x)
}

/**
 * Funken, die aus der Mitte des Eltern-Elements (relativ positioniert) nach außen sprühen und verglühen – Glanz beim
 * Boss-Treffer und in der Level-Up-Szene (Phase 3b). Rein dekorativ (`aria-hidden`), fängt keine Klicks. Bei reduzierter
 * Bewegung erscheint nichts; ob Effekte an sind, entscheidet der Aufrufer (nur dann einhängen).
 */
export function ParticleBurst({
  burstKey,
  count = 10,
  colors,
  distance = 44,
  size = 5,
  duration = 0.7,
  delay = 0,
  shape = 'dot',
  className,
}: ParticleBurstProps) {
  const reducedMotion = useMediaQuery('(prefers-reduced-motion: reduce)')
  if (reducedMotion || count <= 0 || colors.length === 0) return null
  return (
    <span
      aria-hidden="true"
      data-particles={count}
      className={cn('pointer-events-none absolute top-1/2 left-1/2 z-20 size-0', className)}
    >
      {Array.from({ length: count }, (_, index) => {
        const angle = (index / count) * Math.PI * 2 + (jitter(index, 1) - 0.5) * 0.6
        const reach = distance * (0.65 + jitter(index, 2) * 0.55)
        const scale = 0.7 + jitter(index, 3) * 0.6
        const color = colors[index % colors.length]
        const x = Math.round(Math.cos(angle) * reach * 10) / 10
        const y = Math.round(Math.sin(angle) * reach * 10) / 10
        return (
          <motion.span
            // Neuer Schlüssel je Schwall: Die Funken setzen neu ein (gleiche Bahnen, frische Animation).
            key={`${burstKey}:${index}`}
            className={cn('absolute block', shape === 'dot' && 'rounded-full')}
            style={{
              width: size,
              height: size,
              left: -size / 2,
              top: -size / 2,
              background: color,
              boxShadow: `0 0 ${size * 1.6}px ${color}`,
              clipPath:
                shape === 'star'
                  ? 'polygon(50% 0%, 61% 39%, 100% 50%, 61% 61%, 50% 100%, 39% 61%, 0% 50%, 39% 39%)'
                  : undefined,
            }}
            initial={{ x: 0, y: 0, opacity: 0, scale: 0.4 }}
            // Alle Werte mit gleich vielen Schlüsselbildern – `times` gilt für jede Eigenschaft.
            animate={{
              x: [0, x * 0.55, x * 0.9, x],
              y: [0, y * 0.55, y * 0.9, y],
              opacity: [0, 1, 1, 0],
              scale: [0.4, scale * 1.2, scale, 0.2],
            }}
            transition={{ duration: duration * (0.8 + jitter(index, 4) * 0.4), delay, ease: 'easeOut', times: [0, 0.15, 0.6, 1] }}
          />
        )
      })}
    </span>
  )
}
