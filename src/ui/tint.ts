import type { CSSProperties } from 'react'

/**
 * Inline-Stil für eine frei gewählte Akzentfarbe (z. B. die Farbe eines Attributs):
 * Text in der Farbe, Hintergrund und Rahmen als transparente Abstufungen davon.
 */
export function tintStyle(color: string, backgroundPercent = 13, borderPercent = 40): CSSProperties {
  return {
    color,
    backgroundColor: `color-mix(in srgb, ${color} ${backgroundPercent}%, transparent)`,
    borderColor: `color-mix(in srgb, ${color} ${borderPercent}%, transparent)`,
  }
}
