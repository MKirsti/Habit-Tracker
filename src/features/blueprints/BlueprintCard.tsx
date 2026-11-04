import { Check, ChevronRight, Hourglass, Swords, Trophy } from 'lucide-react'
import { useId } from 'react'
import type { CSSProperties } from 'react'
import type { CampaignBlueprint } from '../../data/blueprints'
import type { AttributeId } from '../../domain/types'
import { AttributeChip, Badge, cn } from '../../ui'
import { ACCENT_SURFACE, attributeAccentVars } from '../campaignTheme'
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
  /**
   * Attribut, dessen Farbe die Karte trägt. Standard: das Haupt-Attribut der Vorlage. Ist eine Klasse gewählt
   * (bzw. läuft eine Kampagne mit Klasse), deren Haupt-Attribut – siehe `blueprintAccentAttribute`.
   */
  accent?: AttributeId
  className?: string
}

const CLASSES_BADGE_STYLE: CSSProperties = {
  borderColor: 'var(--accent-35)',
  backgroundColor: 'var(--accent-10)',
  color: 'var(--accent-text)',
}

/**
 * Karte einer Kampagnen-Vorlage in der Bibliothek: großes Icon, Titel, Tagline, Attribute, Laufzeit,
 * Klassenwahl und Status. Die ganze Karte ist antippbar – der Titel ist ein Button, der sich unsichtbar
 * über die Karte spannt (kurzer zugänglicher Name, Tagline und Status als Beschreibung).
 *
 * Akzent: die Farbe des Haupt-Attributs (`attributeAccentVars`, CSS-Variablen auf dem `<article>`; bei gewählter
 * Klasse deren Farbe, siehe `accent`) – zart im
 * Rahmen, in der Lichtkante, im Schein oben links und im Icon-Rahmen; beim Überfahren und als Auswahl kräftiger.
 * Gold bleibt für „Ausgewählt“ und „Gemeistert“.
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
  accent = blueprint.primaryAttribute,
  className,
}: BlueprintCardProps) {
  const id = useId()
  const statusId = `${id}-status`
  const taglineId = `${id}-tagline`
  const detailsId = `${id}-details`
  const classesId = `${id}-classes`
  const choiceId = `${id}-choice`
  const showsChoice = (selected && selectionLabel !== undefined) || (running && runningLabel !== undefined)
  const paths = blueprint.paths ?? []
  const hasStatus = running || mastered || selected

  return (
    <article
      data-state={disabled ? 'disabled' : selected ? 'selected' : undefined}
      data-accent={accent}
      style={attributeAccentVars(accent)}
      className={cn(
        'group relative isolate flex h-full flex-col overflow-hidden rounded-2xl border p-4 sm:p-5',
        'transition-[border-color,background-color,box-shadow,transform] duration-200 ease-out',
        'has-focus-visible:outline-2 has-focus-visible:outline-offset-2 has-focus-visible:outline-gold-bright',
        selected
          ? cn(
              'border-(--accent-60) shadow-[inset_0_1px_0_var(--accent-20),0_0_0_1px_var(--accent-35),0_18px_44px_-20px_var(--accent-60)]',
              ACCENT_SURFACE,
            )
          : disabled
            ? 'border-border/80 bg-surface/55'
            : 'border-[color-mix(in_srgb,var(--accent)_16%,var(--color-border))] bg-linear-to-b from-surface-raised/85 to-surface/90 shadow-card hover:-translate-y-0.5 hover:border-(--accent-35) hover:shadow-[0_0_0_1px_var(--accent-10),0_18px_44px_-22px_var(--accent-35)]',
        className,
      )}
    >
      {/* Akzent-Schein oben links + feine Lichtkante oben – in der Farbe des Haupt-Attributs */}
      <span
        aria-hidden="true"
        className={cn(
          'pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(120%_70%_at_0%_0%,var(--accent-10),transparent_62%)] transition-opacity duration-200',
          disabled && 'opacity-60',
        )}
      />
      <span
        aria-hidden="true"
        className={cn(
          'pointer-events-none absolute inset-x-8 top-0 h-px bg-linear-to-r from-transparent to-transparent',
          selected ? 'via-(--accent)' : disabled ? 'via-(--accent-20)' : 'via-(--accent-35) group-hover:via-(--accent-60)',
        )}
      />

      <div className="flex items-start justify-between gap-3">
        {/* Icon-Rahmen (Medaillon) in der Akzentfarbe */}
        <span
          aria-hidden="true"
          data-medallion=""
          className={cn(
            'grid size-14 shrink-0 place-items-center rounded-2xl text-[1.875rem] leading-none',
            'bg-[radial-gradient(circle_at_50%_30%,var(--accent-20),var(--accent-5)_72%)]',
            'transition-[transform,box-shadow] duration-300 ease-out',
            selected
              ? 'shadow-[inset_0_0_0_1px_var(--accent-60),0_10px_26px_-12px_var(--accent)]'
              : 'shadow-[inset_0_0_0_1px_var(--accent-35),0_10px_26px_-14px_var(--accent-60)]',
            !disabled && 'group-hover:scale-105 group-hover:-rotate-3 group-hover:shadow-[inset_0_0_0_1px_var(--accent-60),0_10px_26px_-12px_var(--accent)]',
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
        <p id={choiceId} className="mt-2 text-sm font-medium text-(--accent-text)">
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
          {/* Etikett in der Akzentfarbe (Inline-Stil überstimmt die neutrale Tonalität des Badges). */}
          <Badge data-classes="" className="gap-1.5" style={CLASSES_BADGE_STYLE}>
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
              <Hourglass aria-hidden="true" className="size-3.5 text-(--accent-60)" />
              <span>
                <span className="sr-only">Laufzeit: </span>
                {durationLabel(blueprint.durationDays)}
              </span>
            </span>
            <ChevronRight
              aria-hidden="true"
              className={cn(
                'size-5 shrink-0 transition-[transform,color] duration-200',
                disabled ? 'text-faint/60' : 'text-(--accent-60) group-hover:translate-x-0.5 group-hover:text-(--accent)',
              )}
            />
          </span>
        </div>
      </div>
    </article>
  )
}
