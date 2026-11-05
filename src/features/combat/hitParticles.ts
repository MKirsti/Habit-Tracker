/**
 * Treffer-Funken (Phase 3b) – reine Rechnung zu `HitParticles.tsx`: Bahnen, Farben und Größen der Funken eines Schwalls.
 * Deterministisch (gleiche Bilder in Tests und Screenshots), ohne React.
 */
import type { CSSProperties } from 'react'

/** Gold und ein heller Kern – die Funken bleiben auch auf dunklem Violett und neben jeder Attributfarbe sichtbar. */
export const GOLD = 'var(--color-gold-bright)'
export const EMBER = '#fff1cf'
/** Höchstens so viele Schwälle gleichzeitig (sehr schnelles Abhaken). */
export const MAX_BURSTS = 3
export const BASE_DURATION_MS = 560
export const MAX_DELAY_MS = 45

export interface Burst {
  id: number
  /** Würfel-Salz: aufeinanderfolgende Schwälle sehen verschieden aus. */
  seed: number
  strong: boolean
}

export interface Spark {
  key: number
  style: CSSProperties
}

/** Feste „Zufalls“-Abweichung je Funke und Schwall (deterministisch – gleiche Bilder in Tests und Screenshots). */
function jitter(index: number, salt: number, seed: number): number {
  const x = Math.sin((index + 1) * 12.9898 + salt * 78.233 + seed * 37.719) * 43_758.5453
  return x - Math.floor(x)
}

function round(value: number): number {
  return Math.round(value * 10) / 10
}

/** Die Funken eines Schwalls: in alle Richtungen (leicht nach oben gekippt), mal Punkt, mal Strich, mal golden. */
export function sparksFor(burst: Burst, color: string, count: number, distance: number): Spark[] {
  return Array.from({ length: count }, (_, index) => {
    const angle = (index / count) * Math.PI * 2 + (jitter(index, 1, burst.seed) - 0.5) * 0.7
    const reach = distance * (0.7 + jitter(index, 2, burst.seed) * 0.5)
    // Leicht nach oben: Funken springen vom Treffer weg und fallen dann etwas (Schwerkraft).
    const x = round(Math.cos(angle) * reach)
    const y = round(Math.sin(angle) * reach * 0.9 - distance * 0.12)
    const fall = round(4 + jitter(index, 3, burst.seed) * distance * 0.25)
    const roll = jitter(index, 4, burst.seed)
    const tone = roll < 0.55 ? color : roll < 0.88 ? GOLD : EMBER
    const streak = index % 3 !== 0
    const size = round(streak ? 2 + jitter(index, 5, burst.seed) : 3 + jitter(index, 5, burst.seed) * 2.5)
    const duration = Math.round(BASE_DURATION_MS * (0.8 + jitter(index, 6, burst.seed) * 0.45))
    const delay = Math.round(jitter(index, 7, burst.seed) * MAX_DELAY_MS)
    return {
      key: index,
      style: {
        width: size,
        height: streak ? round(size * 3.4) : size,
        background: tone,
        boxShadow: `0 0 ${round(size * 2.2)}px ${tone}`,
        borderRadius: 9999,
        '--spark-x': `${x}px`,
        '--spark-y': `${y}px`,
        '--spark-fall': `${fall}px`,
        // Striche zeigen in Flugrichtung.
        '--spark-rot': `${streak ? Math.round((angle * 180) / Math.PI - 90) : 0}deg`,
        animation: `hit-spark ${duration}ms ${delay}ms both`,
      } as CSSProperties,
    }
  })
}

/** Längste Lebensdauer eines Schwalls (ms) – danach wird er abgeräumt. */
export const BURST_LIFETIME_MS = Math.ceil(BASE_DURATION_MS * 1.25) + MAX_DELAY_MS + 80
