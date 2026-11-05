import { HeartHandshake, Moon, Sprout, Swords } from 'lucide-react'
import type { FormEvent, KeyboardEvent, ReactNode } from 'react'
import { useId, useRef, useState } from 'react'
import { MAX_COMPANION_NAME_LENGTH, markCompanionIntroSeen, setCompanion } from '../../data/repository'
import { COMPANION_SPECIES } from '../../domain/companion'
import { COMPANIONS } from '../../domain/companionDefinitions'
import type { CompanionSpecies, DayKey } from '../../domain/types'
import { companionGlowStyle } from '../../features/feedback/companionTheme'
import { Button, Card, TextField, cn, useToast } from '../../ui'
import { focusIsLost } from '../treasury/focus'
import { COMPANION_INTRO_HINT, COMPANION_NAME_SUGGESTIONS, companionIntroPoints, companionStartText } from './companionText'
import { nextTabbableAfter } from './dashboardFocus'

/** Symbole der Punkte in der Reihenfolge von `companionIntroPoints()`. */
const POINT_ICONS: ReactNode[] = [<Sprout key="grow" />, <Swords key="fight" />, <Moon key="sleep" />]

export interface CompanionIntroCardProps {
  /** Heutiger Spieltag – Tag der Wahl. */
  today: DayKey
  /** Aktive Tage des Helden (`state.totals.activeDays`) – danach richtet sich die Stufe, mit der der Gefährte startet. */
  activeDays: number
}

/**
 * Einmalige Einführung „Neu: Gefährten“ (Phase 3b) unter der Boss-Karte: erklärt kurz Wachstum, Mitkämpfen und
 * Schlafen und lässt gleich wählen – fünf Arten als Karten (Radiogruppe: Pfeiltasten wechseln) und ein Name
 * (vorgeschlagen je Art, bis zu 20 Zeichen). „Mit Flink losziehen“ speichert die Wahl (`setCompanion`) und merkt sich
 * die Einführung; „Später“ merkt sie sich nur (`markCompanionIntroSeen`) – wählen lässt sich dann auf der Heldenseite.
 */
