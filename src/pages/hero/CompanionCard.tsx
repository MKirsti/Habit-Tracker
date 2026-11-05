import { Check, HeartHandshake, Moon, Pencil, Repeat, Sprout, Swords } from 'lucide-react'
import { motion } from 'motion/react'
import { useId, useState } from 'react'
import type { CSSProperties, ReactNode } from 'react'
import { COMPANION_SPECIES } from '../../domain/companion'
import { COMPANIONS } from '../../domain/companionDefinitions'
import type { CompanionState, DayKey } from '../../domain/types'
import { companionGlow, companionGlowStyle, stageLine } from '../../features/feedback/companionTheme'
import { Badge, Button, Card, ProgressBar, cn } from '../../ui'
import { CompanionDialog } from './CompanionDialog'
import type { CompanionDialogMode } from './CompanionDialog'
import {
  COMPANION_ANCHOR,
  companionCombatText,
  companionGrowth,
  companionSleepText,
  companionStageSteps,
  stageThresholdText,
} from './companionView'

export interface CompanionCardProps {
  /** `GameState.companion` – fehlt, solange keiner gewählt ist (dann die Einladung zur Wahl). */
  companion?: CompanionState
  today: DayKey
  /** Einstellung „Effekte“: Schimmer der legendären Stufe. */
  effects: boolean
  /** Aktive Tage des Helden (`state.totals.activeDays`) – Stufe, mit der ein neu gewählter Gefährte startet. */
  activeDays?: number
}

/** Emoji-Größe je Stufe: Jungtiere sind klein, Legendäre füllen den Ring. */
const EMOJI_SIZE = [
  'text-[2.125rem] sm:text-[2.75rem]',
  'text-[2.375rem] sm:text-[3.125rem]',
  'text-[2.625rem] sm:text-[3.5rem]',
  'text-[2.875rem] sm:text-[3.875rem]',
]

/**
 * Held → Übersicht (Phase 3b): der Gefährte – großes Emoji im Ring seiner Stufe (Jungtier kaum leuchtend … Legendär
 * strahlend, schlafend gedimmt mit 💤), Name, Art und Stufe, Text der Stufe, Wachstum zur nächsten Stufe
 * („noch 6 aktive Tage bis Flammendrache“), die Stufen-Leiter, das Mitkämpfen und „Umbenennen“ / „Art wechseln“.
 * Ohne Gefährten: Einladung „Wähle deinen Gefährten“. Anker `#gefaehrte` (Abzeichen der Tagesübersicht).
 */
export function CompanionCard({ companion, today, effects, activeDays }: CompanionCardProps) {
  const [dialog, setDialog] = useState<{ mode: CompanionDialogMode; key: number } | undefined>(undefined)
  const [dialogOpen, setDialogOpen] = useState(false)

  function openDialog(mode: CompanionDialogMode) {
    setDialog((current) => ({ mode, key: (current?.key ?? 0) + 1 }))
    setDialogOpen(true)
  }

  const dialogElement = dialog && (
    <CompanionDialog
      key={dialog.key}
      open={dialogOpen}
      onClose={() => setDialogOpen(false)}
      mode={dialog.mode}
      companion={companion}
      today={today}
      activeDays={activeDays}
    />
  )

  if (companion === undefined) {
    return (
      <>
        <CompanionInvite onChoose={() => openDialog('choose')} />
        {dialogElement}
      </>
    )
  }

  return (
    <>
      <CompanionSheet companion={companion} effects={effects} onAction={openDialog} />
      {dialogElement}
    </>
  )
}

