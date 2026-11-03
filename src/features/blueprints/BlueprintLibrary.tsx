import { Lock, Swords } from 'lucide-react'
import { useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { useGameContext } from '../../app/gameContext'
import { BLUEPRINTS } from '../../data/blueprints'
import type { CampaignBlueprint } from '../../data/blueprints'
import type { AdventureChoice } from '../../data/seed'
import { CAMPAIGN_LIMIT_MESSAGE } from '../../domain/campaigns'
import { cn } from '../../ui'
import { BlueprintCard } from './BlueprintCard'
import { BlueprintSetupDialog } from './BlueprintSetupDialog'
import type { BlueprintLibraryMode } from './BlueprintSetupDialog'
import { activeSlotsText, choiceSummary, freeSlotsText } from './blueprintText'
import { libraryStatus } from './libraryStatus'

export interface BlueprintLibraryProps {
  /** start: Kampagne direkt beginnen (der Aufrufer installiert in `onConfirm`); select: nur auswählen (Onboarding). */
  mode: BlueprintLibraryMode
  /** Nur `mode="select"`: hervorgehobene Auswahl (öffnet beim erneuten Antippen mit ihren Werten). */
  selected?: AdventureChoice | null
  /**
   * Bestätigen im Dialog. Darf ein Promise liefern: Der Dialog zeigt einen Ladezustand und schließt sich erst
   * nach Erfolg; wirft es, bleibt er offen – den Fehler zeigt der Aufrufer (z. B. per Toast).
   */
  onConfirm: (choice: AdventureChoice) => Promise<void> | void
  /** Von außen beschäftigt (z. B. das Onboarding speichert): Karten sind gesperrt, Bestätigen lädt. */
  busy?: boolean
  /** Überschriften-Ebene der Kartentitel (Standard: h3). */
  cardHeadingLevel?: 'h2' | 'h3'
  /**
   * Nur `mode="start"`: Zusatz unter der Limit-Meldung, wenn alle Plätze belegt sind – z. B. Links zu den
   * laufenden Kampagnen, die sich beenden lassen.
   */
  fullHint?: ReactNode
  className?: string
}

/**
 * Die Kampagnen-Bibliothek: alle Vorlagen als Karten. Ein Tipp öffnet die Einrichtung (Klassenwahl, Stufe,
 * Vorschau). Im Modus `start` zeigt sie die freien Kampagnen-Plätze, sperrt laufende Vorlagen und – wenn alle
 * Plätze belegt sind – das Beginnen (Ansehen bleibt möglich).
 */
export function BlueprintLibrary({
  mode,
  selected = null,
  onConfirm,
  busy = false,
  cardHeadingLevel = 'h3',
  fullHint,
  className,
}: BlueprintLibraryProps) {
  const { data, today } = useGameContext()
  const status = useMemo(() => libraryStatus(data, today), [data, today])

  // Die Vorlage bleibt nach dem Schließen gesetzt, damit der Dialog sauber ausblenden kann.
  const [dialogBlueprint, setDialogBlueprint] = useState<CampaignBlueprint | null>(null)
  const [dialogOpen, setDialogOpen] = useState(false)

  const isStart = mode === 'start'
  const full = isStart && status.slotsLeft <= 0

  function open(blueprint: CampaignBlueprint) {
    if (busy) return
    setDialogBlueprint(blueprint)
    setDialogOpen(true)
  }

  const dialogSelected = dialogBlueprint !== null && selected?.blueprintId === dialogBlueprint.id ? selected : null

  return (
    <div className={cn('@container', className)}>
      {isStart && (
        <SlotsBanner active={status.activeCount} max={status.maxActive} left={status.slotsLeft} fullHint={fullHint} />
      )}

      <ul role="list" className="grid grid-cols-1 gap-4 @xl:grid-cols-2 @4xl:grid-cols-3 @4xl:gap-5">
        {BLUEPRINTS.map((blueprint) => {
          const runningRef = status.running.get(blueprint.id)
          const running = isStart && runningRef !== undefined
          const isSelected = !isStart && selected?.blueprintId === blueprint.id
          return (
            <li key={blueprint.id} className="min-w-0">
              <BlueprintCard
                blueprint={blueprint}
                onOpen={() => open(blueprint)}
                running={running}
                mastered={status.mastered.has(blueprint.id)}
                selected={isSelected}
                selectionLabel={isSelected && selected ? choiceSummary(blueprint, selected.options) : undefined}
                runningLabel={running && runningRef ? choiceSummary(blueprint, runningRef) : undefined}
                disabled={running || busy}
                headingLevel={cardHeadingLevel}
              />
            </li>
          )
        })}
      </ul>

      {dialogBlueprint !== null && (
        <BlueprintSetupDialog
          open={dialogOpen}
          onClose={() => setDialogOpen(false)}
          blueprint={dialogBlueprint}
          mode={mode}
          initialOptions={dialogSelected?.options}
          onConfirm={onConfirm}
          blockedReason={full ? CAMPAIGN_LIMIT_MESSAGE : undefined}
          mastered={status.mastered.has(dialogBlueprint.id)}
          busy={busy}
        />
      )}
    </div>
  )
}

/** Kopf im Modus `start`: „2 von 3 Kampagnen aktiv · 1 Platz frei“ bzw. Erklärung, wenn alles belegt ist. */
function SlotsBanner({
  active,
  max,
  left,
  fullHint,
}: {
  active: number
  max: number
  left: number
  fullHint?: ReactNode
}) {
  const full = left <= 0
  return (
    <div
      className={cn(
        'mb-5 flex items-start gap-3.5 rounded-2xl border px-4 py-3.5 sm:items-center',
        full ? 'border-warning/40 bg-warning/8' : 'border-border bg-surface/60',
      )}
    >
      <span
        aria-hidden="true"
        className={cn(
          'grid size-10 shrink-0 place-items-center rounded-xl ring-1 ring-inset [&_svg]:size-5',
          full ? 'bg-warning/12 text-warning ring-warning/35' : 'bg-gold/10 text-gold ring-gold/25',
        )}
      >
        {full ? <Lock /> : <Swords />}
      </span>
      <div className="min-w-0 flex-1">
        <p aria-live="polite" className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
          <span className="font-display text-[0.9375rem] font-semibold tracking-wide text-parchment">
            {activeSlotsText(active, max)}
          </span>
          <span aria-hidden="true" className="flex items-center gap-1">
            {Array.from({ length: max }, (_, index) => (
              <span
                key={index}
                className={cn(
                  'size-2.5 rotate-45 rounded-[2px] border',
                  index < active
                    ? full
                      ? 'border-warning bg-warning shadow-[0_0_8px_rgb(232_169_72/0.55)]'
                      : 'border-gold-bright bg-gold shadow-glow-sm'
                    : 'border-border-strong bg-bg-deep/70',
                )}
              />
            ))}
          </span>
          <span className={cn('text-sm', full ? 'text-warning' : 'text-muted')}>{freeSlotsText(left)}</span>
        </p>
        {full && <p className="mt-1 text-sm leading-relaxed text-muted">{CAMPAIGN_LIMIT_MESSAGE}</p>}
        {full && fullHint !== undefined && <div className="mt-3">{fullHint}</div>}
      </div>
    </div>
  )
}
