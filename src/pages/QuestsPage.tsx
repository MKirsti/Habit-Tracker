import { Hourglass } from 'lucide-react'
import { EmptyState, PageHeader } from '../ui'

/** Platzhalter – die Quest-Verwaltung wird separat umgesetzt. */
export function QuestsPage() {
  return (
    <>
      <PageHeader eyebrow="Gewohnheiten" title="Quests" subtitle="Lege fest, welche Quests du regelmäßig bestreitest." />
      <EmptyState
        icon={<Hourglass />}
        title="Kommt gleich…"
        text="Hier kannst du bald Quests anlegen, bearbeiten und archivieren."
      />
    </>
  )
}
