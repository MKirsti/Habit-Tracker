import type { ReactNode } from 'react'
import { useGame } from '../data/hooks'
import { LoadingState } from '../ui/Spinner'
import { GameContext } from './gameContext'

/**
 * Lädt die Spieldaten genau einmal für die ganze App und berechnet den Spielzustand.
 * Bis die Daten da sind, wird ein Ladezustand gezeigt – Kinder können sich also darauf verlassen,
 * dass `useGameContext()` immer Daten liefert.
 */
export function GameProvider({ children }: { children: ReactNode }) {
  const game = useGame()
  if (!game) return <LoadingState label="Dein Abenteuer wird geladen …" className="min-h-dvh" />
  return <GameContext.Provider value={game}>{children}</GameContext.Provider>
}
