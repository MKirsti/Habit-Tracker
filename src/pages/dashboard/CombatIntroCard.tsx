import { Gift, Shield, Swords, Sword } from 'lucide-react'
import type { MouseEvent, ReactNode } from 'react'
import { useId, useState } from 'react'
import { markCombatIntroSeen, updateProfile } from '../../data/repository'
import { GRAMMATICAL_FORMS, GRAMMATICAL_FORM_LABELS } from '../../domain/combat/classDefinitions'
import { classNameFor } from '../../domain/combat/classes'
import type { GrammaticalForm, HeroClassDefinition } from '../../domain/types'
import { Button, Card, SegmentedControl, useToast } from '../../ui'
import { focusIsLost } from '../treasury/focus'
import { BOSS_COLOR } from './bossTheme'
import { combatIntroPoints } from './combatText'
import { nextTabbableAfter } from './dashboardFocus'

/** Symbole der Punkte in der Reihenfolge von `combatIntroPoints()`. */
const POINT_ICONS: ReactNode[] = [
  <Shield key="class" />,
  <Sword key="attack" />,
  <Swords key="boss" />,
  <Gift key="loot" />,
]

export interface CombatIntroCardProps {
  /** Gespeicherte Sprachform (`profile.form`, fehlt = neutral). */
  form?: GrammaticalForm
  /** Aktuelle Klasse – für die Vorschau „So heißt du: 🔮 Magierin“. */
  heroClass: HeroClassDefinition
}

/**
 * Einmalige Einführung „Neu: Klassen, Bosse & Beute“ (Phase 3a) unter der Boss-Karte: erklärt kurz Klasse, Angriffe,
 * Wochen-Boss (Entkommen kostet nichts) und Truhen – und lässt die Sprachform für Klassen und Titel wählen
 * (Heldin / Held / Neutral). Die Wahl wird sofort gespeichert (`updateProfile({ form })`), damit der Helden-Kopf
 * darüber gleich passt; „Los geht’s“ merkt sich die Einführung dauerhaft (`markCombatIntroSeen`).
 */
export function CombatIntroCard({ form, heroClass }: CombatIntroCardProps) {
  const titleId = useId()
  const { toast } = useToast()
  const [busy, setBusy] = useState(false)
  // Sofort anzeigen, was gewählt wurde – die Live-Daten ziehen nach (bei einem Fehler zurück auf das Gespeicherte).
  const [chosen, setChosen] = useState<GrammaticalForm | undefined>(undefined)
  const current = chosen ?? form ?? 'neutral'

  function showError(error: unknown) {
    toast({
      tone: 'error',
      title: 'Das hat nicht geklappt',
      description: error instanceof Error ? error.message : 'Bitte versuche es noch einmal.',
    })
  }

  async function chooseForm(next: GrammaticalForm) {
    setChosen(next)
    try {
      await updateProfile({ form: next })
    } catch (error) {
      setChosen(undefined)
      showError(error)
    }
  }

  async function confirm(event: MouseEvent<HTMLButtonElement>) {
    // Die Karte verschwindet gleich samt Knopf: Der Fokus wandert zum nächsten Bedienelement darunter.
    const card = event.currentTarget.closest('[data-combat-intro]')
    const next = card ? nextTabbableAfter(card) : null
    setBusy(true)
    try {
      await markCombatIntroSeen()
      if (next?.isConnected && focusIsLost()) next.focus({ preventScroll: true })
    } catch (error) {
      showError(error)
      setBusy(false)
    }
  }

  return (
    <Card as="section" aria-labelledby={titleId} padding="none" className="mb-5 md:mb-6" data-combat-intro="">
      <div className="px-4 pt-4 pb-3.5 sm:px-5 sm:pt-5 sm:pb-4">
        <div className="flex items-start gap-3">
          <span
            aria-hidden="true"
            className="grid size-10 shrink-0 place-items-center rounded-xl bg-black/25 ring-1 ring-white/10 ring-inset"
          >
            <Swords className="size-5" style={{ color: BOSS_COLOR }} />
          </span>
          <div className="min-w-0">
            <p className="text-[0.6875rem] font-semibold tracking-[0.18em] text-gold uppercase">Neu</p>
            <h2 id={titleId} className="font-display text-[1.0625rem] leading-snug font-semibold tracking-wide text-parchment">
              Klassen, Bosse &amp; Beute
            </h2>
            <p className="mt-0.5 text-sm text-muted">Deine Quests werden zu Abenteuern – mit Gegnern, Klassen und Schätzen.</p>
          </div>
        </div>

        <ul className="mt-3 grid gap-x-6 gap-y-1.5 md:grid-cols-2 md:gap-y-2">
          {combatIntroPoints().map((point, index) => (
            <li key={point.title} className="flex items-start gap-2.5 text-sm">
              <span aria-hidden="true" className="mt-0.5 text-gold [&_svg]:size-4">
                {POINT_ICONS[index]}
              </span>
              <span className="min-w-0 text-muted">
                <strong className="font-semibold text-parchment">{point.title}</strong> {point.text}
              </span>
            </li>
          ))}
        </ul>

        <div className="mt-4 rounded-xl border border-border/80 bg-black/15 p-3 sm:p-3.5">
          <SegmentedControl
            label="Wie sollen Klassen und Titel dich nennen?"
            value={current}
            onChange={(next) => void chooseForm(next)}
            options={GRAMMATICAL_FORMS.map((value) => ({ value, label: GRAMMATICAL_FORM_LABELS[value] }))}
            size="sm"
            hint={
              <>
                Deine Klasse:{' '}
                <span className="font-medium text-parchment" data-combat-intro-preview="">
                  <span aria-hidden="true">{heroClass.icon} </span>
                  {classNameFor(heroClass, current)}
                </span>{' '}
                · jederzeit änderbar auf deiner Heldenseite.
              </>
            }
          />
        </div>
      </div>
      <div className="flex justify-end px-4 pb-4 sm:px-5 sm:pb-5">
        <Button onClick={(event) => void confirm(event)} loading={busy} className="max-sm:w-full">
          Los geht’s
        </Button>
      </div>
    </Card>
  )
}
