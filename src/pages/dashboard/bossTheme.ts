import type { CSSProperties } from 'react'

/**
 * Farbe der Wochen-Bosse (Phase 3a): ein tiefes, arkanes Violett – „Gegner“ auf einen Blick. Bewusst klar verschieden
 * vom ruhigen Karmesin der Helden-Lebenspunkte (`HP_COLOR`, OKLab ΔE ≈ 0,16), vom Disziplin-Violett (ΔE ≈ 0,17) und
 * vom Gold der Belohnungen. Nur für Balken, Rahmen und Leuchten – Schrift bleibt Pergament (als Text läge die Farbe
 * unter 4,5 : 1).
 */
export const BOSS_COLOR = '#9b3fb5'

/**
 * CSS-Variablen für die Boss-Karte: `--boss`, `--boss-10/20/35/50` (color-mix mit transparent). Auf einen Container
 * setzen und per Tailwind-Arbitrary-Werten nutzen, z. B. `border-(--boss-35)`.
 */
export function bossVars(color: string = BOSS_COLOR): CSSProperties {
  const mix = (percent: number) => `color-mix(in srgb, ${color} ${percent}%, transparent)`
  return {
    '--boss': color,
    '--boss-10': mix(10),
    '--boss-20': mix(20),
    '--boss-35': mix(35),
    '--boss-50': mix(50),
  } as CSSProperties
}
