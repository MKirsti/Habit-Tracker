import { Hourglass } from 'lucide-react'
import { EmptyState, PageHeader } from '../ui'

/** Platzhalter – die Tagesübersicht wird separat umgesetzt. */
export function DashboardPage() {
  return (
    <>
      <PageHeader eyebrow="Tagesübersicht" title="Heute" subtitle="Deine Quests für den heutigen Tag." />
      <EmptyState
        icon={<Hourglass />}
        title="Kommt gleich…"
        text="Hier erscheinen bald deine heutigen Quests, dein Fortschritt und deine Kampagne."
      />
    </>
  )
}
