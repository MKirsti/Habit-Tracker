import { MoonStar, Sparkles } from 'lucide-react'
import { useState } from 'react'
import { useGameContext } from '../../app/gameContext'
import { updateSettings } from '../../data/repository'
import { formatDay } from '../../domain/dates'
import type { Settings } from '../../domain/types'
import { Card, Select, Switch, useToast } from '../../ui'
import type { SelectOption } from '../../ui'
import { errorMessage } from './errorMessage'
import { dayStartLabel } from './settingsText'

const HOUR_OPTIONS: SelectOption<number>[] = Array.from({ length: 13 }, (_, hour) => ({
  value: hour,
  label: dayStartLabel(hour),
}))

/**
 * Einstellung mit sofortiger Anzeige: Der gewählte Wert erscheint direkt, bis die Datenbank
 * (Live-Query) ihn bestätigt. Schlägt das Speichern fehl, springt die Anzeige zurück und ein Toast erscheint.
 */
function useSetting<K extends keyof Settings>(key: K): [Settings[K], (value: Settings[K]) => Promise<void>] {
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

/** Tageswechsel: Ab welcher Uhrzeit ein neuer Spieltag beginnt. */
export function DayStartCard() {
  const { today } = useGameContext()
  const [hour, setHour] = useSetting('dayStartHour')
  return (
    <Card title="Tageswechsel" titleAs="h3" icon={<MoonStar />} className="h-full">
      <Select
        label="Ein neuer Tag beginnt um"
        value={hour}
        options={HOUR_OPTIONS}
        onChange={(value) => void setHour(value)}
        hint="Bis dahin zählt die Nacht noch zum Vortag – ideal, wenn du nach Mitternacht noch Quests abhakst."
      />
      <p className="mt-4 rounded-xl border border-border bg-black/20 px-3.5 py-2.5 text-sm text-muted" aria-live="polite">
        Aktueller Spieltag: <span className="font-medium text-parchment">{formatDay(today)}</span>
      </p>
    </Card>
  )
}

/** Effekte & Animationen an/aus. */
export function EffectsCard() {
  const [effects, setEffects] = useSetting('effects')
  return (
    <Card title="Effekte & Animationen" titleAs="h3" icon={<Sparkles />} className="h-full">
      <Switch
        checked={effects}
        onChange={(value) => void setEffects(value)}
        label="Effekte anzeigen"
        description="Level-Up-Szene, Konfetti und schimmernde Balken. Ausgeschaltet bleibt alles ruhig."
      />
      <p className="mt-3 text-[0.8125rem] text-muted">
        Hast du auf deinem Gerät „Bewegung reduzieren“ aktiviert, wird das immer beachtet.
      </p>
    </Card>
  )
}
