import { useContext, useEffect, useMemo } from 'react'
import { GameContext } from '../../app/gameContext'
import { soundEngine } from './engine'
import { vibrateDevice } from './haptics'
import type { VibrationPattern } from './haptics'
import type { SoundName } from './sounds'

export interface GameSounds {
  /** Spielt einen Klang – nur bei eingeschalteter Einstellung „Klänge“ (`settings.sound`). Wirft nie. */
  play(name: SoundName): void
  /** Vibriert – nur bei eingeschalteter Einstellung „Vibration“ (`settings.haptics`) und wenn das Gerät es kann. Wirft nie. */
  vibrate(pattern: VibrationPattern): void
}

const SILENT: GameSounds = {
  play() {},
  vibrate() {},
}

/**
 * Klang & Vibration (Phase 3b): `{ play, vibrate }`, beides standardmäßig aus und nur wirksam, wenn die jeweilige
 * Einstellung eingeschaltet ist. Die Einstellungen kommen aus dem Spielkontext (`GameContext`, wie bei
 * `useGameContext`); außerhalb des `GameProvider` bleibt alles still, statt zu werfen.
 *
 * Solange Klänge eingeschaltet sind, weckt das erste Tippen/Klicken den Ton (Browser erlauben ihn erst nach einer Geste)
 * – so können auch Klänge erklingen, die erst nach dem Speichern ausgelöst werden (Level-Up, Truhe). Schaltet man sie
 * aus, schläft der Ton wieder. „Bewegung reduzieren“ betrifft nur das Sichtbare, nicht den Klang.
 *
 * Das zurückgegebene Objekt bleibt gleich, solange sich die beiden Einstellungen nicht ändern (für Effekt-Abhängigkeiten).
 */
export function useGameSounds(): GameSounds {
  const game = useContext(GameContext)
  const sound = game?.data.settings.sound === true
  const haptics = game?.data.settings.haptics === true

  useEffect(() => {
    if (!sound) return
    return soundEngine().retain()
  }, [sound])

  return useMemo(() => {
    if (!sound && !haptics) return SILENT
    return {
      play(name: SoundName) {
        if (sound) soundEngine().play(name)
      },
      vibrate(pattern: VibrationPattern) {
        if (haptics) vibrateDevice(pattern)
      },
    }
  }, [sound, haptics])
}
