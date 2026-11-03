import { useMemo } from 'react'
import { setCompletionValue, toggleCompletion } from '../../data/repository'
import type { DayKey } from '../../domain/types'
import { useToast } from '../../ui'

export interface QuestActions {
  /** Abhaken bzw. Haken entfernen (messbar: auf Ziel auffüllen bzw. zurücksetzen). */
  toggle: (habitId: string) => Promise<boolean>
  /** Erfassten Wert setzen (≤ 0 löscht den Eintrag). */
  setValue: (habitId: string, value: number) => Promise<boolean>
}

/**
 * Schreibende Aktionen der Tagesübersicht für den gewählten Tag. Fehler aus dem Repository
 * (deutsche Meldungen) erscheinen als Fehler-Toast; das Ergebnis meldet, ob das Speichern klappte.
 * XP-Rückmeldungen kommen bewusst nicht von hier, sondern zentral aus `GameFeedback`.
 */
export function useQuestActions(day: DayKey): QuestActions {
  const { toast } = useToast()
  return useMemo(() => {
    async function run(write: () => Promise<void>): Promise<boolean> {
      try {
        await write()
        return true
      } catch (error) {
        toast({
          tone: 'error',
          title: 'Quest konnte nicht gespeichert werden',
          description: error instanceof Error ? error.message : 'Bitte versuche es noch einmal.',
        })
        return false
      }
    }
    return {
      toggle: (habitId) => run(() => toggleCompletion(habitId, day)),
      setValue: (habitId, value) => run(() => setCompletionValue(habitId, day, value)),
    }
  }, [day, toast])
}
