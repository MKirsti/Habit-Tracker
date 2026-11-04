import { ArrowRight } from 'lucide-react'
import { useRef, useState } from 'react'
import type { FormEvent } from 'react'
import { CLASS_DEFINITIONS } from '../../domain/combat/classDefinitions'
import { classNameFor } from '../../domain/combat/classes'
import { xpToNextLevel } from '../../domain/leveling'
import type { GrammaticalForm } from '../../domain/types'
import { Button, Card, TextField, XpBar } from '../../ui'
import { AvatarMedallion } from '../hero/AvatarMedallion'
import { AvatarPicker } from '../hero/AvatarPicker'
import { FormChoice } from '../hero/FormChoice'
import { HERO_NAME_MAX, heroStepHeading, validateHeroName } from '../hero/heroProfile'
import { StepActions, StepHeading } from './StepParts'

export interface HeroStepProps {
  name: string
  avatar: string
  /** Sprachform für Klassen- und Titelnamen (Standard im Onboarding: neutral). */
  form: GrammaticalForm
  onNameChange: (name: string) => void
  onAvatarChange: (avatar: string) => void
  onFormChange: (form: GrammaticalForm) => void
  onNext: () => void
  focusOnMount: boolean
}

/** Schritt 2: Name, Avatar und Sprachform des Helden, mit Live-Vorschau. */
export function HeroStep({
  name,
  avatar,
  form,
  onNameChange,
  onAvatarChange,
  onFormChange,
  onNext,
  focusOnMount,
}: HeroStepProps) {
  const nameRef = useRef<HTMLInputElement>(null)
  // Fehler erst nach dem ersten Absenden zeigen – danach live aktualisieren.
  const [submitted, setSubmitted] = useState(false)
  const error = submitted ? validateHeroName(name) : undefined

  function handleSubmit(event: FormEvent) {
    event.preventDefault()
    setSubmitted(true)
    if (validateHeroName(name) !== undefined) {
      nameRef.current?.focus()
      return
    }
    onNext()
  }

  return (
    <form noValidate onSubmit={handleSubmit} className="flex flex-1 flex-col">
      <StepHeading
        {...heroStepHeading(form)}
        subtitle="Wie sollen dich die Barden nennen? Name, Avatar und Sprachform kannst du später jederzeit ändern."
        focusOnMount={focusOnMount}
      />

      <HeroPreview name={name} avatar={avatar} form={form} />

      <div className="mt-6 flex flex-col gap-6">
        <TextField
          ref={nameRef}
          label="Name"
          required
          value={name}
          onChange={onNameChange}
          maxLength={HERO_NAME_MAX}
          showCount
          error={error}
          placeholder="z. B. Aria"
          autoComplete="nickname"
          autoCapitalize="words"
          enterKeyHint="next"
          spellCheck={false}
        />
        <AvatarPicker value={avatar} onChange={onAvatarChange} />
        <FormChoice value={form} onChange={onFormChange} />
      </div>

      <StepActions>
        <Button type="submit" size="lg" fullWidth iconRight={<ArrowRight />}>
          Weiter
        </Button>
      </StepActions>
    </form>
  )
}

/**
 * Live-Vorschau des Helden auf Level 1 mit seiner Startklasse in der gewählten Sprachform (rein visuell, die Angaben
 * stehen im Formular darunter).
 */
function HeroPreview({ name, avatar, form }: { name: string; avatar: string; form: GrammaticalForm }) {
  const trimmed = name.trim()
  const start = CLASS_DEFINITIONS.adventurer
  return (
    <Card tone="gold" ornate padding="none" aria-hidden="true" as="div" className="mt-6 p-6">
      <div className="flex items-center gap-4">
        <AvatarMedallion avatar={avatar} size="lg" />
        <div className="min-w-0 flex-1">
          <p className="truncate font-display text-xl leading-tight font-bold tracking-wide text-parchment">
            {trimmed === '' ? <span className="text-faint">Dein Name</span> : trimmed}
          </p>
          <p className="mt-1 text-sm font-semibold text-gold-bright">
            Level 1 · {start.icon} {classNameFor(start, form)}
          </p>
          <p className="mt-0.5 text-xs text-muted">Tag 1 deines Abenteuers</p>
        </div>
      </div>
      <XpBar level={1} xpIntoLevel={0} xpForNextLevel={xpToNextLevel(1)} compact showLevel={false} className="mt-4" />
    </Card>
  )
}
