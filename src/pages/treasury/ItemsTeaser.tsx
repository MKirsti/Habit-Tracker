import { Lock, Package } from 'lucide-react'
import { useId } from 'react'
import { Badge, SectionTitle } from '../../ui'

/** So viele verschlossene Fächer zeigt die Vorschau. */
const SLOTS = 3

/**
 * Platzhalter für die Gegenstände, die später in der Schatzkammer erhältlich sein werden – noch ohne Inhalt,
 * nur verschlossene Fächer und ein kurzer Ausblick.
 */
export function ItemsTeaser() {
  const titleId = useId()
  return (
    <section aria-labelledby={titleId}>
      <SectionTitle id={titleId} action={<Badge tone="neutral">Bald verfügbar</Badge>}>
        Gegenstände
      </SectionTitle>
      <div className="relative overflow-hidden rounded-2xl border border-dashed border-border-strong/80 bg-surface/45 px-5 py-5 sm:px-6">
        <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:gap-6">
          <ul aria-hidden="true" className="flex shrink-0 gap-2.5">
            {Array.from({ length: SLOTS }, (_, index) => (
              <li
                key={index}
                className="relative grid size-14 place-items-center rounded-xl border border-border-strong bg-bg-deep/60 shadow-[inset_0_1px_3px_rgb(0_0_0/0.5)]"
              >
                <Package className="size-6 text-faint" strokeWidth={1.6} />
                <span className="absolute -right-1.5 -bottom-1.5 grid size-5 place-items-center rounded-full border border-border-strong bg-surface-raised">
                  <Lock className="size-3 text-gold-dim" />
                </span>
              </li>
            ))}
          </ul>
          <div className="min-w-0">
            <p className="font-display text-[0.9375rem] font-semibold tracking-wide text-parchment">
              Das Arsenal wird noch bestückt
            </p>
            <p className="mt-1 text-sm text-muted">
              Bald kannst du hier nützliche Gegenstände für dein Abenteuer erwerben. Dein Gold behält bis dahin seinen
              Wert – spare ruhig schon einmal.
            </p>
          </div>
        </div>
      </div>
    </section>
  )
}
