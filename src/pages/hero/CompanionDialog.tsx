import { Check, HeartHandshake, PawPrint, Repeat } from 'lucide-react'
import { useId, useRef, useState } from 'react'
import type { FormEvent, KeyboardEvent } from 'react'
import { MAX_COMPANION_NAME_LENGTH, setCompanion } from '../../data/repository'
import { COMPANION_SPECIES, companionStage, companionStageName } from '../../domain/companion'
import { COMPANIONS } from '../../domain/companionDefinitions'
import type { CompanionSpecies, CompanionState, DayKey } from '../../domain/types'
import { companionGlowStyle } from '../../features/feedback/companionTheme'
import { Badge, Button, Dialog, TextField, cn, useToast } from '../../ui'
import { errorMessage } from '../settings/errorMessage'
import { COMPANION_NAME_SUGGESTIONS, COMPANION_SWITCH_HINT, companionSwitchText } from './companionView'

/** `choose`: erste Wahl · `switch`: Art wechseln (Name bleibt, änderbar) · `rename`: nur den Namen ändern. */
export type CompanionDialogMode = 'choose' | 'switch' | 'rename'

export interface CompanionDialogProps {
  open: boolean
  onClose: () => void
  mode: CompanionDialogMode
  /** Der aktuelle Gefährte (für `switch` und `rename`). */
  companion?: CompanionState
  /** Heutiger Spieltag – Tag der Wahl bei einer neuen Art. */
  today: DayKey
  /**
   * Aktive Tage des Helden (`state.totals.activeDays`): Bei der ersten Wahl zeigt jede Art die Stufe, mit der sie
   * startet (die Stufe hängt an den aktiven Tagen, nicht am Tag der Wahl). Danach gilt die Stufe des Gefährten.
   */
  activeDays?: number
}

const TITLES: Record<CompanionDialogMode, string> = {
  choose: 'Wähle deinen Gefährten',
  switch: 'Art wechseln',
  rename: 'Gefährten umbenennen',
}

/**
 * Gefährte wählen, wechseln oder umbenennen (Phase 3b, `setCompanion`). Wählen/Wechseln: fünf Arten als Radiogruppe
 * (Pfeiltasten wechseln) mit Persönlichkeit und dem Namen der Stufe, die der Gefährte gerade hätte – die Stufe hängt
 * an den aktiven Tagen, nicht an der Art. Bei der ersten Wahl steht ein Namensvorschlag je Art im Feld, bis etwas
 * Eigenes getippt wird; beim Wechsel bleibt der bisherige Name.
 * Tipp: Mit wechselndem `key` öffnen, damit das Formular jedes Mal frisch startet.
 */
export function CompanionDialog({ open, onClose, mode, companion, today, activeDays = 0 }: CompanionDialogProps) {
  const { toast } = useToast()
  const formId = useId()
  const pickerLabelId = useId()
  const nameRef = useRef<HTMLInputElement>(null)
  const pickerRef = useRef<HTMLElement>(null)
  const stage = companion?.stage ?? companionStage(activeDays)
  const [species, setSpecies] = useState<CompanionSpecies>(companion?.choice.species ?? 'fox')
  // Eigener Name, sobald getippt (bzw. der bisherige); sonst der Vorschlag der gewählten Art.
  const [ownName, setOwnName] = useState<string | undefined>(companion?.choice.name)
  const [error, setError] = useState<string | undefined>(undefined)
  const [saving, setSaving] = useState(false)
  const name = ownName ?? COMPANION_NAME_SUGGESTIONS[species]
  const trimmed = name.trim()

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    if (saving) return
    if (trimmed === '') {
      setError('Gib deinem Gefährten einen Namen.')
      nameRef.current?.focus()
      return
    }
    if (companion !== undefined && companion.choice.species === species && companion.choice.name === trimmed) {
      onClose()
      return
    }
    setSaving(true)
    try {
      await setCompanion({ species, name: trimmed }, today)
      const definition = COMPANIONS[species]
      if (mode === 'choose' || companion === undefined) {
        toast({ tone: 'success', title: `${trimmed} schließt sich dir an!`, description: `${definition.icon} ${definition.personality}` })
      } else if (companion.choice.species !== species) {
        toast({ tone: 'success', title: 'Gefährte gewechselt', description: companionSwitchText(trimmed, definition, stage) })
      } else {
        toast({ tone: 'success', title: 'Name gespeichert', description: `Dein Gefährte heißt jetzt ${trimmed}.` })
      }
      onClose()
    } catch (saveError) {
      toast({ tone: 'error', title: 'Speichern fehlgeschlagen', description: errorMessage(saveError) })
    } finally {
      setSaving(false)
    }
  }

  const submitLabel =
    mode === 'rename' ? 'Speichern' : mode === 'switch' ? 'Wechseln' : trimmed !== '' ? `Mit ${trimmed} losziehen` : 'Gefährten wählen'

  return (
    <Dialog
      open={open}
      onClose={saving ? () => {} : onClose}
      title={TITLES[mode]}
      description={
        mode === 'rename'
          ? 'Ein neuer Name – dieselbe treue Seele.'
          : mode === 'switch'
            ? COMPANION_SWITCH_HINT
            : 'Ein treuer Begleiter für dein Abenteuer. Name und Art kannst du jederzeit ändern.'
      }
      icon={mode === 'switch' ? <Repeat /> : mode === 'rename' ? <PawPrint /> : <HeartHandshake />}
      size={mode === 'rename' ? 'sm' : 'md'}
      initialFocusRef={mode === 'rename' ? nameRef : pickerRef}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={saving}>
            Abbrechen
          </Button>
          <Button type="submit" form={formId} icon={<Check />} loading={saving} className="min-w-0">
            <span className="truncate">{submitLabel}</span>
          </Button>
        </>
      }
    >
      <form id={formId} noValidate onSubmit={(event) => void handleSubmit(event)} className="flex flex-col gap-4">
        {mode !== 'rename' && (
          <div>
            <p id={pickerLabelId} className="mb-2 text-sm font-medium text-parchment">
              Wer begleitet dich?
            </p>
            <SpeciesList
              value={species}
              current={companion?.choice.species}
              stage={stage}
              onChange={(next) => {
                setSpecies(next)
                setError(undefined)
              }}
              labelledBy={pickerLabelId}
              selectedRef={pickerRef}
            />
          </div>
        )}
        <TextField
          ref={nameRef}
          label="Name"
          required
          value={name}
          onChange={(value) => {
            setOwnName(value)
            setError(undefined)
          }}
          maxLength={MAX_COMPANION_NAME_LENGTH}
          showCount
          error={error}
          autoComplete="off"
          autoCapitalize="words"
          spellCheck={false}
        />
      </form>
    </Dialog>
  )
}

