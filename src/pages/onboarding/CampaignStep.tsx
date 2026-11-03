import { Check, CircleAlert, Feather, Map as MapIcon, Swords } from 'lucide-react'
import { useId, useMemo, useRef, useState } from 'react'
import type { FormEvent, ReactNode, Ref } from 'react'
import { getBlueprint } from '../../data/blueprints'
import type { BlueprintContent } from '../../data/blueprints'
import type { AdventureChoice } from '../../data/seed'
import { BALANCING } from '../../domain/balancing'
import { BlueprintLibrary, choiceSummary } from '../../features/blueprints'
import { Button, cn, formatNumber } from '../../ui'
import { StepActions, StepHeading } from './StepParts'

/** Wahl im Onboarding: eine Vorlage (Stufe, ggf. Klasse) oder `null` = ohne Vorlage starten. */
export type CampaignChoice = AdventureChoice | null

export interface CampaignStepProps {
  /** `undefined` = noch nichts gewählt. */
  choice: CampaignChoice | undefined
  onChoiceChange: (choice: CampaignChoice | undefined) => void
  onFinish: () => void
  saving: boolean
  focusOnMount: boolean
}

const MISSING_CHOICE = 'Wähle eine Vorlage – oder starte ohne Vorlage.'

/**
 * Schritt 3: erste Kampagne aus der Bibliothek wählen (Stufe, beim Sport die Klasse) oder ohne Vorlage
 * starten. Gespeichert wird erst mit „Los geht’s“ (`startAdventure`, zusammen mit dem Profil).
 */
export function CampaignStep({ choice, onChoiceChange, onFinish, saving, focusOnMount }: CampaignStepProps) {
  const noneId = useId()
  // Hinweis erst nach einem „Los geht’s“ ohne Wahl – verschwindet, sobald gewählt wurde.
  const [missing, setMissing] = useState(false)
  const showMissing = missing && choice === undefined
  const summaryRef = useRef<HTMLElement>(null)

  function handleSubmit(event: FormEvent) {
    event.preventDefault()
    if (choice === undefined) {
      setMissing(true)
      // Auf dem Handy steht die Zusammenfassung weit unten – ohne Scrollen sähe man den Hinweis nicht.
      const reduceMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false
      summaryRef.current?.scrollIntoView?.({ block: 'center', behavior: reduceMotion ? 'auto' : 'smooth' })
      return
    }
    onFinish()
  }

  const max = formatNumber(BALANCING.maxActiveCampaigns)

  return (
    <form noValidate onSubmit={handleSubmit} className="flex flex-1 flex-col">
      <StepHeading
        eyebrow="Deine Kampagne"
        title="Wähle deine erste Kampagne"
        subtitle={
          <>
            Eine Kampagne ist dein großes Ziel – deine Quests bringen dich ihm Kapitel für Kapitel näher. Wähle eine
            Vorlage und deine Stufe oder starte ganz ohne.{' '}
            <span className="text-parchment/90">
              Weitere Kampagnen kannst du später jederzeit beginnen – bis zu {max} gleichzeitig.
            </span>
          </>
        }
        focusOnMount={focusOnMount}
      />

      <BlueprintLibrary
        mode="select"
        className="mt-6"
        selected={choice ?? null}
        onConfirm={(next) => onChoiceChange(next)}
        busy={saving}
        cardHeadingLevel="h2"
      />

      <NoTemplateCard
        id={noneId}
        selected={choice === null}
        disabled={saving}
        onToggle={() => onChoiceChange(choice === null ? undefined : null)}
      />

      <ChoiceSummary
        ref={summaryRef}
        choice={choice}
        missing={showMissing}
        missingId={`${noneId}-missing`}
      />

      <StepActions>
        <Button
          type="submit"
          size="lg"
          fullWidth
          icon={<Swords />}
          loading={saving}
          aria-describedby={showMissing ? `${noneId}-missing` : undefined}
        >
          Los geht’s
        </Button>
      </StepActions>
    </form>
  )
}

/**
 * „Ohne Vorlage starten“ als Umschalter (aria-pressed): an = ohne Kampagne, erneut tippen = Wahl aufheben.
 * Gestaltet wie eine Vorlagen-Karte, damit beide Wege gleichwertig wirken.
 */
