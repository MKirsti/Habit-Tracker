import { useMemo } from 'react'
import { completeSideQuest, reopenSideQuest } from '../../data/repository'
import type { DayKey } from '../../domain/types'
import { useToast } from '../../ui'
import { errorMessage } from './errors'

export interface SideQuestActions {
  /** Heute erledigen (`done = true`) bzw. wieder öffnen. Meldet, ob das Speichern klappte. */
  setDone: (questId: string, done: boolean) => Promise<boolean>
}

/**
 * Abhaken und Wiedereröffnen von Nebenquests – immer für den heutigen Spieltag. Fehler aus dem Repository
 * (deutsche Meldungen) erscheinen als Fehler-Toast. XP-Rückmeldungen kommen zentral aus `GameFeedback`.
 */
export function useSideQuestActions(today: DayKey): SideQuestActions {
  const { toast } = useToast()
  return useMemo(
    () => ({
      async setDone(questId, done) {
        try {
          if (done) await completeSideQuest(questId, today)
          else await reopenSideQuest(questId)
          return true
        } catch (error) {
          toast({ tone: 'error', title: 'Nebenquest konnte nicht gespeichert werden', description: errorMessage(error) })
          return false
        }
      },
    }),
    [today, toast],
  )
}
