import { Check, ChevronRight, Hourglass, Swords, Trophy } from 'lucide-react'
import { useId } from 'react'
import type { CSSProperties } from 'react'
import type { CampaignBlueprint } from '../../data/blueprints'
import { ATTRIBUTES } from '../../domain/attributes'
import { AttributeChip, Badge, cn } from '../../ui'
import { durationLabel } from './blueprintText'

export interface BlueprintCardProps {
  blueprint: CampaignBlueprint
  /** Öffnet die Einrichtung (Stufe, Klasse, Vorschau). */
  onOpen: () => void
  /** Eine aktive Kampagne aus dieser Vorlage läuft („Läuft bereits“). */
  running?: boolean
  /** Eine Kampagne aus dieser Vorlage wurde schon abgeschlossen („Gemeistert“). */
  mastered?: boolean
  /** Hervorgehoben als aktuelle Auswahl (Modus „select“). */
  selected?: boolean
  /** Kurzfassung der gewählten Stufe/Klasse, z. B. "Einsteiger · 🗡️ Krieger" (nur mit `selected`). */
  selectionLabel?: string
  /** Stufe/Klasse der laufenden Kampagne (nur mit `running`). */
  runningLabel?: string
  /**
   * Nicht wählbar (z. B. läuft bereits). Der Button bleibt fokussierbar (aria-disabled), damit der Grund
   * vorgelesen wird und der Fokus nach dem Schließen des Dialogs nicht verloren geht.
   */
  disabled?: boolean
  /** Überschriften-Ebene des Titels. Standard: h3. */
  headingLevel?: 'h2' | 'h3'
  className?: string
}

/**
 * Karte einer Kampagnen-Vorlage in der Bibliothek: großes Icon, Titel, Tagline, Attribute, Laufzeit,
 * Klassenwahl und Status. Die ganze Karte ist antippbar – der Titel ist ein Button, der sich unsichtbar
 * über die Karte spannt (kurzer zugänglicher Name, Tagline und Status als Beschreibung).
 */