function NoTemplateCard({
  id,
  selected,
  disabled,
  onToggle,
}: {
  id: string
  selected: boolean
  disabled: boolean
  onToggle: () => void
}) {
  const descriptionId = `${id}-description`
  return (
    <div
      className={cn(
        'relative mt-4 flex items-start gap-3.5 rounded-2xl border p-4 transition-[border-color,background-color,box-shadow] duration-200 sm:p-5',
        'has-focus-visible:outline-2 has-focus-visible:outline-offset-2 has-focus-visible:outline-gold-bright',
        selected
          ? 'border-gold/70 bg-linear-to-b from-[#2a2010]/95 to-surface/95 shadow-[inset_0_1px_0_rgb(240_201_106/0.14),0_0_0_1px_rgb(212_165_72/0.2),0_16px_40px_-18px_rgb(212_165_72/0.45)]'
          : 'border-dashed border-border-strong/80 bg-surface/50 hover:border-border-strong hover:bg-surface-raised/60',
      )}
    >
      <span
        aria-hidden="true"
        className={cn(
          'grid size-12 shrink-0 place-items-center rounded-xl ring-1 ring-inset [&_svg]:size-6',
          selected ? 'bg-gold/14 text-gold-bright ring-gold/40' : 'bg-black/25 text-muted ring-white/6',
        )}
      >
        <Feather />
      </span>
      <div className="min-w-0 flex-1 pr-8">
        <h2 className="font-display text-[1.0625rem] leading-snug font-semibold tracking-wide text-parchment">
          <button
            type="button"
            aria-pressed={selected}
            aria-describedby={descriptionId}
            disabled={disabled}
            onClick={onToggle}
            className="cursor-pointer text-left outline-none after:absolute after:inset-0 after:z-10 after:rounded-2xl disabled:cursor-not-allowed"
          >
            Ohne Vorlage starten
          </button>
        </h2>
        <p id={descriptionId} className="mt-1 text-sm leading-relaxed text-muted">
          Du legst deine Quests und Kampagnen selbst an – volle Freiheit von Anfang an.
        </p>
      </div>
      <span
        aria-hidden="true"
        className={cn(
          'absolute top-4 right-4 grid size-6 place-items-center rounded-full border-2 transition-colors duration-200 sm:top-5 sm:right-5',
          selected ? 'border-gold-bright bg-gold-bright text-on-gold' : 'border-border-strong bg-bg-deep/60',
        )}
      >
        {selected && <Check className="size-3.5" strokeWidth={3.5} />}
      </span>
    </div>
  )
}

/** Zusammenfassung der Wahl direkt vor „Los geht’s“. */
function ChoiceSummary({
  ref,
  choice,
  missing,
  missingId,
}: {
  ref?: Ref<HTMLElement>
  choice: CampaignChoice | undefined
  missing: boolean
  missingId: string
}) {
  const blueprint = choice ? getBlueprint(choice.blueprintId) : undefined
  const content = useMemo<BlueprintContent | null>(() => {
    if (!choice || !blueprint) return null
    try {
      return blueprint.build(choice.options)
    } catch {
      return null
    }
  }, [blueprint, choice])

  let icon: ReactNode = <MapIcon />
  let title = 'Noch keine Wahl'
  let detail = 'Tippe auf eine Vorlage, um Stufe und Vorschau zu sehen – oder starte ohne Vorlage.'
  if (choice === null) {
    icon = <Feather />
    title = 'Ohne Vorlage'
    detail = 'Du beginnst mit einem leeren Questlog und legst alles selbst an.'
  } else if (choice && blueprint) {
    icon = <span className="text-2xl leading-none">{content?.icon ?? blueprint.icon}</span>
    title = content?.title ?? blueprint.title
    detail = [
      choiceSummary(blueprint, choice.options),
      ...(content
        ? [
            // Geschützte Leerzeichen: „6 Kapitel“ bricht nicht zwischen Zahl und Wort um.
            `${formatNumber(content.quests.length)}\u00a0${content.quests.length === 1 ? 'Quest' : 'Quests'}`,
            `${formatNumber(content.chapters.length)}\u00a0Kapitel`,
          ]
        : []),
    ].join(' · ')
  }

  const chosen = choice !== undefined
  return (
    <section
      ref={ref}
      aria-label="Deine Wahl"
      className={cn(
        'mt-6 flex scroll-mt-6 items-center gap-3.5 rounded-2xl border px-4 py-3.5',
        missing
          ? 'border-danger/45 bg-danger/8'
          : chosen
            ? 'border-gold/40 bg-gold/6'
            : 'border-border bg-bg-deep/40',
      )}
    >
      <span
        aria-hidden="true"
        className={cn(
          'grid size-11 shrink-0 place-items-center rounded-xl ring-1 ring-inset [&_svg]:size-5',
          missing
            ? 'bg-danger/12 text-danger ring-danger/35'
            : chosen
              ? 'bg-gold/12 text-gold-bright ring-gold/35'
              : 'bg-black/25 text-muted ring-white/6',
        )}
      >
        {missing ? <CircleAlert /> : icon}
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-[0.6875rem] font-semibold tracking-[0.18em] text-gold uppercase">Deine Wahl</p>
        <p className="mt-0.5 font-display text-[1.0625rem] leading-snug font-semibold tracking-wide text-parchment">
          {title}
        </p>
        {missing ? (
          <p id={missingId} role="alert" className="mt-0.5 text-sm leading-snug text-danger">
            {MISSING_CHOICE}
          </p>
        ) : (
          <p className="mt-0.5 text-sm leading-snug text-muted">{detail}</p>
        )}
      </div>
    </section>
  )
}
