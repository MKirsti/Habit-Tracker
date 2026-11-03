import { createContext, useContext } from 'react'
import type { DayKey, GameData, GameState } from '../domain/types'

export interface GameContextValue {
  /** Alle gespeicherten Daten (live aus IndexedDB). */
  data: GameData
  /** Aktueller Spieltag (berücksichtigt den Tageswechsel). */
  today: DayKey
  /** Abgeleiteter Spielzustand (Level, Attribute, heutige Quests, Kampagnen …). */
  state: GameState
}

export const GameContext = createContext<GameContextValue | null>(null)

/** Zugriff auf Daten, heutigen Spieltag und Spielzustand. Nur innerhalb von `GameProvider` nutzbar. */
export function useGameContext(): GameContextValue {
  const value = useContext(GameContext)
  if (!value) throw new Error('useGameContext muss innerhalb von <GameProvider> verwendet werden.')
  return value
}
