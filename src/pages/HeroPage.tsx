import { Hourglass } from 'lucide-react'
import { EmptyState, PageHeader } from '../ui'

/** Platzhalter – die Charakter-Seite wird separat umgesetzt. */
export function HeroPage() {
  return (
    <>
      <PageHeader eyebrow="Charakter" title="Held" subtitle="Level, Attribute und deine bisherigen Taten." />
      <EmptyState
        icon={<Hourglass />}
        title="Kommt gleich…"
        text="Hier siehst du bald deinen Helden mit allen Attributen und Statistiken."
      />
    </>
  )
}
