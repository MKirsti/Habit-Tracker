import { useEffect, useRef } from 'react'
import { recordProgress } from '../data/repository'
import type { ProgressRecord } from '../data/repository'
import { useGameContext } from './gameContext'
import { achievementKey, chestKey, pendingKeys, pendingProgress, storedKeys, victoryKey } from './pendingProgress'
import type { PendingProgress } from './pendingProgress'

/**
 * Wartezeit, bevor neuer Fortschritt gespeichert wird. Mehrere Änderungen kurz hintereinander (z. B. drei Quests
 * abhaken) werden so zu einem Schreibvorgang gebündelt – und eine sofort wieder abgehakte Quest-Truhe wird gar nicht
 * erst gespeichert.
 */
const PROGRESS_RECORD_DELAY_MS = 800

export interface ProgressRecorderProps {
  /** Wartezeit vor dem Speichern (nur für Tests anders als `PROGRESS_RECORD_DELAY_MS`). */
  delayMs?: number
}

/**
 * Macht erreichten Fortschritt dauerhaft („einmal erreicht = für immer“) – Nachfolger des `AchievementRecorder`
 * (Phase 3a):
 * - **Erfolge:** Die Engine meldet einen Erfolg als freigeschaltet, sobald sein Ziel erreicht ist – sinkt der Wert
 *   später (gelöschte Quest, beendete Kampagne), bliebe er sonst nicht freigeschaltet.
 * - **Boss-Siege:** Ein besiegter Wochen-Boss (laufende Woche oder – beim Nachtragen am Montag – die Vorwoche) bleibt
 *   besiegt, auch wenn später eine Quest abgehakt wird oder Ruhetage seine Lebenspunkte ändern.
 * - **Truhen:** Neu gefundene Truhen behalten ihren beim Fund festgelegten Inhalt und bleiben, auch wenn die Quest
 *   wieder abgehakt wird.
 * Gespeichert wird alles zusammen per `recordProgress` (eine Transaktion, idempotent, überschreibt nie Vorhandenes).
 *
 * Still: keine Anzeige, keine Toasts (Meldungen wie „Neuer Erfolg“, Siegesszene und „Truhe gefunden“ kommen aus
 * `GameFeedback` – das Speichern ändert am abgeleiteten Zustand nichts). Schutz vor Schleifen und Doppeltem:
 * - gebündelt nach `delayMs`, neu geplant nur, wenn sich die Menge des offenen Fortschritts ändert (nicht bei jedem
 *   Rendern); geschrieben wird der Stand beim Auslösen (eine inzwischen wieder verschwundene Truhe also nicht);
 * - jeder Eintrag wird höchstens einmal geschrieben, bis er in den Live-Daten als gespeichert auftaucht – schlägt das
 *   Speichern fehl, wird er in dieser Sitzung nicht erneut versucht (beim nächsten Start wieder);
 * - ohne Held (Onboarding, nach dem Zurücksetzen) passiert nichts.
 */
export function ProgressRecorder({ delayMs = PROGRESS_RECORD_DELAY_MS }: ProgressRecorderProps) {
  const { data, state, today } = useGameContext()
  const pending = pendingProgress(data, state, today)

  // Schlüssel, die geschrieben werden bzw. wurden (oder deren Speichern fehlschlug), solange sie nicht gespeichert sind.
  const handled = useRef(new Set<string>())
  // Immer der aktuelle Stand – der verzögerte Schreibvorgang liest ihn erst beim Auslösen.
  const latest = useRef(pending)
  useEffect(() => {
    latest.current = pending
    // Gespeichertes freigeben: Fehlt es später wieder (z. B. nach dem Einspielen eines älteren Backups), darf es
    // erneut gespeichert werden.
    const stored = storedKeys(data)
    for (const key of handled.current) if (stored.has(key)) handled.current.delete(key)
  })

  // Neu geplant wird nur, wenn sich die Menge des offenen Fortschritts ändert.
  const key = pendingKeys(pending).join('|')

  useEffect(() => {
    if (key === '') return
    const timer = window.setTimeout(() => {
      const current = latest.current
      const fresh: PendingProgress = {
        achievementUnlocks: current.achievementUnlocks.filter((unlock) => !handled.current.has(achievementKey(unlock.id))),
        bossVictories: current.bossVictories.filter((victory) => !handled.current.has(victoryKey(victory.weekStart))),
        chests: current.chests.filter((chest) => !handled.current.has(chestKey(chest.id))),
      }
      const keys = pendingKeys(fresh)
      if (keys.length === 0) return
      for (const handledKey of keys) handled.current.add(handledKey)
      recordProgress(withoutEmpty(fresh)).catch((error: unknown) => {
        // Kein Toast: Erfolge, Siege und Truhen gelten weiter, solange der Spielzustand sie meldet.
        console.warn('Questlog: Fortschritt konnte nicht gespeichert werden', error)
      })
    }, delayMs)
    return () => window.clearTimeout(timer)
  }, [key, delayMs])

  return null
}

/** Nur die Listen, die etwas enthalten (ein Erfolge-Aufruf bleibt so genau das, was früher gespeichert wurde). */
function withoutEmpty(record: PendingProgress): ProgressRecord {
  const result: ProgressRecord = {}
  if (record.achievementUnlocks.length > 0) result.achievementUnlocks = record.achievementUnlocks
  if (record.bossVictories.length > 0) result.bossVictories = record.bossVictories
  if (record.chests.length > 0) result.chests = record.chests
  return result
}