function CompanionInvite({ onChoose }: { onChoose: () => void }) {
  const titleId = useId()
  return (
    <Card
      id={COMPANION_ANCHOR}
      tabIndex={-1}
      aria-labelledby={titleId}
      data-companion-card="empty"
      className="scroll-mt-6 overflow-hidden outline-none"
    >
      <div className="flex flex-col items-center gap-4 py-2 text-center sm:flex-row sm:items-center sm:gap-6 sm:text-left">
        <ul aria-hidden="true" className="flex shrink-0 -space-x-2">
          {COMPANION_SPECIES.map((species, index) => (
            <li
              key={species}
              className="grid size-12 place-items-center rounded-full border bg-radial from-surface-raised to-bg-deep text-2xl leading-none"
              style={{ ...companionGlowStyle(index === 2 ? 2 : 0), zIndex: index === 2 ? 1 : undefined }}
            >
              {COMPANIONS[species].icon}
            </li>
          ))}
        </ul>
        <div className="min-w-0 flex-1">
          <p className="text-xs font-semibold tracking-[0.2em] text-gold uppercase">Gefährte</p>
          <h2 id={titleId} className="mt-0.5 font-display text-[1.375rem] leading-tight font-bold tracking-wide text-parchment">
            Wähle deinen Gefährten
          </h2>
          <p className="mt-1.5 max-w-prose text-sm leading-relaxed text-muted">
            Drache, Waschbär, Schlange, Eule oder Fuchs: Dein Gefährte wächst mit jedem aktiven Tag und springt an Perfekten
            Tagen mit in den Kampf. Verloren geht er nie.
          </p>
        </div>
        <Button icon={<HeartHandshake />} onClick={onChoose} className="shrink-0 max-sm:w-full">
          Gefährten wählen
        </Button>
      </div>
    </Card>
  )
}

interface CompanionSheetProps {
  companion: CompanionState
  effects: boolean
  onAction: (mode: CompanionDialogMode) => void
}

function CompanionSheet({ companion, effects, onAction }: CompanionSheetProps) {
  const titleId = useId()
  const { choice, definition, sleeping } = companion
  const growth = companionGrowth(companion)
  const stage = growth.stage
  const glow = companionGlow(stage)
  const description = definition.stages[stage]?.description
  const steps = companionStageSteps(definition, stage)

  return (
    <Card
      id={COMPANION_ANCHOR}
      tabIndex={-1}
      padding="none"
      aria-labelledby={titleId}
      data-companion-card={choice.species}
      data-companion-stage={stage}
      data-companion-sleeping={sleeping ? '' : undefined}
      style={{ '--companion': glow.color, '--companion-20': `color-mix(in srgb, ${glow.color} 20%, transparent)` } as CSSProperties}
      className="scroll-mt-6 overflow-hidden outline-none"
    >
      <span
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 top-0 h-28 bg-linear-to-b from-(--companion-20) to-transparent opacity-70"
      />
      <div className="relative grid gap-6 px-5 pt-5 pb-5 sm:px-6 sm:pt-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)] lg:gap-8">
        {/* Wer dich begleitet */}
        <div className="flex min-w-0 items-start gap-4 sm:gap-5">
          <CompanionMedallion companion={companion} effects={effects} />
          <div className="min-w-0 flex-1">
            <p aria-hidden="true" className="text-xs font-semibold tracking-[0.2em] text-gold uppercase">
              Dein Gefährte
            </p>
            <h2
              id={titleId}
              className="mt-0.5 font-display text-[1.5rem] leading-tight font-bold tracking-wide wrap-anywhere text-parchment sm:text-[1.75rem]"
            >
              <span className="sr-only">Dein Gefährte:</span> {choice.name}
            </h2>
            <p className="mt-1 text-[0.8125rem] text-muted">
              <span aria-hidden="true">{definition.icon} </span>
              {definition.label} · <span className="font-medium text-parchment">{growth.stageName}</span>
            </p>
            <p className="mt-2 flex flex-wrap items-center gap-1.5">
              <Badge color={glow.color}>{stageLine(stage)}</Badge>
              {sleeping && (
                <Badge icon={<Moon />} data-companion-zzz="">
                  schläft
                </Badge>
              )}
            </p>
            {description && <p className="mt-3 text-sm leading-relaxed text-parchment/90">{description}</p>}
            {sleeping ? (
              <p className="mt-2 text-[0.8125rem] leading-snug text-muted">{companionSleepText(choice.name)}</p>
            ) : (
              <p className="mt-2 text-[0.8125rem] leading-snug text-muted italic">{definition.personality}</p>
            )}
          </div>
        </div>

        {/* Wachstum, Stufen, Kampf */}
        <div className="flex min-w-0 flex-col gap-4">
          <CompanionDetail title="Wachstum" icon={<Sprout aria-hidden />}>
            <ProgressBar
              value={growth.progress}
              color={glow.color}
              glow={!sleeping}
              aria-label={`Wachstum von ${choice.name}`}
              valueText={growth.spoken}
            />
            <p className="mt-1.5 text-sm text-parchment" data-companion-growth="">
              {growth.text}
            </p>
          </CompanionDetail>

          <CompanionDetail title="Stufen" icon={<Check aria-hidden />}>
            <ol className="grid grid-cols-2 gap-1.5 sm:grid-cols-4 lg:grid-cols-2">
              {steps.map((step) => (
                <li
                  key={step.stage}
                  aria-current={step.status === 'current' ? 'step' : undefined}
                  data-stage-status={step.status}
                  className={cn(
                    'flex min-w-0 flex-col rounded-xl border px-2.5 py-2',
                    step.status === 'current' && 'border-(--companion) bg-(--companion-20)',
                    step.status === 'reached' && 'border-gold/30 bg-gold/6',
                    step.status === 'upcoming' && 'border-border bg-surface/50',
                  )}
                >
                  <span className="flex items-center gap-1 text-[0.6875rem] font-semibold tracking-[0.08em] text-muted uppercase">
                    {step.status === 'reached' && <Check aria-hidden className="size-3 text-gold" strokeWidth={3} />}
                    {step.label}
                    {step.status === 'reached' && <span className="sr-only"> (erreicht)</span>}
                    {step.status === 'current' && <span className="sr-only"> (aktuelle Stufe)</span>}
                  </span>
                  <span
                    className={cn(
                      'mt-0.5 text-[0.8125rem] leading-snug font-semibold hyphens-auto',
                      step.status === 'upcoming' ? 'text-parchment/75' : 'text-parchment',
                    )}
                  >
                    {step.name}
                  </span>
                  <span className="mt-0.5 text-[0.6875rem] text-muted">{stageThresholdText(step.fromDays)}</span>
                </li>
              ))}
            </ol>
          </CompanionDetail>

          <CompanionDetail title="Kämpft mit" icon={<Swords aria-hidden />}>
            <p className="text-sm text-parchment">{companionCombatText(choice.name)}</p>
          </CompanionDetail>
        </div>
      </div>

      <div className="flex flex-wrap gap-2 border-t border-border/70 bg-black/15 px-5 py-3 sm:px-6">
        <Button variant="secondary" size="sm" icon={<Pencil />} onClick={() => onAction('rename')}>
          Umbenennen
        </Button>
        <Button variant="secondary" size="sm" icon={<Repeat />} onClick={() => onAction('switch')}>
          Art wechseln
        </Button>
      </div>
    </Card>
  )
}

