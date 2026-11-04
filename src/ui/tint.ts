import type { CSSProperties } from 'react'

/**
 * Anteil der Akzentfarbe in getönter Schrift (Rest: Pergament). Reines Stärke-Rot oder Intelligenz-Blau läge auf
 * einer 12–13 % getönten Fläche – erst recht auf einer schon getönten Karte – unter 4.5:1; leicht aufgehellt bleiben
 * alle Attributfarben lesbar (geprüft in src/ui/theme.test.ts). Dieselbe Mischung nutzt `--accent-text` der
 * Kampagnenfarben (`src/features/campaignTheme`).
 */
export const TINT_TEXT_PERCENT = 80

/** Schrift in einer Akzentfarbe, leicht mit Pergament aufgehellt (siehe `TINT_TEXT_PERCENT`). */
export function tintTextColor(color: string): string {
  return `color-mix(in srgb, ${color} ${TINT_TEXT_PERCENT}%, var(--color-parchment))`
}

/**
 * Inline-Stil für eine frei gewählte Akzentfarbe (z. B. die Farbe eines Attributs):
 * Text in der (leicht aufgehellten) Farbe, Hintergrund und Rahmen als transparente Abstufungen davon.
 */
export function tintStyle(color: string, backgroundPercent = 13, borderPercent = 40): CSSProperties {
  return {
    color: tintTextColor(color),
    backgroundColor: `color-mix(in srgb, ${color} ${backgroundPercent}%, transparent)`,
    borderColor: `color-mix(in srgb, ${color} ${borderPercent}%, transparent)`,
  }
}
