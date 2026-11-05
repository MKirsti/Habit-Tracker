/**
 * Klang & Vibration (Phase 3b) – öffentlicher Einstieg. Siehe `useGameSounds` (Hook für Seiten und Features),
 * `sounds.ts` (Rezepte), `engine.ts` (Web Audio) und `haptics.ts` (`navigator.vibrate`).
 */
export { useGameSounds } from './useGameSounds'
export type { GameSounds } from './useGameSounds'
export { SOUND_NAMES, isSoundName } from './sounds'
export type { SoundName } from './sounds'
export { canVibrate, vibrateDevice } from './haptics'
export type { VibrationPattern } from './haptics'
export { MASTER_VOLUME, canPlaySound } from './engine'
