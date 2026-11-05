/**
 * Gefährte (Phase 3b): Stufen-Bezeichnungen und der „Stufen-Glanz“ – gemeinsam für das kleine Abzeichen im
 * Helden-Kopf (Dashboard) und die Entwicklungs-Szene. Rein (ohne React).
 *
 * Je höher die Stufe, desto wärmer und heller leuchtet der Ring: Jungtier kaum, Gefährte bernsteinfarben, Erwachsen
 * golden, Legendär strahlend (dort schimmert er bei vollen Effekten sanft). Nur für Ringe und Leuchten – Schrift bleibt
 * Pergament bzw. Gold.
 */
import { companionStageName } from '../../domain/companion'
import type { CompanionState } from '../../domain/types'
import { formatNumber } from '../../ui/format'

/** Bezeichnungen der vier Stufen (0–3), wie in `CompanionState.stage` beschrieben. */
export const COMPANION_STAGE_LABELS = ['Jungtier', 'Gefährte', 'Erwachsen', 'Legendär'] as const

/** Höchste Stufe (0-basiert). */
export const TOP_COMPANION_STAGE = COMPANION_STAGE_LABELS.length - 1

/** Stufe begrenzt auf 0–3 (Unsinn → 0). */
export function clampStage(stage: number): number {
  if (!Number.isFinite(stage)) return 0
  return Math.max(0, Math.min(TOP_COMPANION_STAGE, Math.floor(stage)))
}

/** „Erwachsen“ – Bezeichnung der Stufe. */
export function stageLabel(stage: number): string {
  return COMPANION_STAGE_LABELS[clampStage(stage)]
}

/** „Stufe 3 von 4 · Erwachsen“. */
export function stageLine(stage: number): string {
  const n = clampStage(stage)
  return `Stufe ${formatNumber(n + 1)} von ${formatNumber(COMPANION_STAGE_LABELS.length)} · ${COMPANION_STAGE_LABELS[n]}`
}

export interface CompanionGlow {
  /** Farbe des Rings und des Leuchtens (Hex). */
  color: string
  /** Deckkraft des Leuchtens (0–1). */
  glow: number
  /** Ring-Stärke in px. */
  ring: number
  /** Legendär: Ring schimmert (nur mit Effekten). */
  shimmer: boolean
}

/** Stufen-Glanz: Jungtier kaum, Gefährte Bernstein, Erwachsen Gold, Legendär strahlend. */
export const COMPANION_GLOWS: readonly CompanionGlow[] = [
  { color: '#a8977a', glow: 0.15, ring: 1, shimmer: false },
  { color: '#e3a76f', glow: 0.35, ring: 1.5, shimmer: false },
  { color: '#f0c96a', glow: 0.55, ring: 2, shimmer: false },
  { color: '#fff1c4', glow: 0.8, ring: 2, shimmer: true },
]

export function companionGlow(stage: number): CompanionGlow {
  return COMPANION_GLOWS[clampStage(stage)]
}

/** CSS für Ring und Leuchten eines Gefährten-Medaillons in der Farbe seiner Stufe. */
export function companionGlowStyle(stage: number, sleeping = false): { boxShadow: string; borderColor: string } {
  const glow = companionGlow(stage)
  const strength = sleeping ? glow.glow * 0.35 : glow.glow
  const mix = (percent: number) => `color-mix(in srgb, ${glow.color} ${Math.round(percent)}%, transparent)`
  return {
    borderColor: mix(sleeping ? 35 : 70),
    boxShadow: `0 0 0 ${glow.ring}px ${mix(sleeping ? 20 : 45)}, 0 0 ${Math.round(6 + strength * 16)}px ${mix(strength * 100)}`,
  }
}

/** Name der aktuellen Stufe des Gefährten („Silbermaske“). */
export function currentStageName(companion: Pick<CompanionState, 'definition' | 'stage'>): string {
  return companionStageName(companion.definition, companion.stage)
}
