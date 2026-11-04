import { Check, Lock } from 'lucide-react'
import { useId, useState } from 'react'
import type { ReactNode } from 'react'
import { updateProfile } from '../../data/repository'
import { classNameFor } from '../../domain/combat/classes'
import { FRAMES, TITLES } from '../../domain/combat/cosmeticDefinitions'
import { activeFrame, activeTitle, titleNameFor } from '../../domain/combat/cosmetics'
import type { CharacterProfile, FrameDefinition, GameState, TitleDefinition } from '../../domain/types'
import { Badge, Card, ProgressBar, SectionTitle, cn, formatNumber, useToast } from '../../ui'
import { errorMessage } from '../settings/errorMessage'
import { AvatarMedallion } from './AvatarMedallion'
import { RARITY_COLORS, RARITY_LABELS, cosmeticOptions, unlockedCountText } from './collectionView'
import type { CosmeticOption, ProgressFacts } from './collectionView'

/** Wert der Auswahl „ohne“ (kein Titel bzw. kein Rahmen). */
const NONE = ''

export interface CosmeticsSectionProps {
  profile: CharacterProfile
  state: Pick<GameState, 'cosmetics' | 'heroClass' | 'level'>
  facts: ProgressFacts
  /** DOM-ID des Abschnitts (Sprungziel der Übersicht). */
  id: string
}

/**
 * Titel & Rahmen: Vorschau des Helden mit der aktuellen Wahl, darunter je eine Auswahl (Radiogruppe). Gewählt wird
 * sofort (`updateProfile`); gesperrte sind ausgegraut, mit Hinweis und – wo zählbar – Fortschritt. Titel stehen in
 * der Sprachform des Helden.
 */
export function CosmeticsSection({ profile, state, facts, id }: CosmeticsSectionProps) {
  const titleId = useId()
  const { toast } = useToast()
  const titles = cosmeticOptions(TITLES, state.cosmetics.titles, facts)
  const frames = cosmeticOptions(FRAMES, state.cosmetics.frames, facts)
  const liveTitle = activeTitle(profile, state.cosmetics)?.id ?? NONE
  const liveFrame = activeFrame(profile, state.cosmetics)?.id ?? NONE
  // Sofort umschalten, bis die Live-Daten die Wahl zeigen (sonst springt die Auswahl kurz zurück).
  const [pendingTitle, setPendingTitle] = useState<{ value: string; base: string } | undefined>(undefined)
  const [pendingFrame, setPendingFrame] = useState<{ value: string; base: string } | undefined>(undefined)
  const shownTitle = pendingTitle !== undefined && pendingTitle.base === liveTitle ? pendingTitle.value : liveTitle
  const shownFrame = pendingFrame !== undefined && pendingFrame.base === liveFrame ? pendingFrame.value : liveFrame

  const previewTitle = TITLES.find((title) => title.id === shownTitle)
  const previewFrame = FRAMES.find((frame) => frame.id === shownFrame)

  async function chooseTitle(value: string) {
    setPendingTitle({ value, base: liveTitle })
    try {
      await updateProfile({ titleId: value === NONE ? undefined : value })
    } catch (error) {
      setPendingTitle(undefined)
      toast({ tone: 'error', title: 'Titel nicht gespeichert', description: errorMessage(error) })
    }
  }

  async function chooseFrame(value: string) {
    setPendingFrame({ value, base: liveFrame })
    try {
      await updateProfile({ frameId: value === NONE ? undefined : value })
    } catch (error) {
      setPendingFrame(undefined)
      toast({ tone: 'error', title: 'Rahmen nicht gespeichert', description: errorMessage(error) })
    }
  }

  const unlockedTitles = titles.filter((option) => option.unlocked).length
  const unlockedFrames = frames.filter((option) => option.unlocked).length

  return (
    <section id={id} tabIndex={-1} aria-labelledby={titleId} className="scroll-mt-6 rounded-2xl">
      <SectionTitle id={titleId}>Titel & Rahmen</SectionTitle>
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_17rem] lg:items-start">
        {/* Vorschau zuerst: auf dem Handy klebt sie kompakt oben, während du durch die Auswahl scrollst. */}
        <HeroPreview
          profile={profile}
          state={state}
          title={previewTitle}
          frame={previewFrame}
          className="sticky top-2 z-10 lg:top-6 lg:col-start-2 lg:row-start-1"
        />
        <div className="flex min-w-0 flex-col gap-6 lg:col-start-1 lg:row-start-1">
          <CosmeticGroup legend="Titel" meta={unlockedCountText(unlockedTitles, titles.length)}>
            {/* Höchstens zwei Spalten: lange Titel in Cinzel („Bezwingerin der Finsternis“) brauchen Platz. */}
            <ul className="grid gap-2 sm:grid-cols-2">
              <li>
                <OptionCard
                  name="hero-title"
                  value={NONE}
                  checked={shownTitle === NONE}
                  unlocked
                  onSelect={chooseTitle}
                  label="Ohne Titel"
                  muted
                />
              </li>
              {titles.map((option) => (
                <li key={option.definition.id}>
                  <TitleOption option={option} profile={profile} checked={shownTitle === option.definition.id} onSelect={chooseTitle} />
                </li>
              ))}
            </ul>
          </CosmeticGroup>

          <CosmeticGroup legend="Rahmen" meta={unlockedCountText(unlockedFrames, frames.length)}>
            <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              <li>
                <OptionCard
                  name="hero-frame"
                  value={NONE}
                  checked={shownFrame === NONE}
                  unlocked
                  onSelect={chooseFrame}
                  label="Goldene Plakette"
                  description="Ohne Rahmen"
                  media={<AvatarMedallion avatar={profile.avatar} size="sm" />}
                />
              </li>
              {frames.map((option) => (
                <li key={option.definition.id}>
                  <FrameOption option={option} avatar={profile.avatar} checked={shownFrame === option.definition.id} onSelect={chooseFrame} />
                </li>
              ))}
            </ul>
          </CosmeticGroup>
        </div>
      </div>
    </section>
  )
}

