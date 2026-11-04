import type { DayKey } from '../domain/types'

/**
 * Warteschlange für die Abrechnung: höchstens ein Schreibvorgang gleichzeitig. Kommen während eines laufenden
 * Vorgangs weitere Anfragen (Tageswechsel und Rückkehr in die App fallen oft zusammen), folgt danach genau **ein**
 * weiterer – mit dem zuletzt angefragten Spieltag. Rein (ohne React), damit einzeln testbar.
 */
export interface SettleQueue {
  /** Abrechnung bis `today` anfragen (läuft sofort oder direkt nach dem laufenden Vorgang). */
  request(today: DayKey): void
  /**
   * Angehalten werden Anfragen ignoriert und Angefragtes verworfen; ein laufender Vorgang darf zu Ende laufen.
   * (Beim Unmounten anhalten, beim erneuten Mounten – z. B. im StrictMode – wieder freigeben.)
   */
  setPaused(paused: boolean): void
}

export function createSettleQueue(
  settle: (today: DayKey) => Promise<unknown>,
  onError: (error: unknown) => void,
): SettleQueue {
  let running = false
  let paused = false
  let queued: DayKey | undefined

  function run(today: DayKey) {
    running = true
    let promise: Promise<unknown>
    try {
      promise = settle(today)
    } catch (error) {
      promise = Promise.reject(error)
    }
    promise
      .catch(onError)
      .finally(() => {
        running = false
        const next = queued
        queued = undefined
        if (next !== undefined && !paused) run(next)
      })
  }

  return {
    request(today) {
      if (paused) return
      if (running) {
        queued = today
        return
      }
      run(today)
    },
    setPaused(value) {
      paused = value
      if (value) queued = undefined
    },
  }
}
