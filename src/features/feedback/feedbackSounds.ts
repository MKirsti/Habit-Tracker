/**
 * Klang & Vibration der Rückmeldungen (Phase 3b): welcher Klang (`useGameSounds` aus `src/features/sound`) und welches
 * Vibrationsmuster zu welchem Moment gehört. Beides ist standardmäßig aus – ob es erklingt bzw. vibriert, entscheiden
 * die Einstellungen „Klänge“ und „Vibration“ im Sound-Modul; hier wird nur gewählt.
 *
 * - Abhaken / Haken entfernen (Dashboard), Boss-Treffer (Boss-Karte), Truhe gefunden bzw. geöffnet, Erfolg (auch ein
 *   abgeschlossenes Kapitel), Level-Up, Boss- und Endgegner-Sieg, Entwicklung des Gefährten.
 * - Je Änderung höchstens ein Klang aus den Meldungen (der wichtigste); große Szenen erklingen, wenn sie sichtbar werden
 *   (nacheinander statt alle auf einmal). Die Niederlage bleibt still.
 */
import { useCallback, useEffect, useRef } from 'react'
import { useGameSounds } from '../sound'
import type { Celebration } from './celebrations'
import type { FeedbackEvent } from './feedbackEvents'

/** Die Klänge des Sound-Moduls (`SoundName` in `src/features/sound`). */
export type FeedbackSound = 'check' | 'uncheck' | 'levelUp' | 'chest' | 'bossHit' | 'victory' | 'achievement' | 'evolve'

export interface FeedbackCue {
  sound: FeedbackSound
  /** Vibrationsmuster (ms) für `navigator.vibrate`. */
  vibration: number | number[]
}

/** Klang + Vibration je Moment – kurz und sanft; größere Momente vibrieren in einem kleinen Rhythmus. */
export const FEEDBACK_CUES = {
  check: { sound: 'check', vibration: 12 },
  uncheck: { sound: 'uncheck', vibration: 6 },
  // Kein eigenes Vibrieren: Jeder Treffer folgt direkt auf ein Abhaken, das schon vibriert (sonst summt es doppelt).
  bossHit: { sound: 'bossHit', vibration: 0 },
  chest: { sound: 'chest', vibration: [18, 50, 18] },
  achievement: { sound: 'achievement', vibration: [20, 60, 20] },
  levelUp: { sound: 'levelUp', vibration: [30, 70, 30, 70, 60] },
  victory: { sound: 'victory', vibration: [40, 60, 40, 60, 120] },
  evolve: { sound: 'evolve', vibration: [20, 50, 20, 50, 20, 50, 90] },
} as const satisfies Record<string, FeedbackCue>

/** Klang der sichtbar werdenden Szene (Niederlage: keiner – sie bleibt ruhig). */
export function sceneCue(kind: Celebration['kind']): FeedbackCue | undefined {
  switch (kind) {
    case 'level-up':
    case 'class':
      return FEEDBACK_CUES.levelUp
    case 'boss':
    case 'end-boss':
      return FEEDBACK_CUES.victory
    case 'campaign':
      return FEEDBACK_CUES.achievement
    case 'evolve':
      return FEEDBACK_CUES.evolve
    case 'defeat':
      return undefined
  }
}

/**
 * Der eine Klang zu den Meldungen einer Änderung: ein Erfolg oder ein abgeschlossenes Kapitel vor einer gefundenen
 * Truhe; XP, Perfekter Tag & Co. haben schon den Klang des Abhakens.
 */
export function toastCue(events: readonly FeedbackEvent[]): FeedbackCue | undefined {
  if (events.some((event) => event.type === 'achievement-unlocked' || event.type === 'chapter-completed')) {
    return FEEDBACK_CUES.achievement
  }
  if (events.some((event) => event.type === 'chest-found')) return FEEDBACK_CUES.chest
  return undefined
}

/**
 * Spielt einen Moment ab: Klang und Vibration (beides nur, wenn in den Einstellungen eingeschaltet). Die Funktion
 * bleibt über alle Renderings dieselbe (sie greift über eine Ref auf das aktuelle Sound-Modul zu) – so lösen ihre
 * Nutzer in Effekt-Abhängigkeiten nichts zusätzlich aus.
 */
export function useFeedbackCue(): (cue: FeedbackCue | undefined) => void {
  const sounds = useGameSounds()
  const latest = useRef(sounds)
  useEffect(() => {
    latest.current = sounds
  })
  return useCallback((cue: FeedbackCue | undefined) => {
    if (cue === undefined) return
    const { play, vibrate } = latest.current
    // Klang und Vibration sind Zugabe: Was immer der Browser dazu meint, die Rückmeldung selbst läuft weiter.
    try {
      play(cue.sound)
    } catch {
      // still
    }
    try {
      vibrate(cue.vibration)
    } catch {
      // still
    }
  }, [])
}
