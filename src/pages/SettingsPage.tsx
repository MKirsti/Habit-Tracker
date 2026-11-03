import { Hourglass } from 'lucide-react'
import { EmptyState, PageHeader } from '../ui'

/** Platzhalter – die Einstellungen werden separat umgesetzt. */
export function SettingsPage() {
  return (
    <>
      <PageHeader eyebrow="Optionen" title="Einstellungen" subtitle="Tageswechsel, Effekte und Datensicherung." />
      <EmptyState
        icon={<Hourglass />}
        title="Kommt gleich…"
        text="Hier kannst du bald die App anpassen und deine Daten sichern."
      />
    </>
  )
}
