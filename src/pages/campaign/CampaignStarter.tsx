import { ArrowLeft, ArrowRight, Check, Lock, Plus } from 'lucide-react'
import { useId, useMemo } from 'react'
import type { Ref } from 'react'
import { Link } from 'react-router'
import { useGameContext } from '../../app/gameContext'
import type { AdventureChoice } from '../../data/seed'
import { BALANCING } from '../../domain/balancing'
import { campaignSlotsLeft } from '../../domain/campaigns'
import type { MainQuestState } from '../../domain/types'
import { BlueprintLibrary } from '../../features/blueprints'
import { Button, Card, Divider, Ornament, buttonClassName, cn, formatNumber } from '../../ui'

export interface CampaignStarterProps {
  /** first: noch keine laufende Kampagne; next: eine weitere Kampagne beginnen. */
  variant: 'first' | 'next'
  /** Ref auf die Überschrift (Fokus nach dem Öffnen bzw. nach dem Löschen der letzten Kampagne). */
  headingRef?: Ref<HTMLHeadingElement>
  /**
   * Kampagne aus der Bibliothek beginnen. Wirft nach einem Fehler (der Aufrufer zeigt ihn als Toast) –
   * dann bleibt die Einrichtung offen.
   */
  onStart: (choice: AdventureChoice) => Promise<void>
  onCreateCustom: () => void
  /** Zurück zur gezeigten Kampagne (nur `variant="next"`). */
  onBack?: () => void
  /** Laufende Kampagnen – wenn alle Plätze belegt sind, als Weg zum Beenden verlinkt. */
  active: readonly MainQuestState[]
}

const CUSTOM_POINTS = [
  'Dein Warum und deine Belohnung',
  'Kapitel zum Abhaken, Zählen oder automatisch aus Quests',
  'Zieldatum nach deiner Wahl',
]

/**
 * Eine Kampagne beginnen: die Kampagnen-Bibliothek (Vorlagen mit Stufe und Klassenwahl, freie Plätze) und
 * darunter der Weg zur eigenen Kampagne. Sind alle Plätze belegt, erklärt sie, wie einer frei wird.
 */
export function CampaignStarter({ variant, headingRef, onStart, onCreateCustom, onBack, active }: CampaignStarterProps) {
  const { data, today } = useGameContext()
  const headingId = useId()
  const customTitleId = useId()
  const fullNoteId = useId()
  const slotsLeft = useMemo(() => campaignSlotsLeft(data, today), [data, today])
  const full = slotsLeft <= 0
  const max = formatNumber(BALANCING.maxActiveCampaigns)

  return (
    <section aria-labelledby={headingId}>
      {onBack && (
        <Button variant="ghost" size="sm" icon={<ArrowLeft />} onClick={onBack} className="-ml-3 mb-2">
          Zurück zur Kampagne
        </Button>
      )}
      <div className="mb-6 flex flex-col items-center text-center sm:mb-8">
        <div
          aria-hidden="true"
          className="relative mb-4 grid size-16 place-items-center rounded-full bg-radial from-gold/20 to-gold/4 text-[1.875rem] ring-1 ring-gold/35"
        >
          <span className="absolute -inset-2 rounded-full ring-1 ring-gold/10" />
          {variant === 'first' ? '🗺️' : '📜'}
        </div>
        <h2
          id={headingId}
          ref={headingRef}
          tabIndex={-1}
          className="font-display text-xl font-semibold tracking-wide text-parchment focus:outline-none sm:text-2xl"
        >
          {variant === 'first' ? 'Wähle deine Kampagne' : 'Neue Kampagne beginnen'}
        </h2>
        <Ornament className="mt-2 h-3 w-16 text-gold-dim" />
        <p className="mt-3 max-w-lg text-[0.9375rem] text-muted">
          {variant === 'first'
            ? 'Eine Kampagne ist dein großes Ziel, aufgeteilt in Kapitel. Deine täglichen Quests bringen dich Schritt für Schritt voran. '
            : 'Wähle eine Vorlage aus der Bibliothek oder erschaffe deine eigene. '}
          Bis zu {max} Kampagnen laufen gleichzeitig.
        </p>
      </div>

      <BlueprintLibrary mode="start" onConfirm={onStart} fullHint={<EndCampaignLinks campaigns={active} />} />

      <Divider label="Oder ganz nach deinen Regeln" className="mt-8 mb-5" />

      <Card as="article" padding="lg" aria-labelledby={customTitleId}>
        <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:gap-6">
          <div className="flex min-w-0 flex-1 items-start gap-4">
            <div
              aria-hidden="true"
              className="grid size-14 shrink-0 place-items-center rounded-2xl bg-surface-raised text-[2rem] leading-none ring-1 ring-border-strong"
            >
              🏔️
            </div>
            <div className="min-w-0 flex-1">
              <h3
                id={customTitleId}
                className="font-display text-lg leading-snug font-semibold tracking-wide text-parchment"
              >
                Eigene Kampagne
              </h3>
              <p className="mt-1 text-[0.9375rem] text-parchment/85">
                Halbmarathon, Schulden tilgen, ein eigenes Projekt – setze dir dein großes Ziel und lege die Kapitel
                selbst fest.
              </p>
              <ul className="mt-3 space-y-1.5 text-sm text-parchment/90">
                {CUSTOM_POINTS.map((point) => (
                  <li key={point} className="flex items-start gap-2">
                    <Check aria-hidden className="mt-0.5 size-4 shrink-0 text-gold" />
                    <span>{point}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
          <div className="flex shrink-0 flex-col gap-2 sm:min-w-60">
            <Button
              variant="secondary"
              size="lg"
              fullWidth
              icon={full ? <Lock /> : <Plus />}
              onClick={onCreateCustom}
              disabled={full}
              aria-describedby={full ? fullNoteId : undefined}
            >
              Eigene Kampagne erstellen
            </Button>
            <p id={fullNoteId} className={cn('text-center text-xs', full ? 'text-warning' : 'text-muted')}>
              {full ? 'Erst wieder, wenn ein Platz frei ist.' : 'Kapitel kannst du jederzeit anpassen.'}
            </p>
          </div>
        </div>
      </Card>
    </section>
  )
}

/** Wenn alle Plätze belegt sind: die laufenden Kampagnen, um eine davon zu beenden. */
function EndCampaignLinks({ campaigns }: { campaigns: readonly MainQuestState[] }) {
  if (campaigns.length === 0) return null
  return (
    <div>
      <p className="text-sm text-parchment/90">
        Öffne eine Kampagne und wähle <span className="font-medium text-parchment">„Kampagne beenden“</span> – deine
        verdienten XP bleiben erhalten.
      </p>
      <ul aria-label="Laufende Kampagnen" className="mt-2.5 flex flex-wrap gap-2">
        {campaigns.map(({ quest }) => (
          <li key={quest.id} className="min-w-0 max-w-full">
            <Link
              to={`/kampagne?${new URLSearchParams({ id: quest.id }).toString()}`}
              className={cn(buttonClassName({ variant: 'secondary', size: 'sm' }), 'max-w-full')}
            >
              <span aria-hidden="true">{quest.icon}</span>
              <span className="min-w-0 truncate">{quest.title}</span>
              <ArrowRight aria-hidden />
            </Link>
          </li>
        ))}
      </ul>
    </div>
  )
}
