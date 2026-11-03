import { ArrowRight, Mountain, ScrollText, Sparkles } from 'lucide-react'
import type { ReactNode } from 'react'
import { AppLogo } from '../../app/AppLogo'
import { Button, Divider } from '../../ui'
import { RestoreBackupButton } from '../settings/RestoreBackupButton'
import { StepActions, StepHeading } from './StepParts'

const LORE: { icon: ReactNode; title: string; text: string }[] = [
  {
    icon: <ScrollText />,
    title: 'Gewohnheiten werden Quests',
    text: 'Lesen, Sport, früh ins Bett – jede tägliche Gewohnheit ist eine Quest, die du abhakst.',
  },
  {
    icon: <Sparkles />,
    title: 'Sammle XP und steig auf',
    text: 'Jede erledigte Quest bringt Erfahrung. Du steigst im Level auf und stärkst sechs Attribute.',
  },
  {
    icon: <Mountain />,
    title: 'Eine große Kampagne',
    text: 'Alle Quests dienen deinem großen Ziel – Kapitel für Kapitel, bis du triumphierst.',
  },
]

export interface WelcomeStepProps {
  onStart: () => void
  focusOnMount: boolean
}

/** Schritt 1: Logo, kurze Geschichte, Start – oder ein Backup wiederherstellen. */
export function WelcomeStep({ onStart, focusOnMount }: WelcomeStepProps) {
  return (
    <div className="flex flex-1 flex-col">
      <div className="flex flex-col items-center pt-4 sm:pt-8">
        <AppLogo size="lg" className="flex-col !gap-3" />
      </div>

      <StepHeading
        align="center"
        className="mt-8"
        eyebrow="Ein neues Abenteuer"
        title="Willkommen"
        subtitle="Hier wird dein Alltag zur Heldensage. Kleine Taten, jeden Tag – und du wirst stärker."
        focusOnMount={focusOnMount}
      />

      <ul className="mt-8 flex flex-col gap-3">
        {LORE.map((item) => (
          <li
            key={item.title}
            className="flex items-start gap-3.5 rounded-2xl border border-border bg-linear-to-b from-surface-raised/70 to-surface/70 p-4 shadow-card"
          >
            <span
              aria-hidden="true"
              className="grid size-10 shrink-0 place-items-center rounded-xl bg-gold/10 text-gold ring-1 ring-gold/25 ring-inset [&_svg]:size-5"
            >
              {item.icon}
            </span>
            <div className="min-w-0">
              <p className="font-display text-[0.9375rem] font-semibold tracking-wide text-parchment">{item.title}</p>
              <p className="mt-0.5 text-sm leading-relaxed text-muted">{item.text}</p>
            </div>
          </li>
        ))}
      </ul>

      <StepActions sticky={false}>
        <Button size="lg" fullWidth iconRight={<ArrowRight />} onClick={onStart}>
          Abenteuer beginnen
        </Button>
        <Divider label="oder" className="mt-5" />
        <div className="mt-2 flex flex-col items-center text-center">
          <RestoreBackupButton
            variant="ghost"
            className="text-gold hover:text-gold-bright"
            warning="Dein Spielstand wird aus der Datei übernommen – danach geht dein Abenteuer direkt weiter."
          />
          <p className="text-xs text-muted">Du hast schon gespielt? Hol deinen Spielstand aus einer Backup-Datei zurück.</p>
        </div>
      </StepActions>
    </div>
  )
}