/** So erscheint der Held mit der aktuellen Wahl – wie im Helden-Kopf der Tagesübersicht. */
function HeroPreview({
  profile,
  state,
  title,
  frame,
  className,
}: {
  profile: CharacterProfile
  state: Pick<GameState, 'heroClass' | 'level'>
  title?: TitleDefinition
  frame?: FrameDefinition
  className?: string
}) {
  const definition = state.heroClass.definition
  return (
    <Card
      tone="gold"
      ornate
      padding="none"
      as="div"
      // Deckende Grundfarbe unter dem Verlauf: Klebt die Vorschau oben, scheint die Liste nicht durch.
      className={cn('bg-surface px-4 py-3 shadow-[0_14px_30px_-12px_rgb(0_0_0/0.8)] lg:px-5 lg:py-5 lg:text-center', className)}
    >
      <p className="text-[0.6875rem] font-semibold tracking-[0.2em] text-gold uppercase lg:text-xs">So erscheinst du</p>
      <div aria-live="polite" className="mt-2 flex items-center gap-3.5 lg:mt-4 lg:flex-col lg:gap-0">
        <AvatarMedallion avatar={profile.avatar} size="sm" frame={frame} className="lg:hidden" />
        <AvatarMedallion avatar={profile.avatar} size="lg" frame={frame} className="max-lg:hidden" />
        <div className="min-w-0 flex-1 lg:mt-3 lg:flex lg:flex-col lg:items-center">
          <p className="truncate font-display text-base leading-tight font-bold tracking-wide text-parchment lg:max-w-full lg:text-xl lg:whitespace-normal lg:wrap-anywhere">
            {profile.name}
          </p>
          {title ? (
            <p className="truncate font-display text-[0.8125rem] tracking-wide text-gold/90 italic lg:mt-0.5 lg:text-[0.9375rem]">
              <span className="sr-only">Titel: </span>
              {titleNameFor(title, profile.form)}
            </p>
          ) : (
            <p className="text-[0.8125rem] text-faint lg:mt-0.5">Ohne Titel</p>
          )}
          <p className="truncate text-xs font-semibold text-gold-bright lg:mt-1.5 lg:text-sm">
            Lvl <span className="tabular-nums">{formatNumber(state.level.level)}</span> ·{' '}
            <span aria-hidden="true">{definition.icon} </span>
            {classNameFor(definition, profile.form)}
          </p>
          <p className="truncate text-[0.6875rem] text-muted lg:mt-1 lg:text-xs">
            {frame ? `Rahmen: ${frame.name}` : 'Goldene Plakette'}
          </p>
        </div>
      </div>
    </Card>
  )
}

function CosmeticGroup({ legend, meta, children }: { legend: string; meta: string; children: ReactNode }) {
  return (
    <fieldset className="min-w-0">
      <legend className="mb-2.5 text-xs font-semibold tracking-[0.14em] text-gold uppercase">
        {legend} <span className="font-sans tracking-normal text-muted tabular-nums">· {meta} freigeschaltet</span>
      </legend>
      {children}
    </fieldset>
  )
}

function TitleOption({
  option,
  profile,
  checked,
  onSelect,
}: {
  option: CosmeticOption<TitleDefinition>
  profile: CharacterProfile
  checked: boolean
  onSelect: (value: string) => void
}) {
  const { definition, unlocked, progress } = option
  return (
    <OptionCard
      name="hero-title"
      value={definition.id}
      checked={checked}
      unlocked={unlocked}
      onSelect={onSelect}
      label={titleNameFor(definition, profile.form)}
      labelClassName="font-display italic tracking-wide"
      rarity={definition.rarity}
      hint={unlocked ? undefined : definition.hint}
      progress={progress}
    />
  )
}

