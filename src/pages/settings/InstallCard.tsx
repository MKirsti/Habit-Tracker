import { CircleCheck, EllipsisVertical, Share, Smartphone } from 'lucide-react'
import type { ReactNode } from 'react'
import { Card, useMediaQuery } from '../../ui'

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

/** Kurze Anleitung, wie man Questlog als App auf den Startbildschirm legt. */
export function InstallCard() {
  const installed = useMediaQuery('(display-mode: standalone)')
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
    </Card>
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
