import { CircleCheck, EllipsisVertical, Share, ShieldAlert, ShieldCheck, Smartphone } from 'lucide-react'
import { useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import { isStoragePersisted } from '../../app/persistentStorage'
import { Card, cn, useMediaQuery } from '../../ui'

interface Guide {
  platform: string
  steps: ReactNode[]
}

const GUIDES: Guide[] = [
  {
    platform: 'iPhone & iPad (Safari)',
    steps: [
      <>
        Tippe auf <Key icon={<Share />}>Teilen</Key>
      </>,
      <>
        Wähle <Key>Zum Home-Bildschirm</Key>
      </>,
    ],
  },
  {
    platform: 'Android (Chrome)',
    steps: [
      <>
        Öffne das <Key icon={<EllipsisVertical />}>Menü</Key>
      </>,
      <>
        Tippe auf <Key>App installieren</Key>
      </>,
    ],
  },
]

/** Kurze Anleitung, wie man Questlog als App auf den Startbildschirm legt – plus Speicherschutz-Status. */
export function InstallCard() {
  const installed = useMediaQuery('(display-mode: standalone)')
  const persisted = useStoragePersisted()
  return (
    <Card title="App installieren" titleAs="h3" icon={<Smartphone />} className="h-full">
      {installed ? (
        <p className="flex items-start gap-2.5 text-sm text-parchment">
          <CircleCheck aria-hidden className="mt-0.5 size-4 shrink-0 text-success" />
          Questlog läuft bereits als installierte App. Gute Reise!
        </p>
      ) : (
        <div className="@container">
          <p className="text-sm text-muted">
            Lege Questlog auf deinen Startbildschirm – dann startet es wie eine echte App und funktioniert auch offline.
          </p>
          {/* Nebeneinander nur, wenn die Karte breit genug ist (in der Desktop-Spalte untereinander). */}
          <div className="mt-4 grid gap-3 @min-[30rem]:grid-cols-2">
            {GUIDES.map((guide) => (
              <div key={guide.platform} className="rounded-xl border border-border bg-black/20 p-3.5">
                <h4 className="text-sm font-semibold text-parchment">{guide.platform}</h4>
                <ol className="mt-2 flex flex-col gap-2">
                  {guide.steps.map((step, index) => (
                    <li key={index} className="flex items-start gap-2.5 text-sm text-muted">
                      <span
                        aria-hidden="true"
                        className="grid size-5 shrink-0 place-items-center rounded-full bg-gold/12 text-[0.6875rem] font-bold text-gold ring-1 ring-gold/30"
                      >
                        {index + 1}
                      </span>
                      <span className="min-w-0">{step}</span>
                    </li>
                  ))}
                </ol>
              </div>
            ))}
          </div>
          <p className="mt-3 text-[0.8125rem] text-muted">
            Am Computer (Chrome, Edge): Installieren-Symbol rechts in der Adressleiste.
          </p>
        </div>
      )}
      {persisted !== undefined && <StorageStatus persisted={persisted} installed={installed} />}
    </Card>
  )
}

/** Fragt einmal ab, ob der Browser den Speicher dauerhaft schützt (`undefined` = unbekannt/keine API). */
function useStoragePersisted(): boolean | undefined {
  const [persisted, setPersisted] = useState<boolean>()
  useEffect(() => {
    let active = true
    void isStoragePersisted().then((value) => {
      if (active) setPersisted(value)
    })
    return () => {
      active = false
    }
  }, [])
  return persisted
}

/**
 * Ob der Browser den Spielstand bei Speicherknappheit löschen dürfte. Installierte Apps schützt er
 * meist von selbst – deshalb zeigt der Hinweis bei „nein“ auf die Anleitung darüber.
 */
function StorageStatus({ persisted, installed }: { persisted: boolean; installed: boolean }) {
  const Icon = persisted ? ShieldCheck : ShieldAlert
  return (
    <div className="mt-4 flex items-start gap-2.5 border-t border-border pt-3.5 text-sm">
      <Icon aria-hidden className={cn('mt-0.5 size-4 shrink-0', persisted ? 'text-success' : 'text-warning')} />
      <p className="min-w-0">
        <span className="font-medium text-parchment">Speicher geschützt: {persisted ? 'ja' : 'nein'}</span>
        <span className="mt-0.5 block text-[0.8125rem] text-muted">
          {persisted
            ? 'Der Browser löscht deinen Spielstand nicht von selbst, auch wenn der Speicher knapp wird.'
            : installed
              ? 'Wird der Speicher knapp, darf der Browser die Daten löschen – lade ab und zu ein Backup herunter.'
              : 'Wird der Speicher knapp, darf der Browser die Daten löschen. Als installierte App ist dein ' +
                'Spielstand besser geschützt – und ein Backup schadet nie.'}
        </span>
      </p>
    </div>
  )
}

/** Hervorgehobene Bedienelement-Bezeichnung, optional mit Symbol. */
function Key({ icon, children }: { icon?: ReactNode; children: ReactNode }) {
  return (
    <span className="font-medium text-parchment">
      {icon !== undefined && (
        <span aria-hidden="true" className="mr-1 inline-block align-[-0.125em] text-gold [&_svg]:size-3.5">
          {icon}
        </span>
      )}
      „{children}“
    </span>
  )
}
