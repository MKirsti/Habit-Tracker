import { useState } from 'react'
import { useGameContext } from '../../app/gameContext'
import { updateSettings } from '../../data/repository'
import type { Settings } from '../../domain/types'
import { useToast } from '../../ui'
import { errorMessage } from './errorMessage'

/**
 * Einstellung mit sofortiger Anzeige: Der gewählte Wert erscheint direkt, bis die Datenbank
 * (Live-Query) ihn bestätigt. Schlägt das Speichern fehl, springt die Anzeige zurück und ein Toast erscheint.
 */
export function useSetting<K extends keyof Settings>(key: K): [Settings[K], (value: Settings[K]) => Promise<void>] {
  const { data } = useGameContext()
  const { toast } = useToast()
  const stored = data.settings[key]
  // `from` = gespeicherter Wert beim Ändern. Sobald sich der gespeicherte Wert ändert, gilt wieder er.
  const [pending, setPending] = useState<{ value: Settings[K]; from: Settings[K] } | null>(null)
  // Die Vormerkung ist mit der ersten Änderung des gespeicherten Werts erledigt und wird verworfen –
  // sonst würde sie wieder auftauchen, sobald der Wert von außen (z. B. durch ein wiederhergestelltes
  // Backup) auf den alten Stand zurückspringt, und die Anzeige zeigte etwas anderes als gespeichert ist.
  if (pending !== null && pending.from !== stored) setPending(null)
  const shown = pending !== null && pending.from === stored ? pending.value : stored

  async function change(value: Settings[K]) {
    const next = { value, from: stored }
    setPending(next)
    try {
      await updateSettings({ [key]: value } as Partial<Settings>)
    } catch (error) {
      // Nur die eigene Vormerkung zurücknehmen – eine inzwischen neuere Auswahl bleibt stehen.
      setPending((current) => (current === next ? null : current))
      toast({ tone: 'error', title: 'Einstellung nicht gespeichert', description: errorMessage(error) })
    }
  }

  return [shown, change]
}