/** Großes Emoji im Ring der Stufe; schlafend gedimmt mit 💤, legendär (mit Effekten) sanft schimmernd. */
function CompanionMedallion({ companion, effects }: { companion: CompanionState; effects: boolean }) {
  const { definition, sleeping } = companion
  const stage = Math.max(0, Math.min(3, companion.stage))
  const glow = companionGlow(stage)
  const shimmer = effects && !sleeping && glow.shimmer
  return (
    <div aria-hidden="true" className="relative shrink-0">
      <span
        className={cn(
          'relative grid size-20 place-items-center rounded-full border-2 bg-radial from-surface-raised to-bg-deep leading-none sm:size-28',
          sleeping && 'grayscale-[0.35]',
        )}
        style={companionGlowStyle(stage, sleeping)}
      >
        {shimmer && (
          <motion.span
            className="pointer-events-none absolute -inset-1.5 rounded-full"
            style={{ boxShadow: `0 0 22px 3px ${glow.color}` }}
            animate={{ opacity: [0.2, 0.75, 0.2] }}
            transition={{ duration: 3.2, repeat: Infinity, ease: 'easeInOut' }}
          />
        )}
        <span
          className={cn(
            'relative drop-shadow-[0_4px_10px_rgb(0_0_0/0.55)]',
            EMOJI_SIZE[stage],
            sleeping && 'opacity-60',
          )}
        >
          {definition.icon}
        </span>
      </span>
      {sleeping && <span className="absolute -top-1 -right-1 text-2xl leading-none">💤</span>}
      {stage === 3 && !sleeping && <span className="absolute -bottom-1 -left-1 text-lg leading-none">✨</span>}
    </div>
  )
}

function CompanionDetail({ title, icon, children }: { title: string; icon: ReactNode; children: ReactNode }) {
  const titleId = useId()
  return (
    <section aria-labelledby={titleId} className="min-w-0">
      <h3
        id={titleId}
        className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold tracking-[0.14em] text-gold uppercase [&_svg]:size-3.5"
      >
        {icon}
        {title}
      </h3>
      {children}
    </section>
  )
}
