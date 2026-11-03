import { Hourglass } from 'lucide-react'
import { EmptyState, PageHeader } from '../ui'

/** Platzhalter – die Kampagnen-Seite wird separat umgesetzt. */
export function CampaignPage() {
  return (
    <>
      <PageHeader eyebrow="Hauptquest" title="Kampagne" subtitle="Dein großes Ziel – Kapitel für Kapitel." />
      <EmptyState
        icon={<Hourglass />}
        title="Kommt gleich…"
        text="Hier verfolgst du bald deine Hauptquest und ihre Kapitel."
      />
    </>
  )
}
