/**
 * React-Hooks für den Zugriff auf Spieldaten und den aktuellen Spieltag.
 */
import { useLiveQuery } from 'dexie-react-hooks'
import { useLayoutEffect, useMemo, useState } from 'react'
import { DEFAULT_SETTINGS } from '../domain/balancing'
import { toDayKey } from '../domain/dates'
import { deriveGameState } from '../domain/engine'
import type { DayKey, GameData, GameState } from '../domain/types'
import { loadGameData } from './repository'

/** Wie oft (ms) geprüft wird, ob ein neuer Spieltag begonnen hat. */
const DAY_CHECK_INTERVAL_MS = 30_000

/**
 * Alle gespeicherten Daten, live aktualisiert bei jeder Änderung in der Datenbank
 * (auch aus anderen Tabs). `undefined`, solange noch geladen wird.
 */
export function useGameData(): GameData | undefined {
  return useLiveQuery(() => loadGameData())
}

/**
 * Der aktuelle Spieltag unter Berücksichtigung des Tageswechsels (`dayStartHour`).
 * Aktualisiert sich von selbst, wenn ein neuer Spieltag beginnt: per Intervall, beim
 * Zurückkehren in den Tab/die App (`visibilitychange`, `focus`) und sofort, wenn sich
 * `dayStartHour` ändert.
 */
export function useToday(dayStartHour: number): DayKey {
  const [today, setToday] = useState(() => toDayKey(new Date(), dayStartHour))

  // Layout-Effekt statt normalem Effekt: Ändert sich `dayStartHour`, wird der neue Tag noch vor dem
  // Zeichnen übernommen – es blitzt nie ein veralteter Tag auf.
  useLayoutEffect(() => {
    // Gleicher String → React bricht das Update ab, es wird nicht neu gerendert.
    const update = () => setToday(toDayKey(new Date(), dayStartHour))
    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') update()
    }

    update()
    const timer = window.setInterval(update, DAY_CHECK_INTERVAL_MS)
    document.addEventListener('visibilitychange', onVisibilityChange)
    window.addEventListener('focus', update)
    return () => {
      window.clearInterval(timer)
      document.removeEventListener('visibilitychange', onVisibilityChange)
      window.removeEventListener('focus', update)
    }
  }, [dayStartHour])

  return today
}

/**
 * Alles, was eine Seite braucht: Daten, heutiger Spieltag und der daraus abgeleitete
 * Spielzustand (memoisiert). `undefined`, solange die Daten noch geladen werden.
 */
export function useGame(): { data: GameData; today: DayKey; state: GameState } | undefined {
  const data = useGameData()
  const today = useToday(data?.settings.dayStartHour ?? DEFAULT_SETTINGS.dayStartHour)
  return useMemo(() => (data ? { data, today, state: deriveGameState(data, today) } : undefined), [data, today])
}