function FrameOption({
  option,
  avatar,
  checked,
  onSelect,
}: {
  option: CosmeticOption<FrameDefinition>
  avatar: string
  checked: boolean
  onSelect: (value: string) => void
}) {
  const { definition, unlocked, progress } = option
  return (
    <OptionCard
      name="hero-frame"
      value={definition.id}
      checked={checked}
      unlocked={unlocked}
      onSelect={onSelect}
      label={definition.name}
      rarity={definition.rarity}
      hint={unlocked ? undefined : definition.hint}
      progress={progress}
      media={
        <AvatarMedallion
          avatar={avatar}
          size="sm"
          frame={definition}
          // In der langen Auswahl steht der Lichtbogen still (die Vorschau oben zeigt ihn bewegt).
          animate={false}
          className={cn(!unlocked && 'opacity-45 grayscale-[0.7]')}
        />
      }
    />
  )
}

interface OptionCardProps {
  name: string
  value: string
  checked: boolean
  unlocked: boolean
  onSelect: (value: string) => void
  label: string
  labelClassName?: string
  description?: string
  rarity?: TitleDefinition['rarity']
  hint?: string
  progress?: CosmeticOption<TitleDefinition>['progress']
  media?: ReactNode
  /** „Ohne“-Option: zurückhaltender beschriftet. */
  muted?: boolean
}

/**
 * Eine Wahl als Karte um ein (unsichtbares) Optionsfeld: Pfeiltasten wechseln wie in jeder Radiogruppe, gesperrte
 * sind deaktiviert. Seltenheit, Hinweis und Fortschritt hängen per `aria-describedby` am Feld.
 */
function OptionCard({
  name,
  value,
  checked,
  unlocked,
  onSelect,
  label,
  labelClassName,
  description,
  rarity,
  hint,
  progress,
  media,
  muted = false,
}: OptionCardProps) {
  const labelId = useId()
  const detailId = useId()
  const color = rarity ? RARITY_COLORS[rarity] : undefined
  return (
    <label
      data-locked={!unlocked || undefined}
      data-checked={checked || undefined}
      className={cn(
        'relative flex h-full min-w-0 items-start gap-3 rounded-xl border p-3 pr-10 transition-colors duration-150',
        'has-[input:focus-visible]:outline-2 has-[input:focus-visible]:outline-offset-2 has-[input:focus-visible]:outline-gold-bright',
        checked
          ? 'border-gold/70 bg-gold/10 shadow-[inset_0_0_14px_rgb(212_165_72/0.12)]'
          : unlocked
            ? 'cursor-pointer border-border bg-surface/60 hover:border-gold-dim hover:bg-surface-raised/60'
            : 'cursor-not-allowed border-border/70 bg-surface/30',
      )}
    >
      <input
        type="radio"
        name={name}
        value={value}
        checked={checked}
        disabled={!unlocked}
        onChange={() => onSelect(value)}
        aria-labelledby={labelId}
        aria-describedby={detailId}
        className="sr-only"
      />
      {media && <span className="shrink-0">{media}</span>}
      <span className="min-w-0 flex-1">
        {/* Name und Seltenheit in einer Zeile – reicht der Platz nicht, rutscht die Seltenheit darunter. */}
        <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <span
            id={labelId}
            className={cn(
              'min-w-0 text-[0.9375rem] leading-snug',
              unlocked ? (muted ? 'text-muted' : 'text-parchment') : 'text-parchment/60',
              labelClassName,
            )}
          >
            {label}
          </span>
          {rarity !== undefined && color !== undefined && (
            <Badge color={color} className={cn('shrink-0', !unlocked && 'opacity-70')}>
              <span className="sr-only">Seltenheit: </span>
              {RARITY_LABELS[rarity]}
            </Badge>
          )}
          <span
            aria-hidden="true"
            className={cn(
              'absolute top-3.5 right-3 grid size-5 place-items-center rounded-full border',
              checked
                ? 'border-gold bg-gold text-on-gold'
                : unlocked
                  ? 'border-border-strong'
                  : 'border-border bg-bg-deep/60 text-faint',
            )}
          >
            {checked ? <Check className="size-3.5" strokeWidth={3} /> : !unlocked && <Lock className="size-3" />}
          </span>
        </span>
        <span id={detailId} className="flex flex-col gap-1.5 empty:hidden">
          {description !== undefined && <span className="text-xs text-muted">{description}</span>}
          {!unlocked && <span className="sr-only">Gesperrt.</span>}
          {hint !== undefined && <span className="mt-0.5 text-xs leading-snug text-muted">{hint}</span>}
          {progress !== undefined && (
            <ProgressBar
              value={progress.target > 0 ? progress.current / progress.target : 0}
              size="xs"
              color={color}
              animated={false}
              aria-label={`Fortschritt: ${label}`}
              valueLabel={<span className="text-[0.6875rem]">{progress.text}</span>}
              valueText={progress.text.replace(' / ', ' von ')}
            />
          )}
        </span>
      </span>
    </label>
  )
}
