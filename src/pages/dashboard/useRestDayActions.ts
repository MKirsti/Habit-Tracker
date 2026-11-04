import { useMemo } from 'react'
import { addRestPeriod, deleteRestPeriod } from '../../data/repository'
import { addDays } from '../../domain/dates'
import type { DayKey } from '../../domain/types'
import { useToast } from '../../ui'

export interface RestDayActions {
  /** Heute als Ruhetag anlegen (heute bis heute). Wirft nach dem Fehler-Toast – eine Rückfrage bleibt dann offen. */
  takeRestDay: () => Promise<void>
  /**
   * Gestern nachträglich als Ruhetag anlegen (gestern bis gestern, z. B. ein Krankheitstag) – erlaubt, solange gestern
   * noch nicht abgerechnet ist (Gnadenfrist). Wirft nach dem Fehler-Toast – eine Rückfrage bleibt dann offen.
   */
  takeRestYesterday: () => Promise<void>
  /** Einen Ruhetag wieder aufheben. Fehler erscheinen als Toast; `false`, wenn es nicht geklappt hat. */
  undoRestDay: (periodId: string) => Promise<boolean>
}

/** Schreibende Aktionen für „Heute Ruhetag“ und „Gestern als Ruhetag“ auf der Tagesübersicht – deutsche Fehler als Toast. */
export function useRestDayActions(today: DayKey): RestDayActions {
  const { toast } = useToast()
  return useMemo(() => {
    function fail(title: string, error: unknown) {
      toast({
        tone: 'error',
        title,
        description: error instanceof Error ? error.message : 'Bitte versuche es noch einmal.',
      })
    }
    return {
      takeRestDay: async () => {
        try {
          await addRestPeriod({ from: today, until: today }, today)
        } catch (error) {
          fail('Ruhetag konnte nicht eingelegt werden', error)
          throw error
        }
      },
      takeRestYesterday: async () => {
        const yesterday = addDays(today, -1)
        try {
          await addRestPeriod({ from: yesterday, until: yesterday }, today)
        } catch (error) {
          fail('Ruhetag konnte nicht eingetragen werden', error)
          throw error
        }
        toast({
          tone: 'success',
          icon: '⛺',
          title: 'Gestern war Ruhetag',
          description: 'Deine Serien bleiben, deine Lebenspunkte sind unberührt. Gute Besserung, falls du krank warst!',
        })
      },
      undoRestDay: async (periodId) => {
        try {
          await deleteRestPeriod(periodId, today)
          return true
        } catch (error) {
          fail('Ruhetag konnte nicht aufgehoben werden', error)
          return false
        }
      },
    }
  }, [today, toast])
}
