import { Check, Flame, Hourglass, Lock, RotateCcw, Sprout, Swords, Trophy } from 'lucide-react'
import { motion } from 'motion/react'
import { useEffect, useId, useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { useGameContext } from '../../app/gameContext'
import type { BlueprintContent, BlueprintLevel, BlueprintOptions, CampaignBlueprint } from '../../data/blueprints'
import { BLUEPRINT_LEVEL_LABELS, BLUEPRINT_LEVELS } from '../../data/blueprints'
import type { AdventureChoice } from '../../data/seed'
import { activeCampaigns } from '../../domain/campaigns'
import type { Habit } from '../../domain/types'
import { AttributeChip, Badge, Button, Dialog, SectionTitle, SegmentedControl } from '../../ui'
import type { SegmentedOption } from '../../ui'
import { attributeAccentVars } from '../campaignTheme'
import { blueprintAccentAttribute } from './blueprintAccent'
import { BlueprintPreview } from './BlueprintPreview'
import { durationLabel } from './blueprintText'
import { ClassPicker } from './ClassPicker'
import { compareLevels, otherLevel } from './levelCompare'
import type { LevelComparison } from './levelCompare'
import { adventureChoice, blueprintOptions, findSharedHabit, hasPaths } from './libraryStatus'

export type BlueprintLibraryMode = 'start' | 'select'

export interface BlueprintSetupDialogProps {
  open: boolean
  onClose: () => void
  blueprint: CampaignBlueprint
  /** start: „Kampagne beginnen“ (der Aufrufer installiert); select: „Auswählen“ (z. B. Onboarding). */
  mode: BlueprintLibraryMode
  /** Vorbelegung beim Öffnen (z. B. die bisherige Auswahl). Ohne: Einsteiger, keine Klasse gewählt. */
  initialOptions?: BlueprintOptions
  /**
   * Bestätigen. Darf ein Promise liefern: Der Button zeigt dann einen Ladezustand, der Dialog schließt sich
   * erst nach Erfolg. Bei einem Fehler bleibt er offen – den Fehler zeigt der Aufrufer (z. B. per Toast).
   */
  onConfirm: (choice: AdventureChoice) => Promise<void> | void
  /** Bestätigen gesperrt (z. B. alle Kampagnen-Plätze belegt): Grund wird angezeigt, der Button ist aus. */
  blockedReason?: string
  /** Aus der Vorlage wurde schon eine Kampagne gemeistert. */
  mastered?: boolean
  /** Von außen beschäftigt (z. B. das Onboarding speichert): Bestätigen zeigt den Ladezustand. */
  busy?: boolean
}

const LEVEL_ICONS: Record<BlueprintLevel, ReactNode> = {
  beginner: <Sprout aria-hidden="true" />,
  advanced: <Flame aria-hidden="true" />,
}

const LEVEL_OPTIONS: SegmentedOption<BlueprintLevel>[] = BLUEPRINT_LEVELS.map((level) => ({
  value: level,
  label: BLUEPRINT_LEVEL_LABELS[level],
  icon: LEVEL_ICONS[level],
}))

/**
 * Einrichtung einer Vorlage vor dem Start: bei Vorlagen mit Pfaden die **Klassenwahl** (Pflicht, nichts
 * vorausgewählt), die Stufe (Einsteiger/Fortgeschritten mit Hinweis) und eine Live-Vorschau der Quests und
 * Kapitel aus `blueprint.build()` – inklusive Hinweis auf Quests, die mit vorhandenen geteilt werden.
 *
 * Der Stufen-Hinweis ist der der gewählten Klasse (`BlueprintPath.levelHints`), davor der allgemeine der Vorlage.
 * Akzentfarbe (Icon-Rahmen im Kopf, Vorschau): das Haupt-Attribut der Vorlage – nach der Klassenwahl das der
 * gewählten Klasse, so wie die Kampagne anfangs gefärbt ist.
 */
export function BlueprintSetupDialog({
  open,
  onClose,
  blueprint,
  mode,
  initialOptions,
  onConfirm,
  blockedReason,
  mastered = false,
  busy = false,
}: BlueprintSetupDialogProps) {
  const { data, today, state } = useGameContext()
  const id = useId()
  const classHeadingId = `${id}-class`
  const levelHeadingId = `${id}-level`
  const previewHeadingId = `${id}-preview`
  const blockedId = `${id}-blocked`
  const firstClassRef = useRef<HTMLInputElement>(null)
  const classSectionRef = useRef<HTMLElement>(null)
  const confirmRef = useRef<HTMLButtonElement>(null)

  const withPaths = hasPaths(blueprint)
  const initialLevel = initialOptions?.level ?? 'beginner'
  const initialPath = withPaths ? blueprint.paths?.find((path) => path.id === initialOptions?.pathId)?.id : undefined

  const [level, setLevel] = useState<BlueprintLevel>(initialLevel)
  const [pathId, setPathId] = useState<string | undefined>(initialPath)
  const [pathError, setPathError] = useState(false)
  const [pending, setPending] = useState(false)

  // Bei jedem Öffnen (bzw. Wechsel der Vorlage) neu beginnen – mit der Vorbelegung.
  const session = `${open ? 'open' : 'closed'}:${blueprint.id}`
  const [prevSession, setPrevSession] = useState(session)
  if (session !== prevSession) {
    setPrevSession(session)
    if (open) {
      setLevel(initialLevel)
      setPathId(initialPath)
      setPathError(false)
    }
  }

  // Im Ladezustand ist der Bestätigen-Button deaktiviert – Browser schieben den Fokus dann auf <body>.
  // Schlägt die Aktion fehl, bekommt er den Fokus zurück, sobald er wieder bedienbar ist.
  const refocusConfirm = useRef(false)
  useEffect(() => {
    if (pending || !refocusConfirm.current) return
    refocusConfirm.current = false
    const button = confirmRef.current
    const active = document.activeElement
    if (button?.isConnected && (active === null || active === document.body)) button.focus({ preventScroll: true })
  }, [pending])

  const options = blueprintOptions(blueprint, level, pathId)
  const ready = !withPaths || pathId !== undefined
  const chosenPath = withPaths ? blueprint.paths?.find((path) => path.id === pathId) : undefined
  const levelHint = chosenPath?.levelHints?.[level] ?? blueprint.levelHints[level]
  const accentAttribute = blueprintAccentAttribute(blueprint, chosenPath?.id)
  const accent = attributeAccentVars(accentAttribute)
  const content = useMemo<BlueprintContent | null>(() => {
    if (withPaths && pathId === undefined) return null
    try {
      return blueprint.build(pathId === undefined ? { level } : { level, pathId })
    } catch (error) {
      console.error('Questlog: Vorschau der Vorlage fehlgeschlagen', error)
      return null
    }
  }, [blueprint, level, pathId, withPaths])

  // Was die andere Stufe anders macht (gleicher Pfad) – markiert in der Vorschau.
  const comparison = useMemo<LevelComparison | undefined>(() => {
    if (content === null) return undefined
    const other = otherLevel(level)
    try {
      return compareLevels(content, blueprint.build(pathId === undefined ? { level: other } : { level: other, pathId }), level)
    } catch {
      return undefined
    }
  }, [blueprint, content, level, pathId])

  // Geteilte Quests: vorhandene, heute nicht archivierte Quests mit gleichem Titel werden mitbenutzt.
  const active = useMemo(() => activeCampaigns(data, today), [data, today])
  const activeIds = useMemo(() => new Set(active.map((campaign) => campaign.quest.id)), [active])
  const sharedHabits = useMemo(() => {
    const result = new Map<string, Habit>()
    if (content === null) return result
    for (const quest of content.quests) {
      const match = findSharedHabit(data.habits, quest.title, today, activeIds)
      if (match !== undefined) result.set(quest.title, match)
    }
    return result
  }, [content, data.habits, today, activeIds])
  // … und zu welcher aktiven Kampagne sie gehören (sonst werden sie übernommen).
  const sharedOwners = useMemo(() => {
    const titles = new Map(active.map((campaign) => [campaign.quest.id, campaign.quest.title]))
    const result = new Map<string, string>()
    for (const habit of sharedHabits.values()) {
      const owner = habit.mainQuestId === undefined ? undefined : titles.get(habit.mainQuestId)
      if (owner !== undefined) result.set(habit.id, owner)
    }
    return result
  }, [active, sharedHabits])

  // Beendete (archivierte, nicht gemeisterte) Kampagne aus dieser Vorlage: Sie lässt sich samt Fortschritt
  // zurückholen – statt von vorn zu beginnen.
  const ended =
    mode === 'start'
      ? state.archivedMainQuests.find((campaign) => campaign.quest.blueprint?.id === blueprint.id && !campaign.complete)
      : undefined

  const loading = pending || busy
  const blocked = blockedReason !== undefined

  function handleClose() {
    if (loading) return
    onClose()
  }

  function selectPath(next: string) {
    setPathId(next)
    setPathError(false)
  }

  async function handleConfirm() {
    if (loading || blocked) return
    if (!ready) {
      setPathError(true)
      // Fokus aufs erste Radio, sichtbar wird die ganze Klassenwahl samt Hinweis (steht über den Karten).
      firstClassRef.current?.focus({ preventScroll: true })
      const reduceMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false
      classSectionRef.current?.scrollIntoView?.({ block: 'start', behavior: reduceMotion ? 'auto' : 'smooth' })
      return
    }
    setPending(true)
    try {
      await onConfirm(adventureChoice(blueprint, options))
      onClose()
    } catch (error) {
      // Den Fehler zeigt der Aufrufer (Toast) – der Dialog bleibt offen, damit nichts verloren geht.
      refocusConfirm.current = true
      console.error('Questlog: Kampagne konnte nicht übernommen werden', error)
    } finally {
      setPending(false)
    }
  }

  const confirmLabel = mode === 'start' ? 'Kampagne beginnen' : 'Auswählen'

  return (
    <Dialog
      open={open}
      onClose={handleClose}
      closeOnOverlayClick={!loading}
      size="lg"
      icon={
        // Deckt den goldenen Icon-Rahmen des Dialogs mit einem Rahmen in der Akzentfarbe ab (gleiche Größe, deckend).
        <span
          data-dialog-accent={accentAttribute}
          style={accent}
          className="grid size-10 place-items-center rounded-xl bg-[color-mix(in_srgb,var(--accent)_13%,var(--color-surface))] text-2xl leading-none shadow-[0_6px_18px_-10px_var(--accent)] ring-1 ring-(--accent-35) transition-[background-color,box-shadow] duration-300 ring-inset"
        >
          {blueprint.icon}
        </span>
      }
      title={blueprint.title}
      description={blueprint.tagline}
      footer={
        <>
          <Button variant="secondary" onClick={handleClose} disabled={loading}>
            Abbrechen
          </Button>
          <Button
            ref={confirmRef}
            onClick={handleConfirm}
            loading={loading}
            disabled={blocked}
            aria-describedby={blocked ? blockedId : undefined}
            icon={mode === 'start' ? <Swords /> : <Check />}
          >
            {confirmLabel}
          </Button>
        </>
      }
    >
      <div data-accent={accentAttribute} style={accent} className="flex flex-col gap-6">
        <div>
          <p className="text-[0.9375rem] leading-relaxed text-parchment/90">{blueprint.description}</p>
          <div className="mt-3 flex flex-wrap items-center gap-1.5">
            <AttributeChip attribute={blueprint.primaryAttribute} />
            {blueprint.secondaryAttributes.map((attribute) => (
              <AttributeChip key={attribute} attribute={attribute} />
            ))}
            <Badge icon={<Hourglass />}>
              <span className="sr-only">Laufzeit: </span>
              {durationLabel(blueprint.durationDays)}
            </Badge>
          </div>
          {mastered && (
            <p className="mt-3 flex items-start gap-2 text-sm text-gold-bright">
              <Trophy aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
              <span>Du hast diese Kampagne schon gemeistert – Zeit für eine neue Runde?</span>
            </p>
          )}
          {ended !== undefined && (
            <p className="mt-3 flex items-start gap-2 text-sm text-parchment/90">
              <RotateCcw aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-gold" />
              <span>
                Du hast „{ended.quest.title}“ beendet. Unter „Beendete &amp; gemeisterte Kampagnen“ kannst du sie mit
                deinem Fortschritt zurückholen – oder hier von vorn beginnen.
              </span>
            </p>
          )}
          {blocked && (
            <p
              id={blockedId}
              className="mt-4 flex items-start gap-2.5 rounded-xl border border-warning/40 bg-warning/10 px-3.5 py-3 text-sm text-warning"
            >
              <Lock aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
              <span>{blockedReason}</span>
            </p>
          )}
        </div>

        {withPaths && blueprint.paths !== undefined && (
          <section ref={classSectionRef} aria-labelledby={classHeadingId} className="scroll-mt-2">
            <SectionTitle as="h3" id={classHeadingId} meta="Pflicht">
              Wähle deine Klasse
            </SectionTitle>
            <ClassPicker
              paths={blueprint.paths}
              value={pathId}
              onChange={selectPath}
              error={pathError}
              firstInputRef={firstClassRef}
              labelledBy={classHeadingId}
              disabled={loading}
            />
          </section>
        )}

        <section aria-labelledby={levelHeadingId}>
          <SectionTitle as="h3" id={levelHeadingId}>
            Wähle deine Stufe
          </SectionTitle>
          <SegmentedControl
            aria-label="Stufe"
            value={level}
            onChange={setLevel}
            options={LEVEL_OPTIONS.map((option) => ({ ...option, disabled: loading }))}
            hint={levelHint}
          />
        </section>

        <section aria-labelledby={previewHeadingId}>
          <SectionTitle as="h3" id={previewHeadingId}>
            Vorschau
          </SectionTitle>
          {content === null ? (
            <p className="rounded-2xl border border-dashed border-border-strong/80 bg-surface/40 px-4 py-6 text-center text-sm text-muted">
              {withPaths && pathId === undefined
                ? 'Wähle deine Klasse – dann siehst du hier deine Quests und Kapitel.'
                : 'Die Vorschau ist gerade nicht verfügbar.'}
            </p>
          ) : (
            // Neu eingeblendet bei jedem Wechsel von Stufe oder Klasse – die neuen Werte fallen so ins Auge.
            <motion.div
              key={`${level}:${pathId ?? ''}`}
              initial={{ opacity: 0.35, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.2, ease: 'easeOut' }}
            >
              <BlueprintPreview
                content={content}
                durationDays={blueprint.durationDays}
                today={today}
                sharedHabits={sharedHabits}
                sharedOwners={sharedOwners}
                comparison={comparison}
                accent={accentAttribute}
              />
            </motion.div>
          )}
        </section>
      </div>
    </Dialog>
  )
}
