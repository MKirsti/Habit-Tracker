import { ArrowLeft } from 'lucide-react'
import { useEffect, useId, useRef } from 'react'
import { Link, useSearchParams } from 'react-router'
import { Ornament, PageHeader, SectionTitle, buttonClassName, cn } from '../ui'
import { BackupCard } from './settings/BackupCard'
import { DangerZone } from './settings/DangerZone'
import { DayStartCard, EffectsCard } from './settings/GameSettings'
import { InstallCard } from './settings/InstallCard'
import { LifePointsSettings } from './settings/LifePointsSettings'
import { RestSettings } from './settings/RestSettings'
import { SETTINGS_SECTION_PARAM } from './settings/settingsText'

/** Version, die im Fuß der Einstellungen steht. */
export const APP_VERSION_LABEL = 'Version 0.1 (MVP)'

/**
 * „Einstellungen“: Tageswechsel, Effekte, Lebenspunkte (an/aus = Sanfter Modus), Rast & Urlaub, Datensicherung,
 * Installation und Gefahrenzone. Ohne eigenen Eintrag in der Navigation – erreichbar über das Zahnrad der Held-Seite,
 * zurück geht es über „Zurück zum Helden“. `?bereich=rast` (aus „Urlaub planen“ auf der Tagesübersicht) springt direkt
 * zu „Rast & Urlaub“.
 */
export function SettingsPage() {
  const gameId = useId()
  const hpId = useId()
  const restId = useId()
  const dataId = useId()
  const [params] = useSearchParams()
  const target = params.get(SETTINGS_SECTION_PARAM)
  const restRef = useRef<HTMLElement>(null)
  useEffect(() => {
    if (target !== 'rast') return
    const section = restRef.current
    if (section === null) return
    // jsdom kennt scrollIntoView nicht.
    section.scrollIntoView?.({ block: 'start' })
    section.focus({ preventScroll: true })
  }, [target])
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

        <section aria-labelledby={hpId}>
          <SectionTitle id={hpId}>Lebenspunkte</SectionTitle>
          <LifePointsSettings />
        </section>

        <section ref={restRef} aria-labelledby={restId} tabIndex={-1} className="scroll-mt-6 outline-none">
          <SectionTitle id={restId}>Rast & Urlaub</SectionTitle>
          <RestSettings />
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