export function BlueprintCard({
  blueprint,
  onOpen,
  running = false,
  mastered = false,
  selected = false,
  selectionLabel,
  runningLabel,
  disabled = false,
  headingLevel: Heading = 'h3',
  className,
}: BlueprintCardProps) {
  const id = useId()
  const statusId = `${id}-status`
  const taglineId = `${id}-tagline`
  const detailsId = `${id}-details`
  const classesId = `${id}-classes`
  const choiceId = `${id}-choice`
  const showsChoice = (selected && selectionLabel !== undefined) || (running && runningLabel !== undefined)
  const color = ATTRIBUTES[blueprint.primaryAttribute].color
  const paths = blueprint.paths ?? []
  const hasStatus = running || mastered || selected

  const accent: CSSProperties = {
    // Leichter Schein in der Farbe des Haupt-Attributs – jede Vorlage bekommt so ihre eigene Stimmung.
    backgroundImage: `radial-gradient(120% 70% at 0% 0%, color-mix(in srgb, ${color} 14%, transparent), transparent 62%)`,
  }
  const medallion: CSSProperties = {
    backgroundImage: `radial-gradient(circle at 50% 30%, color-mix(in srgb, ${color} 30%, transparent), color-mix(in srgb, ${color} 6%, transparent) 72%)`,
    boxShadow: `inset 0 0 0 1px color-mix(in srgb, ${color} 42%, transparent), 0 10px 26px -14px ${color}`,
  }

  return (
    <article
      data-state={disabled ? 'disabled' : selected ? 'selected' : undefined}
      className={cn(
        'group relative isolate flex h-full flex-col overflow-hidden rounded-2xl border p-4 sm:p-5',
        'transition-[border-color,background-color,box-shadow,transform] duration-200 ease-out',
        'has-focus-visible:outline-2 has-focus-visible:outline-offset-2 has-focus-visible:outline-gold-bright',
        selected
          ? 'border-gold/75 bg-linear-to-b from-[#2a2010]/95 to-surface/95 shadow-[inset_0_1px_0_rgb(240_201_106/0.16),0_0_0_1px_rgb(212_165_72/0.25),0_18px_44px_-20px_rgb(212_165_72/0.55)]'
          : disabled
            ? 'border-border/80 bg-surface/55'
            : 'border-border bg-linear-to-b from-surface-raised/85 to-surface/90 shadow-card hover:-translate-y-0.5 hover:border-gold-dim/80 hover:shadow-raised',
        className,
      )}
    >
      {/* Akzent-Schein + feine Lichtkante oben */}
      <span aria-hidden="true" className="pointer-events-none absolute inset-0 -z-10" style={accent} />
      <span
        aria-hidden="true"
        className={cn(
          'pointer-events-none absolute inset-x-8 top-0 h-px bg-linear-to-r from-transparent to-transparent',
          selected ? 'via-gold-bright/70' : 'via-gold/30',
        )}
      />

      <div className="flex items-start justify-between gap-3">
        <span
          aria-hidden="true"
          style={medallion}
          className={cn(
            'grid size-14 shrink-0 place-items-center rounded-2xl text-[1.875rem] leading-none transition-transform duration-300 ease-out',
            !disabled && 'group-hover:scale-105 group-hover:-rotate-3',
            disabled && 'opacity-70 grayscale-[35%]',
          )}
        >
          {blueprint.icon}
        </span>
        {hasStatus && (
          <div id={statusId} className="flex flex-wrap justify-end gap-1.5">
            {selected && (
              <Badge tone="gold" icon={<Check />}>
                Ausgewählt
              </Badge>
            )}
            {running && (
              <Badge tone="success" icon={<Swords />}>
                Läuft bereits
              </Badge>
            )}
            {mastered && (
              <Badge tone="gold" icon={<Trophy />}>
                Gemeistert
              </Badge>
            )}
          </div>
        )}
      </div>

      <Heading className="mt-3.5 font-display text-[1.125rem] leading-snug font-semibold tracking-wide text-parchment">
        <button
          type="button"
          onClick={disabled ? undefined : onOpen}
          aria-haspopup="dialog"
          aria-disabled={disabled || undefined}
          aria-describedby={cn(
            hasStatus && statusId,
            taglineId,
            showsChoice && choiceId,
            paths.length > 0 && classesId,
            detailsId,
          )}
          className={cn(
            'text-left outline-none',
            // Spannt sich über die ganze Karte (Tap-Ziel), Fokusrahmen zeichnet die Karte selbst.
            "after:absolute after:inset-0 after:z-10 after:rounded-2xl after:content-['']",
            disabled ? 'cursor-not-allowed text-parchment/80' : 'cursor-pointer',
          )}
        >
          {blueprint.title}
        </button>
      </Heading>
      <p id={taglineId} className="mt-1 text-sm leading-relaxed text-muted">
        {blueprint.tagline}
      </p>
      {selected && selectionLabel !== undefined && (
        <p id={choiceId} className="mt-2 text-sm font-medium text-gold-bright">
          <span className="sr-only">Deine Wahl: </span>
          {selectionLabel}
        </p>
      )}
      {running && runningLabel !== undefined && (
        <p id={choiceId} className="mt-2 text-sm font-medium text-success">
          <span className="sr-only">Läuft als: </span>
          {runningLabel}
        </p>
      )}

      {paths.length > 0 && (
        <p id={classesId} className="mt-3">
          <Badge tone="gold" className="gap-1.5">
            <span>Klassenwahl</span>
            <span aria-hidden="true" className="tracking-[0.12em]">
              {paths.map((path) => path.icon).join('')}
            </span>
            <span className="sr-only">: {paths.map((path) => path.className).join(', ')}</span>
          </Badge>
        </p>
      )}

      <div className="mt-auto pt-4">
        <div
          id={detailsId}
          className="flex flex-wrap items-center gap-x-3 gap-y-2 border-t border-border/70 pt-3 text-[0.8125rem] text-muted"
        >
          <span className="flex flex-wrap items-center gap-1">
            <AttributeChip attribute={blueprint.primaryAttribute} />
            {blueprint.secondaryAttributes.map((attribute) => (
              <AttributeChip key={attribute} attribute={attribute} showName={false} />
            ))}
          </span>
          <span className="ml-auto inline-flex items-center gap-2">
            <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
              <Hourglass aria-hidden="true" className="size-3.5 text-gold/80" />
              <span>
                <span className="sr-only">Laufzeit: </span>
                {durationLabel(blueprint.durationDays)}
              </span>
            </span>
            <ChevronRight
              aria-hidden="true"
              className={cn(
                'size-5 shrink-0 transition-[transform,color] duration-200',
                disabled ? 'text-faint/60' : 'text-gold/70 group-hover:translate-x-0.5 group-hover:text-gold-bright',
              )}
            />
          </span>
        </div>
      </div>
    </article>
  )
}
