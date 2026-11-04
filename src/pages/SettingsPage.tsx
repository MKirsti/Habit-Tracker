import { ArrowLeft } from 'lucide-react'
import { useId } from 'react'
import { Link } from 'react-router'
import { Ornament, PageHeader, SectionTitle, buttonClassName, cn } from '../ui'
import { BackupCard } from './settings/BackupCard'
import { DangerZone } from './settings/DangerZone'
import { DayStartCard, EffectsCard } from './settings/GameSettings'
import { InstallCard } from './settings/InstallCard'

/** Version, die im Fuß der Einstellungen steht. */
export const APP_VERSION_LABEL = 'Version 0.1 (MVP)'

/**
 * „Einstellungen“: Tageswechsel, Effekte, Datensicherung, Installation und Gefahrenzone. Ohne eigenen Eintrag in
 * der Navigation – erreichbar über das Zahnrad der Held-Seite, zurück geht es über „Zurück zum Helden“.
 */
export function SettingsPage() {
  const gameId = useId()
  const dataId = useId()
  return (
    <>
      <Link to="/held" className={cn(buttonClassName({ variant: 'ghost', size: 'sm' }), '-mt-2 mb-3 -ml-3 sm:-mt-4')}>
        <ArrowLeft aria-hidden />
        Zurück zum Helden
      </Link>
      <PageHeader
        eyebrow="Optionen"
        title="Einstellungen"
        subtitle="Passe Questlog an dich an und sichere deinen Spielstand."
      />

      <div className="flex flex-col gap-8">
        <section aria-labelledby={gameId}>
          <SectionTitle id={gameId}>Spiel</SectionTitle>
          <div className="grid gap-4 lg:grid-cols-2">
            <DayStartCard />
            <EffectsCard />
          </div>
        </section>

        <section aria-labelledby={dataId}>
          <SectionTitle id={dataId}>Daten & Gerät</SectionTitle>
          <div className="grid gap-4 lg:grid-cols-2">
            <BackupCard />
            <InstallCard />
          </div>
        </section>

        <DangerZone />
      </div>

      <footer className="mt-12 flex flex-col items-center gap-1.5 text-center text-xs text-muted">
        <Ornament className="mb-2 h-3 w-20 text-gold-dim" />
        <p className="font-display font-semibold tracking-[0.12em] text-parchment/80">Questlog · {APP_VERSION_LABEL}</p>
        <p>Deine Daten verlassen nie dein Gerät.</p>
      </footer>
    </>
  )
}
