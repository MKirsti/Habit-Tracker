/**
 * Vibration (Phase 3b) über `navigator.vibrate` – auf Android-Handys; iPhones und die meisten Desktop-Browser kennen es
 * nicht (dann passiert einfach nichts). Muster werden sanft gehalten: höchstens `MAX_PATTERN_STEPS` Schritte zu je
 * höchstens `MAX_STEP_MS` ms, damit kein Fehler im Aufrufer je zu einem langen Brummen wird.
 */

/** Vibrationsmuster: eine Dauer (ms) oder abwechselnd Vibrieren/Pause (ms). */
export type VibrationPattern = number | readonly number[]

export const MAX_PATTERN_STEPS = 10
export const MAX_STEP_MS = 400

function clampStep(step: number): number {
  return Number.isFinite(step) ? Math.min(MAX_STEP_MS, Math.max(0, Math.round(step))) : 0
}

/** Bereinigtes Muster (nicht negativ, ganzzahlig, gedeckelt); `undefined`, wenn nichts zu vibrieren bleibt. */
export function gentlePattern(pattern: VibrationPattern): number | number[] | undefined {
  if (typeof pattern === 'number') {
    const step = clampStep(pattern)
    return step > 0 ? step : undefined
  }
  const steps = pattern.slice(0, MAX_PATTERN_STEPS).map(clampStep)
  return steps.some((step, index) => index % 2 === 0 && step > 0) ? steps : undefined
}

/** Kann dieses Gerät vibrieren? */
export function canVibrate(): boolean {
  try {
    return typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function'
  } catch {
    return false
  }
}

/**
 * Vibriert (wenn das Gerät es kann und die Seite sichtbar ist). Liefert, ob der Browser es angenommen hat; wirft nie –
 * auch nicht, wenn der Browser ohne vorheriges Tippen ablehnt.
 */
export function vibrateDevice(pattern: VibrationPattern): boolean {
  try {
    if (!canVibrate()) return false
    if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return false
    const gentle = gentlePattern(pattern)
    if (gentle === undefined) return false
    return navigator.vibrate(gentle) === true
  } catch {
    return false
  }
}