/**
 * Die fünf Arten als Liste (Radiogruppe: nur die gewählte ist per Tab erreichbar, Pfeiltasten/Pos1/Ende wechseln):
 * Emoji im Ring der aktuellen Stufe, Art, Name der Stufe und Persönlichkeit. Die gewählte leuchtet golden.
 */
function SpeciesList({
  value,
  current,
  stage,
  onChange,
  labelledBy,
  selectedRef,
}: {
  value: CompanionSpecies
  /** Die bisherige Art (Kennzeichen „Bisher“). */
  current?: CompanionSpecies
  stage: number
  onChange: (species: CompanionSpecies) => void
  labelledBy: string
  /** Ref auf die gewählte Option (Startfokus des Dialogs). */
  selectedRef: { current: HTMLElement | null }
}) {
  const buttons = useRef<(HTMLButtonElement | null)[]>([])

  function onKeyDown(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    const last = COMPANION_SPECIES.length - 1
    let next: number | undefined
    if (event.key === 'ArrowDown' || event.key === 'ArrowRight') next = index === last ? 0 : index + 1
    else if (event.key === 'ArrowUp' || event.key === 'ArrowLeft') next = index === 0 ? last : index - 1
    else if (event.key === 'Home') next = 0
    else if (event.key === 'End') next = last
    if (next === undefined) return
    event.preventDefault()
    onChange(COMPANION_SPECIES[next])
    buttons.current[next]?.focus()
  }

  return (
    <div role="radiogroup" aria-labelledby={labelledBy} className="flex flex-col gap-1.5">
      {COMPANION_SPECIES.map((species, index) => {
        const definition = COMPANIONS[species]
        const selected = species === value
        const stageName = companionStageName(definition, stage)
        return (
          <button
            key={species}
            ref={(element) => {
              buttons.current[index] = element
              // Der Dialog setzt den Startfokus auf die gewählte Option.
              if (selected) selectedRef.current = element
            }}
            type="button"
            role="radio"
            aria-checked={selected}
            tabIndex={selected ? 0 : -1}
            onClick={() => onChange(species)}
            onKeyDown={(event) => onKeyDown(event, index)}
            data-species={species}
            className={cn(
              'flex w-full min-w-0 items-center gap-3 rounded-xl border px-3 py-2.5 text-left transition-[border-color,background-color,box-shadow] duration-150 active:scale-[0.99]',
              selected
                ? 'border-gold/70 bg-gold/12 shadow-[0_0_16px_-6px_rgb(240_201_106/0.7)]'
                : 'border-border bg-surface/60 hover:border-gold/35 hover:bg-surface-hover',
            )}
          >
            <span
              aria-hidden="true"
              className="grid size-11 shrink-0 place-items-center rounded-full border bg-radial from-white/10 to-black/30 text-2xl leading-none"
              style={companionGlowStyle(selected ? Math.max(stage, 2) : stage)}
            >
              {definition.icon}
            </span>
            <span className="min-w-0 flex-1">
              <span className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                <span className={cn('font-semibold', selected ? 'text-gold-bright' : 'text-parchment')}>
                  {definition.label}
                </span>
                <span className="text-xs text-muted">als {stageName}</span>
                {current === species && <Badge className="h-5 px-1.5 text-[0.6875rem]">Bisher</Badge>}
              </span>
              <span className="mt-0.5 block text-[0.8125rem] leading-snug text-muted">{definition.personality}</span>
            </span>
          </button>
        )
      })}
    </div>
  )
}
