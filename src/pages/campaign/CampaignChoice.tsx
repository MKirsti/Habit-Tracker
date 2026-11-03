import { Check, Feather, Swords } from 'lucide-react'
import { useId, useMemo } from 'react'
import type { Ref } from 'react'
import { createScholarCampaign } from '../../data/seed'
import { diffDays } from '../../domain/dates'
import type { DayKey } from '../../domain/types'
import { Badge, Button, Card, Ornament, formatNumber } from '../../ui'
import { countLabel, durationLabel } from './campaignText'

export interface CampaignChoiceProps {
  today: DayKey
  /** Vorlage wird gerade eingerichtet. */
  installing: boolean
  onInstall: () => void
  onCreateCustom: () => void
  /** Ref auf die Überschrift (für den Fokus, z. B. nach dem Löschen einer Kampagne). */
  headingRef?: Ref<HTMLHeadingElement>
}

const CUSTOM_POINTS = [
  'Dein Warum und deine Belohnung',
  'Kapitel zum Abhaken, Zählen oder automatisch aus Quests',
  'Zieldatum nach deiner Wahl',
]

/**
 * Leerer Zustand ohne Kampagne: Einladung mit zwei Wegen – die Vorlage „Der Weg des Gelehrten“
 * oder eine eigene Kampagne.
 */
export function CampaignChoice({ today, installing, onInstall, onCreateCustom, headingRef }: CampaignChoiceProps) {
  const headingId = useId()
  const templateTitleId = useId()
  const customTitleId = useId()
  // Vorschau direkt aus der Vorlage berechnet – so stimmen Zahlen und Kapitel immer mit dem Inhalt überein.
  const template = useMemo(() => createScholarCampaign(today), [today])
  const { mainQuest, habits } = template
  const duration =
    mainQuest.deadline !== undefined ? durationLabel(diffDays(mainQuest.startDay, mainQuest.deadline)) : undefined

  return (
    <section aria-labelledby={headingId}>
      <div className="mb-6 flex flex-col items-center text-center sm:mb-8">
        <div
          aria-hidden="true"
          className="relative mb-4 grid size-16 place-items-center rounded-full bg-radial from-gold/20 to-gold/4 text-[1.875rem] ring-1 ring-gold/35"
        >
          <span className="absolute -inset-2 rounded-full ring-1 ring-gold/10" />
          🗺️
        </div>
        <h2
          id={headingId}
          ref={headingRef}
          tabIndex={-1}
          className="font-display text-xl font-semibold tracking-wide text-parchment focus:outline-none sm:text-2xl"
        >
          Wähle deine Hauptquest
        </h2>
        <Ornament className="mt-2 h-3 w-16 text-gold-dim" />
        <p className="mt-3 max-w-md text-[0.9375rem] text-muted">
          Eine Kampagne ist dein großes Ziel, aufgeteilt in Kapitel. Deine täglichen Quests bringen dich Schritt für
          Schritt voran.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)] md:gap-5">
        {/* Vorlage */}
        <Card as="article" tone="gold" ornate padding="lg" aria-labelledby={templateTitleId} className="flex flex-col">
          <div className="flex items-start gap-4">
            <div
              aria-hidden="true"
              className="grid size-14 shrink-0 place-items-center rounded-2xl bg-radial from-gold/22 to-gold/5 text-[2rem] leading-none ring-1 ring-gold/40"
            >
              {mainQuest.icon}
            </div>
            <div className="min-w-0 flex-1">
              <Badge tone="gold" icon={<Feather />}>
                Vorlage
              </Badge>
              <h3
                id={templateTitleId}
                className="mt-1.5 font-display text-lg leading-snug font-semibold tracking-wide text-parchment"
              >
                {mainQuest.title}
              </h3>
            </div>
          </div>
          <p className="mt-3 text-[0.9375rem] text-parchment/85">{mainQuest.description}</p>

          <ul aria-label="Umfang" className="mt-4 flex flex-wrap gap-1.5">
            <li>
              <Badge size="md">{countLabel(habits.length, 'Quest', 'Quests')}</Badge>
            </li>
            <li>
              <Badge size="md">{countLabel(mainQuest.chapters.length, 'Kapitel', 'Kapitel')}</Badge>
            </li>
            {duration !== undefined && (
              <li>
                <Badge size="md">{duration}</Badge>
              </li>
            )}
          </ul>

          <div className="mt-5 grid gap-5 sm:grid-cols-2">
            <div>
              <h4 className="mb-2 text-xs font-semibold tracking-[0.16em] text-gold uppercase">Quests</h4>
              <ul className="space-y-1.5 text-sm text-parchment/90">
                {habits.map((habit) => (
                  <li key={habit.id} className="flex items-center gap-2">
                    <span aria-hidden="true" className="w-5 shrink-0 text-center">
                      {habit.icon}
                    </span>
                    <span className="min-w-0">{habit.title}</span>
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <h4 className="mb-2 text-xs font-semibold tracking-[0.16em] text-gold uppercase">Kapitel</h4>
              <ol className="space-y-1.5 text-sm text-parchment/90">
                {mainQuest.chapters.map((chapter, index) => (
                  <li key={chapter.id} className="flex items-baseline gap-2">
                    <span className="w-5 shrink-0 text-center font-display text-xs font-bold text-gold-dim tabular-nums">
                      {formatNumber(index + 1)}
                    </span>
                    <span className="min-w-0">{chapter.title}</span>
                  </li>
                ))}
              </ol>
            </div>
          </div>

          <div className="mt-auto pt-6">
            <Button
              size="lg"
              fullWidth
              icon={<Swords />}
              loading={installing}
              onClick={onInstall}
              aria-describedby={templateTitleId}
            >
              Kampagne beginnen
            </Button>
            <p className="mt-2 text-center text-xs text-muted">Die Quests stehen ab heute in deinem Questlog.</p>
          </div>
        </Card>

        {/* Eigene Kampagne */}
        <Card as="article" padding="lg" aria-labelledby={customTitleId} className="flex flex-col">
          <div className="flex items-start gap-4">
            <div
              aria-hidden="true"
              className="grid size-14 shrink-0 place-items-center rounded-2xl bg-surface-raised text-[2rem] leading-none ring-1 ring-border-strong"
            >
              🏔️
            </div>
            <div className="min-w-0 flex-1 self-center">
              <h3
                id={customTitleId}
                className="font-display text-lg leading-snug font-semibold tracking-wide text-parchment"
              >
                Eigene Kampagne
              </h3>
            </div>
          </div>
          <p className="mt-3 text-[0.9375rem] text-parchment/85">
            Halbmarathon, neue Sprache, Schulden tilgen – setze dir dein eigenes großes Ziel und lege die Kapitel selbst
            fest.
          </p>
          <ul className="mt-4 space-y-2 text-sm text-parchment/90">
            {CUSTOM_POINTS.map((point) => (
              <li key={point} className="flex items-start gap-2">
                <Check aria-hidden className="mt-0.5 size-4 shrink-0 text-gold" />
                <span>{point}</span>
              </li>
            ))}
          </ul>
          <div className="mt-auto pt-6">
            <Button variant="secondary" size="lg" fullWidth onClick={onCreateCustom}>
              Eigene Kampagne erstellen
            </Button>
            <p className="mt-2 text-center text-xs text-muted">Kapitel kannst du jederzeit anpassen.</p>
          </div>
        </Card>
      </div>
    </section>
  )
}
