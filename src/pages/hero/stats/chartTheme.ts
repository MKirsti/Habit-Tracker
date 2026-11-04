/**
 * Farben der Statistik-Diagramme – ausschließlich aus den Theme-Tokens (`src/index.css`) und den Attributfarben
 * (`ATTRIBUTES`), gemischt per `color-mix`. Keine freien Hex-Werte.
 *
 * Heatmap = sequentielle Skala in EINEM Farbton (Gold bzw. die Attributfarbe einer Quest): je mehr geschafft, desto
 * heller und satter. Die Stufen (Basis → 32 % → 55 % → 78 % → voll) sind in OKLab streng monoton heller
 * (ΔL ≥ 0,08 je Stufe für Gold, ≥ 0,07 für jede Attributfarbe) – geprüft in `chartTheme.test.ts`.
 */
import type { HeatLevel } from '../../../domain/statistics'

export const GOLD = 'var(--color-gold)'
export const GOLD_BRIGHT = 'var(--color-gold-bright)'
/** Gitterlinien und Achsen: eine Stufe über der Fläche, Haarlinie. */
export const GRID = 'var(--color-border)'
export const AXIS = 'var(--color-border-strong)'
/** Fläche hinter Markierungen – für den 2-px-Abstand und den Ring um Punkte. */
export const SURFACE = 'var(--color-surface)'

/** Zelle ohne Erledigung („nichts“) – neutrales Grau, sichtbar auf der Karte, ohne zu leuchten. */
export const HEAT_EMPTY = 'color-mix(in srgb, var(--color-parchment) 10%, var(--color-surface))'
/** Tag ohne Bedeutung (vor dem Abenteuer, Quest inaktiv, kein Plantag): kaum sichtbar. */
export const HEAT_FAINT = 'color-mix(in srgb, var(--color-parchment) 4%, var(--color-surface))'
/** Ring um Ruhetage. */
export const REST_RING = 'var(--color-muted)'
/** Ring um vom Streak-Schutz aufgefangene Tage (Eis). */
export const FREEZE_RING = 'var(--color-info)'
/** Ring um heute. */
export const TODAY_RING = 'var(--color-parchment)'

const MIX: Record<1 | 2 | 3, number> = { 1: 32, 2: 55, 3: 78 }

/**
 * Füllung einer Heatmap-Zelle in der Stufe `level` (0 = nichts … 4 = alles geschafft) im Farbton `accent`
 * (Standard Gold; volle Stufe dann im hellen Gold). Für Quests: die Attributfarbe als Hex.
 */
export function heatFill(level: HeatLevel, accent: string = GOLD): string {
  if (level === 0) return HEAT_EMPTY
  if (level === 4) return accent === GOLD ? GOLD_BRIGHT : accent
  return `color-mix(in srgb, ${accent} ${MIX[level]}%, ${HEAT_EMPTY})`
}

/** Leiste hinter einem Anteil (Erfüllungsquote): dieselbe Farbe, stark zurückgenommen. */
export function trackFill(accent: string): string {
  return `color-mix(in srgb, ${accent} 16%, var(--color-surface))`
}
