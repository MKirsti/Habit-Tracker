import { useEffect, useRef } from 'react'
import { recordAchievementUnlocks } from '../data/repository'
import type { AchievementState, AchievementUnlock, DayKey } from '../domain/types'
import { useGameContext } from './gameContext'

/**
 * Wartezeit, bevor neu erreichte Erfolge gespeichert werden. Mehrere Änderungen kurz hintereinander (z. B. drei
 * Quests abhaken) werden so zu einem Schreibvorgang gebündelt.
 */
const ACHIEVEMENT_RECORD_DELAY_MS = 800

/**
 * Erfolge, die jetzt erreicht, aber noch nicht dauerhaft gespeichert sind – mit dem Tag, den die Engine für sie
 * meldet (für ungespeicherte: heute).
 */
function pendingAchievementUnlocks(
  achievements: readonly AchievementState[],
  stored: readonly AchievementUnlock[] | undefined,
  today: DayKey,
): AchievementUnlock[] {
  const storedIds = new Set((stored ?? []).map((unlock) => unlock.id))
  return achievements
    .filter((achievement) => achievement.unlocked && !storedIds.has(achievement.definition.id))
    .map((achievement) => ({ id: achievement.definition.id, day: achievement.unlockedDay ?? today }))
}

export interface AchievementRecorderProps {
  /** Wartezeit vor dem Speichern (nur für Tests anders als `ACHIEVEMENT_RECORD_DELAY_MS`). */
  delayMs?: number
}

/**
 * Macht erreichte Erfolge dauerhaft („einmal erreicht = für immer“): Die Engine meldet einen Erfolg als
 * freigeschaltet, sobald sein Ziel erreicht ist – sinkt der Wert später (gelöschte Quest, beendete Kampagne),
 * bliebe er sonst nicht freigeschaltet. Dieser Baustein speichert daher jeden erreichten, noch nicht gespeicherten
 * Erfolg per `recordAchievementUnlocks` (idempotent, überschreibt nie einen vorhandenen Tag).
 *
 * Still: keine Anzeige, keine Toasts (die Meldung „Neuer Erfolg“ kommt aus `GameFeedback`). Schutz vor
 * Schleifen und doppelten Schreibvorgängen:
 * - gebündelt nach `delayMs`, ausgelöst nur, wenn sich die Menge der offenen Erfolge ändert;
 * - jede ID wird höchstens einmal geschrieben, bis sie in den Live-Daten als gespeichert auftaucht – schlägt das
 *   Speichern fehl, wird sie in dieser Sitzung nicht erneut versucht (beim nächsten Start wieder);
 * - ohne Held (Onboarding, nach dem Zurücksetzen) passiert nichts.
 */
export function AchievementRecorder({ delayMs = ACHIEVEMENT_RECORD_DELAY_MS }: AchievementRecorderProps) {
  const { data, state, today } = useGameContext()
  const hasProfile = data.profile !== undefined
  const pending = hasProfile ? pendingAchievementUnlocks(state.achievements, data.achievementUnlocks, today) : []

  // IDs, die geschrieben werden bzw. wurden (oder deren Speichern fehlschlug), solange sie nicht gespeichert sind.
  const handled = useRef(new Set<string>())
  // Immer der aktuelle Stand – der verzögerte Schreibvorgang liest ihn erst beim Auslösen.
  const latest = useRef(pending)
  useEffect(() => {
    latest.current = pending
    // Gespeicherte IDs freigeben: Fehlt eine später wieder (z. B. nach dem Einspielen eines älteren Backups),
    // darf sie erneut gespeichert werden.
    const stored = new Set((data.achievementUnlocks ?? []).map((unlock) => unlock.id))
    for (const id of handled.current) if (stored.has(id)) handled.current.delete(id)
  })

  // Neu geplant wird nur, wenn sich die Menge der offenen Erfolge ändert (nicht bei jedem Rendern).
  const key = pending.map((unlock) => unlock.id).join('|')

  useEffect(() => {
    if (key === '') return
    const timer = window.setTimeout(() => {
      const fresh = latest.current.filter((unlock) => !handled.current.has(unlock.id))
      if (fresh.length === 0) return
      for (const unlock of fresh) handled.current.add(unlock.id)
      recordAchievementUnlocks(fresh).catch((error: unknown) => {
        // Kein Toast: Der Erfolg gilt weiterhin als freigeschaltet, solange sein Ziel erreicht ist.
        console.warn('Questlog: Erfolge konnten nicht gespeichert werden', error)
      })
    }, delayMs)
    return () => window.clearTimeout(timer)
  }, [key, delayMs])

  return null
}