export function CompanionIntroCard({ today, activeDays }: CompanionIntroCardProps) {
  const titleId = useId()
  const pickerLabelId = useId()
  const personalityId = useId()
  const { toast } = useToast()
  const [species, setSpecies] = useState<CompanionSpecies>('fox')
  // Eigener Name, sobald getippt; sonst der Vorschlag der gewählten Art.
  const [ownName, setOwnName] = useState<string | undefined>(undefined)
  const [busy, setBusy] = useState<'choose' | 'later' | undefined>(undefined)
  const [error, setError] = useState<string | undefined>(undefined)
  const name = ownName ?? COMPANION_NAME_SUGGESTIONS[species]
  const trimmed = name.trim()
  const definition = COMPANIONS[species]

  function showError(caught: unknown) {
    toast({
      tone: 'error',
      title: 'Das hat nicht geklappt',
      description: caught instanceof Error ? caught.message : 'Bitte versuche es noch einmal.',
    })
  }

  /** Die Karte verschwindet gleich samt Knopf: Der Fokus wandert zum nächsten Bedienelement darunter. */
  function focusAfter(card: Element | null) {
    const next = card ? nextTabbableAfter(card) : null
    return () => {
      if (next?.isConnected && focusIsLost()) next.focus({ preventScroll: true })
    }
  }

  async function choose(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (busy !== undefined) return
    if (trimmed === '') {
      setError('Gib deinem Gefährten einen Namen.')
      return
    }
    const restoreFocus = focusAfter(event.currentTarget.closest('[data-companion-intro]'))
    setBusy('choose')
    try {
      await setCompanion({ species, name: trimmed }, today)
      await markCompanionIntroSeen()
      restoreFocus()
    } catch (caught) {
      setBusy(undefined)
      showError(caught)
    }
  }

  async function later(card: Element | null) {
    if (busy !== undefined) return
    const restoreFocus = focusAfter(card)
    setBusy('later')
    try {
      await markCompanionIntroSeen()
      restoreFocus()
    } catch (caught) {
      setBusy(undefined)
      showError(caught)
    }
  }

  return (
    <Card as="section" aria-labelledby={titleId} padding="none" className="mb-5 md:mb-6" data-companion-intro="">
      <form onSubmit={(event) => void choose(event)} noValidate>
        <div className="px-4 pt-4 pb-3.5 sm:px-5 sm:pt-5 sm:pb-4">
          <div className="flex items-start gap-3">
            <span
              aria-hidden="true"
              className="grid size-10 shrink-0 place-items-center rounded-xl bg-black/25 text-gold ring-1 ring-white/10 ring-inset"
            >
              <HeartHandshake className="size-5" />
            </span>
            <div className="min-w-0">
              <p className="text-[0.6875rem] font-semibold tracking-[0.18em] text-gold uppercase">Neu</p>
              <h2 id={titleId} className="font-display text-[1.0625rem] leading-snug font-semibold tracking-wide text-parchment">
                Gefährten
              </h2>
              <p className="mt-0.5 text-sm text-muted">Ein treuer Begleiter für dein Abenteuer – such dir einen aus.</p>
            </div>
          </div>

          <ul className="mt-3 grid gap-x-6 gap-y-1.5 md:grid-cols-3 md:gap-y-2">
            {companionIntroPoints().map((point, index) => (
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

          <div className="mt-4 rounded-xl border border-border/80 bg-black/15 p-2.5 sm:p-3.5">
            <p id={pickerLabelId} className="mb-2 text-sm font-medium text-parchment">
              Wer begleitet dich?
            </p>
            <SpeciesPicker
              value={species}
              onChange={(next) => {
                setSpecies(next)
                setError(undefined)
              }}
              labelledBy={pickerLabelId}
              describedBy={personalityId}
            />
            <p id={personalityId} className="mt-2 min-h-10 text-sm leading-snug text-muted" data-companion-personality="">
              <span className="font-medium text-parchment">{definition.label}:</span> {definition.personality}{' '}
              <span className="text-faint">{companionStartText(definition, activeDays)}</span>
            </p>
            <TextField
              label="Name"
              value={name}
              onChange={(value) => {
                setOwnName(value)
                setError(undefined)
              }}
              maxLength={MAX_COMPANION_NAME_LENGTH}
              showCount
              error={error}
              hint={COMPANION_INTRO_HINT}
              autoComplete="off"
              fieldClassName="mt-3"
            />
          </div>
        </div>
        <div className="flex flex-col-reverse gap-2 px-4 pb-4 sm:flex-row sm:justify-end sm:px-5 sm:pb-5">
          <Button
            type="button"
            variant="ghost"
            onClick={(event) => void later(event.currentTarget.closest('[data-companion-intro]'))}
            loading={busy === 'later'}
            disabled={busy === 'choose'}
            className="max-sm:w-full"
          >
            Später
          </Button>
          <Button type="submit" loading={busy === 'choose'} disabled={busy === 'later'} className="max-sm:w-full">
            <span className="truncate">{trimmed !== '' ? `Mit ${trimmed} losziehen` : 'Gefährten wählen'}</span>
          </Button>
        </div>
      </form>
    </Card>
  )
}

/**
 * Fünf Arten als Karten – eine Radiogruppe: nur die gewählte ist per Tab erreichbar, Pfeiltasten/Home/End wechseln
 * (wie `SegmentedControl`). Die gewählte leuchtet golden.
 */
function SpeciesPicker({
  value,
  onChange,
  labelledBy,
  describedBy,
}: {
  value: CompanionSpecies
  onChange: (species: CompanionSpecies) => void
  labelledBy: string
  describedBy: string
}) {
  const buttons = useRef<(HTMLButtonElement | null)[]>([])

  function onKeyDown(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    const last = COMPANION_SPECIES.length - 1
    let next: number | undefined
    if (event.key === 'ArrowRight' || event.key === 'ArrowDown') next = index === last ? 0 : index + 1
    else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') next = index === 0 ? last : index - 1
    else if (event.key === 'Home') next = 0
    else if (event.key === 'End') next = last
    if (next === undefined) return
    event.preventDefault()
    onChange(COMPANION_SPECIES[next])
    buttons.current[next]?.focus()
  }

  return (
    <div role="radiogroup" aria-labelledby={labelledBy} aria-describedby={describedBy} className="grid grid-cols-5 gap-1 sm:gap-2">
      {COMPANION_SPECIES.map((species, index) => {
        const definition = COMPANIONS[species]
        const selected = species === value
        return (
          <button
            key={species}
            ref={(element) => {
              buttons.current[index] = element
            }}
            type="button"
            role="radio"
            aria-checked={selected}
            tabIndex={selected ? 0 : -1}
            onClick={() => onChange(species)}
            onKeyDown={(event) => onKeyDown(event, index)}
            data-species={species}
            className={cn(
              'flex min-h-[4.25rem] min-w-0 flex-col items-center justify-center gap-1 rounded-xl border px-0 py-2 transition-[border-color,background-color,box-shadow] duration-150 active:scale-95',
              selected
                ? 'border-gold/70 bg-gold/12 shadow-[0_0_16px_-6px_rgb(240_201_106/0.7)]'
                : 'border-border bg-surface/60 hover:border-gold/35 hover:bg-surface-hover',
            )}
          >
            <span
              aria-hidden="true"
              className="grid size-9 place-items-center rounded-full border text-[1.375rem] leading-none sm:size-10 sm:text-2xl"
              style={selected ? companionGlowStyle(2) : companionGlowStyle(0)}
            >
              {definition.icon}
            </span>
            <span
              className={cn(
                // Auf 360 px passt „Waschbär“ nur in 10 px – ab sm etwas größer.
                'max-w-full truncate text-[0.625rem] leading-tight font-medium tracking-tight sm:text-xs sm:tracking-normal',
                selected ? 'text-gold-bright' : 'text-muted',
              )}
            >
              {definition.label}
            </span>
          </button>
        )
      })}
    </div>
  )
}
