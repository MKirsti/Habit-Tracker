/**
 * Klänge & Vibration in den Einstellungen (Phase 3b) – rein (ohne React), einzeln testbar.
 */
import type { SoundName } from '../../features/sound'

/** „Probe hören“ spielt die Klänge der Reihe nach vor – vom leisen Abhaken bis zur Entwicklung des Gefährten. */
export const SOUND_SAMPLES: readonly { sound: SoundName; label: string }[] = [
  { sound: 'check', label: 'Quest abgehakt' },
  { sound: 'bossHit', label: 'Boss-Treffer' },
  { sound: 'chest', label: 'Truhe' },
  { sound: 'achievement', label: 'Erfolg' },
  { sound: 'levelUp', label: 'Level-Up' },
  { sound: 'victory', label: 'Sieg' },
  { sound: 'evolve', label: 'Gefährte wächst' },
]

/** Nächster Klang der Probe (im Kreis). */
export function nextSample(index: number): number {
  return (Math.max(0, Math.floor(index)) + 1) % SOUND_SAMPLES.length
}

/** Kurzes Summen zur Bestätigung, wenn die Vibration eingeschaltet wird. */
export const VIBRATION_CONFIRM_PATTERN = [18, 40, 18] as const
