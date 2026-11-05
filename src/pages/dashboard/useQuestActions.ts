import { useMemo } from 'react'
import { setCompletionValue, toggleCompletion } from '../../data/repository'
import { reachesTarget } from '../../domain/schedule'
import type { DayKey, HabitStatus } from '../../domain/types'
import { FEEDBACK_CUES, useFeedbackCue } from '../../features/feedback/feedbackSounds'
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
 *
 * Phase 3b: Abhaken und Haken entfernen klingen bzw. vibrieren sofort beim Tippen (nur wenn in den Einstellungen
 * eingeschaltet) – dafür kennt der Hook den Stand der Quests des Tages (`statuses`). Messbare Quests klingen, wenn ein
 * neuer Wert das Ziel erreicht bzw. wieder darunter fällt; Teilfortschritt bleibt still.
 */
export function useQuestActions(day: DayKey, statuses?: readonly HabitStatus[]): QuestActions {
  const { toast } = useToast()
  const cue = useFeedbackCue()
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
    const statusOf = (habitId: string) => statuses?.find((status) => status.habit.id === habitId)
    return {
      toggle: (habitId) => {
        const status = statusOf(habitId)
        if (status !== undefined) cue(status.done ? FEEDBACK_CUES.uncheck : FEEDBACK_CUES.check)
        return run(() => toggleCompletion(habitId, day))
      },
      setValue: (habitId, value) => {
        const status = statusOf(habitId)
        if (status !== undefined) {
          const done = value > 0 && reachesTarget(value, status.target)
          if (done && !status.done) cue(FEEDBACK_CUES.check)
          else if (!done && status.done) cue(FEEDBACK_CUES.uncheck)
        }
        return run(() => setCompletionValue(habitId, day, value))
      },
    }
  }, [day, toast, cue, statuses])
}
