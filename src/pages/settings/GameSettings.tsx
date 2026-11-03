import { CalendarClock, MoonStar, Sparkles } from 'lucide-react'
import { useState } from 'react'
import { useGameContext } from '../../app/gameContext'
import { updateSettings } from '../../data/repository'
import { compareDays, formatDay, toDayKey } from '../../domain/dates'
import type { Completion, DayKey, Settings } from '../../domain/types'
import { Card, ConfirmDialog, Select, Switch, useToast } from '../../ui'
import type { SelectOption } from '../../ui'
import { errorMessage } from './errorMessage'
import { dayStartBackText, dayStartLabel } from './settingsText'

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

/** Frühester Spieltag nach `day`, für den schon etwas erfasst ist – oder `undefined`. */
function firstRecordedDayAfter(completions: readonly Completion[], day: DayKey): DayKey | undefined {
  let first: DayKey | undefined
  for (const completion of completions) {
    if (compareDays(completion.day, day) > 0 && (first === undefined || compareDays(completion.day, first) < 0)) {
      first = completion.day
    }
  }
  return first
}

/**
 * Tageswechsel: Ab welcher Uhrzeit ein neuer Spieltag beginnt.
 * Springt der Spieltag durch die neue Uhrzeit zurück (nachts: Mitternacht → 4 Uhr) und ist für den
 * bisherigen Spieltag schon etwas erfasst, fragt eine Rückfrage nach – diese Erledigungen und ihre XP
 * zählen sonst ohne Erklärung erst ab der neuen Uhrzeit wieder (verloren geht nichts).
 */
export function DayStartCard() {
  const { data, today } = useGameContext()
  const [hour, setHour] = useSetting('dayStartHour')
  // Inhalt und Sichtbarkeit getrennt: Beim Ausblenden bleibt der Text stehen.
  const [confirm, setConfirm] = useState<{ hour: number; title: string; message: string } | null>(null)
  const [confirmOpen, setConfirmOpen] = useState(false)

  function choose(value: number) {
    const newToday = toDayKey(new Date(), value)
    const laterDay = compareDays(newToday, today) < 0 ? firstRecordedDayAfter(data.completions, newToday) : undefined
    if (laterDay === undefined) {
      void setHour(value)
      return
    }
    setConfirm({ hour: value, ...dayStartBackText(value, newToday, laterDay) })
    setConfirmOpen(true)
  }

  return (
    <Card title="Tageswechsel" titleAs="h3" icon={<MoonStar />} className="h-full">
      <Select
        label="Ein neuer Tag beginnt um"
        value={hour}
        options={HOUR_OPTIONS}
        onChange={choose}
        hint="Bis dahin zählt die Nacht noch zum Vortag – ideal, wenn du nach Mitternacht noch Quests abhakst."
      />
      <p className="mt-4 rounded-xl border border-border bg-black/20 px-3.5 py-2.5 text-sm text-muted" aria-live="polite">
        Aktueller Spieltag: <span className="font-medium text-parchment">{formatDay(today)}</span>
      </p>
      <ConfirmDialog
        open={confirmOpen && confirm !== null}
        onClose={() => setConfirmOpen(false)}
        onConfirm={async () => {
          if (confirm) await setHour(confirm.hour)
        }}
        icon={<CalendarClock />}
        title={confirm?.title ?? ''}
        message={confirm?.message}
        confirmLabel="Trotzdem umstellen"
      />
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
        description="Konfetti, Lichtstrahlen und schimmernde Balken. Ausgeschaltet erscheinen Level-Ups und Kampagnen-Siege weiterhin – schlicht, ohne Bewegung."
      />
      <p className="mt-3 text-[0.8125rem] text-muted">
        Hast du auf deinem Gerät „Bewegung reduzieren“ aktiviert, wird das immer beachtet.
      </p>
    </Card>
  )
}
